-- 移転が購入通知を追い越した場合は成功応答にせず、Webhook再送を要求する。
do $$ declare d text; changed text; begin
  d:=pg_get_functiondef('public.apply_revenuecat_transfer(uuid,uuid,bigint)'::regprocedure);
  changed:=replace(d,'-- 移転先へコピー。',
    'if not exists(select 1 from public.entitlements where user_id=p_from) then raise exception ''transfer source not ready'' using errcode=''40001''; end if;'||chr(10)||'  -- 移転先へコピー。');
  changed:=replace(changed,'where s.user_id = p_from',
    'where s.user_id = p_from and (s.last_event_ms is null or s.last_event_ms <= p_event_ms)');
  if changed=d then raise exception 'transfer function shape changed'; end if;
  execute changed;
end $$;
