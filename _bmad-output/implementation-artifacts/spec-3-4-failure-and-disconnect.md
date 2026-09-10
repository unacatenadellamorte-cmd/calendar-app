---
title: 'Story 3.4: 取り込み失敗の表示と接続解除'
type: 'feature'
created: '2026-09-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fae9235a9f6fedbc08d3126be34989d22c011f28'
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
  - '_bmad-output/implementation-artifacts/spec-3-3-google-event-sync.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 3.3 で取り込み失敗は `sync_state.last_error` に記録されるが、ユーザーには見えない。また Google 接続をやめる経路が無く、取り込んだ予定・カレンダーがサーバーに残り続ける(痕跡が消せない)。Epic 3 の最後の2点。

**Approach:**
- **失敗表示**: カレンダー管理画面(`CalendarsScreen`)で `source='google'` の行に、その `sync_state.last_error` があれば「取り込めませんでした」+「再試行」を出す。他カレンダーの表示・取り込みは止めない。ホーム/カレンダーは最後に取り込めた予定をそのまま出し続ける(既存挙動)。「再試行」は既存の `syncGoogleCalendarsNow()`(全カレンダー再取り込み)を呼ぶ。
- **接続解除**: 設定の接続欄に「接続を解除」。押すと確認シートで影響(消える予定・カレンダーの件数)を先に見せ、確定で `disconnect_google_connection()` RPC を呼ぶ。RPC は `calendars`(`source='google'`)を実削除 → `connections` 行を実削除(`connection_calendars` / `sync_state` / `events` は FK `on delete cascade`)→ Vault の refresh_token を削除。クライアントは IndexedDB キャッシュを取り直して整合させ、他画面は再取得トリガで追随。

## Boundaries & Constraints

**Always:**
- 接続解除は**実削除**(痕跡を残さない、§8.3 / NFR3)。取り込んだ予定・カレンダー行・`connection_calendars` / `sync_state` / `connections` 行・Vault secret をすべて消す。ローカル予定(`source='local'`)には一切触れない。
- 破壊的操作は確定前に影響を明示(消える予定・カレンダーの件数)。UX-DR13。確定は明示的な操作(シート内の専用ボタン)で、誤タップで実行されない。
- `connections` の書き込み(削除含む)はサーバー側 RPC 経由。`disconnect_google_connection` は `security definer` で `auth.uid()` を検証、`revoke from public,anon` + `grant to authenticated`。冪等(接続が無ければ何もしない)。
- 失敗表示は `sync_state.last_error`(3.3 で記録済み)を読むだけ。data-access は `src/data` に閉じ `Result<T, AppError>` を返す。
- 1カレンダーの失敗表示・再試行が他カレンダーの表示・取り込みを止めない(AD-4、UX-DR11)。
- 文言は EXPERIENCE.md Voice、感嘆符なし、英語・コード・トークンを出さない。

**Never:**
- 増分同期・per-calendar 単位の取り込み関数(「再試行」は全体の `syncGoogleCalendarsNow` で代替。per-calendar retry は deferred)。
- 接続解除の Undo(実削除なので戻せない。だから事前明示が要る)。
- Edge Function の変更(`sync-calendars` はそのまま)。複数 Google アカウント対応。
- ローカルの `events` / `calendars`(`source='local'`)の削除・変更。

