# RevenueCat クライアント(Capacitor)組み込みメモ

SPEC `_bmad-output/specs/spec-paid-features/SPEC.md` の CAP-1 / CAP-5 のクライアント側。
ダッシュボード・Webhook・商品登録の手順は別文書 `docs/revenuecat-setup.md` を参照(この文書では扱わない)。

## 1. 構成

| 役割 | ファイル |
| --- | --- |
| SDK ラッパ(Result 型。configure / logIn / logOut / 価格 / 購入 / 復元 / 管理URL) | `src/data/purchases.ts` |
| 認証状態に RevenueCat を合わせる(表示なし) | `src/app/PurchasesSync.tsx`(`src/main.tsx` で `AuthProvider` 配下に配置) |
| 購入フック(価格・購入・復元・管理・反映待ちポーリング) | `src/features/billing/model/usePurchase.ts` |
| 権利判定(DB の `entitlements` が正。`refresh()` で再取得) | `src/features/billing/model/useEntitlements.ts` |
| プラン案内シート / 設定画面「プラン」欄 | `src/features/billing/ui/PlanSheet.tsx` / `PlanSection.tsx` |

- 使うパッケージ: `@revenuecat/purchases-capacitor@13.7.0`(`package.json` は固定版)。peer 依存は `@capacitor/core >=8.0.0`(本リポジトリは `^8.5.1`)。
- **有効になる条件**: Capacitor のプラットフォームが `android` / `ios` で、かつ公開 SDK キーが設定されていること。
  - `VITE_REVENUECAT_ANDROID_KEY` / `VITE_REVENUECAT_IOS_KEY`(`env.example` 参照)。**公開 SDK キー**であり secret key ではない。
  - Web・キー未設定では SDK を一切呼ばず、UI は従来どおり「準備中」。
- `appUserID` は Supabase の `auth.users.id`。メールログイン済み(`authenticated`)のときだけ `configure` / `logIn` する。ゲスト(匿名)・ログアウトでは `logOut` し、**ゲストは購入不可**(ログインの案内を出す)。
- 権利の真実の源は **サーバー**(RevenueCat → Webhook → `entitlements`)。クライアントの `customerInfo` は「購入が通ったか」「購読があるか(復元・管理URL)」の補助だけに使い、権利判定には使わない。購入成功後は `entitlements` を **2秒間隔で最大10回** 再取得し(「反映中…」)、間に合わなければ「反映に時間がかかっています。しばらくしてから「購入を復元」をお試しください」を出す。

## 2. ネイティブ側の手作業(`npx cap sync` の前後)

この作業では `npx cap sync` / Gradle / Xcode ビルドは実行していない。以下は **未実施**。

### 共通
1. `.env.local` に公開 SDK キーを入れる(値は RevenueCat ダッシュボードの Project Settings > API keys > App specific keys。リポジトリには書かない)。
2. Web ビルド後に `npx cap sync`(プロジェクトの既存手順に従う。`npm run build` → `cap sync`)。

