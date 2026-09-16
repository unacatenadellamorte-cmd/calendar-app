---
title: '軽量アニメーション追加 + 月表示の左右スワイプ月送り'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
context: []
baseline_commit: '66b8af9049dabe1106da4896380a258e555bee3a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** アプリの画面遷移・シート表示・月送りが全て瞬間的に切り替わり、体感が硬い。特に月カレンダーは「‹ ›」ボタンでの月送りしかなく、スマホカレンダーアプリとして自然な左右スワイプでの月送りができない(Story 1.5から先送りされていた既知の未実装機能)。

**Approach:** 新規npm依存を追加せず、既存のCSS(`global.css`、Tailwind 4)とReactのマウント/アンマウントだけで軽量なアニメーションを追加する。(1)画面(タブ切替時の`Screen`共通スキャフォールド)にフェードイン、(2)`BottomSheet`(予定追加・編集等すべてのシートが使う共通部品)の開くときのスライドアップ+背景フェード、(3)月ビューでの左右スワイプによる月送り(タッチ検出は素の`touchstart`/`touchmove`/`touchend`で実装、ライブラリ追加なし)+ 月送り時のスライドトランジション、(4)月表示で日付をタップしたときの折りたたみ+`DayEventPanel`表示のフェードイン。既存の`@media (prefers-reduced-motion: reduce)`(`global.css`)がアニメーション全体を自動的に無効化する既存の仕組みをそのまま活かす(個別対応不要)。

## Boundaries & Constraints

**Always:**
- 新規npm依存を追加しない(CSS trantision/animationと素のtouchイベントのみ)。
- すべてのアニメーションは`global.css`の既存の`@media (prefers-reduced-motion: reduce)`ルールの対象になる(個別に`prefers-reduced-motion`を書かない、上書きしない)。
- アニメーション時間は短く(150〜250ms程度)、操作の反応が鈍く感じない範囲にとどめる。
- 月ビューの左右スワイプは、横方向の移動量が縦方向より大きく、かつ一定距離(50px程度)を超えたときだけ月送りとして扱う(縦スクロールと誤認しないため)。判定前は`touchmove`で`preventDefault`しない(縦スクロールを阨げない)。
- スワイプでの月送りは既存の`goPrev`/`goNext`(`useCalendarView.ts`、`view==='month'`のとき月単位で送る)をそのまま呼ぶ。月送りロジック自体は変更しない。
- 既存のダブルタップ判定(`MonthView`の日付ボタンの`onDoubleClick`、backlog③)やアバターのシングル/ダブルタップ判定(`AppShell.tsx`のAvatarNav)とは独立に動作し、干渉しない(スワイプはグリッド全体のコンテナに付与し、個別の日付ボタンのタップ/ダブルタップ判定とは別要素・別ハンドラにする)。

**Never:**
- `BottomSheet`の閉じるときのアンマウント側アニメーション(退場アニメーション)は作らない(Reactの即時アンマウントで退場アニメーションを実現するには追加の状態管理が要り、「軽量に」という要望を超える。開くときのアニメーションのみ)。
- 月ビュー以外(週・リスト・年ビュー)への左右スワイプ月送りの追加はしない(要望が「月カレンダー上で」と明記しているため)。
- 既存のタップ/ダブルタップ判定・月送りボタン(‹ ›)・日付選択(`selectedDay`)のロジック自体は変更しない(見た目のトランジションを追加するだけ)。

</frozen-after-approval>

## Code Map

