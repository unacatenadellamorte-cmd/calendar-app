---
title: 'Story 2.1: カレンダーの優先度設定(ドラッグ + キーボード)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f1ed2881273f46e7d33267466cff1be3277df47d'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-pwa-and-offline.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/mockups/key-calendars.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** カレンダーに優先順位を付ける手段がない。「大事なカレンダーを先に見せる」という本アプリの勝ち筋の土台が無い。

**Approach:** `calendars` に `priority`(整数順序値)を追加し、`(user_id, priority)` を部分ユニークにする。採番と並べ替えは1つの DB 関数(RPC `reorder_calendars`)経由でのみ行い、新規行の最下位採番は `before insert` トリガで行う(AD-5)。カレンダー管理画面の各行に順位番号・ドラッグハンドル・「▲ 上へ / ▼ 下へ」を出し、並べ替えを `useCalendars.reorder` → `reorderCalendars` に配線する。並び規則そのもの(一覧・リスト・compact)は Story 2.2 以降。

## Boundaries & Constraints

**Always:**
- マイグレーション: `calendars.priority integer not null`。既存行を `partition by user_id order by is_shift, created_at` で 0 起点に backfill。部分ユニーク索引 `(user_id, priority) where deleted_at is null`。`deleted_at` 済み行の priority 衝突は索引が除外するので不問。
- `reorder_calendars(ordered_ids uuid[])` RPC(`security invoker`、RLS 準拠、`auth.uid()` の行のみ)。一意制約を保つため1トランザクションで「対象を退避オフセット(例 `+1000000`)へ一括 → `unnest ... with ordinality` で指定順に `0..n-1` を再採番 → `ordered_ids` に無かった行は連番の続きへ」の順に更新する。単発の相互 UPDATE はしない。
- `before insert` トリガ `calendars_set_priority`: `new.priority is null` なら `coalesce(max(priority), -1) + 1`(同 user・`deleted_at is null`)を入れる。フロントの insert も(将来の)Edge Function の insert も priority を渡さない。
- `Calendar` 型に `priority: number`。`COLUMNS` / `toCalendar` に追加。`listCalendars` は `.order('priority', { ascending: true })` に変更(現行の `is_shift` / `created_at` 並びを置換)。
- data-access `reorderCalendars(orderedIds: string[]): Promise<Result<Calendar[]>>`: オンラインは `supabase.rpc('reorder_calendars', { ordered_ids })` → 成功で `listCalendars()` を返す。ネットワーク障害・オフラインは `offlineReorderCalendars`(outbox に `calendar/reorder` を積み、キャッシュの priority を楽観更新、並べ替え済みリストを返す)。キュー済みの前の reorder は置き換える(last-wins)。
- `sync.ts` の `flushOutbox` に `calendar/reorder` を追加: `reorderCalendars(payload.orderedIds)` を呼ぶ。
- `offlineCreateCalendar` は priority を `max(既存 priority)+1` で採番してキャッシュに入れる(オフライン新規も最下位)。
- `useCalendars`: `reorder(orderedIds: string[])` を公開。楽観的にローカル順を更新 → `reorderCalendars` → 失敗で元の順へロールバック + `errorKey`。`calendars` は常に priority 昇順。`undoDelete` の並べ直しも priority 基準に変更。
- **UI 主経路 = 「▲ 上へ / ▼ 下へ」ボタン**(キーボード・スクリーンリーダーで完結。44px 以上)。先頭行の「▲」・末尾行の「▼」は `disabled`。各行に順位番号を表示し、`sr-only` で「優先度 {rank}/{total}」、ボタンは「『{name}』を上へ」等のラベル。
- **ドラッグ = デスクトップの補助経路**。HTML5 DnD(`draggable` 属性 + `onDragStart/onDragOver/onDrop`)でグリップ(⋮⋮)から行を掴んで落とす。落下先で順を確定 → `cal.reorder`。
- シフト用カレンダーも並べ替え対象(削除は不可のまま。トグルも従来どおり)。
- 既存の error / Undo バー、`AuthState==='unavailable'` 表示、色非依存(色ドット + 名前 + source)は現行 `CalendarsScreen` / `CalendarRow` の規約どおり維持。

