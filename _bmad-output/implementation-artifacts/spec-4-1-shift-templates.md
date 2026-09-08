---
title: 'Story 4.1: お気に入りシフトの登録'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '58753be74b9e3954021cdf3ff00b79968280a97a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-3-calendars-crud.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-7-json-export.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** シフト勤務者が毎回同じ時間帯を手入力している。よく使うシフトをテンプレとして持てる仕組みが無い(FR-11)。

**Approach:** `shift_templates` テーブル + data-access + 管理 UI を追加する。テンプレは「壁時計の時間帯 + 休憩分 + 時給 + 勤務先ラベル + 色」を持つ(Story 1.3 のカレンダー CRUD と同じ形)。設定から管理画面へ。JSON エクスポート(Story 1.7)にテンプレを含める。

## Boundaries & Constraints

**Always:**
- マイグレーション `supabase/migrations/20260909000000_shift_templates.sql`: `shift_templates` テーブル ── `id uuid pk`、`user_id uuid not null default auth.uid() references auth.users on delete cascade`、`name text`(trim 後 1〜100)、`start_local text check (~ '^\d{2}:\d{2}$')`、`end_local text` 同、`break_minutes int not null default 0 check (>= 0)`、`hourly_wage int not null check (>= 0)`、`workplace_label text check (null or char_length <= 100)`、`color text not null`、`created_at/updated_at timestamptz default now()`、`deleted_at timestamptz`。RLS 4ポリシー(select/insert/update/delete = `user_id = auth.uid()`)、`set_updated_at` トリガ、`user_id` インデックス。**実適用はユーザーが `supabase db push`。**
- `src/data/shift-templates.ts`(新規、AD-9/AD-10 準拠): `ShiftTemplate` 型(camelCase)、`listShiftTemplates` / `createShiftTemplate` / `updateShiftTemplate(id, patch)` / `deleteShiftTemplate`(論理削除) / `restoreShiftTemplate`。すべて `Result<T, AppError>`。snake↔camel はこのファイルだけ。`!supabase` は `data/unavailable`。
- バリデーション(data 層、messageKey つき `AppError`): name 1〜100(`shift-template/invalid-name`)、`start_local`/`end_local` は `HH:MM` かつ start≠end(`shift-template/invalid-time`)、`break_minutes >= 0` かつ `break_minutes < 実働分`(`shift-template/invalid-break`)、`hourly_wage >= 0`(`shift-template/invalid-wage`)、`color` はプリセット(`shift-template/invalid-color`)。実働分 = `(endMin - startMin + 1440) % 1440`(日またぎを通算)。
- `src/features/shifts/model/useShiftTemplates.ts`: `useCalendars` と同型 ── list + create/update/delete/undo、楽観更新 + `templatesRef` ロールバック、6秒 Undo。
- `src/features/shifts/ui/ShiftTemplateChip.tsx`: ピル形。「{name}・{start}–{end}」を表示(UX-DR8)。`onTap(template)`。色ドット併記(色だけに意味を持たせない)。44px 以上。
- `src/features/shifts/ui/ShiftTemplateFormSheet.tsx`: `BottomSheet`(既存)を使い name / 開始 / 終了 / 休憩分 / 時給 / 勤務先ラベル(任意)/ 色。`noValidate` + 自前検証、エラーは `messageKey` 経由の日本語。
- `src/features/shifts/ui/ShiftTemplatesScreen.tsx`: 見出し「お気に入りシフト」、テンプレをチップで縦に、各チップから編集、削除は確認 + Undo、「＋ お気に入りシフトを作る」。0件時の静かな案内。
- ルート `/shift-templates` を `routes.tsx` に追加(下タブ外)。設定画面に「お気に入りシフト ›」リンク。
- `src/data/export.ts`: `ExportBundle` に `shiftTemplates: ShiftTemplate[]`、`schemaVersion` を `1` → `2` に。`buildExportBundle` が `listShiftTemplates()` も呼び、`deleted_at` は当然除外、安定ソート(createdAt)。
- `src/data/messages.ts`: 上記5つの `shift-template/*` を追加。
- 追加・変更した data 層・hook・UI に単体テスト(規約: テスト)。

