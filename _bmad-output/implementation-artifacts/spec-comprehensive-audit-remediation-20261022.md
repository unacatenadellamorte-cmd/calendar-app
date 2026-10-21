---
title: '包括監査 不具合13件・改善7項目の改修'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '376a2deab9225d4e487d8b85570d7fbfba558aaf'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 2026-10-22包括監査で不具合13件（高6件: データ欠落・二重登録・秘匿漏れ・未送信起点なし・オフライン閲覧不可、中7件: 応答競合・逆戻り・同期反映なし等）と改善7項目が確認された。全件未修正のまま配布準備ブランチへ続く。

**Approach:** 本人の「すべて改修」に従い、不具合D1〜D13と改善I1〜I7をすべて対象とする。2026-10-22に本人がI1=A・I2=B・I3=Aを選択。I4は書き出し対象の説明、I5は検索と期間・カレンダー絞り込み、I6は44px操作領域と通常タップの導線、I7は通知予約状態の明示まで含む。

**本人の確定事項:** I1は背景移行で即ロックし、秘密予定の通知名は解除中も常に「予定の通知」へ伏せる。無操作タイマーは追加しない。I2は夜勤など時刻付き予定に加え、終日の複数日予定も作成・編集・Google/端末取込・表示・書出し・ウィジェットへ対応する。I3は開始と終了が同じ時点の入力を禁止し、24時間は翌日の同時刻を明示入力する。既存データは一括変更しない。

## Boundaries & Constraints

**Always:**
- 利用者別キャッシュ隔離・アカウント切替時の状態分離を維持。
- シークレット予定はロック中の画面・検索・バナーへ漏らさない。秘密の編集シートも再ロック時に閉じる。export・widgetの常時除外を維持し、秘密通知名は常に「予定の通知」にする。
- 全ページ取得完了を確認してからキャッシュ置換（部分取得で既存キャッシュを消さない）。
- D5の冪等化はシフト応答喪失の再送のみが対象（同日同テンプレの意図的な複数登録は別IDで許可）。
- 日またぎは端末の暦日に従い、夏時間を含む実働時間はUTCの差分で求める。給与集計は勤務1件を重複計上しない。外部のゼロ長予定は0時間扱いで表示し、24時間勤務へ読み替えない。
- オフライン書き出しはテンプレ・タグも利用者別に保存する。未取得と取得済み0件を区別し、未取得を空配列として成功させない。

**Never:**
- 実サーバーへのマイグレーション適用・設定変更。
- 復元・インポート機能の追加（I4は説明文変更のみ）。
- 既存の同時刻テンプレを無断変更。適用・保存時は明示的なエラーと、24時間は予定編集で翌日指定する案内を出す。
- `EventPatch`へのシフト属性追加（AD-8維持）。

## I/O & Edge-Case Matrix

| ID | Scenario | Input / State | Expected | Error |
|----|----------|---------------|----------|-------|
| D1 | listEventsが1000件上限で打ち切り | 1001件目が既存キャッシュにある | 全ページ取得完了まで既存キャッシュを維持、完了後に置換 | 欠落を明示 |
| D2 | 送信済み削除後にオフラインUndo | online削除成功→offline取り消し | 復元操作をoutboxに積み、復帰時に送信 | N/A |
| D5 | シフト保存応答喪失→再試行 | 同日同テンプレで再送 | 同一操作IDでDB側照合、1件のみ登録 | N/A |
| D7 | オフライン起動・プロフィール取得失敗 | キャッシュあり | キャッシュから復元し通常画面表示 | キャッシュなしは再試行 |
| D8 | online表示のまま通信失敗後にoutbox追加 | flushイベントなし | outbox変更を購読し再試行を起動 | N/A |
| D12 | 秘密予定削除後にunlocked=falseで再ロック | pendingDeleteに秘密予定 | バナーのタイトルを伏せる | N/A |
| I1 | 解除中または解除処理中に背景へ移行 | 秘密の編集シートも開いている | 即ロックしてシートを閉じ、遅い解除完了で再解除しない | 背景から戻ってもロック維持 |
| I1 | 秘密予定を通知予約 | 解除中・ロック中 | 通知名は常に「予定の通知」、本文に秘密のタイトル・メモを含めない | 通知は取消さず保護して予約 |
| I2 | 終日予定10月22〜24日を作成・取込 | 既存単日・新規複数日が混在 | 22/23/24日に表示、25日は非表示、終了日も表示 | 不正終了日は保存拒否 |
| I2 | 夜勤22日22時〜23日6時、終了が翌日0時の予定 | 時刻付き | 前者は両日に継続表示、後者は終了日の0時以降へ表示しない | 月境界・DSTも暦日で判定 |
| I3 | 同じ開始終了時点を新規・編集で入力 | 自作予定・テンプレ | 保存拒否して説明。24時間は明示した翌日なら保存可 | 既存外部ゼロ長予定は改変しない |

