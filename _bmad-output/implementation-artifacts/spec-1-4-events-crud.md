---
title: 'Story 1.4: ローカル予定の作成・編集・削除'
type: 'feature'
created: '2026-09-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '77e9bb0fb5f0a92a9a3cf81a77d67979f2896c6f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-calendars-crud.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** カレンダーはできたが、そこに置く「予定」がまだ無い。ユーザーが自分のスケジュールを記録できない。

**Approach:** `events` テーブル(シフト属性の nullable カラム群を含む。AD-8)を新設し、ローカル予定の作成・編集・削除フォームと、当面の確認用リストを実装する。データ層は `src/data/events.ts` に集約し `Result` を返す。時刻は UTC 保存・表示時変換(AD-7)。削除は論理削除 + Undo。

## Boundaries & Constraints

**Always:**
- `events` テーブル: `id`(uuid)/ `user_id`(default auth.uid、RLS)/ `calendar_id`(FK → calendars、cascade)/ `title`(text)/ `starts_at`(timestamptz、null 可)/ `ends_at`(timestamptz、null 可)/ `all_day`(bool)/ `event_date`(date、null 可。all_day 用)/ `note`(text、null 可)/ `source`('local' | 'google')/ シフト属性 `break_minutes` `hourly_wage` `workplace_label` `shift_template_id`(すべて null 可。Epic 4 で使う)/ `created_at` / `updated_at` / `deleted_at`。
- 制約: `all_day = false` なら `starts_at` と `ends_at` が必須で `starts_at <= ends_at`。`all_day = true` なら `event_date` 必須・時刻は null。CHECK 制約 + アプリ側バリデーションの両方。
- RLS: select/insert/update/delete すべて。所有は calendars 経由ではなく `user_id` 直持ちで判定(join を避ける)。`updated_at` トリガは Story 1.3 の `set_updated_at` を再利用。
- データ層 `src/data/events.ts`: `listEvents(range)` / `getEvent(id)` / `createEvent(input)` / `updateEvent(id, patch)` / `deleteEvent(id)` / `restoreEvent(id)`。すべて `Result`。snake↔camel はここだけ。UI から supabase-js を直接呼ばない(AD-9)。
- 時刻は `starts_at` / `ends_at` を UTC の ISO 文字列で扱う。表示・入力の TZ 変換は表示層。`event_date` は `YYYY-MM-DD`。実働時間や月集計の計算は後続ストーリーで、この差分の上に載る(AD-7)。
- 取り込み予定(`source='external'`)は更新・削除できない。`updateEvent` / `deleteEvent` は `source !== 'local'` を弾く(このストーリーでは local しか作れないので防御的コード + 一応のテスト)。
- 予定フォーム(`EventFormSheet`): タイトル / 終日トグル / 開始・終了(終日オフ時)/ 日付(終日オン時)/ メモ / 所属カレンダー(選択)。`start > end` はバリデーションで弾き、EXPERIENCE.md Voice の日本語メッセージ。
- 削除は確認 + 一定時間 Undo。論理削除。`useCalendars` の Undo 実装パターンを踏襲。
- 楽観更新: 作成・更新・削除はローカル state を先に更新し、失敗したらロールバック + errorKey。
- `AuthState='unavailable'` のとき: 予定の作成・編集はできない旨を表示。他画面は通常。
- 当面の UI 導線: ホームに「予定を追加」、カレンダー画面に「今後の予定」の素朴な時系列リスト(月/週ビューは Story 1.5)。
- 文言・44px・フォーカスリング・色非依存は既存規約どおり。

**Never:**
- 月 / 週 / リストの本格ビュー(Story 1.5)、優先度順の並び(Epic 2)、繰り返し予定、通知。
- **オフライン書き込みキューの永続化(IndexedDB)は Story 1.6 に委ねる。** このストーリーではオンライン前提の楽観更新まで。オフライン時は「オフラインのため保存できません」を表示する(キューには積まない)。
- シフト属性の入力 UI(Epic 4)。カラムは作るが値は常に null。
- 予定の共有・参加者(v1 Non-Goal)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 時刻付き予定を作成 | タイトル + 開始 + 終了(開始 ≤ 終了)+ カレンダー | 作成され、リストに時系列で表示 | 開始 > 終了 → 「終了は開始より後にしてください」。空タイトル → バリデーション |
| 終日予定を作成 | タイトル + 終日オン + 日付 + カレンダー | `all_day=true`・`event_date` セット・時刻 null | 日付未選択 → バリデーション |
| 予定を編集 | 既存のローカル予定 | 変更が反映され `updated_at` が進む | 上と同じバリデーション |
| 予定を削除 | ローカル予定 | リストから消え、一定時間 Undo | N/A |
| 取り込み予定を更新/削除しようとする | `source='external'` | データ層が `AppError('event/not-editable')` を返す。UI に編集導線を出さない | メッセージ |
| 楽観更新の失敗 | 作成中にサーバーエラー | ローカル state をロールバックし errorKey 表示 | `AppError` |
| オフラインで保存 | `navigator.onLine === false` | 「オフラインのため保存できません」。キューには積まない(1.6 で対応) | N/A |
| Supabase 未設定 | env 無し | 予定の作成・編集 UI は無効表示。他は通常 | N/A |

