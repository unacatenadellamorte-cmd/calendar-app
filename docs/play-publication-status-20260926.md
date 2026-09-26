# Google Play掲載準備の状況（2026-09-26）

## 管理画面で完了した作業
- 開発者アカウント Ryo.I に Multi calendar を新規登録した。
- パッケージ名 jp.ryo.multicalendar、日本語、無料アプリ。
- ユーザーの同意を得てデベロッパーポリシー、Playアプリ署名規約、輸出法の申告を実施。
- プライバシーポリシーURLと「広告あり」を保存。ダッシュボードで2/11完了を確認。
- 日本語の短い説明・詳しい説明を「未公開として保存」し、保存完了を確認。
- 管理画面: https://play.google.com/console/u/0/developers/5645797689705270553/app/4972216250695957379/app-dashboard
- 一般公開・審査提出・テスト配布は未実施。

## アップロード待ち
Chrome拡張機能でファイルURLへのアクセスが未許可のため、画像ファイル選択が Not allowed となった。ユーザーへ chrome://extensions のChatGPT拡張機能の「ファイルの URL へのアクセスを許可する」を依頼済み。回避してアップロードはしていない。

掲載画像はAI作業場/出力画像/20260926_multi-calendar_store-01.png〜08.png、store-icon-512.png、feature-1024x500.png。コンタクトシートを目視確認済み。秘密鍵はアップロードしない。

## 署名・ビルド
- 提出用アップロードキーを LOCALAPPDATA/calendar-app/play-signing に生成。RSA 3072、PKCS12、別名 upload。
- パスワードはDPAPI暗号化。同じWindowsユーザーでのみ復号できる。別媒体とパスワード管理ツールへの復旧用バックアップは未実施。
- OneDrive上のWeb資産をGradleが通常ファイルとして扱えず停止。Androidソースを LOCALAPPDATA/calendar-app/play-build-20260926/android へコピーし、ビルド出力も同期対象外にした。
- 公開用検査で見つかった13エラーを修正。非公開AppWidgetId参照をGlanceIdと公開APIへ変更。固定名と識別子は翻訳対象外、日ウィジェット名は5言語追加。
- Android単体テスト35件成功。release lintは0エラー・43警告。署名付きbundleRelease成功。
- AAB: C:/Users/Ryo/AppData/Local/calendar-app/play-build-20260926/build-output/app/outputs/bundle/release/app-release.aab
- SHA256: 742BC59A71D3B4CBD7E98CE02F57035F7DA69FD79BC45F2BD11720FE82F57FE2
- jarsignerの署名検証は完了。自己署名・タイムスタンプなし・ZIPのストリーム読出し順序に関する警告あり。Play側の受入れは未確認。

## 公開までの未完了事項
- ユーザー回答: テスターは未確保。管理画面は12人以上の継続14日間クローズドテストが必須。現在0人。
- 画像とAABのアップロード、ストアのカテゴリ・連絡先、アクセス情報、年齢・レーティング、データセーフティ等の申告。
- アカウント設定に削除導線がなく、登録・ログイン・ログアウトのみ。実削除機能と公開の削除案内の整備が必要。
- Google OAuthの公開状態、審査用アクセス手段、クラウド保存の開示の確認。
- AdMobのストア連携は一般公開後。

## 作業記録の制約
ObsidianのsaveスキルはWSLでのトランザクション書込みが必要。この環境ではWSLが未導入のため、vaultへ未保存・未コミット。本ファイルを代替の作業記録とした。

## 追記
- 修正コミット: dd05f7b86b3646decd8e1163af4b66e74dcac9ca（独立レビューで修正指摘なし）。
- ユーザーがChromeのファイルアクセス許可を設定。アイコン、フィーチャー画像、スクリーンショット8枚のアップロードと掲載フォームへの追加を確認。AIラベル申告はユーザー回答待ち。
- 内部テスト版リリースを作成し、AABをアップロード開始。リリース名とリリースノートを入力。サーバー処理結果は次に確認する。