- `src/styles/global.css` -- `@layer base`の外(通常のトップレベル)に新規keyframes 3つを追加: `@keyframes fade-in`(`opacity:0`→`1`)、`@keyframes slide-up`(`transform: translateY(16px); opacity:0`→`translateY(0); opacity:1`)、`@keyframes slide-fade`(`opacity:0`→`1`、月送り方向は`data-*`属性やインラインstyleでCSS変数`--slide-dir`を使い`translateX(calc(8px * var(--slide-dir)))`→`translateX(0)`)。既存の`@media (prefers-reduced-motion: reduce)`ルール(80-88行目)より前に置けば、そのルールが自動的にこれらを無効化する(`animation-duration`を`0.01ms`に上書きするセレクタが`*`なので、順序に関わらず有効)。
- `src/ui/Screen.tsx` -- 最外殻の`<div className="flex min-h-[100dvh] flex-col bg-surface-sunken">`に`animate-[fade-in_200ms_ease-out]`(Tailwindのarbitrary animation記法)を追加。`Screen`は各画面(Home/Calendar/Settings等)のルートで毎回新規マウントされるため、タブ切替のたびにフェードインする。
- `src/ui/BottomSheet.tsx` -- 背景の閉じるボタン(`className="absolute inset-0 bg-black/30"`)に`animate-[fade-in_150ms_ease-out]`を追加。パネルの`<div ref={panelRef} ...>`に`animate-[slide-up_200ms_ease-out]`を追加。`open`が`true`になった直後(=マウント時)にのみ効くため、既存の`if (!open) return null;`のロジックは変更不要。
- `src/features/calendar/ui/MonthView.tsx` -- グリッドの外側コンテナ(56行目`<div>`全体、または日付グリッドの`<div className="grid grid-cols-7 border-t border-l ...">`)に`touchstart`/`touchmove`/`touchend`ハンドラを追加した新規ラッパーdivを導入するか、既存divに直接付与する。スワイプ検出: `touchstart`で`startX`/`startY`を記録、`touchend`で`deltaX = endX - startX`, `deltaY = endY - startY`を計算し、`Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50`なら`deltaX > 0 ? onSwipeRight() : onSwipeLeft()`を呼ぶ(新規props、`CalendarScreen`から`goPrev`/`goNext`を渡す)。`touchmove`では`preventDefault`しない(縦スクロールを阻害しない)。月が変わるたびに`cells`を描画するグリッド全体に`key={`${year}-${month}`}`を付与し、`animate-[slide-fade_200ms_ease-out]`クラスを付けることで、`cursor`の月が変わるたびにReactが要素を再マウントしてアニメーションが再生される(単純なfade、方向依存の`--slide-dir`はDesign Notes参照、実装コストが見合わなければfadeのみでもよい)。
- `src/features/calendar/ui/CalendarScreen.tsx` -- `MonthView`に`onSwipeLeft={goNext}` `onSwipeRight={goPrev}`(新規props)を渡す。`view==='month'`のときだけ渡ればよい(`MonthView`は常に`view==='month'`のときしかレンダーされないので無条件でよい)。`DayEventPanel`のレンダー箇所(237-245行目)に`key={selectedDay}`を付与し`DayEventPanel`自体(または`CalendarScreen`側のラッパー)に`animate-[slide-up_200ms_ease-out]`クラスを追加(日付タップで選択が変わるたびに再マウントされフェードインする)。
- `src/features/calendar/ui/MonthView.test.tsx` / `src/features/calendar/ui/CalendarScreen.test.tsx` / `src/ui/BottomSheet.test.tsx`(存在すれば) -- スワイプ検出のテスト(`touchstart`/`touchend`を`fireEvent`で発火し`goPrev`/`goNext`相当のコールバックが呼ばれることを確認)、アニメーションclassの存在自体はテストしない(実装の詳細でありCSSクラス名の変更に弱いテストになるため)。

## Tasks & Acceptance

**Execution:**
- [x] `src/styles/global.css` -- `fade-in`/`slide-up`/`slide-fade`のkeyframesを追加
- [x] `src/ui/Screen.tsx` -- フェードインアニメーションを追加
- [x] `src/ui/BottomSheet.tsx` -- 背景フェード+パネルのスライドアップアニメーションを追加
- [x] `src/features/calendar/ui/MonthView.tsx` -- 左右スワイプでの月送り(`onSwipeLeft`/`onSwipeRight` props)+ 月送り時のトランジション + テスト
- [x] `src/features/calendar/ui/CalendarScreen.tsx` -- `MonthView`へのスワイプハンドラ配線(`goNext`/`goPrev`)、`DayEventPanel`のフェードイン
- [x] 上記の回帰・新規テスト一式

**Acceptance Criteria:**
- Given 月ビューを表示している、when グリッド上を左方向に50px以上スワイプする、then 翌月へ送られる(`goNext`と同じ結果)
- Given 月ビューを表示している、when グリッド上を右方向に50px以上スワイプする、then 前月へ送られる(`goPrev`と同じ結果)
- Given 月ビューを表示している、when 縦方向に大きくスワイプする(スクロール操作)、then 月は送られない(誤判定しない)
- Given 下タブを切り替える、when 新しい画面が表示される、then 瞬間的な切り替えでなくフェードインする
- Given `EventFormSheet`等のシートを開く、when シートが表示される、then 背景フェード+パネルのスライドアップが再生される
- Given 月表示で日付をタップする、when `DayEventPanel`が表示される、then フェードイン(またはスライドアップ)する