**Never:**
- `events` へのシフト作成・`quick-shift-sheet`(Story 4.2)。実働時間の計算関数 `packages/core`(Story 4.3)。給料見込み(Story 4.4)。
- `shift_templates` のオフライン対応(IndexedDB キャッシュ / outbox キュー)── Story 1.3 と同じくオンライン先行。deferred(下記)。
- `events` テーブル・カレンダー・優先度まわりの変更。専用のシフトテーブルを `events` と別に「シフト実体」用に作ること(テンプレ表は可。実体は AD-8 で `events`)。
- 割増・締め日・勤務先別・年別などの設定項目(NFR11)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| 通常登録 | name「平日」/ 17:00–22:00 / 休憩30 / 時給1100 | `shift_templates` に1行。一覧にチップ「平日・17:00–22:00」 |
| 時給が負 | hourlyWage = -1 | `shift-template/invalid-wage` で弾く |
| 休憩が負 | breakMinutes = -5 | `shift-template/invalid-break` |
| 休憩 ≥ 実働 | 17:00–22:00(実働300分)で休憩 300 or 360 | `shift-template/invalid-break` |
| 日またぎ | 22:00–06:00 / 休憩60 | 実働 = 480分。休憩 60 < 480 なので通る |
| 開始 = 終了 | 09:00–09:00 | `shift-template/invalid-time` |
| 時刻の形が不正 | start_local = "9:00" / "0900" | `shift-template/invalid-time` |
| 名前空 / 101文字 | name = "" | `shift-template/invalid-name` |
| 色がプリセット外 | color = "#123456" | `shift-template/invalid-color` |
| 削除 → Undo | 削除後6秒以内に取り消す | `deleted_at` が立ち、Undo で復元 |
| エクスポート | テンプレ2件 + カレンダー + 予定 | バンドルに `shiftTemplates`(2件)、`schemaVersion: 2` |
| Supabase 未設定 | `!supabase` | `data/unavailable` |

</frozen-after-approval>

## Open Questions

*(なし ── [ASSUMPTION]: (1) 時刻は `text "HH:MM"` で保持(`time` 型より TS の往復が単純、既存の時刻文字列運用に合わせる)。(2) 実働分の算出は 4.1 用の小ヘルパをこのファイルに inline(4.3 の core `workedMinutes` は ISO タイムスタンプの予定が対象で別ドメイン)。(3) エクスポートは `schemaVersion: 2` に上げる(まだ import 実装は無く、形の変化を正直に表す)。Design Notes 参照。)*

## Code Map

