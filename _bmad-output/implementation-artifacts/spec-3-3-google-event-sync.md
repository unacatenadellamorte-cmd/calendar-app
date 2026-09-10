---
title: 'Story 3.3: 定期取り込みと手動取り込み(sync-calendars Edge Function)'
type: 'feature'
created: '2026-09-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '984786a5d9126687db1cb918200e59a562f397e2'
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - '_bmad-output/implementation-artifacts/spec-3-2-google-calendar-selection.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 3.2 で `source='google'` のカレンダー行はできるが、その予定を `events` に入れる経路が無く、月/週/リスト・ホームに何も出ない。取り込んだカレンダーの中身が常に空。

**Approach:** Edge Function `sync-calendars` が、選択済みの各 Google カレンダーについて refresh_token → access_token → Google Calendar API(`events.list`、`singleEvents=true`、読み取りのみ)で予定を取得し、安定 ID `(connection_id, external_id)` で `events` に upsert、時間窓内で Google から消えた予定は論理削除する。取り込み単位「接続 × カレンダー」ごとに最終取り込み時刻・失敗を `sync_state` に記録。関数はユーザーの「今すぐ取り込み」(JWT)と pg_cron の定期起動(service_role)の両方から同じ経路で動く。取り込んだ予定は閲覧のみ(読み取り専用の詳細シート)。純ロジック(Google イベント JSON の正規化・削除差分)は `packages/core`。

## Boundaries & Constraints

**Always:**
- Google API 呼び出し・refresh_token 復号は `sync-calendars` Edge Function のみ(AD-2 / AD-3)。`client_secret` / `refresh_token` / `access_token` をクライアント・キャッシュ・ログ・エラー本文・レスポンスに出さない。
- `events` の外部予定行の作成・更新・論理削除はサーバー側(service_role RPC)。クライアントからの直接 INSERT/UPDATE はしない。
- 取り込み単位は「接続 × カレンダー」。1カレンダーの取得失敗は他カレンダー・他接続の取り込みと表示を止めない(AD-4)。失敗は `sync_state.last_error` に記録し、最後に取り込めた予定は消さずに出し続ける(UX-DR11)。
- upsert の安定キーは `(connection_id, external_id)`。時間窓内で今回の応答に無い `external_id` は論理削除。時刻は `timestamptz`(UTC)保存、表示は既存 datetime レイヤで TZ 変換(AD-7)。繰り返しは展開済みインスタンス(`singleEvents=true`、PRD §9-5)。
- data-access は `src/data/google-sync.ts` に閉じ `Result<T, AppError>` を返す。純ロジックは `packages/core`(Vitest)。関数本体・マイグレーションはローカルに Deno/実 DB が無く目視レビュー(3.1 / 3.2 と同じ)。
- ログは構造化(カレンダー名・件数・所要時間まで)。予定本文・メール・トークンを書かない。

**Never:**
- 外部へ書き込む関数・経路をコードに置く(AD-2)。取り込んだ予定に編集・削除の UI や API を付ける。
- 取り込み失敗の**カレンダー行**への表示・再試行・接続解除 = Story 3.4(本ストーリーは接続欄とカレンダー選択画面の情報表示まで)。
- `sync_token` 増分同期(列は用意するが v1 は常に null、毎回「時間窓の全件」)。複数 Google アカウント。終日予定の複数日展開(Google の `start.date` 1日分だけ `event_date` に入れる)。

