---
title: '端末カレンダーの同期実行と接続解除'
type: 'feature'
created: '2026-09-14'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '60f71a6b22762ca3d087a4a6e97576189d9174ad'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 5.2 で端末カレンダーの接続・取り込み対象選択はできるようになったが、実際の予定はまだ1件も取り込まれない。接続をやめる手段も無い(FR19)。

**Approach:** 選択済み端末カレンダーの予定を、アプリのフォアグラウンド復帰時 + 「今すぐ取り込み」手動実行で取り込む。`@ebarooni/capacitor-calendar` の `listEventsInRange` で生イベントを読み、`packages/core` の新規 device 用 normalizer(Google 用と対の形)で正規化し、クライアントの認証済み `supabase-js` 直接呼び出しで RLS 範囲内に upsert する(AD-14, AD-17。`apply_calendar_sync` 等は一切呼ばない)。時間窓内で応答から消えた予定は論理削除。接続解除は、Google(Story 3.4)と違い保護すべき秘密が無いため、新規 RPC を作らず「`calendars` を明示削除 → `connections` を削除(RLS 新設 + 既存 FK cascade で `connection_calendars`/`events`/`sync_state` も連鎖削除)」という2手のクライアント直接操作で実現する。

## Boundaries & Constraints

**Always:** 書き込みは認証済みクライアントの `supabase-js` 直接呼び出しのみ、新規 `security definer` RPC は作らない(AD-17)。取り込み対象は Story 5.2 で `selected=true` にした端末カレンダーのみ。取り込み時間窓は Google と同じ「今 - 60日 〜 今 + 400日」(`supabase/functions/sync-calendars`)に揃える。終日予定の日付は端末のローカルタイムゾーン(JS の `Date` ローカル getter)基準で解釈する(iOS/Android の内部表現差を吸収する簡便法、Design Notes 参照)。取り込んだ端末予定は閲覧専用(既存の `source!=='local'` 判定にそのまま乗る)。

**Never:** 端末カレンダーへの書き込みは一切しない。`sync_state` テーブルへの書き込みはしない(このストーリーの AC は取り込み結果の成否表示を要求していない。将来必要になれば別ストーリー)。Google 側のコード(`sync-calendars` Edge Function、`apply_calendar_sync` 等)には触れない。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| フォアグラウンド復帰で取り込み | アプリを最小化→再度開く、選択済み端末カレンダーあり | 選択済みカレンダーの予定が upsert される | N/A |
| 手動「今すぐ取り込み」 | 設定の端末カレンダー欄でボタンを押す | 同上を即時実行 | 失敗時は `sync/failed` |
| 端末側で予定が削除された | 前回取り込んだ予定が今回の応答に無い | 時間窓内なら論理削除される | N/A |
| 選択済みカレンダーが0件 | まだ何も選択していない | 何もせず正常終了(0件同期) | N/A |
| 取り込んだ予定の詳細を開く | 予定リスト等でタップ | 読み取り専用の詳細シートが開く(編集・削除UIなし) | N/A |
| 接続解除 | 設定で「接続を解除」→確認シートで確定 | その接続由来の `calendars`/`events`/`connection_calendars` が消え、影響件数が事前に見える | `connection/disconnect-failed` |
| 未接続で同期関数が呼ばれる | 端末カレンダー未接続 | 何もせず `{synced:0, deleted:0}` を返す(エラーにしない) | N/A |

</frozen-after-approval>

## Code Map

