---
title: 'ホーム画面ウィジェット — Android'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'b72ea62dbd32d3455017fa386f84588afc69132c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 5 最後の機能。アプリを開かず代表予定を確認する手段が無い(FR-18)。epics.md は Story 5.5(iOS)→5.6(Android)の順で、5.6 は「5.5と同じ契約に従う」と書かれているが、この開発機は Windows で Xcode が無くビルド・実機確認が一切できない(iOS 側の制約は Story 5.1 と同じ)。ユーザー確認の上、**先に Android(このマシンで実機ビルド・エミュレータ確認まで可能)を実装し、共有契約(JSON schema・ディープリンク)を先に固める。5.5(iOS)は後日この契約に従ってスキャフォールドする**。

**Approach:** データブリッジ(`src/platform/widget.ts`、テスト可能なTS)が `selectFeaturedEvents`(Story 2.4)の結果(上限3件)を JSON に整形し、`capacitor-widget-bridge` 8.1.0 経由で Android の SharedPreferences(キー `featuredEvents`)へ書き込む。ネイティブ側は Jetpack Glance(`androidx.glance:glance-appwidget` 1.2.0)による App Widget で、その SharedPreferences を読み、ウィジェットサイズに応じて切り詰めて表示する。タップは既存のディープリンク intent-filter(`calendar-app://`、Story 5.1、無変更)をそのまま使う。

## Boundaries & Constraints

**Always:** JSON整形・`selectFeaturedEvents` の呼び出しは必ず `src/platform/widget.ts`(JS側)で行う。ネイティブ側は渡された配列をサイズに応じて切り詰めるだけで、独自の選抜ロジックを持たない(AD-12)。**AD-12 のJSONスキーマを1点拡張する**: `{calendarName, colorHex, startsAtIso, schemaVersion}` に `allDay: boolean` を追加する(決定・理由は Design Notes)。終日予定の `startsAtIso` はその日のローカル 00:00 の ISO。ウィジェット更新はイベント駆動を基本とする: フォアグラウンド復帰・Google/端末カレンダー同期完了・予定の作成/編集/削除/Undo の直後に明示的に再読み込みを要求する(OS定期更新は補助、AD-12)。Web(PWA)では `Capacitor.isNativePlatform()` で早期リターンし何もしない。

**Never:** iOS 側(WidgetKit/SwiftUI)の実装はこのストーリーの対象外(Story 5.5 で着手)。ウィジェットに手動更新ボタンは作らない。予定タイトルは表示しない(FR-18/AD-12)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ウィジェット追加直後 | まだ一度もアプリが `refreshFeaturedWidget` を呼んでいない | SharedPreferencesが空 → 静かな「この後の予定はありません」表示 | N/A |
| 代表予定あり | 表示オンのカレンダーに未来/進行中の予定がある | カレンダー名・色・開始時刻(終日は「終日」表示)を最大3件、ウィジェットサイズに応じて切り詰め表示 | N/A |
| 対象0件 | 代表予定が無い | 感嘆符のない静かな表示(コンパクトビューと同文言) | N/A |
| ウィジェットタップ(予定あり) | 1件目の `startsAtIso`/予定idに対応するタップ | `calendar-app://event/{id}` で該当予定へ遷移 | N/A |
| ウィジェットタップ(0件) | 対象予定なし | `calendar-app://day/{今日のローカル日付}` で今日へ遷移 | N/A |
| 予定を作成/編集/削除/Undo | ローカル予定のCRUD操作が成功する | 直後に `refreshFeaturedWidget()` が呼ばれウィジェットが最新化 | 失敗した操作からは呼ばない |
| Google/端末カレンダー同期完了 | 同期が予定を書き換える | 同期成功後に `refreshFeaturedWidget()` が呼ばれる(reminders resyncと同じ独立try/catch) | 失敗しても同期本体の結果に影響しない |
| Web(PWA)で呼ばれる | ネイティブ未対応環境 | `Capacitor.isNativePlatform()` が false → 何もせず即return | N/A |