## 今回の到達点
- AIラベルを付ける方針をユーザーが承認。アイコン1点・フィーチャー画像1点・スマートフォン画像8点にチェックし適用。掲載情報を保存し、一覧で「審査のために送信する準備ができました」を確認した。審査へはまだ送信していない。
- AABはGoogle Playで16 (1.0.15)、API 24以上、target SDK 36として受付済み。リリース名「1.0.15 初回内部テスト」とノートを未公開保存し、保存完了を確認。
- リリースレビューは警告2件。テスター未指定で配信されないこと、難読化解除ファイルがないこと。コードはminifyEnabled falseで、難読化は使っていない。
- 内部テストの「保存して公開」は未実行。公開済みと誤認しない。
- 掲載画像の現時点の並びは05,07,06,03,08,02,01,04。公開前に01〜08へ整列するとよい。
- 内部テスト編集: https://play.google.com/console/u/0/developers/5645797689705270553/app/4972216250695957379/tracks/4701220257879039966/releases/1/prepare

## 続行分：コンテンツ申告と審査用アカウント
- 行政アプリ「いいえ」、金融取引機能なし、健康関連機能なしを保存し、それぞれ保存完了を確認。
- 広告IDは使用あり。AdMob公式資料を確認し、分析・広告/マーケティング・不正防止/セキュリティの用途を保存。
- ストアカテゴリ「仕事効率化」、サポートメール una.catena.della.morte@gmail.com を保存。
- ユーザーが対象年齢「18歳以上」と回答。ただしログイン情報の完成が前提のため、対象年齢フォームには未登録。
- ユーザーがIARC規約への同意を承認。質問票を入力・送信し、IARCのステータス「完了」を確認。その他地域は3歳以上、北米は全年齢相当。この内容レーティングと、想定対象年齢18歳以上は別項目。
- データセーフティは「収集あり」「転送時暗号化あり」「ユーザー名とパスワード」を未公開保存。削除URLが必須で未完了。詳細は play-data-safety-audit-20260926.md。
- アカウント削除は未実装。関連Vault秘密情報・端末キャッシュ・未送信操作の消去、同期競合防止を含む仕様をAI作業場の _bmad-output/implementation-artifacts/spec-play-account-deletion-20260926.md に作成。bmad-buildの仕様承認待ち。
- ユーザーが審査専用アプリ用アカウントの作成とGoogle Playへの認証情報登録を承認。una.catena.della.morte+playreview@gmail.com を作成し、パスワードログインと専用プロフィール作成を確認。
- パスワードは LOCALAPPDATA/calendar-app/play-review/password.dpapi.xml に暗号化保存。Git・チャットには記録しない。専用Googleアカウントは未準備と回答。
- ブラウザのURLポリシーが認証情報の一時HTMLをfile URLで開く操作を拒否。回避せず、一時HTMLを削除。パスワード入力はユーザーへ引き継ぐ。フォームに名前・メール・説明だけ入力済み、未保存。
- パスワードのユーザー用入力手順は play-review-account-handoff-20260926.md。コピー用スクリプトは作成のみ、Codexでは実行していない。
- 審査提出、一般公開、テスト配信はいずれも未実施。テスター確保とGoogle連携の審査アクセスが引き続き必要。

## 掲載画像と削除実装の続行
- 掲載画像を01〜08の順へ並び替え、全10アセットのAIラベルを維持して保存。一覧の『審査のために送信する準備ができました』を確認。審査への送信ではない。
- ユーザーがアカウント削除仕様を承認。ローカル実装・型検査・単体テスト・Webビルドを実施、独立レビューの指摘を修正中。クラウドへの恒久適用と公開案内の配信はまだ。
- SQLの本人限定、関連行/Vault消去、他者データ保護、冪等性、強制失敗rollbackをfixture2名のトランザクションで検証成功。fixture/秘密情報/関数/トリガー不残存も確認。実ユーザーの削除テストは実施していない。
- Supabaseの画面はFree、管理APIでbackups:null/pitr_enabled:false。一般資料だけで保存日数を決めず、運用DBからの削除と外部サービス規定に従う旨を公開文面に記載。