</frozen-after-approval>

## Open Questions

*(なし。オフラインキューの Story 1.6 送りは上の Never に明記した scope 決定。)*

## Code Map

- `supabase/migrations/20260907000000_calendars.sql` -- `set_updated_at()` 関数と RLS ポリシーの書き方の手本。次の連番でマイグレーションを追加。
- `src/data/calendars.ts` -- リポジトリの型・変換・`Result`・`UNAVAILABLE`・`fromPostgrest` の書き方の手本。`Calendar` 型を import(所属カレンダー選択用)。
- `src/data/messages.ts` -- `DATA_MESSAGES` に `event/*` の messageKey を追加。`resolveMessage` を使う。
- `src/data/result.ts` -- `Result` / `AppError` / `appError`。
- `src/features/calendars/model/useCalendars.ts` -- Undo タイマー + cleanup、楽観更新 + ロールバックのパターンの手本。
- `src/features/calendars/ui/CalendarFormSheet.tsx` -- `BottomSheet` を使ったフォームシートの手本。
- `src/ui/BottomSheet.tsx` -- 汎用シート。
- `src/features/home/ui/HomeScreen.tsx` -- `Screen` の `action`。「予定を追加」を足す。
- `src/features/calendar/ui/CalendarScreen.tsx` -- いまはプレースホルダ。素朴な「今後の予定」リストに差し替え。
- `src/app/auth-context.ts` -- `useAuth().state` で `unavailable` / 有効判定。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260907010000_events.sql` -- `events`(`user_id default auth.uid`、`calendar_id` FK cascade、CHECK で時刻/終日の整合、シフト属性 nullable カラム)+ RLS(4)+ `set_updated_at` トリガ + インデックス4本 -- スキーマ(AD-8, AD-7)
- [x] `src/data/events.ts` -- 型 + `listEvents(range)` / `createEvent` / `updateEvent` / `deleteEvent` / `restoreEvent` + `validateEventInput` / `validateEventPatch`。snake↔camel、すべて `Result`、external 拒否 -- AD-9 / AD-7
- [x] `src/lib/datetime.ts` -- ローカル入力 ↔ UTC ISO 変換、表示用フォーマッタ -- AD-7
- [x] `src/data/messages.ts` -- `event/invalid-title` / `event/invalid-time` / `event/invalid-date` / `event/not-editable` / `event/offline` を追加 -- UX-DR14
- [x] `src/features/events/model/useEvents.ts` -- 読み込み、作成 / 更新(楽観 + ロールバック)/ 削除 + Undo、`errorKey`、オフライン判定 -- ロジック分離
- [x] `src/features/events/ui/EventFormSheet.tsx` -- `BottomSheet` フォーム(`noValidate` + `validateEventInput`)。編集 / 新規両対応 -- FR1 / UX-DR14
- [x] `src/features/events/ui/EventListItem.tsx` -- 時刻 or「終日」+ タイトル + カレンダー色バー + 名前。タップで編集 -- UX-DR6(部分)
- [x] `src/features/calendar/ui/CalendarScreen.tsx` -- 「今後の予定」リスト + 空状態 + Undo バー + `unavailable` 表示に差し替え -- FR2 の足がかり
- [x] `src/features/home/ui/HomeScreen.tsx` -- 見出しに「予定を追加」(/calendar へ)+「カレンダー管理」導線 -- 導線
- [x] `src/data/events.test.ts`(11)-- クエリビルダをモックし I/O マトリクス各行 -- 回帰防止
- [x] `src/features/events/model/useEvents.test.ts`(6)-- 読み込み・作成・削除+Undo・楽観ロールバック・オフライン -- 回帰防止
- [x] `src/features/events/ui/EventFormSheet.test.tsx`(4)-- バリデーション3種 + 正常送信(UTC ISO 変換)-- 回帰防止

**Acceptance Criteria:**
- Given Supabase をモックした環境, when 時刻付き予定を作成, then `createEvent` が UTC の `starts_at`/`ends_at` で呼ばれ、リストに時系列で入る
- Given 終日トグル ON, when 保存, then `all_day=true`・`event_date` セット・時刻 null で保存される
- Given 開始 > 終了, when 保存, then 保存されず `event/invalid-time` の日本語文言が出る
- Given `source='external'` の予定, when `updateEvent`/`deleteEvent` を呼ぶ, then `AppError('event/not-editable')` を返す
- Given `navigator.onLine=false`, when 予定を作成, then 保存されず「オフラインのため保存できません」が出る(キューに積まない)
- Given 予定を削除, when 確定, then リストから消え Undo が出る。Undo で戻る
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- **時刻**: 保存は `starts_at` / `ends_at` を `timestamptz`(UTC ISO)。フォームは `<input type="datetime-local">`(ローカル)で、`src/lib/datetime.ts` の `localInputToUtcIso` / `utcIsoToLocalInput` で変換(AD-7)。終日は `event_date`(`date`)+ 時刻 null。CHECK 制約で整合を DB でも保証。
- **バリデーション**: フォームは `noValidate`(ブラウザ標準の検証バブルを止める)+ `validateEventInput` で全項目を日本語メッセージ化。リポジトリ側も `validateEventInput` / `validateEventPatch` で二重に弾く。
- **外部予定**: `updateEvent` / `deleteEvent` は `source !== 'local'` を `event/not-editable` で弾く。UI も外部予定には編集導線を出さない。このストーリーでは local しか作れないが Epic 3 に備えた防御コード + テスト。
- **オフライン**: `navigator.onLine === false` のとき保存系は `event/offline` を表示するだけ(キューに積まない)。**永続キュー(IndexedDB)は Story 1.6 に委譲**(deferred-work.md に記録)。
- **当面の UI**: カレンダー画面は「今後の予定」の素朴なリスト(月/週ビューは 1.5)。フィルタは `starts_at >= now OR event_date >= today` なので「進行中の予定」は出ない — これは Epic 2 の代表予定選抜が担当する範囲。ホームの「予定を追加」は /calendar へ遷移(1.5 で日付タップの直接追加になる)。
- **楽観更新**: 更新・削除はローカル state 先行、失敗でロールバック(削除のロールバック用スナップショットは `eventsRef` で保持)。
- **`getEvent` は未実装**: 1.5 で必要になったら追加(YAGNI)。
- **未検証**: マイグレーション SQL の実適用(Docker 無し)。目視レビュー済み(CHECK / RLS 4 / トリガ / インデックス)。events.ts は 11 tests。全 83 tests / build / typecheck / lint green。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 型エラー0
- `npm run lint` -- expected: エラー0
- `npm run test` -- expected: 新規テストを含め全パス
- `npm run build` -- expected: 成功

**Manual checks:**
- マイグレーション SQL を目視レビュー(CHECK 制約、RLS、インデックス)。実適用は Supabase 接続後。
- Supabase 未設定で `npm run dev`: 予定作成 UI が無効表示、他画面は正常。

## Review Triage Log

*step-04 レビュー(3レンズを本セッションで実施。finding floor N=5)。patch は実装と同じパスで反映。loopback なし。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| フォームの `<input required>` があると jsdom / ブラウザの標準検証が先に効き、`validateEventInput` の日本語メッセージが出ない | テストで submit が発火せず role="alert" が出なかった | medium | patch: `<form noValidate>` にし、検証を `validateEventInput` に一本化 |
| `getEvent` を export したが利用箇所ゼロ(1.5 用の先取り) | dead code | low | patch: 削除。1.5 で必要になったら追加 |
| `useEvents.remove` のロールバック用スナップショットを `useCallback` のクロージャ(`events` 依存)で取っていた → `remove` が毎レンダー再生成 | 一度は関数型 setState 内で取る案にしたが React のバッチで snapshot が空になる回帰が出た | low | patch: `eventsRef`(毎レンダー更新の ref)からスナップショットを取り、`remove` の依存から `events` を外す |
| 「今後の予定」リストが `starts_at >= now` フィルタなので進行中の予定を出さない | 意図的。進行中〜直近の選抜は Epic 2(代表予定)の担当 | — | 対象外(intent が Epic 2 に切り出し済み)。Implementation Notes に明記 |
| `updateEvent` に空 patch `{}` を渡すと `.update({})` になる | `useEvents` は常に full patch を渡すので実際には到達しない | low | reject(到達不能。ガード追加は複雑さに見合わない) |
| `EventFormSheet` の `calendars.length === 0` で保存ボタンを無効化するがメッセージ無し | `ensureShiftCalendar` が常に1つ作るので calendars は空にならない | low | reject(実質到達不能) |
| マイグレーション SQL 未適用・未テスト(Docker 無し) | 目視レビュー: CHECK(時刻/終日整合)、RLS 4、トリガ、インデックス4 を確認 | — | defer(実適用は接続後にユーザー。CI 課題として計上済み) |