**Never:**
- 数値入力・ウェイト・優先度を刻む設定(順位ひとつに絞る)。
- 並び規則の適用(一覧・リストビュー・compact・月セル・週の重なりを優先度順にする)は Story 2.2 / 2.3。このストーリーは「設定できる」まで。
- `packages/core` への追加(優先度ユーティリティは Story 2.2)。
- スムーズなタッチドラッグ(長押し→指で移動)、DnD ライブラリの導入。→ `deferred-work.md` に計上、モバイルは ▲▼ で完結。
- `events` テーブル・他マイグレーションの変更。
- 取り込みカレンダー(Epic 3)固有の扱い。ただし priority 列・RPC・トリガは Epic 3 が共有できる形にする。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|---|---|---|
| ▲ で上へ | 順位2の行で「上へ」 | 1と2が入れ替わり、`reorderCalendars` が新しい id 順で呼ばれる。番号表示も更新 |
| ▼ が末尾 | 最下位行の「下へ」 | ボタンは `disabled`、何も起きない |
| ドラッグで移動 | 3行目を先頭へドロップ | 順序が更新され `reorderCalendars` が呼ばれる |
| 並べ替え失敗 | RPC が `data/query` を返す | 元の順に戻し、日本語メッセージを表示 |
| オフラインで並べ替え | `navigator.onLine === false` | 楽観的に並び替わり、`outbox` に `calendar/reorder` が1件(前の reorder は置換)。復帰でフラッシュ |
| 新規カレンダー作成 | ローカルで作成 | 一覧の最下位(最大 priority + 1)に入る |
| シフト用を移動 | シフト行で「上へ」 | 移動できる。削除ボタンは無いまま |
| 復帰フラッシュ | オフライン並べ替え後にオンライン | RPC が1回呼ばれ、`outbox` が空、再取得で確定順 |

</frozen-after-approval>

## Open Questions

*(なし)*

## Code Map