### Android
- **`launchMode`(要判断・公式で確認済みの要件)**: RevenueCat の Capacitor インストール手順(<https://www.revenuecat.com/docs/getting-started/installation/capacitor>)は、Activity の `launchMode` を `standard` または `singleTop` にするよう求めている(そうしないと、銀行アプリ等でバックグラウンドへ移ったときに購入がキャンセルされることがある)。
  現在の `android/app/src/main/AndroidManifest.xml` の MainActivity は **`android:launchMode="singleTask"`**(Capacitor の既定)。変更する場合は、Google OAuth のコールバック(カスタムスキーム/App Links)や `DeepLinkListener` の挙動に影響しないかを実機で確認すること。**今回は変更していない**。
- **Billing 権限(未確認)**: `com.android.vending.BILLING` 権限は、RevenueCat の React Native / Cordova の手順では AndroidManifest への記載が案内されている。Capacitor の手順ページには記載がなく、プラグイン本体の `android/src/main/AndroidManifest.xml` は空だった。Android SDK 側がマージするのかは **確認できていない**。`cap sync` 後のビルドで、マージ後の AndroidManifest(`app/build/intermediates/merged_manifests/...`)に `com.android.vending.BILLING` が入っているかを確認し、無ければ `android/app/src/main/AndroidManifest.xml` に `<uses-permission android:name="com.android.vending.BILLING" />` を追加する。
- Play Console 側: 定期購入商品 `calendar_write_monthly` / `multi_account_monthly` の作成、RevenueCat との連携(サービスアカウント等)は `docs/revenuecat-setup.md` / ユーザー作業。
- 商品IDの形(未確認): Android の StoreProduct.identifier が `商品ID` か `商品ID:ベースプランID` かは型定義から確認できていない。`purchases.ts` は両方(`id` と `id:...` の前方一致)に対応している。

### iOS
- **In-App Purchase capability を有効化**(Xcode: Project Target > Signing & Capabilities。RevenueCat の Capacitor 手順に記載)。
- `SWIFT_LANGUAGE_VERSION` が 5.0 以上(同手順に記載)。現在の `ios/App/App.xcodeproj` は `SWIFT_VERSION = 5.0`、`IPHONEOS_DEPLOYMENT_TARGET = 15.0`(プラグインの `Package.swift` は `.iOS(.v15)`)。
- StoreKit 2 を使う場合は、App Store Connect の In-App Purchase Key を RevenueCat に登録する必要がある(`PurchasesConfiguration` の型定義コメントによる。詳細はダッシュボード側の手順)。
- App Store Connect: `calendar_write_monthly` と `multi_account_monthly` を **同一サブスクリプショングループ** に入れ、`multi_account_monthly` を上位にする(SPEC CAP-1)。

### cap sync 後の確認項目
- [ ] `android/capacitor.settings.gradle` / iOS の依存に `purchases-capacitor` が加わっている
- [ ] Android: マージ後マニフェストの BILLING 権限、`launchMode` の判断結果
- [ ] iOS: In-App Purchase capability、ビルドが通る
- [ ] 起動時に `configure` が1回だけ走る(RevenueCat のデバッグログ。ログレベル設定 API は `setLogLevel`)
- [ ] 本番ビルドに **Test Store の API キーを入れていない**(RevenueCat は「Test Store のキーでストアへ提出しない」よう注意している: <https://www.revenuecat.com/docs/getting-started/configuring-sdk>)

## 3. Sandbox / ライセンステスターでの購入テスト

公式(<https://www.revenuecat.com/docs/test-and-launch/sandbox>)で確認できた範囲:
- RevenueCat のテスト環境は **Test Store**(プラットフォーム設定不要)と **各ストアの Sandbox** の2系統。開発中は Test Store、リリース前に各ストアの Sandbox で通しの確認、本番はプラットフォーム別キー、という順序が推奨されている。
- Sandbox ではストアが返す価格・名称・説明が不正確なことがあるため、**メタデータの確認ではなく購入フローの確認**に使う。
- ダッシュボードの「Sandbox data」切替で Sandbox の購入を本番と分けて見られる。

Apple の Sandbox テスター、Google Play のライセンステスター、テスト用カード、内部テスト版の要件、更新の加速などの**具体的な設定手順は、今回取得した RevenueCat のページでは確認できていない**。各ストアの公式ドキュメントで確認してから行うこと(推測で手順を書かない)。

### 確認シナリオ(実機・未実施)
1. メールでログインし、設定 > プラン を開く。価格がストア表示(「仮の表示」の注記なし)になる。
2. 「予定反映」を購入 → 「反映中…」→ Webhook 到達後に「購入が反映されました。」。設定の「現在のプラン」が「予定反映」になる。
3. 購入ダイアログを閉じる(キャンセル) → 何も表示されず元の状態に戻る。
4. アプリを入れ直す/別端末で「購入を復元」→ 反映される。
5. 「予定反映」契約中に「複数アカウント」へ変更 → 旧契約の扱いの案内が出て、ストアの確認画面が出る。変更後、`entitlements` に `multi_account` が入る。旧契約の扱い(Android は oldProductID を渡した置き換え、iOS は同一グループのアップグレード)を RevenueCat ダッシュボードとストアで確認する。
6. 「複数アカウント」契約中は「予定反映」の購入ボタンが出ず「複数アカウントプランに含まれています」が出る。
7. ゲスト(お試しモード)ではログインの案内が出て購入できない。ログアウト→別ユーザーでログインして、RevenueCat 側の App User ID が切り替わる(`logOut` / `logIn`)。
8. 「購読を管理」でストアの購読管理ページが開く(`customerInfo.managementURL`。有効な購読が無いと null)。

## 4. 公式ドキュメント・型定義の根拠

- インストール手順(Capacitor): <https://www.revenuecat.com/docs/getting-started/installation/capacitor>(`configure` の引数 `apiKey` / `appUserID`、Android の `launchMode`、iOS の In-App Purchase capability / Swift 5)
- SDK の設定: <https://www.revenuecat.com/docs/getting-started/configuring-sdk>(公開 SDK キーのみ使う、`appUserID` は null 可、configure は1回)
- 購読の変更・管理: <https://www.revenuecat.com/docs/subscription-guidance/managing-subscriptions>(Google Play の別商品への変更は oldProductID が必須で、置き換えモード既定は WITHOUT_PRORATION、旧購読は置き換えでキャンセルされる / iOS はサブスクリプショングループ内のアップグレード / `managementURL` でストアの購読管理へ)
- 型定義(インストール後に確認): `node_modules/@revenuecat/purchases-capacitor/dist/esm/definitions.d.ts`
  (`configure` / `logIn({appUserID})` / `logOut()` / `getOfferings()` / `purchasePackage({aPackage, storeProductChangeInfo})` / `restorePurchases()` / `getCustomerInfo()`)、
  `node_modules/@revenuecat/purchases-typescript-internal-esm/dist/`(`PurchasesError.code`、`PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR = "1"`・`NETWORK_ERROR = "10"`・`PAYMENT_PENDING_ERROR = "20"`、`PurchasesStoreProduct.priceString`、`CustomerInfo.managementURL: string | null`、`activeSubscriptions`)。
- 購入キャンセルの判定: `error.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`(`userCancelled` は型定義で deprecated だが、念のため併用)。
- Web プラットフォーム: プラグインの `dist/esm/web.js` はモック実装(`getOfferings` は空、`purchasePackage` 等は mock 有効時のみ値を返す。`web.js` 内のエラーメッセージは 'Web not supported in this plugin.')。**Web での公式な動作保証は確認できていない**ため、本アプリでは Web では SDK を一切呼ばない。

## 5. 未確認・要判断

2026-10-03追記: BILLING権限のマージ、AndroidのsingleTop化、iOSのRevenueCatプラグイン・SPM依存・In-App Purchase設定を確認済み。Google Playの2商品も作成・有効化済み。下記の対応項目は過去時点の記録で、実機購入とディープリンクは引き続き未検証。最新結果は [検証記録](paid-features-verification-20261003.md) を参照。
- Android の BILLING 権限が自動でマージされるか(上記)。
- Android の `launchMode="singleTask"` を変えるべきか(公式は standard / singleTop を要求。OAuth・ディープリンクとの兼ね合いは実機確認)。
- Android の StoreProduct.identifier の形式(`商品ID` か `商品ID:ベースプランID` か)。CustomerInfo の `activeSubscriptions` の形式も同様に未確認(旧商品IDはその値をそのまま渡している)。
- Android のプラン変更で置き換えモードを指定していない(RevenueCat 既定の WITHOUT_PRORATION)。課金タイミング(旧契約の満了日に新価格)が意図どおりかは要判断。
- 利用規約(Terms)の公開URLはリポジトリ内に見つからなかったため、リンクを作っていない。プライバシーポリシーは既存の `VITE_PRIVACY_POLICY_URL`(`platform/ads.ts` の `privacyPolicyUrl`)が設定されているときだけ PlanSheet に出る。
