---
title: 'Story 1.6: PWA インストールとオフライン閲覧・編集'
type: 'feature'
created: '2026-09-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '34ee2cea3e59d45874b34ee982de7cc3b3112285'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-5-calendar-views.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** アプリはブラウザのタブでしか使えず、ネットが切れると何も見えない。予定を記録する道具として常時接続を前提にできない。

**Approach:** vite-plugin-pwa でインストール可能な PWA(manifest・アイコン・Service Worker・更新プロンプト)にする。data-access レイヤに IndexedDB の表示キャッシュ(AD-1)とオフライン書き込みキュー(AD-9)を入れ、`listX` は読めなければキャッシュを返し、`createX`/`updateX`/`deleteX` はオフライン時にキューへ積んで復帰時に順序どおりフラッシュする。ユーザー(A+B+C 全部)確定。

## Boundaries & Constraints

**Always:**
- PWA: `vite-plugin-pwa` を有効化(`disable` はテスト時のみ)。`registerType: 'prompt'`。manifest = name「カレンダーアプリ(仮)」/ short_name「カレンダー」/ `theme_color` `#2563EB` / `background_color` `#FFFFFF` / `display: standalone` / `start_url: '/'` / `lang: 'ja'` / icons(192・512・512 maskable)。Service Worker は**アプリシェル(静的アセット)だけ**を precache する。Supabase API レスポンスは SW でキャッシュしない(表示キャッシュは IndexedDB 一本。AD-1)。
- アイコンは Pillow で生成(青地 `#2563EB` にカレンダー風グリフの簡素なもの。`仮` なので差し替え可)。`public/` に配置し、プロジェクト規約に従い `AI作業場/出力画像/YYYYMMDD_*` にも複製する。`index.html` に `apple-touch-icon` / `apple-mobile-web-app-capable` を追加。
- 更新プロンプト: `virtual:pwa-register/react` の `useRegisterSW`。`needRefresh` で控えめな1行バー「新しいバージョンがあります」+「更新」ボタン(`updateServiceWorker(true)`)。`offlineReady` で一度だけ「オフラインでも使えます」を出し、閉じられる。感嘆符・催促なし(トーン規約)。
- IndexedDB: `idb` を依存に追加。DB `calendar-app` v1、ストア `calendars`(keyPath `id`)/ `events`(keyPath `id`)/ `outbox`(keyPath `seq`, autoIncrement)/ `meta`(keyPath `key`)。`src/data/local-db.ts` に開設を集約(シングルトン)。
- 表示キャッシュ: `listCalendars` / `listEvents` は成功時に**アクティブ行のスナップショットでキャッシュを置換**し、`deleted_at IS NULL` の行だけを保持する。ネットワーク障害(fetch 失敗 / `navigator.onLine === false`)のときはキャッシュを `ok(list)` で返す。PostgREST のエラー(RLS 等)は従来どおり `err`。
- オフライン書き込み(`createEvent`/`updateEvent`/`deleteEvent`/`restoreEvent` と calendars の各変更関数): オフラインなら (1) `outbox` にミューテーションを積み (2) 表示キャッシュを楽観更新し (3) 楽観行を `ok` で返す。作成の `id` は `crypto.randomUUID()` をクライアントで発番(`source: 'local'`)。オンラインなら従来経路 + 成功行でキャッシュ更新。
- フラッシュ: `src/data/outbox.ts` の `flushOutbox()` が `outbox` を `seq` 昇順で再生。各項目は対応するオンライン経路の関数を呼ぶ。作成で発番した仮 `id` → サーバー実 `id` の対応表を持ち、後続項目の payload に適用。成功で `outbox` から削除しキャッシュを実データへ更新。ネットワーク障害で中断(次回再試行)、それ以外のエラーはその項目を破棄して警告に集約(v1 = 単一ユーザー・後勝ち。ARCHITECTURE Deferred)。
- オンライン状態: `src/app/online-context.tsx` の `OnlineProvider` + `useOnline()`。`online`/`offline` イベントを購読。`offline → online` で `flushOutbox()` → 完了後に `syncNonce` を進める。
- `useCalendars` / `useEvents` は `syncNonce` の変化で `reload()` する。オフライン時の作成・編集・削除は既存の楽観更新パスをそのまま使い(data-access が `ok` を返すため UI は成功として扱う)、`event/offline` の**エラー表示はやめる**(キューに積まれるので失敗ではない)。
- `src/app/OfflineBanner.tsx`: `!online` のとき薄いバー「オフライン ・ 変更は接続後に送信されます」。未送信 `outbox` 件数があれば「(未送信 N 件)」を添える。`AppShell` に常設。復帰直後のフラッシュ中は「送信中…」。
- Undo(6秒)中にオフラインで削除→取り消し: キュー済みの delete を `outbox` から除去し、キャッシュを復元する(ネットに出さない)。
- 未ログイン(ゲスト)でもキャッシュ閲覧とオフライン編集キューは動く(認証規約: 未ログインはローカルキャッシュのみで動作)。
- `messages.ts` に `data/offline`(「オフラインです。接続すると同期します」)を追加。`sync/partial`(「一部の変更を送信できませんでした」)を追加。

