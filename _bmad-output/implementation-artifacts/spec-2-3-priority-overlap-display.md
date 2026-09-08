---
title: 'Story 2.3: 重なった予定の視覚的な優先表示(週・月)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'c916fc573051796aa32a95756f68fee1d8b2dce3'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-priority-list-order.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 予定が重なる・あふれる週/月ビューで優先度が描画に効いていない。週の重なり列(`layoutDayEvents`)は開始時刻順のまま、月セルの3件表示は `groupEventsByDay` を優先度なしで呼んでいて、大事なカレンダーの予定が右に押されたり「他 N 件」に落ちたりする(FR-7)。

**Approach:** Story 2.2 の `@core` 並び規則(`compareEventsForList`)を、週の重なりグループ内の列詰めと、月セルの表示選抜に通す。週は重なりグループ内を優先度順に貪欲列詰めして高い優先度を左端へ。月はセルの `groupEventsByDay` に `priorityOf` を渡し、上位を表示・残りを「他 N 件」に。「他 N 件」はその日を優先度順で見せるリストビューへ遷移する。

## Boundaries & Constraints

**Always:**
- `src/lib/calendar-view.ts` に `makePriorityOf(calendarById): PriorityLookup` を追加(未知 id は `Number.MAX_SAFE_INTEGER`)。ListView / MonthView / WeekView はこれで `priorityOf` を作る。
- `layoutDayEvents(events, priorityOf = NO_PRIORITY)`: 重なりグループの検出は現行どおり開始時刻順で走査(グループ境界=時間)。確定したグループ内の列詰めのみ `compareEventsForList(a, b, priorityOf)` 順にする ── 優先度が高い予定ほど先に処理され、空いている最小の列番号(=左)を取る。`columnCount` はそのグループの実列数。`positioned` の出力順は現行どおり開始時刻順。
- `priorityOf` 省略時(`NO_PRIORITY`)は Story 1.5 と同じ列割り当て(回帰なし)。
- `MonthView`: `groupEventsByDay(events, makePriorityOf(calendarById))` へ差し替え。表示は先頭 `MAX_CHIPS` 件、残りが「他 N 件」。
- `WeekView`: `layoutDayEvents(dayEvents, priorityOf)`。終日帯の並びも `compareEventsForList(a, b, priorityOf) || a.title.localeCompare(b.title)` 順。
- `CalendarScreen` の `openOverflow(date)`: `jumpTo(date)` + `setView('list')`(週ではなくリスト。その日を優先度順で一覧できる)。
- 優先度を変えたら再読み込みなしで反映(`calendarById` が変われば各 `useMemo` が再計算される)。
- 変更する純関数・表示選抜に単体テストを揃える。

**Never:**
- `packages/core` の変更(`compareEventsForList` をそのまま使う)。
- 重なり列数の上限(キャップ)と z-index による「前面」表示 ── v1 は常に左右タイル。deferred(下記 Design Notes)。
- 代表予定の選抜(`selectFeaturedEvents`)は Story 2.4、ホームのコンパクトビューは Story 2.5。
- `calendars` / `events` テーブル・マイグレーション・data-access の変更。UI コンポーネント内に新しいソートロジックを書くこと(すべて `@core` / `calendar-view.ts` 経由)。
- 週ビューの複数日横並び(将来)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|---|---|---|
| 週・別カレンダーの重なり | 優先度1の 13:00–13:30 と優先度2の 13:00–14:00 | 優先度1が column 0(左)、優先度2が column 1(右) |
| 週・同カレンダーの重なり | 同カレンダーの 10:00–11:00 と 10:30–11:30 | 開始時刻順で 10:00 が左、10:30 が右 |
| 週・重ならない隣接 | 9:00–10:00(優先度1)と 10:00–11:00(優先度0) | 別グループ。どちらも全幅(columnCount 1)。優先度で列は増えない |
| 月セル・あふれ | 同日に優先度0のカレンダー2件・優先度1のカレンダー2件 | 優先度0の2件 + 優先度1の1件を表示、優先度1の残り1件が「他 1 件」 |
| 「他 N 件」タップ | 月ビューでタップ | その日へ移動しリストビューに切替。その日の予定が優先度順(同順は開始時刻順) |
| `priorityOf` 省略 | `layoutDayEvents(events)` | Story 1.5 と同じ列割り当て |
| 未知カレンダー | `priorityOf` に無い calendarId | 最下位相当(`Number.MAX_SAFE_INTEGER`)。例外にしない |