- `packages/core/src/device-events.ts` -- 新規。`packages/core/src/google-events.ts` と対の形(このファイルは `_shared/` への同期対象に**含めない** ── `scripts/sync-edge-shared.mjs` の `targets` 配列は `google-events.ts` のみを指しており、device 側は Edge Function から使われないため意図的に対象外)。`DeviceEventRaw`(`@ebarooni/capacitor-calendar` の `CalendarEvent` のうち使う分: `id, title, description, isAllDay, startDate, endDate`)、`normalizeDeviceEvent(raw): NormalizedDeviceEvent | null`(構造は `NormalizedGoogleEvent` と同じ)、`toDeviceEventRow(n): EventRow`(`google-events.ts` の `EventRow` 型をそのまま再利用 ── 構造的に同じ DB 列形なので型を分ける必要がない)。終日判定は `isAllDay` を見て、`startDate`(ms epoch)を **ローカルタイムゾーンの年月日**(`Date` のローカル getter: `getFullYear`/`getMonth`/`getDate`。`toISOString`は使わない)で `event_date` にする
- `packages/core/src/index.ts` -- `normalizeDeviceEvent`, `toDeviceEventRow`, 型を re-export
- `packages/core/src/google-events.ts` -- `deletedExternalIds`(既に provider 非依存の汎用関数)をそのまま device 側からも import して再利用する。変更なし
- `src/platform/deviceCalendar.ts` -- `listDeviceEventsInRange(fromMs, toMs): Promise<DeviceCalendarEvent[]>` を追加(`listEventsInRange` のラップ。`id/title/description/isAllDay/startDate/endDate/calendarId` だけ取り出す)
- `src/platform/appLifecycle.ts` -- 新規。`onAppResume(handler: () => void): () => void`(`@capacitor/app` の `App.addListener('resume', ...)` を右から左に流すだけの薄いラッパ、`src/platform/deepLink.ts` と同じ層分離)
- `src/data/device-sync.ts` -- 新規、`src/data/google-sync.ts` と対の形。`syncDeviceCalendarsNow(): Promise<Result<SyncRunResult>>`: (1) 有効な device 接続を取得、無ければ即 `ok({synced:[],errors:[]})`。(2) `connection_calendars` から `selected=true` の行を取得。(3) カレンダーごとに `listDeviceEventsInRange` の結果を `calendarId` でフィルタ→正規化→`external_id` で重複排除(Google と同じパターン)→ `events` へ `upsert(rows, {onConflict:'connection_id,external_id'})`。(4) 同じ時間窓・`connection_id`・`calendar_id` で `deleted_at is null` の既存 `external_id` を SELECT → `deletedExternalIds` で diff → 消えた分を `deleted_at=now()` に update。1カレンダーの失敗は他を止めない(try/catch で隔離、Google と同じ方針)
- `src/data/device-connections.ts` -- `disconnectDevice(connectionId): Promise<Result<DisconnectImpact>>` を追加(`DisconnectImpact` 型は `src/data/connections.ts` から import して再利用)。手順: `getDisconnectImpact(connectionId)` で件数取得 → `calendars` を `external_connection_id` で明示削除(FK cascade が無いため) → `connections` を `id` で削除(新設する RLS 経由。`connection_calendars`/`events`/`sync_state` は既存の `on delete cascade` で連鎖削除される)
- `supabase/migrations/20260917000000_device_calendar_sync.sql` -- 新規。`connections` に `connections_delete_device` ポリシー追加: `for delete using (user_id = auth.uid() and provider = 'device')`(Google 行は引き続き DELETE 不可 = RPC 経由のみ)
- `src/features/connections/model/useDeviceSync.ts` -- 新規、`useGoogleSync.ts` と対の形
- `src/app/DeviceSyncOnResume.tsx` -- 新規。`onAppResume(() => void syncDeviceCalendarsNow())` をマウント時に購読するだけの非表示コンポーネント(UI無し、`null` を返す)。`src/main.tsx` の `<DeepLinkListener />` と並べて配置
- `src/features/connections/ui/ConnectionsSection.tsx` -- 端末カレンダーブロックに「今すぐ取り込み」ボタンと「接続を解除」ボタンを追加(Google ブロックと同じ配置・文言パターン)。解除は `DisconnectSheet` を再利用
- `src/features/connections/ui/DisconnectSheet.tsx` -- `title: string` prop を追加(既定文言をハードコードせず呼び出し側が渡す。Google 呼び出し側は `"Google 接続を解除"` を渡すよう更新、既存の見た目は変えない)

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/device-events.ts`, `device-events.test.ts` -- 新規 -- device 用 normalizer
- [x] `packages/core/src/index.ts` -- 修正 -- re-export 追加
- [x] `src/platform/deviceCalendar.ts` -- 修正 -- `listDeviceEventsInRange` 追加
- [x] `src/platform/appLifecycle.ts`, テスト -- 新規 -- `onAppResume` ブリッジ
- [x] `src/data/device-sync.ts`, テスト -- 新規 -- 同期実行ロジック
- [x] `src/data/device-connections.ts`, テスト -- 修正 -- `disconnectDevice` 追加
- [x] `supabase/migrations/20260917000000_device_calendar_sync.sql` -- 新規 -- device 接続の DELETE ポリシー
- [x] `src/features/connections/model/useDeviceSync.ts` -- 新規
- [x] `src/app/DeviceSyncOnResume.tsx`, テスト -- 新規
- [x] `src/main.tsx` -- 修正 -- `<DeviceSyncOnResume />` 追加
- [x] `src/features/connections/ui/ConnectionsSection.tsx`, テスト -- 修正 -- 今すぐ取り込み・接続解除ボタン追加
- [x] `src/features/connections/ui/DisconnectSheet.tsx`, テスト -- 修正 -- `title` prop 化

**Acceptance Criteria:**
- Given 選択済みの端末カレンダー, when アプリがフォアグラウンド復帰する、または「今すぐ取り込み」を押す, then 生データが読まれ device 用 normalizer で正規化され、クライアント直接・RLS 範囲内で upsert される。Google 専用の `service_role` RPC は一切呼ばれない(FR19, AD-14, AD-17)
- Given 前回取り込んだ予定が端末側で削除された, when 次の取り込みが走る, then 時間窓内かつ応答に無い外部IDの予定が論理削除される(AD-17)
- Given 取り込んだ端末予定, when 詳細を開く, then 読み取り専用シートが開き、優先度がそのまま効く(FR19, AD-2)
- Given 端末カレンダー接続を解除する, when 確認シートで確定する, then その接続由来の `calendars`/`events`/`connection_calendars` が消え、影響件数が事前に表示される(NFR13)
- Given 端末カレンダー未接続, when 同期関数が(フォアグラウンド復帰等で)呼ばれる, then エラーにならず何もしない

## Implementation Notes

- **検証結果**: `npm run typecheck`(0 errors)/ `npm run lint`(0 errors)/ `npm test`(78 files, **549 tests**, all green)/ `npm run build`(成功)/ `node scripts/sync-edge-shared.mjs --check`(一致、device-events.ts は対象外のまま)。I/O & Edge-Case Matrix の7行すべてに対応するテスト(`device-events.test.ts` / `device-sync.test.ts` / `device-connections.test.ts` / `ConnectionsSection.test.tsx`)の存在と green を確認済み。
- **`SyncRunResult` 型**: `src/data/google-sync.ts` から import せず、`src/data/device-sync.ts` に構造的に同じ型を独立定義した。Google/device の実装を疎結合に保つ意図(Never 節「Google 側のコードには触れない」の精神を型レベルでも維持)。
- **削除差分の時間窓判定**: `apply_calendar_sync`(SQL)の `coalesce(ev.starts_at, ev.event_date::timestamptz) between p_window_min and p_window_max` と同じロジックを、RPC を使わないためクライアント側 JS(`isWithinWindow`)で再実装した。
- **手動確認は未実施**(既知の制約、Story 5.1 以来と同じ): Docker 未導入のため `npx supabase db push` によるマイグレーション適用未確認。Android エミュレータでの実機的な取り込み→表示→端末側削除→再取り込みでの消滅→接続解除の一連の確認もこのセッションでは未実施。次回、環境が整い次第の実施を推奨。
- **レビュー(patch 10件)適用後の再検証**: `## Review Triage Log` の high 1件・medium 1件・low 8件をすべて patch として実装エージェントへ再送し、修正を確認。最重要だった `.upsert()` の部分ユニークインデックス不一致(実DBでは同期が丸ごと42P10で失敗する可能性があった)を、SELECT→UPDATE/INSERTの手動シーケンスに書き換えて解消。`isWithinWindow` のUTC/ローカル不整合、フォアグラウンド復帰と手動実行の二重発火対策、`CalendarSource`/`EventSource`の型拡張、`EventDetailSheet`のsource分岐表示等も解消。orchestrator側で`npm run typecheck`(0 errors)/`lint`(0 errors)/`test`(**78 files, 561 tests, all green**)/`build`(成功)を独立に再実行し確認。最重要修正(手動upsertシーケンス)は実ファイルを直接読んで実装内容も確認済み。
- **レビュー(Review Triage Log 1〜10)対応**: 指摘された patch 10件をすべて実装。要点は以下(詳細は各 Triage Log 項目参照)。
  - `syncDeviceCalendarsNow` の書き込みを `.upsert()` から「`(connection_id, external_id)` で SELECT(`deleted_at` を問わず)→既存なら UPDATE(`deleted_at:null` で復活)/ 無ければ INSERT」の手動シーケンスに変更(`events_external_uniq` が部分ユニークインデックスのため `.upsert({onConflict})` が `42P10` で失敗する問題への対応)。マイグレーション・Google側コードは変更していない。
  - `isWithinWindow` の `event_date` 比較を `Date.parse`(UTC 解釈)から `new Date(y,m-1,d)`(ローカル解釈)へ修正。
  - `syncDeviceCalendarsNow` にモジュールレベルの in-flight ガードを追加(実行中は同じ Promise を返す)。
  - `CalendarSource`/`EventSource` に `'device'` を追加、`CalendarRow` の `SOURCE_LABEL` に `device:'端末'`、`EventDetailSheet` の読み取り専用注記を `event.source` で分岐(旧「既存コードに残る隣接の不整合」として記録していた2件はこれで解消)。
  - `ConnectionsSection` の取り込み結果メッセージを `formatSyncResultLine` に共通化し、全カレンダー失敗時(`synced.length===0`)は「取り込みに失敗しました」を出す(「一部」表示を避ける)。Google・端末の両ブロックに適用。
  - 削除差分 SELECT に `.limit(2000)` を追加。
  - Google/端末それぞれの「今すぐ取り込み」「接続を解除」ボタンに `aria-label`(「Google の…」/「端末カレンダーの…」)を追加し、両方接続済み時のアクセシブルネーム重複を解消。
  - `disconnectDevice` は `getDisconnectImpact` が失敗しても件数を `{events:0,calendars:0}` にフォールバックして削除処理自体は続行するよう変更(Google 側の設計と統一)。
  - `normalizeDeviceEvent` に `isValidEpochMs`(ECMA-262 の Date 有効範囲チェック)を追加し、`startDate`/`endDate` が範囲外なら `null`(または開始側へフォールバック)にして `RangeError` を防止。
  - Design Notes に非アトミック性の一文を追記(このセクション末尾参照)。
  - **この回で再実行した検証(変更ファイルに対応するテストのみ、スコープを絞って実行)**: `npm run typecheck`(0 errors)/ `npx vitest run` を対象ファイルごとに実行 ── `packages/core/src/device-events.test.ts`(13 tests)/ `src/data/device-sync.test.ts`(13 tests)/ `src/data/device-connections.test.ts`(13 tests)/ `src/features/calendars/ui/CalendarRow.test.tsx`(11 tests)/ `src/features/events/ui/EventDetailSheet.test.tsx`(6 tests)/ `src/data/calendars.test.ts`(18 tests)/ `src/data/events.test.ts`(16 tests)/ `src/features/connections/ui/ConnectionsSection.test.tsx`(26 tests)、すべて green。全体スイート(`npm run lint`/`npm test`/`npm run build` 含む)の再実行はコーディネーター側で実施予定のため、この回では意図的に行っていない。