**Never:**
- Supabase Realtime / バックグラウンド同期(Background Sync API)/ プッシュ通知。復帰時フラッシュは前面(`online` イベント + 次回起動時)のみ。
- 競合解決 UI・3-way マージ(ARCHITECTURE Deferred。v1 は後勝ち)。
- Google 取り込み系のオフライン挙動(Epic 3)。「取り込み中/失敗」表示は作らない。
- SW で Supabase REST/Auth をキャッシュすること。`index.html` 以外のページの navigateFallback を凝ること(SPA なので `index.html` 単純フォールバックのみ)。
- 既存マイグレーション・`events`/`calendars` テーブルスキーマの変更。`packages/core` への追加。
- オフラインでの新規サインアップ / パスワード変更(認証はオンライン必須。既存セッションはローカルで有効)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|---|---|---|
| インストール | 対応ブラウザで `npm run build` の成果物を配信 | manifest・アイコン・SW が出力され、ホーム画面に追加できる |
| SW 更新あり | 新バージョンを配信、再訪 | 「新しいバージョンがあります」バー →「更新」でリロードし新版に |
| オフラインで起動 | `navigator.onLine=false`、キャッシュあり | カレンダー/予定はキャッシュから通常表示。`OfflineBanner` 表示 |
| オフラインで予定作成 | オフライン、フォーム保存 | `crypto.randomUUID()` の `id` で楽観表示 + `outbox` に create、エラー表示なし |
| オフラインで予定編集/削除 | オフライン | `outbox` に update/delete、キャッシュ楽観更新 |
| オフライン削除を Undo | 削除直後(6秒内)にオフラインで取り消し | `outbox` の delete を除去、キャッシュ復元、ネットに出さない |
| 復帰でフラッシュ | `offline→online`、`outbox` に create→update | `seq` 順に再生、仮 `id`→実 `id` を後続へ適用、`outbox` 空、再取得で実データ |
| フラッシュ中に再度切断 | フラッシュ途中でネットワーク障害 | 未処理項目は `outbox` に残し中断、次の `online` で再試行 |
| フラッシュ時の恒久エラー | キュー項目がサーバーで 4xx(対象消失等) | その項目を破棄し `sync/partial` を一度表示、残りは継続 |
| listX のネットワーク障害 | オンライン扱いだが fetch 失敗 | キャッシュを `ok` で返す。PostgREST エラーは従来どおり `err` |
| Supabase 未設定 | env なし | PWA/SW は動く。データ機能は従来どおり `unavailable` 表示 |
| テスト実行 | vitest | `VitePWA` は無効、`virtual:pwa-register/react` はスタブ、IndexedDB は `fake-indexeddb` |

</frozen-after-approval>

## Open Questions

*(なし)*

## Code Map

