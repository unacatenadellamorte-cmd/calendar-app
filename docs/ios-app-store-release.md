# iOS App Store用のビルドと登録

この経路は配布署名されたIPAの生成までを行う。App Storeへのアップロード・審査提出は行わない。未署名検証と既存の `build:ios:device` は引き続きテスト広告を使う。

## 識別子と認可

- 主アプリ: `jp.ryo.multicalendar`
- Widget: `jp.ryo.multicalendar.FeaturedEventsWidget`
- 両方のApp Group: `group.jp.ryo.multicalendar.widget`
- 既存Deep Link: `calendar-app://` を保持する。
- 主認証: Supabase。Googleはカレンダー接続専用。

Google iOS SDK 9.2.0をXcodeプロジェクトの直接SPM依存として固定した。Capacitor管理の `CapApp-SPM/Package.swift` には追加していない。`scripts/ios/add-widget-target.rb` はSDK、プラグインのSwiftファイル、両ターゲットのPrivacyInfo、Widget埋込みを冪等に設定する。`cap sync ios` の後に実行する。

iOSは `ASWebAuthenticationSession` を使う公式SDKの対話認可へ進む。WebViewをGoogleログイン画面へ遷移させない。SDKが返した一度限りの `serverAuthCode` と許可scopeだけをJSへ返し、認可開始時と同じSupabase利用者の交換直前のJWTで `oauth-exchange` を呼ぶ。成功・取消の後はSDKのローカルサインイン状態を消す。Googleのアクセストークン・更新トークン・IDトークンをJSへ返さない。

追加で要求するカレンダーscopeは既存の2種類だけ。

- `https://www.googleapis.com/auth/calendar.calendarlist.readonly`
- `https://www.googleapis.com/auth/calendar.events.readonly`

公式SDK標準の基本プロフィールscopeはSDK自身が付ける。GoogleアカウントをSupabaseの主認証へ置き換える実装ではない。クライアントとEdge Functionの両方でカレンダーscope不足を拒否し、匿名・取消・交換前の利用者切替では保存リクエストを送らない。Webの既存認可方式は保持している。

## メイン担当者が行う外部設定

1. 同じGoogle CloudプロジェクトでCalendar APIを有効にし、OAuth同意画面と上記読取りscopeの公開状態・必要な審査を確認する。
2. iOS種類のOAuthクライアントを作り、Bundle IDを主アプリIDに一致させる。iOSクライアントIDとその逆順URLスキームを用意する。
3. サーバー認可コード交換には既存Web種類クライアントを使う。`GOOGLE_SERVER_CLIENT_ID`、`VITE_GOOGLE_OAUTH_CLIENT_ID`、Edge Functionの `GOOGLE_OAUTH_CLIENT_ID` を一致させる。Webクライアントの秘密はEdge Functionだけに保存する。
4. Supabaseの `APP_ORIGINS` に `capacitor://localhost` を追加する。既存Webの `APP_ORIGIN` とAndroidの `https://localhost` を削除しない。変更した `oauth-exchange` のデプロイもメインが行う。
5. Apple側で主AppとWidgetそれぞれの明示的App IDに同じApp Groupを割り当て、同一Team・同一Apple Distribution証明書を含むApp Store配布プロファイルを2枚発行する。

## GitHub Environmentの設定

Environment名は `ios-app-store`。公開設定は以下のVariablesへ登録する。値はリポジトリへ書かない。

|Variable|内容|
|---|---|
|`VITE_SUPABASE_URL`|本番SupabaseのHTTPSルートURL|
|`VITE_SUPABASE_ANON_KEY`|anonまたはpublishable公開キー。管理者キー不可|
|`VITE_GOOGLE_OAUTH_CLIENT_ID`|既存Web種類のOAuthクライアントID|
|`GOOGLE_IOS_CLIENT_ID`|主App用のiOS OAuthクライアントID|
|`GOOGLE_IOS_REVERSED_CLIENT_ID`|iOSクライアントIDのドット区切りを逆順にしたURLスキーム|
|`ADMOB_IOS_APP_ID`|本番iOS AdMobアプリID|
|`VITE_ADMOB_IOS_BANNER_ID`|本番iOSバナー広告ユニットID|
|`VITE_PRIVACY_POLICY_URL`|公開済みプライバシーポリシーのHTTPS URL|
|`APPLE_TEAM_ID`|配布証明書と両プロファイルのTeam ID|

CIは `GOOGLE_SERVER_CLIENT_ID` に `VITE_GOOGLE_OAUTH_CLIENT_ID` を設定する。`VITE_ADMOB_PLATFORM=ios`、`VITE_ADMOB_MODE=production` はworkflowで固定する。ローカル公開Webビルドでは `.env.local` の `GOOGLE_SERVER_CLIENT_ID` も同値にする。Webビルドスクリプトは `.env.local` を読むが、Rubyを直接実行する場合はGoogle設定3項目をそのプロセスの環境変数へ渡す必要がある。

以下のSecretsを登録する。秘密の登録・共有先はメイン担当者が確認してから行う。

|Secret|内容|
|---|---|
|`IOS_DISTRIBUTION_P12_BASE64`|秘密鍵付きApple Distribution証明書のp12をbase64化した値|
|`IOS_DISTRIBUTION_P12_PASSWORD`|p12のパスワード（空値不可）|
|`IOS_APP_PROFILE_BASE64`|主AppのApp Store配布プロファイルをbase64化した値|
|`IOS_WIDGET_PROFILE_BASE64`|WidgetのApp Store配布プロファイルをbase64化した値|