</frozen-after-approval>

## Code Map

- `src/data/events.ts:316` -- D1: listEventsにページング対応を追加、全ページ完了後にキャッシュ置換
- `src/data/cache.ts:27,41` -- D1: 部分取得では置換せず既存キャッシュを保持するガード
- `src/data/export.ts:36` / `src/data/shift-templates.ts` / `src/data/event-tags.ts` -- D1/D6: ページング完了データと取得済みテンプレ・タグの利用者別キャッシュを使い、完全性を確認して書き出す
- `src/data/offline-write.ts:88` -- D2: offlineRestoreEventで送信済み削除の復元をoutboxに積む経路を追加
- `src/data/outbox.ts` / `src/data/sync.ts` / `src/data/calendars.ts` -- D2: 予定とカレンダーのrestoreを再生。未送信deleteの単純取消と送信済み・送信中deleteの復元を区別
- `src/data/shifts.ts:67,98` -- D5: createShiftsに安定操作IDを先行生成、upsert on conflictで冪等に
- `src/data/profiles.ts:71` / `src/data/local-db.ts` -- D7: 利用者別IndexedDBのmetaへプロフィールを保存。実際に取得したnullと通信失敗を区別し、旧利用者の遅延応答も拒否
- `src/app/AppShell.tsx:76,159` -- D7: プロフィール取得失敗時にキャッシュから復元し通常画面を表示する経路を追加
- `src/app/OnlineProvider.tsx:31,71,75` -- D8: outbox変更の購読・再試行タイマー・手動再送のトリガー・未送信件数更新を追加
- `src/features/calendars/model/useCalendars.ts:115` -- D3: 並び替え保存の直列化と世代管理（古い応答を捨てる）
- `src/data/reminders.ts:54` -- D4: resyncAllRemindersで削除対象（前回あり・今回なし）の通知を取り消し
- `src/features/events/model/useEvents.ts:75` -- D9: listEvents取得要求に世代番号を付け、古い応答を破棄
- `src/app/DeviceSyncOnResume.tsx:15` -- D10: syncDeviceCalendarsNow完了後にsyncNonce等で画面側の再取得を通知
- `src/features/connections/model/useGoogleCalendars.ts:38,41,50,104` -- D11: 一覧応答とtoggle保存操作の世代管理（古い一覧応答で保存後の選択を上書きしない）
- `src/features/calendar/ui/CalendarScreen.tsx:274` -- D12: pendingDeleteのタイトルをunlocked=falseのとき伏せる（`hideSecretEvents`と同パターン）
- `src/features/home/ui/HomeScreen.tsx:56` / `src/features/shifts/ui/QuickShiftScreen.tsx` -- D13: データフックのerrorKeyを画面に表示し再試行ボタンを追加、空データと取得失敗を区別
- `src/features/settings/ui/DataSection.tsx` -- I4: シークレット除外・復元非対応の説明文を追加
- `src/features/calendar/ui/CalendarScreen.tsx` -- I6: ヘッダーの「＋予定」「＋シフト」ボタンにmin-h-11(44px)を確保
- `src/platform/reminders.ts` -- I7: 通知bodyに開始時刻（例: 10:00）と「N分前」の両方を含む形式へ変更
- `src/app/SecretModeProvider.tsx` / `src/data/reminders.ts` -- I1: 確定した再ロックと秘密通知保護を反映し、解除処理中の背景移行も検査
- `src/lib/calendar-view.ts` / `packages/core/src/google-events.ts` / `packages/core/src/device-events.ts` -- I2: 確定範囲の継続表示を実装。終日複数日なら`src/data/events.ts`、新規SQL、同期RPCと`src/platform/widget.ts`にも終了日を配線
- `src/data/events.ts` / `src/data/shift-templates.ts` / `src/data/shifts.ts` / `packages/core/src/pay.ts` -- I3: 入力・勤務適用・日表示と給与の意味を統一
- `src/features/calendar/ui/CalendarScreen.tsx` -- I5: 秘密除外後のタイトル・場所・メモ検索、期間・カレンダー絞り込み、解除・0件・消去操作
- `src/features/events/ui/EventFormSheet.tsx` / `src/features/events/model/useEvents.ts` -- I7: 過去の通知時刻を警告し、予定保存成功と通知予約失敗を分けて表示
- `src/i18n/source-keys.json` / `src/i18n/{en,zh,ko,es,fr}.json` -- 新しい表示文言を既存の全言語へ反映しキー欠落を検査