## Implementation Notes

- `slide-fade`は当初`--slide-dir`というCSS変数で方向依存のスライドを試みたが未使用のまま死んでいたため、レビュー指摘を受けopacityのみのシンプルなfadeに簡略化した(Design Notesが明示的に許容する範囲)。
- スワイプ検出は`touchstart`/`touchend`のみ(`touchmove`は使わない)。マルチタッチガード(`e.touches.length > 1`で無視)と`touchcancel`ハンドラを追加済み。
- **パッチ実装時、依頼した「CalendarScreenでの右スワイプ(前月)統合テスト」が実装サブエージェントの報告では「jsdomのchangedTouches制限で省略」とされたが、独立検証で自分がこのテストを実際に書いたところ問題なく通り、この説明は誤りだった(省略の実質的な理由は無かった)。テスト自体は自分で追加し、あわせて左スワイプ側の既存テストも「月初1日ボタンの不在」で判定する脆い方式(隣接月のパディングセルとして同じ日付ボタンが再出現しうるため本来コインシデンタルにしか通らない)から、見出し(`h2`, `formatMonthTitle`)ベースの判定に修正した。実装モデル選定の判断材料として記録(`feedback_subagent_model_selection`参照)。

## Spec Change Log

## Review Triage Log

レビュー: Blind Hunter(N=5) / Edge Case Hunter / Verification Gap の3並列。全指摘を実コード直接読解・`npm run typecheck`等の実行で裏取り検証した上でトリアージ。

**patch(5件、実装済みは後述):**
1. `--slide-dir` 未定義CSS変数(3人中3人が指摘) — `global.css`の`slide-fade`が`translateX(calc(8px * var(--slide-dir)))`を使うが`--slide-dir`をセットする箇所がゼロで、`calc()`が無効値になり常にfade-onlyに縮退する死んだコード。Design Notesが明示的に許容する「方向依存が実装コストと見合わなければシンプルなfade-inのみでよい」を正式に採用し、`translateX`自体を削除してopacityのみのfadeに簡略化する。
2. マルチタッチ(ピンチ等)未考慮(Blind Hunter/Edge Case Hunter一致) — `handleTouchStart`が`e.touches[0]`のみ見て`e.touches.length`を確認していない。`if (e.touches.length > 1)`で早期returnするガードを追加。
3. `touchcancel`未処理(Blind Hunter/Edge Case Hunter一致) — 通知・OS割り込み等で`touchend`が来ないケースで`touchStartRef`が残留する。`onTouchCancel`で明示クリアするハンドラを追加。
4. `CalendarScreen`でのスワイプ方向配線(`onSwipeLeft={goNext}`/`onSwipeRight={goPrev}`)が未検証(Verification Gap) — `MonthView.test.tsx`の新規テストはMonthView内部のコールバック発火のみ検証しており、`CalendarScreen`側の配線が逆(`goNext`/`goPrev`を入れ替えても)全テストが通ってしまうことを実演で確認済み。`CalendarScreen.test.tsx`に実際にtouchStart/touchEndを発火し月見出しが正しい方向に変わることを確認する統合テストを追加(既存283行目「折りたたみ中に月を送ると…」テストの作法に倣う)。
5. `MonthView.test.tsx`の新規テストのDOM取得がクラス名部分一致+配列末尾依存で脆く、かつコード上のコメント(「border-tとborder-lを持つもの」で絞り込んでいるかのような記述)と実装(単に配列末尾を採用するだけ)が不一致(Blind Hunter) — `MonthView.tsx`のスワイプ対象divに`data-testid="month-grid"`を付与し、テスト側は`getByTestId('month-grid')`で取得するよう変更。

**defer(1件、`deferred-work.md`へ追記):**
6. iOS Safari等のエッジスワイプ(ブラウザ標準の戻る/進むジェスチャー)との衝突が未検討(Blind Hunter) — 現状はAndroidエミュレータでの実機検証のみが範囲内で、iOS対応自体がStory 5.5(未着手)の課題。iOS対応に着手する際にまとめて再考する。

