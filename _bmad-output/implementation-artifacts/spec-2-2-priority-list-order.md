---
title: 'Story 2.2: 優先度ユーティリティと一覧・リストの並び'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '88fb4eff3f10a49642aa2a8be73fc89310eb2827'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-1-calendar-priority.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** カレンダーに優先度は付けられる(Story 2.1)が、その順序が予定リストに効いていない。大事なカレンダーの予定が上に来ない。

**Approach:** 並び規則を `packages/core` の純関数1つに集約する(AD-5 / AD-10)。フロントの UI・view-model はその場でソートを書かず、この関数を通す。予定リスト(Story 1.5 の `ListView`)の日内の並びを「所属カレンダーの優先度順、同順位内は時刻付き→終日→開始時刻順」に差し替える。カレンダー一覧は Story 2.1 で既に優先度順なので、その比較もこの関数経由にする。

## Boundaries & Constraints

**Always:**
- `packages/core` に `priority.ts` を追加(`index.ts` から re-export)。core は何も import しない葉のまま。副作用・I/O なし。
- core の正規入力型 `OrderableEvent { calendarId, allDay, startsAt: string|null, eventDate: string|null }`(camelCase・UTC ISO / `YYYY-MM-DD`)。呼び出し側は自分の型からこの形に合わせて渡す(`EventItem` は構造的にこれを満たす)。
- `compareEventsForList(a, b, priorityOf)`: (1) `priorityOf(calendarId)` 昇順(小さいほど上位、未知は最下位相当) (2) 同順位は時刻付き→終日 (3) 同順位・両時刻付きは開始時刻の早い順 (4) 同順位・両終日は `eventDate` の早い順 (5) すべて同値なら 0(安定ソートが元順を保つ)。
- `byPriorityValue(a: {priority}, b: {priority})`: `a.priority - b.priority` の comparator。
- `src/lib/calendar-view.ts`: `compareWithinDay` は `compareEventsForList(a, b, () => 0)` に委譲(1規則に統一)。`groupEventsByDay(events, priorityOf = () => 0)` が任意の priority ルックアップを受け、日内ソートに使う。`priorityOf` 省略時は現行(Story 1.5)と同じ挙動。
- `ListView`: `calendarById` から `priorityOf`(`id → priority`、未知は `Number.MAX_SAFE_INTEGER`)を `useMemo` で作り、`groupEventsByDay` に渡す。`calendarById`(= `cal.calendars` 由来)が変われば `useMemo` が再計算され、再読み込みなしで並びが更新される。
- `src/data/calendars.ts` の `sortCalendars` は `byPriorityValue(a, b) || a.createdAt.localeCompare(b.createdAt)` に。
- `packages/core` の並び規則に単体テストを揃える(規約: テスト、AC)。

**Never:**
- `MonthView` / `WeekView` の描画順・畳み順の変更(月セルの積み順・週の重なり順は Story 2.3)。`layoutDayEvents` は触らない。
- 代表予定の選抜(`selectFeaturedEvents`)は Story 2.4。
- 「今から近い順」など全体規則の対案(AD-6 の差し替え点。ここでは「優先度 → 開始時刻順」で実装)。
- `calendars` / `events` テーブル・マイグレーションの変更。UI コンポーネント内でのソートロジックの新規記述。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|---|---|---|
| 同じ日に別カレンダーの予定 | 優先度1のカレンダーの 15:00、優先度0のカレンダーの 18:00 | リストの同日内では優先度0の 18:00 が先、次に優先度1の 15:00 |
| 同順位・時刻付きと終日 | 同カレンダーの 10:00 と終日 | 10:00 が先、終日が後 |
| 同順位・両方時刻付き | 同カレンダーの 09:00 と 14:00 | 09:00 が先 |
| 未知のカレンダー | `priorityOf` に無い calendarId | 最下位相当として末尾に寄る(例外にしない) |
| `priorityOf` 省略 | `groupEventsByDay(events)` | Story 1.5 と同じ(時刻付き→終日→開始時刻順) |
| 優先度を変更 | 別画面で並べ替え → リスト画面へ | `calendarById` が更新され、リストの並びが再読み込みなしで変わる |

