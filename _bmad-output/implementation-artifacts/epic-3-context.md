# Epic 3 Context: Google カレンダーを取り込んで一緒に表示する

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Google アカウントを OAuth で接続し、選んだカレンダーを**読み取り専用**で取り込んで、自分の予定と1つのビューに統合表示する。取り込みは pg_cron で定期実行 +「今すぐ取り込み」、失敗はカレンダー単位で表示、接続解除でそのアカウント由来のデータは消える。取り込んだカレンダーにも Epic 2 の優先度がそのまま効く。FR3 / FR4(+ FR5 の外部カレンダー表示、FR6 の優先度適用)。

## Stories

- Story 3.1: Google 接続(OAuth)と資格情報の安全な保管 — 接続フロー + `oauth-exchange` Edge Function + `connections` テーブル + Vault
- Story 3.2: 取り込むカレンダーの選択と一覧表示 — `connection_calendars` + 選択 UI + `source='google'` カレンダー行の作成(採番トリガ経由で最下位優先度)
- Story 3.3: 定期取り込みと手動取り込み — `sync-calendars` Edge Function(冪等 upsert + 論理削除)+ pg_cron + 「今すぐ取り込み」+ 最終取り込み時刻表示
- Story 3.4: 取り込み失敗の表示と接続解除 — カレンダー行の失敗表示・再試行 + 接続解除(データ削除・事前明示)

## Requirements & Constraints

- **AD-2(最重要):** 外部カレンダーは Google → Postgres の一方向取り込みのみ。`source = 'google'` の予定は読み取り専用 — 編集・削除の UI も API 経路も作らない。**外部サービスへ書き込む関数をコードベースに置かない。**
- **AD-3(最重要):** Google の `provider_refresh_token` と OAuth クライアントシークレットは Supabase 側(Vault)にのみ保存。クライアント・ローカルキャッシュ・ログ・エラー本文に出さない。**トークン交換と Google Calendar API 呼び出しは Edge Function だけが行う。** 要求スコープはカレンダー読み取りの最小限(`calendar.calendarlist.readonly` + `calendar.events.readonly`。書き込みスコープを要求しない)。
- **AD-4:** 取り込みは1つの Edge Function(`sync-calendars`)。pg_cron 定期起動 + ユーザーの「今すぐ取り込み」で同じ関数。外部イベントの安定 ID `(connection_id, external_id)` で upsert し二重登録しない。外部から消えた予定は論理削除。取り込み単位は「接続 × カレンダー」で、成功時刻・失敗を**カレンダー単位**で記録。1カレンダーの失敗は他カレンダーの取り込み・表示を止めない。
- **AD-7:** 取り込んだ時刻は `timestamptz`(UTC)保存、表示時にユーザー TZ へ変換。
- **AD-1 / AD-9 / AD-10:** 真実源は Postgres。クライアントは data-access レイヤ(`src/data`)越しにのみ外部へ。data-access は `Result<T, AppError>` を返す。snake↔camel 変換は `src/data` に閉じる。純ロジック(OAuth URL 構築・トークン応答パース等)は `packages/core`。
- **認証:** アプリのログインはメール+パスワード(Story 1.2、匿名お試しあり)。**Google 接続は「カレンダー読み取り認可」だけの別フロー**でアプリのログイン手段ではない。未ログイン(匿名含む)で「接続」を押したらログイン/アカウント作成へ誘導し、完了後に接続フローへ戻す(FR16、UX-DR13)。
- **接続解除でデータを残さない:** 解除するとそのアカウント由来の取り込み予定・カレンダー行が Postgres + キャッシュから消える。影響を事前に明示(§8.3、UX-DR13 破壊的操作)。
- **ロギング:** Edge Function は構造化ログ。予定本文・メール・トークンをログに書かない(カレンダー名・件数・所要時間まで)。
- v1 は外部カレンダーの繰り返し予定を**展開済みインスタンス**で取り込む(PRD §9-5。Google API の `singleEvents=true`)。

## Technical Decisions

- **既存スキーマ(Story 1.3 / 2.1 で用意済み):**
  - `calendars.source text check (source in ('local','google'))` — 外部カレンダーは `'google'`(epics.md の "external" ではなく実装は `'google'`)。
  - `calendars.external_connection_id uuid` / `calendars.external_calendar_id text`(nullable)+ 部分ユニーク索引 `calendars_external_uniq (external_connection_id, external_calendar_id) where external_connection_id is not null`。
  - `calendars_set_priority` before-insert トリガは Edge Function の insert もカバー(`new.priority is null` なら `max+1`)。
  - `events.source text check (source in ('local','google'))`。`events` に `external_id` / `connection_id` 列は**未追加** → Story 3.3 で追加(`(connection_id, external_id)` ユニーク)。
