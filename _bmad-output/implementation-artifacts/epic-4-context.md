# Epic 4 Context: シフトを楽に入れて、今月の給料見込みを見る

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

よく使うシフトを「お気に入りシフト」テンプレとして登録し、月/週で日付をタップ →テンプレを選ぶだけ(連続日は一括)でシフトを入れられる。実働時間を計算し、当月の給料見込みをホームで追加操作なしに確認できる。Epic 1 の予定・カレンダー基盤の上に載る独立機能(Epic 2 / 3 とは独立)。FR11〜FR15。

## Stories

- Story 4.1: お気に入りシフトの登録(`shift_templates` テーブル + CRUD + エクスポート追加)
- Story 4.2: ワンタップ・シフト入力(`quick-shift-sheet`、連続日一括)
- Story 4.3: 実働時間の計算(`packages/core` pay-calc 純関数)
- Story 4.4: 当月の給料見込みとトップ画面表示(`pay-card`)

## Requirements & Constraints

- **AD-8(最重要):** シフトは専用テーブルを立てず「シフト用カレンダー」に属する `events` + シフト属性(`break_minutes` / `hourly_wage` / `workplace_label` / `shift_template_id`。`events` に nullable カラムとして既存)。汎用の予定編集(FR-1)はシフト属性を変更しない(部分更新)。シフト属性の編集は `features/shifts` の経路のみ。**給料見込みは対象月の予定から都度計算し、集計値を保存しない。**
- **AD-7:** 時刻は `timestamptz`(UTC)保存・表示時 TZ 変換。実働時間・給料の計算は UTC 上の差分。日をまたぐシフトは終了を翌日として通算し分割しない。
- **AD-6/AD-10 と同様:** pay-calc は `packages/core` の純関数。副作用・I/O なし、`now` 等は引数。`packages/core` は何も import しない葉。単体テスト必須。
- data-access は `Result<T, AppError>` を返す。書き込みは `src/data` リポジトリ関数のみ。楽観更新 → 失敗ロールバック。オフラインは outbox キュー(Story 1.6)。snake↔camel は data 層に閉じる。
- 「シフト用カレンダー」はユーザーに1つ(`calendars.is_shift`、部分ユニーク索引済み、削除不可・改名/色変更可、Story 1.3 で既定作成)。
- Story 4.1 のテンプレは Story 1.7 の JSON エクスポートに追加する(1.7 は 4.1 なしでも完結済み)。
- テンプレ入力のバリデーション: 時給・休憩分に負値不可、休憩 ≥ 実働 不可。
- quick-shift 利用時の合計操作は **3タップ以内**(NFR8)。
- v1 では割増・締め日・勤務先別・年別の設定を出さない(NFR11)。給料見込みは「実働時間 × 時給」の暦月合計、シフトごとの時給差は合算。

## Technical Decisions

- **`shift_templates` テーブル(新規、Story 4.1):** `id` / `user_id default auth.uid()` / `name` / `start_local`(HH:MM 文字列 or time)/ `end_local` / `break_minutes` / `hourly_wage` / `workplace_label` / `color` / `created_at` / `updated_at` / `deleted_at`。RLS 4ポリシー。テンプレは「時刻の形(壁時計)」を持ち、適用時に対象日付 + ユーザー TZ で `timestamptz` を組み立てる。
- **Story 4.2:** `quick-shift-sheet` は `features/shifts`。テンプレ + 対象日付 → `events` 行(`calendar_id` = シフト用カレンダー、`source='local'`、シフト属性セット、`title` = テンプレ名 or 勤務先ラベル)。連続日は複数 insert。既存の予定作成経路(`createEvent`)を拡張 or `features/shifts` 専用の data 関数。
- **Story 4.3:** `packages/core/src/pay.ts`(仮)。`workedMinutes({ startsAt, endsAt, breakMinutes })` → 終了 < 開始なら終了を +24h 通算、`(end - start) - break`。`monthlyPayEstimate(shifts, { year, month, tz })` 等も core に置くか要検討(TZ を跨ぐ暦月判定をどこで持つか)。
- **Story 4.4:** `pay-card` は `features/pay`。当月のシフト(シフト用カレンダー所属の events)を集計。月切り替え。シフト CRUD で即再計算(集計は保存しない)。ホームで compact-card の下。
- シフト用の event か否かは「所属カレンダーが `is_shift`」または「`shift_template_id` / `hourly_wage` が非 null」で判定(要確定 — カレンダー基準が素直)。

## UX & Interaction Patterns

- **shift-template-chip:** ピル形。「シフト名 + 時間帯」を表示(UX-DR8)。quick-shift-sheet でタップ → その日にシフト作成しシート閉じる。管理画面でタップ → テンプレ編集。
- **quick-shift-sheet:** 月/週で日付タップ時に下から。登録済みテンプレを横スクロール(UX-DR10)。テンプレなしなら「よく使うシフトを登録すると1タップで入れられます」+ 作成ボタン(UX-DR13)。「予定を追加」タブへ切替可。
- **pay-card:** ホーム。当月の給料見込みを `amount` 書式(¥62,700 等)。前月/翌月の矢印。タップ → 詳細(月のシフト内訳)。¥0 のとき「今月のシフトはまだありません」(UX-DR13)。達成演出・ストリークなし(NFR12)。
- お気に入りシフト管理は設定から、または quick-shift-sheet の「編集」から。
- アクセシビリティ: role + 状態ラベル、44px、フォーカスリング維持、Reduce Motion、感嘆符なし。

## Cross-Story Dependencies

- Story 4.1(`shift_templates` + CRUD)が 4.2 の前提。
- Story 4.3(pay-calc 純関数)が 4.4 の前提。
- Story 4.2 と 4.3 は互いに独立(4.2 はシフト作成、4.3 は計算のみ)。
- Story 4.4 は 4.2(シフトが `events` に入る)+ 4.3(実働時間計算)の両方に載る。
- Story 1.3 の「シフト用カレンダー」既定作成、Story 1.4 の `events` シフト属性カラム、Story 1.6 の outbox、Story 1.7 のエクスポートに依存。
- Epic 2 / Epic 3 とは独立。
