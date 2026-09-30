---
title: 'iOSのApp Store公開用ビルド準備'
type: chore
created: '2026-09-30'
status: in-review
route: dispatch
baseline_commit: dfe856c1a099b9e0a8eb0b54cf3d7267f4822e84
review_loop_iteration: 0
context: []
---
<frozen-after-approval>
## Intent
公開準備の依頼に従い、iOSのGoogleカレンダー接続と必要なプライバシー宣言を整え、本番設定で配布署名できるビルド経路を作る。
## Boundaries & Constraints
作業ルートは `C:\Users\Ryo\AppData\Local\calendar-app\ios-app-store-20260930`。日本語で報告・コメントを書く。Android/Webの既存認可・終日入力・広告・ウィジェットは維持。Googleはカレンダー読取り用、主認証はSupabaseのまま。秘密をコード、ログ、成果物へ含めない。実データ削除、端末操作、外部設定、デプロイ、push、コミット、別エージェント起動は禁止。外部設定・登録はメインが担当。実機未確認は明示する。
## I/O & Edge-Case Matrix
|状況|期待|失敗時|
|---|---|---|
|iOS認可成功|公式Google Sign-In SDKのサーバー認可コードを本人JWTで交換|トークンをJSへ返さない|
|取消・不足scope・利用者切替・匿名|接続成功を返さず既存エラー表示|書込みなし|
|Android/Web|現行方式を保持|回帰テスト|
|本番設定不足|公開ビルド中断|秘密値を出さない|
</frozen-after-approval>
## Code Map
- `src/platform/googleAuthorization.ts`, `src/data/connections.ts`: AndroidのみSDK分岐。既存の利用者固定・scope検証をiOSにも適用。
- `supabase/functions/oauth-exchange/index.ts`: platform Androidのみ許可、server clientで交換。iOSのserverAuthCodeも同等に検証し、Webは維持。
- `supabase/functions/_shared/cors.ts`: APP_ORIGINSで明示許可。capacitor://localhost追加の運用手順を記す（設定変更しない）。
- `ios/App/App/SceneDelegate.swift`: CAPBridgeViewController生成。独自プラグイン登録・Googleのcallbackを接続し、既存DeepLinkを保持。
- `ios/App/App/Info.plist`, `project.pbxproj`, `scripts/ios/add-widget-target.rb`: 主ID jp.ryo.multicalendar、拡張 .FeaturedEventsWidget、group.jp.ryo.multicalendar.widget。Google iOS client/reversed scheme設定、SPM依存はcapsyncで消えないよう冪等処理。
- `ios/App/FeaturedEventsWidget/Models/`: App Group UserDefaults使用。主Appと拡張のPrivacyInfo.xcprivacyを適切にリソース登録。理由1C8F.1を公式資料照合。
- `scripts/ios/build-device-web.mjs`: 接続チェック等を参考、検証用はtest広告のまま保持。`.github/workflows/ios.yml` は未署名検証。
## Tasks & Acceptance
- [x] 公式Google iOS SDKとApple資料を調べ、iOSカレンダー認可・戻り処理を実装。必要な設定キーとCloud登録手順を記す。最小scopeは既存2種。
- [x] 主App/WidgetのRequired Reason宣言を追加し、生成処理で同梱を検証。
- [x] 本番Webビルド検証スクリプトと手動起動専用 `.github/workflows/ios-release.yml` を追加。既存iOS CIにも新ネイティブ構成を適用。
- [x] 公開CIはmacos-15/Xcode26.3、contents read、checkout認証保持なし。手動入力version/buildを検証、frontend公開設定・本番AdMob・Google iOS設定を必須にする。秘密のp12/passwordと主App/Widget profileを一時keychainへ投入、正しいTeam/Bundle/AppGroup/有効期間を検査してmanual署名archive/export。削除trap/always cleanup、公開artifactへkey/profile/envを含めない。未設定で明確に停止。自動ストア提出は実装しない。
- [x] テスト: 認可分岐/取消/不足scope/利用者切替、公開設定検証、ネイティブ生成の冪等性とManifest同梱。typecheck/lint/関連テストを実行。
AC: iOSの場合に外部SDK認可へ進みWebViewログインを使わない。本番設定不足なら配布成果物を生成しない。完成archiveのAppとWidgetが同じAppGroupで署名される条件をCIが検証する。Windowsで実行できないXcodeの確認は未完了として明示。
## Implementation Notes
公開App IDと配布証明書の登録はメインが担当。署名秘密の外部保存は確認後。既存の接続確認済み公開設定は main が供給する。SDKバージョン等は公式根拠で決める。
## Spec Change Log
- 2026-09-30 メイン指示: 既存 `ios.yml` の手動入力 `release/version/build` から同じブランチの `ios-release.yml` を `workflow_call` で呼べる入口を追加。既定release=falseとpush/PRは未署名検証を維持。
## Review Triage Log

