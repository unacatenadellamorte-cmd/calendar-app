---
title: 'Story 4.4: 当月の給料見込みとトップ画面表示(pay-card)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b512376c5e8e011f26968c23e5af712fc275f0bf'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-quick-shift.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-pay-calc.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-5-home-compact-view.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** シフトは入れられる(4.2)が、今月いくらになるかは見えない。ホームで追加操作なしに給料見込みを出したい(FR-14 / FR-15)。

**Approach:** `packages/core` に月次集計 `monthlyPayEstimate` を足し、ホームの compact-card の下に `pay-card` を出す。当月のシフト実体を「実働時間 × 時給」で合算(暦月・時給差は合算)。集計値は保存せず都度計算。前月/翌月の矢印、タップで内訳シート。

## Boundaries & Constraints

**Always:**
- `packages/core/src/pay.ts`: `PayableShift { startsAt: string; endsAt: string; breakMinutes: number; hourlyWage: number }` 型 + `monthlyPayEstimate(shifts: PayableShift[]): { amount: number; shiftCount: number; workedMinutes: number }`。各シフト = `max(0, workedMinutes(...)) / 60 * hourlyWage`、合算して `amount` は `Math.round`。副作用なし。`index.ts` から re-export。
- `src/lib/money.ts`(新規、leaf): `formatYen(n: number): string` → `¥` + `n.toLocaleString('ja-JP')`(例 `¥62,700`)。
- `src/features/pay/model/usePayEstimate.ts`: `usePayEstimate(events, calendars)` → `monthOffset` state(0 = 当月)、`{ amount, shiftCount, monthLabel, shifts, prev, next, canNext }`。対象月 = `addMonths(当月1日, monthOffset)` の暦月。**シフト実体の判定**: 所属カレンダーが `isShift` の予定(`calendarById` 経由)。時刻付き(`startsAt` あり)のみ。対象月 = `localDateOf(startsAt)` が `YYYY-MM` 一致。`hourlyWage` が null のものは時給0扱い(集計に寄与しない)。`useMemo([events, calendars, monthOffset])`。
- `src/features/pay/ui/PayCard.tsx`: カード。`formatYen(amount)` を大きく、補助「{n}月 ・ {shiftCount}件のシフト」。前月/翌月の矢印(`aria-label` つき、44px)。カード本体タップ → 内訳シート。0件は `¥0` + 「{n}月のシフトはまだありません」(感嘆符なし)。達成演出・ストリークなし(NFR12)。
- `src/features/pay/ui/PayDetailSheet.tsx`: `BottomSheet`。その月のシフトを日付順に、各行「{日付} {開始}–{終了} {実働h} × ¥{時給} = ¥{小計}」。合計。割増・締め日・勤務先別の設定項目は出さない(NFR11)。
- `HomeScreen`: `CompactCard` の下に `<PayCard events={ev.events} calendars={cal.calendars} />`。シフト追加・編集・削除で `ev.events` が変われば `useMemo` が再計算(即時)。
- 集計値は DB / state に保存しない(都度計算 ── AD-8 / NFR9)。
- すべての対話要素: role + 状態、44px、フォーカスリング維持、Reduce Motion。
- 追加・変更した core / lib / model / UI に単体テスト(規約: テスト)。

**Never:**
- 給料の DB 保存・キャッシュ(都度計算)。割増(深夜/残業)・締め日・勤務先別・年別・税金 ── v1 スコープ外(NFR11)。
- `events` / `shift_templates` / マイグレーションの変更。`workedMinutes` の変更(4.3、そのまま呼ぶ)。
- シフト実体の作成・編集(4.2 / 汎用フォーム)。compact-card / `selectFeaturedEvents` の変更(2.4/2.5)。
- pay-card を別ルートの専用画面にすること(ホーム内 + 内訳シート)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| 当月にシフト2件 | 8h勤務休憩1h @¥1100 を2件(同月) | `monthlyPayEstimate` → `amount = round(7*1100*2) = 15400`、`shiftCount = 2`。カード「¥15,400」「9月 ・ 2件のシフト」 |
| 時給差を合算 | @¥1000 の 5h と @¥1200 の 4h | `5000 + 4800 = 9800` |
| 休憩過大シフト | 実働 -30分になる入力 | そのシフトの寄与は 0(負にしない) |
| 対象月にシフトなし | 当月0件 | `amount 0` / `shiftCount 0`。カード「¥0」+「9月のシフトはまだありません」 |
| 前月へ | 矢印 ← | `monthOffset` -1、8月の集計に切替、ラベル「8月」 |
| 翌月へ | 矢印 → | `monthOffset` +1、10月の集計 |
| 日またぎシフト | 22:00→翌06:00 | `workedMinutes` が +24h 通算した実働で計算(4.3)。所属月は `startsAt` の暦月 |
| シフト以外の予定 | 通常カレンダーの予定(`isShift=false`) | 集計に含めない |
| `hourlyWage` null のシフト | 時給未設定のシフト実体 | 時給0 = 集計 0 寄与、`shiftCount` には数える([ASSUMPTION]) |
| 内訳シート | カードタップ | その月のシフト明細 + 合計 |

