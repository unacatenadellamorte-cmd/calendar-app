# 入力照合 — PRD → UX スパイン

*対象: `prds/prd-calendar-app-2026-09-06/prd.md` + `addendum.md` vs `DESIGN.md` + `EXPERIENCE.md`。*

## 結論

PRD の 17 FR すべてが EXPERIENCE.md の IA でサーフェスを持つ。落ちた定性的要素は無し。UX 側で足した判断(IA のタブ構成、週ビューの割り切り、色プリセット方針)は [ASSUMPTION] / [NOTE FOR UX] で明示。

## FR → サーフェス対応

| FR | サーフェス |
|---|---|
| FR-1 予定 CRUD | 予定を追加 / 予定の詳細・編集 |
| FR-2 月/週/リスト | カレンダー |
| FR-3 Google 接続 | カレンダーを接続 / connection-card |
| FR-4 取り込み(読取) | カレンダー / State Patterns(取り込み中・失敗・オフライン) |
| FR-5 カレンダー管理 | カレンダー管理 |
| FR-6 優先度設定 | カレンダー管理(ドラッグ)/ §優先度と選抜の挙動 |
| FR-7 視覚的な優先表示 | §優先度と選抜、Component Patterns(month-cell, week-timeline) |
| FR-8 優先度順の並び | §優先度と選抜 |
| FR-9 代表予定の選抜 | §優先度と選抜(選抜ロジック 1–5) |
| FR-10 コンパクトビュー画面 | ホーム / compact-card |
| FR-11 お気に入りシフト登録 | お気に入りシフト管理 |
| FR-12 ワンタップ入力 | quick-shift-sheet / Flow 3 |
| FR-13 実働時間計算 | Flow 3 エッジ(日またぎ) |
| FR-14 当月の給料見込み | 給料見込みの詳細 / pay-card |
| FR-15 トップ画面表示 | ホーム / pay-card |
| FR-16 ログイン | ログイン / アカウント作成、設定 |
| FR-17 エクスポート | 設定 |
| §8.3 プライバシー | State Patterns(破壊的操作の確認)、Accessibility(色非依存) |

## UX で足した判断(PRD に無い、要確認)

- **IA のタブ = ホーム / カレンダー / 設定 の3つ。** カレンダー管理は非タブだがホーム見出しから1タップ。→ [NOTE FOR UX] にタブ化再検討条件を記載。
- **週ビューは v1「1日タイムライン」に割り切り。** → DESIGN.md / EXPERIENCE.md 両方に [ASSUMPTION]。
- **ダークモード = 端末追従。** ユーザー無回答。
- **アクセント青1色、ミニマル方向。** 青はユーザー確定、ミニマルは「Googleカレンダーの見やすさ」からの推定。

## gap

- なし(定性的な取りこぼしは検出されず)。PRD の未解決論点(選抜ロジック詳細 §9-1、データ保管 §9-4、名前)はそのまま UX の Open Questions に引き継ぎ。