- **`connections` テーブル(新規、Story 3.1):** `id uuid` / `user_id uuid default auth.uid()` / `provider text default 'google' check (provider in ('google'))` / `google_email text`(表示用、primary calendar の id から取得)/ `vault_secret_id uuid`(`vault.secrets.id` を指す。refresh_token 本体は Vault)/ `created_at` / `updated_at` / `deleted_at`。RLS: SELECT / (3.4 で)DELETE は本人のみ。**INSERT / UPDATE はクライアント不可**(Edge Function が service_role で行う)。ユーザーごとに Google 接続は当面1つ([ASSUMPTION] — 複数アカウントは v2)。
- **`oauth-exchange` Edge Function(Story 3.1):** クライアントから `{ code, redirect_uri }` + `Authorization: Bearer <supabase jwt>` を受ける。JWT で user を特定 → Google `https://oauth2.googleapis.com/token` に `authorization_code` 交換(`client_secret` は関数シークレット)→ `refresh_token` を Vault へ(`vault.create_secret`)→ `connections` 行を service_role で upsert(既存接続があれば貼り替え)→ **トークンを返さない**。`google_email` は `calendarList` の primary から取得。
- **`connection_calendars` テーブル(Story 3.2):** `connection_id` / `external_calendar_id`(Google 側 id)/ `summary` / `background_color` / `selected boolean`(取り込み対象か)/ `calendar_id uuid`(対応する `calendars` 行、selected 時に作成)。
- **`sync_state` テーブル(Story 3.3):** 取り込み単位「接続 × カレンダー」ごとに `last_synced_at` / `last_error` / `sync_token`(Google 増分同期トークン、任意)。
- **OAuth フロー(クライアント側、Story 3.1):** 認可コードフロー(PKCE ではない — 秘密鍵は Edge Function 側の confidential client)。`state` を乱数生成し `sessionStorage` に保持(CSRF)。`https://accounts.google.com/o/oauth2/v2/auth` へ `access_type=offline` + `prompt=consent` + 2スコープ + `state` でリダイレクト。`/connections/google/callback` ルートで `state` 照合 → `oauth-exchange` 呼び出し。
- **純ロジックは `packages/core/src/google-oauth.ts`:** `buildGoogleAuthUrl(params)` / `parseGoogleTokenResponse(json)` / `primaryEmailFromCalendarList(json)` 等。Vitest でテスト。Edge Function からは相対パス import(Deno)または該当ロジックを関数内に薄く複製(ローカルに Deno なし、関数本体は目視レビュー)。

## UX & Interaction Patterns

- 入口: 設定 →「カレンダーを接続」→ Google(UX персона UJ)。SettingsScreen の既存プレースホルダ「カレンダー接続は後続ストーリーでここに追加されます」を差し替える。
- 未ログインで「接続」: ログイン/アカウント作成画面へ誘導、完了後に接続フローへ戻る(UX-DR13「未ログインで Google 接続」)。
- 接続済み表示: `google_email` と「接続中」、(3.4 で)接続解除ボタン。
- 取り込みカレンダー選択(3.2): アカウントのカレンダー一覧(名前・色)、個別オン/オフ。
- カレンダー管理一覧(3.2): `source='google'` 行として source を明示(Story 1.3 の CalendarRow が source 表示済み)、Epic 2 の並べ替え・優先度がそのまま効く。
- 取り込んだ予定の詳細(3.3): 閲覧のみ。編集・削除ボタンを出さない。カレンダーごとに最終取り込み時刻。
- 失敗表示(3.4): 該当行に「取り込めませんでした・再試行」。他カレンダーは通常表示。ホーム/カレンダーは最後に取り込めた内容を出し続ける(UX-DR11)。
- 接続解除(3.4): 影響(消える予定の件数等)を事前に明示 → 確定で削除。
- アクセシビリティ: role + 状態ラベル、44px タップtarget、フォーカスリング維持、Reduce Motion、感嘆符なし。
- 文言: EXPERIENCE.md Voice。英語・コード・トークンを出さない。

## Cross-Story Dependencies

- Story 3.1(`connections` + `oauth-exchange` + 接続フロー)が 3.2 / 3.3 / 3.4 すべての前提。
- Story 3.2(`connection_calendars` + `source='google'` カレンダー行)が 3.3(そのカレンダーの予定を取り込む)の前提。
- Story 3.3(`sync-calendars` + `sync_state` + `events` の外部 ID 列)が 3.4(失敗表示は `sync_state.last_error` を読む)の前提。
- Epic 2 Story 2.1 の `calendars.priority` 列・`calendars_set_priority` トリガに依存(取り込んだカレンダーも最下位優先度で採番)。
- Story 1.3 の `calendars` テーブル + CalendarRow の source 表示、Story 1.5 の統合ビュー、Story 2.x の並び規則に載る。
- 外部設定: `docs/google-connection-setup.md`。Phase B(Google Cloud OAuth)完了済み。クライアント ID = `1015352739751-p5nfnph6d6mgh2sp6mgg534a726mfsi9.apps.googleusercontent.com`。クライアントシークレット・関数シークレットはユーザーが Supabase 管理画面で設定(Phase C-3)。関数デプロイと `db push` は Claude(アクセストークンは資格情報マネージャー済み)。