**決定(2026-09-10、Open Question 解決):**
- **pg_cron の自動取り込みを本ストーリーに含める(選択肢 A)。** migration が `pg_cron` + `pg_net` を有効化し、`cron.schedule('sync-google-calendars', '*/30 * * * *', ...)` で `sync-calendars` を service_role で 30分ごとに起動する。cron ジョブは Vault の `project_url` / `service_role_key` を読む。この2値の登録は Ryo が Supabase の SQL エディタで1回行う(Claude が手順を提示。関数デプロイ・`db push` は Claude)。
- 取り込み時間窓は `今 - 60日` 〜 `今 + 400日`(繰り返しを1年以上カバー、過去は直近のみ。個人利用前提の決定・変更容易)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| 手動取り込み | 接続済み・選択2件・`{scheduled:false}` + JWT | 各カレンダーを時間窓で取得 → upsert。`{synced:[{calendar,upserted,deleted}], errors:[]}` | refresh_token 失効 → その接続の全対象を `sync_state` にエラー記録、`{error:'reauth-needed'}` 400 |
| 定期取り込み | pg_cron が service_role で `{scheduled:true}` | 全有効接続 × 選択カレンダーを同経路で。応答は件数のみ | 1カレンダー失敗は記録して継続 |
| 二重起動防止 | 同じ Google 予定が取り込み済み | `(connection_id, external_id)` upsert で1行のまま、重複行を作らない | N/A |
| Google 側で予定削除 | 前回あった `external_id` が今回の応答(同カレンダー・同窓)に無い | `events` 行を `deleted_at` セット、ビューから消える | N/A |
| cancelled イベント | `status:'cancelled'` | 正規化で null → 取り込まない(既存行は削除差分で論理削除) | N/A |
| 終日予定 | `start.date='2026-09-15'` | `all_day=true, event_date='2026-09-15'`、時刻 null | N/A |
| 時刻付き予定 | `start.dateTime='2026-09-15T10:00:00+09:00'` | `all_day=false`、`starts_at`/`ends_at` を UTC ISO 保存 | `start`/`end` 両方無し → 正規化 null(スキップ) |
| 1カレンダーだけ API エラー | Aで 5xx、Bは成功 | Bは取り込む。Aは `sync_state.last_error` 記録、Aの既存予定は残す | `errors:[{calendar:'A',...}]` を含めて 200 |
| 取り込んだ予定をタップ | `source='google'` の予定 | 読み取り専用の詳細シート(タイトル・日時・カレンダー・メモ)。編集/削除ボタン無し。「Google から取り込んだ予定です」の一文 | N/A |
| オフラインで「今すぐ取り込み」 | `navigator.onLine === false` or fetch 失敗 | `err('data/offline')`、UI「オフラインです」 | N/A |
| 未接続 | `connections` に行なし | ボタンを出さない(接続欄が未接続表示) | 関数到達時は `{error:'not-connected'}` 409 |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260913000000_google_event_sync.sql` — **新規**。`events` に `external_id text` / `connection_id uuid references connections(id) on delete cascade` + 部分ユニーク `events_external_uniq (connection_id, external_id) where connection_id is not null` + `events_connection_idx`。`sync_state` テーブル(`user_id` / `connection_id` / `calendar_id` fk calendars cascade / `external_calendar_id` / `last_synced_at` / `last_error` / `last_error_at` / timestamps、ユニーク `(connection_id, external_calendar_id)`、RLS SELECT own のみ、`set_updated_at` トリガ、`sync_token text` は未使用で用意)。RPC 3つ(20260912 と同じ `security definer` / `revoke ... from public,anon,authenticated` / `grant to service_role` / `set search_path`): `get_google_sync_targets(p_user_id uuid)`(null=全ユーザー)/ `apply_calendar_sync(...)` / `record_calendar_sync_error(...)`。`get_google_refresh_token` は再利用。末尾に pg_cron 配線(`create extension if not exists pg_cron; ... pg_net;` + `cron.schedule('sync-google-calendars','*/30 * * * *', ...)`)。RPC・cron の詳細は Design Notes。
- `supabase/functions/_shared/google.ts` — `fetchGoogleEvents(accessToken, calendarId, timeMinIso, timeMaxIso)` を追加(`events.list` を `singleEvents=true&showDeleted=false&maxResults=2500&timeMin&timeMax` でページング、`!res.ok` は throw)。既存関数は不変。
- `supabase/functions/sync-calendars/index.ts` — **新規**(Deno)。`oauth-exchange` / `google-calendars` と同じ骨格。本文 `{scheduled?:boolean}`。role 判定で targets 取得 → 接続ごとに token → カレンダーごとに fetch + 正規化(**関数内複製**、core と同規則)+ `apply_calendar_sync`。接続/カレンダー単位でエラー隔離。詳細は Design Notes。
- `packages/core/src/google-events.ts` (+ `index.ts` re-export) — **新規**。`GoogleEventRaw`(部分型)/ `NormalizedGoogleEvent` / `normalizeGoogleEvent(raw): NormalizedGoogleEvent | null` / `deletedExternalIds(storedIds, fetchedIds): string[]`。何も import しない。規則は Design Notes。
- `packages/core/src/google-events.test.ts` — **新規**。正規化の各分岐・削除差分。
- `src/data/google-sync.ts` (+ `.test.ts`) — **新規**。`syncGoogleCalendarsNow()`(`invokeFn('sync-calendars', {scheduled:false}, slugToKey, 'sync/failed')`)/ `listSyncState()`(`sync_state` SELECT own → `{calendarId, externalCalendarId, lastSyncedAt, lastError}`、オフラインは `data/offline`)。`slugToKey`: `reauth-needed`→`connection/reauth-needed`、`not-connected`→`connection/not-connected`、他→`sync/failed`。
- `src/data/messages.ts` — `sync/failed`(「取り込みに失敗しました。時間をおいてもう一度お試しください」)。
- `src/data/google-calendars.ts` — `listConnectionCalendars` に `sync_state` をマージ、`GoogleCalendarChoice` に `lastSyncedAt: string|null` / `lastError: string|null` 追加。
- `src/features/connections/model/useGoogleSync.ts` — **新規**。`{ syncing, lastRun, errorKey, runSync }`。成功で `onDone?()`(呼び出し側が sync_state / events 再取得)。
- `src/features/connections/model/useGoogleCalendars.ts` — `GoogleCalendarChoice` 拡張に追随(カタログに sync 情報を持つ)。
- `src/features/connections/ui/ConnectionsSection.tsx` — 接続中ブロックに「今すぐ取り込み」ボタン + 全体の最終取り込み時刻(`listSyncState` の最大 `lastSyncedAt`、無ければ「まだ取り込んでいません」)+ 結果の一行。
- `src/features/connections/ui/GoogleCalendarPicker.tsx` — 選択済み行に「最終取り込み: M/D H:MM」/ 失敗時の control 文言(再試行は 3.4)。
- `src/features/events/ui/EventDetailSheet.tsx` (+ `.test.tsx`) — **新規**。`BottomSheet` ベースの読み取り専用詳細。編集/削除ボタン無し。
- `src/features/calendar/ui/CalendarScreen.tsx` — `openEdit`: `source==='google'` を無視せず `EventDetailSheet` を開く(`local` は従来どおり `EventFormSheet`)。`detailEvent` state + シート描画を追加。
- `src/data/events.ts` / `eslint.config.js` — 変更不要の想定(`listEvents` は既に google 行を拾う、`supabase/functions` は ignores 済み)。確認のみ。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260913000000_google_event_sync.sql` -- `events` 拡張 + `sync_state` + RPC 3つ + pg_cron/pg_net 有効化 + 30分間隔の `cron.schedule`
- [x] `packages/core/src/google-events.ts` (+ `index.ts`) -- `normalizeGoogleEvent` / `deletedExternalIds`
- [x] `packages/core/src/google-events.test.ts` -- I/O マトリクスの正規化行・削除差分を単体テスト(13 tests)
- [x] `supabase/functions/_shared/google.ts` -- `fetchGoogleEvents`(ページング)
- [x] `supabase/functions/sync-calendars/index.ts` -- scheduled / user 両経路、接続・カレンダー単位のエラー隔離
- [x] `src/data/google-sync.ts` + `.test.ts` -- data-access(全 Result、slug 写像、オフライン。7 tests)
- [x] `src/data/google-calendars.ts` + `src/data/messages.ts` -- sync_state マージ、`sync/failed`
- [x] `src/features/connections/model/useGoogleSync.ts` -- 取り込み実行フック
- [x] `src/features/connections/ui/ConnectionsSection.tsx` -- 「今すぐ取り込み」+ 最終取り込み時刻
- [x] `src/features/connections/ui/GoogleCalendarPicker.tsx` (+ `model/useGoogleCalendars.ts`) -- 行ごとの最終取り込み時刻/失敗(`useGoogleCalendars` は spread 継承で追加変更なし)
- [x] `src/features/events/ui/EventDetailSheet.tsx` + `.test.tsx` -- 読み取り専用の予定詳細(5 tests)
- [x] `src/features/calendar/ui/CalendarScreen.tsx` -- google 予定タップで詳細シート(+ CalendarScreen.test.tsx に結合テスト)
- [x] `src/features/connections/**/*.test.tsx` -- 取り込みボタン(成功/失敗/オフライン)、最終取り込み時刻(ConnectionsSection.test.tsx +5)

