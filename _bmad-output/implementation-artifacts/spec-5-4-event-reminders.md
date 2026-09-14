---
title: '予定ごとのリマインダー通知'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'b49cffc5265a5fc5a2613a49b11579e31d8788d3'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 5 最後の機能。予定ごとに個別のリマインダー通知を設定する手段がまだ無い(FR-20)。

**Approach:** `events` に `reminder_minutes`(nullable)を追加。`@capacitor/local-notifications` で端末ローカルにスケジュールする(push配信サーバーは持たない)。通知IDは `events.id` から `packages/core` の単一の導出関数で計算した符号あり32bit整数。予定の時刻編集・削除・Google/端末カレンダー同期での時刻書き換え、いずれでも同じ導出IDで `cancel()` → 必要なら `schedule()` し直す。設定はローカル予定(`EventFormSheet`)・取り込み予定(`EventDetailSheet`)の両方で可能(FR-20「sourceを問わない」)── 既存の `updateEvent` は `source!=='local'` を弾くため、`reminder_minutes` だけを書ける新規の狭い書き込み経路を用意する。通知タップは Story 5.1 の `DeepLinkListener`/`onDeepLink` をそのまま再利用する(`localNotificationActionPerformed` を合成 `calendar-app://event/{id}` として同じ受け口に流し込むだけで、`DeepLinkListener.tsx` 自体は無変更)。

## Boundaries & Constraints

**Always:** 通知IDは `packages/core` の単一の導出関数のみを使う(独自ハッシュを増やさない)。リマインダーは**時刻付き予定のみ**対象(終日予定は「N分前」の基準時刻を持たないため対象外、UIも出さない)。`setEventReminder` は `source` を問わず許可するが、書き換えるのは `reminder_minutes` 列だけ(他の列には一切触れない、AD-2 の一方向原則を維持)。Google 同期(`syncGoogleCalendarsNow`)・端末カレンダー同期(`syncDeviceCalendarsNow`)のどちらも、完了後にリマインダー設定済みの全予定を再スケジュールする(個々の予定の時刻が実際に変わったかを diff せず、常に cancel→re-schedule する簡便法 ── 個人規模の件数なら十分に軽い)。

**Never:** 繰り返し予定への個別リマインダー設定 UI は作らない(PRD Out of Scope)。代表予定の選抜結果をそのまま使うダイジェスト通知は作らない(FR-20 Out of Scope、FR-18/ウィジェットとは無関係)。push 配信サーバーは持たない。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| プリセットでリマインダー設定 | 時刻付き予定で「10分前/30分前/1時間前」を選ぶ | `reminder_minutes` が保存され、その時刻にローカル通知がスケジュールされる | N/A |
| カスタム分数で設定 | 任意の分数(0以上)を入力 | 同上、入力値で保存 | 負値・非数値は保存しない |
| オフに戻す | 設定済みのリマインダーを解除 | `reminder_minutes=null`、既存の通知が `cancel()` される | N/A |
| 予定の時刻を編集 | 開始時刻を変更して保存 | 同じ導出IDで `cancel()` → 新しい時刻で `schedule()` し直す | N/A |
| 予定を削除 | リマインダー設定済みの予定を削除 | 同じ導出IDで `cancel()` のみ(再スケジュールしない) | N/A |
| 同期で時刻が変わる | Google/端末カレンダー同期が時刻を書き換える | 完了後、リマインダー設定済みの全予定が再スケジュールされる | N/A |
| 通知をタップ | 端末の通知をタップ | 該当予定の詳細/編集シートが開く(既存のディープリンク受け口) | N/A |
| 終日予定 | 終日予定の詳細/編集を開く | リマインダー設定 UI 自体が表示されない | N/A |
| 通知権限が無い | OS の通知許可が無い状態でリマインダーを設定 | `reminder_minutes` はDBに保存されるが、実際の通知はスケジュールされない | `notification/permission-denied` |

</frozen-after-approval>

## Code Map