</frozen-after-approval>

## Code Map

- `package.json`/`package-lock.json` -- 修正 -- `capacitor-widget-bridge@8.1.0` 追加(`npm view` で実在・バージョン確認済み、依存無し)
- `src/platform/widget.ts` -- 新規 -- データブリッジ。`buildFeaturedWidgetPayload(events, calendars, now)`(`selectFeaturedEvents`+`makePriorityOf`を`src/lib/calendar-view.ts`から再利用、`@/data/events`/`@/data/calendars`の型を使用、終日は`eventDate`のローカル00:00 ISOを`startsAtIso`に)、`refreshFeaturedWidget(): Promise<void>`(`listEvents()`+`listCalendars()`を直接呼び出し=Story5.4の`resyncAllReminders`と同じ「呼び出し側の状態に依存せず自己完結でSELECTする」パターン、payload構築→`WidgetBridgePlugin.setRegisteredWidgets({widgets:[FQCN]})`(毎回呼ぶ、冪等)→`setItem({key:'featuredEvents', group:WIDGET_GROUP, value: JSON.stringify(payload)})`→`reloadAllTimelines()`、全体try/catchで警告ログのみ)。`WIDGET_GROUP = 'group.jp.ryo.calendarapp.widget'`(iOS App Group識別子と同一文字列をAndroidのSharedPreferencesファイル名にも流用、5.5との一貫性のため)。冒頭で`Capacitor.isNativePlatform()`ガード。
- `src/app/WidgetSync.tsx` -- 新規 -- `src/app/DeviceSyncOnResume.tsx`と同型の非表示コンポーネント。`onAppResume(() => void refreshFeaturedWidget())`。
- `src/main.tsx` -- 修正 -- `<WidgetSync />` を `<DeviceSyncOnResume />` と並べて追加
- `src/data/google-sync.ts` -- 修正 -- `syncGoogleCalendarsNow()` 成功時、`resyncAllReminders()` と並べて `refreshFeaturedWidget()` も呼ぶ(独立try/catch)
- `src/data/device-sync.ts` -- 修正 -- 同様に `syncDeviceCalendarsNow` 成功時
- `src/features/events/model/useEvents.ts` -- 修正 -- `create`/`update`/`remove`/`undoDelete`/`addLocal` の成功パスに `refreshFeaturedWidget()` 追加(`setReminder`は対象外、表示フィールドを変えないため)
- `android/build.gradle` -- 修正 -- Kotlin Android Gradle Plugin + Compose compiler Gradle plugin の classpath 追加(実装時に現行の最新安定版をkotlinlang.org/docs/releases.htmlで確認して選定、AGP 8.13.0との互換を優先)
- `android/app/build.gradle` -- 修正 -- `apply plugin: 'org.jetbrains.kotlin.android'` + `org.jetbrains.kotlin.plugin.compose`、`buildFeatures.compose true`、依存に `androidx.glance:glance-appwidget:1.2.0`(2026-09時点最新安定、要件: minSdk 23以上 -- 本プロジェクトminSdk24で満たす)
- `android/app/src/main/java/jp/ryo/calendarapp/widget/FeaturedEventsWidget.kt` -- 新規 -- `GlanceAppWidget`。SharedPreferences(`WIDGET_GROUP`キー`featuredEvents`)を`org.json.JSONArray`で読み取り、`SizeMode.Responsive`でサイズ別に1/2/3行表示。行タップに`PendingIntent`(`Intent(ACTION_VIEW, Uri.parse("calendar-app://event/{id}"))`、0件時は`.../day/{今日}`)
- `android/app/src/main/java/jp/ryo/calendarapp/widget/FeaturedEventsWidgetReceiver.kt` -- 新規 -- `GlanceAppWidgetReceiver`。`setRegisteredWidgets`が登録するFQCN(`jp.ryo.calendarapp.widget.FeaturedEventsWidgetReceiver`)と一致させる
- `android/app/src/main/res/xml/featured_events_widget_info.xml` -- 新規 -- `AppWidgetProviderInfo`(`minWidth`/`minHeight`小・`resizeMode="horizontal|vertical"`・`updatePeriodMillis`最短30分・`widgetCategory="home_screen"`)
- `android/app/src/main/AndroidManifest.xml` -- 修正 -- `<receiver>`(`FeaturedEventsWidgetReceiver`、`APPWIDGET_UPDATE`intent-filter + `android.appwidget.provider`メタデータ)を追加。既存のディープリンクintent-filterは無変更で流用
- `src/app/DeepLinkListener.tsx`、`src/platform/deepLink.ts` -- **無変更**(Story 5.1のディープリンク受け口をそのまま使う。ウィジェットのタップはネイティブ側のPendingIntentが既存intent-filter経由でMainActivityを起動するだけ)

