---
title: 'Story 3.2: 取り込むカレンダーの選択と一覧表示'
type: 'feature'
created: '2026-09-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a9effe9'
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - '_bmad-output/implementation-artifacts/spec-3-1-google-connect-oauth.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 3.1 で Google を接続できるようになったが、どのカレンダーを取り込むか選ぶ経路がない。接続だけでは何も表示されない。

**Approach:** Edge Function `google-calendars` が refresh_token から Google の calendarList を取得し、`connection_calendars`(取り込み候補のカタログ)に upsert する。ユーザーが候補をオン/オフすると、同じ関数がサーバー側で `calendars` 行(`source='google'`)を作成/論理削除し、`connection_calendars.selected` を更新する。`calendars` 行は既存の採番トリガで最下位優先度が付き、Epic 2 の並べ替え・Epic 1 の一覧表示にそのまま乗る。取り込んだ**予定**の同期は 3.3。

## Boundaries & Constraints

**Always:**
- Google API 呼び出し・refresh_token 復号は Edge Function のみ(AD-3)。client_secret / refresh_token / access_token をクライアントに出さない。
- `connection_calendars` と外部 `calendars` 行の作成・更新はサーバー側(service_role RPC)で行う。クライアントからの直接 INSERT/UPDATE はしない。
- data-access は `src/data/google-calendars.ts` に閉じ、`Result<T, AppError>` を返す。snake↔camel もここだけ。
- 外部 `calendars` 行: `source='google'`、`external_connection_id` / `external_calendar_id` を埋める。`priority` は指定しない(トリガが最下位採番)。`name` = Google の summary、`color` = Google の backgroundColor を `#RRGGBB` 正規化(不正なら既定色)。
- オフライン: `listConnectionCalendars`(直近のカタログを DB から読むだけ)はキャッシュ的に使える。`refreshGoogleCalendars` / 選択変更はオンライン必須 → オフラインは `data/offline`。

