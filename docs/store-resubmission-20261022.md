# 全20項目改修後の両ストア再提出（2026-10-22）

## 最新確定：写真プランを含む1.0.25（32）の両ストア申請完了

2026-10-22にAndroidとiOSの32番を審査へ提出した。審査承認・一般公開・実機受入はこの結果に含めない。Google1アカウントの同期と予定反映を標準化し、写真を月額500円、複数Googleアカウント最大5件と写真を月額1000円に変更。有効な旧契約も写真利用可。旧商品は実価格300円を維持し、自動解約・自動移行なし。iOSは購入導線だけ外して更新を維持、Androidは旧基本プランをINACTIVEにした。両OSとも日本のみ。

- Android：既存Alphaのリリース11、送信履歴9で32・Alpha・審査中を別取得。送信受付は12:04 JST。既存28は維持し、未送信31のリリース10だけ破棄した。テスター・地域は不変。難読化なしのためマッピング未添付の警告だけ残る。自分のPlayタブは終了時に閉じた。
- iOS：署名CI39713733221、IPA送信CI39715251381が成功。Apple側32/VALID、build ID c9e90dbb-1e4b-4e84-849b-f7a49c80dba0。旧31提出を取下げて新しい提出[df4e01f8-2b1c-49d0-bf77-73ba75880c9a](https://appstoreconnect.apple.com/apps/6817586147/distribution/reviewsubmissions/details/df4e01f8-2b1c-49d0-bf77-73ba75880c9a)へ、アプリ・購読グループ・旧商品・multi・新写真の5項目を送信した。別取得で集約WAITING_FOR_REVIEW、アプリWAITING_FOR_REVIEW、32・MANUAL（手動公開）を確認。審査連絡先・ログイン情報不変、内部TestFlightに32追加、日英アプリ説明・3商品の審査メモを新プランへ更新した。
- 新写真商品6825605307：500円、日本のみ、review screenshot 555e813e-8076-468f-b614-a8d9910788a0の配送COMPLETE。画像名はSOURCE。撮影環境と目視の範囲は下記記録のとおりで、実機購入の成功を表すものではない。
- RevenueCat：device_photosを両OS新商品へ紐付け、default販売一覧はdevice_photosとmulti_accountのみ。旧商品・旧権利は削除しない。Supabase写真マイグレーション・Webhook配布済み、前後件数は予定166/カレンダー79/接続4/権利2不変。秘密値は記録していない。
- 公開ポリシー：写真の端末内処理・外部非送信・メモリ内キャッシュ・OS権限・個別表示時のクラウド取得を追記した。公開ブランチは6316608でHTMLだけ更新、Pages39716626016成功、HTTP200・更新日2026年10月22日・写真説明を再取得した。従来のWeb本体は維持した。

### 写真審査画像と価格データの補完

審査画像の原本はworkspaceの出力画像/20261022_ios_review_39717047364/20261022_ios_iphone_ja_photo-day-list.png。iOS18.5の隔離シミュレーターで、架空の認証・写真権利を使い、製品の「この日の写真」と許可前の案内を目視確認した。写真設定の説明と現在のプラン「写真表示」も別画像で確認。**iOSのサムネイル実表示は未確認**で、審査メモにもその範囲を明記した。Appleの画像名SOURCEはサーバーの読戻し値で、元のファイル名とは区別する。

撮影CI39714750092は成功したが写真欄へ到達していなかった。39717047364は写真欄・プラン表示まで成功。39718179986は起動後のOS許可変更でアプリが終了し撮影後の終了処理が失敗した。再起動を加えた39719062346は成功しOSの許可ダイアログを確認したが、アプリのサムネイルを撮影した証拠にはしない。設定変更による終了と製品クラッシュは断定せず区別する。配布32番の製品コードは変えていない。

写真商品の追加時にAppleがIAP_SUBMISSION_NOT_ALLOWED_MISSING_PRICING_DATAを返し、販売対象外の174地域にも価格データが必要と分かった。日本500円の公式equalizationsから174件を補完し、合計175価格・販売対象JPNのみ・新地域自動追加false・日本500円不変を別取得した。READY_TO_SUBMITへ遷移後、5項目を13:08 JSTに送信できた。apple-photo-equalized-prices-verified.jsonに結果を保存。[Appleの提出手順](https://developer.apple.com/documentation/appstoreconnectapi/submitting-subscriptions-and-subscription-groups-for-app-review)に沿い、審査画像と商品版の審査項目を分けて処理した。

### 配布成果物

製品ソースはfcd1bb2。後続変更は審査画像の撮影処理、送信IPAの固定、公開ポリシー、記録のみで、配布した32番の製品コードは変わらない。

| 成果物 | 実体 | サイズ | SHA256 |
|---|---|---:|---|
| Android32 | store-resubmission-20261022/android32-build/app/outputs/bundle/release/app-release.aab | 13,706,750 bytes | 34C3C91C916ED901ED36CF68EA1A6F65A419C0C140D5D1F2124B48D0929B7660 |
| iOS32 | store-resubmission-20261022/ios-1.0.25-32-run39713733221/Multi-calendar.ipa | 8,528,455 bytes | 5be60da444c53311184480cfe7a32a97619307d931eb050d7f9c8f6cd0bf5492 |

上記パスの基準はC:/Users/Ryo/AppData/Local/calendar-app。署名・登録証明書・版・主App/Widgetを照合済み。本番成果物に撮影fixtureやローカル撮影URLは混入していない。Appleの独立読戻しはapple-photo32-submission-verified.json。

### 検証と限界

全178ファイル1778件、型検査成功、lintエラー0・既存警告1。Android JVM52件、Android release/lint/署名、Macの実App/Widget署名コンパイル・アーカイブが成功。専用API36/emulator-5580では実MediaStoreの架空120枚40/40/40、縮小256・拡大1600以内、日付10往復、無権利/閉じたままの復帰でOS呼出0、OFF後画像0を確認。専用AVDはデータを消さず停止した。実機・実購入/復元/返金・iOS限定写真/iCloudの受入と長時間メモリ測定は未実施。

Androidのmultiから写真への専用予約変更は既存の改善候補として先送り。購読管理で更新停止し満了後に写真商品を購入する経路を維持する。

以下は時点を区別した過去の記録で、現在の提出状態はこの最新節を優先する。

## 最新：写真プラン化と32番の再提出準備

本人がGoogle1アカウント同期・予定反映を標準、写真表示を新500円商品、複数アカウント1000円には写真も含めると確定。旧商品の実価格は両OSとも300円であり価格を変更しない。有効旧権利は写真も利用可、自動契約移行なし。iOSは旧商品をアプリ購入導線とRevenueCat販売一覧から外すだけでストア更新は維持、Androidは旧基本プランの新規受付を停止する。

20261022040000_photo_plansを配布DBへ適用し、3権利と無料Google書込を有効化。関数退避はstore-resubmission-20261022/photo-functions-before.json。本人がサーバー用APIキーをSupabaseへ登録し、名前と更新日時だけを確認後、revenuecat-webhookを更新した。予定166・カレンダー79・接続4・権利2は更新前後不変。購入・返金の実取引確認は未実施。

全178ファイル1778件、型検査成功、静的検査は既存警告1件のみ。写真UIの失敗表示・スクロール・権限競合・契約失効と復帰・設定OFF・画像デコード失敗・利用者別キャッシュ・復元時multi待機を確認した。専用エミュレーターの最新監査は再実行中。Android32署名版を最新ソースから再生成しSHA256は34C3C91C916ED901ED36CF68EA1A6F65A419C0C140D5D1F2124B48D0929B7660。iOS32はこれから署名CIを実行する。新しいアップロードと審査送信はまだ完了していない。

## 最新：写真有料化前のデバッグへ変更、Android送信を停止

本人がGoogleカレンダー同期を標準機能、写真表示を500円へ変更する方針を示し、先に写真機能のデバッグを指示した。Android31は本人によるAAB選択・アップロード後、写真用途説明219文字とAlphaリリース10を保存した。今回の指示後に「審査にまだ送信されていない変更」「1件の変更を審査に送信」の実画面を再取得したため、申請済みとせず以後の送信を停止した。Googleタブは状態確認用に保持。iOS31は前の審査待ち・手動公開を変更していない。料金変更は未実装。今回の問題2件と検証根拠は `docs/device-photos-audit-20261022.md`。

## 最新の継続状態：ログイン確認済み・ファイル選択待ち

本人の画像とWindows実画面で、T3内蔵ブラウザーのGoogle Playログイン済みを確認した。T3のserver側プレビューとツールバーURLがログイン前のままで、実際の埋込画面と食い違っていた。以下の過去の「本人ログイン待ち」はこの時点で解消し、再ログインは不要。

Computer Useで既存のクローズドテストAlphaを開き、有効・1か国/地域・既存28が選択テスターへ公開済みと確認。新規リリース10の作成画面 `https://play.google.com/console/u/0/developers/5645797689705270553/app/4972216250695957379/tracks/4698983866019292064/releases/10/prepare` を開いた。既存テスター・地域は変更していない。

アップロードを押すとAAB選択ダイアログが開いたが、操作ツールは `point (500, 652) is over T3 Code (Beta).exe "", not target window T3 Code (Beta).exe "T3 Code (Beta)"` と拒否。対象有効化・画面再取得後も同じで、手動で上記署名済みAABを選ぶよう本人へ依頼した。ダイアログとGoogleタブは継続用に残す。Androidはまだ未アップロード・未申請で、31の受理・権限申告・審査送信は未確認。iOSの提出結果は下記のとおり。

## 本人の依頼と今回の範囲

本人の「修正完了したら、iOS，Androidにアップロードし直して、申請まで完了して」により、前回のローカル限定を今回の配布作業について変更する。改修32fc4d2と先行の端末写真機能を含めて署名付き配布版を作成し、既存のApp Store提出とAndroidクローズドテストAlphaを更新して審査へ送る。必要なバックエンド互換更新も今回の配布に含む。iOS手動公開、既存の地域・テスター・購読商品・審査ログイン情報を維持する。一般公開への変更、金融入力・契約同意、実課金、実機初期化は行わない。

## 作業開始時の実測

- Apple公式APIで最大build30/VALID、1.0.25はWAITING_FOR_REVIEW（審査待ち）、選択30、MANUAL（手動公開）。既存提出cfa63106-c4eb-4296-860a-52697142e210。新しい署名版は1.0.25（31）を使う。
- Androidの作業ツリーは1.0.25/versionCode28。候補31を作り、Play上の未使用番号と照合してから送信する。
- リンク済み配布DBで10月15日以降の7マイグレーションが未適用。Google既存17件の参照不整合0、端末接続の秘密参照0。先にdry-runとローカルPGlite全適用試験を確認。配布前のEdgeソースはリポジトリー外のstore-resubmission-20261022/backend-beforeへ取得した。
- Google PlayのT3専用タブは本人ログイン待ち。Appleは既存の公式API認証が利用可能。認証値はログ・資料へ記録しない。

## 完了条件

署名・本番設定・版とハッシュを検証した新規IPA/AABをアップロードし、Appleの処理完了、提出候補31、審査送信後の集約状態、Playの31を含むAlpha変更と審査送信を別取得で照合する。アップロード成功と審査提出成功、審査承認を区別する。

## 実機受入との区別

全20項目の自動検証は178ファイル1752件と指定10チェックが成功した。31の実機・操作感確認は本人担当で未実施。旧29での本人の購入・復元・撮影確認を31の実機受入へ読み替えない。Macでのコンパイル・署名とストアの受領も、実機での成功とは区別する。

## Android成果物

- 1.0.25/versionCode31、`jp.ryo.multicalendar`。AABは`C:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261022/android31-build/app/outputs/bundle/release/app-release.aab`。
- 13,702,518 bytes、SHA-256 `47C09E0FA88FE38A49570FA82B250F4758ED6E3C28A409AD771F7FA1290F8762`。
- 登録済み署名証明書との一致とjarsigner成功。bundle manifestの版・識別子・ウィジェット受信先3件を確認。JUnit52件成功、Android lintエラー0・警告47、release bundle成功。
- AAB内の本番Android広告・Supabase/Google/RevenueCat公開設定・撮影URL非混入とSW自己破棄を確認。秘密はDPAPIから当該プロセス環境へ渡し、値をログへ残していない。既存JDK21をビルドプロセスだけで指定した。
- ログは`C:/Users/Ryo/OneDrive/デスクトップ/AI作業場/.work-temp/store-resubmission-20261022-android-build.log`。
- Play上の未使用番号、写真アクセスの必要な申告、アップロードと審査送信はログイン後の確認が残る。[Google公式の写真・動画アクセス方針](https://support.google.com/googleplay/android-developer/answer/14115180)に基づき、実装上の用途を正確に説明し、受理や適格性を先に断定しない。

## iOS成果物

- [Mac配布CI39647524337](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/39647524337)は成功。作成元8df2ab0。認可試験・Swift共有データ試験・主AppとWidgetの配布署名・アーカイブ・IPA・一時署名素材の消去を含む。
- IPAは`C:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261022/ios-1.0.25-31-run39647524337/Multi-calendar.ipa`。8,524,235 bytes、SHA-256 `2c5c405936b6a790179b2794641c197328ac298de47a75c08baa9837631392ea`。
- Windows側でも両ターゲット1.0.25（31）、両プロファイルの存在、主Appのカメラ・写真用途説明、公開Web16ファイルに他ストア言及なしを照合した。署名の暗号検証はMac側で実施済み。送信workflowをこのrun・IPAハッシュ・31へ固定する。
- Macでは全178ファイル1752件とSwift12件が成功。本番iOS広告、撮影server設定なし、非免除暗号なし、SW自己破棄もIPA実体で照合した。dSYMは17,242,904 bytes、SHA-256 `edb5fa9ca12313f5ee431f4e25df19df86e0fcc85d92d9f230ab0b89779801ba`。
- [送信CI39648991319](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/39648991319)は成功。2026-10-22 03:03:59 JSTに`UPLOAD SUCCEEDED with no errors`（エラーなし受領）を確認した。Delivery UUIDは`07aa4309-4d5b-45bd-b43b-54e8e52e7f7e`。Apple処理完了・審査申請の成功はこの受領とは別に確認する。
- Apple公式APIで31・VALID、非免除暗号なし、build ID `07aa4309-4d5b-45bd-b43b-54e8e52e7f7e`を確認。既存内部グループ「実機審査確認」へ31を追加し、旧5ビルドを維持した6件とIN_BETA_TESTING（内部テスト中）、日本語案内の読戻し一致を確認した。テスターの追加・削除はしていない。
- 旧30の提出をAPIで取下げ、完了を待って31を選択した。審査メモは旧メモを保持したまま31の機能と未実機受入の説明を先頭へ加え、3,766文字の完全一致を読戻した。審査アカウント・パスワード・連絡先を含むnotes以外の全フィールド不変もメモリ内比較で確認し、値は出力・保存していない。日英説明の標準EULAリンクも保持。
- 旧提出のアプリ・購読グループ版・2商品の版を保存し、[新しい提出c230da88-0b88-4a39-9286-a63d01ab6e5c](https://appstoreconnect.apple.com/apps/6817586147/distribution/reviewsubmissions/details/c230da88-0b88-4a39-9286-a63d01ab6e5c)へ同じ4項目を登録。2026-10-22 03:08:58 JSTに審査へ提出した。別取得で提出とアプリのWAITING_FOR_REVIEW（審査待ち）、選択31、MANUAL（手動公開）を照合した。個別4項目はREADY_FOR_REVIEW表示のままで、集約状態とは区別する。

## 配布・提出結果

- 配布先DBへ未適用7件を適用済み。更新前の関数定義とEdgeソースを退避。前後の件数は予定166・カレンダー76・接続3で不変。`event_end_date`列・RPCの終了日保存・所有者ガード・Google複合IDが有効であることを再取得した。CLIのDocker未導入によるローカルカタログキャッシュ警告は、DB適用自体の成功と区別する。
- 終了日に必要な`sync-calendars`と`push-events`を更新。今回の変更と関係しないWebhookは既存の配布版を維持した。ユーザーデータを使う取込・購入・書戻し試験は行っていない。
- **最終状況:** iOSは署名版31のアップロード・内部TestFlight・審査申請まで完了。審査承認・一般公開・31の実機受入は未確認。Androidは署名済み31のAABまで完了し、Playの本人ログイン待ちのため未アップロード・未申請。両ストア申請完了とは報告しない。
- 最初のMac CI39645745531はWeb試験等の後、Google認可単体試験の偽SDKへ新しい写真プラグインの型が未登録だったため停止した。製品の登録処理を削除せず、両方のSwift単体コンパイルへ写真プラグインのテスト代役を追加して再検証する。実際の写真プラグインは後段の配布アプリでコンパイルする。
- 次のCI39646254159では認可・Swift試験は通過したが、配布アーカイブが写真選択UI用`PhotosUI`のimport不足を検出した。`DevicePhotosPlugin.swift`へimportを追加し、実アーカイブで再検証する。

## 継続事項

T3内蔵の自分のGoogle Play Consoleタブ`tab_7_b74cde26-dabd-4d9f-83d2-9613b4d503aa`を本人のログイン用に残す。未送信入力のない自分の重複タブは閉じ、本人・他AIのタブには触っていない。ログイン後は最新番号を確認してAAB31をAlphaへ追加し、写真権限等の必要な申告を実装に合わせて確認し、審査送信と公開の概要の状態を再取得する。31が使用済みなら番号を上げて署名版を作り直す。ログインが終わる前に申請済みとはしない。完了後、不要になった自分のタブを閉じる。