</frozen-after-approval>

## Open Questions

*(なし)*

## Code Map

- `packages/core/src/index.ts` -- `CORE_VERSION` / `formatMinutes` の並び。`priority.ts` を re-export。
- `packages/core/src/index.test.ts` -- テストの書き方の手本。新規 `priority.test.ts`。
- `packages/core/tsconfig.json` -- `include: ["src"]`、`**/*.test.ts` 除外。新ファイルは自動で入る。
- `src/lib/calendar-view.ts` -- `compareWithinDay` / `groupEventsByDay`。`@core` から `compareEventsForList` を import(`vite.config.ts` / `tsconfig.app.json` に `@core` エイリアスあり)。
- `src/lib/calendar-view.test.ts` -- `groupEventsByDay` / `compareWithinDay` の既存テスト。priority 版を追加。
- `src/features/calendar/ui/ListView.tsx` -- 既に `calendarById: Map<string, Calendar>` を受け取る。`priorityOf` を作って `groupEventsByDay` へ。
- `src/features/calendar/ui/ListView.test.tsx` -- 日内グルーピングの既存テスト。優先度順の行を追加。
- `src/features/calendar/ui/CalendarScreen.tsx` -- `ListView` への props は変更不要(`calendarById` は既に渡している)。
- `src/data/calendars.ts` -- `sortCalendars`(Story 2.1 で追加)。`byPriorityValue` 経由へ。

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/priority.ts` -- `OrderableEvent` / `PriorityLookup` 型 / `byPriorityValue` / `compareEventsForList`(時刻は `Date.parse` の瞬間比較)。`index.ts` から re-export
- [x] `packages/core/src/priority.test.ts` -- 5規則 + 未知カレンダー + ISO 書式差(Z / +00:00)を個別に単体テスト
- [x] `src/lib/calendar-view.ts` -- `compareWithinDay` を `compareEventsForList(a,b,NO_PRIORITY)` へ委譲。`groupEventsByDay(events, priorityOf = NO_PRIORITY)`
- [x] `src/lib/calendar-view.test.ts` -- `groupEventsByDay` に priority を渡すケースを追加(既存の省略時ケースは回帰なし)
- [x] `src/features/calendar/ui/ListView.tsx` -- `priorityOf`(`calendarById.get(id)?.priority ?? MAX`)を `useMemo` で作り `groupEventsByDay` へ渡す
- [x] `src/features/calendar/ui/ListView.test.tsx` -- 別カレンダーの予定が同日内で優先度順に並ぶことをテスト
- [x] `src/data/calendars.ts` -- `sortCalendars` を `byPriorityValue` 経由へ

**Acceptance Criteria:**
- Given 優先度の異なる2つのカレンダーに同じ日の予定がある, when リストビューを見る, then その日の中で優先度の高いカレンダーの予定が先に、同順位内は時刻付き→終日→開始時刻順で並ぶ
- Given `packages/core` の並び規則, when `npm run test`, then 4規則それぞれに単体テストがあり全パスする
- Given 別画面でカレンダーを並べ替えた後, when リストビューへ移動, then `calendarById` が更新され並びが再読み込みなしで変わる
- Given `groupEventsByDay` を priority 引数なしで呼ぶ, when 実行, then Story 1.5 と同じ並び(回帰なし)
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- **時刻比較は瞬間で(レビューでの修正)**: 当初 `startsAt` の ISO 文字列を辞書順比較にしていたが、オフライン作成の予定は `...Z`、PostgREST は `...+00:00`、ミリ秒有無も混在しうる。同一瞬間のタイブレークが書式依存になるのを避け、`Date.parse` の数値比較に変更(`Date` は標準ライブラリ、AD-10 OK)。`priority.test` に `Z` vs `+00:00` のケースを追加。
- **1規則・1関数**: 日内の並びは `@core` の `compareEventsForList` だけが決める。`compareWithinDay` は `NO_PRIORITY`(全同順位)での特殊化。MonthView / WeekView は priorityOf を渡さないので現行維持(Story 2.3 で priorityOf を渡すだけ)。
- **`title` の tiebreak を落とした**: 旧 `compareWithinDay` は同時刻をタイトル順にしていた。core は表示文字列を持たないので同順位・同時刻は 0 を返し、`useEvents.sortEvents` 経由の入力順(安定ソート)に委ねる。実害は「同カレンダー・同時刻の予定が2件」の稀ケースの表示順のみ。
- **未知カレンダー**: `ListView` の `priorityOf` は `calendarById.get(id)?.priority ?? Number.MAX_SAFE_INTEGER` で、表示直前の競合等でも例外にせず末尾へ。
- **eslint import zone**: `{ target: './packages/core', from: './src' }` は「core が src を import できない」であって「src が core を import できない」ではない。`src/data` / `src/lib` からの `@core` import は lint 通過。
- **未検証**: 実ブラウザで「並べ替え → リスト画面で並びが変わる」。ロジックは 199 tests(うち core の並び規則 8)。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス(`packages/core` の priority.test 含む)
- `npm run build` -- 成功(`packages/core` の tsc ビルドも)

**Manual checks:**
- `npm run dev`(Supabase 接続時): カレンダー管理で並べ替え → カレンダー画面のリストビューで、同じ日の中で優先度の高いカレンダーの予定が上に来ること。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=5。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `compareEventsForList` の `startsAt` 辞書順比較は ISO 書式差(オフライン作成 `Z` vs PostgREST `+00:00`、ミリ秒有無)で同一瞬間のタイブレークが不定 | 日付・時刻の桁位置は書式によらず先に比較されるので順序自体は正しいが、同瞬間の並びが書式依存 | low〜medium | patch: 時刻付きは `Date.parse` の数値比較へ。`priority.test` に `Z` vs `+00:00` ケース追加 |
| `ListView` の `priorityOf` が中間 Map を作っていて冗長 | `calendarById` は既に id キーの Map | low | patch: `calendarById.get(id)?.priority ?? MAX` の直接ルックアップに |
| `compareWithinDay` から `title` タイブレークが消えた(旧: 同時刻はタイトル順) | core は表示文字列を持たない設計。spec Design Notes に明記 | — | reject(意図的。同カレンダー・同時刻2件の稀ケースのみ表示順が入力順依存に) |
| `ListView` が優先度変更に追随することの再レンダーテストが無い | `useMemo([events, priorityOf])` で構成上正しい。`priorityOf` は `calendarById` 依存 | low | reject(標準の useMemo パターン。`calendar-view.test` で純関数、`ListView.test` で ListView が priorityOf を使うことは検証済み) |
| `sortCalendars` の `byPriorityValue` 化に専用テストが無い | `byPriorityValue` = `a.priority - b.priority` で挙動は同一。既存の list 順テストが回帰チェック | — | reject(挙動不変。core 側で `byPriorityValue` 単体テストあり) |

## Spec Change Log

*(なし。bad_spec ループバックなし。)*

## Design Notes

- **1規則・1関数**: 日内の並びは `compareEventsForList` だけが決める。`compareWithinDay` はその特殊化(全カレンダー同順位)。MonthView は当面 priority を渡さないので現行維持、Story 2.3 で同じ関数に priority を渡すだけで済む。
- **未知カレンダーを最下位相当に**: 取り込み直後や表示直前の競合で `priorityOf` に無い id が来ても例外にせず末尾へ。`Number.MAX_SAFE_INTEGER` を返す。
- **`title` の tiebreak は core に持たない**: core は表示文字列を知らない。同順位・同時刻は 0 を返し、呼び出し側の安定ソート(`useEvents.sortEvents` 経由の入力順)に委ねる。