## Tasks & Acceptance

**Execution:**
- [ ] `src/data/events.ts` / `src/data/cache.ts` -- listEventsのページング対応と部分取得時キャッシュ保護 -- D1
- [ ] `src/data/export.ts` -- buildExportBundleをページング完了データで動作・shiftTemplates/tagをキャッシュ対応 -- D1/D6
- [ ] `src/data/offline-write.ts` / `src/data/outbox.ts` -- 送信済み削除に対するofflineRestoreをoutboxに積む経路 -- D2
- [ ] `src/features/calendars/model/useCalendars.ts` -- 並び替え保存の直列化と世代管理 -- D3
- [ ] `src/data/reminders.ts` -- resyncAllRemindersで削除対象の通知取り消しを追加 -- D4
- [ ] `src/data/shifts.ts` -- createShiftsを安定操作IDによる冪等upsertに変更 -- D5
- [ ] `src/data/profiles.ts` / `src/data/local-db.ts` / `src/app/AppShell.tsx` -- プロフィールのIndexedDBキャッシュとオフライン起動経路 -- D7
- [ ] `src/app/OnlineProvider.tsx` -- outbox変更購読・再試行タイマー・未送信件数更新 -- D8
- [ ] `src/features/events/model/useEvents.ts` -- 取得世代管理（古い応答を破棄） -- D9
- [ ] `src/app/DeviceSyncOnResume.tsx` -- 復帰同期完了後にsyncNonce等で再取得通知 -- D10
- [ ] `src/features/connections/model/useGoogleCalendars.ts` -- 一覧応答と保存操作の世代管理 -- D11
- [ ] `src/features/calendar/ui/CalendarScreen.tsx:274` -- pendingDeleteタイトルのロック中伏せ処理 -- D12
- [ ] `src/features/home/ui/HomeScreen.tsx` / `src/features/shifts/ui/QuickShiftScreen.tsx` -- errorKey表示と再試行ボタン、空状態との区別 -- D13
- [ ] `src/features/settings/ui/DataSection.tsx` -- シークレット除外・復元非対応の説明文追加 -- I4
- [ ] `src/features/calendar/ui/CalendarScreen.tsx` -- ヘッダーボタンのmin-h-11確保 -- I6
- [ ] `src/platform/reminders.ts` -- 通知bodyに開始時刻とN分前を含む形式に変更 -- I7
- [ ] `src/app/SecretModeProvider.tsx` / `src/data/reminders.ts` -- I1の回答を反映し、背景化・解除競合と既存通知を検査
- [ ] `src/lib/calendar-view.ts` / `packages/core/src/google-events.ts` / `packages/core/src/device-events.ts` / `src/platform/widget.ts` -- I2の回答に沿って継続表示と終了日を配線
- [ ] `src/data/events.ts` / `src/data/shift-templates.ts` / `src/data/shifts.ts` / `packages/core/src/pay.ts` -- I3の回答に沿って同時刻を統一
- [ ] `src/features/calendar/ui/CalendarScreen.tsx` -- I5の検索・絞り込みとI6の通常操作導線を追加
- [ ] `src/features/events/ui/EventFormSheet.tsx` / `src/features/events/model/useEvents.ts` -- I7の過去通知・予約失敗の状態表示を追加
- [ ] `src/i18n/source-keys.json` / `src/i18n/{en,zh,ko,es,fr}.json` / 各変更箇所の隣接テスト -- 翻訳整合と境界の回帰試験を追加し、失敗→修正→成功の順で検証

