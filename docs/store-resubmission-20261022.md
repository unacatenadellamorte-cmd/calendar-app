# 全20項目改修後の両ストア再提出（2026-10-22）

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