**Acceptance Criteria:**
- Given 選択済みの Google カレンダー、when「今すぐ取り込み」を押す、then その予定が月/週/リスト・ホームにカレンダーの色で出て、優先度順の並びにも乗る。
- Given 取り込み済みの予定、when もう一度取り込む、then 件数は変わらず重複行ができない。
- Given Google 側で予定を消す、when 次の取り込みが走る、then その予定がビューから消える(論理削除)。
- Given 取り込んだ予定、when タップする、then 読み取り専用の詳細が出て編集・削除ボタンが無い。時刻は端末の TZ で表示される。
- Given 2件選択中で片方の取得が失敗、when 取り込む、then もう片方は取り込まれ、失敗した方は最後に取り込めた予定を出し続ける。
- Given 接続中、when 設定の接続欄を見る、then 全体の最終取り込み時刻が出る。カレンダー選択画面では各カレンダーの最終取り込み時刻が出る。

## Implementation Notes

- **正規化に `note` を追加**: I/O マトリクスの詳細シート行が「メモ」を含むため、`normalizeGoogleEvent` の出力に `note`(= Google の `description` を trim + 2000 字クランプ、空は null)を足した。`events.note` の CHECK(≤2000)を満たす。`title` も 200 字クランプ + 空はプレースホルダ「(タイトルなし)」で `events` の CHECK を満たす。
- **`ends_at` の下限保証**: Google の `end.dateTime` 欠落 / 不正 / `end < start` のとき `ends_at = starts_at` に丸める(`events_time_shape` の `starts_at <= ends_at`)。core と Edge Function 内複製の両方。
- **同一バッチ内の重複 external_id を排除**: `sync-calendars` が `apply_calendar_sync` に渡す前に `Map` で重複排除(`ON CONFLICT DO UPDATE` の「同じ行を2回更新できない」エラー回避)。`singleEvents=true` では通常起きないが保険。
- **定期経路の判定**: `{scheduled:true}` かつ JWT の `role` クレーム = `service_role` のときだけ全ユーザー。それ以外は `auth.getUser()` 必須(anon キー等でも scheduled を悪用できない)。
- **削除差分の窓判定**: `apply_calendar_sync` は `coalesce(starts_at, event_date::timestamptz) between p_window_min and p_window_max` で「窓内・今回応答に無い」行だけ論理削除。窓外の古い予定は触らない。
- **client 側の events 再取得**: 「今すぐ取り込み」は設定画面から。`useGoogleSync.onDone` は `ConnectionsSection` の sync_state を取り直すのみ。月/週/リスト・ホームの予定は画面遷移時の `useEvents` 再マウントで反映される(クロス画面のライブ更新は deferred)。
- **未テスト(実 DB / Deno 依存 = 目視レビュー + 実機。3.1 / 3.2 と同じ)**: migration の RPC 3つ・pg_cron 配線、`sync-calendars` 関数本体、`_shared/google.ts` の `fetchGoogleEvents`。純ロジック(`normalizeGoogleEvent` / `deletedExternalIds`)は core で 13 tests。関数内複製は core と同一規則(コメントで相互参照)。
- **レビュー Pass 1 の patch**: (F2) pg_cron 配線を `20260913000100_google_sync_cron.sql` へ分離 / (F1) `GoogleCalendarPicker.test.tsx` に行ごと時刻・失敗表示テスト / (F3) `ConnectionsSection` の最終取り込み時刻を `Date.parse` 比較へ / (F4) `jwtRole` の base64url パディング補完。F5 は deferred-work、F6〜F8 reject。
- **Verification**: typecheck / lint / build green。Vitest **415 tests**(+33:google-events 13・google-sync 7・EventDetailSheet 5・ConnectionsSection +5・GoogleCalendarPicker +1・google-calendars +1・CalendarScreen +1)。

