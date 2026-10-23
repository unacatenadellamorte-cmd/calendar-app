# 週日送り・スタンプ修正の両OS再申請（2026-10-23、34番）

## 確定結果

**iOSの1.0.25（34）は審査提出済み。Android34は署名・検証済みだが認証待ちで未アップロード・未申請。両OS完了ではない。**

iOSは2026-10-23 16:56:52 JST、アプリ・購読グループ・3購読版の5項目を[新提出67e0e07a-dc9e-495c-97e5-2d57009a5e31](https://appstoreconnect.apple.com/apps/6817586147/distribution/reviewsubmissions/details/67e0e07a-dc9e-495c-97e5-2d57009a5e31)として送信。16:56:56 JSTの別取得で、提出・アプリとも審査待ち、34/VALID・MANUALを照合。承認・公開・実機受入は未確認。

本人の「申請まで完了させて」に基づき、ローカルで確認済みの週・日のページ送り、スタンプ一覧の＋開閉、テーマ連動色、写真の背面復帰修正を1.0.25（34）として両OSへ再提出する。日の写真は既存の設定・権利・OS許可を維持する。

既存のAndroidクローズドテストAlpha、iOS手動公開、地域・テスター・価格・契約を維持する。署名ビルド、ストア受領、審査送信、承認・公開は別々に確認する。旧提出は新しい成果物の受領確認後に必要な範囲で差し替える。実機受入は今回も未確認。

開始時のApple公式APIでは1.0.25（33）・審査待ち・手動公開、新提出c075a41e-4f4c-47c1-a8b2-37c236eafeb4が審査待ち。AndroidはOrca専用タブにGoogleのログイン画面が表示されたため、本人へ既存アカウントでのログインを依頼。まだ最新の審査状態は取得していない。全1801件・型検査・Webビルドとローカルブラウザーのスライド・6テーマ検証は完了。実機・エミュレーターは操作しない。

## ビルドと成果物

製品変更とAndroid34番をb796546として配布ブランチへ反映。iOS署名CIは[39919393273](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/39919393273)、同コミットから1.0.25（34）の生成・署名検証に成功。

Androidの署名ビルドは成功。JUnit52件、失敗・エラー0。Android lintはエラー0・警告47件。AAB実manifestのjp.ryo.multicalendar・1.0.25/34、登録済み証明書SHA1一致、JAR署名検証成功を確認した。JARの自己署名・タイムスタンプ・読取方式関連の警告は残り、署名不一致と区別する。

AABはC:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261023-build34/android34-build/app/outputs/bundle/release/app-release.aab、13,708,494 bytes、SHA256 `ed2990ba8b675fa90dc95fe4448869efb85b20b6cf57854321ca264f45530092`。本番Android広告・撮影用server URLなし・自己破棄SW・ページ送りと＋開閉の実体・ローカル配布資産との一致を確認。同根のandroid34-artifact-verified.jsonが証跡。

iOSはMacで全1801件・型検査・静的検査・Swift12件・主App/Widgetの署名とmanifest検証が成功。WindowsでもIPA実体の両ターゲット1.0.25/34・両プロファイル・本番iOS広告・撮影server URLなし・自己破棄SWと今回のページ送り等のコードを照合した。IPAは同根のios-1.0.25-34-run39919393273/Multi-calendar.ipa、8,530,195 bytes、SHA256 `a10dd66d58fa0cb48aa18f225696f06d903d3610d1684be1bd476d0020a90d28`。暗号署名の検証はMacで行い、Windowsの実体照合と区別する。送信定義は生成run・ハッシュ・34番へ固定した。

送信定義11bb940から[送信CI39920564095](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/39920564095)を実行し成功。2026-10-23 16:53:21 JST、Appleがエラーなしで受領。Delivery UUIDは3c7e653c-ea8b-45bc-acad-023e1be8e203。処理完了後の34/VALID確認と審査送信は、このアップロード受領とは分けて確認する。

## Androidの接続状況

Orca専用タブのGoogleログイン完了は未確認。Google側で「ログインできませんでした」のタイトルが返った。Windows Computer UseはChromeの現在URLを十分な確度で確認できないとして停止し、Chromeへの入力や別ウィンドウ作成は行っていない。Android34は未アップロード・未申請。認証情報の複製、新規アカウントやAPIキー作成、ブラウザーの安全設定変更はしていない。

## iOSの審査差し替えと保護範囲

Appleの34/VALIDを確認してから、旧33提出の5項目をapple34-plan.jsonへ保存して取消。旧提出COMPLETE・アプリDEVELOPER_REJECTEDへの移行を確認後、34を選択した。審査メモ3759文字を読戻し一致で確認し、notes以外の審査アカウント・連絡先などの保護フィールドはメモリ内比較で不変確認。既存内部TestFlight「実機審査確認」へ34を追加し、以前のビルドを維持した。テスターやグループの追加・削除はない。

既存の説明と更新情報欄は変更していない。新しい変更点は審査メモに反映した。更新情報欄への変更要求は今回は実行しておらず、前回33番の409を今回の応答とは扱わない。購読の価格・販売一覧・契約・DB/Edgeも変更していない。

新提出の5項目と保存した旧提出の対象が完全一致することを確認して送信。apple34-submission-verified.jsonへ提出・アプリ・ビルド・5項目の読戻し結果を保存。各項目のREADY_FOR_REVIEWと集約WAITING_FOR_REVIEWを区別する。

## 残件と再開位置

- Androidの[公開の概要](https://play.google.com/console/u/0/developers/5645797689705270553/app/4972216250695957379/publishing)で本人の認証が必要。既存クローズドテストAlphaへ上記の署名済み34番AABをアップロードし、今回の変更説明を保存して審査送信・別取得確認を行う。地域・テスター・価格・管理対象公開の設定を変えず、一般製品版へ昇格しない。
- Orcaのログイン用タブ1eb99b52-4812-4560-af92-6b73eb795905は本人の認証継続用に保持。本人が使うタブやブラウザーを閉じていない。Chromeには入力していない。
- iOS34を重複提出しない。確認する場合はasc-pages34-20261023.mjsのinspect/verifyだけを使う。cancel/attach/submitは今回実行済み。
- 実機・エミュレーター・実購入・返金・一般公開は未実施。

AGENTS.mdは既存の未追跡のまま保持し、製品コミットから除外した。
