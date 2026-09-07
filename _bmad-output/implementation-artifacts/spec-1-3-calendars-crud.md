---
title: 'Story 1.3: カレンダーの作成・管理'
type: 'feature'
created: '2026-09-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '94b69cf299fb7156969ecb3c62e33488f64a434e'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-2-auth-and-guest-mode.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ユーザーが予定を用途ごとに分けて持つには「カレンダー」が要るが、まだ概念も保存先も無い。

**Approach:** `calendars` テーブル(+ RLS)を新設し、ローカルカレンダーの作成・改名・色変更・削除と一覧表示を実装する。「シフト用カレンダー」は初回に自動で1つ用意し削除不可にする。データ層は `src/data/calendars.ts` に集約し `Result` を返す。UI は `/calendars`(タブ外、ホーム見出しと設定から遷移)。

## Boundaries & Constraints

**Always:**
- `calendars` テーブル: `id`(uuid)/ `user_id`(= auth.uid、RLS)/ `name` / `color`(hex)/ `source`('local' | 'google')/ `is_shift`(bool)/ `is_visible`(bool、既定 true)/ `external_connection_id`・`external_calendar_id`(local は null。FK は Epic 3)/ `created_at` / `updated_at` / `deleted_at`。RLS は select/insert/update/delete すべて `user_id = auth.uid()`。`updated_at` は更新トリガ。
- マイグレーションは `supabase/migrations/` に SQL で置く。**優先度(priority)カラムは含めない**(Story 2.1)。
- データ層 `src/data/calendars.ts`: `listCalendars` / `createCalendar` / `renameCalendar` / `recolorCalendar` / `deleteCalendar` / `ensureShiftCalendar`。すべて `Result<…, AppError>` を返す。snake_case↔camelCase 変換はここだけ。UI から supabase-js を直接呼ばない(AD-9)。
- 削除は論理削除(`deleted_at` を立てる)。全読み取りは `deleted_at is null` で絞る。`deleteCalendar` は `is_shift` のカレンダーを拒否する(`AppError` を返す)。
- 「シフト用カレンダー」: `ensureShiftCalendar` が、その user に `is_shift = true` のカレンダーが無ければ1つ作る(名前「シフト」、色はプリセットの緑)。一覧読み込み時に一度呼ぶ。改名・色変更は可、削除は不可。
- 色はプリセットから選ぶ。`src/data/calendar-colors.ts` に色覚に配慮した 8 色(名前 + hex)を定義。`createCalendar` / `recolorCalendar` はプリセット外の色を拒否する。
- UI: `/calendars` 画面 = カレンダー一覧(`CalendarRow`: 色ドット + 名前 + source ラベル + 表示トグル)+「カレンダーを作成」。作成 / 改名 / 色変更はボトムシート1段。削除は確認 + 一定時間 Undo(EXPERIENCE.md 破壊的操作)。
- ホームの見出しに「カレンダー管理」への導線(`Screen` の `action`)。設定のアカウント欄の下にも導線。
- `AuthState` が `unavailable`(Supabase 未設定)のとき: `/calendars` は「Supabase を設定するとカレンダーを管理できます」と表示し、CRUD ボタンは出さない。他画面は通常。
- 文言は EXPERIENCE.md Voice(簡潔・体言止め・感嘆符なし)。トグル / ボタンは 44px 以上、フォーカスリング維持。色だけで意味を運ばない(色ドット + 名前をセット)。

**Never:**
- 優先度・並べ替え UI(Story 2.1)、予定の CRUD(Story 1.4)、外部カレンダー接続(Epic 3)、オフラインキャッシュの作り込み(Story 1.6)。
- `calendars` 以外のテーブルを作らない。
- Supabase 未設定時のローカル専用(IndexedDB)フォールバックは作らない。真実源は Postgres(AD-1)。
- Google / 外部 source のカレンダー行の表示ロジックは、`source` フィールドの表示までにとどめる(接続・取り込みは Epic 3)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 初回に一覧を開く | Supabase 設定済み・カレンダー0件 | `ensureShiftCalendar` が「シフト」を1つ作り、一覧に1行表示 | 作成失敗時は一覧をエラー表示 + 再試行 |
| カレンダーを作成 | 名前 + プリセット色 | 一覧に追加、`source='local'` | 空名 → バリデーション。プリセット外の色 → 拒否 |
| 改名 / 色変更 | 既存カレンダー | 反映され `updated_at` が進む | 空名・不正色は拒否 |
| ローカルカレンダーを削除 | `is_shift=false` | `deleted_at` が立ち一覧から消える、Undo を一定時間提示 | N/A |
| シフト用カレンダーを削除しようとする | `is_shift=true` | 削除ボタンを出さない。データ層も `AppError('calendar/shift-undeletable')` を返す | メッセージ表示 |
| 表示トグル | 既存カレンダー | `is_visible` が切り替わる(表示への反映は Story 1.5) | N/A |
| Supabase 未設定 | env 無し | `/calendars` は無効メッセージ。CRUD 不可。他機能は通常 | N/A |
| 別ユーザーのデータ | RLS | 自分の `user_id` の行だけ返る | N/A(RLS が保証) |