## 削除実装の検証完了
- 3層の独立レビュー後、JWT固定、ストレージ障害時の未同意削除防止、Android再起動後のウィジェット登録、iOSの消去失敗検出を修正。
- メインで型検査、全テスト、Webビルド、変更対象ESLintを再実行し成功。現存127テストファイルの失敗0件を確認。
- 更新先行・削除先行の2接続テストも成功。非公開schemaの仮関数と専用fixture2名だけを使い、実ロック待ち、新旧Vault消去、他者保護を確認。終了時の仮関数/schema/fixture/秘密情報消去を検証し、公開RPCは未適用のまま。
- 応答喪失に続いて認証も失効した場合は、削除済みと推定せずサポート案内を残す。実機では削除を実行していない。ネイティブAPIの永久停止の再現・タイムアウト設計は未検証として別記録。
- Obsidianは保存skillのWSL必須条件を満たせず未記録。成果・検証は本リポジトリへ記録しコミットする。秘密値は記録していない。

## サーバー反映と提出版1.0.16
- 本人限定削除RPCとGoogle接続更新のロックをSupabaseへ恒久適用。適用後も使い捨てfixtureのSQL検証が成功し、トランザクションはrollback。実ユーザーは削除していない。
- 公開用HTML2ファイルだけを専用ブランチの078715cへコミットし、既存の公開対象ブランチへ通常のfast-forwardで反映。Pages実行36168482332は成功。私的な運用記録を含むローカル履歴はpushしていない。
- https://unacatenadellamorte-cmd.github.io/calendar-app/account-deletion.html の公開内容をブラウザで確認。
- AndroidはversionCode17/versionName1.0.16へ更新。JDK21で単体テスト35件、lintRelease、署名付きbundleRelease成功。lintは0 errors/43 warnings。実機テスト・アンインストール・データ消去は行っていない。
- AAB SHA256: B97CA6B9BF933B9AB456EF8E58FB9C8BFFA5809C8DA56CBADC1234896DE2ABE4
- AAB出力: LOCALAPPDATA/calendar-app/play-build-20260926/build-output17/app/outputs/bundle/release/app-release.aab
- Playが17 (1.0.16)を受付。旧16をリリース下書きから外し、17のみで名前・削除機能のノートを未公開保存。画面の「変更を保存しました」を確認。配信・審査提出は未実施。
- 審査用パスワードのユーザー入力、Google連携の審査アクセス、対象年齢・データセーフティ詳細申告、12名以上の14日間継続テストは残っている。
- 公開済み削除URLをデータセーフティの未公開版へ登録し、画面の「変更を保存しました」を確認。詳細のデータ種類・用途申告は未完了。

## 審査用Googleアカウント登録の続行
- ユーザーが新設した審査専用Googleアカウントを提供。ChromeでそのアカウントのGoogleカレンダー画面へアクセスできることを確認。
- アプリ用ログイン情報に、Google連携用の認証情報と英語の操作手順を追記。認証情報の値は本記録・Gitへ保存しない。
- Play Consoleのログイン詳細で追加・保存し、「変更を保存しました」を確認。ログイン情報の保存完了であり、アプリ審査提出ではない。
- Google OAuthの接続から予定取り込みまでの通し検証、および別端末でのGoogle本人確認要求の有無は未確認。
- パスワード転記スクリプトはWindows PowerShell向けUTF-8 BOMへ修正し構文検査成功。ユーザーの明示依頼で実行し、ユーザーがPlay欄へ貼り付けた。誤って作成した平文パスワードファイルは削除済み。
- ObsidianのWSL必須条件は引き続き未充足。本記録をローカルリポジトリへコミットする。

## 審査提出前の申告完了とGoogle連携の問題
- 対象年齢18歳以上を保存。データセーフティ11種類の収集・共有・用途・削除URLを入力し、「変更を保存しました。[公開の概要]で審査に送信してください」を確認。
- 審査資格情報の追加利用にあたるGoogle・信頼できるパートナーの端末テスト用スイッチはオフで保存。
- AndroidのGoogle認可戻り先がhttps://localhost/connections/google/callbackになる問題をコード確認。Capacitorは外部ホストをブラウザへ渡し、現在のアプリにはGoogle認可の復帰処理がない。WebView認証拒否は実証していない。
- Google連携を維持するため、Android公式AuthorizationClientと既存サーバー交換処理を使う修正仕様をAI作業場の_bmad-output/implementation-artifacts/spec-android-google-oauth-review-20260926.mdへ作成。bmad-buildの仕様承認段階。実装は未着手。
- 既存の17は内部テスト下書きのまま。審査提出・テスト配信は未実施。修正版の検証後に続行する。