## Spec Change Log

## Review Triage Log

**Pass 1(2026-09-10、3レンズ inline — サブエージェント不使用の方針のため main セッションで実施):**

| # | レンズ | 指摘 | verdict | 対応 |
|---|---|---|---|---|
| F1 | verification-gap / blind | `GoogleCalendarPicker` の行ごと「最終取り込み: …」/ 失敗表示に自動テストが無い(AC「カレンダー選択画面では各カレンダーの最終取り込み時刻が出る」が未検証) | medium | **patch**: `GoogleCalendarPicker.test.tsx` に選択済み行の時刻/失敗表示テストを追加。`choice` fixture に `lastSyncedAt`/`lastError` 追加 |
| F2 | blind | pg_cron 配線を `20260913000000` と同一ファイルに置くと、`create extension pg_cron` が権限失敗した場合に `events` 列 + `sync_state` まで巻き添えロールバックする | medium | **patch**: pg_cron 配線を `20260913000100_google_sync_cron.sql` に分離。スキーマは独立して適用される |
| F3 | blind | `ConnectionsSection` の最終取り込み時刻が ISO 文字列の辞書順ソートで最大値を取る(PostgREST の精度差でまれに誤る) | low | **patch(即修正)**: `Date.parse` の数値比較で最大を取る |
| F4 | edge | `sync-calendars` の `jwtRole` が base64url のパディング未補完で `atob` する(Deno の寛容性次第で cron の service_role 判定が落ち、user 経路 → 401 になりうる) | maybe-false | **patch(保険)**: `=` パディングを補完してから `atob` |
| F5 | edge | 時間窓より前に開始し窓に重なる予定(複数日タイムド等)が Google 側で削除されても、削除差分は「窓内開始」しか見ないため孤児行が残り続ける | low | **defer**: 個人カレンダーで稀。deferred-work へ(削除差分を「窓に重なる」判定に広げる、または `ends_at` も見る) |
| F6 | verification-gap | migration の RPC 3つ・`sync-calendars` 関数本体・`_shared/google.ts` の `fetchGoogleEvents` に自動テストが無い。冪等 upsert / 削除差分 / エラー隔離という AC が未テストの SQL・Deno に集中 | — | reject(3.1 F9 / 3.2 F9 と同根。ローカルに Deno / 実 DB 無し。純ロジックは `packages/core` で 13 tests、関数内複製は同一規則をコメントで相互参照。frozen Boundaries で明記済み。実機 Manual checks で担保) |
| F7 | blind | `sync_state` に `deleted_at` が無く、カレンダー deselect→reselect で古い `last_synced_at` が次回同期まで残る | low | reject(表示上の軽微なズレ。次回取り込みで自己修復) |
| F8 | blind | Google の `description`(HTML 混じり)を `EventDetailSheet` がプレーンテキストとして表示 | low | reject(React エスケープで XSS なし。HTML 整形は spec 対象外) |

