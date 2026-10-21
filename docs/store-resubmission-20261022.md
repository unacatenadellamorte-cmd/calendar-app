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

## 配布・提出結果

- 配布先DBへ未適用7件を適用済み。更新前の関数定義とEdgeソースを退避。前後の件数は予定166・カレンダー76・接続3で不変。`event_end_date`列・RPCの終了日保存・所有者ガード・Google複合IDが有効であることを再取得した。CLIのDocker未導入によるローカルカタログキャッシュ警告は、DB適用自体の成功と区別する。
- 終了日に必要な`sync-calendars`と`push-events`を更新。今回の変更と関係しないWebhookは既存の配布版を維持した。ユーザーデータを使う取込・購入・書戻し試験は行っていない。
- 両OSの署名付き成果物とストア審査提出は作業中。結果・成果物ハッシュ・実行URLと未確認事項を追記する。
- 最初のMac CI39645745531はWeb試験等の後、Google認可単体試験の偽SDKへ新しい写真プラグインの型が未登録だったため停止した。製品の登録処理を削除せず、両方のSwift単体コンパイルへ写真プラグインのテスト代役を追加して再検証する。実際の写真プラグインは後段の配布アプリでコンパイルする。
- 次のCI39646254159では認可・Swift試験は通過したが、配布アーカイブが写真選択UI用`PhotosUI`のimport不足を検出した。`DevicePhotosPlugin.swift`へimportを追加し、実アーカイブで再検証する。