Environmentを公開ビルド対象のブランチへ限定する。通常のpush・PR検証はこのEnvironmentと署名秘密を使わない。

## 起動と検証

既存の `iOSビルド検証` (`ios.yml`) を手動起動し、`release=true`、`version`、`build` を渡すと、同じファイル内の環境付き配布jobを実行する。通常の未署名web/iosジョブはその呼出しでは実行しない。既定の `release=false` とpush/PRでは従来の未署名検証を実行する。初回CIで再利用workflow内のenvironment秘密を受け取れなかったため、既存workflowにも同じ配布jobを直接定義している。新workflowの既定ブランチへの先行登録は不要。`ios-release.yml` 自身からの手動起動にも対応する。

`version` は `1.0.20` のような整数3区切り、`build` は1〜9桁の正の整数。ストアで既に使った番号の自動照合は行わないため、担当者が未使用の番号を指定する。

公開CIはmacos-15 / Xcode 26.3を固定し、次の順に検証する。

1. 公開設定と手動入力、署名秘密の存在を検証する。設定不足やテスト広告・管理者キー・不明な `VITE_` 設定があれば中断する。
2. 型検査・lint・認可/公開設定/署名条件テスト、本番Webビルド、Supabaseメール認証の読取り接続確認を行う。
3. Capacitor同期、ネイティブ構成の冪等生成テスト、実Google認可プラグインの状態テスト、Swiftデータ契約テストを行う。
4. 一時keychainへp12を入れる。両プロファイルのTeam・Bundle ID・App Group・作成日/有効期限・App Store配布条件を検査し、両方に含まれる有効なApple Distribution証明書を選ぶ。
5. 主App/WidgetのRelease構成に個別プロファイルを割り当て、manual署名でarchiveを作り、App Store Connect向けIPAを書き出す。Xcode失敗時は、署名秘密を環境変数から除去したうえで、値を伏せた診断の末尾だけを残す。securityコマンドの引数・出力は表示しない。
6. archiveとIPAの両方で署名・証明書・同梱プロファイル・Team/Bundle/App Group・version/build・PrivacyInfoを再検証する。Googleの設定とURLスキーム、本番AdMobアプリIDも確認する。
7. Pythonの `finally`、シェルの `EXIT` trap、workflowの `always` で一時keychainとインストール済みプロファイルを片づける。

アーティファクトは検証済み `Multi-calendar.ipa` と、クラッシュ解析用の `Multi-calendar-dSYMs.zip`。両方を7日間保存する。p12、keychain、元プロファイル、`.env`、署名作業ディレクトリ、archive全体はアップロードしない。IPA内部の `embedded.mobileprovision` はAppleの配布形式に必要な署名構成物なので含む。生の署名素材ファイルと区別して検査する。CIは提出・アップロードを実行しない。

ローカルでの公開Web検証は `IOS_RELEASE_VERSION` / `IOS_RELEASE_BUILD` を設定して `npm run build:ios:release`。端末検証用は従来どおり `npm run build:ios:device` を使い、テスト広告を維持する。

## PrivacyInfoと確認の限界

主AppはWidget Bridgeから、Widgetはモデル読取りから同一App GroupのUserDefaultsを使うため、両ターゲットの `PrivacyInfo.xcprivacy` に `NSPrivacyAccessedAPICategoryUserDefaults` / `1C8F.1` を宣言し、各Resourcesフェーズへ登録した。これはRequired Reason APIの宣言であり、App Store Connect上のプライバシー回答を自動で完成させるものではない。SDK付属のManifestはSPMで解決されたSDK側に依存する。

Windowsで実施済み: 本番Webビルド、型検査、lint、認可/設定/署名条件の自動テスト、`cap sync ios` 後のSDK依存と両Manifestリソース参照の保持確認。Ruby・Swift・Xcode・実際の配布署名と実機のGoogle認可はmacOS CI/端末での確認が必要。iOSの認可成功・取消・部分許可・利用者切替・再接続、既存Deep Link、終日予定、広告、Widgetを実機で確認する。

## 公式根拠（2026-09-30確認）

- [Google iOSのバックエンドAPI認可](https://developers.google.com/identity/sign-in/ios/offline-access?hl=en): `serverAuthCode` とサーバー交換。
- [Google iOS SDKの導入とクライアント設定](https://developers.google.com/identity/sign-in/ios/start-integrating): iOS用ID、Webサーバー用ID、逆順URLスキーム。
- [GIDSignIn API](https://developers.google.com/identity/sign-in/ios/reference/Classes/GIDSignIn): 対話認可、追加scope、URL処理、signOut。
- [Google iOS SDK公式リリース](https://github.com/google/GoogleSignIn-iOS/releases): 9.2.0を固定。10系の依存更新を今回の変更へ含めない。
- [AppleのRequired Reason一覧](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons): `1C8F.1` は同じApp Group内のアプリ/拡張が共有するUserDefaultsの読書き。
- [AppleのPrivacy Manifest同梱方法](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)。
- [AppleのApp Group設定](https://developer.apple.com/documentation/xcode/configuring-app-groups)。
- [Appleの公開バージョン形式](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring)と[ビルド番号形式](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion)。

## 2026-09-30の作成結果

[配布CI](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/36663107316)で `b7f3b45` から1.0.20(21)の署名済みIPAと主App/WidgetのdSYMを作成。Macのnativeテスト、archive/exportと署名検証、秘密の後片づけも成功した。これはビルド完了であり、App Storeへの送信や実機認可確認の完了ではない。
