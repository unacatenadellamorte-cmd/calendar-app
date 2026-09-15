---
title: 'カレンダー画面の「週」タブを「日」に改名'
type: 'bugfix'
created: '2026-09-15'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `src/features/calendar/ui/WeekView.tsx` は実装コメントに明記されている通り「v1は cursor 当日の1日タイムライン(複数日横並びは将来)」であり、実際には1日分のタイムラインしか表示しない。しかし `ViewSwitcher.tsx` のタブ表示ラベルは「週」のままで、実際の中身(1日表示)と一致していない。

**Approach:** `ViewSwitcher.tsx` の `ITEMS` 配列にある `{ value: 'week', label: '週' }` の `label` だけを `'日'` に変更する。`ViewMode` の内部値(`'week'`)・コンポーネント名(`WeekView`)・ルーティング・localStorage 永続キー等、表示ラベル以外の内部実装は一切変更しない(影響範囲を表示文字列1箇所に限定する)。既存テストで「週」という文言をアサートしている箇所があれば「日」に合わせて更新する。

</frozen-after-approval>

## Implementation Notes

`ViewSwitcher.tsx` の `label: '週'` を `label: '日'` に変更(内部値 `'week'`・`WeekView`・ルーティング・localStorage永続キーは無変更)。typecheck/lint/test/build すべて green(642 tests、既存テストに「週」ラベル直接参照は無かったため影響なし)。

## Review Triage Log

Blind Hunter(1件必須のところ6件検出、関連ファイルまで確認)を実施、実ソース照合の上でトリアージ:

- `ViewSwitcher.tsx`/`CalendarScreen.tsx` の doc comment が「週」のまま新ラベルと矛盾 — **low、patch**。両ファイルの該当コメントを「日」+内部値`'week'`のまま、という補足付きに更新。
- タブ切替のテストが「日」ラベルに対して存在しない(将来の退行を検知できない) — **low、patch**。`CalendarScreen.test.tsx` に「日」タブクリック→`WeekView`のスロットボタン描画を確認するテストを追加。
- `EventFormSheet.tsx`/`EventChip.tsx` の「週ビュー」コメント — **false**。これらは内部コンポーネント`WeekView`自体を指す開発者向け記述で、その内部名は今回変更していないため矛盾していない。
- `WeekView.tsx` の doc comment に `ViewSwitcher.tsx` への相互参照が無い — **reject(low、費用対効果薄い)**。既存コメントはWeekView自身の挙動として事実に反しておらず、相互参照の追加は必須の修正というより任意の改善。
- 「日」という1文字ラベルが「日曜日」等と紛らわしいというUX指摘 — **reject(vague)**。具体的な失敗シナリオを伴わない主観的懸念で、真であっても low 相当。
- 仕様書のクローズ処理(status更新・Implementation Notes記載)が未了 — レビュー対象のコード欠陥ではなく本ステップ自身の残作業。このFinalizeで対応済み。
