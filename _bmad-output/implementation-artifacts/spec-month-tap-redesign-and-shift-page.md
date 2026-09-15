---
title: '月表示タップ/ダブルタップ再設計とシフト入力ページ分離'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '21a83871c7fb60c996bcd9f8a3f5e7ce88c37e5d'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ユーザーが `カレンダー不備.txt` で要望。月表示の日付タップを「圧縮+その日一覧」・ダブルタップを「その日の全画面表示」にしたいが、現在タップは Story 4.2「クイックシフト追加シート」に使われており衝突する。ユーザー確認済み: クイックシフト入力は表示カレンダーから切り離し専用ページにする。

**Approach:** 月表示の日付タップは、**選択した日を含む週の1行だけに月グリッドを折りたたみ(決定: Option C)**、その下にその日の予定一覧パネルを大きく表示する。別の日をタップすると、その日を含む週にグリッドが切り替わり、パネルの中身も切り替わる。折りたたみを解除して全体の月グリッドへ戻る操作は、折りたたまれた週行の上に置く「月表示に戻る」ボタン(または同義の閉じる操作)で行う。ダブルタップは既存の「日」ビュー(`WeekView.tsx`、backlog①で改名済み)へその日を cursor にして切り替える(既存のドリルダウンの仕組み=`jumpTo`+`setView`をそのまま再利用、新規UIは作らない)。クイックシフト入力(`QuickShiftSheet.tsx`)は新規ルート `/shifts/add` の専用ページ(`QuickShiftScreen.tsx`)へ作り直し、`CalendarScreen` のヘッダーに既存の「予定を追加」と並べて「シフトを追加」リンクを置く(`/shift-templates` と同じ「タブ外・ヘッダー/設定から遷移」パターンを踏襲)。ページは起点日を(タップ由来の prefill が無いため)`<input type="date">` で選べるようにし、既定値は今日。

## Boundaries & Constraints

**Always:** 折りたたみ状態は `CalendarScreen` が `selectedDay: string | null` で管理し、`MonthView` には「折りたたむ週(`selectedDay`があればその週の日付だけ)」と「フル表示」の2モードを1つのコンポーネントの中で切り替えるprops(`collapsedToWeekOf?: string`)として渡す(別コンポーネントに分岐させず、既存の`monthGridDays`から該当週だけを抜き出すユーティリティを1つ足す形にする)。ダブルタップは既存の `jumpTo`/`setView('week')` を再利用するだけで、新しいフルスクリーン表示コンポーネントを作らない。`QuickShiftScreen` は `QuickShiftSheet` のロジック(`buildShiftTimes`/`createShifts`/日数ステッパ/テンプレ選択)をそのまま移植し、`BottomSheet` ラップだけを `Screen` ページへ置き換える。シフト作成成功後は `/calendar` へ戻る(結果が見える状態にする)。

