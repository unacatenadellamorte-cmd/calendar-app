# Epic 3 の接続セットアップ手順(Google カレンダー取り込み)

Epic 3(Google カレンダーを取り込んで一緒に表示する)を動かすのに必要な外部設定をまとめたもの。
Supabase の Phase A(DB 接続)は完了済み。ここは **Phase B(Google 側)** と **Phase C(Supabase Edge Function + 定期実行)**。

---

## 全体像

```
[アプリ] ──「Google を接続」ボタン──▶ Google の同意画面
   ▲                                        │ 認可コード
   │ 成功                                    ▼
[アプリ] ◀── oauth-exchange 関数 ◀── アプリに戻る(コードを関数へ渡す)
                   │ client_secret でトークン交換
                   ▼
           refresh_token を Supabase 側に保管(本人しか読めない)
                   │
           sync-calendars 関数(pg_cron で定期 / 「今すぐ取り込み」で手動)
                   │ refresh_token → access_token → Google Calendar API v3(読み取りのみ)
                   ▼
           Postgres に予定を upsert(安定 ID で二重登録なし・外部で消えたら論理削除)
```

要点(アーキテクチャ AD-2 / AD-3 / AD-4):

- **読み取り専用。** 書き込みスコープは要求しない。アプリから Google へ書き戻す経路はコードに置かない。
- **資格情報はサーバー側だけ。** `refresh_token` と `client_secret` はブラウザ・キャッシュ・ログに出さない。トークン交換と Google API 呼び出しは Edge Function だけがやる。
- **最小スコープ。** `calendar.calendarlist.readonly`(カレンダー一覧)+ `calendar.events.readonly`(予定の読み取り)の2つだけ。`calendar.readonly` より狭い。

---

## 役割分担

| 記号 | 意味 |
| --- | --- |
| 🧑 | Ryo さんがブラウザでやる作業(Google Cloud / Supabase の管理画面) |
| 🤖 | こっち(Claude)がコードや CLI でやる作業 |
| 🤝 | 一緒に決めること |

---

# Phase B — Google 側の設定(🧑 が中心)

