# RevenueCat セットアップ手順(CAP-1 / CAP-2)

有料機能(`calendar_write` = 予定反映 / `multi_account` = 複数アカウント)の課金を RevenueCat で受け、
Webhook 経由で Supabase の `entitlements` テーブルへ反映するまでの、**ユーザーが手で行う作業**の手順書。
仕様の正本は `_bmad-output/specs/spec-paid-features/SPEC.md`。

> 実際のシークレット値・API キーはこのファイルにもリポジトリにも書かない。
> Webhook の認証文字列は Supabase の関数シークレットにだけ置く。

## 全体の流れ

```
アプリ(購入) → ストア → RevenueCat → Webhook(POST) → Edge Function revenuecat-webhook
   → rpc apply_revenuecat_entitlement → entitlements 更新 → reconcile_google_connections
```

- RevenueCat の `app_user_id` = Supabase の `auth.users.id`(UUID)。匿名ID(`$RCAnonymousID:...`)は無視される。
- DB には RevenueCat が付与した Entitlement をそのまま保存する(`multi_account` 契約でも `calendar_write` を補完しない。アプリ側で `canWrite = calendar_write || multi_account` と判定)。

## 1. RevenueCat 側の設定(ダッシュボード)

1. プロジェクトを作成する。
2. アプリを登録する(Android: パッケージ名、iOS: バンドルID)。ストアごとに公開 SDK キーが発行される(クライアント用。シークレットキーとは別物)。
3. **Entitlement を 2 つ**作る。識別子は次のとおり(綴りを変えない)。
   - `calendar_write`
   - `multi_account`
4. **商品(Product)を 2 つ × 各ストア**登録し、Entitlement に紐づける。
   - `calendar_write_monthly` → `calendar_write`(月額 ¥300 を各ストアで設定)
   - `multi_account_monthly` → `multi_account`(月額 ¥1,000 を各ストアで設定)
   - iOS は 2 商品を同一サブスクリプショングループに入れ、`multi_account_monthly` を上位にする。
5. **Offering** を作り(例: `default`)、上記 2 商品を Package として入れる。
6. Webhook を設定する(次節)。

## 2. Webhook の設定

### 2-1. 認証文字列を決めて Supabase に登録する

十分に長いランダム文字列を自分で作り(例: パスワード生成ツールで 32 文字以上)、関数シークレットへ入れる。
この作業は**ユーザー本人が実行**する(値はチャット・リポジトリに貼らない)。

```bash
supabase secrets set REVENUECAT_WEBHOOK_AUTH='<ここに作った文字列>'
```

### 2-2. RevenueCat に Webhook を登録する

ダッシュボードの Project settings → Integrations → Webhooks で追加する。

| 項目 | 値 |
|---|---|
| Webhook URL | `https://gcjcrztzjzhbcjpigdvj.functions.supabase.co/revenuecat-webhook` |
| Authorization header value | 2-1 で `supabase secrets set` に渡した文字列と**完全に同じもの** |
| Environment | 開発中は Sandbox と Production の両方(本番運用では Production のみでもよい) |

- project-ref `gcjcrztzjzhbcjpigdvj` は `supabase/migrations/20260913000100_google_sync_cron.sql` のコメントにあるもの。別プロジェクトへ向ける場合は `<project-ref>` を置き換える(URL の形は `https://<project-ref>.functions.supabase.co/revenuecat-webhook`)。
- 関数は Authorization ヘッダの値を**そのまま**シークレットと比較する(`Bearer ` を自動で付け外ししない)。`Bearer xxx` 形式にしたい場合は、シークレット側も `Bearer xxx` にする。
- RevenueCat が設定値をそのまま送るのか加工するのかは、公式ドキュメントでは明記を確認できなかった。**テスト送信(後述)で 401 が出ないことを必ず確認する**。

## 3. デプロイ(ユーザーが実行)

```bash
# DB(last_event_ms 列と 2 つの関数)
supabase db push

# 純ロジックの生成物が最新か確認
npm run sync:edge-shared

# Edge Function
supabase functions deploy revenuecat-webhook
```