**Never:** 月グリッドの列/行レイアウト規則(日曜始まり、`monthGridDays`)自体は変更しない。ダブルタップ用に新しい「日」ビューの別実装は作らない(既存`WeekView.tsx`をそのまま使う)。`QuickShiftSheet.tsx` はこのストーリーで完全に置き換えるため、削除後に残存インポートが無いことを確認する。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 月表示の日付をタップ(フル月表示中) | 任意の日付セルをタップ | 月グリッドがその日を含む週の1行だけに折りたたまれ、下にその日の予定一覧パネルが大きく表示される | N/A |
| 折りたたみ中に別の日付をタップ | 折りたたまれた週行内、または週をまたいで別の日をタップ(後者は一度「月表示に戻る」してから) | 該当週にグリッドが切り替わり、パネルの中身もその日に切り替わる | N/A |
| 「月表示に戻る」を押す | 折りたたみ状態で戻る操作をする | 全体の月グリッドに戻り、パネルは閉じる | N/A |
| 月表示の日付をダブルタップ | 同じ日付セルを素早く2回タップ | その日を cursor にして「日」ビューへ切り替わる(折りたたみ状態は解除される) | N/A |
| ヘッダーの「シフトを追加」をタップ | カレンダー画面ヘッダーから遷移 | `/shifts/add` のシフト入力ページが開く(起点日=今日) | N/A |
| シフト入力ページで日付を変更 | `<input type="date">` で別日を選ぶ | 「この日から」の起点がその日に変わる | N/A |
| シフト入力ページでテンプレを選ぶ | 日数ステッパ+テンプレタップ | 連続日ぶんシフトが作成され `/calendar` へ戻る | 失敗時はページ内にエラー表示、遷移しない |
| テンプレ未登録でシフト入力ページを開く | `templates.length === 0` | 「よく使うシフトを登録すると…」+「シフトを作る」導線(既存 `QuickShiftSheet` と同じ文言) | N/A |
| シフト用カレンダー未取得 | `shiftReady === false` | テンプレ選択を無効化(既存と同じ) | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/calendar-view.ts` -- 修正 -- `weekRowOf(cells: DayCell[], date: string): DayCell[]` を新設(`monthGridDays`が返す7列×N週のセル配列から、指定日付を含む1週(7セル)だけを抜き出す純関数。既存の`monthGridDays`自体は変更しない)
- `src/features/calendar/ui/MonthView.tsx` -- 修正 -- `collapsedToWeekOf?: string` prop を追加。指定があれば`monthGridDays`の全セルではなく`weekRowOf(cells, collapsedToWeekOf)`の7セルだけをレンダリングし、グリッド上部に「月表示に戻る」ボタンを出す。`onDayTap`は変更せず維持、新たに`onDayDoubleTap: (date: string) => void`propを追加し、日付セルの`<button>`に`onDoubleClick`を配線(ネイティブのclick/dblclickイベント順序上、タップとダブルタップは共存でき追加の判定ロジックは不要)
- `src/features/calendar/ui/DayEventPanel.tsx` -- 新規 -- 選択中の日付の予定一覧(`groupEventsByDay`由来、`ListView.tsx`の1日ぶん相当の描画を流用/参考に)。予定タップで`onEventTap`(既存の`openEdit`)。閉じるボタンは持たず、MonthView側の「月表示に戻る」に一本化する
- `src/features/calendar/ui/DayEventPanel.test.tsx` -- 新規
- `src/features/calendar/ui/CalendarScreen.tsx` -- 修正 -- `selectedDay: string | null` state 新設、`onDayTap`(月ビュー用)はこのstateをセット、`onDayDoubleTap`は`jumpTo(date); setView('week')`(同時に`selectedDay`もクリア)。`MonthView`へ`collapsedToWeekOf={selectedDay ?? undefined}`を渡し、`selectedDay`があれば`<MonthView>`の下に`<DayEventPanel>`を描画。「月表示に戻る」は`selectedDay`を`null`に戻すコールバック。`openQuickShift`/`quickDate`/`shiftErrorKey`/`pickShiftTemplate`/`<QuickShiftSheet>`をすべて削除。ヘッダーに「シフトを追加」リンク(`useNavigate('/shifts/add')`)を「予定を追加」と並べて追加
- `src/features/calendar/ui/CalendarScreen.test.tsx` -- 修正 -- 日付タップでパネル表示、ダブルタップで日ビュー遷移、クイックシフト関連の既存テストを新ページ遷移の確認に置き換え
- `src/features/shifts/ui/QuickShiftScreen.tsx` -- 新規 -- `QuickShiftSheet.tsx`のロジック(日数ステッパ・テンプレチップ・空状態)を`Screen`ページへ移植。起点日は`<input type="date">`(既定値=今日)。成功時`navigate('/calendar')`
- `src/features/shifts/ui/QuickShiftScreen.test.tsx` -- 新規(`QuickShiftSheet.test.tsx`があれば移行、無ければ新規)
- `src/features/shifts/ui/QuickShiftSheet.tsx` -- 削除 -- `QuickShiftScreen.tsx`に完全移行
- `src/app/routes.tsx` -- 修正 -- `{ path: 'shifts/add', element: <QuickShiftScreen /> }` 追加(タブ外、`shift-templates`と同じ配置パターン)

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/calendar-view.ts`, テスト -- 修正 -- `weekRowOf`
- [ ] `src/features/calendar/ui/DayEventPanel.tsx`, テスト -- 新規
- [ ] `src/features/calendar/ui/MonthView.tsx`, テスト -- 修正 -- 折りたたみモード・ダブルタップ配線
- [ ] `src/features/shifts/ui/QuickShiftScreen.tsx`, テスト -- 新規
- [ ] `src/features/shifts/ui/QuickShiftSheet.tsx`, テスト -- 削除
- [ ] `src/app/routes.tsx` -- 修正 -- ルート追加
- [ ] `src/features/calendar/ui/CalendarScreen.tsx`, テスト -- 修正 -- 配線の全面差し替え

