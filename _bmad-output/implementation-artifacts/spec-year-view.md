---
title: 'カレンダーの「年」ビュー新設'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '5b01cf9ce1b34617f8a770d7129649640dba6793'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ユーザーが `カレンダー不備.txt` で要望。現在「月/日/リスト」の3ビューしか無く、1年間を俯瞰して予定の疎密を把握する手段が無い(参考: 同梱の `calendar-nenbox-a4-1-2022.pdf`、12ヶ月分のミニ月グリッドを敷き詰めた年間カレンダー)。

**Approach:** 表示切替に「年」を4つ目のタブとして追加する。中身は静的な一覧表ではなく、**予定ありの日を色付けする動的表示**(ユーザー確定済み)。1〜12月のミニ月グリッドを縦1列に並べ(このアプリはスマホ幅が主対象のため、PDFの3列印刷レイアウトは踏襲しない)、各グリッドは既存の `monthGridDays`(日曜始まり)をそのまま再利用する。日付セルに予定があれば、その日の最優先カレンダー(既存の優先度順、`compareEventsForList`)の色で小さいドットを1つ表示する(セルが小さく複数件を並べる余地が無いため、月ビューの「3件+他N件」と同じ精神で1件に代表させる)。日付セルをタップするとその日を cursor にして月ビューへ、月見出しをタップするとその月1日を cursor にして月ビューへドリルダウンする(既存の「他N件→リストビュー」と同じ、タップで詳細ビューへ移る操作感)。年またぎナビゲーションは既存の月送り(`goPrev`/`goNext`)と同じ形で前年/翌年へ。

## Boundaries & Constraints

**Always:** 予定の色付けロジックは月ビューと同じ優先度規則(`makePriorityOf`/`compareEventsForList`)を再利用する、年ビュー独自の並び規則を作らない。既存の `monthGridDays`(日曜始まり)をそのまま12回呼ぶだけで、年ビュー専用のグリッド計算関数は新設しない。表示オンのカレンダー(`isVisible`)の予定だけを対象にする(既存の `visibleEvents` をそのまま使う)。

**Never:** 予定のタイトル・時刻はセルに表示しない(スペースが無い、月見出しタップ→月ビューで確認する動線に任せる)。年ビュー内での予定の作成・編集・削除は行わない(閲覧・ドリルダウン専用)。複数カレンダーの色を1セルに並べて表示する(ドット複数個・グラデーション等)は今回作らない ── 最優先1色のみ。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 「年」タブを選ぶ | 表示切替で「年」を選択 | cursor の年の1〜12月ミニグリッドが縦に並んで表示される | N/A |
| 予定がある日 | 表示オンのカレンダーに予定がある日 | 最優先カレンダーの色のドットが日付の下(または横)に表示される | N/A |
| 予定が無い日 | 該当カレンダーに予定なし | ドット無し、日付数字のみ | N/A |
| 日付セルをタップ | 年ビューで任意の日付をタップ | その日を cursor にして月ビューへ切り替わる | N/A |
| 月見出しをタップ | 年ビューで「3月」等の見出しをタップ | その月1日を cursor にして月ビューへ切り替わる | N/A |
| 前年/翌年へ移動 | ‹ / › ボタンを押す | cursor の年が ±1 され、12ヶ月分再描画される | N/A |
| 今日ボタン | 年ビュー中に「今日」を押す | cursor が今日の日付に戻る(年ビューのまま、当年の12ヶ月表示に戻る) | N/A |
| 日付ジャンプ | 見出しタップで日付入力を開き別の年月日を指定 | その年へジャンプし12ヶ月分が再描画される | N/A |

</frozen-after-approval>

## Code Map