</frozen-after-approval>

## Open Questions

*(なし ── [ASSUMPTION]: (1) シフト実体判定は「所属カレンダーが `isShift`」。`hourlyWage`/`shiftTemplateId` 非 null での判定は将来の取り込みシフト用に保留。(2) `hourlyWage` null のシフトは時給0で集計、件数には数える。(3) 端数は各シフト実額を合算後に `Math.round`。(4) 内訳の実働は `workedMinutes/60` の小数1桁表示。Design Notes 参照。)*

## Code Map

- `packages/core/src/pay.ts` -- `workedMinutes`(4.3)。`PayableShift` + `monthlyPayEstimate` を追加。`index.ts` から re-export、冒頭コメント更新。
- `packages/core/src/pay.test.ts` -- `workedMinutes` の手本。`monthlyPayEstimate` のケースを追加。
- `src/lib/datetime.ts` -- `todayLocalDate` / `localDateOf` / `formatMonthTitle`。
- `src/lib/calendar-view.ts` -- `addMonths(date, n)` / `ymd`。
- `src/features/home/ui/HomeScreen.tsx` -- `CompactCard` の下に `PayCard`。`ev.events` / `cal.calendars` は取得済み。
- `src/features/compact/ui/CompactCard.tsx` -- カードの見た目・空状態トーンの手本。
- `src/ui/BottomSheet.tsx` -- 内訳シートの土台。
- `src/features/calendars/model/useCalendars.ts` -- `Calendar.isShift`。
- `src/features/events/model/useEvents.ts` -- `events`(シフト属性込み、4.2 で `EventItem` 拡張済み)。
- `_bmad-output/planning-artifacts/ux-designs/.../mockups/key-home.html` -- `.pay` / `.pay .amount` / `.pay .nav` の見た目。

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/pay.ts` -- `PayableShift` 型 + `monthlyPayEstimate(shifts)`(`max(0, workedMinutes)` × 時給、合算、`Math.round`)
- [x] `packages/core/src/index.ts` -- `export { monthlyPayEstimate, type PayableShift } from './pay';`。冒頭コメント更新
- [x] `packages/core/src/pay.test.ts` -- 2件合算 / 時給差 / 休憩過大は0寄与 / 0件は amount 0 / 日またぎ
- [x] `src/lib/money.ts` + `src/lib/money.test.ts` -- `formatYen`
- [x] `src/features/pay/model/usePayEstimate.ts` + `.test.ts` -- シフト判定(isShift)/ 対象月フィルタ / monthOffset の prev・next / 再計算
- [x] `src/features/pay/ui/PayCard.tsx` + `.test.tsx` -- 金額・補助・矢印・0件文言・タップで内訳
- [x] `src/features/pay/ui/PayDetailSheet.tsx` + `.test.tsx` -- 月のシフト明細 + 合計
- [x] `src/features/home/ui/HomeScreen.tsx` + `.test.tsx` -- `PayCard` 統合

**Acceptance Criteria:**
- Given 今月にシフトがある, when ホームを開く, then pay-card が当月の給料見込み(実働時間 × 時給 の合計、暦月、時給差を合算)を ¥ 書式で表示する
- Given pay-card, when 前月/翌月の矢印を押す / シフトを追加・編集・削除する, then 対象月が切り替わる / 金額が即時再計算される
- Given 対象月にシフトがない, when pay-card を見る, then 「¥0」と「{n}月のシフトはまだありません」を表示する
- Given pay-card をタップ, when 内訳を開く, then その月のシフトの内訳が見える
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- `packages/core/src/pay.ts`: `PayableShift` 型 + `monthlyPayEstimate(shifts)` → `{ amount, shiftCount, workedMinutes }`。各シフト `max(0, workedMinutes(...))/60 * hourlyWage` を実数合算 → `Math.round`。core 13 tests。
- `src/lib/money.ts`: `formatYen(n)` = `¥` + `Math.round(n).toLocaleString('ja-JP')`。
- `src/features/pay/model/usePayEstimate.ts`: `monthOffset` state、`addMonths(当月1日, offset)` の暦月へフィルタ(`isShift` カレンダー所属・時刻付き・`localDateOf(startsAt)` が `YYYY-MM` 一致)。`useMemo([events, calendars, monthOffset, prev, next])`。`hourlyWage`/`breakMinutes` は `?? 0` / `?? 0`。`canNext` は +12ヶ月まで。
- `PayCard`(compact-card の下、`<section aria-label="{n}月の給料見込み">`、金額ボタン → 内訳、‹ › で月送り)/ `PayDetailSheet`(`BottomSheet`、日付順にシフト明細「{実働}h × ¥{時給} = ¥{小計}」+ 合計)。
- `HomeScreen`: `<CompactCard>` の下に `<PayCard events={ev.events} calendars={cal.calendars} />`。
- テスト +20(pay core 6 / money 2 / usePayEstimate 5 / PayCard 4 / PayDetailSheet 2 / HomeScreen +1)。全体 **335 tests**。

## Spec Change Log

*(なし。bad_spec / intent_gap ループバックなし。)*

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=5。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `<section>` の `aria-label` が「今月の給料見込み」固定で、前月/翌月を見ているとき不正確 | SR が「今月」と読むが実際は8月等 | low | patch: `aria-label` を `{monthLabel}の給料見込み` に(HomeScreen.test も更新) |
| 内訳シートが per-row で `Math.round` した小計を出す一方、合計は合算後に丸めるため、端数シフトが複数あると行の和と合計が数円ずれる | `monthlyPayEstimate` が内訳を返さないためシートが再計算。個人の時給はキリの良い数字が多い | low | defer(deferred-work.md。`monthlyPayEstimate` に breakdown を持たせて単一ソース化) |
| 月ラベルが年なしなので12ヶ月送ると翌年同月と区別つかない | モックも年なし。そこまで送る利用は稀 | low | defer(deferred-work.md。年跨ぎのとき年を出す) |
| `usePayEstimate` の `useMemo` が `new Date()` を読む(不純)。開きっぱなしで月替わりに追随しない | `useFeaturedEvents`(2.5)と同じパターン。events 変更・開き直しで更新 | low | reject(既存パターンと整合。文書化済み) |
| シフト用カレンダーを非表示にしても pay に含まれる(compact-card は非表示を除外する) | 給料は「働いた実績」で表示設定と無関係。意図的な差 | — | reject(意図的。Design Notes に記載) |
| `endsAt` null のシフト実体だと `workedMinutes(start, start)` → 24h 扱いになる | `events_time_shape` CHECK が時刻付きに endsAt を必須化。quick-shift も必ずセット。到達は DB 直叩きのみ | low | reject(制約で防止済み。防御的フォールバック) |

## Design Notes

- **月次集計も `packages/core`**: `monthlyPayEstimate` は「対象月に絞り込み済みのシフト配列」を受けて合算するだけ。暦月の判定・TZ 変換は呼び出し側(`usePayEstimate`)── AD-7「計算は UTC 差分、TZ 変換は表示層」。core は `PayableShift`(camelCase・ISO)を正規入力とする。
- **シフト実体の判定 = `isShift` カレンダー所属**: `calendarById.get(e.calendarId)?.isShift`。`hourlyWage` 非 null での判定にすると、汎用フォームで時給を消したシフトが漏れる/取り込みシフトの扱いが曖昧になる。カレンダー基準が素直で、AD-8(シフト = シフト用カレンダーの予定 + 属性)と一致。
- **端数**: 各シフト `max(0, workedMinutes)/60 * hourlyWage` を実数で合算し、最後に `Math.round`。per-shift 丸めだと合計が数円ずれる。給与明細の慣習に寄せる。
- **即時再計算**: pay-card は `usePayEstimate(events, calendars)` の `useMemo` だけ。シフト CRUD → `ev.events` の identity 変化 → 再計算。保存はしない(NFR9)。
- **`monthOffset` の範囲**: 過去は無制限、未来は当月+12ヶ月程度に緩く制限(`canNext`)。先の月は空になるだけなので厳密でなくてよい。

## Verification

**Commands:**
- `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` -- すべて成功

**Manual checks:**
- `npm run dev`(Supabase 接続 + テンプレ登録 + quick-shift で当月にシフト数件): ホームの compact-card の下に pay-card。金額が実働 × 時給の合計。シフトを1件足すと即増える。← → で前月/翌月。シフト0の月は「¥0」+「N月のシフトはまだありません」。カードタップで内訳。