</frozen-after-approval>

## Code Map

- `src/data/supabase.ts` -- `supabase: SupabaseClient | null`。calendars.ts はこれを使う。
- `src/data/result.ts` -- `Result` / `AppError` / `ok` / `err` / `appError`。
- `src/data/auth.ts` -- `isAuthAvailable()`。未設定判定に使う。
- `src/app/auth-context.ts` -- `useAuth()` で `state`。`unavailable` 判定に使う。
- `src/app/routes.tsx` -- `routes` 配列に `/calendars` を追加。
- `src/ui/Screen.tsx` -- `title` + `action`(見出し右)+ `children`。ホームの導線は `action` を使う。
- `src/features/home/ui/HomeScreen.tsx` -- 現在は空。`action` に `/calendars` 導線を足す。
- `src/features/settings/ui/SettingsScreen.tsx` -- アカウント欄の下に導線を足す。
- `src/features/settings/model/useTheme.ts` -- localStorage try/catch と effect パターンの手本。
- `src/features/auth/model/useAuthForm.ts` -- フォーム hook の書き方の手本(Result を受けて errorKey を state に)。
- `supabase/migrations/` -- 空(`.gitkeep` のみ)。最初のマイグレーションをここに置く。
- `supabase/config.toml` -- `supabase init` 生成物。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260907000000_calendars.sql` -- `calendars` テーブル(`user_id default auth.uid()`)+ RLS(4ポリシー)+ `set_updated_at` トリガ関数 + インデックス(`user_id`、active、外部一意、**シフト用1つ制約**)-- スキーマ(AD-1)
- [x] `src/data/calendar-colors.ts` -- 色覚配慮の 8 色プリセット(Okabe-Ito 由来)+ `isPresetColor` / `nextUnusedColor` / `SHIFT_CALENDAR_COLOR` -- DESIGN.md §Colors
- [x] `src/data/calendars.ts` -- 型 + `listCalendars` / `createCalendar` / `renameCalendar` / `recolorCalendar` / `setCalendarVisible` / `deleteCalendar` / `restoreCalendar` / `ensureShiftCalendar`。snake↔camel、すべて `Result` -- AD-9 / AD-1
- [x] `src/data/messages.ts` -- `AppError.messageKey` → 日本語(auth + data/calendar を統合、`resolveMessage`)。AuthScreen もこれに移行 -- UX-DR14
- [x] `src/features/calendars/model/useCalendars.ts` -- 読み込み(`ensureShiftCalendar` → `listCalendars`)、CRUD、楽観トグル、Undo(6秒タイマー + cleanup)-- ロジック分離
- [x] `src/ui/BottomSheet.tsx` -- 汎用ボトムシート(Escape / スクリムで閉じる、フォーカス移動)-- 以降のシートで再利用
- [x] `src/features/calendars/ui/CalendarRow.tsx` -- 色ドット + 名前 + source ラベル + 表示トグル + 行タップで編集 -- UX-DR7(部分)
- [x] `src/features/calendars/ui/CalendarFormSheet.tsx` -- 作成 / 改名 / 色変更のシート(名前 + プリセット色ピッカー、シフト用は削除ボタン非表示)-- UX
- [x] `src/features/calendars/ui/CalendarsScreen.tsx` -- 一覧 + 作成 + 削除→Undo バー + エラー表示 + `unavailable` 表示 -- FR5 / UX-DR13
- [x] `src/app/routes.tsx` -- `/calendars` ルート追加 -- 導線
- [x] `src/features/home/ui/HomeScreen.tsx` -- 見出し `action` に「カレンダー管理 ›」 -- UX-DR12
- [x] `src/features/settings/ui/SettingsScreen.tsx` -- 「カレンダー管理」導線を追加 -- 導線
- [x] `src/data/calendars.test.ts`(14)-- supabase クエリビルダをモックし I/O マトリクス各行 -- 回帰防止
- [x] `src/features/calendars/model/useCalendars.test.ts`(7)-- 読み込み・作成・削除+Undo・エラー反映 -- 回帰防止
- [x] `src/features/calendars/ui/CalendarsScreen.test.tsx`(5)-- 一覧 / シフト行に削除なし / unavailable 表示 -- 回帰防止

**Acceptance Criteria:**
- Given Supabase をモックした環境, when `useCalendars` が初期化される, then `ensureShiftCalendar` → `listCalendars` の順に呼ばれ、シフト行を含む一覧が返る
- Given カレンダー作成フォーム, when 名前とプリセット色で保存, then `createCalendar` が `source='local'` で呼ばれ、一覧に反映される。空名・プリセット外色は保存されない
- Given `is_shift=true` のカレンダー, when 一覧の行を見る, then 削除ボタンが無く、`deleteCalendar` を直接呼んでも `AppError` を返す
- Given ローカルカレンダーを削除, when 確定, then 一覧から消え、一定時間 Undo が出る
- Given `AuthState='unavailable'`, when `/calendars` を開く, then 無効メッセージが出て CRUD ボタンは無い
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- **`user_id default auth.uid()`**: マイグレーションで `user_id` に `default auth.uid()` を付け、`createCalendar` / `ensureShiftCalendar` の insert から `user_id` と `supabase.auth.getUser()` の往復を除去した(レビューで簡素化)。RLS の `with check` が保証する。
- **シフト用カレンダーの一意性**: 部分ユニークインデックス `(user_id) where is_shift and deleted_at is null` で、同時実行の重複作成を DB レベルで防ぐ(レビュー: edge-case)。
- **色プリセット**: Okabe-Ito の色覚バリアフリーパレット由来の 8 色。`createCalendar` / `recolorCalendar` はプリセット外を拒否(DB にも `color ~ '^#[0-9A-Fa-f]{6}$'` チェック)。予定チップは「色 + 名前」をセットで出すので色の識別性への依存は低い。
- **メッセージ統合**: `src/data/messages.ts` に auth と data/calendar の messageKey→日本語を統合(`resolveMessage`)。1.2 の `AuthScreen` もこれに移行(`authMessage` は auth.errors.ts に残置)。
- **Undo**: `useCalendars` が 6 秒タイマーで pendingDelete を確定。unmount / undo / 新規削除でクリア。論理削除なので `restoreCalendar`(`deleted_at = null`)で復元。
- **BottomSheet**: フォーカストラップは未実装(1フィールドのフォームのため許容)。Escape + スクリムで閉じる。以降のシート(quick-shift-sheet 等)で再利用する土台。
- **未検証**: マイグレーション SQL の実適用(Docker 無し)。`calendars.ts` は supabase クエリビルダをモックした 14 tests で検証。全 63 tests / build / typecheck / lint green。SQL は目視レビュー済み。実 DB 適用は Supabase プロジェクト接続後にユーザーが `supabase db push`。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 型エラー0
- `npm run lint` -- expected: エラー0
- `npm run test` -- expected: 新規テストを含め全パス
- `npm run build` -- expected: 成功

**Manual checks:**
- マイグレーション SQL を目視レビュー(RLS 4ポリシー、トリガ、型)。`supabase db push` は Supabase プロジェクト接続後にユーザーが実施。
- Supabase 未設定で `npm run dev`: `/calendars` が無効メッセージ、他画面は正常。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap を本セッションで実施。finding floor N=5)。patch はすべて実装と同じパスで反映。loopback なし。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `createCalendar` / `ensureShiftCalendar` が insert 前に `supabase.auth.getUser()` を往復して `user_id` を明示指定していた | RLS の `with check` があるので不要。往復は無駄 | low | patch: `user_id` に `default auth.uid()` を付け、insert から除去 |
| `ensureShiftCalendar` に競合あり — 2タブ同時実行で maybeSingle が両方 null → 両方 insert → シフト用が2つできる | `(user_id, is_shift)` に一意制約が無かった | medium | patch: 部分ユニークインデックス `(user_id) where is_shift and deleted_at is null` を追加 |
| `dismissError` が毎レンダー新しい関数 → consumer の依存配列で不要な再実行 | 他の返り値は `useCallback` 済みで一貫していない | low | patch: `useCallback` 化 |
| `calendars.ts` の `renameCalendar` / `recolorCalendar` / `setCalendarVisible` がリポジトリ単体テストで未カバー(hook のモック越しのみ) | I/O マトリクスの「改名 / 色変更」の直接検証が薄い | low | patch: `calendars.test.ts` に3ケース追加(update 引数と eq を検証) |
| `handleEditSubmit` で改名成功・色変更失敗の部分成功時、シートが開いたまま(改名は既に反映済み) | 稀。両方成功が通常 | low | reject(実害が薄く、修正がフロー分岐を増やす) |
| `BottomSheet` にフォーカストラップが無く Tab でシート外へ出られる | 1フィールドのフォーム。モーダルの外にフォーカスが出ても致命的でない | low | reject(将来シートが複雑化したら再検討。Implementation Notes に記載) |
| 色ピッカーが `aria-pressed` ボタン群で、テーマ切替の radio セマンティクスと不一致 | どちらも操作可能・ラベルあり。SR で「押されている」と読まれる | low | reject(誤操作なし。統一は別途) |
| マイグレーション SQL が未適用・未テスト(Docker 無し) | 目視レビュー済み。RLS 4ポリシー / トリガ / チェック制約 / 一意インデックスを確認 | — | defer(実 DB 適用は接続後にユーザー。deferred-work には計上済みの CI 課題の一部) |