**Acceptance Criteria:**
- Given 月表示, when 日付セルをタップする, then その日を含む週の1行だけに月グリッドが折りたたまれ、下にその日の予定一覧が大きく表示される(クイックシフトシートは開かない)
- Given 折りたたみ状態, when 「月表示に戻る」を押す, then 全体の月グリッドに戻りパネルが閉じる
- Given 月表示, when 日付セルをダブルタップする, then その日を cursor にして「日」ビューへ切り替わる
- Given カレンダー画面, when ヘッダーの「シフトを追加」を押す, then `/shifts/add` が開く
- Given `/shifts/add`, when テンプレを選んでシフトを作成する, then `/calendar` へ戻り作成した予定が見える

## Implementation Notes

Code Map / Tasks どおり実装。spec に無かった小さい決定:
1. `MonthView`の「戻る」コールバックprop名は`onBackToMonth`(仕様書に命名指定無し)。
2. `weekRowOf`が空配列(折りたたみ対象日が現在の月グリッド外)の場合、`MonthView`はフル月グリッドへ自動フォールバック(仕様書に無いエッジケース対応、後にレビューで親との同期漏れが発覚しパッチ)。
3. ヘッダーの並び順は「シフトを追加」を「予定を追加」より左に配置。
4. `QuickShiftScreen`から旧シートの「シフト以外の予定を追加」導線を削除(後にレビューで復活が必要と判明しパッチ)。
5. 「戻る」ボタンの文言は矢印無しの「月表示に戻る」で統一。

**レビュー後パッチ(7件、詳細は Review Triage Log 参照):**
- `selectedDay`(折りたたみ状態)を`cursor`/`view`変化に応じてクリアする`useEffect`追加
- `QuickShiftScreen`の起点日が空/不正な場合のガード追加、無効な`required`属性を削除
- シフト作成成功後に`refreshFeaturedWidget()`を呼ぶよう追加(Story 5.6の契約を回復)
- 日付セルボタンに`touch-manipulation`を追加(iOS双子タップズーム対策)
- `DayEventPanel`に「この日に予定を追加」ボタンを追加(失われた動線を復活)
- `QuickShiftScreen`の空状態表示にローディング状態のガード追加
- `groupEventsByDay`/`makePriorityOf`の二重計算を`CalendarScreen`で一本化

## Spec Change Log

## Review Triage Log

3並列レビュアー(Blind Hunter 7件 / Edge Case Hunter 6件 / Verification Gap 2件、計15件)を baseline `21a8387` からの unified diff(47.2KB)に対して実施。重複統合・実ソース照合の上でトリアージ:

**patch(7件、同一実装サブエージェントへ差し戻し)**