</frozen-after-approval>

## Open Questions

*(なし ── 下記 [ASSUMPTION] 2点はユーザーの「無回答なら仮定を置いて前進」方針に従い決定として確定。Design Notes 参照。)*

## Code Map

- `src/lib/calendar-view.ts` -- `layoutDayEvents`(週の列詰め、L127〜)、`groupEventsByDay(events, priorityOf = NO_PRIORITY)`(Story 2.2 で priority 対応済み)、`NO_PRIORITY` 定数、`@core` から `compareEventsForList` / `PriorityLookup` を import 済み。ここに `makePriorityOf` を追加し `layoutDayEvents` を改修。
- `src/lib/calendar-view.test.ts` -- `layoutDayEvents` / `groupEventsByDay` の既存テスト。priority 版と `makePriorityOf` を追加。
- `src/features/calendar/ui/MonthView.tsx` -- `groupEventsByDay(events)` を呼ぶ(L32)。`calendarById` 受領済み。`MAX_CHIPS = 3`、「他 N 件」→ `onOverflowTap(cell.date)`。
- `src/features/calendar/ui/WeekView.tsx` -- `layoutDayEvents(dayEvents)`(L41)、終日帯の `.sort((a,b)=>a.title.localeCompare(b.title))`(L38-40)、`positioned.map` で `left: ${p.column * widthPct}%`(L105〜)。
- `src/features/calendar/ui/ListView.tsx` -- 既に inline `useMemo` で `priorityOf` を作成(L20-23)。`makePriorityOf` 経由へ寄せる(挙動不変)。
- `src/features/calendar/ui/CalendarScreen.tsx` -- `openOverflow`(L61-64)が `setView('week')`。`calendarById`(L35)は各ビューへ既に渡している。
- `src/features/calendar/ui/{MonthView,WeekView,CalendarScreen}.test.tsx` -- 重なり・あふれ・overflow 遷移のテストを追加/更新。
- `packages/core/src/priority.ts` -- `compareEventsForList` をそのまま使う。**変更しない。**

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/calendar-view.ts` -- `makePriorityOf(calendarById)` 追加。`layoutDayEvents(events, priorityOf = NO_PRIORITY)`: グループ検出は開始時刻順のまま、グループ内の貪欲列詰めを `compareEventsForList` 順に。出力は開始時刻順を維持
- [x] `src/lib/calendar-view.test.ts` -- `layoutDayEvents` の優先度順列詰め(別カレンダー重なりで高優先度が column 0)、隣接非重なりで列が増えないこと、`priorityOf` 省略時の回帰、`makePriorityOf`(既知・未知 id)
- [x] `src/features/calendar/ui/MonthView.tsx` -- `makePriorityOf(calendarById)` で `priorityOf`、`groupEventsByDay(events, priorityOf)` へ
- [x] `src/features/calendar/ui/MonthView.test.tsx` -- 優先度違い4件で高優先度3件を表示・低優先度が「他 1 件」
- [x] `src/features/calendar/ui/WeekView.tsx` -- `layoutDayEvents(dayEvents, priorityOf)`、終日帯を `compareEventsForList(a,b,priorityOf) || title` 順に
- [x] `src/features/calendar/ui/WeekView.test.tsx` -- 別カレンダー重なりで高優先度が `left: 0%`、終日帯の優先度順
- [x] `src/features/calendar/ui/ListView.tsx` -- inline の `priorityOf` を `makePriorityOf` 経由へ(挙動不変)
- [x] `src/features/calendar/ui/CalendarScreen.tsx` -- `openOverflow` を `jumpTo(date)` + `setView('list')` に。関数コメントを更新
- [x] `src/features/calendar/ui/CalendarScreen.test.tsx` -- 「他 N 件」タップでその日へ移動してリストビューへ切り替わる

**Acceptance Criteria:**
- Given 週ビューで別カレンダー(優先度差あり)の予定が時間で重なる, when 表示, then 優先度が高い方が左の列(column 0)、低い方が右の列に置かれる
- Given 週ビューで時間が重ならない隣接予定, when 表示, then 優先度に関係なく別グループ・全幅で、列は増えない
- Given 月ビューで1セルに4件(優先度の異なる2カレンダーに2件ずつ), when 表示, then 優先度の高い3件が出て、残り1件が「他 1 件」に畳まれる
- Given 月ビューで「他 N 件」をタップ, when 実行, then その日へ移動してリストビューに切り替わり、その日の予定が優先度順(同順は開始時刻順)で並ぶ
- Given カレンダーを並べ替えた後, when 週/月ビューへ移動, then 再読み込みなしで重なり順・積み順が変わる
- Given `layoutDayEvents` を priorityOf なしで呼ぶ, when 実行, then Story 1.5 と同じ列割り当て
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- **グループ検出と列詰めの分離を実装**: `layoutDayEvents` は開始時刻順(`startMin → endMin → title`)でグループ境界を決め、確定したグループ内でだけ `compareEventsForList` 順に貪欲列詰めする。列割り当ては `Map<TimedItem, number>`(オブジェクト参照キー。`event.id` 重複でも列が潰れない)で保持し、出力は `group`(開始時刻順)を辿って組み立てる。
- **`makePriorityOf` は `ReadonlyMap` を受ける**: `Map<string, Calendar>` を `Map<string, {priority}>` へ直接渡すと Map の不変性で型エラーになる。読み取り専用の `ReadonlyMap<string, {priority: number}>` にして共変にした。ListView / MonthView / WeekView が `useMemo(() => makePriorityOf(calendarById), [calendarById])` で使う。
- **WeekView 終日帯**: `compareEventsForList(a, b, priorityOf) || a.title.localeCompare(b.title)`。1日表示なので `eventDate` は全件同じ → 実質「優先度 → タイトル」順。
- **「他 N 件」→ リストビュー**: `openOverflow` は `jumpTo(date)` + `setView('list')`。Story 1.5 の週ビュー遷移から変更。DateNav はリストで非表示だが、リストは `scrollTo=cursor` でその日へスクロールするので着地は保たれる。
- **テスト**: 207(+8)。`calendar-view.test`(列詰め優先度順 / 隣接非重なりで列不増 / 省略時回帰 / `makePriorityOf`)、`WeekView.test`(左端 / 終日帯)、`MonthView.test`(あふれ選抜)、`CalendarScreen.test`(overflow → 別日リスト)。
- **未検証(実ブラウザ)**: 並べ替え後に週/月へ移動して再読み込みなしで重なり順・積み順が変わること。ロジックは純関数テストと `useMemo` 依存で構成上担保。

## Spec Change Log

*(なし。bad_spec / intent_gap ループバックなし。)*

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=5。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `layoutDayEvents` の列割り当てを `event.id` キーの Map にしていて、万一 id が重複すると両者が同じ列に潰れる(旧実装は独立列) | id は UUID で重複しない前提だが、防御を安くできる | low | patch: `Map<TimedItem, number>`(オブジェクト参照キー)へ。`?? 0` は到達不能になるが型のため残す |
| `CalendarScreen` の「他 N 件 → list」テストが overflow 日 = 今日の cursor で、`jumpTo` が cursor を動かす経路を通っていない | `openOverflow` の `jumpTo(date)` は無条件で自明に正しいが、テストが弱い | low | patch: テストの予定を 9/18(非今日)に。移動先の見出し「9月18日(金)」を確認 |
| グループ内優先度順の貪欲列詰めは、3件以上が推移的に連なる重なりで時間順詰めより列が1本増えうる(列インフレ) | spec Design Notes / deferred-work で「個人カレンダーで三重予約は稀」として明示・許容済み。列内ギャップ挿入まで行う最適割り当てはスコープ外 | low | reject(意図的な許容。実挙動をピン留めするテストは非日常経路への追加コストで見送り) |
| 並べ替え → 週/月ビューで再読み込みなしに反映されることの統合(再レンダー)テストが無い | `useMemo([dayEvents, priorityOf])` / `priorityOf` は `calendarById` 依存の標準パターン。純関数の並べ替えは単体テスト済み、各ビューが `priorityOf` を渡すことも検証済み | low | reject(Story 2.2 と同じ判断。標準 useMemo パターン) |
| overflow の遷移先がリストになり、リストは DateNav 非表示なので日移動の導線が週ビューより弱くなる | AC / EXPERIENCE.md が「その日の全予定を優先度順で一覧」を要求しており、リスト遷移は intent 準拠。リストは該当日へスクロールして着地する | low | reject(intent が一覧表示を選んでいる。週ビュー維持はむしろ AC に反する) |
| priority 順イテレーションで `colEnds[c] = item.endMin` が小さい値で上書きされ、後続の重なり判定を誤らないか | 列再利用のガードが `colEnds[c] <= item.startMin` かつ常に `item.startMin < item.endMin` なので新値は必ず厳密に大きい(単調増加)。情報損失なし | false | reject(不変条件で反証) |

## Design Notes

- **グループ検出と列詰めを分離する**: 重なりグループの境界は「時間」で決まる(開始時刻順の走査で、次の予定がグループ最終終了時刻以降なら新グループ)。ここを優先度順にすると時間的に離れた予定が同一グループに引き込まれ、無関係な予定まで列が割れて幅が細る。そこでグループ検出は現行のまま、確定したグループ内でだけ `compareEventsForList` 順に貪欲列詰めする。
- **列数インフレの限界**: 3件以上が推移的に連なる重なりでは、グループ内を優先度順に詰めると時間順詰めより列が1本増えることがある(優先度が中央→端で時間交差するケース)。個人カレンダーで三重予約は稀なため許容。列内ギャップへの挿入まで行う最適割り当てはスコープ外。
- **[ASSUMPTION] 「他 N 件」の遷移先はリストビュー**: FR-7「その日の全予定を優先度順(同順は開始時刻順)で見られる」/ EXPERIENCE.md「その日の全予定を優先度順で一覧」の文言に合わせる。Story 1.5 は週ビューへ遷移していたが、週は時間軸が主で優先度順の一覧にならない。リストビューは Story 2.2 で日内優先度順になっている。対案(週ビュー維持 + 終日帯のみ優先度順)は一覧性で劣る。
- **[ASSUMPTION] 「前面」(z-index)表示は deferred**: FR-7「左右に並べきれない場合は優先度が高いものを前面に」。v1 は列数の上限を設けず常にタイルするため「並べきれない場合」が発生しない。列キャップ + z-index は密な日の可読性課題として `deferred-work.md` へ送る。
- **`makePriorityOf` に集約**: 3ビュー共通の `calendarById.get(id)?.priority ?? Number.MAX_SAFE_INTEGER` を1関数に。UI は優先度ルックアップの生成だけを持ち、比較規則は持たない(AD-10)。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス
- `npm run build` -- 成功

**Manual checks:**
- `npm run dev`(Supabase 接続時): カレンダー管理で並べ替え → 週ビューで重なった予定の左右が優先度順に、月ビューでセルの3件が高優先度から、「他 N 件」でその日のリストへ移動して優先度順に並ぶこと。