**Never:**
- 取り込んだ**予定**の同期(`sync-calendars` / `events` の外部 ID 列 / `sync_state` / pg_cron)= 3.3。
- 取り込み失敗表示・接続解除 = 3.4。
- 複数 Google アカウント。1接続前提。
- Google カレンダーの色を DESIGN プリセットに丸めること(外部カレンダーは Google の色をそのまま尊重。ただし `#RRGGBB` 形式に正規化し、取れなければ既定色)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|---|---|---|---|
| カタログ取得 | 接続済み・`action:'refresh'` | Google calendarList を取得 → `connection_calendars` に upsert(既存の `selected` は保持)→ 候補一覧を返す | refresh_token 失効 → `connection/reauth-needed` |
| Google 側から消えたカレンダー | 前回あった external_id が今回の応答に無い | その `connection_calendars` 行を `deleted_at` セット。`selected` だったら対応 `calendars` 行も論理削除 | N/A |
| 候補をオン | `action:'set'` `{externalCalendarId, selected:true}` | `calendars` 行を作成(無ければ)/復活(論理削除済みなら)。`connection_calendars.selected=true` `calendar_id` セット | 既に選択済み → 冪等(何もしない) |
| 候補をオフ | `{selected:false}` | 対応 `calendars` 行を論理削除。`selected=false`。(予定の削除は 3.3 の同期任せ、ここでは行わない) | 未選択 → 冪等 |
| オフラインで refresh / 選択変更 | `navigator.onLine === false` or fetch 失敗 | `err('data/offline')` | 表示は「オフラインです」 |
| 未接続で picker を開く | `connections` に行なし | 「先に Google を接続してください」+ 設定へ戻る導線。関数は呼ばない | N/A |
| 候補0件(全部共有カレンダー無し) | calendarList が primary だけ | primary 1件を候補として出す(オンにできる) | N/A |
| backgroundColor が無い/不正 | item に color 情報なし | 既定色(`#7A7A7A` 等)で `calendars` 行を作る | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260912000000_connection_calendars.sql` — **新規**。`connection_calendars` テーブル + RLS(SELECT own)+ `get_google_refresh_token(uuid)` RPC + `set_google_calendar_selection(...)` RPC + `upsert_connection_calendars(...)` RPC。すべて service_role 限定。
- `supabase/functions/_shared/google.ts` — **新規**。`refreshAccessToken(refreshToken)`(`oauth2.googleapis.com/token` grant_type=refresh_token)、`fetchCalendarList(accessToken)`。3.3 でも使う。
- `supabase/functions/google-calendars/index.ts` — **新規**(Deno)。`action: 'refresh' | 'set'`。JWT→user、`get_google_refresh_token` RPC で refresh_token 取得 → Google → RPC で upsert/選択。
- `src/data/google-calendars.ts` — **新規**。`GoogleCalendarChoice` 型、`refreshGoogleCalendars()`、`listConnectionCalendars()`(直接 SELECT)、`setGoogleCalendarSelected(externalCalendarId, selected)`。全 `Result`。
- `src/data/google-calendars.test.ts` — **新規**。
- `src/data/calendar-colors.ts` — `normalizeHexColor(input): string`(`#RGB`/`#RRGGBB`/`rgb()` 未対応は既定色)を追加 or 既存の色ユーティリティを再利用。
- `src/data/messages.ts` — `connection/reauth-needed` 他を追加。
- `src/features/connections/ui/GoogleCalendarPicker.tsx` — **新規**。`/connections/google/calendars` の画面。候補一覧 + トグル。マウント時 `refreshGoogleCalendars`(先に `listConnectionCalendars` で即描画)。
- `src/features/connections/model/useGoogleCalendars.ts` — **新規**。候補の取得・トグル(楽観更新 + ロールバック)。
- `src/features/connections/ui/ConnectionsSection.tsx` — 接続中のとき「取り込むカレンダーを選ぶ ›」リンクを追加(現在の「次のステップで…」文言を置換)。
- `src/app/routes.tsx` — `/connections/google/calendars` ルート追加。
- `src/features/calendars/model/useCalendars.ts` — 変更不要(既存 `listCalendars` が `source='google'` 行も拾う)。確認のみ。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260912000000_connection_calendars.sql` -- テーブル + RLS + 3つの RPC(service_role 限定)
- [x] `supabase/functions/_shared/google.ts` -- `refreshAccessToken` / `fetchCalendarList`
- [x] `supabase/functions/google-calendars/index.ts` -- `refresh` / `set` アクション
- [x] `src/data/calendar-colors.ts` -- `normalizeHexColor`(+ 単体テスト)
- [x] `src/data/google-calendars.ts` + `.test.ts` -- data-access(全 Result、オフライン分岐)
- [x] `src/data/messages.ts` -- `connection/reauth-needed` / `connection/calendars-failed`
- [x] `src/features/connections/model/useGoogleCalendars.ts` -- 候補取得 + トグル(楽観 + ロールバック)
- [x] `src/features/connections/ui/GoogleCalendarPicker.tsx` + `src/app/routes.tsx` -- 画面 + ルート
- [x] `src/features/connections/ui/ConnectionsSection.tsx` -- 「取り込むカレンダーを選ぶ」導線
- [x] `src/features/connections/**/*.test.tsx` -- 未接続ガード、トグル、オフライン表示
- [x] I/O マトリクスの純ロジック(色正規化・candidate 差分)を単体テスト

**Acceptance Criteria:**
- Given Google 接続済み、when picker を開く、then そのアカウントのカレンダー一覧(名前・色)が出て、個別にオン/オフできる。
- Given 候補をオンにする、when カレンダー管理を見る、then `source='google'` の行として出て、既定で最下位優先度が付き、▲▼ で並べ替えできる。
- Given 候補をオフにする、then そのカレンダー行が一覧から消える(論理削除)。
- Given オフライン、when picker を開く、then 直近のカタログは表示され、更新・トグルは「オフラインです」になる。
- Given refresh_token が失効、when refresh、then 「Google を接続し直してください」を出す。

## Implementation Notes

- **RPC 実装(最終形):** `set_google_calendar_selection` は summary/color 引数を廃し、`connection_calendars` 行から読む(Edge Function が refresh 時に正規化済み `#RRGGBB` or null を格納)。引数は `(p_user_id, p_connection_id, p_external_calendar_id, p_selected)`。
- **Edge Function 共通化:** `supabase/functions/_shared/google.ts`(`refreshAccessToken(refreshToken, clientId, clientSecret)` / `fetchCalendarList(accessToken)` — ページング対応、`minAccessRole=reader` で共有カレンダーも含む / `normalizeHexColor`)。3.3 でも使う。
- **クライアント共通化:** `src/data/edge.ts` `invokeFn<T>(name, payload, slugToKey, fallbackKey)` を新設。`connections.ts` の `completeGoogleConnect` もこれに寄せた(旧 `extractFunctionErrorKey` / `KNOWN_CONNECTION_KEYS` 削除)。`FunctionsFetchError`→`data/offline`、`FunctionsHttpError.context` 本文の slug → messageKey。
- **色:** `src/data/calendar-colors.ts` に `normalizeHexColor`(失敗時 `EXTERNAL_DEFAULT_COLOR='#7A7A7A'` を返す)+ `EXTERNAL_DEFAULT_COLOR`。Edge Function 側の複製は失敗時 null(カタログに null 格納 → SQL で `coalesce(..., '#7A7A7A')`)。
- **UI:** `useGoogleCalendars(enabled)`(カタログ即描画 → Google 取り直し、トグルは楽観 + `pending` Set で同一カレンダー二重送信防止 + 失敗ロールバック)。`GoogleCalendarPicker`(`/connections/google/calendars`、未接続は設定へ誘導、チェックボックス一覧、右上「更新」)。`ConnectionsSection` の「次のステップで…」文言を「取り込むカレンダーを選ぶ ›」ボタンに置換。
- **テスト:** `calendar-colors.test.ts` 5、`google-calendars.test.ts` 7、`GoogleCalendarPicker.test.tsx` 5。全体 382(+17)。
- **未検証(ユーザー実機待ち):** `google-calendars` デプロイ後の Google 往復、3つの RPC の実 DB 実行、`connection_calendars` の upsert/差分削除。