## Spec Change Log

## Review Triage Log

1. **high** — `syncDeviceCalendarsNow` の `.upsert(rows, {onConflict:'connection_id,external_id'})` が、実DBの唯一の一意インデックス `events_external_uniq`(`connection_id, external_id` の**部分**インデックス、`where connection_id is not null`)にマッチしない。`supabase-js` の `onConflict` は列名しか渡せず部分インデックスの述語を表現できないため、Postgres は `42P10`(ON CONFLICT に一致する制約なし)でINSERTを拒否する。verification-gap・edge-case-hunter が独立に発見、実際の migration ファイルで直接確認済み。全テストがモックで実SQLを通していないため green のまま出荷されるところだった。→ patch(`.upsert()` に頼らず「SELECT既存行→あればUPDATE、無ければINSERT」の手動シーケンスに書き換える。マイグレーション・Google側RPCには触れない)
2. **medium** — `isWithinWindow()` が終日予定の `event_date`(YYYY-MM-DD)を `Date.parse()` で再パースしており、これはUTC深夜起点になる。`toLocalDateString()` でわざわざ避けたはずのローカル/UTCのズレ問題を削除差分の窓判定側で再び持ち込んでいる。blind-hunter・edge-case-hunter が独立に発見。→ patch(`event_date` は `new Date(y, m-1, d)` のローカル多引数コンストラクタで復元し比較する)
3. **low** — `DeviceSyncOnResume`(フォアグラウンド復帰)と手動「今すぐ取り込み」ボタンの間に排他制御が無く、同時発火で `syncDeviceCalendarsNow` が2重に走り得る。blind-hunter・edge-case-hunter が独立に発見。→ patch(`device-sync.ts` にモジュールレベルの in-flight ガードを追加し、実行中の呼び出しは同じ Promise を返す)
4. **low** — `EventDetailSheet` の読み取り専用注記が `event.source` を見ず常に「Googleカレンダーから取り込んだものです」と表示する。このストーリーで初めて `source='device'` の予定が実在するようになるため、実際に事実と異なる表示が出る。`CalendarRow` の `SOURCE_LABEL`(および `CalendarSource`/`EventSource` 型)にも `device` が無く、カレンダー管理画面で種別表示が空になる(こちらは Story 5.2 由来だが同根)。blind-hunter・edge-case-hunter・verification-gap 全員が言及(verification-gap は defer 寄りだが、直接ユーザーに見える・修正が些細なため patch と判定)。→ patch(`CalendarSource`/`EventSource` に `'device'` 追加、`SOURCE_LABEL` に `device:'端末'`、`EventDetailSheet` の文言を `source` で分岐)
5. **low** — 「今すぐ取り込み」失敗時のメッセージが常に「一部のカレンダーを取り込めませんでした」で、全カレンダーが失敗した場合も「一部」と表示される。blind-hunter が発見。→ patch(`synced.length===0` のときは文言を変える)
6. **low** — 削除差分用の既存イベント SELECT に `.limit()` が無く、Supabase既定の行上限を超えると取得漏れが起き得る(個人利用規模では極めて起きにくい)。blind-hunter が発見。→ patch(安全マージンとして `.limit(2000)` を追加)
7. **low** — GoogleブロックとDeviceブロックが両方接続済みのとき、「今すぐ取り込み」「接続を解除」ボタンのアクセシブルネームが同一文言でスクリーンリーダーから区別できない。blind-hunter が発見(NFR7 アクセシビリティフロアに関連)。→ patch(ボタンの `aria-label` に「Google の」「端末カレンダーの」を補う)
8. **low** — `disconnectDevice` が `getDisconnectImpact` の失敗時に実削除そのものを中断してしまう。Google 側の設計(件数プレビューは UI 用の付随情報であり、実際の解除処理はそれに依存しない)と異なる。edge-case-hunter の指摘を発展させて確認。→ patch(件数取得に失敗しても削除処理は続行する)
9. **low** — `normalizeDeviceEvent` が `startDate`/`endDate` の異常値(桁外れ)を弾かず、`toISOString()` が `RangeError` を投げ得る(呼び出し元の try/catch で捕捉はされるため致命的ではない)。edge-case-hunter が発見。→ patch(有効な `Date` 範囲チェックを追加)
10. **low** — Design Notes が `disconnectDevice` の2手(`calendars`削除→`connections`削除)の非アトミック性(Story 5.2 の選択トグルで既に受容している非アトミック性と同根)について触れていない。blind-hunter・edge-case-hunter が指摘。→ patch(Design Notes に一文追記のみ、コード変更なし)
11. **false** — マイグレーションファイル名が `20260917000000`(作成日 2026-09-14 の3日先)になっている点。既存の慣行(`20260915000000_fix_cron_apikey.sql` 等、実日付ではなく昇順キーとして運用)と一致しており問題なし。
12. **defer(pre-existing)** — 端末カレンダーを選択解除(Story 5.2)した後、そのカレンダー由来の既存 `events` 行は `syncDeviceCalendarsNow` の対象から外れ、二度と削除差分の対象にならない(`deleted_at` が立たないまま残る)。ただし該当カレンダーの `calendars` 行自体は選択解除時に論理削除されるため、`calendarById` に基づく画面描画では表示されない(Google の `set_google_calendar_selection` の deselect も全く同じ設計で、Epic 3 で既に受容済みのパターン)。データ衛生上の残留であり、視覚的な不具合ではない。Google・device 共通の課題として別途まとめて扱うべき。
13. **defer(pre-existing)** — `ConnectionsSection.tsx` の解除確認シートを開く際、`getDisconnectImpact` が失敗しても件数プレビューが「—」のまま無言で残り、確認ボタンはそのまま押せてしまう。Google 側の既存コード(`openDisconnect`)も同じ挙動であることを確認済み(新規の回帰ではない)。
14. **defer(pre-existing)** — `disconnectDevice` の `calendars`/`connections` 削除がそれぞれ削除件数(count)を確認していない。RLS 不一致等で0件削除でも成功扱いになり得る。個人利用規模では起きにくく、修正には削除クエリの構造変更が要るため、今回は見送る。