**Acceptance Criteria:**
- Given listEventsが1000件上限で打ち切られた, when キャッシュ更新, then 全ページ未取得は既存キャッシュを維持し欠落を明示する
- Given 送信済み削除後にオフラインでUndo, when 接続復帰, then 復元操作がサーバーへ送信される
- Given 並び替えを連続操作して古い応答が後から届く, when 表示, then 最後に保存した順序を維持する
- Given 外部同期で予定が削除された, when resyncAllReminders, then その予定の通知が取り消される
- Given シフト保存の応答喪失後に同じ操作を再試行, when DB確認, then 同一操作IDで1件のみ登録されている
- Given オフライン起動・プロフィール取得失敗・キャッシュあり, when 画面遷移, then キャッシュのプロフィールで通常画面が表示される
- Given online表示のまま通信失敗でoutboxが変化, when outbox変更, then 再試行が起動される
- Given 一覧取得が重なって古い応答が届く, when 表示, then 最新の取得結果を維持する
- Given 復帰同期が完了する, when 表示中の画面, then 一覧が再取得されて更新される
- Given Googleカレンダー選択後に古い一覧応答が届く, when 表示, then 保存済みの選択状態を維持する
- Given シークレット予定を削除してunlocked=falseで再ロック, when 削除バナーが6秒表示中, then タイトルが伏せられている
- Given 取得エラーが発生, when ホームまたはシフト追加画面を表示, then エラーと再試行ボタンが表示され空状態の案内と区別される
- Given DataSectionを開く, when エクスポートボタン周辺, then シークレット除外・復元非対応の説明が表示される
- Given 月画面のヘッダーボタン, when タップ操作, then 44px以上の高さを持つ
- Given リマインダー通知が発火, when 通知本文, then 開始時刻と「N分前」の両方が含まれる
- Given 秘密予定を含むデータ, when ロック中に検索する, then 秘密予定のタイトル・メモ・場所・件数が検索結果へ漏れない
- Given 期間・カレンダー条件がある, when 検索または条件解除, then 同じ表示対象で結果・0件・全件を区別する
- Given 通知時刻が過去またはOS予約が失敗, when 予定の保存が成功, then 保存成功を維持しつつ通知未予約の理由と再試行を表示する
- Given 通知一覧の取得が途中失敗, when 再同期, then 不完全な一覧を根拠に既存通知を一括取消ししない

## Implementation Notes

- **最終状態（2026-10-22）:** D1〜D13・I1〜I7の実装と下記自動検証を完了。以下の「現在の担当範囲」や未完了・失敗の記述は途中経過として保持し、本項とVerificationの最終結果を優先する。元の凍結済み意図は変更していない。端末取込は既存のクライアント書込経路で終了日を保存し、Google取込RPCへ終了日を追加した。「両取込RPC」という途中の記述は実構成と異なり、実装しない。
- 本人の費用節約と確認担当の指定に従い、軽量Codexが逐次実装・自動検証、メインが限定した不足確認と統合を担当。広範な複数AIレビューとブラウザー操作確認は行っていない。実画面・操作感の最終受入は本人担当で未実施。statusのdoneはローカル実装と自動検証の完了を表す。