- `supabase/config.toml` に `[functions.revenuecat-webhook] verify_jwt = false` を入れてあるので、CLI でのデプロイはこの設定に従って JWT 検証が外れる。
  ダッシュボード等から config.toml を使わずデプロイする場合は `--no-verify-jwt` を付ける(付け忘れると RevenueCat からのリクエストが 401 になる)。
- 他の関数(`sync-calendars` など)の `verify_jwt` は既定のまま変更していない。

## 4. 動作確認

### 4-1. 接続・認証の確認(RevenueCat の Send test event)

Webhook 設定画面の「Send test event」を押す。

- RevenueCat 側で成功(HTTP 200)と表示される → URL・認証・デプロイは OK。`TEST` は何も書かず 200 を返す。
- 失敗する場合: 401 = 認証文字列の不一致、500 = `REVENUECAT_WEBHOOK_AUTH` 未設定または関数が落ちている。Supabase ダッシュボードの Edge Functions → revenuecat-webhook → Logs を確認する(ログにユーザーID・ヘッダ値は出ない)。

### 4-2. Sandbox 購入 → `entitlements` 反映

1. テスト用ライセンステスター(Play)/ Sandbox テスター(Apple)でアプリにログインする(Supabase にログインした状態で。ゲストは購入不可)。
2. 月額商品を購入する(Sandbox の更新間隔は短縮される)。
3. Supabase の SQL Editor で確認する。

```sql
select entitlement, expires_at, product_id, store, last_event_ms, updated_at
  from public.entitlements
 where user_id = '<確認したいユーザーのUUID>';
```

   - 購入直後: 該当 Entitlement の行が作られ、`expires_at` が未来になっている。
   - 失効(Sandbox で更新が止まる / 期限切れ): `expires_at` が過去になる(行は残る。クライアントは過去の `expires_at` を無効と判定する)。
4. `multi_account` を購入した場合は `reconcile_google_connections` により、2 件目以降の Google 接続の `status` が `active` になる(失効後は `suspended` に戻る)。

```sql
select id, status from public.connections where user_id = '<UUID>' and deleted_at is null order by created_at;
```

### 4-3. Webhook が届かない / 反映されないとき

- RevenueCat ダッシュボードの Webhook 画面でイベントごとの配信結果(ステータスコード)を確認する。
- 配信が 200 以外だと RevenueCat は再送する(公式ドキュメントでは最大 5 回、5・10・20・40・80 分間隔)。
- `app_user_id` が UUID でない(未ログインで購入した等)場合は無視され 200 が返る。`entitlements` には何も入らない。

## 5. イベントごとの扱い(実装の要約)

| イベント | 扱い |
|---|---|
| INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / SUBSCRIPTION_EXTENDED / REFUND_REVERSED | `entitlement_ids` の各権利へ `expiration_at_ms` を `expires_at` として保存 |
| EXPIRATION | 行は消さず `expires_at` を過去にする |
| BILLING_ISSUE | `grace_period_expiration_at_ms` が未来ならその時刻まで維持。無ければ変更しない |
| CANCELLATION / PRODUCT_CHANGE / SUBSCRIPTION_PAUSED | 変更しない(期限までは有効。入れ替え・失効は RENEWAL / EXPIRATION が運ぶ) |
| TRANSFER | 移転元の有効な権利を移転先へコピーし、移転元を失効 |
| TEST・未知のイベント・非UUID の app_user_id | 何もせず 200 |

順序逆転対策として、`entitlements.last_event_ms`(RevenueCat の `event_timestamp_ms`)より古いイベントでは上書きしない。

## 6. 注意

- 認証文字列を変更するときは、Supabase の関数シークレットと RevenueCat の Authorization header の**両方**を同時に更新する(片方だけだと 401 になり、RevenueCat は再送を数回で諦める)。
- 漏えいが疑われる場合は、新しい文字列を作って 2 か所を更新する。