**決定(2026-09-10、Open Question 解決):**
- **「再試行」= 全カレンダー再取り込み(選択肢 A)。** `syncGoogleCalendarsNow()` をそのまま呼ぶ。冪等なので成功済みカレンダーを巻き込んでも実害なし。per-calendar retry は deferred-work へ。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error Handling |
|---|---|---|---|
| 失敗のあるカレンダー | `sync_state.last_error` が非 null の `calendar_id` | カレンダー管理のその行に「取り込めませんでした」+「再試行」ボタン。他の行は通常表示 | N/A |
| 「再試行」 | 失敗行の再試行ボタン | `syncGoogleCalendarsNow()` を呼ぶ。実行中はボタン無効。成功後 `sync_state` を取り直し表示更新 | 失敗 → 行に文言据え置き、画面上部に `sync/failed` or `data/offline` |
| 失敗が解消 | 再試行が成功し `last_error` が null に | 次の `sync_state` 取得でその行の警告が消える | N/A |
| 接続解除の影響プレビュー | 接続中・「接続を解除」タップ | 確認シート:「取り込んだ予定 N 件・カレンダー M 件がこの端末とサーバーから消えます。元に戻せません。」+「接続を解除」ボタン | 件数取得に失敗 → 件数を「—」にしつつ解除自体は可能 |
| 接続解除の確定 | 確認シートの解除ボタン | `disconnect_google_connection()` → `calendars(google)` / `connections` / (cascade) `connection_calendars`・`sync_state`・`events` / Vault secret を削除。IndexedDB キャッシュを取り直し。接続欄は「未接続(接続ボタン)」へ。ホーム/カレンダー/カレンダー管理から google 予定・行が消える | RPC 失敗 → シートにエラー文言、接続状態は変えない |
| 接続解除 → 再接続 | 解除後に「Google を接続」 | まっさらな OAuth 往復(前の選択・sync_state は残っていない) | N/A |
| 未接続で解除 RPC が呼ばれる | `connections` に行なし | 冪等に成功(何もしない) | N/A |
| オフラインで解除 | fetch 失敗 | `err('data/offline')`、シートに「オフラインです」。削除は実行しない | N/A |
| guest / 未接続で接続欄 | `state==='guest'` or 接続なし | 「接続を解除」ボタンを出さない | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260914000000_disconnect_google.sql` — **新規**。`disconnect_google_connection() returns jsonb` RPC(`security definer` / `set search_path = public, vault, extensions, pg_temp` / `revoke from public, anon` / `grant to authenticated`)。`auth.uid()` の有効 google 接続を引き、無ければ `{deleted:false}` を返す(冪等)。`delete from public.calendars where external_connection_id = v_conn_id`(FK cascade が無いので明示)→ `delete from public.connections where id = v_conn_id`(`connection_calendars` / `sync_state` / `events` は `on delete cascade`)→ `delete from vault.secrets where id = v_conn.vault_secret_id`。件数(`events` / `calendars`)を数えて `{deleted:true, events:int, calendars:int}` で返す。
- `src/data/connections.ts` — `disconnectGoogle(): Promise<Result<{ events: number; calendars: number }>>`(`supabase.rpc('disconnect_google_connection')`、`isNetworkError` → `data/offline`、他は `connection/disconnect-failed`)。`getDisconnectImpact(connectionId): Promise<Result<{ events: number; calendars: number }>>`(`events` を `connection_id` + `deleted_at is null` で `head:true, count:'exact'`、`calendars` を `external_connection_id` で同様)。
- `src/data/connections.test.ts` — `disconnectGoogle` / `getDisconnectImpact` の Result 分岐。
- `src/data/messages.ts` — `connection/disconnect-failed`(「接続の解除に失敗しました。もう一度お試しください」)。
- `src/app/online-context.ts` + `src/app/OnlineProvider.tsx` — `OnlineState` に `refetch: () => void` を追加(`setSyncNonce((n) => n + 1)` を公開)。`useEvents` / `useCalendars` は既に `syncNonce` で reload するので、解除後に `refetch()` を呼べば全画面が追随。`defaultOnlineState` にも no-op を追加。
- `src/features/connections/model/useCalendarSyncStatus.ts` — **新規**。`(enabled)` → `{ errorByCalendarId: Map<string,string>, retrying: boolean, retry: () => Promise<void>, reload: () => void, retryErrorKey: string | null }`。マウント時と `reload` で `listSyncState()`、`retry` は `syncGoogleCalendarsNow()` → 成功で `reload()`。
- `src/features/connections/model/useGoogleConnection.ts` — 変更なし(`refresh()` は既にある)。確認のみ。
- `src/features/connections/ui/ConnectionsSection.tsx` — 接続中ブロックに「接続を解除」ボタン(`text-danger` 系、控えめ)。押すと確認シートを開く。解除成功で `useGoogleConnection.refresh()` + `useOnline().refetch()` + 結果トースト。既存の「今すぐ取り込み」「最終取り込み時刻」はそのまま。
- `src/features/connections/ui/DisconnectSheet.tsx` — **新規**。`BottomSheet` ベース。`open` / `impact: {events,number}|null` / `busy` / `errorKey` / `onConfirm` / `onClose`。影響件数の一文 + 「元に戻せません」+「接続を解除」ボタン(busy 中は無効・「解除中…」)。
- `src/features/connections/ui/GoogleCalendarPicker.tsx` — 変更なし(失敗表示は 3.3 で行に「前回は取り込めませんでした」を既に出す。3.4 の主対象はカレンダー管理画面)。確認のみ。
- `src/features/calendars/ui/CalendarsScreen.tsx` — `useCalendarSyncStatus(enabled)` を使い、`CalendarRow` に `syncError`(messageKey or null)/ `onRetry` / `retrying` を渡す。再試行の `retryErrorKey` は画面上部の alert に。
- `src/features/calendars/ui/CalendarRow.tsx` — `syncError` があれば source 行の下に「取り込めませんでした」+「再試行」ボタン(44px、`retrying` で無効)。`source==='google'` の行だけ。
- `src/features/calendars/ui/CalendarRow.test.tsx` / `CalendarsScreen.test.tsx` — 失敗表示・再試行・他行が無傷。
- `src/features/connections/ui/ConnectionsSection.test.tsx` — 「接続を解除」→ 確認シート → 確定 → `disconnectGoogle` 呼び出し + `refetch` + 接続欄が未接続へ。オフライン。
- `src/data/cache.ts` — 変更なし(`disconnectGoogle` 後にクライアントで `listEvents()` / `listCalendars()` を呼べば `cacheReplace` で google 行が消える)。確認のみ。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260914000000_disconnect_google.sql` -- `disconnect_google_connection()` RPC(実削除 + Vault + 冪等 + 件数返し)
- [x] `src/data/connections.ts` (+ `.test.ts`) -- `disconnectGoogle` / `getDisconnectImpact`、全 Result、オフライン分岐(+8 tests)
- [x] `src/data/messages.ts` -- `connection/disconnect-failed`
- [x] `src/app/online-context.ts` + `src/app/OnlineProvider.tsx` -- `refetch()` を context に公開(フィールド追加のみ)
- [x] `src/features/connections/model/useCalendarSyncStatus.ts` (+ `.test.ts`) -- 失敗マップ + 再試行フック(4 tests)
- [x] `src/features/connections/ui/DisconnectSheet.tsx` -- 影響明示の確認シート
- [x] `src/features/connections/ui/ConnectionsSection.tsx` -- 「接続を解除」導線 + 解除後 `refresh()` + `refetch()`
- [x] `src/features/calendars/ui/CalendarsScreen.tsx` + `ui/CalendarRow.tsx` -- 失敗表示 + 再試行(google 行のみ)
- [x] `src/features/connections/**/*.test.tsx` / `src/features/calendars/**/*.test.tsx` -- I/O マトリクスの行(失敗表示・再試行・確認シート・解除・冪等・オフライン)

