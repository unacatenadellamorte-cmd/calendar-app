# Androidウィジェット

## ホーム画面への追加

Multi calendarを一度開いて予定を読み込んだ後、ホーム画面の空いた場所を長押しし、「ウィジェット」からMulti calendarを選ぶ。

- 代表予定: 既存のコンパクトな予定表示。＋から今日の予定を追加。
- 週: 日曜始まりの今週7日を横7列で表示。各列の＋からその日の予定を追加。
- 月: 今月のカレンダー。日付をタップしてその日の予定を追加。

週と月はホーム画面上で縦横にサイズを変更できる。追加操作はアプリの入力画面を開き、保存ボタンを押すと登録される。

## 表示・更新

秘密の予定と、表示をオフにしたカレンダーは表示しない。週・月には通常予定の件名を表示する。
アプリでの予定変更、カレンダー設定の保存、同期、アプリを開き直した際にデータを更新する。アプリを開いていない間のオンライン予定取得は行わず、ホーム画面には最後に同期した予定を表示する。

今回はAndroid用。iOSの既存ウィジェットは従来どおり。

## 開発確認（1.0.11 / versionCode 12）

全920テスト、Android単体18テスト、型検査、アプリlint、Web/Androidビルド成功。エミュレータ上のAppWidgetHostで週/月の描画テスト成功。実機では追加リンクのcold/warm起動、日付引継ぎ、同日再入場を確認した。

描画テストは次のようにエミュレータだけを指定して実行する。

```powershell
adb -s emulator-5554 shell am instrument -w -r -e class jp.ryo.multicalendar.widget.WidgetRenderingTest jp.ryo.multicalendar.test/androidx.test.runner.AndroidJUnitRunner
```