- `packages/core/src/notification-id.ts` -- 新規。`deriveNotificationId(eventId: string): number`(UUID のハイフンを除いた先頭8桁 hex を32bit整数として parse し、`| 0` で符号あり32bitへ変換。衝突は個人規模で許容、Design Notes 参照)
- `packages/core/src/index.ts` -- `deriveNotificationId` を re-export
- `src/platform/reminders.ts` -- 新規。ネイティブブリッジ(ロジック無し、`deviceCalendar.ts`/`deepLink.ts` と同じ層分離): `requestNotificationPermission(): Promise<PermissionState>`(`LocalNotifications.requestPermissions()`)、`scheduleReminder(opts: {id:number, eventId:string, title:string, at:Date}): Promise<void>`(`LocalNotifications.schedule()`、`extra:{eventId}` を積む、`allowWhileIdle:true`)、`cancelReminder(id: number): Promise<void>`(`LocalNotifications.cancel()`)
- `src/platform/deepLink.ts` -- `onDeepLink` が `App.addListener('appUrlOpen', ...)` に加えて `LocalNotifications.addListener('localNotificationActionPerformed', ...)` も購読する。通知タップ時は `notification.extra.eventId` から合成した `calendar-app://event/{eventId}` を同じ `handler` へ渡す(`DeepLinkListener.tsx` は無変更で両方に対応できる)
- `supabase/migrations/20260918000000_event_reminders.sql` -- 新規。`events` に `reminder_minutes integer` を追加、`check (reminder_minutes is null or (reminder_minutes >= 0 and reminder_minutes <= 10080))`(0分〜1週間)。RLS は既存の `events_update_own`(`user_id=auth.uid()` のみ、`source` 無関係)がそのまま使えるため変更不要
- `src/data/events.ts` -- `EventItem`/`EventRow`/`COLUMNS`/`toEvent` に `reminderMinutes: number | null` を追加。新規 `setEventReminder(eventId: string, minutes: number | null): Promise<Result<EventItem>>`(`updateEvent` と違い `source` チェックをしない。`reminder_minutes` 列だけを update する)
- `src/data/reminders.ts` -- 新規。`syncReminderForEvent(event: EventItem): Promise<void>`(`cancelReminder(deriveNotificationId(event.id))` を先に呼び、`event.reminderMinutes != null` かつ `!event.allDay` かつ `event.startsAt` が現在時刻より後なら `scheduleReminder` する。過去時刻・終日・未設定なら cancel のみで終わる)。`resyncAllReminders(): Promise<void>`(`reminder_minutes is not null` かつ `deleted_at is null` の全予定を SELECT し、`syncReminderForEvent` をループ。同期完了後に呼ぶ)
- `src/data/google-sync.ts` -- `syncGoogleCalendarsNow()` の成功時、最後に `resyncAllReminders()` を呼ぶ(Edge Function/RPC には触れない、クライアント側ラッパのみの変更)
- `src/data/device-sync.ts` -- 同様に `syncDeviceCalendarsNow()` の成功時に `resyncAllReminders()` を呼ぶ
- `src/features/events/model/useEvents.ts` -- 新規 `setReminder(event: EventItem, minutes: number | null): Promise<boolean>`(`setEventReminder` → 成功なら `syncReminderForEvent` も呼ぶ、失敗なら `errorKey` 設定)。既存 `remove` の中で、削除成功時に `cancelReminder(deriveNotificationId(event.id))` を呼ぶ(reminder 未設定でも cancel は無害)
- `src/features/events/ui/ReminderPicker.tsx` -- 新規。プリセット(10分/30分/1時間前)+ カスタム分数入力 + 「リマインダーなし」の小さい共有コンポーネント。`EventFormSheet`/`EventDetailSheet` 両方から使う
- `src/features/events/ui/EventFormSheet.tsx` -- `editing`(既存予定の編集時のみ、新規作成時は予定IDが無いため出さない)かつ `!allDay` のとき `ReminderPicker` を表示
- `src/features/events/ui/EventDetailSheet.tsx` -- 同様に `!event.allDay` のとき `ReminderPicker` を表示(読み取り専用シートで唯一の書き込み可能な項目になる)
- `src/features/calendar/ui/CalendarScreen.tsx` -- `useEvents` から `setReminder` を取り出し、両シートに渡す

## Tasks & Acceptance

**Execution:**
- [ ] `packages/core/src/notification-id.ts`, テスト -- 新規 -- 通知ID導出
- [ ] `packages/core/src/index.ts` -- 修正 -- re-export
- [ ] `src/platform/reminders.ts`, テスト -- 新規 -- 通知スケジュール/取消のブリッジ
- [ ] `src/platform/deepLink.ts`, テスト -- 修正 -- 通知タップも同じ受け口へ
- [ ] `supabase/migrations/20260918000000_event_reminders.sql` -- 新規 -- `reminder_minutes` 列
- [ ] `src/data/events.ts`, テスト -- 修正 -- `reminderMinutes` フィールド + `setEventReminder`
- [ ] `src/data/reminders.ts`, テスト -- 新規 -- 同期・resync ロジック
- [ ] `src/data/google-sync.ts`, `device-sync.ts`, テスト -- 修正 -- 同期後の resync 呼び出し
- [ ] `src/features/events/model/useEvents.ts`, テスト -- 修正 -- `setReminder` + 削除時の cancel
- [ ] `src/features/events/ui/ReminderPicker.tsx`, テスト -- 新規
- [ ] `src/features/events/ui/EventFormSheet.tsx`, `EventDetailSheet.tsx`, テスト -- 修正 -- `ReminderPicker` 組み込み
- [ ] `src/features/calendar/ui/CalendarScreen.tsx` -- 修正 -- `setReminder` の受け渡し
- [ ] `android`/`ios` -- 修正 -- 通知権限(Android 13+ `POST_NOTIFICATIONS`、iOS は plugin が自動要求)の宣言確認