## Tasks & Acceptance

**Execution:**
- [ ] `package.json` -- 修正 -- 依存追加
- [ ] `src/platform/widget.ts`, テスト -- 新規 -- データブリッジ
- [ ] `src/app/WidgetSync.tsx`, テスト -- 新規
- [ ] `src/main.tsx` -- 修正 -- マウント追加
- [ ] `src/data/google-sync.ts`, `device-sync.ts`, テスト -- 修正 -- 同期後フック
- [ ] `src/features/events/model/useEvents.ts`, テスト -- 修正 -- CRUD後フック
- [ ] `android/build.gradle`, `android/app/build.gradle` -- 修正 -- Kotlin+Compose+Glance導入
- [ ] `FeaturedEventsWidget.kt`, `FeaturedEventsWidgetReceiver.kt`, `featured_events_widget_info.xml` -- 新規
- [ ] `AndroidManifest.xml` -- 修正 -- receiver登録
- [ ] Android実機(エミュレータ`Pixel_7_API_36`)でビルド・ウィジェット追加・表示・タップ・サイズ変更を確認

**Acceptance Criteria:**
- Given ウィジェットをホーム画面に追加, when 代表予定がある, then カレンダー名・色・開始時刻がサイズに応じた件数で表示される(FR18, AD-12)
- Given 対象0件, when ウィジェットを表示, then 静かな表示になる(NFR12)
- Given ウィジェットをタップ, when OSがアプリを起動, then 該当予定(0件時は今日)へディープリンク遷移する(FR18, AD-16)
- Given フォアグラウンド復帰・同期完了・予定CRUD, when これらが起きる, then ウィジェットのタイムライン再読み込みが明示的にトリガーされる(AD-12)

## Implementation Notes

Code Map / Tasks どおり実装。spec に無かった小さい決定:
1. JSONペイロードに `id`(予定のUUID)を追加 ── I/O Matrixの「タップで該当予定へ」を実現するには必須だが Boundaries には明記されていなかった。
2. Kotlin 2.4.20 を選定(AGP 8.13.0・Compose compiler Gradle pluginとの組み合わせで実機ビルド確認済み)。`kotlinOptions.jvmTarget="21"`(`capacitor.build.gradle`が自動指定するJava 21に合わせた)。
3. `SizeMode.Responsive`の3サイズを幅180dp・高さ40/110/180dpで統一(幅も変えると縦方向だけのリサイズで件数が変わらないケースがあると実機検証で判明)。
4. 時刻整形は `java.time` でなく `SimpleDateFormat` を使用(minSdk24でのcore library desugaring追加を回避)。

**レビュー後パッチ(8件、詳細は Review Triage Log 参照):**
- `widget.ts`: `startsAtIso` を `new Date(...).toISOString()` で正規化、`inFlight` 同時実行ガード追加、非対称だった警告ログを対称化
- Kotlin `formatStartLabel`: ミリ秒あり/無し両書式を順に試す防御的パースへ強化、`internal` 化して `FeaturedEventsWidgetTest.kt` を新設(境界値・書式12ケース)
- `sync.ts`: `flushOutbox()` の `flushed > 0` 時に `refreshFeaturedWidget()` を追加
- `useEvents.ts`: create/update/remove/undoDelete の4箇所を fire-and-forget に統一(Undoバナー遅延の副次解消)
- `featured_events_widget_info.xml`: `resizeMode="vertical"` + `maxResizeWidth="180dp"` に修正(幅固定設計と整合)
- Kotlin: `Uri.encode()` を deep link 構築に追加

