# Android・iOSバナー広告の設定

2026-09-29更新。Android・iOSに対応。Webでは広告APIを呼ばない。

## 開発用

既定はGoogle公式のテストApp IDとアダプティブバナーID。`npm run build`、`npx cap sync android`、Androidビルドの順に実行する。カレンダー画面の年・月・日・リスト切替と年月見出しの間に専用枠を置く。その他の画面・オンボーディング・入力シート・キーボード表示中には出さない。シークレットのロック状態は配信条件に使用しない。

UMPの`canRequestAds`が真になるまで広告SDK初期化と配信を待つ。必要なら同意フォームを表示する。同意の選択はUMPがSDKに保存する信号へ委ね、拒否を`npa`で迂回しない。プライバシー選択肢が必要な利用者には設定画面の「広告のプライバシー設定」を表示する。

## 本番への切替

`.env.local`またはビルド環境に以下を設定して再ビルド・同期する。

```dotenv
VITE_ADMOB_MODE=production
ADMOB_ANDROID_APP_ID=発行されたAndroidアプリID
VITE_ADMOB_ANDROID_BANNER_ID=発行されたバナー広告ユニットID
VITE_PRIVACY_POLICY_URL=公開したHTTPSポリシーのURL
```

これらは公開識別子。アカウントの秘密鍵は入れない。Viteが検証した設定を`admob-config.json`に出力し、AndroidManifestも同じファイルのApp IDを使う。本番モードでのテストID、ポリシー未設定、テスト地域指定はビルドエラーとなる。署名提出スクリプトは本番モード必須。

AdMobのアプリ登録、バナーユニット作成、UMP同意メッセージ公開、公開ポリシー用意、Google Playの広告有無・データセーフティ申告は本人の管理画面で行う。今回の実装だけで本番配信や審査提出は完了していない。

## EEAの動作確認

テストモードで自分のApp IDに公開したUMPメッセージを使い、`VITE_ADMOB_DEBUG_EEA=true`と`VITE_ADMOB_TEST_DEVICE_IDS`（カンマ区切り）を指定する。許可・拒否・設定画面からの再選択を確認する。既定テストApp IDでは本人のメッセージ設定を検証したことにはならない。

## 根拠

- [プラグインの同意API](https://github.com/capacitor-community/admob/blob/main/docs/consent.md)
- [Google公式テスト広告ID](https://developers.google.com/admob/android/test-ads)
- [Google UMP](https://developers.google.com/admob/android/privacy)
- [Google Playデータ開示](https://developers.google.com/admob/android/privacy/play-data-disclosure)

依存は`@capacitor-community/admob` 8.1.0、Android Mobile Ads 25.4.0、UMP 4.0.0。配布版と導入したAndroidソースが一致することを確認済み。


## カレンダー上部の配置（2026-09-29）

Android・iOSとも、SDKから通知されたアダプティブバナーの高さを専用DOM枠に反映してから表示する。広告の上下には8pxずつ間隔を取り、操作との接触を避ける。この間隔も広告なしの場合は0。Webには枠も余白も作らない。安全領域はCapacitorの親padding/CSSで反映済みなので、DOMの`getBoundingClientRect()`座標をそのまま使い、ネイティブでInsetsを加算しない。

スクロールでは`updateBannerPlacement`で座標と可視性だけを変え、広告を取り直さない。枠の一部でも画面外、本文のクリップ範囲外、下タブに重なる場合は隠す。非表示中は既存の枠高さを保ってスクロールの飛びを防ぐ。幅が変わった場合のみ旧バナーの破棄完了を待ち、新しい幅でアダプティブバナーを作る。広告なし・同意不可・読込失敗時は高さ0。通信復旧・アプリ復帰で再試行できる。

### プラグインの局所パッチ

`@capacitor-community/admob`は8.1.0に固定。`npm install` / `npm ci`の`postinstall`で`node scripts/android/patch-admob.mjs`を実行する。インストールスクリプトを省略した環境は`npm run patch:admob`を同期前に実行する。

`scripts/android/admob-8.1.0/`に改変Javaソース、元ソースと改変後のSHA-256、元のMITライセンスを保持する。元はnpm配布の8.1.0の`android/src/main/java/com/getcapacitor/community/admob/`。バージョンまたはソースが異なれば失敗する。適用済みの再実行は変更しない。更新時は対象版のコードを読み直してハッシュとパッチを更新する。

主な修正は、Android 15以降でCapacitorの安全領域処理と衝突する`decorView.setOnApplyWindowInsetsListener`の除去、UIスレッドでの生成と破棄完了の保証、位置のみを変更するメソッド、枠確保前の非表示、旧リクエストのイベントを無視する識別子。UMPと広告リクエストの同意信号は維持する。

### 30秒更新

30秒更新はAdMob管理画面の当該バナー広告ユニットで、自動更新をカスタム30秒に設定する。アプリには30秒タイマーを追加しない。表示中の広告更新はGoogle Mobile Ads SDK/AdMobに任せる。管理画面で保存された値とPlayクローズドテストの配信結果は、作業記録で別途確認する。


## iOS（2026-09-29）

iOSビルドは `VITE_ADMOB_PLATFORM=ios` と `VITE_ADMOB_MODE=test` を設定して `npm run build`、`npx cap sync ios` の順で実行する。CI成果物はGoogle公式のiOSテスト広告を使用する。Android用IDとの混同を防ぐため、別プラットフォームのWebビルドを同期するとエラーになる。

本番へ切り替える場合は次の公開識別子を使う。署名・ストア掲載・広告アプリの審査は別工程。

```dotenv
VITE_ADMOB_PLATFORM=ios
VITE_ADMOB_MODE=production
ADMOB_IOS_APP_ID=ca-app-pub-6637259241720689~7851847460
VITE_ADMOB_IOS_BANNER_ID=ca-app-pub-6637259241720689/2724567304
VITE_PRIVACY_POLICY_URL=https://unacatenadellamorte-cmd.github.io/calendar-app/privacy-policy.html
```

iOSのバナーユニットはAdMob側でカスタム30秒更新を設定済み。既存の欧州向けUMPメッセージへiOSアプリを追加し、Android/iOSの2アプリ対象で公開済み。広告IDは秘密情報ではない。Swiftパッチは `scripts/ios/admob-8.1.0/` に保持し、Androidと同様に元ソース・置換ソースのSHAを検証してpostinstallで適用する。AdMobのSwift Package依存を含め、実コンパイルはmacOS CIで確認する。

`capacitor:sync:after` はiOS向け設定とコピー済みWeb資産の一致を検査し、Info.plistのApp ID・SKAdNetworkItems・遅延計測初期化を同期する。Android同期では実行をスキップする。広告位置はWebView座標を親ビューへ変換し、安全領域を重複加算しない。UMPで配信可否を判定し、ATTの自動要求は行わない。

- [iOSアダプティブバナー](https://developers.google.com/admob/ios/banner)
- [iOS SDK初期設定](https://developers.google.com/admob/ios/quick-start)
