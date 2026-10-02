---
title: 'Multi calendar 有料機能(複数Googleアカウント / Googleカレンダーへの予定反映)'
type: 'feature'
created: '2026-10-02'
status: 'ready-for-implementation'
owner_requirements: 'Claude Code'
owner_implementation: 'Codex'
---

# 有料機能: 複数Googleアカウント + Googleカレンダーへの予定反映(RevenueCat課金)

## 1. 目的

Multi calendar に2つの月額課金機能を追加する。課金基盤は RevenueCat(Google Play Billing / App Store を束ねる)。

| 機能 | 内容 | 月額 | Entitlement 名(案) |
|---|---|---|---|
| A. 予定反映 | アプリで作った予定を Google カレンダーへ作成・編集・削除で反映 | ¥300 | `calendar_write` |
| B. 複数アカウント | Google アカウントを2つ以上接続 | ¥1,000 | `multi_account` |

## 2. 確定した要件(ユーザー回答 2026-10-02)

- **B は A を内包する**。`multi_account` 契約者は予定反映も使える。判定は `canWrite = calendar_write || multi_account`。A 単体(¥300)は「1アカウントだけ反映したい人」向け。
- **対象OS: Android と iOS を同時**。Play Console と App Store Connect の双方に定期購入商品を登録する。
- **反映の範囲: アプリ → Google の片方向で、作成・編集・削除**。取り込み済みの Google 予定(`source='google'`)の編集・書き戻しは**対象外**(競合回避)。
- **無料枠の維持**: 現行の「Google 1アカウント・読み取り専用の取り込み」は無料のまま。課金失効時もこの1アカウントの読み取りは継続する。

## 3. 前提(現状の実装、2026-10-02 時点で確認済み)

- `connections` は `(user_id, provider) where deleted_at is null` の部分ユニーク索引で**1ユーザー1接続に制限**されている(`supabase/migrations/20260911000000_connections.sql`)。複数アカウントにはこの制約の緩和が必要。
- OAuth スコープは読み取りのみ(`calendar.calendarlist.readonly` + `calendar.events.readonly`、`packages/core/src/google-oauth.ts`)。コメントに「書き込みスコープは含めない(§8.3)」とある。予定反映には書き込みスコープが必要で、**この方針とプライバシー説明の変更を伴う**。
- 取り込みは `sync-calendars` Edge Function が30分ごと(pg_cron)+手動で実行。`events` に `external_id` / `connection_id`、部分ユニーク `events_external_uniq (connection_id, external_id)`。
- Android の Google 連携は公式認可API(AuthorizationClient)へ移行済み(commit 57bb072)。スコープ追加はこの経路・Web 経路の両方で必要。
- Google OAuth 同意画面は「テスト中」。Play 審査提出済み(Alpha 版)で、iOS は公開前確認の段階。広告(AdMob)は実装済み。

## 4. Capability(受け入れ条件)

### CAP-1 課金基盤(RevenueCat)

- Capacitor 用 RevenueCat SDK を導入する(Capacitor 8 対応版の有無は着手時に確認。不明なら先に調査して報告。**対応状況を推測で書かない**)。
- `app_user_id` は Supabase の `auth.users.id`。**ゲスト(匿名)ユーザーは購読不可**(Google 連携不可という既存設計と同じ。購入導線は「ログインが必要です」を出す)。
- 商品は4〜5個: `calendar_write_monthly`(¥300)/`multi_account_monthly`(¥1,000)を iOS・Android それぞれに登録。価格表示は SDK から取得したローカライズ済み価格を使い、**アプリ内に金額をハードコードしない**(日本円価格は各ストアで設定。税込/税別はストア設定に従う)。
- iOS は A と B を**同一サブスクリプショングループ**に入れ、B を上位にする(Apple 側のアップグレード処理に任せ、二重課金を避ける)。Android は二重契約を防ぐ導線(B 契約中は A の購入ボタンを出さない。A 契約中に B へ上げる場合は RevenueCat の商品変更に従い、旧契約の取り扱いを画面で明示)を実装する。
- 購入、購入の復元(Restore)、購読の管理画面(各ストアの管理ページへの遷移)、規約・プライバシーポリシーへのリンクを設定画面に用意する。
- UI は日本語を基本とし、既存の6言語切替の仕組みに乗せる。

