-- シークレットモード(予定の秘匿 + パスコードロック、Part B)。
--
-- `events` に `is_secret`(この予定を秘匿対象にするか)を追加する。
-- `20260918000000_event_reminders.sql` と同じ ALTER TABLE 手順(既存行は既定値で埋まる)。
-- RLS は既存の `events_update_own`(user_id=auth.uid() のみ)がそのまま使えるため変更しない。
--
-- `profiles` に `secret_passcode_hash`(SHA-256 hex、64文字)を追加する。未設定は null。
-- 平文パスコードはどの列にも保持しない(クライアント側でハッシュ化してから送る、Design Notes参照)。

alter table public.events
  add column is_secret boolean not null default false;

alter table public.profiles
  add column secret_passcode_hash text;

alter table public.profiles
  add constraint profiles_secret_passcode_hash_check
  check (secret_passcode_hash is null or char_length(secret_passcode_hash) = 64);
