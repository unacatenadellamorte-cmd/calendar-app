---
title: 'Capacitor 基盤とネイティブプロジェクトの追加'
type: 'feature'
created: '2026-09-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'aaffe44073a5ed5085c6037f594f224433868472'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Web PWA(Epic 1〜4)はブラウザの制約上、ホーム画面ウィジェット・端末カレンダー取り込み・ネイティブ通知を提供できない。Epic 5 の残り5ストーリー(5.2〜5.6)は、既存 SPA をネイティブアプリとしてラップした基盤の上に乗る。

**Approach:** `@capacitor/core` 8.5.1 で既存 SPA をラップし、`ios/` / `android/` ネイティブプロジェクトを追加する。プロダクト識別子を暫定 `jp.ryo.calendarapp` に設定。ディープリンクスキーム `calendar-app://`(`event/{id}` と `day/{date}` の2形式)を OS 側に登録し、`src/app` に受け口を実装して既存のカレンダー画面・予定詳細へ遷移させる。

## Boundaries & Constraints

**Always:** 既存の `src/`, `packages/core` は無変更のままラップする(AD-11)。`capacitor.config.ts` の `appId`・App Group ID・URL スキームはすべて暫定識別子 `jp.ryo.calendarapp` から導出する(AD-18)。ディープリンクの受け口は `src/app` に1箇所だけ実装する(AD-16)。開発用の暫定署名(iOS: 自動管理証明書 / Android: デバッグ鍵)でビルドが通ることまでを本ストーリーのゴールとする。

**Never:** ウィジェット・端末カレンダー・通知そのものの実装はしない(5.2 以降)。ストア提出・正式な署名鍵の準備はしない(Deferred)。

**Decision(Open Question 回答、2026-09-12):** この開発環境は Windows のため iOS(Xcode)のビルド確認は不可能。Mac 環境の有無が未確認のため、安全側に倒して **Android のみこのストーリーでビルド・エミュレータ確認まで完了させる**。`ios/` ディレクトリの雛形生成・`Info.plist` の URL スキーム登録はコードとして用意する(害がなく、後戻り不要な作業のため)が、Xcode でのビルド確認は Mac 環境が確認でき次第のフォローアップに回す。Ryo が実際に Mac を使える場合は、このフォローアップを次のストーリー着手前に短時間で消化できる。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 予定へのディープリンク(存在するID) | `calendar-app://event/{有効なUUID}` | `/calendar?event={id}` へ遷移し、その予定の詳細/編集シートが開く | N/A |
| 予定へのディープリンク(存在しないID) | `calendar-app://event/{未知のUUID}` | 統合ビュー(カレンダー画面)へ静かにフォールバック | エラー表示は出さない |
| 日付へのディープリンク | `calendar-app://day/2026-09-20` | 既存の `/calendar?date=2026-09-20` と同じ挙動でその日へ遷移 | N/A |
| 未知のスキーム/形式 | `calendar-app://unknown/xyz` | 現在の画面のまま何もしない | 静かに無視、クラッシュしない |

</frozen-after-approval>

## Code Map