- `src/features/calendar/model/useCalendarView.ts` -- 修正 -- `ViewMode` に `'year'` 追加、`VIEW_MODES`配列更新、`goPrev`/`goNext` に `view === 'year' ? addYears(c, -1/1) : ...` の分岐追加
- `src/lib/calendar-view.ts` -- 修正 -- `addYears(date: string, n: number): string` を `addMonths` と対の実装で新設(月末クランプ不要、単純に年だけ加算)
- `src/lib/datetime.ts` -- 修正 -- `formatYearTitle(date: string): string` を `formatMonthTitle` と同じパターンで新設(`"2026年"`)
- `src/features/calendar/ui/ViewSwitcher.tsx` -- 修正 -- `ITEMS` に `{ value: 'year', label: '年' }` 追加
- `src/features/calendar/ui/DateNav.tsx` -- 修正 -- `stepping` は `view !== 'list'` のまま(yearも前後ボタンを出す)、`title` の三項分岐に `view === 'year' ? formatYearTitle(cursor) : ...` を追加
- `src/features/calendar/ui/YearView.tsx` -- 新規 -- `cursor`/`events`/`calendarById`/`today`/`onMonthTap(date)`/`onDayTap(date)` を受け、1〜12月ぶん `monthGridDays(year, m, today)` を呼び縦に並べる。各セルは `groupEventsByDay` 由来のMapから該当日の先頭要素(既に優先度順ソート済み)の `calendarById.get(...).color` でドット描画
- `src/features/calendar/ui/YearView.test.tsx` -- 新規
- `src/features/calendar/ui/CalendarScreen.tsx` -- 修正 -- `view === 'year'` の分岐で `<YearView>` を描画、`onMonthTap`/`onDayTap` はどちらも `jumpTo(date); setView('month')` 相当
- `src/features/calendar/ui/CalendarScreen.test.tsx` -- 修正 -- 「年」タブ選択・日付/月見出しタップでの月ビュー遷移のテスト追加
- `src/lib/calendar-view.test.ts`、`src/lib/datetime.test.ts`(存在すれば)-- 修正 -- `addYears`/`formatYearTitle` のユニットテスト

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/calendar-view.ts`, テスト -- 修正 -- `addYears`
- [ ] `src/lib/datetime.ts`, テスト -- 修正 -- `formatYearTitle`
- [ ] `src/features/calendar/model/useCalendarView.ts` -- 修正 -- `ViewMode`拡張・ナビゲーション分岐
- [ ] `src/features/calendar/ui/ViewSwitcher.tsx` -- 修正 -- 「年」タブ追加
- [ ] `src/features/calendar/ui/DateNav.tsx` -- 修正 -- 年タイトル分岐
- [ ] `src/features/calendar/ui/YearView.tsx`, テスト -- 新規
- [ ] `src/features/calendar/ui/CalendarScreen.tsx`, テスト -- 修正 -- 年ビュー統合・ドリルダウン配線

**Acceptance Criteria:**
- Given 表示切替, when 「年」を選ぶ, then 1〜12月のミニグリッドが縦に並び、予定のある日にその最優先カレンダーの色のドットが出る
- Given 年ビュー, when 日付または月見出しをタップする, then その日/その月1日を cursor にして月ビューへ切り替わる
- Given 年ビュー, when ‹/›で前年/翌年へ移動する, then 12ヶ月分が再描画される
- Given 年ビュー, when 表示中のカレンダーの表示ON/OFFを切り替える(既存の `isVisible`), then ドットの表示もそれに追従する(`visibleEvents` を経由するため自動的に満たされる想定)

## Implementation Notes

Code Map / Tasks どおり実装。spec に無かった小さい決定:
1. 日付セルの `aria-label` に年を含めた(前年12月・翌年1月のはみ出し日が同じ月日で重複するため一意化)。
2. 曜日ヘッダーは12ヶ月分繰り返さず、年ビュー全体で1回だけ表示(`monthGridDays`は常に日曜始まりで列位置が揃うため)。
3. `addYears`の閏年跨ぎは`Date`のネイティブ繰り上げに任せた(特別補正なし)。
4. 日付セルのタップ領域が`min-h-8`(32px)で、他要素の44px基準を満たしていなかった(レビューで指摘、後述のパッチで解消)。

**レビュー後パッチ(7件、詳細は Review Triage Log 参照):**
- 日付セルのタップ領域を `min-h-11`(44px)に拡大
- 月境界のはみ出し日を非インタラクティブ化(隣接月グリッド間の`aria-label`重複を解消)
- `CalendarScreen.test.tsx` に表示ON/OFFフィルタの年ビュー配線テストを追加
- 12ヶ月ぶんの `monthGridDays` 計算を `useMemo` 化
- 予定ありの日の `aria-label` に「(予定あり)」を追加(スクリーンリーダー対応)
- 月見出しボタンの `aria-label` に年を追加
- `DateNav.test.tsx` に「年」ケースを追加

## Spec Change Log

## Review Triage Log

3並列レビュアー(Blind Hunter / Edge Case Hunter / Verification Gap)を baseline `5b01cf9` からの unified diff(20.9KB)に対して実施。Blind Hunter 7件、Edge Case Hunter 2件、Verification Gap 1件。実ソース照合の上でトリアージ:

**patch(7件、同一実装サブエージェントへ差し戻し)**

1. **日付セルのタップ領域32pxが明文化された44px基準を下回る** — high。Blind Hunter。`src/app/BottomTabs.tsx:18`「タップターゲットは44px以上。」という文書化済みルールに違反(実装者自身も「意図的なトレードオフ」と自認していたが、明文化されたルールの逸脱はOpen Questionとして提示すべきだった)。
2. **月境界のはみ出し日が隣接月グリッド間で同一`aria-label`を持つ重複ボタンになる** — high。Edge Case Hunter。年ビューは12ヶ月を同時表示するため、月ビューでは起きない重複が実在する(コードロジックで確認済み)。
3. **`CalendarScreen`経由の表示ON/OFFフィルタ配線が年ビューで実質未検証** — high。Verification Gap。`events={visibleEvents}`が誤って`ev.events`に変わっても既存テストのどれも検出できないことを具体的に実証。
4. **12ヶ月ぶんの`monthGridDays`計算が`useMemo`されていない** — medium。Blind Hunter。`MonthView.tsx`の既存パターンからの逸脱。
5. **スクリーンリーダー利用者に年ビューの「疎密」情報が一切伝わらない** — medium。Blind Hunter。ドットが`aria-hidden`かつ`aria-label`にも予定の有無が無い、ビューの目的自体を損なう抜け。
6. **月見出しボタンの`aria-label`に年情報が無い** — low(cheap)。Blind Hunter。
7. **`DateNav.test.tsx`が「年」ケースに未対応** — low(cheap)。Blind Hunter。

**defer(`deferred-work.md`へ記録)**

- 年ビューからのドリルダウン(日付/月見出しタップ)でlocalStorageの表示設定が「年」から「月」へ上書きされる(Blind Hunter)— 月ビューの「他N件→リスト」でも同じ挙動をする既存パターンの延長であり、本機能固有の新規逸脱ではない。
- 年ビュー切替時に最大504セルが一括マウントされ仮想化が無い(Blind Hunter)— spec Design Notesで「12ヶ月×最大6週を1画面に収める」を明記した上での受容済みトレードオフ。パッチ4のuseMemo化で再計算コストは解消される。
- `goPrev`/`goNext`を極端に連打すると年が4桁を割りDateコンストラクタの2桁年解釈でずれる(Edge Case Hunter)— 到達に数百回の連続クリックが要る非現実的な入力、対策コストに見合わない。

## Design Notes

**PDFの3列印刷レイアウトを踏襲しない理由**: `calendar-nenbox-a4-1-2022.pdf` はA4印刷向けの横3列×縦4行のレイアウトだが、このアプリはスマホ幅(~400px)が主対象で、既存のUX方針(DESIGN.md/EXPERIENCE.md)もモバイル前提。3列だと1ヶ月あたりの幅が130px程度になり日付が判読できない。縦1列スクロールに変更し、PDFからは「日始まり」「予定の疎密を色で見る」という概念だけを引き継ぐ。

**1セル1ドット(最優先カレンダーのみ)にした理由**: 月ビューは1セルに最大3チップ+「他N件」を表示できる十分な高さがあるが、年ビューは12ヶ月×最大6週=72行相当を1画面に収める必要がありセルの高さは月ビューの数分の1になる。複数色のドット/バーを並べる案も検討したが、視認性とスマホでのタップ精度を優先し、既存の優先度規則で1色に代表させる設計にした(将来「その日の予定件数を色の濃さで表す」等の拡張は別途検討)。

**日付/月見出しタップでの月ビュー遷移(ドリルダウン)は決め打ち**: `カレンダー不備.txt` にはタップ時の挙動が明記されていなかったが、既存の「月ビューの他N件タップ→リストビューへ」と同じ「概観から詳細へ」の操作感に揃えるのが自然かつ低リスクな default と判断した。ユーザーが別の挙動(例:年ビュー内でその場に予定一覧を展開する等)を望む場合は別途フィードバックで調整する。

## Verification

**Commands(パッチ後、独立に再実行して確認済み):**
- `npm run typecheck` -- ✅ 0 errors
- `npm run lint` -- ✅ 0 errors
- `npm test` -- ✅ 85 files / 656 tests 全部 green(パッチ前653 → +3)
- `npm run build` -- ✅ 成功

**Manual checks:**
- `npm run dev` での実ブラウザ目視確認は未実施(ユーザー確認事項として残す)。自動テストで日付/月見出しタップの月ビュー遷移・前年/翌年ナビゲーション・表示ON/OFF追従は担保済み。
