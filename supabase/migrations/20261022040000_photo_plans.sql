-- 写真の購入権利を追加。旧権利・通知順序・移転の排他と所有者保護は維持する。
alter table public.entitlements drop constraint entitlements_entitlement_check;
alter table public.entitlements add constraint entitlements_entitlement_check
  check (entitlement in ('calendar_write', 'multi_account', 'device_photos'));

-- Google1アカウントの予定反映を標準化。匿名・不明利用者には許可しない。
create or replace function public.can_google_write(p_user_id uuid)
returns boolean language sql security definer set search_path = public, pg_temp as $$
  select exists(select 1 from auth.users where id = p_user_id and is_anonymous = false);
$$;
revoke all on function public.can_google_write(uuid) from public, anon, authenticated;
grant execute on function public.can_google_write(uuid) to service_role;

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
  if p_entitlement not in ('calendar_write', 'multi_account', 'device_photos') then return false; end if;
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

