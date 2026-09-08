---
title: 'Story 2.5: ホームのコンパクトビュー'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2ed3798314fafaeaf624c3c9bf0a69121d6d75a9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-4-select-featured-events.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ホーム画面は「後続ストーリーで実装」のプレースホルダのまま。Story 2.4 の `selectFeaturedEvents` を実際に画面へ出す先が無い(FR-10)。

**Approach:** ホームに `compact-card` を実装する。表示オンのカレンダーの予定を `selectFeaturedEvents` に通し、この後の代表予定を優先度順・低密度(1件ずつ独立した行)で最大 N 件表示する。N は設定(1〜3、既定3)。行タップでカレンダーの該当日へ遷移。0件なら「この後の予定はありません」を1行で静かに出す。

## Boundaries & Constraints

**Always:**
- `src/features/compact/` に新設。`packages/core` の `selectFeaturedEvents`(Story 2.4)/ `makePriorityOf`(Story 2.3)を使う。並び・選抜ロジックを UI に書かない。
- `src/features/compact/model/featuredCount.ts`: 表示件数のストア。`useSyncExternalStore` で `localStorage['calendar-app.featured-count']` を購読(範囲 1〜3、既定3、範囲外・不正は既定)。`setFeaturedCount(n)` で更新(clamp + 保存 + 通知)。localStorage 不可でも状態は反映。テスト用リセット関数も置く。
- `src/features/compact/model/useFeaturedEvents.ts`: `useFeaturedEvents(events, calendars, count)` → 表示オン(`isVisible`)のカレンダーの予定に絞り、`makePriorityOf(calendarById)` と `new Date().toISOString()` を `selectFeaturedEvents` へ渡す。`useMemo([events, calendars, count])`。
- `src/features/compact/ui/CompactCard.tsx`: 純表示。`featured: EventItem[]` / `calendarById` / `onSelect`。0件は `<p>この後の予定はありません</p>`(感嘆符なし・静か)。1件以上は `<ul>` に各予定を独立行で ── 既存 `EventListItem`(`compact` prop)を再利用(左端カレンダー色バー + 開始時刻 + タイトル + カレンダー名)。DOM 順 = 配列順 = 優先度順(SR 読み上げ順もこれ)。
- `HomeScreen`: `useAuth` / `useEvents` / `useCalendars` / `useFeaturedCount` / `useFeaturedEvents` を使い `CompactCard` を描画。行タップ → `useNavigate` で `/calendar?date=<ローカル暦日>`(終日は `eventDate`、時刻付きは `localDateOf(startsAt)`)。見出し右のリンク文言は「カレンダーの並び順 ›」に統一。
- `useCalendarView(events, calendars, initialDate?)`: 第3引数(省略可)。`cursor` の初期値を `initialDate ?? todayLocalDate()` に。`initialDate` が変わったら `setCursor(initialDate)`(truthy のときのみ)。
- ルーティング: `/calendar` の要素を小ラッパにし `useSearchParams().get('date')` を読んで `<CalendarScreen initialDate=... />` に渡す。`CalendarScreen` に `initialDate?: string` prop を追加(既存のバレなテストを壊さないためルータフックはラッパ側)。
- 設定画面に「ホームに出す予定の数」セクション(radiogroup、1/2/3、`aria-checked`、44px、現在値に ✓)。`setFeaturedCount` で変更、`useFeaturedCount` で表示。
- すべての対話要素: role + 状態ラベル、44px 以上、フォーカスリング維持、感嘆符・達成演出なし(NFR12 / UX-DR14 / UX-DR15)。
- 変更・新設したモデル/表示に単体テスト。

