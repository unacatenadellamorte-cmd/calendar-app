---
title: '端末カレンダーの接続と取り込み対象の選択'
type: 'feature'
created: '2026-09-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '26f8f90730db6b26b41fd4a3138c180c596c4855'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Story 5.1 で Capacitor 基盤が整ったが、ユーザーはまだ端末(OS)のカレンダーをこのアプリに取り込む手段を持たない(FR-19)。

**Approach:** 設定に「端末カレンダーを接続」を追加し、`@ebarooni/capacitor-calendar` でOSの権限を要求(Android: 読み取り専用、iOSはOSに読み取り専用の権限区分が無いため full access を要求するが書き込みAPIは一切呼ばない)。許可されたら `connections(provider='device')` 行を作る。続けて、Google の取り込み対象選択(Story 3.2)と同じ操作感の一覧画面で、端末カレンダーを個別にオン/オフできるようにする。書き込みはすべてクライアント直接・RLS 経由(AD-17。Google 専用の `service_role` RPC は流用しない)。

## Boundaries & Constraints

**Always:** 端末カレンダーの読み取りは `@ebarooni/capacitor-calendar` 経由のみ(AD-13)。書き込みは認証済みクライアントの `supabase-js` 直接呼び出しで既存 RLS の範囲内のみ、新規 `security definer` RPC は作らない(AD-17)。Android の権限宣言は `READ_CALENDAR` のみ追加し `WRITE_CALENDAR` は追加しない(誤って書き込み API を呼んでも OS が拒否するようにする)。カレンダー選択の内部ロジック(候補カタログの upsert・選択時の calendars 行作成/復活・優先度の再採番)は Story 3.2 の SQL(`upsert_connection_calendars` / `set_google_calendar_selection`)と同じ振る舞いを TypeScript 側で再現する。