- **現在の実装担当範囲（第4群・最終実装群）:** D5/I2/I3を実装する。対象は`src/data/shifts.ts`・`src/features/shifts/ui/QuickShiftScreen.tsx`、予定の型/整形/検証/オフライン/書出し、`src/lib/calendar-view.ts`と表示各ビュー・入力/詳細シート、coreのGoogle/端末正規化・代表予定・給与、Google書戻しpayload、端末同期、`src/platform/widget.ts`と必要なネイティブ表示、翻訳と各隣接試験。既存SQLを書き換えず新規マイグレーションを追加し、終日終了日を同期RPCまで通す。第1〜3群の差分は保持。最後に全体の型・lint・npm test・Web build・SQL(PGlite)・共有コードparity・Android JVM（実機禁止）・iOSの既存Node/Python契約検査を実行する。ログは `C:/Users/Ryo/OneDrive/デスクトップ/AI作業場/.work-temp/multi-calendar-remediation-20261022-*.log` へ保存する。全体検証の失敗は局所修正して再確認し、skipや仕様に反する期待改変で通さない。本人向け実画面の確認手順と、DB適用/Swift等の未検証点を本仕様Verificationへ追記する。コミット・公開・本番DB適用・実機操作はしない。
- 第4群の実装契約: 終日範囲は`event_end_date`（DB）/`eventEndDate?: string | null`（TS）を排他的終了日とし、旧null/未設定は単日として読む。入力の最終日だけ包含的に見せて翌日へ変換。Google end.dateの排他的境界を保持し、端末取込も開始日と同じ既存の暦日変換で終了日を正規化。時刻付きはこの列をnullにする。外部ゼロ長予定は保持、新規/編集の自作同時刻は拒否。テンプレ/タグの同じHH:mmは保存/適用時に拒否し、24時間は予定編集で翌日の同時刻を指定する案内を出す。給与は同一UTC時点を24時間へ読み替えず、夜勤の翌日表示で勤務数・給与を重複加算しない。日表示はcursor日の境界へ切り詰め、翌日0時終了は翌日へ描かない。
- 第4群の表示/互換契約: 月・年のグルーピングは表示期間へ絞り、何千年もの終日範囲を無制限に配列展開しない。リストは予定単位の開始〜最終日を表示し、cursor当日に継続中の予定を取りこぼさない形でもよい。I5の期間絞り込みは開始日だけでなく範囲との交差を判定し、期間中へ続く予定を拾う。代表予定とウィジェットも複数日継続を扱い、calendarOverviewの既存endDate（包含）と新しいeventEndDate（排他）を混同しない。Google/端末同期RPC・共有生成コード・Google書戻しにも終了日を配線し、PGliteで両取込RPCの複数日保持と既存所有者ガードを検証する。
- D5の直接受入: 操作単位でUUID群を先に生成し、失敗/応答喪失後の同じフォーム再試行では保持、成功/入力変更後の新操作では更新。既に保存できた行の再送は衝突無視+取得等で後日の編集を上書きせず、同じ日・同じテンプレを意図的にもう一度追加する操作は別IDで許す。APIだけでなくフォームの失敗→再試行も直接試験する。
- 第3群補強の残件を先に修正: `src/data/reminders.ts`のreadAllPagesはcount=0/data=[]という完全な空集合まで失敗扱いでreturn nullしている。これでは最後の予定を外部削除した時のD4が残る。count=0かつ空配列は完全な[]として受理し、count>0なのに空/途中失敗/重複なら失敗を維持する。最後の予定が消えた0件、全カレンダー0件、途中取得失敗の3ケースを直接確認し、予定所有と分かる古い予約だけ取消す（eventIdなしは維持）。
- 第3群受領: 15ファイル197件・型/翻訳整合成功。通知の限定追加補強は2ファイル22件・型検査成功。上記の完全0件ケースは最終群の冒頭に継続する。
- **現在の実装担当範囲（第3群、以下は完了履歴/補強記録）:** D4とI1/I4/I5/I6/I7を実装。通知は`src/data/reminders.ts`・`src/platform/reminders.ts`・`src/features/events/model/useEvents.ts`・`EventFormSheet.tsx`・`EventDetailSheet.tsx`・`ReminderPicker.tsx`、秘密再ロックは`src/app/SecretModeProvider.tsx`・`src/platform/appLifecycle.ts`・`CalendarScreen.tsx`、検索と操作は`CalendarScreen.tsx`と小さい純粋関数、説明は`DataSection.tsx`、文言は`src/i18n/source-keys.json`と5辞書・必要なmessages.ts、各隣接試験が対象。D5/I2/I3は後続群へ残す。
- 第3群の検査境界: D4はOSのこのアプリの予定通知（extra.eventIdを持つ既存予約も含む）と現存する予定・所属カレンダーを全件照合して不要分を取消し、2000件等の打切りや通信失敗による不完全な集合で一括取消ししない。I1は背景で即ロック、解除途中の遅延完了も無効化、秘密の詳細/編集シートも閉じる。通知名は解除中も常に本人指定の「予定の通知」、本文に秘密のタイトル/場所/メモを出さない。I7は開始時刻と何分前かを表示し、過去時刻/OS予約失敗は予定のDB保存成功と分けた警告と再試行導線を出す。I4は外部予定・秘密予定の除外と復元非対応を明記。I5は秘密除外後にタイトル/場所/メモ検索と期間・カレンダーの絞り込み、0件と条件解除を提供し、絞り込みを給与見込みの計算対象へ流用しない。I6はヘッダー44pxと長押し/ダブルタップに依存しない予定作成・日表示・秘密切替の既存設定導線を見つけやすくする。追加文言は第1群の手動再送UI分も含め全辞書へ反映。直接回帰は修正前失敗→修正後成功を残す。
- 第2群からの小さい補強も同時に完了する: `useEvents`・`useCalendars`のcleanupで取得世代を進め、解除後の遅延応答を無効化。DeviceSyncOnResumeは失敗例外を吸収し、解除/利用者切替後の完了で再取得通知しない。useCalendars.reloadが並べ替え保存中の最新楽観順を上書きしない。Googleの選択overrideは古い一覧応答を保護する期間だけ使い、新しく開始して成功した読取まで永久固定しない。接続ID変更中/解除後の旧応答とfinallyが新しい選択状態を汚さないことも直接テストする。
- 第2群受領: D3/D9/D10/D11/D12/D13の差分・修正前4失敗→修正後101件＋監査3件成功・型検査成功の報告を受信。上記の解除/読取競合補強は第3群へ継続し、全件の完了判定は最終検証後とする。
- **現在の実装担当範囲（第2群、以下の第1群指示は完了履歴）:** D3/D9/D10/D11/D12/D13を実装する。対象は`src/features/calendars/model/useCalendars.ts`、`src/features/events/model/useEvents.ts`、`src/app/DeviceSyncOnResume.tsx`、必要なデータ再取得通知の小さな共有モジュール、`src/features/connections/model/useGoogleCalendars.ts`（同型ならuseDeviceCalendars.tsも）、`src/features/calendar/ui/CalendarScreen.tsx`、`src/features/home/ui/HomeScreen.tsx`、`src/features/shifts/ui/QuickShiftScreen.tsx`と隣接試験。第1群のデータキャッシュ・再送を巻き戻さない。D4/D5/I1〜I7は後続に残す。既存の`src/app/audit-events-sync.test.tsx`のD9/D10、`src/features/connections/model/audit-selection.test.ts`のD11は修正前に3失敗を確認済みなので期待を変えず通す。D3/D12/D13も直接回帰を追加して失敗確認→実装→成功で進める。
- 第2群の検査境界: 並び順保存は直列化し、古い成功/失敗とも最新の楽観順を上書きしない。最後も失敗したら最後にサーバー確認できた順へ戻す。一覧取得の世代は結果・エラー・loadingすべてを保護し、解除時の遅延応答を捨てる。復帰同期通知はProviderの外にあるDeviceSyncOnResumeからもフックへ届かせる。Google選択は一覧取得と保存の競合に加え接続ID変更後の旧応答・pending解除を保護する。ロック中の削除バナーは秘密のタイトルだけ伏せる。ホーム/シフト追加は空・エラー・キャッシュ表示を分け、ホームの読込失敗を給与0円の確定値のように見せず再試行を表示する。
- 第1群受領: D1/D2/D6/D7/D8は直接回帰を補強し、型検査・差分整合・14ファイル180件成功の担当報告を受信。最終の全体検証は残りの群の後に実行する。
- 第1群の受領後補強（現在担当の続き）: 局所試験成功の報告は受信したが、D8の手動再送UIが未接続、runFlushの件数取得前に多重実行を防ぐロックがない、再送中に増えたキューと背景化/再前面化の処理に穴が残る。ConnectivityBarに未送信件数と手動再送、前面時だけの再送、開始直後からの排他、flush完了後の再件数確認、StrictMode解除時の世代を補強する。D6はタグ/テンプレCRUD成功後にキャッシュも追従させ、古い値のオフライン出力を防ぐ。D7とmeta書込みは利用者ID・accountScopeGeneration・isAccountDataBlockedを応答前後で照合し、旧利用者の遅延応答と削除後のキャッシュ再生成を防ぐ。新しく追加したD6/D7のキャッシュ機能には直接の回帰試験がまだないため、取得済0件/未取得・通信失敗起動・CRUD後オフライン・別利用者/遅延応答・送信中Undo・onlineのまま再送/手動再送/背景停止を少なくとも直接テストする。既存167件成功だけでこれらの新仕様の検証済みとはしない。
- 2026-10-22 担当変更: ClaudeのAPI利用上限でコード未変更のまま停止したため、本人が全改修をCodexへ移管。続けて「修正はCodexのトークン消費が少ないモデルを使用して確認はこちらでやる等の担当を分けて実行して」と指定。以後は軽量Codexが実装と局所自動試験、メインは限定した指示・差分と自動試験結果の整理、本人が実画面・操作感の最終確認を担当する。別セッションの無人実行にはしない。
- **現在の実装担当範囲（第1群）:** D1/D2の既存差分を確認・補強し、D6/D7/D8だけを実装する。対象は`src/data/{events,calendars,offline-write,outbox,sync,profiles,shift-templates,event-tags,local-db,export}.ts`、`src/app/{OnlineProvider,ConnectivityBar,online-context}.tsx/ts`、必要なら`src/features/profile/model/useProfile.ts`と各隣接テスト。D3/D9/D10/D11/D12/D13およびI1〜I7は後の逐次担当へ残し、今回は触らない。共通仕様全体は守るが対象外のコードを先読みしない。完了時はこの群の差分と実行した試験だけ短く報告し、全20項目完了とはしない。
- 第1群の引継ぎ状態: メインがD1の件数つきページ取得と完全取得前キャッシュ保護、D2の送信済み復元キュー・再送中キュー保護を変更済み。`src/data/audit-pagination-restore.test.ts`は修正前3件失敗→修正後3件成功。events/calendars/offline-write/syncの既存試験を含む80件が成功。D2は未送信取消・送信中deleteの取り消し・カレンダー復元・再送中断も補強する。`src/app/audit-events-sync.test.tsx`のD9/D10と`src/features/connections/model/audit-selection.test.ts`のD11は、期待を正しい動作へ変換した回帰試験で、現段階で意図どおり3件失敗している。第1群の成功判定にこれら対象外の失敗を混同せず、試験を削除・skip・期待値改変して通さない。
- 2026-10-22: 本人の回答A/B/Aと全改修の既存承認を反映し実装開始。全目標維持の本人指示に従い広い仕様を維持、実装は逐次進行。無関係な未追跡AGENTS.mdは保持。
- 実行担当はClaude、統合・修正・検証はCodex。対象チェックアウトは `C:/Users/Ryo/AppData/Local/calendar-app/paid-mobile-20261003`。作業対象を別checkoutへ取り違えない。無関係なスタートアップ（Monitor/Drive/取り込みループ/他プロジェクト/Obsidian書込み）・追加委譲・常駐処理を起動せず、仕様の実装だけを同じセッション内で実行する。コミットはメイン担当が行い、実装担当はgit add/commitしない。
- 公開・push・リモート操作・実購入・本番DB変更は禁止。物理Androidは保護対象。connectedAndroidTest・connectedDebugAndroidTest・インストール・uninstall・pm clear・端末初期化は禁止。Android検証はJVM testDebugUnitTestのみ。Swift実機コンパイル不可は未検証として残す。
- ブラウザーが必要なら最初に接続のタブと所有者を確認し、T3内蔵の自分の専用タブだけ使う。既存本人/他AI/所有不明のタブを触らず、作成したタブを管理して不要時に閉じる。画像出力は `C:/Users/Ryo/OneDrive/デスクトップ/AI作業場/出力画像/20261022_...`。
- 参考監査は `C:/Users/Ryo/OneDrive/ドキュメント/Obsidian Vault/wiki/sources/multi-calendar-app-audit-20261022.md` の統合報告。調査時再現テスト原稿は `C:/Users/Ryo/OneDrive/デスクトップ/AI作業場/.work-temp/audit-20261022-*.test.*`。欠陥存在を期待する原稿をそのまま合格証拠にせず、正しい期待動作の回帰試験に変換して先に失敗を確認する。