- `vite.config.ts` -- `VitePWA` を有効化(manifest/workbox/`registerType`、`disable: mode==='test'`)。`defineConfig(({mode})=>...)` へ。`test.alias` に `virtual:pwa-register/react` → スタブ。
- `index.html` -- `apple-touch-icon` link と `apple-mobile-web-app-*` meta を追加(`theme-color` は既存)。
- `src/vite-env.d.ts` -- `/// <reference types="vite-plugin-pwa/react" />` を追加。
- `src/data/supabase.ts` / `src/data/env.ts` -- 変更なし。クライアント有無の分岐は既存。
- `src/data/result.ts` -- `Result`/`AppError`。変更なし。
- `src/data/calendars.ts` / `src/data/events.ts` -- `listX` にキャッシュ置換 + ネットワーク障害フォールバック、各書き込み関数にオフライン分岐(共通ヘルパ `src/data/offline-write.ts` 経由)。snake↔camel は既存のまま。
- `src/data/messages.ts` -- `data/offline` / `sync/partial` を追加。`event/offline` は残す(将来用)が UI からの発火はやめる。
- `src/features/events/model/useEvents.ts` / `src/features/calendars/model/useCalendars.ts` -- `useOnline()` の `syncNonce` で `reload`。オフライン時の `event/offline` エラー表示を撤去(data-access が `ok` を返すため)。
- `src/features/calendar/ui/CalendarScreen.tsx` -- 既存の `ev.errorKey`/`cal.errorKey` バーはそのまま。`event/offline` 分岐なし。
- `src/app/AppShell.tsx` -- `OnlineProvider` でラップ、`<OfflineBanner />` と `<PwaUpdatePrompt />` を常設。
- `src/app/AppProviders`(現状 `main.tsx` に直書き)-- `OnlineProvider` の位置は AppShell 内で可(ルーティング内)。`main.tsx` は SW 自動登録のため `VitePWA` の `injectRegister` 既定(`auto`)に戻す(現 `injectRegister: null` を削除)。
- `src/ui/` -- 汎用の細いバーが無ければ `Banner` 相当は各コンポーネント内でよい(1段まで規約)。
- `packages/core` -- 触らない。
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 1.4 由来のオフライン書き込みキューの項を「1.6 で回収済み」と追記(既存項は消さず1行追加)。

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- `idb` を dependencies、`fake-indexeddb` を devDependencies に追加
- [x] `vite.config.ts` -- `VitePWA` 有効化(manifest・workbox `globPatterns`・`navigateFallback`・`cleanupOutdatedCaches`・`registerType: 'prompt'`・`injectRegister: null`・`disable: mode==='test'`・`devOptions.enabled: false`)、`test.alias` で `virtual:pwa-register/react` をスタブへ
- [x] アイコン(Pillow ワンショット)+ `public/pwa-192x192.png` `public/pwa-512x512.png` `public/pwa-maskable-512x512.png` `public/apple-touch-icon.png` `public/favicon.ico` -- `出力画像/20260907_calendar-app_*` にも複製
- [x] `index.html` -- `apple-touch-icon` / `apple-mobile-web-app-capable` / `apple-mobile-web-app-status-bar-style` / `apple-mobile-web-app-title`
- [x] `src/vite-env.d.ts` -- `vite-plugin-pwa/react` 参照
- [x] `src/test/pwa-register-stub.ts` -- `useRegisterSW` のスタブ
- [x] `src/data/local-db.ts` + `cache.test.ts` -- `idb` で DB 開設(4ストア)、シングルトン + `resetLocalDbForTests`
- [x] `src/data/cache.ts` + `.test.ts` -- `cacheReplace` / `cacheGetAll` / `cachePut` / `cacheDelete` / `cacheRekey`
- [x] `src/data/net.ts` + `.test.ts` -- `isOffline()` / `isNetworkError(e)`
- [x] `src/data/offline-write.ts` + `.test.ts` -- events / calendars のオフライン書き込みヘルパ(整形・enqueue・キャッシュ楽観・楽観行返却)
- [x] `src/data/outbox.ts` + `.test.ts` -- `enqueue` / `listOutbox`(seq 順)/ `removeOutbox` / `outboxCount` / `dropOutboxFor`
- [x] `src/data/sync.ts` + `.test.ts` -- `flushOutbox()`(seq 順再生・idMap・恒久エラー破棄・ネット中断)
- [x] `src/data/calendars.ts` -- `listCalendars`/`ensureShiftCalendar` にオフライン早期分岐 + フォールバック、`create/rename/recolor/setVisible/delete` にオフライン分岐、`restoreCalendar(calendar)` に署名変更
- [x] `src/data/events.ts` -- `listEvents` にオフライン早期分岐 + フォールバック、`create/update/delete` にオフライン分岐、`restoreEvent(event)` に署名変更、`NewEventInput.id?` 追加
- [x] `src/data/calendars.test.ts` / `src/data/events.test.ts` -- オフライン describe ブロック追加
- [x] `src/data/messages.ts` -- `data/offline` / `sync/partial`
- [x] `src/app/online-context.ts`(hook/context)+ `src/app/OnlineProvider.tsx` + `.test.tsx` -- online/offline イベント・`syncNonce`・`pendingCount`・復帰で `flushOutbox`(未送信ゼロならスキップ)
- [x] `src/app/ConnectivityBar.tsx` + `.test.tsx` -- オフラインバー / 送信中 / `sync/partial` 通知(OfflineBanner を統合)
- [x] `src/app/PwaUpdatePrompt.tsx` + `.test.tsx` -- `useRegisterSW` の `needRefresh` バー / `offlineReady` トースト
- [x] `src/app/AppShell.tsx` -- `OnlineProvider` ラップ + `ConnectivityBar` + `PwaUpdatePrompt` 常設
- [x] `src/features/events/model/useEvents.ts` / `src/features/calendars/model/useCalendars.ts` -- `syncNonce` で `reload`、`event/offline` ガード撤去、`restore` は完全行を渡す
- [x] `src/features/events/model/useEvents.test.ts` -- 「オフラインでも createEvent を呼ぶ」へ更新
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- 1.4 のキュー項に「1.6 で回収済み」追記