**Never:**
- `selectFeaturedEvents` 本体の変更(Story 2.4)。全体規則の対案。
- 引っ張って更新(タッチジェスチャ)/ 開きっぱなしでの `now` 自動更新 ── Story 範囲外(deferred)。
- 給料見込みカード(Epic 4)。コンパクトビュー「専用画面」を別ルートで作ること(v1 はホームがそれを兼ねる。FR-10 の1画面要件はホームで満たす)。
- `compact-card` の筆頭予定を大きく見せる lead 装飾(UX-DR3 が言及するが AC は「1件ずつ独立した行」= 均一。装飾は後日)。
- data-access・テーブル・マイグレーションの変更。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| この後に予定あり | 表示オンのカレンダーに未来/進行中の予定 | 優先度順に最大 N 件、各行に色バー・開始時刻・タイトル・カレンダー名 |
| この後に予定なし | 対象0件(すべて過去、または予定なし) | 「この後の予定はありません」1行のみ(感嘆符なし) |
| 表示オフのカレンダー | 高優先度だが `isVisible=false` | compact-card に出さない |
| 件数設定 | 設定で 2 を選ぶ | ホームが最大2件になる(再訪不要、`useSyncExternalStore` で即時) |
| 設定の不正値 | localStorage に `"9"` / `"x"` | 既定3で扱う |
| 行タップ(時刻付き) | 9/20 の予定をタップ | `/calendar?date=2026-09-20` へ遷移し、その日が表示される |
| 行タップ(終日) | 終日予定をタップ | `eventDate` の日へ遷移 |
| localStorage 不可 | プライベートモード等 | 既定3で動作、設定変更もその場では効く(保存されないだけ) |
| SR 読み上げ | コンパクトビュー | 行の DOM 順が優先度順 |
| 未ログイン/未設定 | `state==='unavailable'` | 予定0件 → 「この後の予定はありません」 |

</frozen-after-approval>

## Open Questions

*(なし ── [ASSUMPTION]: (1) featured は `isVisible` のカレンダーに絞る(表示トグルは「ビューから隠す」意図。compact-card もビュー)。(2) 遷移は現在のビュー種別を保ったまま該当日へ(view は localStorage 永続のまま)。(3) `now` は events/calendars 変更時に取り直し、開きっぱなしの自動更新はしない。Design Notes 参照。)*

## Code Map

- `src/features/home/ui/HomeScreen.tsx` -- 現在プレースホルダ。`Screen` + `<Link>` のみ。ここに compact-card を組む。
- `src/features/settings/ui/SettingsScreen.tsx` -- テーマ radiogroup が件数ピッカーの手本。`AccountSection` / `DataSection` の後に「ホームに出す予定の数」を足す。
- `src/features/settings/model/useTheme.ts` -- localStorage 永続フックの手本(ただし件数は `useSyncExternalStore` で跨コンポーネント反映)。
- `src/features/calendar/model/useCalendarView.ts` -- `cursor` は `useState(() => todayLocalDate())`。`initialDate?` 第3引数を追加。呼び出しは `CalendarScreen` のみ。
- `src/features/calendar/ui/CalendarScreen.tsx` -- `useCalendarView(ev.events, cal.calendars)` を呼ぶ。`initialDate?` prop を受けて渡す。
- `src/app/routes.tsx` -- `{ path: 'calendar', element: <CalendarScreen /> }`。`useSearchParams` を読むラッパ `CalendarRoute` に差し替え。
- `src/features/events/ui/EventListItem.tsx` -- `compact` prop で時刻のみ表示。行の見た目(色バー + when + title + カレンダー名)を compact-card で再利用。
- `src/features/events/model/useEvents.ts` / `src/features/calendars/model/useCalendars.ts` -- `{ events, loading, ... }` / `{ calendars, loading, ... }`。`CalendarScreen` と同じ使い方。
- `src/lib/datetime.ts` -- `localDateOf(iso)` / `todayLocalDate()`。
- `packages/core` -- `selectFeaturedEvents` / `FeaturableEvent`(2.4)、`makePriorityOf` は `src/lib/calendar-view.ts`(2.3)。
- `src/app/__tests__/shell.test.tsx` -- ホーム見出し「今日」を確認。compact-card 追加後も維持。

## Tasks & Acceptance