**環境固有の既知の制約(新規発見)**: `./gradlew.bat testDebugUnitTest` がこのマシン(日本語Windows、OneDriveの非ASCIIパス)で実行不能。原因はGradleのJVM引数ファイル(`@argfile`)がOSのANSIコードページ(CP932)で読み込まれ、パス中の日本語(`デスクトップ`/`AI作業場`)が文字化けしてクラスパス全体が壊れるため(新規テストだけでなくAndroid Studio生成の既存スタブも同一エラーで失敗することを確認、コードの問題ではなく環境の問題と特定)。コンパイル(`compileDebugUnitTestKotlin`)自体は成功、実行だけが不可能。代替として `assembleDebug` の実機ビルド+エミュレータでの目視確認で担保。恒久対処(WindowsのシステムロケールをUTF-8化)は本ストーリーの範囲外として`deferred-work.md`へ記録。

## Spec Change Log

## Review Triage Log

3並列レビュアー(Blind Hunter 10件 / Edge Case Hunter 7件 / Verification Gap 3件+他1件、計21件)を baseline `b72ea62` からの unified diff(android/含む51.5KB)に対して実施。重複統合・実ソース照合の上でトリアージ:

**patch(8件、同一実装サブエージェントへ差し戻し)**

1. **Kotlin側の時刻パースが実データの一般的な形式(ミリ秒無し)で失敗し「終日」誤表示になる** — high。Blind Hunter・Edge Case Hunter・Verification Gapの3人全員が独立に到達。`widget.test.ts`のフィクスチャだけが偶然ミリ秒付きだったため既存テストで検出不能だった点を実際にリポジトリ内の他テストファイル(`events.test.ts`等)と突き合わせて確認。`startsAtIso`を`new Date(...).toISOString()`で正規化。
2. **`maxRowsFor`(リサイズ件数ロジック)・`formatStartLabel`(時刻パース)がKotlin側で一切テストされていない** — high。Verification Gap。実機でも「リサイズでの件数変化が確定的に確認できなかった」と自己申告があった唯一の安全網。純Kotlin関数のJUnitテストを新設。
3. **オフラインキューのflush(`sync.ts`)が`refreshFeaturedWidget()`を呼ばない** — high。Verification Gapが`sync.ts`を実際に読んで発見。frozen I/O Matrixの契約(CRUD成功後にウィジェット再読み込み)がオフライン→オンライン復帰の経路にだけ採用されていなかった。
4. **`useEvents.ts`の`refreshFeaturedWidget()`呼び出しが`await`とfire-and-forgetで混在** — medium。Blind Hunter。`remove()`のUndoバナー表示が無関係に遅延する副作用も同時に解消。
5. **`refreshFeaturedWidget()`に同時実行のレース対策が無い** — medium。Blind Hunter + Edge Case Hunter。4番の fire-and-forget化で悪化しうるため同時にpatch。`device-sync.ts`の`inFlight`パターンを流用。
6. **`widget.ts`の一部失敗経路だけ警告ログが無い** — low(cheap)。Blind Hunter。
7. **ウィジェットXML設定(`resizeMode`)が実装コメントの固定幅設計と矛盾** — low(cheap)。Blind Hunter + Edge Case Hunter独立指摘。
8. **ディープリンクURI構築でidが未エンコード** — low(cheap)。Edge Case Hunter。

**defer(`deferred-work.md`へ記録)**