## Spec Change Log

## Review Triage Log

**Pass 1(2026-09-10、3レンズ inline):**

| # | レンズ | 指摘 | verdict | 対応 |
|---|---|---|---|---|
| F3 | blind | `set_google_calendar_selection` の再選択(論理削除→復活)UPDATE が `deleted_at=null` のみで priority を戻さない。並べ替えでスロットを奪われていると `calendars_priority_uniq` 違反(3.1 の priority バグと同種) | high | **patch**: 復活 UPDATE で `priority = max(active priority)+1` に採番し直す |
| F10 | blind | `google-calendars` 関数が `action` を 'refresh'/'set' 以外でも 'refresh' 扱い | low | **patch**: 未知 action は 400 |
| F1 | edge | `upsert_connection_calendars` の「消えたカレンダー」削除 UPDATE が過去分も拾うが、`c.deleted_at is null` フィルタで冪等 | — | reject(意図どおり冪等) |
| F5 | design | `fetchCalendarList` の `minAccessRole=reader` は購読カレンダー(祝日等)も含む | — | reject(共有カレンダー取り込みに必要。ユーザーが選ぶ) |
| F9 | verification-gap | migration / `_shared/google.ts` / `google-calendars` に自動テスト無し。関数内 `normalizeHexColor` 複製の一致保証も無し | — | reject(3.1 と同じ。TS 版 `normalizeHexColor` はテスト済み、実 DB/Deno はローカル不可で目視 + 実機確認) |
| F11 | edge | 別々のカレンダーを同時トグル → `calendars_set_priority` トリガの `max+1` が非アトミック → `calendars_priority_uniq` 違反 | low | **defer**: Story 2.1 由来の既存問題(ローカルカレンダーの同時作成でも起きる)。3.1 F7 と同根。トリガにアドバイザリロック or `on conflict` リトライを1回入れて全カレンダー作成経路をまとめて直す。deferred-work へ |

## Design Notes

**RPC の分担(すべて `security definer` / `revoke from public,anon,authenticated` / `grant to service_role` / `set search_path = public, vault, extensions, pg_temp`):**
- `get_google_refresh_token(p_user_id uuid) returns text` — `connections`(deleted_at is null)→ `vault.decrypted_secrets` を join して復号済み refresh_token を返す。
- `upsert_connection_calendars(p_user_id uuid, p_connection_id uuid, p_items jsonb) returns void` — `p_items` の各要素 `{externalCalendarId, summary, backgroundColor}` を upsert(`selected` は触らない)。`p_items` に無い既存行は `deleted_at` セット + selected なら `calendars` も論理削除。
- `set_google_calendar_selection(p_user_id uuid, p_connection_id uuid, p_external_calendar_id text, p_selected boolean, p_summary text, p_color text) returns uuid` — select 時: `calendars` 行を upsert(`calendars_external_uniq` を利用、論理削除済みなら `deleted_at=null` に戻す)し `connection_calendars.selected=true, calendar_id=<id>`。deselect 時: `calendars` 行 `deleted_at=now()`、`selected=false`。戻りは `calendar_id`。

**関数の形:** `oauth-exchange` と同じ骨格(preflight → `handle` を try/catch → JWT → RPC/fetch)。`_shared/cors.ts` の `corsHeadersFor` / `handlePreflight` / `jsonResponse` を再利用。refresh 応答が `invalid_grant` なら `{error:'reauth-needed'}` 400。

**色の正規化:** `normalizeHexColor('#4285F4') → '#4285F4'`、`'#abc' → '#AABBCC'`、それ以外・null → `EXTERNAL_DEFAULT_COLOR`。`calendars.color` の CHECK(`^#[0-9A-Fa-f]{6}$`)を必ず満たす。

## Verification

**Commands:**
- `npm run -s typecheck` / `npx vitest run` / `npm run -s lint` / `npm run -s build` -- すべて成功

**Manual checks (関数デプロイ後にユーザー):**
- 設定 → 接続中 →「取り込むカレンダーを選ぶ」→ 一覧表示 → 1つオン → カレンダー管理に `source='google'` 行が出る → 月ビューにその予定枠(予定は 3.3 まで空)。