### CAP-2 権利(Entitlement)の判定と**サーバー側検証**

- クライアントの権利判定だけを信用しない。**Edge Function 側で必ず検証**する(第2アカウント接続・予定の Google への push の両方)。
- 方式の推奨: RevenueCat の Webhook を受ける Edge Function → `entitlements` テーブル(`user_id`, `entitlement`, `expires_at`, `product_id`, `store`, `updated_at`)へ反映。Edge Function はこのテーブルを参照する。Webhook 認証は共有シークレット(Authorization ヘッダ)を使い、**シークレットはリポジトリに置かない**。
  - 代替案: 判定のたびに RevenueCat REST API(secret key)を呼ぶ。実装は単純だがレイテンシ・レート制限・障害時の挙動が不利。Codex が選んでよいが理由を記録すること。
- RLS: `entitlements` はクライアントから SELECT のみ(自分の行)。書き込みは service_role のみ。
- 猶予: 課金失敗時の Grace period / Billing retry 中は RevenueCat の権利状態に従う(アプリ側で独自の猶予を作らない)。

### CAP-3 複数 Google アカウント(機能 B)

- DB: `connections` のユーザー単位ユニーク制約を緩和し、`(user_id, provider, google_account_id または google_email)` 単位のユニークにする(同一 Google アカウントの二重接続防止。メールは変更されうるので、取れるなら不変の `sub` を優先。取得手段は着手時に確認)。既存データ(接続1件)を壊さないマイグレーション。
- 接続上限: 無料=1。`multi_account` 契約中は N 件(**上限値はユーザー未指定。仮置き5件、要確認**)。**上限は oauth-exchange 側で強制**(クライアントのボタン非表示だけにしない)。
- 設定画面: 接続済みアカウントの一覧、追加、アカウントごとの取り込みカレンダー選択(既存の `GoogleCalendarPicker` をアカウント単位に)、アカウントごとの接続解除(既存の `disconnect_google_connection` を接続ID指定へ拡張)。
- 同期: `sync-calendars` / `google-calendars` / 優先度付与 / カレンダー表示名で、複数接続が混ざっても重複・取り違えが起きないこと。カレンダー管理でどのアカウントのカレンダーか見分けられる表示(アカウント名/メール)を出す。
- **失効時の挙動**: 最古の接続(= 最初に作られた接続)を「無料枠の接続」とし維持。2つ目以降は `status='suspended'`(削除しない)。取り込みを止め、予定とカレンダーはデータとして残すが、新規取り込み・反映はしない。UI には「再契約で再開」を表示。再契約で自動再開(再度の OAuth は不要)。
- B を契約していても Google アカウントの OAuth 認可自体はアカウントごとに必要。

### CAP-4 Google カレンダーへの予定反映(機能 A、B に内包)

- **スコープ**: 書き込みには `https://www.googleapis.com/auth/calendar.events` が必要(読み取り+書き込み)。**段階的認可**とし、反映機能を使う(または購入後に有効化する)接続でだけ追加認可を求める。無料ユーザーの読み取り専用フローは変えない。接続ごとに `write_granted` を持つ。
- **反映先の指定**: アプリ側のローカルカレンダー(`source='local'`)ごとに「反映先」(接続 + Google 側カレンダー ID)を任意に設定できる。未設定なら反映しない(既定は反映しない)。1つのローカルカレンダーの反映先は1つ。
- **反映の対象と動作**
  - 反映先が設定されたローカルカレンダーの予定を、作成・編集・削除に追随して Google へ送る。削除はアプリの論理削除(`deleted_at`)を Google 側の delete に変換する。Undo(6秒)で復元された場合は、確定前に Google へ送らない(送信は Undo 猶予後)か、復元時に再作成する。どちらにするかは Codex が決め、仕様書に追記する。
  - 終日・時刻付き・場所・URL・メモ・タグ・リマインダーのうち、Google に対応する項目(タイトル/日時/終日/場所/説明)を反映。対応しない項目の扱いは `docs` に明記(送らない項目は説明欄に入れず捨てる)。
  - **シークレットモードで隠す予定は反映しない**(Google 側に露出するため)。この扱いは [ASSUMPTION]。ユーザー未確認。
  - **取り込んだ Google 予定(`source='google'`)は反映・書き戻しの対象外**。