- `supabase/migrations/20260907000000_calendars.sql` -- `set_updated_at` 関数・RLS・部分ユニーク索引の書き方の手本。次の連番で priority マイグレーションを追加。
- `supabase/migrations/20260907010000_events.sql` -- 連番の並び。新ファイルは `20260908000000_calendar_priority.sql`。
- `src/data/calendars.ts` -- `Calendar` 型 / `COLUMNS` / `toCalendar` / `listCalendars` の並び / 新規 `reorderCalendars` / オフライン分岐(`offline-write.ts` 経由)/ `sortCalendars`(オフライン fallback、priority 基準へ)。
- `src/data/offline-write.ts` -- `offlineCreateCalendar`(priority 採番を追加)/ 新規 `offlineReorderCalendars`。`dropOutboxFor` で前の reorder を除去。
- `src/data/outbox.ts` -- `dropOutboxFor(entity, targetId, op?)` 既存。reorder は `targetId: 'reorder'` のセンチネルで積む。
- `src/data/sync.ts` -- `replay` の calendar 分岐に `case 'reorder'` を追加。
- `src/data/calendars.test.ts` -- 既存のモックチェーンに `rpc` を追加。reorder のオンライン/オフラインを検証。
- `src/features/calendars/model/useCalendars.ts` -- `reorder` を追加、`calendars` を priority 昇順で保持、`undoDelete` の並べ直しを priority 基準へ。
- `src/features/calendars/ui/CalendarRow.tsx` -- 順位番号 + ⋮⋮ グリップ + ▲▼ ボタン + `draggable` + DnD ハンドラ props。`sr-only`「優先度 {rank}/{total}」。
- `src/features/calendars/ui/CalendarsScreen.tsx` -- `<ul>` に DnD 状態、行から `onMove('up'|'down')` / `onDropReorder` を受けて id 配列を組み `cal.reorder`。見出しを「カレンダーの並び順」+ 補助文に。
- `src/features/calendars/ui/CalendarsScreen.test.tsx` / `CalendarRow.test.tsx` -- ▲▼ が正しい id 順で `reorder` を呼ぶ、末尾 ▼ 無効、`sr-only` 順位、非表示でも順位保持。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260908000000_calendar_priority.sql` -- `priority` 列 + backfill + not-null + 部分ユニーク索引 + `reorder_calendars` RPC(退避オフセット二段更新)+ `calendars_set_priority` before-insert トリガ -- スキーマ(AD-5)
- [x] `src/data/calendars.ts` -- `Calendar.priority` / `COLUMNS` / `toCalendar` / `listCalendars` を priority 順に / `reorderCalendars`(RPC + ネット障害・オフライン分岐)/ `sortCalendars` を priority 基準へ
- [x] `src/data/offline-write.ts` -- `offlineReorderCalendars(orderedIds)` / `offlineCreateCalendar` に priority 採番
- [x] `src/data/sync.ts` -- `replay` に `calendar/reorder` → `reorderCalendars`
- [x] `src/data/calendars.test.ts` -- モックに `rpc`。`reorderCalendars` がオンラインで `rpc('reorder_calendars', {ordered_ids})` を呼ぶ / オフラインで `outbox` に積む
- [x] `src/data/offline-write.test.ts` -- `offlineReorderCalendars` が前の reorder を置換して1件積む・キャッシュの priority を更新
- [x] `src/data/sync.test.ts` -- `calendar/reorder` の replay が `reorderCalendars` を呼ぶ
- [x] `src/features/calendars/model/useCalendars.ts` + `.test.ts` -- `reorder`(楽観 + ロールバック)、priority 昇順維持。楽観並び替え・失敗ロールバックをテスト
- [x] `src/features/calendars/ui/CalendarRow.tsx` + `.test.tsx` -- 順位番号・⋮⋮・▲▼(端で `disabled`)・`draggable`・`sr-only`「優先度 {rank}/{total}」。▲▼ が `onMove` を呼ぶ、端で無効、ラベルをテスト
- [x] `src/features/calendars/ui/CalendarsScreen.tsx` + `.test.tsx` -- 見出し「カレンダーの並び順」+ 補助文、行イベントから id 配列を組んで `cal.reorder`、DnD ハンドラ。▲ で2行の順が入れ替わり `reorder` が新 id 順で呼ばれることをテスト
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- スムーズなタッチドラッグ / DnD ライブラリ検討を追記

**Acceptance Criteria:**
- Given カレンダーが2つ以上, when 行の「▲ 上へ」を押す / 行をドラッグして落とす, then 表示順が変わり `reorderCalendars` が新しい id 順で呼ばれ、`(user_id, priority)` は RPC 経由で一意に保たれる
- Given キーボードのみ / スクリーンリーダー, when 行にフォーカスして「上へ / 下へ」を操作, then 同じ並べ替えができ、各行が「優先度 {rank}/{total}」を読み上げる。先頭の「▲」・末尾の「▼」は無効
- Given 新しくカレンダーを作る, when 一覧に追加される, then 既定で最下位の priority(最大 + 1)に入る
- Given オフライン, when 並べ替える, then 楽観反映され `outbox` に `calendar/reorder` が1件積まれ、オンライン復帰で RPC が1回実行される
- Given 並べ替えの RPC が失敗, when レスポンスを受ける, then 元の順に戻し日本語メッセージを表示する
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- **一意制約と並べ替え**: 部分ユニーク索引は deferrable にできないので、RPC は「全対象を `+1000000` へ退避 → `unnest ... with ordinality` で 0..n-1 を採番 → 余りを連番の続きへ」の三段。どの単一 UPDATE 文の中でも2行が同じ priority を持たないため immediate 索引でも通る。RPC は `security invoker` + `auth.uid()` null チェック(未認証は例外)。`ordered_ids` の重複は呼び出し側(`useCalendars.reorder` が現在の集合の順列のみを渡す)で保証。
- **据え置きクライアント UUID が効く**: オフラインでカレンダー作成 → その中で並べ替え、を後でフラッシュしても、insert は client id で通り FK・reorder の id 参照が生きる。`sync` の `idMap` は通常恒等。
- **▲▼ を主経路、ドラッグを補助**: HTML5 DnD(`draggable` + `onDragStart/Over/Drop`)はデスクトップ用。モバイル・キーボード・スクリーンリーダーは ▲▼(各 44px、端で `disabled`、`aria-label`「『{name}』を上へ」)。スムーズなタッチドラッグは `deferred-work.md` へ。`onDragStart` は `e.dataTransfer` を null ガード(テストで発火できるように)。
- **`listCalendars` の並び**: サーバー側 `.order('priority')`。オフライン fallback と `useCalendars` のローカル並べ直しは `sortCalendars`(priority → createdAt)。`useCalendars.reorder` は楽観的に配列順だけ入れ替え(priority 値はサーバー確定を待つ)、`CalendarsScreen` は配列 index で rank を出すので表示は正しい。
- **新規カレンダーの最下位**: オンラインは `calendars_set_priority` トリガ(`max+1`)。オフラインは `offlineCreateCalendar` が `max(cached priority)+1`。
- **既存テストの fixture 更新**: `Calendar` に `priority` 必須化に伴い、全テストの Calendar fixture に `priority: 0` を追加。
- **未検証**: マイグレーション SQL の実適用(Docker 無し。backfill の一意性・RPC の三段更新・トリガを目視レビュー済み)。実ブラウザのドラッグ・VoiceOver。ロジックは 189 tests。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス
- `npm run build` -- 成功

**Manual checks:**
- マイグレーション SQL を目視レビュー(backfill の一意性、部分ユニーク索引、RPC の二段更新で途中衝突が無いこと、トリガの採番)。実適用は Supabase 接続後にユーザーが `supabase db push`。
- `npm run dev`(Supabase 接続時): カレンダー管理で ▲▼ とドラッグで並べ替え、番号が更新される、新規作成が最下位に入る、オフライン(DevTools)で並べ替え → オンラインで確定すること。VoiceOver / NVDA で順位と操作が読まれること。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=8。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| ▲▼ ボタンが `h-7`(28px)で spec Always「44px 以上」に反する | 縦積み各 28px | medium | patch: 各 `h-11`(44px)へ。行は ▲▼ 列に合わせて背が高くなるが管理画面なので許容 |
| `onDragStart` が `e.dataTransfer.effectAllowed` を無防備に触る(jsdom で dataTransfer=null だと throw、テストで発火不可) | ブラウザでは常に存在するが | low | patch: `if (e.dataTransfer)` ガード。ドラッグ経路のテストを追加可能に |
| ドラッグ経路(`dropOn`)にテストが無い(▲▼ 経路のみテスト済み) | CalendarsScreen.test にドラッグ無し | gap | patch: `fireEvent.dragStart` → `fireEvent.drop` で `reorder` が splice 後の id 順で呼ばれることをテスト |
| `listCalendars` が priority 順であることのアサートが無い | calls 配列に order は記録される | low | patch: `calendars.test` で `order('priority', {ascending:true})` を assert |
| `reorder_calendars` RPC が `ordered_ids` の重複を弾かない(重複だと step2 の UPDATE が二重更新で例外) | 呼び出し側が現在集合の順列のみ渡す(`useCalendars.reorder` のガード) | low | reject(フロント側で保証。SQL に guard を足すと複雑さ増、実害の窓が無い) |
| `calendars_set_priority` トリガ(オンライン新規=最下位)がユニットテスト不可 | Docker 無し | — | defer(マイグレーション目視レビュー + `supabase db push` 後にユーザー確認。オフライン経路の max+1 はテスト済み) |
| `<li draggable>` 全体がドラッグ対象で、トグル/編集ボタンからのドラッグも行を動かす | クリック(移動なし)は各要素に届く。ドラッグ(移動あり)のみ行移動 | low | reject(HTML5 DnD の標準挙動。クリック操作は阻害されない。グリップ ⋮⋮ は視覚ヒント) |
| 単一カレンダー時に ▲ も ▼ も無効で並べ替え不能 | rank===1 かつ rank===total | — | reject(正しい。1件では並べ替える相手がいない) |

## Spec Change Log

*(なし。bad_spec ループバックなし。)*

## Design Notes

- **一意制約を保った並べ替え**: 単発の相互 UPDATE(1↔2 の交換等)は immediate な部分ユニーク索引の途中でも衝突しうる。RPC は「全対象を大きなオフセットへ退避 → 指定順で 0..n-1 を採番 → 余りを連番の続きへ」の三段で、どの単一 UPDATE 文の中でも2行が同じ値を持たないようにする。部分ユニーク索引は deferrable にできないため、この方式を採る。
- **▲▼ を主・ドラッグを補助にする理由**: モバイル(スマホ縦が基準)で HTML5 DnD のタッチ操作は不安定で、スクロールと競合する。▲▼ はキーボード・スクリーンリーダー・タッチのすべてで確実に動き、44px を満たす。UX の「ドラッグが主」はデスクトップでの主経路として満たしつつ、堅い経路を ▲▼ に置く。スムーズなタッチドラッグは deferred。
- **オフライン reorder は last-wins**: 並べ替えを何度もしても `outbox` には最新の1件だけを残す(`dropOutboxFor('calendar', 'reorder', 'reorder')` → `enqueue`)。フラッシュ時は最終順を1回の RPC で適用。