## Android Google連携修正・Alphaリリース保存
- ユーザー承認後、公式AuthorizationClientへ移行。ログアウト・利用者変更・取消・再試行・画面離脱・JWT更新を保護。変更と検証記録をローカルコミット。詳細はandroid-google-oauth-verification-20260926.md。
- Cloudで配信署名3種とローカル提出署名のAndroid OAuthクライアントを登録し、審査専用Googleアカウントをテストユーザーへ追加・保存。
- SupabaseのAndroidオリジン許可を設定し、認可交換・カレンダー一覧・同期の3関数を配信。CORSの許可・拒否9条件を確認。
- 全Vitest1,087件、Android単体36件、型検査・変更対象ESLint・Webビルド・release lint・署名付きAAB/APK生成成功。
- Play Alphaの対象国を日本、初期テスター候補2名、フィードバック先をサポートメールに設定。実際の参加人数ではない。
- 18 (1.0.17)をアップロードし、「1.0.17 クローズドテスト」として保存完了。公開の概要に14件の未送信変更が表示された。内部テスト17は以前の下書きのまま。
- AAB SHA256: 5ED4226388C7C651A146B55D567AE33B5DA286A185F90B8E9CB1738ED86CF7F0。最終APK/AABはLOCALAPPDATA/calendar-app/oauth-review-fix-20260926/android/app/build/outputs/配下。
- Playの警告は難読化解除ファイルなしの1件。minifyEnabled false。Playの自動クイックチェックは開始されたが、結果はまだ確認していない。
- Windows画面操作の接続が失敗し、所定の再接続でも復旧せず。実Google認可→選択→取り込みの受入確認をユーザーへ依頼。実機の削除・更新やエミュレーターへのAPKインストールは行っていない。
- 審査へ送信するボタンは押していない。実連携確認後に送信を続ける。製品版公開に必要なテスター確保・継続テストも残る。
- Obsidian記録は既存のWSL必須条件未充足で保留。認証秘密を含めず、本記録をローカルGitへ保存する。公開リポジトリへのpushなし。

## 実機への修正版上書き
- ユーザーが修正版の端末インストールを依頼し、USBデバッグ許可を実施。
- 接続実機SM-F956Qの既存アプリは16 (1.0.15)、開発用署名SHA-1 B2434FA22223180DBCED0BE312B11BB614B2922B。提出用署名とは異なるため、既存APKを読み出して証明書の一致を確認した。
- 提出用APKのコピーを同じ開発用鍵で再署名し、対象実機を明示したinstall -rで上書き。SuccessとversionCode18/versionName1.0.17を確認。
- アンインストール・データ消去は未実施。端末内データの内容やGoogle連携成功は未確認。
- 実機検証用APK: LOCALAPPDATA/calendar-app/device-update-20260926/multi-calendar-18-device.apk。Play提出用APK/AABは変更していない。
- この開発用署名のAndroid OAuthクライアントは今回未登録。実機Google連携テストには追加設定が必要。

## 実機検証署名のOAuth登録
- ユーザーが追加登録を明示承認。Cloud calendar-app-508202へ「Multi calendar Android device verification」を作成し、成功表示を確認。
- パッケージjp.ryo.multicalendar、SHA-1 B2434FA22223180DBCED0BE312B11BB614B2922Bに限定。
- AndroidクライアントID: 1015352739751-tmaiq37104vt3ocm1rq5f774dnj8vlb0.apps.googleusercontent.com。既存Webクライアント・スコープ・テストユーザーは変更なし。
- Google画面は設定反映に5分から数時間かかる場合がある旨を表示。実機Google認可から予定取り込みまでの確認は引き続き未完了。審査送信も未実施。