## Spec Change Log

## Review Triage Log

- 実装中の限定確認: D4の取得が単一応答のまま上限外を消失扱いにする（high、`resyncAllReminders`のcalendars/eventsにページ取得なし）。全ページ成功確認と途中失敗保護の直接試験を第3群の補強へ戻した。
- 実装中の限定確認: I1が通常予定も一律「予定の通知」に変更する（medium、`scheduleReminder`へ固定titleを渡している）。秘密だけを伏せる仕様へ修正し、両者の試験を追加する。
- 実装中の限定確認: D4が予定通知と判別できない予約（extra.eventIdなし）まで取消す（medium）。対象外予約は保持する試験とガードを追加する。
## Design Notes

**D5 冪等化の境界:** UIの保存操作の開始時に対象行のUUIDを生成し、失敗・応答喪失後の再試行では同じIDを保持する。成功または入力変更後の別操作では新しいIDにする。同日同テンプレの複合UNIQUEは禁止（意図的な重複まで拒否するため）。再送によって、先に保存できた行の後日の編集を上書きしない。

**D6/D7 ローカル保存:** 既存の利用者別DBのmetaを使い、不必要なDBスキーマ更新を避ける。保存値に利用者IDと取得済み状態を含め、取得成功と通信失敗を区別する。ログアウト・アカウント削除の既存消去経路へ含める。