**Never:** 実際の予定データの取り込み・同期はしない(Story 5.3)。接続解除の UI もこのストーリーでは作らない(Story 5.3)。端末カレンダーへの書き込み(作成・更新・削除)は一切しない。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 初回接続・許可 | 設定「端末カレンダーを接続」→ OS ダイアログで許可 | `connections(provider='device')` 行が作られ、選択画面へ進める | N/A |
| 権限拒否 | OS ダイアログで拒否 | 機能無効化の表示のみ、アプリ全体は落ちない | `Result`/`messageKey` |
| 候補をオン | 選択画面でトグル ON | `calendars(source='device')` 行が作成 or 復活し、最下位の優先度が付く | N/A |
| 候補をオフ | トグル OFF | 対応する `calendars` 行が論理削除される | N/A |
| 未接続で選択画面を開く | 直接 URL 遷移等 | 「先に端末カレンダーを接続してください」で設定へ誘導 | N/A |
| 端末側でカレンダーが増減 | 選択画面マウント時に自動でカタログ再取得 | 新しい候補が現れる/消えた候補はカタログから外れる(選択済みなら対応 `calendars` 行も論理削除) | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260916000000_device_calendar_support.sql` -- 新規。(1) `connections.provider` / `calendars.source` / `events.source` の CHECK 制約をリテラル `'device'` 追加へ拡張(`events` は Story 5.3 で使うがここで揃える)。(2) `connections` に `connections_insert_device` ポリシー追加: `for insert with check (user_id = auth.uid() and provider = 'device')`(Google 行は既存どおり INSERT ポリシー無し = service_role 専用のまま)。(3) `connection_calendars` に `connection_calendars_insert_device` / `connection_calendars_update_device` ポリシー追加: `connection_id` が指す `connections` 行が `provider='device' and user_id=auth.uid()` のときのみ許可(EXISTS サブクエリ)。`calendars` テーブルは既存の `calendars_insert_own`/`update_own`(`user_id=auth.uid()` のみ、source 無関係)がそのまま使えるため変更不要
- `package.json` -- `@ebarooni/capacitor-calendar` `^8.6.0` 追加(実インストール済み、READ_CALENDAR は Android のみ read-only 専用メソッドがあり iOS には無い。iOS は `requestFullCalendarAccess()` を使う。両方 `listCalendars()` は共通)
- `src/platform/deviceCalendar.ts` -- 新規。ネイティブブリッジ(ロジック無し、AD-12/AD-9 と同じ層分離): `requestDeviceCalendarAccess(): Promise<PermissionState>`(`Capacitor.getPlatform()` で分岐 — android: `requestReadOnlyCalendarAccess()`、それ以外: `requestFullCalendarAccess()`)、`checkDeviceCalendarPermission(): Promise<PermissionState>`(`checkPermission({scope: READ_CALENDAR})`)、`listDeviceCalendars(): Promise<{id,title,color}[]>`(`listCalendars()` のラップ、`title`/`color` の null は空文字/デフォルト色にしない ── 呼び出し側で処理)
- `src/data/device-connections.ts` -- 新規、`src/data/connections.ts` と対の形。`getDeviceConnection(): Promise<Result<Connection|null>>`(`provider='device'` で絞る `selectActive('connections',...).eq('provider','device')`)、`connectDevice(): Promise<Result<void>>`(権限要求 → 許可なら `supabase.from('connections').insert({provider:'device'})`、拒否なら `connection/permission-denied` 相当のエラー)
- `src/data/connections.ts` -- `getConnection()` が provider 無指定で最新の接続を1件返している(Google 前提の実装)。`provider: 'google'` を明示フィルタに追加し、device 接続と混在しても正しく Google のものだけ返すよう修正(既存呼び出し元の挙動は変えない)
- `src/data/device-calendars.ts` -- 新規、`src/data/google-calendars.ts` と対の形。`listDeviceCalendars(connectionId): Promise<Result<DeviceCalendarChoice[]>>`(`connection_calendars` を `connection_id` で絞って SELECT)、`refreshDeviceCalendarCatalog(connectionId): Promise<Result<{count:number}>>`(`src/platform/deviceCalendar.ts` の一覧を `connection_calendars` へ `upsert(onConflict:'connection_id,external_calendar_id')` → 応答に無い候補を `deleted_at` セット、選択済みなら紐づく `calendars` 行も論理削除 ── `upsert_connection_calendars` と同じ振る舞い)、`setDeviceCalendarSelected(connectionId, externalCalendarId, selected): Promise<Result<void>>`(`set_google_calendar_selection` と同じ手順を逐次呼び出しで再現: 選択 ON は既存 `calendars` 行があれば `deleted_at=null` + 優先度再採番(`select coalesce(max(priority),-1)+1 ... where deleted_at is null` を先に投げてから update)、無ければ `insert`(BEFORE INSERT トリガが採番)。OFF は該当 `calendars` 行を論理削除。どちらも最後に `connection_calendars` の `selected`/`calendar_id` を更新)
- `src/features/connections/model/useDeviceConnection.ts`, `useDeviceCalendars.ts` -- 新規、`useGoogleConnection.ts`/`useGoogleCalendars.ts` と同型(マウント時にカタログを描画 → 自動で `refresh` 相当を呼ぶ。トグルは楽観更新+失敗ロールバック)
- `src/features/connections/ui/ConnectionsSection.tsx` -- 「カレンダー接続」欄に Google ブロックと並ぶ「端末カレンダー」ブロックを追加(未接続:接続ボタン+説明 / 拒否済み:再試行ボタン / 接続済み:「取り込むカレンダーを選ぶ」導線)
- `src/features/connections/ui/DeviceCalendarPicker.tsx` -- 新規、`GoogleCalendarPicker.tsx` と同型の一覧画面(名前・色・トグル。取り込み時刻/失敗表示は無し ── それは Story 5.3)
- `src/app/routes.tsx` -- `/connections/device/calendars` ルート追加
- `android/app/src/main/AndroidManifest.xml` -- `<uses-permission android:name="android.permission.READ_CALENDAR" />` を追加(プラグイン自体はこの宣言を持たないため必須。`WRITE_CALENDAR` は追加しない)
- `ios/App/App/Info.plist` -- `NSCalendarsUsageDescription`(iOS13-16 fallback)と `NSCalendarsFullAccessUsageDescription`(iOS17+、読み取り専用の区分が無いため full access の文言で説明)を追加。`NSCalendarsWriteOnlyAccessUsageDescription`・reminders 系キーは追加しない(書き込み・リマインダーは対象外)
- `docs/capacitor-mobile-setup.md` -- 「端末カレンダー権限」節を追記(Android は実機/エミュレータで許可ダイアログの実地確認まで可能、iOS は Info.plist 設定のみで Xcode ビルド確認は Story 5.1 と同じ理由で対象外)

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260916000000_device_calendar_support.sql` -- 新規 -- CHECK 制約拡張 + 新規 RLS ポリシー2種(AD-17)
- [x] `package.json` -- 依存追加 -- `@ebarooni/capacitor-calendar`
- [x] `src/platform/deviceCalendar.ts` -- 新規 -- 権限要求・一覧取得のブリッジ
- [x] `src/data/device-connections.ts` -- 新規 -- 接続の作成・取得
- [x] `src/data/connections.ts` -- 修正 -- `getConnection()` に `provider='google'` フィルタ追加
- [x] `src/data/device-calendars.ts` -- 新規 -- カタログ取得・選択トグル
- [x] `src/features/connections/model/useDeviceConnection.ts`, `useDeviceCalendars.ts` -- 新規
- [x] `src/features/connections/ui/ConnectionsSection.tsx` -- 修正 -- 端末カレンダーブロック追加
- [x] `src/features/connections/ui/DeviceCalendarPicker.tsx` -- 新規 -- 選択画面
- [x] `src/app/routes.tsx` -- 修正 -- `/connections/device/calendars`
- [x] `android/app/src/main/AndroidManifest.xml` -- 修正 -- `READ_CALENDAR` 権限宣言
- [x] `ios/App/App/Info.plist` -- 修正 -- カレンダー利用目的の説明文言2種
- [x] `docs/capacitor-mobile-setup.md` -- 修正 -- 端末カレンダー権限の節

