# 撮影テストによる実機アプリ削除と復旧

## 原因

掲載画像の撮影時、接続中の全端末を対象とするconnectedDebugAndroidTestが実行された。実機用のutp.0.logには、本体APKとテストAPKのuninstall_after_test: true、および実機RFCX71396FHに対する「Uninstalling jp.ryo.multicalendar」の記録がある。

ユーザーからアプリ消失の報告後、ユーザー0のインストール済み一覧・削除済みを含む一覧のどちらにもパッケージがないことを確認。アプリの不具合ではなく、こちらのテスト対象指定と後片付け確認のミス。

## 復旧

- 既存の最新版APK（1.0.15、versionCode 16、文字サイズ修正c8e1d89を含む）を実機へinstall -rで導入しSuccessを確認。
- パッケージ存在、MainActivity起動、最前面のActivityを確認。
- 再インストール後、ウィジェット保存予定数は0件。ログイン・端末内設定・ウィジェット配置まで元に戻ったとは確認できていない。
- 予定とタグはSupabase保存の実装だが、ユーザーアカウントの同期済みデータの現存確認は今回していない。再ログイン後の確認が必要。
- 実機テストと一括テスト禁止のルールをandroid/AGENTS.mdへ記録。一時ビルド環境にも同じルールを配置。

## 根拠ログ

`C:/Temp/calendar-app-build/android/app/build/outputs/androidTest-results/connected/debug/SM-F956Q - 16/utp.0.log`の19〜38行付近。ユーザーの予定本文や認証情報は記録しない。
