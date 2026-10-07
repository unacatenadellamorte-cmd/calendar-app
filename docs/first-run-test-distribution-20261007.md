# 初回案内・タグスタンプのテスト配信（2026-10-07）

本人がiOSのApple送信・既存TestFlight追加と、Androidクローズドテストからの最新版ダウンロードを依頼したため続行。一般公開、端末インストール、削除・データ消去、実購入、Google認可、メール有料化は範囲外。

## iOS 1.0.24（build 28）

- 検証済み作成元：65d7285c3f88b333ade8578bb00d949bb249a74c、配布CI37558899146。
- IPA SHA-256：`2e7e3b04f3769ce1a97e7025cfb6d50b7a5936cfa39439d99fdc0db666690ac4`。
- 送信対象のrun・SHA-256・版番号を既存ios.ymlのuploadジョブへ固定。コミット4c4262c。
- [Apple送信CI37560621479](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/37560621479)成功。検証・アップロードともエラーなし。
- Delivery UUID：`5466ff7a-dfe6-4653-85ff-48014795164e`。
- App Store Connectのアップロード一覧に1.0.24（28）、2026-10-07 11:12を確認。その後「提出準備完了」になり、既存内部グループ「実機審査確認」へ追加した。同グループのビルド一覧で1.0.24（28）が「テスト中」、期限90日を確認。テスターは既存の本人1人のまま、旧27・23も削除していない。
- 既存1.0.23のApp Store審査待ち提出は取り下げず、変更していない。

## Android 1.0.24（versionCode 27）

- 配布元HEAD：4c4262c。初回案内・スタンプの実装はiOSと同じで、このコミットの変更は送信対象の固定だけ。
- 保存済みDPAPIパスワードをプロセス内で復号し、既存Multi calendarアップロード鍵を使用。秘密はログ・Gitへ保存せず、ビルド後に環境変数を除去。
- JDK21を当該プロセスだけへ指定し、既存build-release.ps1でWeb・Capacitor同期、39単体テスト、lintRelease（エラー0・既存警告43）、署名付きbundleReleaseが成功。
- AAB：`C:/Users/Ryo/AppData/Local/calendar-app/first-run-device-20261007/multi-calendar-1.0.24-27-play.aab`、13,678,783バイト。
- SHA-256：`072666f1006a0748c314dab4c7e63fc0f9a1a187b70f49ba870289719dffedaf`。
- アップロード証明書SHA-1：`F8:B5:AC:88:4A:C4:0E:5E:49:34:F9:B5:CC:4C:EE:1E:E1:A8:77:3E`。登録済み鍵と一致。
- jarsignerの検証終了コード0。自己署名・タイムスタンプなし・JAR読取順序の既知警告を区別する。
- ZIP整合性、本番Android広告、接続設定・課金公開キー、最新初回フローとスタンプ、静的キャッシュ破棄コードを確認。
- Playが27（1.0.24）として受付。既存Alphaの新リリース8「1.0.24 初回案内・タグスタンプ（27）」に27のみを含め、26は含めない。
- デバイス対応の増減は0。警告は難読化解除ファイルなし1件のみ（minifyEnabled false）。
- Alpha既存テスター・日本のみの地域・公開管理オフを維持し、100%を指定。これはクローズドテスト対象内の割合で一般公開ではない。
- 公開の概要の未送信変更がこのAlpha更新1件のみと確認して審査送信。画面「審査中の変更」、自動クイックチェック後に送信される状態を確認。
- 現行26は公開済み。27はまだGoogle承認待ちで、最新27のダウンロード可能状態は未確認。承認後にテスターへ自動公開される設定。
- 既存の選択済み初期テストリストに、本人指定una.catena.della.morte@gmail.comが含まれることを読み取り確認。リスト、参加者、別途ライセンステスター設定は変更していない。
- [テスト参加](https://play.google.com/apps/testing/jp.ryo.multicalendar)と[Playのアプリページ](https://play.google.com/store/apps/details?id=jp.ryo.multicalendar)を既存テスター画面で確認。審査待ちの現時点でリンクから27が入るとは断定しない。

## 証跡

- `C:/Users/Ryo/OneDrive/デスクトップ/AI作業場/出力画像/20261007_apple-testflight-build28-testing.png`
- `C:/Users/Ryo/OneDrive/デスクトップ/AI作業場/出力画像/20261007_google-play-code27-submitted.png`

成果物の作成・本番スタンプDBの確認は[first-run-device-build-20261007.md](first-run-device-build-20261007.md)。端末の更新成功や実購入成功とは区別する。