**Acceptance Criteria:**
- Given あるカレンダーの取り込みが失敗している、when カレンダー管理を見る、then その行に「取り込めませんでした・再試行」が出て、他のカレンダーは通常表示のまま。ホーム/カレンダーは最後に取り込めた予定を出し続ける。
- Given 失敗行の「再試行」を押して成功、then その行の警告が消える。
- Given Google 接続中、when「接続を解除」を押す、then 確定前に「消える予定 N 件・カレンダー M 件・元に戻せない」ことが表示される。
- Given 確認シートで解除を確定、then 取り込んだ予定・カレンダー行・接続がサーバーとこの端末から消え、接続欄が「未接続」に戻り、ホーム/カレンダー/カレンダー管理から google 由来のものが消える。ローカルの予定は残る。
- Given 解除後、when もう一度「Google を接続」、then まっさらな状態から接続でき、前の選択は残っていない。

## Implementation Notes

- **`disconnect_google_connection()` は `language plpgsql` + `security definer` + `grant to authenticated`**(他の connections 系 RPC は service_role 専用だが、これは本人が直接呼ぶ)。`calendars` を明示削除(FK 無し)→ `connections` 削除(`connection_calendars` / `sync_state` / `events` は `on delete cascade`)→ `vault.secrets` から refresh_token 削除。削除前に件数を数えて `{deleted, events, calendars}` を返す。冪等。
- **`refetch` は `OnlineState` にフィールド追加のみ**(`syncNonce` を bump)。`defaultOnlineState` に no-op を足したので破壊的変更なし。`useEvents` / `useCalendars` は既存の `if (syncNonce > 0) void reload()` でそのまま追随。接続解除ハンドラは `useGoogleConnection.refresh()`(接続欄を未接続へ)+ `useOnline().refetch()`(他画面の events/calendars を取り直し)を呼ぶ。
- **失敗表示は `CalendarRow` の下段**: `source==='google'` かつ `syncError` のときだけ「取り込めませんでした」+「再試行」(h-11)。`<li>` を `flex-col` 化(row を `<div>` で包む)。`useCalendarSyncStatus` が `listSyncState()` を calendar_id 別 Map にし、`retry` は `syncGoogleCalendarsNow()`(全カレンダー、冪等)→ `reload()`。`retry` 失敗は画面上部の alert。
- **`getDisconnectImpact` はプレビュー用**(確定前)。RPC も件数を返すので、解除後のトーストは RPC の返り値(実削除件数)を使う。プレビュー取得失敗時はシートで「—」表示のまま解除は続行可能。
- **確認シート**: `DisconnectSheet`(`BottomSheet` ベース)。「やめる」/「接続を解除(`bg-danger`)」の2ボタン。`busy` 中は両方無効。誤タップ防止 = シートを開く操作 + 専用ボタンの2段。
- **Verification**: typecheck / lint / build green。Vitest **435 tests**(3.3 の 415 から +20:connections +8・useCalendarSyncStatus 4・CalendarRow +4・ConnectionsSection +5・CalendarsScreen +2、他 -3 相当)。
- **レビュー Pass 1 の patch**: (F1) DisconnectSheet の「—」表示テスト追加 / (F2) `getDisconnectImpact` を `.select('*', ...)` に。F3〜F7 reject。
- **未テスト(実 DB 依存 = 目視 + 実機、3.1〜3.3 と同じ)**: `disconnect_google_connection` RPC の実削除・cascade・Vault 削除。data-access(`disconnectGoogle` / `getDisconnectImpact`)は mock で 8 tests。

