---
title: 'Story 1.7: データの JSON エクスポート'
type: 'feature'
created: '2026-09-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '803304d18955b4fa724971647df7cef7008fe33a'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-6-pwa-and-offline.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 自分の予定データをアプリの外に持ち出す手段がない。バックアップも他ツールへの移行もできず、囲い込みになる。

**Approach:** 設定画面に「JSON でエクスポート」を置き、ローカルで作成したカレンダーと予定を1つの JSON ファイルとしてダウンロードさせる。データ取得は既存の `listCalendars` / `listEvents`(オフラインはキャッシュにフォールバック)を使い、`source === 'local'` だけを含める。

## Boundaries & Constraints

**Always:**
- エクスポート対象: `source === 'local'` かつ削除されていないカレンダーと予定のみ。自動作成の「シフト」カレンダーとその予定も含む(ローカルデータのため)。
- 取り込んだ外部予定(`source === 'google'`)は**含めない**。お気に入りシフトのテンプレは Epic 4 で同じバンドルに追加する(このストーリーでは対象外)。
- バンドル形: `{ app: 'calendar-app', schemaVersion: 1, exportedAt: <UTC ISO>, calendars: Calendar[], events: EventItem[] }`。キーは camelCase(アプリの TS 型そのまま)。`calendars` は `createdAt` 昇順、`events` は `startsAt ?? eventDate` 昇順で安定ソート。
- ファイル名: `calendar-app-export-YYYY-MM-DD.json`(ローカル日付)。MIME `application/json`、UTF-8、2スペース整形。
- ダウンロードは `Blob` + `URL.createObjectURL` + 一時 `<a download>` クリック + `revokeObjectURL`(`src/lib/download.ts`)。
- 取得は `buildExportBundle()`(`src/data/export.ts`)で `Result<ExportBundle>` を返す。`listCalendars` / `listEvents` のどちらかが `err` ならエクスポートせず、その `messageKey` を表示する。
- オフラインでもエクスポートできる(`listX` がキャッシュを返すため)。ゲスト(未ログイン)でも動く。
- `AuthState === 'unavailable'`(Supabase 未設定)のときはボタンを無効にし、その旨を1行表示(他の設定項目と同じ扱い)。
- 文言・44px・フォーカスリングは既存の設定画面の規約どおり。トーンは静か(体言止め、感嘆符なし)。

**Never:**
- インポート(取り込み・復元)機能。CSV / iCal など他形式。暗号化・パスワード保護。
- 外部ストレージ(Drive 等)への直接保存。共有リンクの発行。
- サーバー側のエクスポート用エンドポイント / Edge Function。すべてクライアントで組み立てる。
- `events` / `calendars` テーブル・マイグレーションの変更。`packages/core` への追加。
- シフト属性カラム(`break_minutes` 等)の出力(現状 `EventItem` 型に無い。Epic 4 で型ごと追加される)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|---|---|---|
| 通常のエクスポート | ローカルのカレンダー2件・予定3件 | それらを含む JSON がダウンロードされる。`schemaVersion: 1` |
| 外部予定が混在 | `source: 'google'` の予定あり | 外部予定は JSON に含まれない |
| 予定ゼロ | ローカル予定なし | `events: []` の JSON がダウンロードされる(エラーにしない) |
| オフライン | `navigator.onLine === false`、キャッシュあり | キャッシュのローカルデータでエクスポートできる |
| 取得失敗 | `listEvents` が `data/query` を返す | ダウンロードせず、日本語メッセージを表示 |
| Supabase 未設定 | env なし | ボタンは無効、「Supabase を設定すると…」の1行 |

</frozen-after-approval>

## Open Questions

*(なし)*

## Code Map