- `package.json` -- ルート依存に `@capacitor/core`, `@capacitor/ios`, `@capacitor/android`, `@capacitor/app`(ディープリンク受信用)を追加
- `capacitor.config.ts` -- 新規。`appId: 'jp.ryo.calendarapp'`, `webDir: 'dist'`
- `vite.config.ts` -- `build.outDir` は既定 `dist` のままで Capacitor の `webDir` と一致するか確認するだけ、変更不要の見込み
- `src/app/routes.tsx` -- 既存の `CalendarRoute`(`?date=` のみ対応、L12-19)を拡張し `?event=<uuid>` も受け付ける
- `src/features/calendar/ui/CalendarScreen.tsx` -- `initialEventId?: string` prop を追加。`ev.events`(L38 `useEvents`)ロード後、該当 ID を探して既存の `openEdit(event)`(L77-86)を1回だけ呼ぶ副作用を追加。既存の `initialDate` prop(L26-27, L42)と同じパターンに倣う。見つからなければ何もしない(フォールバック)
- `src/platform/deepLink.ts` -- 新規。`@capacitor/app` の `App.addListener('appUrlOpen', ...)` を購読するだけの薄いラッパ(ロジックを持たない、AD-12 と同じ層分離)
- `src/app/DeepLinkListener.tsx` -- 新規。`deepLink.ts` を購読し、URL を `event/{id}` または `day/{date}` としてパースして `useNavigate()` で `/calendar?event=` または `/calendar?date=` へ遷移(AD-16 の受け口)
- `src/main.tsx` -- `<BrowserRouter>` 内、`<AppRoutes />` と並べて `<DeepLinkListener />` を追加(L1-22 参照、`AuthProvider`/`BrowserRouter` の既存構造を維持)
- `ios/`, `android/` -- `npx cap add ios` / `npx cap add android` で新規生成。生成物はそのまま、`AndroidManifest.xml` の intent-filter と `Info.plist` の `CFBundleURLSchemes` だけ手動で追記
- `docs/google-connection-setup.md` -- 参考。同種の「ユーザーが手動で行う環境準備」ドキュメントの既存スタイル。新規 `docs/capacitor-mobile-setup.md` はこれに倣う

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- Capacitor 依存追加 -- ラップの土台
- [x] `capacitor.config.ts` -- 新規作成 -- appId/webDir 設定(AD-18)
- [x] `npx cap add android` + `npx cap add ios` -- ネイティブプロジェクト追加(iOS は雛形生成のみ、ビルド確認はしない)
- [x] `android/app/src/main/AndroidManifest.xml` -- intent-filter 追加 -- ディープリンクスキーム登録(AD-16)
- [x] `ios/App/App/Info.plist` -- `CFBundleURLSchemes` 追加 -- 同上(コードとして用意するのみ、Xcode ビルド確認は対象外)
- [x] `src/platform/deepLink.ts`, `src/app/DeepLinkListener.tsx` -- 新規 -- ディープリンク受け口(AD-16)
- [x] `src/app/routes.tsx`, `src/features/calendar/ui/CalendarScreen.tsx` -- `?event=` 対応 -- 既存の `?date=` パターンを拡張
- [x] `docs/capacitor-mobile-setup.md` -- 新規 -- Ryo が手動で行う環境準備の手順書

**Acceptance Criteria:**
- Given 既存の Vite+React19 SPA, when `@capacitor/core` 導入 + `cap add android` + `cap add ios` を実行する, then 両ディレクトリが追加され appId が `jp.ryo.calendarapp` になる(iOS はビルド確認対象外)
- Given Android エミュレータ(`Pixel_7_API_36`), when ビルドして起動する, then 既存 SPA が WebView 経由で表示され Epic 1〜4 の機能が動く
- Given `calendar-app://event/{id}` のディープリンク, when 有効な ID で起動する, then 該当予定の詳細/編集シートが開く。無効な ID ならカレンダー画面へ静かにフォールバックする
- Given `calendar-app://day/{date}`, when 起動する, then 既存の `?date=` と同じ挙動でその日へ遷移する

## Implementation Notes

- **パッケージ版**: `@capacitor/core` / `@capacitor/android` / `@capacitor/ios` / `@capacitor/cli` は 8.5.2(spec 記載の 8.5.1 は 2026-09-12 時点の最新確認値で、その後 8.5.2 が出ていたため実際にインストールされたのは 8.5.2。`^8.5.1` の範囲内)。`@capacitor/app` は 8.1.1。
- **層分離**: `src/platform/deepLink.ts` は `App.addListener('appUrlOpen', ...)` を右から左に流すだけ(ロジック無し)。パースと `navigate()` は受け口 `src/app/DeepLinkListener.tsx` に1箇所だけ実装(AD-16)。5.4/5.5/5.6 はこの2ファイルを再利用する想定どおり。
- **`?event=` の扱い**: `routes.tsx` の `CalendarRoute` は `?date=` と違って `?event=` に形式チェック(正規表現)を掛けていない。存在しない/不正な ID は `CalendarScreen` 側で `ev.events.find` が見つからず、静かにフォールバックする(I/O & Edge-Case Matrix どおり)ため、ルート側での検証は不要と判断。
- **CalendarScreen のフック順序**: `initialEventId` 用の `useEffect`(`ev.loading` 完了後に1回だけ `openEdit` を呼ぶ)を追加するにあたり、`state === 'unavailable'` の早期 `return` を `openCreate`/`openEdit` 等の定義より前から後ろへ移動した(React の Rules of Hooks 順守 + `openEdit` の TDZ 参照エラー回避のため)。挙動は変わらない(既存の `unavailable` テストは無変更で green)。
- **Android ビルドで踏んだ環境の罠**(詳細は `docs/capacitor-mobile-setup.md`):
  1. `JAVA_HOME` が Android Studio 同梱 JBR(JDK 25)だと Gradle 8.14.3 が `Unsupported class file major version 69` で落ちる。JDK 21(Eclipse Adoptium)を明示的に使う必要があった。
  2. プロジェクトパスに日本語(非 ASCII)を含むため、AGP の既定のパスチェックでビルド拒否される。`android/gradle.properties` に `android.overridePathCheck=true` を追加して回避(NDK 未使用なので実害無しと判断。ネイティブコード追加時は再確認要)。
  3. `android/local.properties`(gitignore 対象)に `sdk.dir` の明記が必要だった。