**Acceptance Criteria:**
- Given 未接続, when 設定から「端末カレンダーを接続」→ OS ダイアログで許可する, then `connections(provider='device')` 行が作られる(FR19, AD-13)
- Given OS ダイアログで拒否する, when 機能を使おうとする, then 機能無効化の表示のみでアプリは落ちない(NFR13)
- Given 端末カレンダー接続済み, when 選択画面を開く, then 端末上のカレンダー一覧(名前・色)が表示され個別にオン/オフできる。書き込みはすべて RLS 経由の直接 upsert で、Google 専用の `service_role` RPC は一切呼ばれない(FR19, AD-17)
- Given 候補をオンにする, when 選択が完了する, then `calendars(source='device')` 行が最下位優先度で作られ、Epic 2 の並び・選抜にそのまま乗る(FR19)
- Given 候補をオフにする, when 選択解除する, then 対応する `calendars` 行が論理削除される
- Given Google 接続と端末カレンダー接続の両方がある, when `getConnection()`(Google 用)を呼ぶ, then device 接続に惑わされず Google の接続だけを返す

## Implementation Notes

- **`getDeviceConnection()` の型**: spec の Code Map は `Connection` 型の再利用を示唆していたが、Google 用 `Connection`(`provider:'google'`, `googleEmail` 必須)をそのまま流用すると型が合わないため、`device-connections.ts` に専用の `DeviceConnection`(`id`/`provider:'device'`/`createdAt`)を新設した。中身の対応関係は Google 版と1対1。
- **`ConnectionsSection.test.tsx` の修正**: Google ブロックと端末ブロックが並んだことで「ログインして接続」ボタン等が重複するようになったため、既存テストのクエリを `getAllByRole` 等へ調整(挙動確認の意味は変えていない)。
- **検証結果(orchestrator による独立再実行)**: `npm run typecheck`(0 errors)/ `npm run lint`(0 errors)/ `npm test`(72 files, **495 tests**, all green)/ `npm run build`(成功)。I/O & Edge-Case Matrix の6行すべてに対応するテストの存在と green を個別に確認。マイグレーション本体は Docker 未導入のためローカル適用未確認(Story 3.x 以来の既知の制約、`docs/testing-and-verification.md` 参照)。CHECK 制約名(`<table>_<column>_check`)は PostgreSQL の既定命名規則どおりで実装上は妥当だが、実 DB 適用時に名前の不一致が無いか確認が要る。
- **レビュー(patch 14件)適用後の再検証**: `## Review Triage Log` の high 1件・medium 3件・low 10件をすべて patch として実装エージェントへ再送し、修正を確認。最重要だった「端末側の権限取り消しで全選択が消える」問題(iOS の `listCalendars()` が権限失効時に例外を投げず空配列を返す仕様に起因)と、将来の接続解除実装時に露出する RLS の穴(`deleted_at is null` 抜け)を解消。orchestrator 側で `npm run typecheck`(0 errors)/ `lint`(0 errors)/ `test`(**73 files, 508 tests, all green**)/ `build`(成功)を独立に再実行し確認。空配列ガード・RLS修正の2箇所は実ファイルを直接読んで実装内容も確認済み。`checkDeviceCalendarPermission` 未使用の指摘は false(悪影響なし、将来利用のため意図的に用意)と判定、コード変更はしていない。