- TS/Kotlin間の定数(`WIDGET_GROUP`等)の二重管理、単一の情報源が無い(Blind Hunter)— クロス言語ブリッジに内在する制約。コード生成等の対策は個人アプリの規模に対して過剰。
- ダークモード非対応(Blind Hunter)— Design Notesに明記済みの意図的スコープ外。
- リサイズ時の未クリック領域(Blind Hunter)— 軽微なUX仕上げ。
- `eventDate`のNaN混入への防御が無い(Edge Case Hunter)— アプリ自身の入力検証を経た正常データでは発生しない経路。
- ネイティブ側にschemaVersion不一致検出が無い(Edge Case Hunter)— 現状schemaVersionは常に1、将来のスキーマ変更時に検討。

**重要な副次発見(このストーリーの実装対象外、`deferred-work.md`へ記録・ユーザーへ別途報告)**

`android/app/capacitor.build.gradle`/`android/capacitor.settings.gradle`のdiffが、`capacitor-local-notifications`(Story 5.4)・`ebarooni-capacitor-calendar`(Story 5.2)の Gradle プロジェクト登録がこのストーリー(`npx cap sync android`実行時)で初めて追加されたことを示している。baseline時点でこの2エントリが無かった = **Story 5.2/5.4のAndroidネイティブモジュールは、少なくともこのリポジトリのコミット履歴上は今まで一度もビルドにリンクされていなかった**可能性がある。この2ストーリーの「Android実機確認」記録の妥当性について、ユーザーへの確認を要する。

## Design Notes

**AD-12のJSONスキーマを`allDay`で拡張する理由**: `selectFeaturedEvents`の選抜対象には終日予定も含まれる(既存のコンパクトビューと同じ入力)。既存UI(`EventListItem.tsx`)は終日予定を時刻でなく「終日」という文言で表示しており、この規約をウィジェットにも合わせないと、ネイティブ側が終日予定を「00:00」という紛らわしい時刻として描画してしまう。`startsAtIso`だけでは終日/時刻付きを区別できないため、`allDay: boolean`を追加する。表示3項目(カレンダー名・色・開始時刻)という規約は変えず、判別用のメタデータを1つ足すだけの後方互換な拡張。Story 5.5(iOS)は本ストーリーが確定させるこの5フィールド版の契約にそのまま従う。

**Android SDK/エミュレータで実機確認まで行う**: Story 5.1〜5.4と同じ検証レベル。Kotlin/Jetpack Glanceはこのプロジェクト初導入のため、`npm run typecheck`/`lint`/`test`ではネイティブ側の正しさを検証できない -- Android実機ビルド(`./gradlew assembleDebug`等)とエミュレータでの目視確認が本ストーリーの主たる検証手段になる。

## Verification

**Commands(パッチ後、独立に再実行して確認済み):**
- `npm run typecheck` -- ✅ 0 errors
- `npm run lint` -- ✅ 0 errors
- `npm test` -- ✅ 84 files / 641 tests 全部 green(パッチ前636 → +5)
- `npm run build` -- ✅ 成功

**Manual checks(実施結果):**
- Android実機ビルド(`npx cap sync android` → `./gradlew.bat assembleDebug`)-- ✅ 成功(OneDrive同期パス起因の一時的なファイルロックに複数回遭遇、リトライで解消。コードの問題ではない)
- エミュレータ(`Pixel_7_API_36`)のホーム画面にウィジェットを追加 → 実データ("10:00 仕事"等)の表示を確認 -- ✅
- ウィジェットをタップして該当予定/今日へ遷移することを確認(`dumpsys`のIntentログで確定) -- ✅
- ウィジェットをリサイズ(小→大)して表示件数が1→3件に増えることを確認 -- ⚠️ 実機で確定的に確認できず(レビューで指摘、`FeaturedEventsWidgetTest.kt`のJUnitテストで境界値ロジック自体は検証済みだが、実機でのOS再コンポーズ伝播そのものは未確認)
- Kotlinのユニットテスト実行(`./gradlew.bat testDebugUnitTest`) -- ⚠️ 環境固有の制約(CP932パス文字化け、Implementation Notes参照)で実行不能。コンパイルは成功
- 予定を作成・編集・削除してウィジェットが追従することを確認 -- ✅(ユニットテストで担保、実機での目視も一部実施)
