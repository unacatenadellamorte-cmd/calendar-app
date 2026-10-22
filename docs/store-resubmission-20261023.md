# カレンダー閲覧修正の両OS再申請（2026-10-23）

## 確定結果

閲覧修正を含む1.0.25（33）を両OSへ再申請済み。Androidは2026-10-23 01:03 JSTに送信10を受付、別画面で33・既存Alpha・審査中。iOSは01:13:13 JSTにアプリ・購読グループ・旧商品・multi・新写真の5項目を[新提出c075a41e-4f4c-47c1-a8b2-37c236eafeb4](https://appstoreconnect.apple.com/apps/6817586147/distribution/reviewsubmissions/details/c075a41e-4f4c-47c1-a8b2-37c236eafeb4)として送信。別取得で提出とアプリのWAITING_FOR_REVIEW（審査待ち）、選択33/VALID・MANUAL（手動公開）を照合した。審査承認・一般公開・実機受入を完了したとは扱わない。

本人の「再申請まで行って」に基づき、b6b6cc2の閲覧5点修正を1.0.25（33）へ含め、既存のAndroidクローズドテストAlphaとiOS手動公開へ再提出する。前回仕様の配布禁止は今回の依頼範囲で解除する。一般製品版への切替、テスター・地域・課金商品の変更は行わない。

開始時の別取得ではiOS32/VALID・1.0.25/WAITING_FOR_REVIEW・MANUAL、旧提出df4e01f8-2b1c-49d0-bf77-73ba75880c9a。Android32は10月22日12:37に選択したテスターへ公開済み、既存Alpha・1地域を維持。33番を署名・検証・アップロードし、受領確認後にiOSの旧提出を更新する。アップロード、審査送信、承認を区別する。

前回の実測は全1790件、型検査、Webビルド成功。実機での操作感は本人担当の未確認事項であり、署名ビルドやストア受領を実機受入とみなさない。

## Android33の提出結果

2026-10-23 01:03 JSTに既存Alphaのリリース12を審査へ送信し、別画面の送信アクティビティ10の詳細で33・Alpha・審査中を確認した。送信直後は自動クイックチェック後に審査へ進む表示。Alpha100%・管理対象公開オフ・既存地域・テスターを維持し、一般製品版へ昇格していない。端末サポート数は前版から変更なし。難読化なしの既存構成のため、難読化解除ファイル未添付の警告だけが残る。

署名ビルドとJUnit52件が成功、Android lintエラー0・警告47。AABは13,707,981 bytes、SHA256 `c7427f59d823654414a6352c4630ca1ffbdde3a7d5e98b385dd19be3e2ce1c52`。登録済み署名証明書SHA1と一致し、実manifestの識別子jp.ryo.multicalendar・1.0.25/33を照合した。本番Android広告、撮影server URLなし、自己破棄SW、SwipeSurfaceを含むWeb実体とローカル配布資産の一致を確認。Capacitor同期が追加するcordova.jsとcordova_plugins.jsは比較対象外。

成果物は`C:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261023/android33-build/app/outputs/bundle/release/app-release.aab`。証跡は同根のandroid33-artifact-verified.jsonとandroid33-submission-verified.json。JARの自己署名・読取方式関連警告と依存ライブラリの汎用localhost文字列は、登録証明書不一致や撮影server混入と区別した。自分のPlayタブは提出内容の別取得後に閉じた。

## iOS33の署名・アップロード

[署名CI39809536547](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/39809536547)が成功。作成元ee5a6c9は製品変更b6b6cc2とAndroid番号・記録だけを含む。Macで1790件、型検査、静的検査、Swift試験、主App/Widgetの暗号署名とアーカイブが成功した。Windowsでも両ターゲットの1.0.25/33・両プロファイル・本番iOS広告・撮影server URLなし・自己破棄SW・今回のSwipeSurfaceをIPA実体で照合した。

IPAは`C:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261023/ios-1.0.25-33-run39809536547/Multi-calendar.ipa`、8,529,694 bytes、SHA256 `d5d241b38b29a6d04261dd3da3bed583db5ec6f5a2e72416cb7b0aa18ce11f69`。署名検証の暗号処理はMac側で行い、Windows確認と区別する。

送信定義9fada19で生成run・IPAハッシュ・33番を固定。[送信CI39811132830](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/39811132830)は成功し、2026-10-23 01:08:23 JSTにエラーなし受領を確認。Delivery UUIDはf9d987d9-a1ac-499c-a8e1-7ec5d3317f7c。Appleの処理完了と審査送信はこのアップロード受領とは別に確認する。

## iOS33の審査提出と保護範囲

Apple公式APIで33/VALID・1.0.25を確認後、旧32提出の5項目を秘密なしのapple33-plan.jsonへ保存して取消。CANCELINGからCOMPLETE・アプリDEVELOPER_REJECTEDになったのを待って33を選択した。既存の審査アカウント・連絡先等をメモリ内で比較し、notes以外の全フィールド不変を確認。今回の操作を3700文字の審査メモへ反映し読戻し一致を確認した。

日英「このバージョンの最新情報」の変更はAppleが409 STATE_ERROR（whatsNewは現在編集不可）で拒否したため、既存の欄と説明を維持した。変更点は審査メモとAndroidリリースノートへ反映済み。既存内部TestFlight「実機審査確認」へ33を追加し、以前のビルドをすべて維持。テスターやグループを追加・削除していない。

新提出の5項目が保存した旧提出の対象と完全一致することを確認して送信。apple33-submission-verified.jsonに提出・アプリ・ビルドを別取得した結果を保存。個別5項目のREADY_FOR_REVIEW表示は集約WAITING_FOR_REVIEWと区別する。購読の価格・自動更新・販売一覧やDB/Edgeは今回変更していない。

## 作業終了時

自分のPlayタブのみ終了。本人・所有不明の既存4タブは保持した。新しいブラウザータブは残していない。AGENTS.mdは既存の未追跡のまま保持しコミット除外。実機・エミュレーター操作、購入・返金は行っていない。
