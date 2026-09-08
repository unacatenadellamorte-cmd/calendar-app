---
title: 'Story 4.2: ワンタップ・シフト入力(quick-shift-sheet)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fc647facf7b5153ed3eccdbfdd535fc29c872887'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-shift-templates.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-calendar-views.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** お気に入りシフト(Story 4.1)は登録できるが、まだカレンダーに入れられない。毎回フォームで時刻を打つのは手間(FR-12)。

**Approach:** 月ビューで日付をタップしたら、予定フォームではなく `quick-shift-sheet` を開く。登録済みテンプレを横スクロールのチップで並べ、1タップでその日(または連続 N 日)にシフト「実体」を `events` へ作成する。シフト属性(休憩分・時給・勤務先ラベル・由来テンプレ ID)をセットし「シフト用カレンダー」所属にする。未登録なら作成を促す。「予定を追加」で従来のフォームに切り替えられる。

## Boundaries & Constraints

**Always:**
- `src/data/events.ts`: `EventItem` / `EventRow` / `COLUMNS` / `toEvent` にシフト属性 `breakMinutes` / `hourlyWage` / `workplaceLabel` / `shiftTemplateId`(すべて `number|null` / `string|null`)を追加。`NewEventInput` に同項目を**任意**で追加、`rowFromInput` は渡されたときだけ書く。`EventPatch` には**追加しない**(汎用編集でシフト属性は変えられない ── AD-8)。`updateEvent` の row 組み立ても不変。
- `src/data/shifts.ts`(新規、AD-8/AD-9): `buildShiftTimes(date, startLocal, endLocal)` → `{ startsAt, endsAt }`(UTC ISO。`endLocal <= startLocal` なら終了は翌日 = `events_time_shape` の `starts_at <= ends_at` を満たす)。`createShifts(shiftCalendarId, template, dates: string[])` → `events` へ一括 insert(シフト属性セット、`source='local'`、`title = template.name`)。`Result<EventItem[]>`。オンライン先行(オフラインは deferred、`isNetworkError` は `data/offline`)。成功分は `cachePut`。
- `src/features/events/model/useEvents.ts`: `addLocal(events: EventItem[])` を追加(作成済みシフトを楽観的に一覧へ。`sortEvents` 通し)。
- `src/features/shifts/ui/QuickShiftSheet.tsx`: `BottomSheet`、見出しは `formatDayTitle(date)`。テンプレありなら「この日から N 日」ステッパ(1〜14、既定1)+ チップ横スクロール(`ShiftTemplateChip` 再利用)。チップタップ → `onPick(template, dayCount)`。テンプレなしなら「よく使うシフトを登録すると1タップで入れられます」+「お気に入りシフトを作る」。常に「予定を追加」への導線。`errorKey` をシート内表示。
- `src/features/calendar/ui/CalendarScreen.tsx`: `useShiftTemplates(enabled)` を使い、`shiftCalendar = cal.calendars.find((c) => c.isShift)`。月の `onDayTap` を `openQuickShift(date)` に(週の `onSlotTap` は従来どおり `openCreate({startLocal})`)。`onPick` → `[date..date+dayCount-1]` の `createShifts` → `ev.addLocal(結果)` → 閉じる。「予定を追加」→ quick シートを閉じて `openCreate({date})`。「お気に入りシフトを作る」→ `navigate('/shift-templates')`。
- 合計操作は3タップ以内(日タップ → チップタップ で2。ステッパ操作は任意)(NFR8)。
- すべての対話要素: role + 状態、44px、フォーカスリング維持、Reduce Motion、感嘆符なし。
- 追加・変更した data / hook / UI に単体テスト。