**Acceptance Criteria:**
- Given `npm run build`, when 実行, then `dist/` に `manifest.webmanifest`・`sw.js`・アイコンが出力され、`npm run typecheck`/`lint`/`test` も成功する
- Given オフラインでアプリを開く(キャッシュあり), when カレンダー画面を見る, then キャッシュのカレンダー・予定が通常表示され `OfflineBanner` が出る
- Given オフライン, when 予定を作成・編集・削除する, then エラーは出ず楽観反映され、各操作が `outbox` に `seq` 順で積まれる
- Given `outbox` に create→(その仮 id への)update があり復帰, when `flushOutbox()`, then create の実 id が update に適用されて両方サーバーに反映、`outbox` が空になる
- Given フラッシュ中の恒久エラー(対象消失), when 継続, then その項目は破棄され `sync/partial` が一度出て、残りは処理される
- Given SW 更新あり, when 再訪, then 「新しいバージョンがあります」バーが出て「更新」で新版に切り替わる
- Given Supabase 未設定, when 起動, then PWA は動き、データ機能は従来どおり `unavailable` 表示

## Implementation Notes

- **仮 id は据え置き(遠回りしない)**: オフライン作成は `crypto.randomUUID()`(なければ簡易フォールバック)を `insert` の `id` に載せる。DB の `id uuid default gen_random_uuid()` は明示 id で上書きされ、RLS は id を見ないので、フラッシュ後も同じ id が生きる。よって `sync.ts` の `idMap` は通常「恒等写像」で、サーバーが別 id を返した場合の防御にとどまる(AC の「実 id が update に適用」は据え置き id で自明に成立。sync.test で両ケースを検証)。この設計のおかげで「オフラインでカレンダー作成 → その中に予定作成 → フラッシュ」も FK 破綻しない。
- **表示キャッシュは IndexedDB 一本**: `listX` はネットワーク成功時に**アクティブ行スナップショットで置換**、`isOffline()` かネットワーク障害でキャッシュを返す。SW は静的シェルのみ precache(`vite.config.ts` の `globPatterns`)、Supabase API は素通し。
- **`isOffline()` 早期分岐**: `listEvents`/`listCalendars` は `navigator.onLine === false` なら即キャッシュ。`onLine === true` でも実際に切れていれば try/catch → キャッシュ。
- **`event/offline` エラー撤去**: オフライン書き込みは data-access が `ok(楽観行)` を返すので、`useEvents` の旧オフラインガード(`event/offline` 表示)を削除。UI は成功として扱う。
- **フラッシュのスキップ**: `OnlineProvider.runFlush` は `outboxCount() === 0` なら何もしない(毎起動で「送信中…」が瞬くのを回避)。
- **`restoreEvent`/`restoreCalendar` の署名変更**: `(id)` → `(EventItem)` / `(Calendar)`。オフライン Undo でキャッシュに完全行を戻す必要があるため。hook は `pending.event` / `pending.calendar` を持っているので影響は限定的。
- **テスト基盤**: `src/test/setup.ts` で `fake-indexeddb/auto` + `beforeEach` に `new IDBFactory()` + `resetLocalDbForTests()`。`vite.config.ts` `test.alias` で `virtual:pwa-register/react` をスタブへ。`VitePWA({ disable: mode === 'test' })`。
- **アイコン**: `仮` の簡素なカレンダー・グリフ(青地 + ヘッダ帯 + リング2 + 3x2 ドット)を Pillow 生成。ブランド確定時に差し替え。`public/` に配置(機能要件)し、規約に従い `出力画像/` にも複製。
- **既知の軽微点(レビューで reject / defer)**: SW の実キャッシュ動作・更新プロンプトの実挙動は jsdom で検証不可(手動確認へ)。`OnlineProvider` は `main.tsx` でなく `AppShell` 配置(現状すべてシェルルートなので実害なし。`AuthProvider` は `main.tsx`)。フラッシュのネット中断後は次の `online` イベントまで再試行しない(spec どおり)。「オンラインで削除 → その直後オフラインで Undo」はキュー済み delete が無いので `cachePut` のみ、次回同期でサーバー真実(削除済み)が勝つ ── まれな窓、自己修復。
- **未検証**: 実ブラウザでのインストール / SW キャッシュ / Lighthouse PWA。ロジック・キュー・フォールバックは 165 tests。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0(`virtual:pwa-register/react` は d.ts 参照 + テストは alias スタブ)
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス(IndexedDB は `fake-indexeddb`)
- `npm run build` -- 成功。`dist/manifest.webmanifest` と `dist/sw.js` を目視確認