- `src/features/settings/ui/SettingsScreen.tsx` -- 末尾のプレースホルダ `<p>` を `<DataSection />` に差し替え。
- `src/features/settings/ui/AccountSection.tsx` -- `<section>` + 見出し + `rounded-md border ... bg-surface-raised` の作りの手本。`useAuth().state` の分岐も。
- `src/data/calendars.ts` -- `listCalendars()` / `Calendar` 型。変更しない。
- `src/data/events.ts` -- `listEvents()` / `EventItem` 型。変更しない。
- `src/data/result.ts` -- `Result` / `ok` / `err` / `appError`。
- `src/data/messages.ts` -- 既存キーで足りる(`data/query` など)。必要なら `export/empty` 等は足さない方針(空でも成功)。
- `src/lib/datetime.ts` -- `todayLocalDate()` をファイル名に使う。
- `src/app/auth-context.ts` -- `useAuth().state` で `unavailable` 判定。
- `src/test/setup.ts` -- jsdom に `URL.createObjectURL` が無いのでテストでは `src/lib/download.ts` をモックする。

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/download.ts` + `.test.ts` -- `downloadJson(filename, data)`。Blob(2スペース整形, `application/json`)+ objectURL + 一時 `<a>` クリック + `revokeObjectURL`
- [x] `src/data/export.ts` + `.test.ts` -- `ExportBundle` 型 + `buildExportBundle(): Promise<Result<ExportBundle>>`。`listCalendars`/`listEvents` を呼び、`source==='local'` かつ書き出すカレンダーに属す予定に絞り、安定ソートして整形
- [x] `src/data/messages.ts` -- `export/failed` を追加(ダウンロード自体の失敗用)
- [x] `src/features/settings/ui/DataSection.tsx` + `.test.tsx` -- 「データ」セクション + エクスポートボタン。`buildExportBundle` → 成功で `downloadJson`(try/catch)、失敗で `resolveMessage`。`unavailable` は無効表示
- [x] `src/features/settings/ui/SettingsScreen.tsx` -- プレースホルダ `<p>` を `<DataSection />` に差し替え(残る `<p>` は「カレンダー接続は後続」に短縮)

**Acceptance Criteria:**
- Given ローカルのカレンダーと予定がある, when エクスポートを実行, then `downloadJson` が `calendar-app-export-<今日>.json` と `{app,schemaVersion:1,exportedAt,calendars,events}` で呼ばれる
- Given `source: 'google'` の予定が混ざっている, when エクスポート, then その予定はバンドルの `events` に含まれない
- Given `listEvents` が `err(data/query)`, when エクスポート, then `downloadJson` は呼ばれず、日本語メッセージが表示される
- Given `AuthState === 'unavailable'`, when 設定画面を開く, then エクスポートボタンは無効で、その旨の1行が出る
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- **予定はカレンダー所属で絞る(レビューでの精緻化)**: `source==='local'` に加え、`calendarId` が書き出すカレンダー集合に含まれる予定だけを出す。カレンダーを論理削除すると予定は `deleted_at` が立たず `listEvents` に残るため(削除は非カスケード)、そのまま出すとバンドルに宙ぶらりんの参照が入る。UI 上は所属カレンダー削除でその予定も見えなくなっているので、バンドルもそれに揃える。
- **`downloadJson` は try/catch で包む**: `URL.createObjectURL` 等が例外を投げた場合に `export/failed` を表示。`buildExportBundle` は `Result` なので安全、ダウンロード段だけが throw しうる。
- **データ取得は `listX` 再利用**: オフライン/障害時のキャッシュフォールバック(Story 1.6)をそのまま使う。`export.ts` の責務はバンドル整形のみ。
- **シフト属性は現状出ない**: `EventItem` 型・`COLUMNS` にシフト属性(`break_minutes` 等)が無いため。Epic 4 で型に追加されれば自動的にバンドルへ入る。
- **未検証**: 実ブラウザでのダウンロード挙動(`npm run dev` でユーザー確認)。ロジックは 175 tests。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run lint` -- エラー0
- `npm run test` -- 新規テスト含め全パス
- `npm run build` -- 成功

**Manual checks:**
- `npm run dev`(Supabase 接続時): 設定 → エクスポート → ダウンロードされた JSON を開き、ローカルのカレンダー/予定が入っていること、外部予定(あれば)が入っていないことを確認。DevTools を Offline にしても同様にダウンロードできること。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=5。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| バンドルに、論理削除されたカレンダーの取り残し予定(宙ぶらりんの `calendarId`)が入り得る | `deleteCalendar` は非カスケード、`listEvents` は該当予定を返し続ける | medium | patch: `events` を「`source==='local'` かつ `calendarId` が書き出すカレンダーに含まれる」で絞る + テスト追加 |
| `downloadJson` の例外(`URL.createObjectURL` 失敗等)が `onExport` の外に漏れる(`void onExport()` で未処理) | `onExport` に try/catch なし | low | patch: `downloadJson` を try/catch で包み `export/failed` を表示。`messages.ts` に `export/failed` を追加 |
| `src/lib/download.ts` に直接テストが無い(DataSection がモックするため) | glue コードだが Blob type / revoke / 後始末は検証価値あり | low | patch: `download.test.ts` 追加(`URL` スタブ + `HTMLAnchorElement.click` スパイ) |
| `revokeObjectURL` を `click()` 直後に同期呼び出し(一部の古いブラウザでダウンロード競合の指摘あり) | モダンブラウザは同期 revoke で問題なし | low | reject(対象はモダンブラウザ。`setTimeout` 遅延 revoke は複雑さに見合わない) |
| 同日2回エクスポートするとファイル名が同じ(ブラウザが ` (1)` を付ける) | 仕様が `YYYY-MM-DD` を明記 | — | reject(frozen 仕様どおり。ブラウザ側で解決) |
| `SettingsScreen` が `DataSection` を出すことの明示的アサートが無い | `shell.test` は /settings を開くが unavailable 分岐 | low | reject(DataSection.test で単体カバー、typecheck で配線確認、fix は薄い) |

## Spec Change Log

*(なし。bad_spec ループバックなし。)*

## Design Notes

- **なぜ `listX` 経由でキャッシュ取得を再利用するか**: Story 1.6 で `listCalendars`/`listEvents` はオフライン時にキャッシュを返すようになった。エクスポート専用のデータ取得を書くと、その分岐(オフライン・障害フォールバック)を二重に持つことになる。バンドル整形だけを `export.ts` の責務にする。
- **`schemaVersion`**: 将来 Epic 4 でシフトテンプレを足す・型が変わるときに、読み手(将来のインポートや外部ツール)がバージョン分岐できるよう最初から付ける。