## Spec Change Log

## Review Triage Log

1. **high** — `refreshDeviceCalendarCatalog` が `listDeviceCalendars()` の結果が空配列(0件)のとき「全カレンダーが端末から消えた」と解釈し、既存の選択済み `connection_calendars`/`calendars` 行を全部論理削除してしまう。プラグイン自身のドキュメントに「iOS では権限が失効すると `listCalendars` は空配列を返す(reject しない)」と明記されており、ユーザーが後から端末設定でカレンダー権限を取り消す(ごく普通の操作)→ 選択画面を開く、という現実的な経路で全選択が消える。edge-case-hunter が確認。→ patch
2. **medium** — `connection_calendars_insert_device`/`connection_calendars_update_device` の RLS ポリシーの EXISTS 条件が `connections.deleted_at is null` を見ていない。今はまだ device 接続の解除(deleted_at セット)を実装するコードが無いため未露出だが、Story 5.3 で接続解除を実装した瞬間、解除済み device 接続にぶら下がる `connection_calendars` への書き込みが RLS 的に通ってしまう抜け穴になる。blind-hunter と edge-case-hunter が独立に同じ箇所を指摘。→ patch(今のうちに閉じる)
3. **medium** — `setDeviceCalendarSelected` が `connection_calendars` を検索するクエリ(`.eq('connection_id',...).eq('external_calendar_id',...)`)に `deleted_at is null` の絞り込みが無い(`selectActive` を使っていない)。UI 側は最新カタログしか出さないはずだが、リフレッシュとトグルが競合するタイミングでは、既にカタログから外れた(論理削除済みの)候補を誤って復活させ得る。edge-case-hunter が確認。→ patch
4. **medium** — `normalizeColor()` は `#RRGGBBAA`(8桁)しか特別扱いしておらず、それ以外の想定外フォーマットはそのまま `calendars.color` の `^#[0-9A-Fa-f]{6}$` CHECK 制約に生でぶつかり、素の Postgres エラーが汎用 `data/query` として表に出る。blind-hunter が確認(テストカバレッジの薄さも合わせて指摘)。→ patch
5. **low** — `DEFAULT_NAME`/`DEFAULT_COLOR` が `src/data/device-calendars.ts` に定義されているのに `DeviceCalendarPicker.tsx` 側で同じ値をベタ書きで重複させている。片方だけ直して片方直し忘れるリスク。blind-hunter が確認。→ patch(定数を export して import)
6. **low** — `connectDevice()` が既存の有効な device 接続の有無を確認せずに INSERT するため、二重発火(ダブルタップ・複数タブ)で `connections_one_active_per_user` の一意制約違反が汎用エラーとしてユーザーに出る(「もう接続済みです」という親切な扱いにならない)。blind-hunter と edge-case-hunter が独立に確認。→ patch
7. **low** — 端末カレンダーのタイトルが100文字超、または trim 後に空文字だと `calendars.name` の CHECK 制約(`char_length(trim(name)) between 1 and 100`)に違反し、生の Postgres エラーになる。edge-case-hunter が確認。→ patch(`normalizeColor` と対の `normalizeName` を追加)
8. **low** — `useDeviceConnection.ts` の実フック(mount時フェッチ・`cancelled` ガード・`nonce` による再取得)を直接検証するテストが無い。`ConnectionsSection.test.tsx`/`DeviceCalendarPicker.test.tsx` はどちらもこのフックを丸ごとモックしており、実装ロジックはテストを一度も通っていない。verification-gap が確認(`getDeviceConnection` の応答を差し替える形の `useGoogleConnection.ts` のテストパターンとの非対称も指摘)。→ patch
9. **low** — spec の Design Notes は `setDeviceCalendarSelected` の非アトミック性(逐次呼び出しでの部分失敗リスク)にしか触れておらず、同じ問題を抱える `refreshDeviceCalendarCatalog`(upsert→SELECT→無効化→cascade削除の複数呼び出し)には触れていない。blind-hunter が確認。→ patch(Design Notes に一文追記)
10. **low** — `refreshDeviceCalendarCatalog` の「応答に無くなった候補をカタログから外す」テストが `.in('id', [...])` の呼び出し引数しか検証しておらず、`.update()` に渡した中身(`deleted_at`/`selected:false`)自体はアサートしていない(`setDeviceCalendarSelected` 側の同種テストは中身まで見ている)。blind-hunter が確認。→ patch
11. **low** — iOS の `Info.plist` の説明文言が両方「読み取り専用で使います」だが、`requestFullCalendarAccess()` が要求する OS 側の権限自体は読み書き両方を含む(iOS には読み取り専用の権限区分が無いため)。文言が「OS の権限そのものが読み取り専用」であるかのように読め、ユーザーが実際のダイアログ(読み書きの説明)と比べて混乱し得る。blind-hunter が確認。→ patch(「このアプリ自身は読み取りにしか使わない」という趣旨に文言修正)
12. **low** — 2つの端末カレンダーをほぼ同時に OFF→ON した場合、`setDeviceCalendarSelected` 内の「最下位優先度の再計算」が同じ `max(priority)` を読んでしまい、2件目の更新が `calendars_priority_uniq` に衝突して失敗し得る(TOCTOU)。Design Notes で既に受容している非アトミック性と同じ性質の問題。edge-case-hunter が確認。→ patch(Design Notes に一文追記、コード変更はしない)
13. **low** — `connection/calendars-failed`(「カレンダー一覧を取得できませんでした」)というメッセージが、`setDeviceCalendarSelected` の「トグル対象がカタログに見つからない」というケースにも流用されており、実際の状況とやや食い違う文言になっている。verification-gap が確認。→ patch(より実情に合うメッセージキーへ差し替え)
14. **low** — `Capacitor.isNativePlatform()` 相当のガードが無く、Web(PWA)ビルドでも「端末カレンダーを接続」ボタンが表示される(タップしても `@ebarooni/capacitor-calendar` の Web シムが例外を投げるだけで、`connectDevice` の try/catch でエラー表示にはなる=クラッシュはしないが、原理的に絶対に成功しない機能のボタンが Web ユーザーにも見えてしまう)。verification-gap が確認。→ patch(`src/platform/deviceCalendar.ts` に `isDeviceCalendarSupported()` を追加し `ConnectionsSection.tsx` で分岐)
15. **false** — 「`checkDeviceCalendarPermission` が定義・テストされているのにどこからも呼ばれていない」という指摘。実際に未使用であることは確認したが、具体的な悪い結果(bad outcome)が示されておらず、将来(接続前の事前権限確認等)のために意図的に用意された API 面と判断する。悪影響が無いため false として扱う。
16. **defer(pre-existing)** — `DeviceCalendarPicker` が `useAuth()` の `state==='loading'` 中に一瞬「先に接続してください」を表示してしまう(`connectionEnabled` の算出に `state==='authenticated'` を含めた上でさらに `useDeviceConnection` 内部でも同じ判定をしているため)。`GoogleCalendarPicker.tsx`/`useGoogleConnection.ts` を直接比較し、全く同じ構造を持つ既存パターンであることを確認した(このストーリーが新規に持ち込んだ回帰ではない)。Google 側と合わせて別途直すべき。
17. **defer(pre-existing)** — `useDeviceCalendars.ts` の `reloadCatalog()` が初回読み込み失敗時に `errorKey` をセットしない(直後に呼ばれる `refresh()` が成功すれば自己修復するが、一瞬「空のカタログ・エラー無し」の状態になり得る)。`useGoogleCalendars.ts` の `reloadCatalog()` と同一実装であることを確認済み(既存パターンの踏襲)。
18. **defer(pre-existing)** — `useDeviceCalendars.ts` の `toggle()`/`refresh()` は mount 時の effect にしか `cancelled` ガードが無く、処理中にアンマウントされた場合の setState 防止が無い。`useGoogleCalendars.ts` と同一実装であることを確認済み(既存パターンの踏襲)。

