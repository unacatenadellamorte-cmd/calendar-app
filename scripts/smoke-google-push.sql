-- 本番でも検証データを残さず、外部Google APIを呼ばずにDB境界を確認する。
begin;
do $$
declare u uuid:=gen_random_uuid(); c uuid; cal uuid; ev uuid; j jsonb;
begin
 insert into auth.users(id,is_anonymous) values(u,false);
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.entitlements(user_id,entitlement,expires_at) values(u,'multi_account',now()+interval '1 day');
 if public.get_google_connection_limit(u)<>5 or not public.can_google_write(u) then raise exception '有料権利の検証失敗'; end if;
 c:=public.upsert_google_connection(u,'検証専用・外部呼出不可','smoke@example.test',true);
 insert into public.calendars(user_id,name,color) values(u,'破棄する検証カレンダー','#112233') returning id into cal;
 perform public.set_google_push_target(u,cal,c,'検証専用');
 insert into public.events(user_id,calendar_id,title,all_day,event_date)
 values(u,cal,'破棄する検証予定',true,'2026-10-03') returning id into ev;
 if exists(select 1 from public.claim_google_push(u)) then raise exception '取り消し猶予の検証失敗'; end if;
 update public.event_google_links set next_attempt_at=now()-interval '1 second' where user_id=u;
 select value into j from public.claim_google_push(u) as q(value);
 if j is null then raise exception '反映待ちの取得失敗'; end if;
 update public.events set is_secret=true where id=ev;
 perform public.finish_google_push((j->>'id')::uuid,(j->>'lease_id')::uuid,(j->>'revision')::bigint,'synced',true);
 if (select state from public.event_google_links where user_id=u)<>'pending' then raise exception '送信中の秘密化が失われた'; end if;
 update public.entitlements set expires_at=now()-interval '1 day' where user_id=u;
 update public.event_google_links set next_attempt_at=now()-interval '1 second' where user_id=u;
 select value into j from public.claim_google_push(u) as q(value);
 if j is null or not (j->>'secret_cleanup')::boolean or not (j->>'remove')::boolean then raise exception '失効後の秘密コピー削除が取れない'; end if;
 if has_table_privilege('authenticated','public.event_google_links','UPDATE')
   or has_function_privilege('authenticated','public.get_google_connection_token(uuid,uuid)','EXECUTE')
 then raise exception 'クライアント権限が広すぎる'; end if;
end $$;
select '実DB検証成功: 5件・書込権利・猶予・秘密化競合・失効後の削除・クライアント権限' as result;
rollback;
