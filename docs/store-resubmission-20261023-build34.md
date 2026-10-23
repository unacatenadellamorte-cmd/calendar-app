# 週日送り・スタンプ修正の両OS再申請（2026-10-23、34番）

本人の「申請まで完了させて」に基づき、ローカルで確認済みの週・日のページ送り、スタンプ一覧の＋開閉、テーマ連動色、写真の背面復帰修正を1.0.25（34）として両OSへ再提出する。日の写真は既存の設定・権利・OS許可を維持する。

既存のAndroidクローズドテストAlpha、iOS手動公開、地域・テスター・価格・契約を維持する。署名ビルド、ストア受領、審査送信、承認・公開は別々に確認する。旧提出は新しい成果物の受領確認後に必要な範囲で差し替える。実機受入は今回も未確認。

開始時のApple公式APIでは1.0.25（33）・審査待ち・手動公開、新提出c075a41e-4f4c-47c1-a8b2-37c236eafeb4が審査待ち。AndroidはOrca専用タブにGoogleのログイン画面が表示されたため、本人へ既存アカウントでのログインを依頼。まだ最新の審査状態は取得していない。全1801件・型検査・Webビルドとローカルブラウザーのスライド・6テーマ検証は完了。実機・エミュレーターは操作しない。

## ビルドと成果物

製品変更とAndroid34番をb796546として配布ブランチへ反映。iOS署名CIは[39919393273](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/39919393273)、同コミットから1.0.25（34）の生成・署名検証に成功。

Androidの署名ビルドは成功。JUnit52件、失敗・エラー0。Android lintはエラー0・警告47件。AAB実manifestのjp.ryo.multicalendar・1.0.25/34、登録済み証明書SHA1一致、JAR署名検証成功を確認した。JARの自己署名・タイムスタンプ・読取方式関連の警告は残り、署名不一致と区別する。

AABはC:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261023-build34/android34-build/app/outputs/bundle/release/app-release.aab、13,708,494 bytes、SHA256 `ed2990ba8b675fa90dc95fe4448869efb85b20b6cf57854321ca264f45530092`。本番Android広告・撮影用server URLなし・自己破棄SW・ページ送りと＋開閉の実体・ローカル配布資産との一致を確認。同根のandroid34-artifact-verified.jsonが証跡。

iOSはMacで全1801件・型検査・静的検査・Swift12件・主App/Widgetの署名とmanifest検証が成功。WindowsでもIPA実体の両ターゲット1.0.25/34・両プロファイル・本番iOS広告・撮影server URLなし・自己破棄SWと今回のページ送り等のコードを照合した。IPAは同根のios-1.0.25-34-run39919393273/Multi-calendar.ipa、8,530,195 bytes、SHA256 `a10dd66d58fa0cb48aa18f225696f06d903d3610d1684be1bd476d0020a90d28`。暗号署名の検証はMacで行い、Windowsの実体照合と区別する。送信定義は生成run・ハッシュ・34番へ固定した。

## 結果

準備中。提出完了とはまだ扱わない。