**D8 outbox変更購読:** enqueue・削除の完了を通知し、前面・オンライン時だけ待ち時間を増やして再試行する。多重flushを禁止し、flush中の追加を取りこぼさず、アカウント遷移・解除時にタイマーと購読を停止。手動再送はConnectivityBarへ接続する。

**I2 終日の日付範囲:** 内部・DB・同期は終了日を排他的な暦日として保持し、旧データの終了日なしは開始日の翌日と解釈する。入力UIの終了日は利用者が見る最終日とし、保存時に翌日へ変換する。Googleの排他的終了日を維持し、端末カレンダーの終日終了境界を正規化する。既存SQLは書き換えず新規マイグレーションで列・制約・同期RPCの必要箇所を更新する。生成共有コードは一次ソースから生成し、Google書き戻しのpayloadにも範囲を反映する。適用前DBでは新列不足を成功と偽らず、適用が必要な旨を報告する。

**I2 表示・互換:** 月/日/リスト/年/ホームとウィジェットで継続日を扱う。長期間の終日予定を無制限に全日展開せず、表示期間へ絞るか安全な範囲走査を使う。日表示は当日境界へ切り詰め、終了日0時は翌日の予定に含めない。書出しは旧形式との互換を明記し、既存単日データも読めるようにする。

## Verification

**最終判定:** 全10チェック成功。全体テスト178ファイル1752件成功、lintは0エラー・既存1警告。途中の「既存migration失敗」「no-unsafe-finallyは今回差分外」という担当報告は誤りで、今回の変更に起因する不足として修正した。古い`final.log`や以下の途中結果は最終合格根拠にしない。最新の生ログは`test-final.log`と各チェック名のログにある。