- **Android 実機(エミュレータ)確認**: `Pixel_7_API_36` で Epic1〜4 の Web SPA が WebView 経由で表示されることを確認。ディープリンクは `adb shell am start -a android.intent.action.VIEW -d "calendar-app://..."` で以下を確認: `day/2026-09-20` → 週ビューがその日へ遷移、存在しない予定 ID → エラー無しで静かにフォールバック、`calendar-app://unknown/xyz`(未知の形式)→ 無反応・クラッシュ無し。「実在する予定 ID → 編集/詳細シートが開く」は端末上での手動 UI 操作(予定作成フォームの座標タップ)が不安定だったため断念し、代わりに `CalendarScreen.test.tsx` / `routes.test.tsx` の自動テストで確定的に検証した。
- **iOS**: `npx cap add ios` で雛形生成、`Info.plist` に `CFBundleURLSchemes`(`calendar-app`)を追加済み。Xcode でのビルド確認は Windows 環境のため未実施(Deferred、`docs/capacitor-mobile-setup.md` にフォローアップ手順を記載)。
- **lint 設定**: `npx cap add`/`sync` が `ios/App/App/public/`・`android/app/src/main/assets/public/` に `dist/` をコピーするため、`eslint.config.js` の `ignores` に `ios` / `android` を追加(そのままだと生成された `sw.js`/`workbox-*.js` が大量の `no-undef` 等でlintエラーになっていた)。
- **検証結果**: `npm run typecheck`(0 errors)/ `npm run lint`(0 errors, 0 warnings)/ `npm test`(68 files, 461 tests, all green。新規: `CalendarScreen.test.tsx` に4件、`routes.test.tsx` に3件、`DeepLinkListener.test.tsx` 6件、`deepLink.test.ts` 2件を追加)/ `npm run build`(成功、`dist/` 生成)すべて成功。Android は上記のとおり実機(エミュレータ)確認済み。
- **レビュー(patch 10件)適用後の再検証**: `## Review Triage Log` の high 1件・medium 1件・low 8件をすべて patch として実装エージェントへ再送し、修正を確認。最重要だった cold-launch レース(auth 解決前に `initialEventId` の一発ラッチが消費され、二度と開かない)と、id 切り替え時にラッチがリセットされない問題を `CalendarScreen.tsx` のガード条件見直しで解消。orchestrator 側で `npm run typecheck`(0 errors)/ `lint`(0 errors)/ `test`(**68 files, 465 tests, all green**)/ `build`(成功)を独立に再実行し確認。`AndroidManifest.xml`/`Info.plist`/`.gitignore` 保護に関する3件の指摘は実ファイルを直接確認し false(誤検知)と判定、コード変更はしていない。

## Spec Change Log

## Review Triage Log

