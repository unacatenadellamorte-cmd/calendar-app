---
title: 'Androidウィジェットの週・月表示と予定追加'
type: feature
created: '2026-09-17'
status: done
route: dispatch
baseline_commit: 648a0028dfa3716e2350493f6c6b306be11aabfb
context: []
---
<frozen-after-approval>
## Intent
Androidのホーム画面から今週・今月を確認し、ウィジェットの日付や追加ボタンから予定入力を開始できるようにする。既存の代表予定ウィジェットに加え、週・月を別のウィジェットとして選べる。予定はアプリ内の既存入力レイヤーで保存する。
## Boundaries & Constraints
既存ウィジェットとiOSのデータ互換を維持。秘密予定は解除中も全ウィジェットから除外し、非表示カレンダーも除外。予定の自動作成はせず、入力画面の保存操作を必要とする。外部カレンダー書込制限、6言語、ユーザーの既存データを保つ。Android中心の拡張としiOSネイティブUIは変更しない。
## I/O & Edge-Case Matrix
|状態|操作|結果|
|---|---|---|
|今週・今月に予定あり|週/月widget配置|日曜始まりの各日と予定を表示、今日強調|
|空・不正キャッシュ|widget描画|クラッシュせず日付と追加導線が使える|
|秘密・非表示予定|更新|ペイロードから除外|
|日跨ぎ時刻予定|週/月表示|ローカル暦日の範囲に表示、終了深夜は翌日に含めない|
|widgetの日付/＋|タップ|選択日/今日の予定入力レイヤーを開く|
|アプリ未起動・認証読込中|追加リンク|準備完了後に一度だけ入力を開く|
|不正日付の追加リンク|受信|入力を開かず安全に無視|
|追加シートを閉じ同日再タップ|受信|同じ日も再度入力を開ける|
</frozen-after-approval>
## Code Map
- src/platform/widget.ts と src/app/WidgetSync.tsx: native共有データ、更新を再利用。
- android/app/src/main/java/jp/ryo/multicalendar/widget/: Glance描画とreceiver。新しい週/月と共通日付処理。
- android/app/src/main/res/xml/ と AndroidManifest.xml: providerの名前・サイズ・登録。
- src/platform/deepLink.ts / app/DeepLinkListener.tsx / app/routes.tsx / features/calendar/ui/CalendarScreen.tsx: cold/warmリンクから既存入力への経路。
## Tasks & Acceptance
- [x] Androidに週・月providerと既存widgetの追加ボタン。
- [x] 機密フィルタを保つoverviewデータと3provider更新。更新中の再要求を捨てない。
- [x] createリンクの検証、cold/warm受信、入力レイヤー、消費と再入場。
- [x] TS/Android回帰テスト、型/lint/build、実機でprovider登録と入力導線確認。
Given widget, when 日付から入力, then 日付を引き継ぎ保存はユーザー操作で実施。
Given 既存代表予定widget, when 更新版導入, then 引き続き利用できる。
## Implementation Notes
低コストlunaをAndroid・共有データ・追加ルートに分担。メインが境界、統合とビルド・実機を担当。変更は依頼に基づいて継続し、不要な中間承認は挟まない。
## Verification
Vitest関連と全体、TypeScript、src/packages eslint、Gradle testDebugUnitTest/assembleDebug。実機のホーム画面へのウィジェット配置はランチャー操作が必要なため、配置可否も確認して制限を記録する。

## Review Triage Log
- 月固定幅と6週の高さ超過を修正。各列/行を利用可能領域に等分し、ランチャーの余白も吸収。
- 既存40dp代表予定は追加ボタンを右側へ配置し、ヘッダ追加による見切れを防止。
- カレンダー設定保存完了後にwidget更新。実行中の更新要求は再実行。
- 通常の週一覧→予定入力の戻り先は維持し、widget追加の時だけ背面の詳細・選択日をリセット。

## 検証結果
- Vitest全110ファイル920件成功。最後の戻り先調整後はCalendarScreen51件を再実施して成功。
- 型検査・src/packages eslint・Web本番ビルド成功。
- Android JUnit18件、APK/テストAPKビルド成功。
- エミュレータで実AppWidgetHostによる週/月描画テスト1件成功。日付/件名/＋を確認し、出力画像の目視で下段の見切れなしを確認。
- 実機1.0.11(versionCode12)インストール成功。追加リンクから10月1日の入力、同日再入場、cold起動で10月2日の入力を確認。予定は保存していない。
- Androidホーム画面への週/月配置はユーザーのランチャーで行う。iOSは既存版を維持。
- 最終描画画像: 出力画像/20260917_widget-week-preview.png、20260917_widget-month-preview.png。