**Never:**
- 週ビューの日タップ経路の変更(週はスロット = 時刻指定の予定追加のまま)。ジェスチャによる複数日「範囲選択」(月グリッド上のドラッグ/長押し)── ステッパで代替、範囲ドラッグは deferred。
- `shift_templates` の変更(Story 4.1)。給料見込み(Story 4.4)。`workedMinutes` の呼び出し(4.4)。
- シフト実体用の別テーブル(AD-8: `events` のサブタイプ)。`events` マイグレーション(シフト列は Story 1.4 で既存)。
- シフトのオフライン作成(outbox)── deferred。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| テンプレあり・単日 | 9/8 をタップ → 「平日 17:00–22:00」チップをタップ | `events` に1件(`calendar_id`=シフト用、`starts_at`=9/8 17:00 JST の UTC、`ends_at`=22:00、`break_minutes`/`hourly_wage`/`workplace_label`/`shift_template_id` セット)。シート閉じる。カレンダーに即表示 |
| 連続日 | ステッパ「3日」+ チップ | 9/8・9/9・9/10 に3件 |
| 日またぎテンプレ | 「夜勤 22:00–06:00」を 9/8 に | `starts_at`=9/8 22:00、`ends_at`=**9/9** 06:00(翌日) |
| テンプレ未登録 | 日付タップ | シートが案内文 + 「お気に入りシフトを作る」。チップ無し |
| 「予定を追加」 | quick シートで選ぶ | quick シートが閉じ、その日付シードで予定フォームが開く |
| シフト用カレンダーが見つからない | `cal.calendars` にまだ来ていない | チップタップを無効化(または作成不可の静かな表示)。例外にしない |
| 汎用編集でシフトを開く | シフト実体を予定フォームで時刻変更 | `break_minutes` 等は送られない・変わらない |
| 作成失敗(制約違反等) | insert が error | `errorKey` をシート内に表示、シートは開いたまま |

</frozen-after-approval>

## Open Questions

*(なし ── [ASSUMPTION]: (1) 複数日は「この日から N 日」ステッパ(1〜14)。月グリッド上のドラッグ範囲選択はモバイル web で不安定なため deferred(1.5 スワイプ / 2.1 スムーズドラッグと同じ判断)。(2) 月の日タップは quick-shift に、週のスロットタップは従来の予定フォームのまま(週は時刻精度の入力)。(3) シフトの `title` はテンプレ名。Design Notes 参照。)*

## Code Map

- `src/data/events.ts` -- `EventItem`(L23)/ `EventRow`(L74)/ `COLUMNS`(L89)/ `toEvent`(L92)/ `NewEventInput`(L50)/ `rowFromInput`(L138)。シフト列は Story 1.4 マイグレーションで既存(`break_minutes` 等)。`EventPatch`(L58)は触らない。
- `src/data/calendars.ts` -- `Calendar.isShift`。`ensureShiftCalendar` がシフト用カレンダーを保証(`useCalendars.reload` が呼ぶ)。
- `src/data/shift-templates.ts` -- `ShiftTemplate` 型、`templateWorkedMinutes`。
- `src/lib/datetime.ts` -- `localInputToUtcIso("YYYY-MM-DDTHH:mm")` / `formatDayTitle` / `plusMinutesLocal`。
- `src/lib/calendar-view.ts` -- `addDays(date, n)`(連続日の生成)。
- `src/features/events/model/useEvents.ts` -- `sortEvents` / `create` / `reload`。`addLocal` を追加。
- `src/features/events/ui/EventFormSheet.tsx` -- `EventSeed`(`{date}` シード)。quick シートの「予定を追加」から使う。
- `src/features/calendar/ui/CalendarScreen.tsx` -- `openCreate` / `onDayTap`(L134)/ `EventFormSheet`(L157)。`useShiftTemplates` を足し quick シートを配線。
- `src/features/shifts/ui/ShiftTemplateChip.tsx` -- チップ再利用(quick シートのチップ)。
- `src/features/shifts/model/useShiftTemplates.ts` -- テンプレ一覧の hook。
- `_bmad-output/planning-artifacts/ux-designs/.../mockups/key-month.html` -- quick-shift-sheet の見た目(`.sheet` / `.tchips` / `.seg2`)。

## Tasks & Acceptance