|ID|判定|根拠と対応|
|---|---|---|
|B1 配布時全回帰|medium|通常Web jobをskipし認可3ファイルしか検証しない。配布jobをnpm testへ置換する小修正。|
|B2 診断全破棄|medium|runはxcodebuildの失敗内容も消しコンパイル原因を追えない。秘密環境削除後のXcode診断だけ伏字付きで出す小修正。security出力は保持しない。|
|B3 dSYM破棄|medium|archiveをcleanupで削除し対応シンボルが失われる。検証後dSYMだけ別ZIPへ保存する小修正。|
|B4 推移依存未固定|maybe-false|Package.resolved未追跡は既存SPMにも共通。新SDK本体9.2.0は固定。実際の解決差異は未確認。中程度未検証として保留し、初回Mac解決結果で確認する。|
|B5 Swift認可未検証|medium|JS mockとWidget Swift testsではauthorizing解除を検出できない。V1と同根拠、実プラグインを実行するnativeテストを追加。|
|B6 verify_app未検証|medium|完成App/Widgetの署名証明書比較は単体テスト対象外。V2と同根拠、成功と片方ずつの証明書不一致をfixtureで検証。|
|B7 公開ビルド各失敗分岐|low|設定バリデータは検証済み、実際の本番ビルドも成功。通信/出力不整合の各failure注入は未検証だが現状の誤通過を示していない。既存直接throwのため大きなfixture境界追加は見送る。|
|B8 CORS設定漏れ|medium|本番OPTIONSでiOS originが未許可だった。既存APP_ORIGINSのhash一致を確認してAndroid値を保持しiOS追加、変更functionを配信しOPTIONSを再確認する運用修正。認可本番実機は別途確認。|
|B9 ポリシー到達性|low|形式だけの自動検証だが公開URLのGET200と公開support mailをメインで確認済み。今回の配布URLは到達しており手動記録で対応。|
|B10 Web資産最終一致|maybe-false|dist検証→cap sync→archiveの連続経路に資産差替え処理はない。実際の不一致は未確認。今回IPA取得後に同梱admob/接続設定を検査して判断する。低程度未検証の追加ハッシュ機構は見送る。|
|E1 URL scheme欠落|medium|SDK9.2.0公式実装がunsupportedSchemesでNSInvalidArgumentExceptionを投げる。clientIDだけ設定したdebug/deviceで到達するためSDK呼出前に逆順scheme確認を追加。|
|V1 取消後再試行|medium|nativeプラグインstateはJS mockから検証されないという提示証拠を採用。B5とまとめ実コードの取消→成功をnativeテストで実行。|
|V2 最終証明書不一致|medium|verify_app証明書比較の削除を既存testsが検出しないという提示証拠を採用。B6とまとめ両targetの不一致拒否fixture追加。|

## Verification
`npm run typecheck`, `npm run lint`, 関連vitest/node/rubyテスト。macOSビルドはメインがCIで実行する。

### 2026-09-30 ローカル実装検証
- `npm run typecheck`: 成功。
- `npm run lint`: エラー0。既存 `src/ui/profile-header-context.tsx` のFast Refresh警告1件。
- 認可・接続UI・iOS広告設定・Widgetの関連Vitest: 13ファイル191件成功。
- `node --test scripts/ios/build-device-web.test.mjs scripts/ios/build-release-web.test.mjs`: 7件成功。
- `python -X utf8 scripts/ios/test-release-signing.py`: 5件成功。秘密を含む一時ファイルの片づけ継続・再試行も検証。
- メイン供給の公開設定を用いた `npm run build:ios:release`: 成功。Supabaseの読取り接続確認、成果物への接続設定、本番広告設定を検証（値は出力せず）。検証用version/buildは1.0.20/21、実配布番号の確定ではない。
- `npx cap sync ios`: 成功。同期後のXcodeプロジェクトを解析し、GoogleSignIn 9.2.0依存とApp/Widget各1件のManifestリソース参照を保持していることを確認。
- 両workflowのYAML解析・`git diff --check`: 成功。
- 未確認: Ruby生成テスト、Swift/Xcodeビルド、実署名archive/export、iOS実機での認可と復帰。WindowsにRuby/Xcodeが無いため、CI/実機で続行する。
- 外部設定・デプロイ・コミット・pushはこの実装担当では行っていない。運用手順は `docs/ios-app-store-release.md`。

### 2026-09-30 レビュー修正後
- 指摘の小修正を反映。全Vitest134ファイル1219件、署名Python12件成功。native実プラグインの取消/再試行などを実行するMac専用テストを追加。
- 本番oauth-exchange配信完了。3つのGoogle関連functionでAndroid/iOS OPTIONS許可、未許可origin拒否を確認。
- GitHub environmentの署名4秘密登録済み、許可branchはfeat/ios-app-store-20260930のみ。ユーザーの明示承認を受けメインがpush/Mac配布ビルドを実行する。
- 正式version/buildは1.0.20/21。Mac署名・実機認可はこれから検証。