1. **`selectedDay`が月送り・ビュー切替等で同期されずパネルだけ残り続ける** — high。Blind Hunter・Edge Case Hunter・Verification Gapの3人全員が独立に到達(異なる切り口: 静的読み・シナリオ追跡・テストギャップ推論)。`MonthView`内部の空配列フォールバックが親の`selectedDay`に伝わらない構造的な非同期化。
2. **`QuickShiftScreen`の起点日を空にすると1900年のシフトが作成される** — high。Blind HunterとEdge Case Hunterが同じ根を指摘、`ymd("")`→`{year:0,...}`という具体的な壊れ方まで確認済み。DB汚染につながる実害あるバグ。
3. **`/shifts/add`経由の作成がホームウィジェットを更新しない** — high。Edge Case Hunter発見、`useEvents.ts`の`void refreshFeaturedWidget()`呼び出しパターンとの不一致を実ソース照合(grep)で確認。Story 5.6で確立した契約からの回帰。
4. **iOSダブルタップズームとの衝突対策が未実装** — medium。Blind Hunter・Edge Case Hunter。spec自身のManual Checksで明示的に懸念されていたのにコード対策が無かった。
5. **月表示から特定日への一般予定追加動線が失われた** — medium。Blind Hunter。旧シートの「シフト以外の予定を追加」が置き換え後どこにも無い。
6. **`QuickShiftScreen`の空状態表示がローディング中を考慮していない** — low(cheap)。Edge Case Hunter。
7. **`groupEventsByDay`/`makePriorityOf`の二重計算** — low。Blind Hunter。既存の「派生データは呼び出し元で計算」慣習からの逸脱。

**defer(パッチ対象外)**

- `onClick`/`onDoubleClick`共存によるダブルタップ時の一瞬のパネルちらつき(Blind Hunter・Edge Case Hunter)— デバウンス等で解消しようとすると通常のシングルタップの反応が(250〜300ms)遅くなり、頻度の高い操作を犠牲に頻度の低い操作の見た目を直すトレードオフになる。ちらつき自体もダブルタップ後は即座に画面遷移するため体感は薄いと判断し見送り。
- `<input required>`が`<form>`無しで実質無効(Edge Case Hunter、「claim」種別)— パッチ2で`!date`の明示チェックを追加するため実害は解消される。属性自体は実装時に併せて削除するよう指示済み。

## Design Notes

**ダブルタップは既存「日」ビューへの切替に統一した理由**: 「全画面表示」という要望は、既存の`WeekView.tsx`(backlog①で「日」に改名済み)が`CalendarScreen`のコンテンツ領域全体を占有する形ですでに満たしている。新しいモーダル/オーバーレイ表示を別途作ると、予定の編集・スロットタップでの予定追加等、日ビューが元々持つ機能を丸ごと再実装するはめになる。`jumpTo`+`setView`という既存のドリルダウンの仕組み(backlog②の年→月ドリルダウンと同じ形)を再利用するだけで済むため、新規UIを作らない判断にした。

**シフト入力ページの導線をCalendarScreenヘッダーにした理由**: 「ワンタップ・シフト入力」は元々このアプリの主要機能(Epic4の目玉)であり、`/shift-templates`(テンプレ管理、稀な操作)のように設定画面の奥へ埋めると発見しづらくなる。既存の「予定を追加」ヘッダーボタンと同じ並びに置くことで、月表示の日付タップという入口を失っても迷わず見つけられるようにした。下タブへの追加(4番目のタブ)は現在の「ホーム/カレンダー/設定」という主要3画面構成を変える大きな決定になるため今回は避けた。

## Verification

**Commands(パッチ後、独立に再実行して確認済み):**
- `npm run typecheck` -- ✅ 0 errors
- `npm run lint` -- ✅ 0 errors
- `npm test` -- ✅ 86 files / 679 tests 全部 green(パッチ前671 → +8)
- `npm run build` -- ✅ 成功

**Manual checks:**
- `npm run dev` での実ブラウザ目視確認・モバイル実機でのダブルタップ動作確認は未実施(ユーザー確認事項として残す)。自動テストで折りたたみ/パネル切替/ダブルタップでの日ビュー遷移/`selectedDay`自動クリア/シフト入力ページの各経路は担保済み。
