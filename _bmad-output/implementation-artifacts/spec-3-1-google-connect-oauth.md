---
title: 'Story 3.1: Google 接続(OAuth)と資格情報の安全な保管'
type: 'feature'
created: '2026-09-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1a155b2'
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - 'docs/google-connection-setup.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 3 で Google カレンダーを取り込むには、まず Google アカウントを OAuth で接続し、その `refresh_token` を安全に(サーバー側だけに)保管する必要がある。今はその経路が一切ない。

**Approach:** クライアントは認可コードフローで Google 同意画面へ飛ばし、戻ってきた `code` を `oauth-exchange` Edge Function に渡すだけにする。関数だけが `client_secret` でトークン交換し、`refresh_token` を Supabase Vault へ、`connections` 行を service_role で作る。トークンはクライアントに返さない。純ロジック(URL 構築・応答パース)は `packages/core`。UI は設定画面に「Google を接続 / 接続中: <email>」を出す。取り込むカレンダーの選択・同期は 3.2 / 3.3。

## Boundaries & Constraints

**Always:**
- トークン交換・Google API 呼び出しは `oauth-exchange` Edge Function のみ(AD-3)。`client_secret` と `refresh_token` はクライアント・キャッシュ・ログ・エラー本文・`connections` の返却値に出さない。
- 要求スコープは `calendar.calendarlist.readonly` + `calendar.events.readonly` の2つだけ。`access_type=offline` + `prompt=consent`。
- data-access は `src/data/connections.ts` に閉じ、`Result<T, AppError>` を返す。snake↔camel 変換もここだけ。
- `state`(CSRF)を乱数生成して `sessionStorage` に保持し、コールバックで照合してから関数を呼ぶ。
- 認証状態が `authenticated` でない(guest / unavailable / loading)ときは Google へ飛ばさず、`/auth` へ誘導する。
- 文言は EXPERIENCE.md Voice(英語・コード・トークン・感嘆符を出さない)。ボタン 44px・フォーカスリング維持。

**Never:**
- 取り込むカレンダーの一覧・選択 UI、`connection_calendars`、`sync-calendars`、`sync_state`、`events` の外部 ID 列、pg_cron、接続解除、失敗表示 — すべて 3.2〜3.4。ここでは作らない。
- Google を「アプリのログイン手段」にしない(Supabase Auth の Google プロバイダは使わない)。
- 複数 Google アカウントの同時接続([ASSUMPTION] v2)。既存接続があれば貼り替える。
- クライアントから `connections` へ INSERT / UPDATE(RLS で禁止。関数が service_role で行う)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 認可 URL 構築 | clientId / redirectUri / state / 2スコープ | `https://accounts.google.com/o/oauth2/v2/auth?...` に `response_type=code` `access_type=offline` `prompt=consent` `include_granted_scopes=true` と両スコープ(スペース区切り)と `state` が入る | N/A |
| トークン応答パース(正常) | `{access_token, refresh_token, expires_in, token_type}` | `{ refreshToken, accessToken }` を取り出す | N/A |
| トークン応答パース(refresh_token 欠落) | `{access_token}` のみ(再認可で consent 省略時) | `err`('connection/no-refresh-token') | 「接続をやり直してください」 |
| トークン応答パース(Google エラー) | `{error:'invalid_grant', ...}` | `err`('connection/exchange-failed') | 「Google との接続に失敗しました」 |
| primary メール抽出 | calendarList `items` に `primary:true` の行 | その行の `id`(= メールアドレス) | 無ければ null(表示は「Google カレンダー」) |
| コールバック: state 不一致 | `?state=` が sessionStorage と違う | 関数を呼ばず `err`('connection/state-mismatch') | 「接続を確認できませんでした。もう一度お試しください」 |
| コールバック: ユーザー拒否 | `?error=access_denied` | `err`('connection/cancelled')。設定へ戻る | 「接続をキャンセルしました」(静かめ) |
| 関数: JWT なし / 不正 | `Authorization` ヘッダ欠落 | HTTP 401、`connections` に何も書かない | クライアントは 'connection/exchange-failed' |
| 関数: 交換成功 | 有効な code + JWT | Vault に refresh_token、`connections` を upsert(既存は貼り替え・古い Vault secret は削除)、`{ googleEmail }` を返す(トークンは返さない) | N/A |
| guest で「接続」ボタン | `state==='guest'` | `/auth` へ遷移。Google へ飛ばさない | N/A |
| 接続済みで設定を開く | `connections` に自分の行あり | 「接続中: <email>」を表示 | 取得失敗はキャッシュ無しなら「—」 |

</frozen-after-approval>

## Code Map

