---
title: '月ウィジェットの予定復旧と月切替応答'
type: bugfix
created: '2026-09-25'
status: done
route: oneshot
baseline_commit: 1609c32a06a694ae8bd20c7ce51e5ad82074663d
---

<frozen-after-approval>
## Intent
月ウィジェットの予定を再び表示し、▲▼の操作から約1秒で対象月の予定と日付が切り替わるよう修正する。ヘッダー配置、予定の色、並び順、月末までの表示を維持する。実データを削除せず、実描画と切替時間で検証する。
</frozen-after-approval>

## Implementation Notes
- 実機の月オフセットは-14（2025年7月）。保存済み予定434件は2026年7月以降、2026年9月は53件。空表示の直接原因はデータ範囲外の月。
- CalendarOverview.kt の日付比較は比較ごとにString.formatを呼び、各セルで全件走査している。数値比較へ置換する。
- MonthNavigationActions.kt の月値をGlanceの状態として更新し、MonthEventsWidget.kt で監視する。SharedPreferences.applyはメモリへ即時反映されるため前回の原因説明を訂正する。
- 月セルの実高と予定件数計算を揃え、予定の行高を明示する。
- WidgetRenderingTest.ktで大量予定・月移動・表示領域と色を検証。実機の月を今月へ戻して予定表示を確認する。
- 実機で「There are too many views」を再現。1予定4部品の構造がGlanceのView数制限を超過していた。色マーカーと件名を1つのTextへ統合。最大4件と超過件数、日付の7列・全週を維持。
- セル上下余白4dpを容量計算に含め、日付のfillMaxWidthとweightの競合を除去して超過件数の幅を確保。
- Android単体テスト、APK/テストAPKビルド成功。描画テスト2件成功。800件・1日5件の8月/9月/10月移動で、日付・予定のレイアウトと色を確認してから計測停止。330/294/290/239ms。
- 実機で2026年8月の予定表示、9月→10月→9月のタップ1秒後スクリーンショットを確認。最終版を実機とエミュレータへ導入済み。実機表示を9月へ復帰。
- 画像: 出力画像/20260925_widget-september-fixed.png、20260925_widget-next-after-1s.png。

## Review Triage Log
- medium: 上下余白4dpが容量計算にない指摘を採用。monthEventLineCapacityを修正。
- medium: 1日1件だけではView上限・複数行を検出できない指摘を採用。800件・各日5件と月末予定へ拡張。
- medium: 正の寸法と祖先領域の検証不足を採用。各祖先でクリップされないことを検証、ホスト内容サイズの契約と明示レイアウトも修正。
- medium: 見出し更新だけの計測を採用。予定更新の待機と日付・予定のレイアウト検証まで含めて1秒以内を判定。