1. **high** — `CalendarScreen.tsx` の `initialEventId` 用 `useEffect` が `ev.loading` だけをゲートにしており、`enabled`(auth 状態)を見ていない。cold launch(未起動からの通知/ウィジェットタップを想定)では `state==='loading'` の間 `enabled=false` のため `useEvents(false)` が `loading:false, events:[]` を即返し、`openedInitialEventRef` が本物のイベント取得前に消費されてしまい、auth 解決後も二度と開かない。edge-case-hunter が `AuthProvider`/`useEvents` のソースまで遡って確定的(確率的でなく毎回起きる)経路と確認済み。AC3(有効なIDで起動→シートが開く)を主要な実利用経路で破る。→ patch
2. **medium** — 同じ `useEffect` の `openedInitialEventRef` が真偽値ラッチで、`initialEventId` が別の値に変わってもリセットされない。アプリを開いたまま2件目以降のディープリンク(5.4/5.5/5.6 が再利用する想定の経路)が無反応になる。verification-gap と edge-case-hunter が独立に同一結論(既存テストは同一IDの再レンダーしか検証していない)。→ patch
3. **low** — 同 `useEffect` が `cal.loading` をゲートに含めていない。`ev` より `cal` のロードが遅いタイミングで google/端末カレンダー由来の予定を開くと、一時的に「不明なカレンダー」表示になる(`cal.calendars` ロード完了で自己修復)。verification-gap が実際の消費コードパス(`EventDetailSheet` のフォールバック文言)まで確認済み。→ patch
4. **low** — ディープリンクの hostname 比較が大文字小文字を区別する(`calendar-app://Event/x` のような表記ゆれを無視する)。edge-case-hunter が Node の `URL` 実装で大文字小文字が保持されることを確認済み。実害は小さいが修正は1行。→ patch
5. **low** — spec の Code Map は `src/platform/deepLink.ts` を AD-12 と同じ層分離と説明しているが、実装コードのコメントは AD-9 を引用しており不一致(直接 grep で確認)。→ patch
6. **low** — `package.json` で `@capacitor/app` だけ `^8.0.0`、他の `@capacitor/*` は `^8.5.1` で幅が揃っていない(直接確認)。実際にインストールされたのは 8.1.1。→ patch
7. **low** — frozen block の Decision で「iOS の Xcode ビルド確認は Mac 環境確保後のフォローアップに回す」と明記しているが、`deferred-work.md` に対応するエントリが無い(grep で確認、該当なし)。→ patch
8. **low** — `epic-5-context.md` の「新設レイヤ `src/platform`」の説明が `widget.ts` / `deviceCalendar.ts` / `reminders.ts` のみを挙げており、本ストーリーで実際に追加した `deepLink.ts` が抜けている(grep で確認)。→ patch
9. **low** — `docs/testing-and-verification.md`(既存の「自動テストで覆えない範囲+代償コントロール」を明文化した方針文書)に、Android Gradle/iOS Xcode のネイティブビルドが `npm test` 等の標準検証コマンドでは検知できない旨がまだ追加されていない。既存文書の目的にそのまま合致する追加。→ patch
10. **low** — `?event=` を開いた後、URL からそのクエリを消していない。PWA で手動リロードした場合に同じ予定シートが再度開く可能性がある(実害は小さい・自然な操作では稀)。修正は 1〜2行のため patch に含める。→ patch
11. **false** — 「`AndroidManifest.xml`/`Info.plist` の変更が diff に含まれず、実装されたか確認できない」という指摘。`android/app/src/main/AndroidManifest.xml`(20-36行目)と `ios/App/App/Info.plist`(32-40行目)を直接読み、intent-filter・`CFBundleURLSchemes` とも記述どおり実装済みと確認した。diff からの除外は、レビュー担当(orchestrator)がノイズの多い生成済みネイティブプロジェクトを意図的に除外したため(この除外自体はレビュー範囲の設定であり、コードの欠陥ではない)。edge-case-hunter も同一結論に独立到達済み。
12. **false** — 「`package-lock.json` の差分が無く、実際のバージョンが固定されていない」という指摘。`package-lock.json` を直接 grep し `@capacitor/app` を含む依存が記録済みであることを確認した。diff からの除外は10と同じ理由(レビュー範囲設定)。
13. **false** — 「`.gitignore` が `android/`/`ios/` の生成物・機微ファイルを保護していない」という指摘。ルートの `.gitignore` には確かに記載が無いが、`npx cap add` が生成した `android/.gitignore` / `ios/.gitignore` が `local.properties` / `build/` / `Pods` / `xcuserdata` 等を個別にカバーしており、`git check-ignore -v` で実際に無視されることを4パターンとも直接確認した。

## Design Notes

層分離の徹底: `src/platform/deepLink.ts` は `@capacitor/app` の生イベントを右から左に流すだけで、URL のパース・ナビゲーション判断は一切持たない。パースと `navigate()` 呼び出しは `src/app/DeepLinkListener.tsx` 側(AD-16 が「受け口は `src/app` に1つ」と定めている)。この境界を最初のストーリーで固定しておくと、5.4(通知タップ)・5.5/5.6(ウィジェットタップ)が同じ2ファイルを再利用するだけで済む。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 0 errors
- `npm run lint` -- expected: 0 errors
- `npm test` -- expected: 既存 + 新規テストすべて green
- `npm run build` -- expected: 成功(Capacitor 同梱後も Web 版ビルドが壊れないこと)

**Manual checks (if no CLI):**
- Android エミュレータ/実機でアプリを起動し、`adb shell am start -W -a android.intent.action.VIEW -d "calendar-app://event/<既存の予定id>"` でディープリンク遷移を確認
- iOS のビルド確認は本ストーリーの対象外(Mac 環境確保後のフォローアップ)