## Design Notes

**選択トグルのアトミック性についての判断**: Google 版(`set_google_calendar_selection`)は1つの `security definer` RPC で「`calendars` 行の作成/復活 + 優先度再採番 + `connection_calendars` 更新」を1トランザクションにしていた。AD-17 はこのパターンを device に流用することを明示的に禁止しているため、本ストーリーでは同じ手順を2〜3回の逐次クライアント呼び出しに分解する。途中で失敗する(オフライン等)と `calendars` 行だけ作られて `connection_calendars.selected` が更新されない、という不整合が理論上起き得るが、個人利用規模ではトグルをもう一度押せば収束する(次回の `refreshDeviceCalendarCatalog` が実データと突き合わせて是正する)ため許容する。`refreshDeviceCalendarCatalog` 自体も同じ理由で非アトミックである(upsert → SELECT → カタログ無効化 → 紐づく `calendars` の cascade 論理削除、という複数回の逐次呼び出しに分かれており、途中で失敗すると一部だけ反映された中間状態が残り得る)が、次回の再取得か手動リフレッシュで実データと突き合わせて是正される範囲なので同様に許容する。また、2つの端末カレンダーをほぼ同時に選択(OFF→ON)すると、それぞれの `setDeviceCalendarSelected` 呼び出しが同じ `max(priority)` を読んでしまい、後勝ちの更新が `calendars_priority_uniq` の一意制約に衝突して失敗する TOCTOU が理論上起き得る(個人利用規模でほぼ同時に2箇所を操作する頻度は低く、失敗時はトグルをもう一度押せば収束するため、これも同じ考え方で許容する)。