**loopback なし**(intent_gap / bad_spec 該当なし。F1〜F4 は patch、F5 は defer、F6〜F8 は reject)。

## Design Notes

**RPC(migration):**
- `get_google_sync_targets(p_user_id uuid)` → `p_user_id` null なら全ユーザー、非 null ならそのユーザー。「有効接続(`deleted_at is null`)× `connection_calendars.selected=true` かつ `calendar_id` の `calendars` が生存」の対象を `(user_id, connection_id, calendar_id, external_calendar_id, calendar_name)` で返す。
- `apply_calendar_sync(p_user_id, p_connection_id, p_calendar_id, p_external_calendar_id, p_events jsonb, p_window_min timestamptz, p_window_max timestamptz) returns jsonb` — `p_events` 各要素 `{external_id, title, all_day, starts_at, ends_at, event_date}` を `(connection_id, external_id)` で upsert(`source='google'`, `user_id`, `calendar_id`, `deleted_at=null`)。この `connection_id`+`calendar_id` の生存行のうち、`coalesce(starts_at, event_date::timestamptz) between p_window_min and p_window_max` かつ `external_id` が `p_events` に無いものを `deleted_at=now()`。`sync_state` を `on conflict (connection_id, external_calendar_id)` で upsert し `last_synced_at=now(), last_error=null, last_error_at=null`。`{upserted, deleted}` を返す。
- `record_calendar_sync_error(p_user_id, p_connection_id, p_calendar_id, p_external_calendar_id, p_error text)` — `sync_state` を upsert し `last_error`, `last_error_at=now()`(`last_synced_at` 据え置き)。

