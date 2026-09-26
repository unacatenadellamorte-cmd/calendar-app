# Android Google認可修正の検証記録

2026-09-26。仕様: `spec-android-google-oauth-review-20260926.md`。基点: `2a39f6854e45abbce66741cdcc5d34bb6188aa72`。

## 実装とレビュー

- Androidは公式AuthorizationClientからサーバー用認可コードを取得する。既存の読み取り専用2スコープを維持し、取消・権限不足・コード欠落を拒否する。
- 開始時のアプリ利用者を固定し、交換直前に同一利用者と確認した最新JWTを明示指定する。ログアウト・利用者変更・多重起動・画面離脱後の遷移を防ぐ。
- サーバーはJWTとexpectedUserIdを照合してから既存Vault保存RPCを使う。送信済み処理は開始時本人へ保存されることがあるが、別利用者へは保存しない。
- Webのstate検証と戻り先、既存削除の競合保護、DB構造を維持する。
- 独立レビューで画面離脱・JWT更新・ネイティブ取消の検証不足を修正。既存Web側の追加検証と失敗後Google認可の扱いは別課題へ記録。

## 最終ローカル検証

- 型検査、変更対象ESLint、Webビルド、Capacitor同期: 成功。
- Vitest: 128ファイル・1,087件成功。非同期UIテストに既存のact警告あり。
- JDK21でtestDebugUnitTest、lintRelease、bundleRelease、assembleRelease: 成功。Android単体36件、失敗0件。
- ネイティブ取消テストは実プラグインのpending解除・再試行を検証。Google通信やOS画面の代替ではない。
- 本番環境変数と既存アップロードキーで署名した18 (1.0.17)を作成。jarsigner検証完了。自己署名・タイムスタンプなし・ZIPストリーム順序の警告あり。Google Playのアップロード受付も確認。
- AAB: `C:/Users/Ryo/AppData/Local/calendar-app/oauth-review-fix-20260926/android/app/build/outputs/bundle/release/app-release.aab`
- SHA256: `5ED4226388C7C651A146B55D567AE33B5DA286A185F90B8E9CB1738ED86CF7F0`
- APK: 同作業場所の`android/app/build/outputs/apk/release/app-release.apk`。
- 実機のインストール・アンインストール・データ消去・connected系テストは行っていない。

## 外部設定・配信

- ユーザー承認後、Cloud calendar-app-508202でjp.ryo.multicalendarのAndroid OAuthクライアント4件を登録。Play署名の既存・hybrid classical・PQCの3証明書とローカル提出署名だけに限定。
- SHA-1: `AF1B56B26CD8FBAE012ECC0BDB7779389F8BE9E6`、`C34BE75AEF33CC7257CCC66B401A6745896B3C98`、`BE85FF4F59E5CFFD1C9C8543BA238D6233D6E77A`、`F8B5AC884AC40E5E4934F9B5CC4CEE1EE1A8773E`。
- 審査専用GoogleアカウントをOAuthテストユーザーへ追加・保存。Google OAuthはテスト中のまま。
- Supabase gcjcrztzjzhbcjpigdvjへAPP_ORIGINS=https://localhostを追加し、oauth-exchange・google-calendars・sync-calendarsを配信。
- 3関数のOPTIONSでAndroidオリジンと既存Webオリジンの許可、無関係なオリジンへの許可ヘッダー不付与を計9条件確認。
- Play Alphaに日本・2名のテスター候補リスト・フィードバックメールを保存。登録は実際のテスト参加を意味しない。
- Alphaリリース18をアップロード・レビュー・保存。「変更を保存しました。審査のためにGoogleに送信するには公開の概要に移動してください」を確認。
- 警告は難読化解除ファイルなしの1件。minifyEnabled falseのため難読化マッピングは生成していない。

## 残る受入条件

Windows画面操作の接続が利用できず、所定の再接続でも復旧しなかった。エミュレーター上で専用Googleアカウントの認可→カレンダー選択→取り込みは未実行。署名済みAPKの端末確認とPlay配信条件の確認が残る。自動テストや設定登録だけで実Google連携の成功とは扱わない。

**審査送信は未実施。実Google連携の受入確認後に続ける。**

## 追記：実機確認と審査送信
2026-09-26、既存開発用署名で上書きした修正版18について、ユーザーがGoogle接続・取り込み成功を報告した。開発用署名のAndroid OAuthクライアントもユーザー承認後に追加済み。Play配信署名での実行は未検証として残す。15:06 JST、Alpha版18を含む14件の変更をGoogleへ送信し、Play Consoleの「変更内容は現在審査中です」を確認した。以前の「未送信」はこの追記で更新される。