**Execution:**
- [x] `src/features/compact/model/featuredCount.ts` -- `useSyncExternalStore` ストア。`useFeaturedCount()` / `setFeaturedCount(n)` / 定数(MIN 1 / MAX 3 / DEFAULT 3)/ `resetFeaturedCountForTests()`。clamp + localStorage 永続 + 通知
- [x] `src/features/compact/model/useFeaturedEvents.ts` -- `isVisible` 絞り込み → `selectFeaturedEvents(visible, makePriorityOf(calendarById), new Date().toISOString(), count)` を `useMemo`
- [x] `src/features/compact/ui/CompactCard.tsx` -- 0件は静かな1行、1件以上は `<ul>` + `EventListItem compact`。`onSelect`
- [x] `src/features/compact/ui/CompactCard.test.tsx` -- 0件表示 / 優先度順の行順 / 行タップで onSelect / 感嘆符なし
- [x] `src/features/compact/model/featuredCount.test.ts` -- 既定3 / 保存と復元 / 範囲外は既定 / clamp / localStorage 不可でも動く
- [x] `src/features/compact/model/useFeaturedEvents.test.ts` -- isVisible 絞り込み / 件数 / 優先度順 / 0件で空
- [x] `src/features/home/ui/HomeScreen.tsx` -- compact-card 統合、行タップで `/calendar?date=` へ、見出しリンク文言統一
- [x] `src/features/home/ui/HomeScreen.test.tsx` -- 予定ありで行が出る / 0件文言 / タップで正しい URL へ / 見出し
- [x] `src/features/calendar/model/useCalendarView.ts` -- `initialDate?` 第3引数、cursor 初期値と変更時 jump
- [x] `src/features/calendar/model/useCalendarView.test.ts` -- `initialDate` を渡すと cursor がその日 / 省略時は今日(回帰)
- [x] `src/app/routes.tsx` + `src/features/calendar/ui/CalendarScreen.tsx` -- `CalendarRoute` ラッパで `?date=` を読み `initialDate` prop へ
- [x] `src/features/settings/ui/SettingsScreen.tsx` -- 「ホームに出す予定の数」radiogroup(1/2/3)
- [x] `src/features/settings/ui/SettingsScreen.test.tsx` -- 件数を選ぶと `useFeaturedCount` が変わる(または既存テストが無ければ最小限の1本)

**Acceptance Criteria:**
- Given この後に予定がある, when ホームを開く, then compact-card が代表予定を優先度順・低密度(独立行)で表示し、各行にカレンダー名・色・開始時刻がある
- Given 表示件数を設定で変える, when ホームを見る, then 最大件数がその値になる(既定3)
- Given 代表予定, when タップする, then カレンダーのその予定の日へ遷移する
- Given この後に予定がない, when ホームを開く, then 「この後の予定はありません」を1行で静かに(感嘆符なし)表示する
- Given スクリーンリーダー, when コンパクトビューを読む, then 行の順序が優先度順である
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- `src/features/compact/` 新設: `model/featuredCount.ts`(`useSyncExternalStore` + localStorage、clamp 1〜3、`resetFeaturedCountForTests`)、`model/useFeaturedEvents.ts`(`isVisible` 絞り込み → `selectFeaturedEvents(visible, makePriorityOf(calendarById), new Date().toISOString(), count)` を `useMemo`)、`ui/CompactCard.tsx`(0件は静かな1行、1件以上は `<ul aria-label="この後の予定">` + `EventListItem compact`)。
- `HomeScreen`: `useAuth`/`useEvents`/`useCalendars`/`useFeaturedCount`/`useFeaturedEvents` を使って `CompactCard` を描画。行タップ → `useNavigate('/calendar?date=<localDateOf(startsAt) or eventDate>')`。見出し右リンクを「カレンダーの並び順 ›」に統一(「予定を追加」リンクは撤去、モックに合わせる)。
- `useCalendarView(events, calendars, initialDate?)`: 第3引数。cursor 初期値と、`initialDate` 変更時の `setCursor`(truthy のみ)。
- ルーティング: `routes.tsx` に `CalendarRoute` ラッパ ── `useSearchParams().get('date')` を `/^\d{4}-\d{2}-\d{2}$/` で検証してから `<CalendarScreen initialDate=... />`。`CalendarScreen` は `initialDate?: string` prop(既存の bare render テストを壊さないためルータフックはラッパ側)。
- `SettingsScreen`: 「ホームに出す予定の数」radiogroup(1/2/3、`min-h-11`、`aria-checked`、現在値に ✓)。
- テスト +28(featuredCount 6 / useFeaturedEvents 4 / CompactCard 4 / HomeScreen 5 / SettingsScreen 2 / useCalendarView 3 / routes 3 / CalendarScreen initialDate 1)。全体 **250 tests**。
- **未検証(実ブラウザ)**: ホームの実表示、設定変更の即時反映、行タップ遷移、SR 読み上げ順。ロジックは単体・結合テストで担保。

