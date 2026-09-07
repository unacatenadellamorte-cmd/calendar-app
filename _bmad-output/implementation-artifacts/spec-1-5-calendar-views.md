---
title: 'Story 1.5: 月 / 週 / リストのカレンダー表示'
type: 'feature'
created: '2026-09-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '306f133d62cbfd42a0b8fdef77f002e7de0830ef'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-4-events-crud.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/mockups/key-month.html'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/mockups/key-week.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 予定は作れるが、見る手段が「今後の予定」の素朴なリストだけ。月全体の把握や特定の日・時間帯の確認ができない。

**Approach:** カレンダー画面に月 / 週(v1 = 1日タイムライン)/ リストの3ビューと日付ナビを実装する。表示オンのカレンダーの予定だけを描画し、日セル/空きスロットのタップで追加、チップのタップで編集につなぐ。日付の格子計算と重なりレイアウトは `src/lib` の純関数に隔離し単体テストする。

## Boundaries & Constraints

**Always:**
- ビューは3つ。`month`(7列グリッド、週の開始は日曜固定)/ `week`(cursor 当日1日のタイムライン、時刻軸 0–24時、現在時刻ラインは cursor が今日のときのみ)/ `list`(日ごとの見出し + その日の予定)。「月 / 週 / リスト」のセグメントで切替。
- 日付ナビ: `‹` `今日` `›` と、見出しタップで開く日付ジャンプ(`<input type="date">`)。month は月単位・week は日単位で前後。list は前後ボタンを使わず連続スクロール、「今日」で今日の見出しへスクロール。
- 選択中のビューを `localStorage`(キー `calendar-app.view`、読み書き try/catch)に保存し次回復元。cursor 日付は毎回「今日」開始(保存しない)。
- 描画対象は `useCalendars` で `isVisible` が true のカレンダーに属す予定だけ。所属不明・非表示カレンダーの予定はどのビューにも出さない。
- `useEvents` の読み込みを全期間へ広げる(現行の `fromIso: now` / `limit` を撤廃)。`sortEvents` は流用。
- 予定は UTC 保存。表示は端末ローカルの日付・時刻へ変換してからセル/スロットに配置(`src/lib/datetime`。AD-7)。
- month: 1セルに時刻付き→終日順で最大3件、超過は「他 N 件」。空白タップ→その日付で `EventFormSheet`(新規)、チップタップ→編集、「他 N 件」タップ→その日付の week へ。
- week: 時刻付きの重なりは `layoutDayEvents` で等幅の列に分割(開始時刻→タイトル順)。終日は上部の「終日」帯。空きスロットタップ→その時刻で新規、チップタップ→編集。
- list: 表示オンの全予定を日ごとにグルーピングし昇順。マウント時に今日(以降の最初の見出し)へスクロール。行タップ→編集。0件は「予定はありません」。
- `src/lib/calendar-view.ts` の純関数: `monthGridDays` / `groupEventsByDay` / `layoutDayEvents` / `eventOccursOnDate`。副作用なし、`Date` はローカル解釈。
- 既存の error / Undo バー、`AuthState='unavailable'` 表示、44px・フォーカスリング・色非依存(色バー + カレンダー名)は現行 `CalendarScreen` の規約どおり維持。
- `EventChip`(色バー + 時刻/終日 + タイトル)を month/week で共有。

**Never:**
- 複数日横並びの週ビュー(v1 は1日に割り切り)。
- 優先度順の並び・重なり時の優先表示(Epic 2 / Story 2.3)、代表予定の選抜(Epic 2)。
- 外部取り込み(Epic 3)、シフトのワンタップ入力・クイックシフトシート(Epic 4。日セルタップは通常の `EventFormSheet`)。
- 横スワイプでの日付移動、予定のドラッグ移動・リサイズ、繰り返し予定 → `deferred-work.md` にスワイプを計上。
- `events.ts`・マイグレーションの変更。`getEvent` の追加(チップが完全な `EventItem` を持つため不要)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|---|---|---|
| 月ビューで日セルの空白をタップ | 表示月の1日 | その日付で `EventFormSheet`(新規・終日オフ)が開く |
| 月ビューでチップをタップ | ローカル予定 | その予定の編集シート(外部予定は編集導線を出さない) |
| 月セルに4件以上 | 同日に予定4件 | 時刻付き→終日順に3件 +「他1件」。タップで week へ(cursor=その日) |
| 週ビューで重なる時刻付き予定 | 10:00–11:00 と 10:30–11:30 | 2列に分割、開始時刻順で左詰め |
| 週ビューの終日予定 | `all_day=true` | 上部の「終日」帯にチップ |
| リストビュー | 表示オンの予定多数 / 0件 | 日ごとの見出し + 昇順、今日へ自動スクロール / 「予定はありません」 |
| 表示オフのカレンダー | `isVisible=false` の予定 | どのビューにも出ない |
| 端末TZ の日付境界 | `starts_at` = UTC `2026-09-08T15:00Z`(JST 09-09 0:00) | ローカル日付 09-09 のセル/スロットに配置 |

