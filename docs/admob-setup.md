# Androidバナー広告の設定

2026-09-23。Androidのみ実装。WebとiOSでは広告APIを呼ばない。

## 開発用

既定はGoogle公式のテストApp IDとアダプティブバナーID。`npm run build`、`npx cap sync android`、Androidビルドの順に実行する。下タブがある通常画面で表示し、オンボーディング・入力シート・キーボード表示中には出さない。シークレットのロック状態は配信条件に使用しない。

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