**Execution:**
- [x] `src/data/events.ts` -- `EventItem`/`EventRow`/`COLUMNS`/`toEvent` にシフト4列。`NewEventInput` に任意で追加、`rowFromInput` が渡された分だけ書く。`EventPatch` / `updateEvent` は不変
- [x] `src/data/events.test.ts` -- toEvent がシフト列を写す / `rowFromInput` がシフト属性を含む / patch はシフト列を送らない
- [x] `src/data/shifts.ts` -- `buildShiftTimes` / `createShifts`(一括 insert、シフト属性、翌日跨ぎ)
- [x] `src/data/shifts.test.ts` -- `buildShiftTimes`(通常 / 日またぎ)、`createShifts`(1件 / 複数日 / error 伝播 / `data/unavailable`)
- [x] `src/features/events/model/useEvents.ts` + `.test.ts` -- `addLocal` 追加
- [x] `src/features/shifts/ui/QuickShiftSheet.tsx` + `.test.tsx` -- チップ / ステッパ / 空状態 / 予定を追加導線
- [x] `src/features/calendar/ui/CalendarScreen.tsx` + `.test.tsx` -- 月の日タップ → quick シート、チップで作成、予定を追加で従来フォーム
- [x] `src/features/shifts/model/useShiftTemplates.ts` -- `enabled` の使い方は現状のまま(CalendarScreen からも呼ぶ)

**Acceptance Criteria:**
- Given お気に入りシフト登録済み, when 月で日付をタップ, then quick-shift-sheet が出てテンプレが横スクロールで並ぶ
- Given quick-shift-sheet, when チップを1回タップ, then その日に `events` のシフト(属性セット・シフト用カレンダー所属)が作られ、シートが閉じる。日タップ + チップで2タップ
- Given 連続日数を指定, when チップを選ぶ, then その日から N 日すべてにシフトが入る
- Given お気に入りシフト未登録, when 日付をタップ, then 案内文 + 作成ボタンが出る
- Given 作成済みシフト, when 汎用の予定編集で開始/終了/メモを変更, then シフト属性は変わらない
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- `events.ts`: `EventItem` / `EventRow` / `COLUMNS` / `toEvent` にシフト4列(`breakMinutes` / `hourlyWage` / `workplaceLabel` / `shiftTemplateId`、`toEvent` は `?? null` 正規化)。`NewEventInput.shift?: ShiftAttributes` を追加、`rowFromInput` は `input.shift` があるときだけシフト列を書く。**`EventPatch` / `updateEvent` は不変**(汎用編集でシフト属性は変えられない ── AD-8 を型で担保)。`offline-write` の楽観行にも4フィールド追加。
- `src/data/shifts.ts`: `buildShiftTimes(date, startLocal, endLocal)`(`endLocal <= startLocal` の文字列比較で翌日判定 → `starts_at <= ends_at` を保証)、`createShifts(shiftCalendarId, template, dates[])`(一括 insert、シフト属性セット、`cachePut`、`isNetworkError` は `data/offline`)。
- `useEvents.addLocal(events)`: 作成済みシフトを楽観的に一覧へ(`sortEvents` 通し。`reload` の「読み込み中…」を避ける)。
- `QuickShiftSheet`: `BottomSheet`、見出し `formatDayTitle(date)`。テンプレありは「この日から N 日」ステッパ(1〜14)+ `ShiftTemplateChip` 横スクロール。未登録は案内 +「お気に入りシフトを作る」。常に「シフト以外の予定を追加」導線。`shiftReady=false` のときチップ列を `pointer-events-none opacity-50 aria-disabled`(レビュー修正)。
- `CalendarScreen`: `useShiftTemplates` + `useNavigate` を追加。月の `onDayTap` → `openQuickShift`(週の `onSlotTap` は従来どおり)。`MonthView` の日ボタン aria-label を「N月N日に予定を追加」→「N月N日を開く」に(quick-shift は予定/シフト両対応なので)。
- テスト +26(shifts 9 / QuickShiftSheet 6 / CalendarScreen +3 / events +3 / useEvents +1、fixture 一括更新)。全体 **315 tests**。