**iOS の権限区分について**: `@ebarooni/capacitor-calendar` の `requestReadOnlyCalendarAccess()` は Android 専用(iOS には読み取り専用という権限区分が存在しない)。iOS は `requestFullCalendarAccess()` を使うしかないが、アプリのコード自体は書き込み系 API(`createCalendar`/`modifyCalendar`/`deleteCalendar` 等)を一切呼ばないため、実際の挙動としての「読み取り専用」原則(AD-13, NFR13)は保たれる。OS の権限ダイアログの文言が Android と iOS で異なる(iOS は「読み書き」の説明になる)点は、iOS 側の制約として `docs/capacitor-mobile-setup.md` に記録する。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 errors
- `npm run lint` -- expected: 0 errors
- `npm test` -- expected: 既存 + 新規テストすべて green
- `npm run build` -- expected: 成功

**Manual checks (if no CLI):**
- `npx supabase db push`(または `db diff` で確認)でマイグレーションを適用し、`connections`/`calendars`/`events` に `'device'` を insert できることを SQL で確認
- Android エミュレータ(`Pixel_7_API_36`)で「端末カレンダーを接続」→ 権限ダイアログ→許可→端末のカレンダー(通常は「バースデー」等が最低1つ存在)が一覧に出ることを確認。トグル ON/OFF でカレンダー管理画面に device 行が出入りすることを確認
- iOS は Info.plist 設定のみ、Xcode ビルド確認は Story 5.1 と同じく対象外(Mac 確保後のフォローアップに合流)