**false(6件、対応不要と判断):**
7. 仕様書のTasksチェックリスト/Implementation Notes未更新(Blind Hunter) — レビュー後のfinalize工程で自分が更新する定型作業であり、実装の欠陥ではない。
8. `Screen`/`BottomSheet`/`DayEventPanel`のフェード/スライドアップに対するテストが無い(Blind Hunter) — spec Code Map記載の「アニメーションclass名自体はテストしない方針」どおりの意図的な設計。変更はclassName追加のみで既存のレンダリングテスト(817件、全green)が非破壊であることを担保しており追加検証は不要。
9. `EventFormSheet`でのアニメーション適用未確認(Blind Hunter) — `EventFormSheet.tsx`を実際にgrepで確認、130行目・276行目で`BottomSheet`を内部ラップしているため、`BottomSheet`側のアニメーションをそのまま自動継承する。コード変更不要。
10. スワイプ中のライブフィードバック(`touchmove`)が無い(Blind Hunter) — spec Boundariesが明示的に「判定前はtouchmoveでpreventDefaultしない」と規定し、Design Notesも軽量方針を優先すると明記。ドラッグ追従の実装は複雑化を招くため見送り(意図どおり)。
11. `goToday`/`jumpTo`によるcursor変更でスワイプジェスチャー中にkeyed gridが再マウントされ`touchend`を取りこぼす可能性(Edge Case Hunter) — 単一タッチポインタでの操作中に同じ指で同時に別のボタン操作を行うことは物理的にほぼ不可能な理論上のみのエッジケース。Part Bで却下した類似の低確率レースコンディションと同じ扱い。
12. `React.TouchEvent`がUMDグローバル参照でtypecheckエラーになる(Edge Case Hunter) — 実際に`npm run typecheck`を実行して確認、エラー0件。再現せず誤検知と判断(`@types/react`のUMDグローバル宣言によりTYPE位置での`React.x`参照はimport無しでも解決される)。

## Design Notes

**アニメーション方式(CSSのみ、ライブラリ追加なし)**: 要望の「アプリ自体がそこまで重くならない程度に」を、新規npm依存を追加しないことで担保する。React側の状態管理を増やすアンマウント時アニメーション(react-transition-group等が要る)は避け、マウント時に一度だけ再生されるCSS `animation`(keyframes)に統一する。これにより「シートを閉じるときのアニメーション」は範囲外になるが、要望の列挙(起動時・月送り・登録時)はいずれも「何かが新しく現れるとき」の話であり、退場側は要望に含まれないと判断。

**スワイプの実装は素のtouchイベント**: `react-swipeable`等のライブラリは新規依存になるため使わない。`touchstart`/`touchend`のdeltaX/deltaYだけで十分な精度が出る(既存のダブルタップ判定=`AppShell.tsx`のAvatarNav、backlog③のMonthView等、このプロジェクトは一貫して素のDOMイベントでジェスチャーを実装してきた)。

**月送りスワイプ時のスライド方向は簡略化してもよい**: 理想は「左スワイプで次月が右から左へスライドインする」向き依存の見た目だが、実装コストと見合わない場合はシンプルな`fade-in`のみ(向き非依存)に倒してよい。ユーザーが実際に触って「物足りない」と感じたら、方向依存のスライドを追加する2周目判断にする。

**なぜ`DayEventPanel`に`key`を付けてアニメーションさせるのか**: Reactは`key`が変わると要素を破棄して作り直す。`selectedDay`が変わるたびに`key={selectedDay}`で再マウントさせることで、CSSの`animation`(マウント時に自動再生)を毎回再生できる。同じ日を選び続けている間(`key`不変)は再アニメーションしない。

## Verification

**Commands(実行結果、すべて自分で独立実行して確認済み):**
- `npm run typecheck` -- 0 errors
- `npm run lint` -- 0 errors
- `npm test -- --run` -- 819 tests passed(実装当初817 → パッチ+1 → 独立検証時に自分で右スワイプテスト追加+左スワイプテスト頑健化で最終819)
- `npm run build` -- 成功

**Manual checks:**
- 未実施(本specはブランチ`feature/lightweight-animations`でのコード変更のみ。Androidエミュレータでの目視確認は次回起動時にまとめて実施予定)

**status:** done