## Spec Change Log

*(なし。bad_spec / intent_gap ループバックなし。)*

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=6。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| 手書き `/calendar?date=garbage` で `useCalendarView` の cursor に不正値が入り、`ymd`→`new Date(NaN,...)` で月グリッド描画が壊れる。本ストーリーが `?date=` 経路を新設した | `ymd('garbage')` → `[year=NaN]`(default 適用されず)→ Invalid Date。アプリ自身は常に `YYYY-MM-DD` を生成するが URL は外部入力 | low | patch: `CalendarRoute` で `/^\d{4}-\d{2}-\d{2}$/` に一致しない値は `undefined` にして無視。`routes.test` に不正値ケース |
| `?date=` → 該当日が実際に表示されることの結合テストが無い(部品は単体テスト済み) | `CalendarRoute` は3行だが「ルート要素の差し替え」の配線ミスを検出できない | low | patch: `routes.test.tsx` 新設(`AppRoutes` を MemoryRouter で `/calendar?date=2026-12-25` から描画 → 「2026年12月」)+ `CalendarScreen` の `initialDate` prop テスト |
| compact-card の行は開始時刻のみ表示。翌日以降の代表予定でも「10:00」で日付が付かず誤認しうる | AC は「開始時刻」とだけ規定。当日予定が主で、翌日以降が出るのは当日0件時のみ。`EventListItem compact` を仕様どおり流用 | low | reject(AC 準拠。当日以外の日付添えは enhancement → deferred-work.md) |
| `useFeaturedEvents` の `useMemo` 内で `new Date()` を読むのは不純。開きっぱなしで `now` が失効しない | spec [ASSUMPTION] で明示。再実行時に拾う `now` はほぼ同時刻で実害なし。`syncNonce`・開き直しで更新 | low | reject(文書化済み・無害。自動失効/pull-to-refresh は deferred-work.md) |
| 設定の「ホームに出す予定の数」が Account/Data より上にあり IA がやや不自然 | モック/EXPERIENCE は設定内の並びを規定せず。害の名指しなし | low | reject(整容のみ、名指しできる害なし) |
| `/calendar?date=X` に居るとき下タブ「カレンダー」を再タップしても cursor が今日へ戻らない(`initialDate` が undefined になり effect の guard で skip) | `今日` ボタンで復帰できる。`useRoutes` の同一ルート内なのでアンマウントもされない | low | reject(軽微。`今日` ボタンで緩和) |

## Design Notes

- **件数ストアは `useSyncExternalStore`**: 設定画面とホームは別ルートだが、設定変更が「ホームに戻る前に」効くべき体験を素直に満たす。`useTheme` 型の useState + localStorage だと再マウントまで反映されない。ストアは localStorage をバックにしたモジュール1個 + リスナー集合。
- **[ASSUMPTION] featured は `isVisible` で絞る**: 表示トグルは「このカレンダーをビューから隠す」意図。compact-card もビューの一種なので隠す。優先度自体は保持される(DB 側、Story 2.1)。
- **[ASSUMPTION] `now` の鮮度**: `useFeaturedEvents` の `useMemo` が `new Date()` を読むのは events/calendars/count が変わったとき。ホームを開き直す・データ再取得(`syncNonce`)で更新される。開きっぱなしでの自動失効・引っ張って更新は Story 範囲外。
- **遷移は search param `?date=`**: 共有・リロード耐性・テスト容易性。ルータフックは `routes.tsx` のラッパに閉じ込め、`CalendarScreen` は `initialDate?: string` prop だけ受ける(既存の bare render テストを壊さない)。
- **行は `EventListItem` 再利用**: `compact` prop で「開始時刻のみ + タイトル + カレンダー名 + 色バー」。`onEdit` コールバックを `onSelect`(遷移)に流用。lead 装飾(筆頭を大きく)は AC の「均一な独立行」に沿って入れない。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス
- `npm run build` -- 成功

**Manual checks:**
- `npm run dev`(Supabase 接続時): ホームに直近予定が優先度順で最大3件、設定で2件に変えると即2件、行タップでカレンダーのその日へ、予定を全部過去にすると「この後の予定はありません」。