## Spec Change Log

## Review Triage Log

**Pass 1(2026-09-10、3レンズ inline):**

| # | レンズ | 指摘 | verdict | 対応 |
|---|---|---|---|---|
| F1 | verification-gap | `DisconnectSheet` の「件数取得失敗 → 「—」表示のまま解除は続行可能」(I/O マトリクス行)に自動テストが無い | medium | **patch**: `ConnectionsSection.test.tsx` に `getDisconnectImpact` 失敗 → 「予定 —」表示 + 解除続行のテストを追加 |
| F2 | blind | `getDisconnectImpact` が `.select('id', {count,head})` を使う。`head:true` の件数取得は `.select('*', ...)` が Supabase の推奨形 | low | **patch(即修正)**: `.select('*', ...)` に統一 |
| F3 | edge | 「今すぐ取り込み」実行中に接続解除すると、in-flight の `sync-calendars` が削除済み `connection_id` で `apply_calendar_sync` を呼び FK 違反 → その同期が 500 で失敗 | low | reject(FK 制約が孤児データを防ぐ。ユーザーは解除後で影響を見ない。両操作を1秒以内に連打する必要があり稀) |
| F4 | blind | 解除成功後、`getConnection` 再取得までの一瞬「接続中」ブランチが残りマイクロフリッカーしうる | low | reject(体感できない一瞬。`refresh()` で即座に解消) |
| F5 | blind | `CalendarsScreen`(features/calendars)が `useCalendarSyncStatus`(features/connections)を import = クロス機能依存 | low | reject(spec Code Map どおりの配置。eslint zone も許容。sync_state は connections 概念だが表示はカレンダー管理) |
| F6 | verification-gap | `disconnect_google_connection` RPC の実削除・cascade・Vault 削除に自動テスト無し | — | reject(3.1〜3.3 と同根。ローカルに実 DB 無し。data-access は mock で 8 tests、実削除は Manual checks で担保。frozen Boundaries に明記) |
| F7 | blind | 解除の入口ボタンが `text-danger` のみで枠 / 背景なし = リンクに見える | low | reject(入口は控えめ・確定シートの `bg-danger` ボタンが主。「誤タップで実行されない」の意図に合致) |

