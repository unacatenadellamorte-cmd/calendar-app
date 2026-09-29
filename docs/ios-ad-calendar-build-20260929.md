# iOSの広告・月カレンダー追加（2026-09-29）

## 実装

- 最新の共通修正（シフト翌日移動設定、シフト色継承・24色）を含む1.0.19（20）。
- 年/月/日/リスト切替と年月見出しの間にiOSアダプティブバナーを追加。入力中、画面外、ズーム中は隠す。UMP、WebViewの安全領域、アプリ復帰を扱う。
- AdMob iOSアプリ・バナーユニット作成、カスタム30秒更新を保存。既存の欧州向けUMPメッセージにiOSを追加し、両OS対象で公開済み。
- 中型・大型の月グリッドWidget。日付タップで該当日のカレンダー、＋で当日の予定追加。大型はラベル2件と残件数。既存の予定一覧Widgetも保持。
- 時刻付き予定は現在のタイムゾーンへ変換し、終日は保存日付を使用。secret予定と非表示カレンダーは共有データから除外する既存方式を保持。

## 検証

- ローカルWeb: 133ファイル、1,156テスト、型チェック、iOS Webビルド、cap sync ios成功。lintエラーなし、既存warning1件。
- 3観点のレビュー指摘を修正。macOS CIでSwift契約テスト、ターゲット生成、Simulatorビルド、実機向けRelease archiveがすべて成功。
- CI: https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/36514334246
- 公開ビルドブランチ: build/ios-release20-20260929
- 公開ソースコミット: 983cc45（ビルド対象のソースのみ。ローカルの非公開履歴・ログ・認証情報は転送しない）

## 配布との区別

CIは公式iOSテスト広告とお試しモードを使用。本番Supabase接続情報は含まない。成果物は署名なしで、iPhoneへそのまま入るIPAではない。Apple Developer Program加入・署名と、iPhone/Simulator上での広告位置・回転・キーボード・復帰・Widget操作の実画面検証は別工程。App Store/TestFlightへの提出は行っていない。


## CIで見つけた問題の修正

初回実行36513643285ではSwiftUIを返す関数のreturn欠落を検出し修正。2回目36513948318ではiOS両成果物の作成に成功したが、既存のGoogle接続テストがReact effectの完了を待たず失敗したため待ち合わせを追加した。3回目36514334246は全ジョブ成功。


## 保存済み成果物

保存先: `C:/Users/Ryo/AppData/Local/calendar-app/ios-release20-artifacts-20260929/`

- `ios-simulator-app.tar.gz`: Simulator用App.app。
- `ios-unsigned-archive.tar.gz`: 実機向けUnsignedApp.xcarchive。
- `logs/ios-build.log`、`logs/ios-archive.log`: BUILD SUCCEEDED / ARCHIVE SUCCEEDEDを確認。
- `verification.json`: 両ファイルのSHA-256と構成の検査結果。

両成果物からInfo.plistを読み、バージョン1.0.19・ビルド20・Widget Extension・iOSテスト広告IDの一致を確認。Web資産にシフト翌日移動設定、Widget実行コードにCalendarGridWidgetが含まれることを確認。SimulatorのDebugビルドでは実装は.debug.dylibへ分離されているため、そちらも検査した。

最終公開コミット: `983cc45e2da5139dae98bb987b5f50a6a0a8615c`。クラウド成果物の保存期間は7日、ローカルへ取得済み。