- `packages/core/src/google-oauth.ts` — **新規**。純関数: `buildGoogleAuthUrl(p)` / `parseGoogleTokenResponse(json)` / `primaryEmailFromCalendarList(json)` / `GOOGLE_CALENDAR_SCOPES`。何も import しない。
- `packages/core/src/index.ts` — 上を re-export(`compareEventsForList` 等と並べる)。
- `packages/core/src/google-oauth.test.ts` — **新規**。I/O マトリクスの純ロジック行。
- `src/data/connections.ts` — **新規**。`startGoogleConnect()`(state 生成 → `window.location.assign`)/ `completeGoogleConnect({code,state})`(state 照合 → 関数 fetch)/ `getConnection()`(自分の `connections` 行 1件)。全 `Result`。`supabase` / `requireSupabase` を使う。
- `src/data/connections.test.ts` — **新規**。state 照合・エラー分岐(関数 fetch は `vi.fn` でモック、`supabase` はモック)。
- `src/data/messages.ts` — `connection/*` messageKey を `DATA_MESSAGES` に追加(下記 Design Notes)。
- `src/data/env.ts` — `googleOauthClientId` を `AppEnv` に追加(`VITE_GOOGLE_OAUTH_CLIENT_ID`)。`hasGoogleOauth` フラグ。
- `src/data/supabase.ts` — 変更なし(参考: `requireSupabase()` / `supabase.auth.getSession()` でJWT取得)。
- `src/features/connections/` — **新規ディレクトリ**。`model/useGoogleConnection.ts`(`getConnection` を読む・`state` 監視・`startGoogleConnect`)、`ui/ConnectionsSection.tsx`(設定に差す。authenticated=接続ボタン or 接続中表示、guest=「先にログイン」)。
- `src/features/connections/ui/GoogleCallbackScreen.tsx` — **新規**。`/connections/google/callback` の画面。URL パラメータを読んで `completeGoogleConnect` → 成功で `/settings` へ、失敗でメッセージ + 「設定へ戻る」。
- `src/app/routes.tsx` — `/connections/google/callback` ルート追加(タブ外、AppShell の子)。
- `src/features/settings/ui/SettingsScreen.tsx` — 末尾プレースホルダ `<p>カレンダー接続は後続ストーリーで…</p>` を `<ConnectionsSection />` に差し替え。
- `supabase/migrations/20260911000000_connections.sql` — **新規**。`connections` テーブル + RLS + `supabase_vault` 有効化 + `set_updated_at` トリガ。
- `supabase/functions/oauth-exchange/index.ts` — **新規**(Deno)。JWT 検証 → token 交換 → Vault → `connections` upsert。
- `supabase/functions/_shared/cors.ts` — **新規**。CORS ヘッダ(`http://localhost:5173`)。
- `env.example` — `VITE_GOOGLE_OAUTH_CLIENT_ID=` の行を追加。
- `.env.local`(git 管理外・ユーザー編集) — Claude が `env.local.append.txt` を用意し、ユーザーが追記。

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/google-oauth.ts` + `index.ts` re-export -- 純関数3つ + スコープ定数 -- Edge Function とクライアントで同じ URL/パース規則
- [x] `packages/core/src/google-oauth.test.ts` -- I/O マトリクスの純ロジック行(URL 構築 / パース正常・欠落・エラー / primary 抽出)
- [x] `supabase/migrations/20260911000000_connections.sql` -- `connections` テーブル・RLS(SELECT own のみ、INSERT/UPDATE なし)・`create extension if not exists supabase_vault` -- refresh_token の受け皿
- [x] `supabase/functions/_shared/cors.ts` + `supabase/functions/oauth-exchange/index.ts` -- JWT→user、token 交換、`vault.create_secret`、`connections` upsert(古い secret 削除)、トークンを返さない -- AD-3
- [x] `src/data/env.ts` -- `googleOauthClientId` / `hasGoogleOauth` -- 未設定でもアプリは起動(接続ボタンは無効表示)
- [x] `src/data/connections.ts` + `connections.test.ts` -- `startGoogleConnect` / `completeGoogleConnect` / `getConnection`、全 `Result`、state 照合 -- data-access 境界
- [x] `src/data/messages.ts` -- `connection/*` 文言6件
- [x] `src/features/connections/model/useGoogleConnection.ts` + `ui/ConnectionsSection.tsx` -- 設定の接続欄(状態別)
- [x] `src/features/connections/ui/GoogleCallbackScreen.tsx` + `src/app/routes.tsx` -- コールバック処理画面 + ルート
- [x] `src/features/settings/ui/SettingsScreen.tsx` -- プレースホルダを `<ConnectionsSection />` へ
- [x] `env.example` + `env.local.append.txt`(scratchpad ではなくプロジェクト直下、ユーザー追記用) -- client ID の環境変数
- [x] `src/features/connections/**/*.test.tsx` -- guest→/auth、接続中表示、コールバック成功/失敗の結合テスト

**Acceptance Criteria:**
- Given `authenticated` ユーザーが設定で「Google を接続」を押す、when 同意画面で許可して戻る、then `connections` に自分の行が1件でき、設定に「接続中: <email>」が出る。`refresh_token` はクライアントの JS からも Network 応答からも見えない。
- Given `guest`(匿名)ユーザー、when 「Google を接続」を押す、then Google へ飛ばず `/auth` へ遷移する。
- Given 同意画面でユーザーが「キャンセル」、when コールバックに戻る、then 「接続をキャンセルしました」を出して設定へ戻り、`connections` は空のまま。
- Given すでに接続済みで再度接続、when 交換が成功、then `connections` 行は1件のまま(貼り替え)、古い Vault secret は残らない。
- Given `VITE_GOOGLE_OAUTH_CLIENT_ID` 未設定、when 設定を開く、then アプリは落ちず「接続は設定待ち」の無効表示になる。

## Implementation Notes

- **実装ファイル:** `packages/core/src/google-oauth.ts`(純関数3 + `GOOGLE_CALENDAR_SCOPES`)、`src/data/connections.ts`(`startGoogleConnect` / `completeGoogleConnect` / `getConnection` / `googleRedirectUri` / `GOOGLE_CALLBACK_PATH`)、`src/features/connections/`(`model/useGoogleConnection.ts` — `enabled` 引数つき、`ui/ConnectionsSection.tsx`、`ui/GoogleCallbackScreen.tsx`)、`supabase/migrations/20260911000000_connections.sql`、`supabase/functions/oauth-exchange/index.ts` + `_shared/cors.ts`。
- **redirect URI パス確定:** `/connections/google/callback`(既存のフラットなタブ外ルート `/calendars` `/shift-templates` に合わせた)。`docs/google-connection-setup.md` も同値に更新済み。
- **eslint:** `supabase/functions` を ignores に追加(Deno ランタイム、ローカルに Deno なし。マイグレーションと同じ目視レビュー扱い)。`tsc -b` は元々 `src` + `packages/core/src` のみ対象なので Edge Function は型チェック外。
- **CORS:** `Access-Control-Allow-Headers` はプリフライトの `Access-Control-Request-Headers` をそのまま反映(supabase-js の送信ヘッダ集合がバージョン差で変わるため固定リストにしない)。
- **Vault:** `upsert_google_connection(p_user_id, p_refresh_token, p_google_email)` RPC(`security definer`、`service_role` のみ grant)。`vault.create_secret` の戻り uuid を `connections.vault_secret_id` へ。貼り替え時は旧 secret を `delete from vault.secrets`。`search_path` に `extensions` を明示(security definer が Supabase 既定パスを失うため)。
- **supabase-js `functions.invoke` の挙動(v2.115):** 非2xx は throw せず `{ error: FunctionsHttpError }`(`.context` が `Response`)、関数到達不能は `{ error: FunctionsFetchError }`。`completeGoogleConnect` は前者を本文の `{error: key}` に対応づけ、後者を `data/offline` にする。
- **テスト:** core 13(google-oauth)、`connections.test.ts` 11、`ConnectionsSection.test.tsx` 6、`GoogleCallbackScreen.test.tsx` 3。全体 365。`window.location` は `Object.defineProperty` で差し替え(jsdom は `assign` を spy 不可)。
- **未検証(ユーザーの実機確認待ち):** OAuth 往復、`oauth-exchange` デプロイ後の動作、`upsert_google_connection` の実 DB 実行、Vault 書き込み。Docker/Deno がローカルに無いため。

## Spec Change Log

## Review Triage Log

**Pass 1(2026-09-10、3レンズ inline):**

| # | レンズ | 指摘 | verdict | 対応 |
|---|---|---|---|---|
| F1 | blind | `oauth-exchange` の Google `fetch` / `createClient` が投げると CORS ヘッダ無しの 500 → ブラウザは素の CORS エラー | high | **patch**: ハンドラ全体を try/catch でくるみ、`fetch` も個別に。CORS ヘッダ付きで返す |
| F2 | blind | CORS プリフライトの許可ヘッダが固定リスト。supabase-js が別ヘッダを送ると接続フロー全体が CORS エラーで死ぬ | high | **patch**: `Access-Control-Request-Headers` を反映 |
| F3 | blind | 関数到達不能は `{error: FunctionsFetchError}`(throw されない)→ `isNetworkError` の catch を通らず「接続に失敗」表示(本来オフライン) | medium | **patch**: `if (error)` 分岐で name を見て `data/offline` |
| F4 | blind | `sessionStorage.setItem` が投げると `startGoogleConnect` が `err` を返すが `ConnectionsSection` が無視 → ボタンが無反応 | low | **patch**: `onConnect` で戻り Result を拾って alert 表示 |
| F5 | blind | `GoogleCallbackScreen` の成功後 `setTimeout(navigate)` がアンマウントで未クリア → 900ms 内に離脱すると余計な遷移 | low | **patch**: effect cleanup で `clearTimeout` |
| F6 | blind/sql | `upsert_google_connection` は `security definer` + 明示 `search_path` で Supabase 既定の `extensions` を失う。`gen_random_uuid()` が `extensions` 側なら実行時エラー | low-med | **patch**: `search_path` に `extensions` 追加(防御的。実際は `gen_random_uuid` は `pg_catalog`) |
| F7 | edge | 同時に2回 OAuth 往復すると `upsert_google_connection` が部分ユニーク索引違反 → 「exchange-failed」 | low | **defer**: 個人利用で同時実行は稀。3.4(接続解除/再接続)で `on conflict` を検討。deferred-work へ |
| F8 | verification-gap | `oauth-exchange` / `upsert_google_connection` に自動テスト無し。関数内複製が core と一致する保証も無し | — | **reject**: spec Design Notes で承認済み(Deno/PG がローカルに無くマイグレーションと同じ目視 + 実機確認)。3.3 で Deno 環境が整えば import へ寄せる |
| F9 | blind | `oauth-exchange` がクライアント送信の `redirectUri` を設定値より優先 | — | **reject**: 認可リクエストで使った値と厳密一致が必要なため、クライアント値優先が正しい。JWT で本人束縛済みで悪用不可。allowlist 検証は本番化時に検討 |

## Design Notes

**`connection/*` 文言(messages.ts):**
```
'connection/exchange-failed': 'Google との接続に失敗しました。もう一度お試しください',
'connection/no-refresh-token': '接続をやり直してください。Google の許可画面で「許可」を選んでください',
'connection/state-mismatch': '接続を確認できませんでした。もう一度お試しください',
'connection/cancelled': '接続をキャンセルしました',
'connection/not-authenticated': '接続にはログインが必要です',
'connection/unavailable': 'この機能は Supabase の設定後に使えます',
```

**Vault の使い方(migration + 関数):** `connections.vault_secret_id uuid` に `vault.create_secret(<refresh_token>, 'google_refresh_'||<connection_id>, 'Google Calendar refresh token')` の戻り uuid を入れる。関数(service_role)は `select decrypted_secret from vault.decrypted_secrets where id = ...` で読む。`vault` スキーマは PostgREST 非公開なので RLS 不要。貼り替え時は旧 `vault_secret_id` を `delete from vault.secrets where id = ...`。

**関数の形(Deno、薄く):** `Deno.serve` → OPTIONS で CORS → `Authorization` から `createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { global: { headers: { Authorization }}})` で `auth.getUser()`、無ければ 401 → `fetch('https://oauth2.googleapis.com/token', {form})` → `parseGoogleTokenResponse`(core の規則をベタ移植、ローカル Deno 無しのため import せず複製し、コメントで core と同期する旨明記)→ Vault → service_role client で `connections` upsert → `Response.json({ googleEmail })`。ログは `console.log` で「exchanged, email domain=<domain>, elapsed=<ms>」程度(メール全体・トークンを書かない)。

**core を Deno から import しない判断:** `packages/core` は npm ビルド前提(`dist/`)。ローカルに Deno が無く import マップ検証もできないため、Story 3.1 では関数内に ~15 行複製する。複製箇所に `// packages/core/src/google-oauth.ts と同じ規則。変更時は両方』` コメント。3.3 で Deno 環境が整うなら import へ寄せる(deferred-work)。

## Verification

**Commands:**
- `npm run -s typecheck` -- expected: エラーなし
- `npx vitest run` -- expected: 追加分含め全 pass。core の `google-oauth.test.ts` が I/O マトリクスの純ロジック行を網羅
- `npm run -s lint` -- expected: レイヤ逆流なし(`packages/core` は何も import しない、`src/features` → `src/data` のみ)
- `npm run -s build` -- expected: 成功

**Manual checks (Supabase 接続後・関数デプロイ後にユーザー):**
- 設定 →「Google を接続」→ 同意 → 「接続中: <email>」表示。DevTools Network で `oauth-exchange` 応答に `refresh_token` / `access_token` が含まれないこと。
- Supabase ダッシュボード → Table Editor → `connections` に1行。`vault.secrets` に対応行。