## Design Notes

**終日予定の日付解釈**: Android(CalendarContract)は終日予定を UTC 深夜起点、iOS(EventKit)は端末のローカル深夜起点で表現する傾向があり、`startDate`(ms epoch)を `toISOString()`(UTC)でそのまま日付化すると、端末のタイムゾーンによっては前日/翌日にずれ得る。本ストーリーでは `Date` のローカル getter(`getFullYear`/`getMonth`/`getDate`)で日付化する ── これは「アプリが動いている端末自身のローカル日」を取るので、どちらの OS 表現から来た値でも、少なくとも実行環境(=取り込み元と同じ端末)内では直感的な日付になる。iOS 実機での検証は Story 5.1 以来の制約(Windows 開発機)によりできないため、Android 実機でのみ確認し、iOS 側は Mac 確保後のフォローアップで確認する。

**接続解除がRPCを使わない理由**: Google の `disconnect_google_connection` は Vault の refresh_token を消す必要があり `security definer` が要る。端末カレンダーには消すべき秘密が無いため、既存の RLS(`calendars_delete_own`)+ 新設する `connections` の DELETE ポリシーだけで完結させる。カスケードの流れは Google と同じ(`calendars` は FK が無いため明示削除、`connections` 削除で残りは `on delete cascade`)。`calendars` 削除 → `connections` 削除の2手は1トランザクションではないため、途中(1手目成功・2手目失敗)で終わると `calendars` だけ消えて `connections` が残る中間状態が起き得るが、Story 5.2 の選択トグル(`setDeviceCalendarSelected` / `refreshDeviceCalendarCatalog`)で既に受容している非アトミック性と同じ性質の問題であり、個人利用規模では「もう一度解除を押す」ことで収束するため同様に許容する。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 errors
- `npm run lint` -- expected: 0 errors
- `npm test` -- expected: 既存 + 新規テストすべて green
- `npm run build` -- expected: 成功

**Manual checks (if no CLI):**
- `npx supabase db push`(または `db diff`)でマイグレーション適用を確認(Docker 未導入のためこのセッションでは未検証、Story 5.2 と同じ既知の制約)
- Android エミュレータ(`Pixel_7_API_36`)で端末カレンダーに予定を1件作成 → アプリで「今すぐ取り込み」→ カレンダー画面に表示されることを確認。端末側でその予定を削除 → 再度取り込み → 消えることを確認。「接続を解除」→ カレンダー管理・予定一覧から device 由来のものが消えることを確認