- **同期状態の保持**: `event_google_links`(仮称)テーブルに `event_id`, `connection_id`, `google_calendar_id`, `google_event_id`, `etag`, `state`(pending/synced/error), `last_error`, `last_pushed_at` を持つ。**サーバー側が真実**。`events` 本体に混ぜない(既存 `external_id` は取り込み専用の意味を保つ)。
- **取り込みとの二重化防止(最重要の罠)**: 反映先として選んだ Google カレンダーが取り込み対象にも選ばれていると、アプリが送った予定を次回の取り込みが「外部の予定」として**重複取り込み**する。`sync-calendars` は `event_google_links` に存在する `google_event_id` を取り込み対象から除外するか、送信時に Google 側へ `extendedProperties.private` でアプリ予定IDを付与して取り込み時に識別する(後者推奨、両方でも可)。
- **実行経路**: 保存操作のたびにクライアントから直接 Google を叩かない。Edge Function(例 `push-events`)で行い、アクセストークンはサーバー側(Vault の refresh_token から)でのみ扱う(既存方針 AD-3 を維持)。失敗は `state='error'` にしてリトライ(pg_cron または次回操作時)。オフライン時の編集は既存 outbox で再送され、サーバー到達後に push される。
- **失敗の表示**: 予定ごと・カレンダーごとに「Googleへ反映できませんでした」と再試行を出す(既存の取り込み失敗表示と同型)。
- **失効時の挙動**: 権利が切れたら新規 push を止める。**Google 側へ既に送られた予定は消さない**。UI は「予定反映が停止中」を表示。再契約後、停止中に溜まった変更を再送するかは [ASSUMPTION: 再契約時に pending を処理する]。
- **競合**: 片方向なので、Google 側でユーザーが予定を直接編集した場合はアプリの次回編集で上書きされる。この挙動を設定画面の説明に1行書く。Google 側で削除された反映済み予定をアプリが再作成するかどうかは Codex が決め、仕様書に追記する(推奨: 再作成しない、リンクを `state='orphaned'` にする)。

### CAP-5 課金導線の UX

- 設定画面に「プラン」欄: 現在の状態(無料/予定反映/複数アカウント)、購入ボタン、復元、管理リンク。
- 無料ユーザーが2つ目の接続追加や反映先設定を試したら、ペイウォール(機能説明+価格+購入)を出す。説明は何が起きるかを具体的に書く(誇張しない)。
- ペイウォールは邪魔にならず、無料機能を妨げない。広告(AdMob)表示は現状のまま。**課金で広告を消すかはユーザー未指定のため、本 spec の範囲外**。

### CAP-6 アカウント削除・プライバシー

- 既存の `delete_my_account`(20260926)に、`entitlements` と `event_google_links` の削除、複数接続すべての Vault secret 削除を含める。
- **サブスクリプションはアカウント削除では解約されない**。削除前の確認画面で「ストアで購読の解約が必要」と明記する(各ストアの購読管理リンク付き)。RevenueCat 側の顧客データ削除方針は着手時に確認。
- プライバシーポリシー(`docs/privacy-policy.md` と公開ページ)・Play データセーフティ(`docs/play-data-safety-audit-20260926.md`)・App Store のプライバシー申告に、購入情報(RevenueCat 経由)と Google 書き込みスコープの利用を反映する。