- `supabase/migrations/20260907000000_calendars.sql` -- テーブル + RLS + `set_updated_at` トリガ + 部分ユニーク索引の手本。
- `supabase/migrations/20260908000000_calendar_priority.sql` -- 直近のマイグレーション。次番号は `20260909000000`。
- `src/data/calendars.ts` -- data 層の完全な手本(`toX` / `validateX` / `fromPostgrest` / list=cacheReplace / patch ヘルパ / 論理削除 + restore)。**オフライン分岐は 4.1 では入れない。**
- `src/data/calendar-colors.ts` -- `CALENDAR_COLORS` / `isPresetColor` / `nextUnusedColor`。テンプレの色もこれを使う。
- `src/data/result.ts` -- `Result` / `appError` / `ok` / `err`。
- `src/data/messages.ts` -- `messageKey` → 日本語。`shift-template/*` を追加。
- `src/data/export.ts` -- `ExportBundle` / `buildExportBundle`。`listShiftTemplates` を足し `shiftTemplates` フィールド + `schemaVersion: 2`。
- `src/features/calendars/model/useCalendars.ts` -- hook の手本(`calendarsRef` ロールバック、6秒 Undo、`pendingDelete`)。
- `src/features/calendars/ui/CalendarsScreen.tsx` / `CalendarRow.tsx` / `CalendarFormSheet.tsx` -- 画面 / 行 / フォームシートの手本。
- `src/ui/BottomSheet.tsx` -- フォームシートの土台。
- `src/app/routes.tsx` -- `/calendars` の登録の仕方。`/shift-templates` を同様に。
- `src/features/settings/ui/SettingsScreen.tsx` -- 「カレンダー管理 ›」リンクの隣に「お気に入りシフト ›」。
- `_bmad-output/implementation-artifacts/spec-1-7-json-export.md` -- エクスポートの設計意図(source==='local' のみ・自己完結)。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260909000000_shift_templates.sql` -- `shift_templates` テーブル + RLS4 + `set_updated_at` トリガ + `user_id` 索引
- [x] `src/data/shift-templates.ts` -- `ShiftTemplate` 型 / list / create / update(patch) / delete(論理) / restore、バリデーション、実働分ヘルパ
- [x] `src/data/shift-templates.test.ts` -- I/O マトリクスの各バリデーション、list/create/update/delete の Result、`data/unavailable`
- [x] `src/data/messages.ts` -- `shift-template/invalid-{name,time,break,wage,color}` を追加
- [x] `src/data/export.ts` + `src/data/export.test.ts` -- `shiftTemplates` フィールド + `schemaVersion: 2`。既存テストの schemaVersion 期待値を更新
- [x] `src/features/shifts/model/useShiftTemplates.ts` + `.test.ts` -- 楽観 CRUD + ロールバック + 6秒 Undo
- [x] `src/features/shifts/ui/ShiftTemplateChip.tsx` + `.test.tsx` -- ピル「name・start–end」+ 色ドット + onTap
- [x] `src/features/shifts/ui/ShiftTemplateFormSheet.tsx` + `.test.tsx` -- 入力 + 自前検証 + エラー文言
- [x] `src/features/shifts/ui/ShiftTemplatesScreen.tsx` + `.test.tsx` -- 一覧 / 作成 / 編集 / 削除+Undo / 0件案内
- [x] `src/app/routes.tsx` -- `/shift-templates` ルート
- [x] `src/features/settings/ui/SettingsScreen.tsx` + `.test.tsx` -- 「お気に入りシフト ›」リンク

**Acceptance Criteria:**
- Given 設定 → お気に入りシフト管理, when テンプレ(名前/開始/終了/休憩分/時給/勤務先ラベル/色)を登録・編集・削除する, then `shift_templates`(+RLS)に反映され、複数持てる。チップは「name + 時間帯」を表示する
- Given テンプレ入力, when 時給や休憩分に負値、または休憩 ≥ 実働 を入れる, then バリデーションで弾かれる
- Given テンプレを登録済み, when JSON エクスポートする, then エクスポートに `shiftTemplates` が含まれる
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- マイグレーション `20260909000000_shift_templates.sql`: `start_local`/`end_local` は `text` + `check (~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`。RLS4 + `set_updated_at` トリガ + `user_id` 索引 + `active_idx`(`where deleted_at is null`)。
- `src/data/shift-templates.ts`(オンライン先行): `ShiftTemplate` 型、list/create/update(patch)/delete(論理)/restore、`validateShiftTemplateInput` / `validateShiftTemplatePatch`(patch は current にマージしてから検証 → 部分編集でのクロスフィールド違反も拾う)、`templateWorkedMinutes(start, end)` = `(endMin - startMin + 1440) % 1440`(0 は null)。バリデーションキー6つ(name/time/break/wage/workplace/color)。
- `useShiftTemplates`(`useCalendars` 同型): 楽観 CRUD + ロールバック、6秒 Undo。削除タイマは差し替え前に `clearTimeout`(レビュー修正)。
- `ShiftTemplateChip`(ピル: 色ドット + name + start–end)、`ShiftTemplateFormSheet`(`BottomSheet` + `noValidate` + `<input type="time">` + 数値入力 + 色スウォッチ + シート内エラー表示)、`ShiftTemplatesScreen`(一覧 / 作成 / 編集 / 削除+Undo / 0件案内、設定から `/shift-templates`)。
- `export.ts`: `shiftTemplates` フィールド + **`schemaVersion: 2`**。`buildExportBundle` が `listShiftTemplates()` も呼び、err を伝播。`export.test` / `DataSection.test` の期待値を更新。
- `messages.ts`: `shift-template/invalid-{name,time,break,wage,workplace,color}`。
- **オフライン非対応**(deferred): `listShiftTemplates` の catch はネットワークエラー時に `data/offline` を返すだけ(キャッシュ無し)。
- テスト +39(shift-templates 18 / useShiftTemplates 6 / Chip 2 / FormSheet 3 / Screen 6 / export +2 / SettingsScreen +1 / routes +1)。全体 **289 tests**。

## Spec Change Log

*(なし。bad_spec / intent_gap ループバックなし。)*

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=8。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `useShiftTemplates` の削除 Undo タイマが、Undo 前の次の削除で差し替わる際に前のタイマを止めない → 孤児タイマが2件目の Undo バーを早期に消す | `pendingRef.current = { template, timer }` の前に `clearTimeout` が無い。`useCalendars`/`useEvents` にも同じパターン(既存) | low〜medium | patch: `useShiftTemplates.remove` に `if (pendingRef.current) clearTimeout(...)` を追加。既存2フックは deferred-work.md へ |
| オフライン時 `listShiftTemplates` が `data/query`(「読み込みに失敗しました。もう一度お試しください」)を返し、リトライを促すが無意味 | オフライン対応(キャッシュ)は仕様上 deferred。文言だけでも改善できる | low | patch: catch で `isNetworkError(e)` なら `data/offline`(「オフラインです」)を返す。キャッシュ本体は deferred-work.md |
| `/shift-templates` ルートが実際に画面を出すことの結合テストが無い | ルート登録は1行だが配線ミスを拾えない。`/calendar?date=` で同じ判断をして routes.test を新設済み | low | patch: `routes.test.tsx` に `/shift-templates` → 見出し「お気に入りシフト」のケースを追加 |
| フォームで時給を空のまま保存すると `Number('') = 0` で「時給0円」のテンプレが静かに作られる | 0 は仕様上「負値でない」ので弾かれない。ミスの可能性は高いが 0円シフトも概念的にありうる | low | reject(AC は「負値を弾く」まで。必須化は UX 改善として別途) |
| 24時間シフト(00:00→00:00 等 start==end)は `invalid-time` で弾かれる | `templateWorkedMinutes` が span 0 を null に。24h シフトは曖昧で稀 | low | reject(意図的。start≠end を要求) |
| `useShiftTemplates` が `syncNonce` を購読しない(オンライン復帰で再取得しない) | テンプレは outbox を持たない(オンライン先行)ので購読不要。オフライン→復帰後の失敗リトライだけ手動 | low | reject(現設計では正しい。オフライン対応 story で見直し) |
| 移行ファイル名が `20260909`(翌日付) | プロジェクトの既存慣習(バッチごとに +1 日: 0907 → 0908 → 0909)。順序は正しい | — | reject(慣習どおり) |

## Design Notes

- **オフラインは 4.1 では入れない**: Story 1.3(カレンダー CRUD)もオンライン先行で、後の Story 1.6 が outbox / キャッシュを足した。テンプレは「一度作って使い回す」低頻度データなので優先度は低い。`shift_templates` の IndexedDB キャッシュ(4.2 のオフライン quick-shift 用)+ outbox は deferred-work.md へ。
- **時刻は `text "HH:MM"`**: テンプレは日付を持たない壁時計の時間帯。`time` 型でも良いが PostgREST の `HH:MM:SS` 往復や TS 側のパースを避け、既存のアプリ(`datetime.ts` は文字列時刻を扱う)に合わせて `text` + `check` 制約にする。
- **実働分ヘルパは 4.1 ローカル**: `templateWorkedMinutes(start, end)` = `(endMin - startMin + 1440) % 1440`。Story 4.3 の core `workedMinutes` は「ISO タイムスタンプを持つシフト予定」が対象で、入力の型もドメインも別。重複は小さく、統合は 4.3/4.4 で必要になったら判断。
- **`schemaVersion: 2`**: Story 1.7 は `1`。`shiftTemplates` 追加で形が変わるので上げる。import 機能はまだ無く、既存の書き出し済みファイルとの互換性問題は起きない。
- **色は `CALENDAR_COLORS` を共用**: テンプレ専用パレットを作らず、`isPresetColor` で検証、`nextUnusedColor` で初期色。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス
- `npm run build` -- 成功

**Manual checks:**
- `npm run dev`(Supabase 接続 + `supabase db push` 済み): 設定 → お気に入りシフト → テンプレを2件作る、負の時給・休憩過大が弾かれる、編集・削除・Undo、設定のエクスポートでダウンロードした JSON に `shiftTemplates` と `schemaVersion: 2` があること。