Google Cloud Console( https://console.cloud.google.com/ )で作業する。Ryo さんの Google アカウントでログイン。

## B-1. プロジェクトを作る 🧑

1. 画面上部の左、プロジェクト選択(たぶん「プロジェクトを選択」か既存名)をクリック
2. 右上「新しいプロジェクト」
3. 名前: `calendar-app`(何でもいい)。組織は「組織なし」でOK
4. 「作成」→ 数十秒待つ → 作ったプロジェクトを選択

## B-2. Google Calendar API を有効化 🧑

1. 左メニュー(ハンバーガー)→「API とサービス」→「有効な API とサービス」
2. 上の「+ API とサービスを有効にする」
3. `Google Calendar API` を検索 → 開く → 「有効にする」

## B-3. OAuth 同意画面を設定 🧑

1. 「API とサービス」→「OAuth 同意画面」
   - 新しい Console だと「Google 認証プラットフォーム」→「ブランディング」という名前かもしれん
2. User Type: **外部(External)** を選択 → 作成
3. アプリ情報:
   - アプリ名: `カレンダーアプリ(仮)` など
   - ユーザーサポートメール: 自分のメール
   - デベロッパーの連絡先情報: 自分のメール
   - ロゴ・ドメインは空でOK
4. スコープ:
   - 「スコープを追加または削除」
   - フィルタに `calendar` と入れて、次の2つにチェック:
     - `.../auth/calendar.calendarlist.readonly`
     - `.../auth/calendar.events.readonly`
   - 「更新」→「保存して次へ」
   - ⚠️ これらは「機密スコープ(sensitive)」に分類される。後述の「公開ステータス」の話に関係する
5. テストユーザー:
   - 「+ Add Users」で **自分のメールアドレスを追加**(ここに入れた人だけが接続できる。最大100人)
   - 「保存して次へ」
6. 概要を確認して完了

## B-4. OAuth クライアント ID を作る 🧑

1. 「API とサービス」→「認証情報(Credentials)」
2. 「+ 認証情報を作成」→「OAuth クライアント ID」
3. アプリケーションの種類: **ウェブ アプリケーション**
4. 名前: `calendar-app web`
5. **承認済みの JavaScript 生成元** に追加:
   - `http://localhost:5173`
6. **承認済みのリダイレクト URI** に追加:
   - `http://localhost:5173/connections/google/callback`
   - (本番ホスティングを用意したら、そのURLの同じパスも後で足す)
7. 「作成」
8. 出てくる **クライアント ID** と **クライアント シークレット** を控える
   - クライアント ID … 公開情報。アプリに埋め込む(`VITE_GOOGLE_OAUTH_CLIENT_ID`)
   - クライアント シークレット … 秘密。Supabase の関数シークレットにだけ入れる。**チャットに貼らんでいい**(Supabase 管理画面から直接入れる。B-5 参照)

## B-5. 公開ステータスをどうするか 🤝

同意画面の「公開ステータス」で挙動が変わる。個人利用なら以下の2択:

| | テスト中(Testing) | 本番(Production)・未検証のまま |
| --- | --- | --- |
| Google の審査 | 不要 | 不要(ただし「確認されていないアプリ」警告画面が出る。詳細→続行 で進める) |
| refresh_token の寿命 | **7日で失効**(7日ごとに接続し直し) | 失効しない(通常の revoke ルールのみ) |
| 使える人数 | テストユーザーに入れた人(最大100) | 生涯 合計100人まで(リセット不可) |
| すぐ始められる | ✅ | ✅(警告画面をワンクッション挟むだけ) |

- **おすすめの進め方:** まず **テスト中** のまま実装・動作確認する。7日の再接続が面倒になったら「アプリを公開」を押して **本番・未検証** に切り替える(いつでも切り替え可能、コード変更不要)。
- CASA(有料のセキュリティ審査)は個人利用では一生不要。広く配布して警告画面を消したくなったときだけ検討。

## B-6. こっちに渡すもの 🧑→🤖

- **クライアント ID**(`xxxxx.apps.googleusercontent.com`)…… チャットに貼ってOK(公開情報)
- **クライアント シークレット**(`GOCSPX-xxxx`)…… B-5 のあと、Phase C-3 で Supabase 管理画面から直接入れる。**貼らない**

---

# Phase C — Supabase Edge Function と定期実行(🤖 が中心)

## C-1. Edge Function を書く 🤖

`supabase/functions/oauth-exchange/` と `supabase/functions/sync-calendars/` を実装する(Story 3.1 / 3.3)。
これは BMAD のストーリー実装として進める。ローカルに Docker が無いので `supabase functions serve` での実行確認はできず、**デプロイ後に実アプリで動作確認**する。

## C-2. DB マイグレーション 🤖

新しいテーブルを足す(Story 3.1 / 3.2):

- `connections` — Google 接続1件(user_id, provider, google_account_email, 作成日時)
- `connection_calendars` — 接続内の取り込み対象カレンダー(on/off、Google 側の色・名前)
- `sync_state` — カレンダー単位の最終取り込み時刻・失敗内容
- `events` に外部予定用カラム(`connection_id`, `external_id`)+ `(connection_id, external_id)` の一意制約
- `calendars` の `source` に `'external'` を許可
- refresh_token の保管(Vault か暗号化カラム。Story 3.1 の spec で確定)
- pg_cron のスケジュール登録(Story 3.3)

`npx supabase db push` で適用(Phase A で使ったのと同じ。アクセストークンは Windows の資格情報マネージャーに保存済み)。

## C-3. 関数シークレットを登録 🧑(管理画面)

Supabase ダッシュボード → プロジェクト → **Edge Functions** → **Secrets**(or Settings → Edge Functions):

| キー | 値 |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | B-4 のクライアント ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | B-4 のクライアント シークレット |
| `GOOGLE_OAUTH_REDIRECT_URI` | `http://localhost:5173/connections/google/callback` |

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は関数実行時に自動で入るので登録不要。

## C-4. 関数をデプロイ 🤖

```
npx supabase functions deploy oauth-exchange
npx supabase functions deploy sync-calendars
```

## C-5. アプリ側の環境変数 🧑→🤖

`.env.local` に1行足す(Phase A の `env.local.txt` を作った要領で、こっちがファイルを用意 → Ryo さんがリネーム/上書き):

```
VITE_GOOGLE_OAUTH_CLIENT_ID=<B-4 のクライアント ID>
```

## C-6. pg_cron の間隔 🤝

定期取り込みの間隔。個人利用なら頻繁である必要はない:

- 15分ごと / **30分ごと(おすすめ)** / 1時間ごと

Story 3.3 実装時に確定。マイグレーションの1行を変えるだけなので後からでも変えられる。

---

# 進行順まとめ

1. 🧑 Phase B-1〜B-4(Google Cloud でプロジェクト・API・同意画面・クライアント ID)
2. 🧑→🤖 クライアント ID をチャットに貼る
3. 🤖 Story 3.1 実装(接続フロー + `oauth-exchange` + DB マイグレーション)
4. 🧑 Phase C-3(Supabase 管理画面に関数シークレット3つ)
5. 🤖 Phase C-2 / C-4(`db push` + 関数デプロイ)
6. 🧑 Phase C-5(`.env.local` に client ID を足す)
7. 実アプリで「Google を接続」→ 動作確認 → Story 3.1 レビュー・マージ
8. 🤖 Story 3.2 → 3.3 → 3.4 と続ける

> Phase B が終わって「動作確認できる状態」になってから実装に入る。
> そこまでは、7 の動作確認以外はコードを書いても検証できないため。