**Acceptance Criteria:**
- Given 時刻付き予定, when プリセットまたはカスタム分数でリマインダーを設定する, then `reminder_minutes` が保存され端末ローカルに通知がスケジュールされる(FR20, AD-15)
- Given リマインダー設定済みの予定, when 開始時刻を編集する, then 同じ導出IDで cancel → 新時刻で再スケジュールされる(FR20)
- Given リマインダー設定済みの予定, when 削除する, then 同じ導出IDで通知が取り消される(FR20)
- Given リマインダー設定済みの取り込み予定, when Google/端末カレンダー同期が時刻を書き換える, then 同期完了後に再スケジュールされる(FR20 Consequence)
- Given 通知をタップする, when アプリが起動する, then 既存のディープリンク受け口経由で該当予定の詳細/編集シートが開く(AD-16)
- Given 終日予定, when 詳細/編集を開く, then リマインダー設定 UI は表示されない

## Implementation Notes

Code Map / Tasks どおり実装。spec に無かった小さい決定:
1. `useEvents.ts` の `update()`(通常の予定編集フロー)にも `syncReminderForEvent` を追加 ── AC「開始時刻編集→cancel→再schedule」を満たすには spec の Code Map が明記していなかったこの経路にも呼び出しが要った。
2. 通知許可要求のタイミングは `ReminderPicker` がリマインダーをONにする操作のたびに呼ぶ設計(resync等のバックグラウンド処理では呼ばない)。拒否/例外時もDB保存自体は続行し `notification/permission-denied` の警告のみ表示。
3. `LocalNotificationSchema.body`(必須)は `at` から `H:MM` 形式の時刻文字列を生成して充てた。
4. Web(PWA)の `Notification` API 非対応環境での plugin web シム例外は `data/reminders.ts` 側で吸収し、DB保存の成否とは独立させた。
5. Android/iOS の通知権限宣言: `@capacitor/local-notifications` が自前の `AndroidManifest.xml` に `POST_NOTIFICATIONS` を宣言済み(Gradle自動マージ)、iOSはローカル通知に `Info.plist` キー不要と判断し、アプリ側manifest/plistは変更していない(実機/エミュレータでの最終確認は Story 5.1-5.3 と同じくこのマシンでは未実施、`deferred-work.md` へ既存の同種フォローアップと合流)。

**レビュー後パッチ(4件、詳細は Review Triage Log 参照):**
- `undoDelete` に `syncReminderForEvent` 追加
- `setEventReminder` に `validateReminderMinutes`(0-10080分・整数)追加、新エラーキー `event/invalid-reminder`、`ReminderPicker` にも上限チェック追加
- `reminders.ts` の `Date.parse` に `Number.isNaN` ガード追加
- `resyncAllReminders` に `.limit(2000)` 追加(`device-sync.ts` の `EXISTING_EVENTS_LIMIT` と同パターン)

## Spec Change Log

## Review Triage Log

3並列レビュアー(Blind Hunter / Edge Case Hunter / Verification Gap)を baseline `b49cffc` からの unified diff(46ファイル、android/ios/package-lock/_bmad-output 除外)に対して実施。Blind Hunter 12件、Edge Case Hunter 6件、Verification Gap 1件。重複統合・実ソース照合の上でトリアージ:

**patch(4件、同一実装サブエージェントへ差し戻し)**

1. **`undoDelete` がリマインダー通知を再スケジュールしない** — high。Verification Gap と Edge Case Hunter が独立に指摘(同一箇所)。`remove`/`update`/`setReminder` は全て DB 状態変更後に `syncReminderForEvent` を呼ぶ一貫パターンだが、`undoDelete`(`useEvents.ts:165-174`)だけ `restoreEvent` 後にこれを呼んでおらず、削除→Undoで復元した予定のリマインダー通知が届かなくなる。既存テストは `reminderMinutes: null` の予定でしか Undo を検証していなかった。
2. **`setEventReminder` に入力検証が無い** — medium。Edge Case Hunter(NaN/Infinity/範囲外が無検証で DB へ)+ Blind Hunter(カスタム分数の上限10080がUI側で未チェックのまま生の PostgrestError が漏れる)。`validateEventInput`/`validateEventPatch` と同じパターンで検証を追加し、`ReminderPicker` 側にも上限チェックを二重に置く。
3. **`reminders.ts` の `Date.parse` が NaN のとき過去時刻ガードをすり抜ける** — low(cheap)。Edge Case Hunter。`Number.isNaN` ガードを追加。
4. **`resyncAllReminders` に防御的な件数上限が無い** — low(cheap)。Blind Hunter。`device-sync.ts` の `EXISTING_EVENTS_LIMIT` パターンに揃えて `.limit(2000)` を追加。