**loopback なし**(F1・F2 は patch、F3〜F7 reject)。

## Design Notes

**`disconnect_google_connection()` の形:**
```sql
create or replace function public.disconnect_google_connection()
returns jsonb
language plpgsql
security definer
set search_path = public, vault, extensions, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_conn_id uuid;
  v_secret_id uuid;
  v_events int;
  v_cals int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select id, vault_secret_id into v_conn_id, v_secret_id
    from public.connections
    where user_id = v_uid and provider = 'google' and deleted_at is null;
  if v_conn_id is null then
    return jsonb_build_object('deleted', false, 'events', 0, 'calendars', 0);
  end if;

  select count(*) into v_events
    from public.events where connection_id = v_conn_id and deleted_at is null;
  select count(*) into v_cals
    from public.calendars where external_connection_id = v_conn_id and deleted_at is null;

  delete from public.calendars where external_connection_id = v_conn_id;
  delete from public.connections where id = v_conn_id;  -- cascade: connection_calendars / sync_state / events
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  return jsonb_build_object('deleted', true, 'events', v_events, 'calendars', v_cals);
end;
$$;
revoke execute on function public.disconnect_google_connection() from public, anon;
grant execute on function public.disconnect_google_connection() to authenticated;
```

- **クライアント側キャッシュ整合**: `ConnectionsSection` の解除ハンドラは RPC 成功後に `useOnline().refetch()`(= `syncNonce` bump)を呼ぶ。`useEvents` / `useCalendars` は `syncNonce` 変化で `reload()` → `listEvents()` / `listCalendars()` が `cacheReplace` で google 行を含まない一覧に置き換える。加えて解除ハンドラ内で `listEvents()` / `listCalendars()` を1回 await してから `refetch()` すると、設定画面に留まっていても次の遷移で確実に反映される。
- **`getDisconnectImpact` は `disconnect_google_connection` とは別**(プレビュー用)。RPC 自体も件数を返すので、確定後のトーストは RPC の返り値(実際に消えた件数)を使う。プレビューは概算で可(件数取得に失敗しても「—」で解除は続行可能)。
- **`CalendarRow` の失敗行**: `source==='google'` かつ `syncError` のときだけ。`aria-live` は使わず、通常のテキスト + ボタン。ボタンは既存の ▲▼ と同じ 44px 高さ。
- **`refetch` の命名**: 既存の `syncNonce` は「オンライン復帰でフラッシュ後」の意味だが、`useEvents`/`useCalendars` の購読側は「値が変わったら reload」しか見ていないので流用して問題ない。`OnlineState` に破壊的変更なし(フィールド追加のみ、`defaultOnlineState` に no-op)。

## Verification

**Commands:**
- `npm run -s typecheck` -- expected: 成功
- `npx vitest run` -- expected: 全 pass(+ connections / calendars の新規)
- `npm run -s lint` -- expected: 0
- `npm run -s build` -- expected: 成功

**Manual checks（`db push` 後）:**
- カレンダー管理で「ゴミ収集日」行に失敗表示が無い(3.3 で成功済みなので通常表示)。失敗を作るには一時的に Google 側でカレンダー共有を外す等 → 「取り込めませんでした・再試行」→ 再試行で消える。
- 設定 →「接続を解除」→ 確認シートに「予定 252 件・カレンダー 1 件が消えます」→ 確定 → 接続欄が「未接続」、月ビューからゴミ収集日の予定が全消え、ローカル予定は残る。Supabase で `events`(google)/ `connections` / `sync_state` / `connection_calendars` が 0 件、`vault.secrets` から該当行が消えていることを確認。
- 「Google を接続」→ まっさらな OAuth 往復ができる。