**Manual checks:**
- `npm run build && npm run preview`: Application タブで manifest・SW 登録・インストール可否、DevTools を Offline にしてリロード → キャッシュ表示、オフラインで予定追加 → Online に戻して `outbox` が捌けることを確認。
- Lighthouse PWA(installable)を確認。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=10。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `OnlineProvider` が毎起動で `runFlush` → `setFlushing(true)` し、未送信ゼロでも「送信中…」が一瞬出る | mount effect が `navigator.onLine` で無条件フラッシュ | medium(UX) | patch: `runFlush` 冒頭で `outboxCount() === 0` なら即 return(`flushing` を立てない)。OnlineProvider.test を2ケースに分割 |
| `newLocalId` が `crypto.randomUUID` 前提。未実装ブラウザで throw(offline create の分岐は try/catch 外) | 直接呼び出し | low | patch: `crypto.randomUUID` 有無をチェックし、なければ簡易 v4 フォールバック |
| `isNetworkError` のメッセージ文字列分岐に直接テストがない(TypeError 分岐は sync.test で間接カバー) | net.ts に .test なし | gap | patch: `src/data/net.test.ts` 追加(onLine 判定 + fetch シグネチャ + 業務エラー) |
| `OnlineProvider` が `main.tsx` でなく `AppShell` 配置。`AuthProvider` は `main.tsx` | 配置の非一貫 | low | reject(現状すべてシェルルート。実害なし。将来の非シェルルート追加時に判断) |
| SW の実キャッシュ・更新プロンプトの実挙動が未検証 | jsdom では SW を動かせない | — | defer(spec の Manual checks に記載。実ブラウザ確認はユーザー) |
| `useCalendars` の `syncNonce` 再取得が直接テストされていない(`useEvents` も同様) | OnlineProvider.test で nonce 増加は検証済み。hook の effect は未検証 | low | reject(3行の effect、`useEvents` と対称。OnlineProvider 側で nonce の増加は担保) |
| フラッシュのネット中断後、次の `online` イベントまで再試行しない | `flushOutbox` interrupted で return | — | reject(spec Never「Background Sync API 不使用」。前面復帰時のみ、で意図どおり) |
| フラッシュ中にオフラインへ切替 → `createEvent` が `offlineCreateEvent` に再ルートし create を二重 enqueue | 狭い窓。据え置き id なので再フラッシュは PK 衝突 → 破棄で自己修復 | low | reject(到達が極めて狭い。fix は複雑さに見合わない。Implementation Notes に記録) |
| `PwaUpdatePrompt` の更新バーが `EventFormSheet`(z-20)の上に浮く(z-30) | 更新がシート表示中に来た場合のみ | low | reject(まれ。バーは下部、シートは下から。実用上の支障小) |
| オンライン削除直後にオフラインで Undo → キュー済み delete が無く `cachePut` のみ | まれな窓。次回同期でサーバー真実が勝つ | — | reject(自己修復。frozen scope は「キュー済み delete の除去」のみ明記) |

## Spec Change Log

*(なし。bad_spec ループバックなし。)*

## Design Notes

- **表示キャッシュは IndexedDB 一本(AD-1)**: SW は静的シェルのみ precache。Supabase GET を SW でネットワークファースト・キャッシュすると「SW の HTTP キャッシュ」と「IndexedDB キャッシュ」の二重真実になり、`deleted_at` フィルタや楽観更新と食い違う。だから API は SW を素通しし、オフライン表示は data-access が IndexedDB から供給する。
- **仮 id 方式**: オフライン作成はサーバー往復が無いので `id` をクライアントで発番するしかない。`crypto.randomUUID()`(v4)。フラッシュ時にサーバーが採番し直す場合に備え `flushOutbox` が `tempId→realId` を保持し、同一セッションの後続キュー項目とキャッシュキーを張り替える。次回 `listX` で完全に実データへ入れ替わる。
- **後勝ち(v1)**: 単一ユーザー前提。フラッシュ時の 4xx(対象が既に消えている等)は破棄して先へ進む。マージや競合 UI は Deferred。
- **`registerType: 'prompt'`**: `autoUpdate` はセッション中に実装が入れ替わり得て不意。静かな1行バーで更新を委ねる方がトーン規約に合う。