## 5. リリース上の依存・リスク(コードの外)

1. **Google OAuth の書き込みスコープは機密スコープ**。現在は「テスト中」なので、本番配布には Google の OAuth 検証審査が必要になる可能性が高い(審査要件・所要期間は着手時に Google の最新ドキュメントで確認。**期間を推測で書かない**)。審査が通るまでは「テストユーザー限定」の動作確認に留まる。**この審査が予定反映機能の公開ゲートになりうる**。
2. Play Console: 定期購入商品の作成・価格設定、ライセンステスター、(必要なら)課金に関する申告の更新。審査提出済み版との差分は別リリースになる。
3. App Store Connect: 定期購入商品の作成、同一グループ化、審査用スクリーンショット、初回提出時に商品を一緒にレビューへ出す必要。日本円 ¥300 / ¥1,000 に対応する価格帯が選べるかは設定時に確認。
4. RevenueCat: プロジェクト作成、アプリ登録(Android/iOS)、Entitlement・Offering 定義、Webhook 設定、公開 SDK キー(プラットフォーム別)の発行。**キーのうち公開 SDK キー以外(secret key / webhook シークレット)は `.env` 系ファイルとリポジトリに入れず、Supabase の関数シークレットへ**。
5. 税務・規約: 定期購入の自動更新に関する表示(価格・期間・解約方法)をペイウォールに載せる(各ストアのガイドライン準拠)。

## 6. ユーザー側のタスク(Codex がこなせない作業)

- RevenueCat アカウント作成、Play Console / App Store Connect での商品登録とキー発行
- Google Cloud でのスコープ追加と OAuth 検証審査の申請
- 価格(¥300 / ¥1,000)がストアで設定できることの確認
- 接続上限の確定(仮置き5件)
- シークレットモードの予定を反映しない方針の承認

## 7. Non-goals

- 取り込み済み Google 予定の編集・書き戻し(完全双方向)
- Google 以外(Outlook 等)のアカウント
- 年額プラン・無料トライアル・プロモーションコード(必要なら別 spec)
- Web(PWA)での課金(今回は Android + iOS のみ)
- 課金による広告非表示
- ファミリー共有・複数端末間の購読共有(RevenueCat の標準的な `app_user_id` 共有に任せる範囲を超えない)

## 8. 未確定事項([ASSUMPTION] 一覧)

| # | 内容 | 現在の仮定 |
|---|---|---|
| 1 | 接続上限(B 契約時) | 5件 |
| 2 | シークレット予定の Google 反映 | 反映しない |
| 3 | 失効後の再契約時の保留変更の扱い | 再契約時に pending を処理 |
| 4 | Google 側で削除された反映済み予定 | 再作成せず orphaned |
| 5 | 同一カレンダーを取り込みと反映先に両方設定 | 許可するが二重化防止を必ず実装 |
| 6 | 課金と広告の関係 | 変更しない(範囲外) |

## 9. 推奨する実装順(Codex 向け)

1. 事前調査(Capacitor 8 対応 SDK、Google 書き込みスコープ要件、Android 認可API での追加スコープ要求、各ストアの価格設定)→ 結果を `docs/` に短く記録し、判断が分かれる点だけユーザーへ確認。
2. CAP-1 + CAP-2(課金基盤と `entitlements` + Webhook)。テスト用ライセンス/Sandbox で購入→権利反映までを実機確認。
3. CAP-3(複数アカウント。マイグレーション・上限強制・失効時 suspended)。
4. CAP-4(予定反映。`event_google_links`、`push-events`、取り込み二重化防止)。
5. CAP-5 / CAP-6(UX・アカウント削除・プライバシー文書)。
6. `docs/testing-and-verification.md` の方針どおり、Edge Function と RPC は**デプロイ後スモーク**で実環境確認(単体テストでは見えない層の欠陥が過去3エピックで再発している)。特に「取り込みとの二重化」「失効時の suspended」「ゲスト購入拒否」は実機で確認すること。