**defer(`deferred-work.md` へ記録)**

- 終日予定へ切替時に `reminder_minutes` がDB上に残留する(Blind Hunter)— `update()` は `syncReminderForEvent` を呼ぶため通知自体は正しく cancel され、機能的実害(通知の誤配信)は無い。値の残留のみで、UI(`ReminderPicker`)は終日予定では表示されないため可視の不整合も無い。
- `resyncAllReminders` のスナップショットとユーザー操作のレース(Blind Hunter)— spec Design Notes で意図的に採用した「diffせず全件 cancel→schedule」という簡便設計そのものに内在するトレードオフ。個人規模のリマインダー件数では実害小。
- `resyncAllReminders` が同期処理を直列に待たせる(Blind Hunter)— 機能的正しさに影響しない UX 上の遅延のみ。fire-and-forget化はエラー可視性・テスト同期の設計変更を伴うため別途検討。
- 通知IDの衝突検出が無い/parse失敗が0にフォールバックする(Blind Hunter ×2)— アーキテクチャ(AD-15)・spec Code Map で明記済みの「衝突は個人規模で許容」という既存の設計方針そのもの。
- エラーバナーが BottomSheet の裏に隠れる(Blind Hunter)— `ev.errorKey` バナーと `BottomSheet` の z-index 関係は Story 5.4 以前から存在する既存パターン(作成/更新失敗でも同様)。Story 5.4 固有の新規問題ではない。
- 過去時刻になるリマインダーが無言でスケジュールされない(Blind Hunter)— spec I/O Matrix の範囲外。UI警告を出すか保存前に弾くかは別途 Open Question として扱う。
- Android/iOS のネイティブ通知権限の実機確認未実施(Blind Hunter)— このマシンに Android SDK が無く実機検証不可。Story 5.1〜5.3 と同じ既知の制約。
- `CalendarScreen` の `editing`/`detailEvent` が `setReminder` 成功後も追従しない(Blind Hunter、Edge Case Hunter 同種指摘)— Blind Hunter 自身が「実害は薄い」と評価。サーバ応答後の再フェッチで最終的に解消する。
- `ReminderPicker` のアンマウント時 setState(Edge Case Hunter)— React 19 では unmount 後の setState は警告もクラッシュも起きない(React 16/17 特有の問題)。データ書き込み自体はコンポーネントの生死と独立して完了する。
- `ReminderPicker` の連打による二重起動(Edge Case Hunter)— `setSaving(true)` が `await` 前の同期区間で呼ばれるため、React のイベントハンドラ内同期更新で実質的に次クリックまでに `disabled` が反映される。理論上の懸念に留まる。
- `resyncAllReminders` のテストが薄い(Blind Hunter)— 主要経路(Verification Gap確認済み)は別途担保されており、レース検知等の高コストなテスト追加は費用対効果が低い。

## Design Notes

**終日予定を対象外にした理由**: 「N分前」は基準となる時刻が要る。終日予定は時刻を持たないため、何らかの既定時刻(例: 朝9時)を発明する必要が出るが、PRD・アーキテクチャのどちらにもその既定値の合意が無い。範囲を時刻付き予定に絞ることで、独自のデフォルトルールを増やさずに済む。将来必要になれば別途 Open Question として扱う。

**同期後は「全件 resync」、diff はしない**: Google/端末カレンダー同期はどちらもクライアント側では「何が変わったか」を正確には知らない(Google は Edge Function 側で upsert、端末は upsert 後の行を都度読み直す形)。個人規模ではリマインダー設定済みの予定はせいぜい数件〜数十件程度と見込まれるため、`cancel`+`schedule` を毎回全件やり直す方が、変更検知のロジックを増やすより単純で壊れにくい。

## Verification

**Commands(パッチ後、独立に再実行して確認済み):**
- `npm run typecheck` -- ✅ 0 errors
- `npm run lint` -- ✅ 0 errors
- `npm test` -- ✅ 82 files / 613 tests 全部 green(パッチ前604 → +9)
- `npm run build` -- ✅ 成功(core build / vite build とも)

**Manual checks (if no CLI):**
- `npx supabase db push`(または `db diff`)でマイグレーション適用を確認 -- 未検証(Docker 未導入、Story 5.2/5.3 と同じ既知の制約)
- Android エミュレータでの実機確認(通知スケジュール・タップでのディープリンク遷移・削除時のcancel) -- 未実施(このマシンに Android SDK 無し。deferred-work.md へ記録)