**`normalizeGoogleEvent` の規則**(core と Edge Function 内複製で同一・変更時は両方):
```
raw.status === 'cancelled' | raw.id が空          -> null
title = raw.summary?.trim() || '(タイトルなし)'
raw.start.date (YYYY-MM-DD)                        -> { allDay:true, eventDate:start.date, startsAt:null, endsAt:null }
raw.start.dateTime                                 -> { allDay:false,
                                                       startsAt: new Date(start.dateTime).toISOString(),
                                                       endsAt:   new Date(end.dateTime ?? start.dateTime).toISOString() }
どちらも無い                                        -> null
externalId = raw.id
```
- 時間窓は関数側で決める: `timeMin = 今 - 60日`, `timeMax = 今 + 400日`(繰り返しを1年以上カバー、過去は直近のみで十分)。関数がこの窓を `apply_calendar_sync` に渡し、削除差分もこの窓で判定。
- 定期経路の role 判定: service_role の JWT は `role` クレームが `service_role`。「`scheduled:true` かつ role=service_role」で全ユーザー、それ以外は `auth.getUser()` 必須。
- `EventDetailSheet` は `EventFormSheet` に分岐を足すのではなく別コンポーネント(外部予定に書き込み経路を作らないことを構造で担保、AD-8)。
- **pg_cron 配線**: `create extension if not exists pg_cron; create extension if not exists pg_net;` の後、`cron.schedule('sync-google-calendars','*/30 * * * *', $$ select net.http_post(url := (select decrypted_secret from vault.decrypted_secrets where name='project_url') || '/functions/v1/sync-calendars', headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='service_role_key')), body := jsonb_build_object('scheduled', true)) $$)`。Vault の `project_url`(= `https://gcjcrztzjzhbcjpigdvj.supabase.co`)と `service_role_key` は Ryo が SQL エディタで `select vault.create_secret('<値>', '<name>')` を2回。migration は「Vault に値が無くても schedule 自体は作れる」前提で書く(値未登録なら cron 実行時に静かに失敗 → 登録後は次回から動く)。`create extension pg_cron` が権限で失敗する環境なら Dashboard → Database → Extensions で有効化してから再 `db push`。

## Verification

**Commands:**
- `npm run -s typecheck` -- expected: 成功
- `npx vitest run` -- expected: 全 pass(+ `google-events` / `google-sync` / `EventDetailSheet` / connections の新規)
- `npm run -s lint` -- expected: 0
- `npm run -s build` -- expected: 成功

**Manual checks(関数デプロイ + `db push` 後):**
- 設定 → 接続中 →「今すぐ取り込み」→「取り込みました」→ 月ビューにゴミ収集日の予定が紫で出る。
- もう一度「今すぐ取り込み」→ 予定が重複しない。
- カレンダー選択画面で「最終取り込み: …」が各行に出る。
- 取り込んだ予定をタップ → 読み取り専用シート、編集・削除ボタンなし。
- Ryo が Vault に `project_url` / `service_role_key` を登録 → `select cron.schedule(...)` が `cron.job` に載っているのを確認、`select net.http_post(...)`(cron 本文と同じ SQL)を手動実行して 200 が返る → 30分待たずに自動経路を確認。