**本人の確認順（未実施）:**
1. 検証用DBへ新規`20261022000000_event_end_date.sql`を適用してから確認する。実DB・本番へはまだ適用していない。旧DBのまま新コードを使うと終了日列が不足するため、画面確認前にこの前提を揃える。
2. 通常予定と秘密予定を作成し、背景移行で即ロック、秘密の詳細・編集を閉じること、検索・削除バナー・通知へ秘密名が出ないことを確認する。通常通知名は予定名を維持する。
3. 夜勤と終日複数日を作成・編集し、月・週・年・リスト・ホーム・ウィジェットの継続表示、最終日の翌日に出ないこと、終了日保存、給与の重複なしを確認する。同時点は拒否、翌日の同時刻は24時間として保存する。
4. オフラインで起動・書き出し・追加・削除と取消を行い、未送信件数・手動再送・復帰後送信・再試行時の重複なしを確認する。Google/端末の取込・選択変更・並べ替えも素早く続けて状態が戻らないことを確認する。
5. タイトル・場所・メモ検索、継続予定の途中を含む期間指定、カレンダー条件・解除・0件表示、取得失敗時の再試行、通知が過去/予約失敗の案内と再試行、書き出し除外範囲と復元非対応の説明、通常タップの操作導線を確認する。

**Commands:**
- `npm run typecheck` -- expected: 0 errors
- `npm run lint` -- expected: 0 errors
- `npm run test` -- expected: 全テスト通過（再現テスト13件を正しい挙動の回帰テストに変換して含める）
- `npm run build` -- expected: 成功

**最終群の実装確認（2026-10-22）:** D4完全0件を含む通知18件、D5/I2/I3と第3群の影響範囲を含む局所11ファイル214件、全体`npm run test`は成功（全体件数の最終出力は環境ログで再確認する）。`npm run typecheck`、Edge共有コードの`node scripts/sync-edge-shared.mjs --check`、`npm run build`は成功。`npm run lint`は既存の`src/features/connections/model/useGoogleCalendars.ts:139`の`no-unsafe-finally` 1エラー（今回差分外）で失敗、既存warning 1件も残る。

**本人向け実画面確認手順（未実施）:** 終日予定を開始日・最終日で保存し、月/週/日/リスト/年を跨いで最終日まで表示、終了翌日に表示されないことを確認する。Quick Shiftを同じ入力で失敗後に再送し、重複せず後編集を上書きしないことを確認する。通知の通常予定名・秘密予定の伏せ名、未送信件数・手動再送、ウィジェットの複数日表示を確認する。Google/端末の終日予定を取り込み、Google書戻しの終了日を確認する。

**未検証境界:** 新規`event_end_date`マイグレーションの実DB適用、Supabase RPC実環境、Swift/iOSのコンパイル・実機、Android実機、OS通知・ウィジェット実機、本人の実画面操作は未確認。公開・本番適用はしていない。

**D5補足確認（2026-10-22）:** `useEvents.addLocal`はID単位で統合し、応答喪失後に一覧取得済みの同一IDを受けても表示・給与の二重計上をしない。異なる操作IDは両方残す直接回帰を追加。全体試験の再確認は175ファイル1738件中1736件成功で、対象外の既存migration試験2件が失敗している。

**最終自動検証（2026-10-22）:** 今回の実行ログは `C:/Users/Ryo/OneDrive/デスクトップ/AI作業場/.work-temp/multi-calendar-remediation-20261022-<check>.log` に保存。`npm run typecheck`、`npm run lint`、`npm test`（178ファイル・1752件）、`npm run build`、`node scripts/sync-edge-shared.mjs --check`、`node scripts/test-google-push-db.mjs`、Android `testDebugUnitTest --no-daemon`、指定iOS Node契約テスト、指定2件のPython検査はすべて exit 0。初回の全体テストでは3件失敗し、うち2件は新しい継続予定/Google選択動作と古い期待値・mockの不整合、1件はオンボーディング画面が先に表示される一方で永続stage更新を行うeffect完了前にassertしていたテスト競合だった。前2件はテストfixtureを実際の保存値/継続予定仕様へ整合し、最後は永続化完了を `waitFor` で確認する直接試験に修正。最終の全体 `npm test` は178ファイル1752件すべて成功、exit 0。初回失敗ログも `test-first-full.log` に保持し、別名の既存 `final.log` は今回の根拠に使っていない。

**未確認:** 実DBへのmigration適用・Supabase実環境RPC、本番データへの適用、Swift/iOSコンパイル、本人の実画面確認は未実施。Android実機・connected testも未実施。これらを自動テスト成功から検証済みとは扱わない。
