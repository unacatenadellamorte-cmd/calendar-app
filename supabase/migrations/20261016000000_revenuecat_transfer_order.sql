-- 移転(TRANSFER)が購入通知を追い越した場合の後着購入を、元利用者へ復活させず最終移転先へ付与する。
--
-- 機能:
--   - revenuecat_transfers: 適用した移転(移転元・移転先・event_timestamp_ms)の永続記録。
--   - apply_revenuecat_entitlement: 通知時刻以降に移転済みなら、移転を時刻順に辿った最終移転先へ付与する。
--   - apply_revenuecat_transfer: 移転を記録する(期限切れ行だけの移転元でも記録し、後着購入を振り替える)。
--   - どちらの RPC も同じ advisory lock で直列化し、移転と購入の同時実行で行き先が食い違わないようにする。

-- ── revenuecat_transfers ─────────────────────────────────────────────────────────

create table if not exists public.revenuecat_transfers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid references auth.users(id) on delete set null,
  event_ms bigint not null,
  created_at timestamptz not null default now(),
  unique (from_user, event_ms, to_user)
);

comment on table public.revenuecat_transfers is
  'RevenueCat TRANSFER の適用記録。移転より古い購入通知を最終移転先へ振り替えるために使う。service_role専用。';

alter table public.revenuecat_transfers enable row level security;
revoke all on table public.revenuecat_transfers from public, anon, authenticated;
grant select, insert on table public.revenuecat_transfers to service_role;

-- 購入と移転の双方で同じ時刻境界を使う。呼出元RPCの排他内だけで利用する内部関数。
create function public.revenuecat_transfer_target(p_user_id uuid, p_event_ms bigint)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_target uuid := p_user_id;
  v_since bigint := p_event_ms;
  v_next record;
  v_hops int := 0;
  v_seen uuid[] := '{}';
begin
  loop
    select t.id, t.to_user, t.event_ms into v_next
      from public.revenuecat_transfers t
     where t.from_user = v_target
       and t.event_ms >= v_since
     order by t.event_ms, t.to_user
     limit 1;
    exit when not found;
    if v_hops >= 32 then
      raise exception 'transfer route too long' using errcode = '40001';
    end if;
    if (select count(*) from public.revenuecat_transfers
         where from_user = v_target and event_ms = v_next.event_ms) > 1 then
      raise exception 'transfer route ambiguous' using errcode = '40001';
    end if;
    if v_next.id = any(v_seen) then
      raise exception 'transfer route cycle' using errcode = '40001';
    end if;
    v_seen := array_append(v_seen, v_next.id);
    v_target := v_next.to_user;
    v_since := v_next.event_ms;
    v_hops := v_hops + 1;
  end loop;

  return v_target;
end;
$$;

revoke all on function public.revenuecat_transfer_target(uuid,bigint)
  from public, anon, authenticated, service_role;

-- 通知時刻以降の移転を辿り、移転先の新しい状態は上書きしない。
create or replace function public.apply_revenuecat_entitlement(
  p_user_id uuid, p_entitlement text, p_expires_at timestamptz,
  p_product_id text, p_store text, p_event_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_target uuid;
  v_rows int;
begin
  if p_entitlement not in ('calendar_write', 'multi_account') then return false; end if;
  perform pg_advisory_xact_lock(hashtext('public.revenuecat_entitlements'));
  if not exists (select 1 from auth.users where id = p_user_id) then return false; end if;
  v_target := public.revenuecat_transfer_target(p_user_id, p_event_ms);
  if not exists (select 1 from auth.users where id = v_target) then return false; end if;

  insert into public.entitlements as e
    (user_id, entitlement, expires_at, product_id, store, last_event_ms, updated_at)
  values
    (v_target, p_entitlement, p_expires_at, p_product_id, p_store, p_event_ms, now())
  on conflict (user_id, entitlement) do update
    set expires_at = excluded.expires_at,
        product_id = excluded.product_id,
        store = excluded.store,
        last_event_ms = excluded.last_event_ms,
        updated_at = now()
    where e.last_event_ms is null or e.last_event_ms <= excluded.last_event_ms;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  perform public.reconcile_google_connections(v_target);
  return true;
end;
$$;

revoke execute on function public.apply_revenuecat_entitlement(uuid, text, timestamptz, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.apply_revenuecat_entitlement(uuid, text, timestamptz, text, text, bigint)
  to service_role;

-- ── apply_revenuecat_transfer ───────────────────────────────────────────────────

-- 20261015020000_transfer_retry 適用後の挙動(移転元に行が無ければ再送要求、移転より新しい行は
-- 移さない)を保ち、移転を記録する。返り値は従来どおり権利を変更したときだけ true。
create or replace function public.apply_revenuecat_transfer(
  p_from uuid,
  p_to uuid,
  p_event_ms bigint
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_target uuid;
  v_copied int;
  v_revoked int;
begin
  if p_from = p_to then
    return false;
  end if;
  if not exists (select 1 from auth.users where id = p_from)
     or not exists (select 1 from auth.users where id = p_to) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('public.revenuecat_entitlements'));

  if not exists (select 1 from public.entitlements where user_id = p_from) then
    raise exception 'transfer source not ready' using errcode = '40001';
  end if;

  insert into public.revenuecat_transfers (from_user, to_user, event_ms)
  values (p_from, p_to, p_event_ms)
  on conflict do nothing;

  v_target := public.revenuecat_transfer_target(p_from, p_event_ms);
  if v_target = p_from then return false; end if;

  -- 移転先へコピー。既存行は「より長い期限」かつ「古いイベントでない」ときだけ更新。
  insert into public.entitlements as e
    (user_id, entitlement, expires_at, product_id, store, last_event_ms, updated_at)
  -- 購入状態の時刻を保ち、後着する移転前の更新を移転時刻で遮断しない。
  select v_target, s.entitlement, s.expires_at, s.product_id, s.store, coalesce(s.last_event_ms,p_event_ms), now()
    from public.entitlements s
   where s.user_id = p_from and (s.last_event_ms is null or s.last_event_ms <= p_event_ms)
     and v_target is not null
     and (s.expires_at is null or s.expires_at > now())
  on conflict (user_id, entitlement) do update
    set expires_at = excluded.expires_at,
        product_id = excluded.product_id,
        store = excluded.store,
        last_event_ms = excluded.last_event_ms,
        updated_at = now()
    where (e.last_event_ms is null or e.last_event_ms <= excluded.last_event_ms)
      and e.expires_at is not null
      and (excluded.expires_at is null or excluded.expires_at > e.expires_at);
  get diagnostics v_copied = row_count;

  -- 元の購入時刻は保持する。古い通知の復活は移転履歴で防ぎ、正式な再移転を妨げない。
  update public.entitlements
     set expires_at = now(),
         updated_at = now()
   where user_id = p_from
     and (expires_at is null or expires_at > now())
     and (last_event_ms is null or last_event_ms <= p_event_ms);
  get diagnostics v_revoked = row_count;

  if v_copied = 0 and v_revoked = 0 then
    return false;
  end if;

  perform public.reconcile_google_connections(p_from);
  if v_target is not null then perform public.reconcile_google_connections(v_target); end if;
  return true;
end;
$$;

revoke execute on function public.apply_revenuecat_transfer(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.apply_revenuecat_transfer(uuid, uuid, bigint)
  to service_role;