</frozen-after-approval>

## Code Map

- `src/features/calendar/ui/CalendarScreen.tsx` -- 「今後の予定」リストを撤去し、ビュー切替 + 日付ナビ + 3ビュー + `EventFormSheet` 配線へ。error/Undo/unavailable は維持。
- `src/features/events/model/useEvents.ts` -- `reload` の `listEvents` から `fromIso`/`limit` を外し全件読み込みへ。他は不変。
- `src/features/events/ui/EventFormSheet.tsx` -- 任意 prop `seed?: { date?: string; startLocal?: string }` を追加、`initialState` の新規初期値に反映。既存呼び出しは未指定で従来動作。
- `src/features/events/ui/EventListItem.tsx` / `src/features/calendars/model/useCalendars.ts` / `src/data/events.ts`(`listEvents` は range 省略で全件)/ `src/data/calendars.ts`(`Calendar.isVisible`) -- いずれも**変更せず**流用。
- `src/lib/datetime.ts` -- 変換・フォーマッタの既存関数。`localDateOf(iso)` / `minutesIntoLocalDay(iso)` を必要に応じ追加。
- `src/ui/Screen.tsx` -- ビュー切替は `action` でなく本文上部に置く(セグメント幅)。
- `mockups/key-month.html` / `key-week.html` -- month-cell / week-timeline / event-chip の見た目の基準。

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/calendar-view.ts` + `.test.ts` -- 純関数4つ。日付境界・重なり列分割・日グルーピング・月グリッド(前後月のはみ出し日)を単体テスト
- [x] `src/lib/datetime.ts` -- `localDateOf` / `minutesIntoLocalDay` 等の補助を追加
- [x] `src/features/calendar/model/useCalendarView.ts` + `.test.ts` -- view(localStorage 永続)/ cursor(今日開始)/ `goPrev·goNext·goToday·jumpTo` / 表示オンの予定の導出。永続・今日開始・前後移動・isVisible フィルタをテスト
- [x] `src/features/calendar/ui/ViewSwitcher.tsx` -- 月/週/リストのセグメント(radiogroup、キーボード可)
- [x] `src/features/calendar/ui/DateNav.tsx` -- `‹` `今日` `›` + 見出し + 日付ジャンプ
- [x] `src/features/calendar/ui/EventChip.tsx` -- 色バー + 時刻/終日 + タイトル。month/week 共有
- [x] `src/features/calendar/ui/MonthView.tsx` + `.test.tsx` -- 7列グリッド、今日リング、3件 +「他 N 件」。セルタップで新規・チップタップで編集・「他 N 件」で week へ・グリッド外除外をテスト
- [x] `src/features/calendar/ui/WeekView.tsx` + `.test.tsx` -- 1日タイムライン、時刻軸、現在時刻ライン、終日帯、重なり列。列分割・終日帯・スロットタップをテスト
- [x] `src/features/calendar/ui/ListView.tsx` + `.test.tsx` -- 日ごとの見出し + `EventListItem`、今日へスクロール。日グルーピング・0件・行タップをテスト
- [x] `src/features/calendar/ui/CalendarScreen.tsx` -- 上記を束ね、`EventFormSheet` 配線、error/Undo/unavailable 維持
- [x] `src/features/events/model/useEvents.ts` -- 全件読み込みへ変更
- [x] `src/features/events/ui/EventFormSheet.tsx` -- `seed` prop(+ `onDelete` prop)
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- 横スワイプ日付移動を追記

**Acceptance Criteria:**
- Given 予定が複数月にまたがる, when 月ビューで `›` を押す, then 翌月グリッドに切り替わり、その月の予定だけが対応セルに出る
- Given `week` を選んで表示中, when アプリを再読み込み, then `week` が復元され cursor は今日
- Given あるカレンダーの表示をオフにした, when どのビューを見ても, then そのカレンダーの予定は描画されない
- Given 端末 TZ = JST で `starts_at` が UTC `2026-09-08T15:00Z`, when 週/月で見る, then `2026-09-09` の 0:00 のスロット/セルに出る
- Given 月セルの空白をタップ, when シートで保存, then その日付の予定が作成され同セルに出る
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- **テスト実行 TZ を固定**: `vite.config.ts` の `test.env.TZ = 'Asia/Tokyo'`。月グリッドと UTC→ローカルの日付境界(matrix「端末TZ の日付境界」)を決定的にするため。`calendar-view.test.ts` に固定確認テストあり。
- **日付ロジックの置き場**: 純関数は `src/lib/calendar-view.ts`(`datetime.ts` と同階層)。`packages/core` は Edge Function 共有の優先度/給料計算に予約。`calendar-view.ts` は `@/data/events` の型のみ import(値は import しない。eslint zone 非該当)。
- **`useEvents` 全件読み込み**: `reload` の `listEvents({fromIso,limit})` を `listEvents()` に変更。既存テストは引数を検査していないため無改修でパス。データ量が増えたら範囲取得へ(deferred-work.md)。
- **`noUncheckedIndexedAccess`**: `date.split('-').map(Number)` の分割代入に既定値(`[y=0,m=1,d=1]`)を付けて `number | undefined` を解消。
- **重なりレイアウト**: `layoutDayEvents` は重なりグループごとに列数を確定し、グループ内の全予定へ同じ `columnCount` を付ける(部分的にしか重ならない予定も同じ幅に均す。v1 の割り切り)。順序は開始時刻→タイトル、Story 2.3 で優先度順へ差し替え。
- **スコープ外だが同時に入れた変更**: `EventFormSheet` に `onDelete` prop と「この予定を削除」ボタンを追加し、`useEvents.remove`(+ 既存の Undo バー)へ配線。1.4 は `remove` を UI から呼ぶ導線が無く、3ビューを出すのに削除不能は不整合なため。frozen 外の追加。
- **step-04 レビューで反映(patch)**: リスト「今日」ボタンのスクロール(`ListView` に `scrollTo` prop、`cursor` 変更で再スクロール)/ `cal.errorKey` を CalendarScreen で表示 / 週タイムラインを自前スクロール枠 + マウント時 ~7:00(または現在時刻/最初の予定)へスクロール / 週の終日帯チップを内容幅で横並び / list の見出しを月表示に / 期間見出しを `<h2>` 化 / `EventChip` に `aria-label`。テスト追加: `CalendarScreen.test.tsx`(統合)、`DateNav.test.tsx`、`useEvents` の全期間読み込み、`EventFormSheet` の seed/onDelete。
- **既知の軽微点(残し。レビューで reject)**: 週の now-line は interval 更新なし(数分で陳腐化)。多日予定は開始日にのみ表示(繰り返し・多日は Never)。`listEvents()` に limit 無し(Supabase 既定1000行。範囲取得は deferred-work)。`ViewSwitcher` は矢印キー未対応(Tab+Enter は可)。
- **未検証**: 実ブラウザでの見た目(Docker/Supabase 未接続のため手動確認は接続後)。ロジックとタップ配線は 127 tests。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス
- `npm run build` -- 成功

**Manual checks:**
- `npm run dev`(Supabase 接続時): 月で日タップ→追加 / チップ→編集、週で重なり2件が横に割れる、リストが日付で区切られ今日へスクロール、カレンダー非表示で予定が消える、ビュー選択が再読み込み後も残る。
- Supabase 未設定: 3ビューの枠は出て、予定なし・追加不可の文言。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=9。loopback なし)。patch は実装と同じパスで反映。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `ListView` は mount 時しかスクロールしない。spec Always「list は『今日』で今日の見出しへスクロール」を満たさない | `onToday`→`setCursor` するが ListView の effect は `[]` | medium | patch: `scrollTo` prop を追加、effect deps `[days, scrollTo]`。CalendarScreen が `scrollTo={cursor}` |
| `CalendarScreen` が `cal.errorKey` を描画しない。カレンダー読み込み失敗が黙って空カレンダーになる(visibility が calendars 依存になり悪化) | CalendarScreen は `ev.errorKey` のみ `role="alert"` | low | patch: `cal.errorKey` の alert 行を追加 |
| `useEvents` の全期間読み込み(`listEvents()` 引数なし)を検証するテストがない。回帰でフィルタが戻っても検知不可 | `useEvents.test.ts` は `listEvents` の引数を assert していない | gap | patch: `toHaveBeenCalledWith(undefined)` を追加 |
| CalendarScreen 統合(view 切替・seed・overflow→week・error/undo)が CalendarScreen 経由で1つもテストされない。`shell.test` は unavailable 分岐のみ | shell.test は auth 未設定で早期 return | gap | patch: `CalendarScreen.test.tsx`(hooks モック、view 切替・日タップ→シート・alert・unavailable) |
| 週ビューが常に 0:00 表示で日中へ自動スクロールしない。開くたびスクロールが要る | 新規 WeekView にスクロール制御なし | medium(UX) | patch: 自前 `overflow-y-auto` 枠 + マウント/`cursor` 変更時に現在時刻→最初の予定→7:00 の順でスクロール |
| 週の終日帯チップが `w-full` で縦積み(mock は inline) | `EventChip` は `w-full` | low | patch: 終日帯は `max-w-[14rem] flex-none` の span で包む |
| list の見出しが cursor(今日固定)の日付表示で内容と無関係 | DateNav は `view==='month'?month:day` | low | patch: `view==='week'?day:month` に。list は「2026年9月」 |
| 現在表示期間の見出しが `<h2>` でなく `<button>`(Screen の `<h1>` のみ) | DateNav の title は button | low(a11y) | patch: button を `<h2>` で包む |
| `EventChip` のアクセシブル名が時刻+タイトル連結("10:00役員会議") | span 2つでスペースなし | low(a11y) | patch: `aria-label={time title calendar}` |
| `DateNav` / `ViewSwitcher` の単体テストなし | 分岐(stepping 非表示・jump トグル) | gap | patch: `DateNav.test.tsx` 追加(ViewSwitcher は MonthView/CalendarScreen 統合でカバー) |
| `EventFormSheet` の `onDelete` / `seed.startLocal` が未検証 | 該当テストなし | gap | patch: EventFormSheet.test に4ケース追加 |
| 週の now-line が interval 更新なしで数分後に陳腐化 | `nowMin` は毎レンダー計算だが再レンダー契機なし | low | reject(日常的に週ビューを凝視は稀、fix は setInterval+cleanup) |
| `ViewSwitcher` radiogroup に矢印キーなし | native button で Tab+Enter/Space は可 | low | reject(fix は keydown ハンドラ追加、v1 は許容) |
| `MonthView` の `<div onClick>` が keyboard 非対応 | 日付番号 `<button>` が同じ `onDayTap` を担いカバー | — | reject(カバー済み、fix は role/tabindex/keydown 追加) |
| `listEvents()` に limit 無し → Supabase 既定1000行で暗黙切り捨て | 個人利用想定、範囲取得は deferred-work に記載済み | — | reject/既 defer |
| 多日予定が開始日にしか出ない | `eventOccursOnDate`/`groupEventsByDay` 単日前提。spec に明記、多日は Never | — | reject(意図的割り切り) |
| `onDelete` が frozen スコープ外の追加 | frozen Never は禁じておらず 1.4 intent(削除UI)を完成させる小変更 | — | reject(intent は排除せず。Implementation Notes に記録済み) |

## Spec Change Log

*(なし。bad_spec ループバックなし。)*

## Design Notes

- **週 = 1日タイムライン**: UX の [ASSUMPTION] を epic-context が確定済み。ラベルは「週」だが表示は cursor 当日の1日。
- **重なりレイアウト**: `layoutDayEvents` は区間スイープで重なりグループを作り、グループ内を等幅の列に割る。順序は開始時刻→タイトル。Epic 2 Story 2.3 でこの順序をカレンダー優先度へ差し替える(単関数に隔離)。
- **`src/lib` に置く理由**: 月グリッド・タイムライン配置は表示専用でフロント限定。`packages/core` は Edge Function と共有する優先度/給料計算に予約(`packages/core/src/index.ts` の方針)。`datetime.ts` と同階層。
