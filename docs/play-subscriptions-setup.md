# Play Console: サブスクリプション作成と RevenueCat 連携の手順(2026-10-02)

> 2026-10-03更新: 販売アカウント登録済み。署名済み1.0.21／22をAlphaへ未公開保存済み（審査提出・配信なし）。下記2商品は日本向け月額300円／1,000円、基本プラン `monthly` で作成・有効化済み。RevenueCatのGoogle認証3項目は成功、Playのテスト通知も受信済み。実機の購入・復元等は未検証。最新結果は [検証記録](paid-features-verification-20261003.md) を参照。以下の手順と付録は作成時点の履歴を含む。

RevenueCat 側(プロジェクト・Android アプリ・Entitlement・商品・Offering・Webhook)は設定済み。
この手順書は、**ユーザー本人が Play Console / Google Cloud で行う作業**。ID は RevenueCat 側と**完全一致**させる。

## 0. 前提(先に必要なもの)

1. **課金ライブラリを含むビルドを Play Console にアップロード済みであること**
   Play Console は、課金権限(`com.android.vending.BILLING`)を含むビルドが一度もアップロードされていないアプリでは、
   定期購入の作成を受け付けない場合がある(画面に案内が出る。**未検証**: 実画面で確認すること)。
   現在 Play にあるビルド(Alpha 21 まで)は RevenueCat SDK を含まないため、`npx cap sync android` 後のビルド
   (`@revenuecat/purchases-capacitor` 入り)を内部テスト等のトラックへアップロードしておく。
   マージ後マニフェストに `BILLING` 権限が入っているかは未確認(`docs/revenuecat-client.md` 参照)。
2. 支払いプロファイル(販売者アカウント)が設定済みであること(未設定だと有料商品を作れない)。

## 1. 定期購入を2つ作る(Play Console → アプリ → 収益化 → 商品 → 定期購入)

| 項目 | 予定反映 | 複数アカウント |
|---|---|---|
| 商品 ID(作成後は変更不可) | `calendar_write_monthly` | `multi_account_monthly` |
| 名前 | 予定反映 | 複数アカウント |
| 基本プラン ID | `monthly` | `monthly` |
| 種類 | 自動更新 | 自動更新 |
| 請求期間 | 1か月 | 1か月 |
| 価格(日本・円) | ¥300 | ¥1,000 |

- 基本プランは作成後に**有効化**する(下書きのままだと購入できない)。
- 価格は日本を設定すれば他の国は自動換算の既定値になる。海外向け価格を別に決めるなら各国で調整する(税込み/税別の扱いは Play の表示に従う)。
- `multi_account` は `calendar_write` を内包する(アプリ側が判定)。Play 側で両者を同一商品にはしない。
- 同じ Google アカウントが両方を契約すると二重課金になるため、アプリは `multi_account` 契約中は `calendar_write` の購入を出さない設計。

## 2. RevenueCat が購入を検証できるようにする(**これが無いと権利が付与されない**)

2026-10-03にAndroidアプリ「Multi calendar (Android)」へ専用サービスアカウントの認証JSONを登録し、有効を確認済み。3 APIも有効化済み。通知トピックは `projects/calendar-app-508202/topics/Play-Store-Notifications`。以下は設定手順の参照用。

1. Google Cloud コンソールでサービスアカウントを作成し、JSON キーを発行する(既存の Google Cloud プロジェクトでも新規でもよい。Google Play Android Developer API を有効化)。
2. Play Console → ユーザーと権限 → ユーザーを招待 → そのサービスアカウントのメールを追加し、権限
   「財務データの表示」「注文と定期購入の管理」を付与する(アプリ単位でも可)。
3. RevenueCat → Apps → Multi calendar (Android) → Service account credentials JSON にアップロードして保存。
   アップロード後に「Google developer notifications」(Pub/Sub による購入のリアルタイム通知)の接続案内が出るので、画面の手順に従う。
4. 権限の反映には時間がかかることがある(RevenueCat の案内に従う)。

JSON キーは秘密情報。リポジトリ・チャット・Obsidian に置かず、`C:\Users\Ryo\secure-keys\` など git 管理外に保管する。

## 3. 確認

- RevenueCat → Product catalog → Products で、2商品のステータスが「Could not check」から正常な状態に変わる。
- ライセンステスター(Play Console → 設定 → ライセンステスト)に自分のアカウントを登録し、内部テストのビルドで購入 →
  RevenueCat の Customers に反映 → Webhook → Supabase の `entitlements` に行が入る、までを確認する。
  テスターの購入は Sandbox 扱い(更新間隔が短縮される。具体値は Play/RevenueCat の最新ドキュメントで確認)。

## 付録: 課金入りビルド(1.0.21 / versionCode 22、2026-10-02)

- `versionCode 22` / `versionName "1.0.21"` に更新。`@revenuecat/purchases-capacitor@13.7.0` を含む。
- 未署名の検証ビルドは成功(単体テスト・lintRelease・bundleRelease)。マージ後マニフェストに `com.android.vending.BILLING` が入っていることを確認済み。
  AAB(未署名・提出不可): `%LOCALAPPDATA%\calendar-app\android-release\app\outputs\bundle\release\app-release.aab`、SHA256 `CE252A7530BD409C0D3C6898795F25A334378AE03B34FAB4EFD2F42D7EEB7A0B`。
- **署名済みAABは未作成**(提出用キーストアの情報が手元に無い)。署名はユーザー本人が管理する鍵で行う。
- ビルドの注意: `JAVA_HOME` が Android Studio の JBR のままだと Gradle が
  `Unsupported class file major version 69` で失敗した。`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot` を指定して成功。
  また `.ps1` は PowerShell 7(`pwsh`)で実行する(Windows PowerShell 5.1 は日本語を含むスクリプトを文字化けで読めない)。
- 主な未確認: `MainActivity` の `launchMode="singleTask"` が RevenueCat の要件(standard/singleTop)と食い違う。購入後にアプリが復帰しない等の症状が出ないか実機で確認する。