## Spec Change Log

*(なし。bad_spec / intent_gap ループバックなし。)*

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=7。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `shiftReady=false` のときチップが見た目上タップ可能なのに `pick` が黙って何もしない | `pick` に `!shiftReady` ガードあり。ヒント文も出るが視覚的な無効化が無い | low | patch: チップ列を `pointer-events-none opacity-50` + `aria-disabled` に |
| `EventItem` にシフト4列を必須追加 → deploy 前のキャッシュ済み予定に該当フィールドが無い(`undefined`) | 4.2 以前にシフト実体は存在せず、非シフト予定は全 null なので実害ほぼ無し。オンライン再取得1回で解消 | low | defer(deferred-work.md。`local-db` 読み出しで `?? null` 正規化を将来入れる) |
| `createShifts` の失敗が `data/query`(「読み込みに失敗しました」)で、create には文言が不自然 | 汎用エラーキーの再利用は他所と同じパターン(create 専用キーは無い) | low | reject(既存パターンと整合) |
| `CalendarScreen` でも `useShiftTemplates` を呼ぶため、カレンダーを開くたびテンプレを fetch する | ペイロードは小さく quick-shift は主要導線。遅延ロードは複雑さ増 | low | reject(コスト小。主要フロー) |
| 連続日数指定 → `createShifts` に N 要素の配列、の結合テストが CalendarScreen に無い | `QuickShiftSheet.test` でステッパ→dayCount 3、`shifts.test` で3 dates→3行、`CalendarScreen.test` で1日配列、と部品は網羅 | low | reject(部品テストで十分。結合は1日ケースで配線確認済み) |
| DST を持つ TZ の spring-forward 時刻でテンプレ適用すると `new Date` が曖昧 | v1 の主ユーザーは JST(DST なし)。`localInputToUtcIso` はブラウザ TZ 依存 | low | reject(スコープ外。JST 前提) |

## Design Notes

- **`NewEventInput` にシフト属性を任意で持たせる**: シフト「実体」は `events` の1行(AD-8)。作成経路が2つ(quick-shift / 将来の取り込み)あっても `createEvent` を通せるよう、create 入力にシフト属性を任意で足す。**更新**は `EventPatch` に無いので、汎用フォームからは絶対に変えられない(AD-8 の「編集は features/shifts のみ」を型で担保)。
- **複数日はステッパ**: 「この日から N 日」。月グリッドのドラッグ範囲選択はモバイル web で scroll と競合し不安定(Story 1.5 スワイプ / 2.1 スムーズドラッグと同じ理由で deferred)。週1回のシフトを14日先まで一括で置ければ Flow 3 の「1週間分」は満たせる。
- **日またぎ**: テンプレの `endLocal <= startLocal`(HH:MM 文字列比較)なら終了は `addDays(date, 1)`。これで `events_time_shape` の `starts_at <= ends_at` を必ず満たす。実働時間の通算は Story 4.3 の `workedMinutes` が担当(絶対時刻の差なので自動)。
- **`addLocal` で楽観反映**: `createShifts` の結果を `useEvents` に流し込む(`reload` だと "読み込み中…" が一瞬出る)。data 層でも `cachePut` する。
- **シフト用カレンダー未取得時**: `cal.calendars` がまだ空/未ロードなら `shiftCalendar` は undefined。チップを disabled にし、例外にしない。`useCalendars.reload` が `ensureShiftCalendar` を必ず呼ぶので通常は数百 ms で解決。

## Verification

**Commands:**
- `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build` -- すべて成功

**Manual checks:**
- `npm run dev`(Supabase 接続 + `db push` 済み、テンプレ登録済み): 月ビューで平日をタップ → シートにチップ → タップでその日にシフトが入りカレンダーに緑のチップが出る。ステッパ3日で3日分。夜勤テンプレで翌日にまたぐ。テンプレ0件だと案内文。作成済みシフトを予定フォームで時刻だけ変えても時給表示(4.4)が保たれる。
