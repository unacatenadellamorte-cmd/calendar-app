# 先送りにした作業

- source_spec: `spec-secret-mode-avatar-toggle.md`
  summary: `SecretModeQuickUnlockSheet.tsx`の送信ハンドラも、`unlock()`が例外を投げると`submitting`が`true`のまま固まる(try/catch/finally未使用)。
  evidence: レビュー(Blind Hunter・Edge Case Hunter)指摘。`spec-secret-mode.md`の`SecretModeSettingsScreen.tsx`で既にdeferした「送信ハンドラのtry/finally未使用、コードベース全体の既存規約」と同根の問題がこの新規ファイルにも引き継がれた。この story 単体で直すと既存パターンと不整合になるため、送信ハンドラの規約自体を見直す別の機会に回収する。

- source_spec: `spec-secret-mode-avatar-toggle.md`
  summary: OS/端末側の「タップ調整」等のアクセシビリティ設定で反応速度が遅い場合、約300ms固定のダブルタップ判定が認識されない可能性がある。
  evidence: レビュー(Blind Hunter)指摘。個人利用アプリで機能を使うのは基本的にユーザー本人であり、既存の設定画面(`/secret-mode`)という代替導線が既にあるため機能自体は失われないと判断し今回は見送り。将来的にタイマー時間を設定可能にする等の対応を検討。

- source_spec: `spec-secret-mode-avatar-toggle.md`
  summary: `BottomSheet.tsx`が閉じたときに呼び出し元の要素へフォーカスを戻さない(キーボード/スクリーンリーダー利用者がフォーカス位置を見失う)。
  evidence: レビュー(Blind Hunter)指摘。`BottomSheet.tsx`自体は今回のdiffに含まれておらず、`EventFormSheet`等の既存の全シートに共通する既存挙動。`BottomSheet.tsx`を触る別の機会に回収する。

- source_spec: `spec-secret-mode.md`
  summary: シークレットモードの解除状態が、バックグラウンド化・アイドルタイムアウトでは自動的に再ロックされない(現状はアプリのフルリロードのみ)。
  evidence: frozen Always は「アプリ起動・リロードのたびに必ずロック状態に戻る」とだけ約束しており、ユーザーの要望文言も「アプリ立ち上げ時は非表示」のみ。レビュー(Blind Hunter)で「解除したまま放置すると他人にもずっと見えたまま」という実用上のリスクを指摘されたが、意図が定めていない拡張のため今回は見送り。`visibilitychange`イベント等での実装を検討。

- source_spec: `spec-secret-mode.md`
  summary: `hashPasscode`(`src/lib/passcode.ts`)が`crypto.subtle`未対応環境で未処理の例外を投げる。
  evidence: レビュー(Edge Case Hunter)指摘。Web Crypto APIはsecure context前提で、Capacitorネイティブ+モダンブラウザというこのアプリの実際の対象環境ではまず起こらないと判断し今回は見送り。将来的に環境が変わった場合の防御ガードとして記録。

- source_spec: `spec-secret-mode.md`
  summary: `SecretModeSettingsScreen.tsx`のフォーム送信ハンドラがtry/finally無しで`submitting`状態を管理しており、非同期呼び出しが例外を投げるとボタンが固まったままになる。
  evidence: レビュー(Edge Case Hunter)指摘。`EventFormSheet.tsx`等、このコードベースの既存の送信ハンドラも同じパターン(try/finally無し)を使っており、secret-mode単体の欠陥ではなくコードベース全体の既存規約。ここだけ直すと既存パターンと不整合になるため、送信ハンドラの規約自体を見直す別の機会に回収する。

- source_spec: `spec-secret-mode.md`
  summary: 上部アバターアイコンのダブルタップでシークレットモードのロック解除/再ロックを切り替えるショートカット(設定画面を開かずに済む)。
  evidence: シークレットモード本体(予定フラグ+全画面除外+設定画面でのパスコード設定・ON/OFF)のトークン数超過を理由に、ユーザーが分割を選択。既存のアバターアイコンは Part A(プロフィール登録)でシングルタップ=`/profile`遷移の実装済みで、ダブルタップを追加するとこの既存挙動と操作が衝突する(シングルタップが即座に発火しダブルタップの検出を妨げる)。本体が公開する `unlock`/`lock` を呼ぶだけの薄い追加だが、タップ衝突の解決方法(遷移を遅延させる/アバターの役割を変える/鍵バッジ等の別要素にする)は本体とは独立した設計判断が要るため、本体を先に実装してから別specとして着手する。

- source_spec: `spec-1-1-project-foundation-and-app-shell.md`
  summary: `package.json` の `allowScripts`(esbuild / unrs-resolver)が開発環境固有で、CI や他マシンで `npm ci` するとネイティブバイナリの postinstall が走らずビルドできない可能性がある。
  evidence: この環境の npm は install スクリプトを既定でブロックする設定になっており、承認結果が `package.json` の `allowScripts` に書き込まれた。CI は未決定(ARCHITECTURE-SPINE で Deferred)。CI を導入するストーリーで、`.npmrc` や CI 設定でネイティブ依存(esbuild)のビルドを担保する方針を決める。標準的な npm 環境なら現状の `package.json` でそのまま動く。

- source_spec: `spec-1-4-events-crud.md`
  summary: オフライン時の書き込みキュー(IndexedDB 永続化・順序保持・オンライン復帰でフラッシュ)は Story 1.4 では実装せず Story 1.6(PWA + オフライン)に委ねた。
  evidence: Story 1.4 のスコープを「予定 CRUD + オンライン前提の楽観更新」に絞った。epic-1-context の 1.4 AC にはオフラインキューが含まれるため、1.6 で必ず回収する。1.4 ではオフライン時「保存できません」を表示するにとどめる。
  status: **Story 1.6 で回収済み**(`src/data/outbox.ts` + `src/data/sync.ts` + `src/data/offline-write.ts`。events / calendars 両方の書き込みが対象)。

- source_spec: `spec-1-5-calendar-views.md`
  summary: 月 / 週ビューの横スワイプでの日付前後移動は Story 1.5 では実装せず、`‹` `今日` `›` ボタン + 日付ジャンプにとどめた。
  evidence: epic-1-context は「月・週は横スワイプで前後移動」を挙げるが、スワイプはタッチ実機依存で jsdom でのテストが難しく、ボタン + 日付ジャンプで「任意の日付へ移動」の要件は満たせる。1.6(PWA / モバイル最適化)以降で touch ハンドラを追加する。全予定を毎回読む方式もデータ量が増えたら範囲取得へ切り替える(現状は個人利用想定で許容)。

- source_spec: `spec-2-1-calendar-priority.md`
  summary: カレンダー並べ替えのスムーズなタッチドラッグ(長押し→指で移動、自動スクロール)と DnD ライブラリ導入は Story 2.1 では見送り。デスクトップは HTML5 DnD、モバイル・キーボード・スクリーンリーダーは「▲ 上へ / ▼ 下へ」で完結。
  evidence: モバイル(スマホ縦が基準)で HTML5 DnD のタッチ操作はスクロールと競合し不安定。▲▼ が全入力方式で確実に動く堅い経路。UX の「ドラッグが主」はデスクトップで満たしつつ、Story 2.1 のスコープを膨らませない。`@dnd-kit` 等の導入は利用実態を見て判断。

- source_spec: `spec-2-3-priority-overlap-display.md`
  summary: 週ビューの重なり列数の上限(キャップ)と、それを超えたときの z-index による「前面」表示(FR-7「左右に並べきれない場合は優先度が高いものを前面にする」)は Story 2.3 では実装せず、常に左右タイル(列幅 = 100 / 列数 %)にとどめた。
  evidence: v1 は列数に上限を設けないため「並べきれない場合」が発生しない(細くはなるが必ずタイルできる)。Story 2.3 の主眼「優先度が高い = 左端」はグループ内の優先度順列詰めで達成済み。密な日(4件以上の同時重なり)の可読性課題として、列キャップ + `PositionedEvent` への z-index 付与 + WeekView 側のスタック描画を別途行う。個人カレンダーで4件同時重なりは稀。

- source_spec: `spec-2-5-home-compact-view.md`
  summary: ホームのコンパクトビューの行は開始時刻のみ(`EventListItem` の compact 表示)で、翌日以降の代表予定でも「10:00」のように日付なしで出る。今日以外のとき短い日付("12/25" 等)を添える改善は見送り。
  evidence: AC は「各行にカレンダー名・色・開始時刻」とだけ規定。当日の予定が主で、翌日以降が出るのは今日に予定が無いときに限られる。`EventListItem` に「compact だが当日以外は日付を出す」モードを足すか、compact-card 専用行を作る。UX-DR3 の lead 装飾(筆頭を大きく)も同じタイミングで検討。

- source_spec: `spec-2-5-home-compact-view.md`
  summary: コンパクトビューの `now` は events/calendars/count が変わったときにだけ取り直す。ホームを開きっぱなしにしても、過ぎた予定が自動で消えたり次の予定に繰り上がったりしない。引っ張って更新(pull-to-refresh)も未実装。
  evidence: `useFeaturedEvents` の `useMemo` が `new Date()` を読む。`syncNonce`(オンライン復帰)・画面の開き直しで更新される。可視性 API での復帰時再計算、または一定間隔の tick、pull-to-refresh のタッチジェスチャを別途足す。

- source_spec: `spec-4-1-shift-templates.md`
  summary: `shift_templates` のオフライン対応(IndexedDB 表示キャッシュ + outbox キュー)を Story 4.1 では入れなかった。オフライン時は一覧が「オフラインです」エラーになり、テンプレの作成・編集・削除もできない。
  evidence: Story 1.3(カレンダー CRUD)もオンライン先行で、後の Story 1.6 が outbox / キャッシュを足した。テンプレは低頻度データなので優先度は低い。`local-db.ts` を DB v2 にして `shiftTemplates` ストアを足し、`cache.ts` / `offline-write.ts` / `sync.ts` に `shiftTemplate` エンティティを追加する。Story 4.2(オフライン quick-shift でテンプレ一覧が要る)が来たら回収を検討。

- source_spec: `spec-4-1-shift-templates.md`
  summary: `useCalendars` / `useEvents` / `useShiftTemplates` の削除 Undo タイマは、Undo 前に次の削除をすると前のタイマを止めずに `pendingRef` を差し替える。前の孤児タイマが発火すると2件目の Undo バーが早期に消える。Story 4.1 では `useShiftTemplates` だけ `clearTimeout` を足して直した。
  evidence: `useCalendars.remove` / `useEvents.remove` に同じパターンが残っていた(`pendingRef.current = { ..., timer }` の前に `clearTimeout` が無い)。
  status: **回収済み(2026-09-11、Epic 4 retro AI-1)**。両フックの `remove` に `if (pendingRef.current) clearTimeout(pendingRef.current.timer);` を1行ずつ追加。`useEvents.test.ts` に連続削除の回帰テストを追加。

- source_spec: `spec-4-2-quick-shift.md`
  summary: quick-shift の複数日はシート内「この日から N 日」ステッパ(1〜14)。月グリッド上をドラッグ/長押しして日付範囲を選ぶ操作は未実装。週ビューの日タップからは quick-shift を開けない(週はスロット=時刻指定の予定追加のまま)。シフト実体のオフライン作成(outbox)も未対応。
  evidence: モバイル web のグリッドドラッグは scroll と競合(1.5 スワイプ / 2.1 スムーズドラッグと同じ判断)。ステッパで「1週間分」の主目的は満たせる。範囲選択 UI・週からの導線・`createShifts` の outbox 対応は利用実態を見て追加。

- source_spec: `spec-4-2-quick-shift.md`
  summary: `EventItem` にシフト属性4列(`breakMinutes` 等)を必須で追加したが、この deploy より前に IndexedDB キャッシュに入った予定レコードにはその4フィールドが無い(`undefined`)。型上は `number|null` なので、オフライン直後にだけ齟齬が出うる。
  evidence: 4.2 以前にシフト実体は存在しないので実害はほぼ無い(非シフト予定は全 null で `undefined` と同義)。オンライン再取得1回で `cacheReplace` により解消。厳密には `local-db` の読み出しで `?? null` 正規化を1か所入れれば消せる。

- source_spec: `spec-4-4-pay-card.md`
  summary: pay-card の内訳シート(`PayDetailSheet`)は各シフトの小計を per-row で `Math.round` して表示する。一方カードの合計 `amount` は各シフト実額を合算後に丸めるので、端数の出るシフトが複数あると「行の小計の和」と「表示合計」が数円ずれうる。
  evidence: `monthlyPayEstimate` が per-shift の内訳を返さないため、シートが再計算している。`monthlyPayEstimate` に `breakdown: {shiftId, subtotal}[]` を持たせて単一ソースにすれば消える。個人の時給は通常キリの良い数字なので実害は稀。

- source_spec: `spec-4-4-pay-card.md`
  summary: pay-card の月ラベルは「9月」形式で年を出さない。前月/翌月を12ヶ月ぶん送ると翌年の同月が現在月と同じラベルになり区別できない。
  evidence: モックも年なし。`monthOffset !== 0` かつ年をまたぐときだけ「2027年9月」のように出す、または送れる範囲を数ヶ月に絞る。そこまで送る利用は稀。

- source_spec: `spec-1-1-project-foundation-and-app-shell.md`
  summary: アプリシェルは `max-w-2xl`(672px)の中央寄せカラム固定。UX-DR17「タブレット/PC 幅では月ビューを広く使う」は未実装 ── PC で開くと左右に広い余白が残る。
  evidence: commit b888a15 で「中央寄せが効かない」バグ(CSS レイヤー)は直したが、そもそもの「広い画面では月グリッドを広げる」対応は別。`AppShell` の `max-w` をビュー種別やブレークポイントで可変にする、または月ビューだけ広い max-w にする。v1 の主対象はスマホなので優先度は低い。

- source_spec: `spec-3-1-google-connect-oauth.md`
  summary: `upsert_google_connection` は「既存行を select → 無ければ insert」で、同一ユーザーが同時に2回 OAuth 往復すると `connections_one_active_per_user` 部分ユニーク索引違反になり「接続に失敗しました」が出る。
  evidence: 個人利用で Google 接続を同時に2回走らせるのは稀。Story 3.4(接続解除・再接続)で `insert ... on conflict (user_id, provider) where deleted_at is null do update` に寄せるか、アドバイザリロックで直列化する。現状は1回リトライで解消する。

- source_spec: `spec-3-2-google-calendar-selection.md`
  summary: `calendars_set_priority` トリガの採番 `select coalesce(max(priority), -1) + 1` は非アトミックで、カレンダーを同時に2つ作る(ローカル連続作成・Google カレンダーの同時トグル・OAuth 往復2回)と `calendars_priority_uniq` 違反になりうる。
  evidence: Story 2.1 由来の既存問題。3.1 F7 と同根。個人利用では稀。`calendars_set_priority` トリガと `set_google_calendar_selection` / `upsert_google_connection` の calendars 作成箇所に `pg_advisory_xact_lock(hashtext('calendars_priority:' || user_id))` を1行入れるか、insert を `on conflict` でリトライして全経路をまとめて直す。

- source_spec: `spec-3-3-google-event-sync.md`
  summary: `apply_calendar_sync` の削除差分は「開始時刻が取り込み時間窓内」の行だけを対象にするため、窓の開始より前に始まり窓に重なる予定(複数日タイムド等)が Google 側で削除されても論理削除されず孤児行として残り続ける。
  evidence: 個人カレンダーで「60日以上前に始まってまだ続くタイムド予定」自体が稀で、それが Google 側で消される状況はさらに稀。削除差分の窓判定を `tstzrange(starts_at, ends_at) && tstzrange(p_window_min, p_window_max)`(重なり)へ広げるか、`ends_at` も条件に含める。3.4(取り込み失敗表示・接続解除)で sync ロジックを触るときにまとめて。

- source_spec: `spec-5-1-capacitor-foundation-and-native-projects.md`
  summary: iOS の Xcode ビルド確認は本ストーリーでは実施していない。`ios/` の雛形生成と `Info.plist` の `CFBundleURLSchemes` 登録はコードとして用意したが、Xcode を開いてのビルド・シミュレータ/実機起動・ディープリンクの動作確認は未実施。
  evidence: 開発機が Windows のため Xcode が使えず、本ストーリーでは Android のみビルド・エミュレータ(`Pixel_7_API_36`)確認まで完了させた(spec の frozen block に明記の決定)。Mac 環境が確保でき次第、`docs/capacitor-mobile-setup.md` の「iOS(Mac 確保後のフォローアップ)」手順で回収する。

- source_spec: `spec-5-2-device-calendar-connect-and-select.md`
  summary: `DeviceCalendarPicker`(および `GoogleCalendarPicker`)が `useAuth()` の `state==='loading'` 中、一瞬「先に接続してください」を表示してしまう。
  evidence: 呼び出し元が `connectionEnabled` の算出に `state==='authenticated'` を含め、さらに `useDeviceConnection`/`useGoogleConnection` 内部でも同じ判定をしているため、`enabled=false` を渡した瞬間は `loading` も `false` になり「未接続」表示が先に出る。Google 側・端末側どちらも同一構造(既存パターン)。呼び出し元の外部チェックを外し、フック内部の `state` 判定だけに一本化すれば直る。

- source_spec: `spec-5-2-device-calendar-connect-and-select.md`
  summary: `useDeviceCalendars`/`useGoogleCalendars` の `reloadCatalog()` が初回読み込み失敗時に `errorKey` をセットしない。
  evidence: 直後に呼ばれる `refresh()` が成功すれば自己修復するが、両方失敗する完全オフライン時などに一瞬「空のカタログ・エラー無し」の状態になり得る。`reloadCatalog` 内で `!result.ok` の分岐に `errorKey` 設定を足せば直る(Google/device 両方に同じ修正が要る)。

- source_spec: `spec-5-2-device-calendar-connect-and-select.md`
  summary: `useDeviceCalendars`/`useGoogleCalendars` の `toggle()`/`refresh()` に mount時以外の `cancelled` ガードが無い。
  evidence: 処理中にコンポーネントがアンマウントされると、非同期処理完了後に setState が呼ばれ得る(React 開発モードの警告対象。実害は稀)。`toggle`/`refresh` 内にも同様の `cancelled` ref を持たせれば直る(Google/device 両方に同じ修正が要る)。

- source_spec: `spec-5-3-device-calendar-sync-and-disconnect.md`
  summary: 端末カレンダーを選択解除した後、そのカレンダー由来の既存 `events` 行が二度と削除差分の対象にならず `deleted_at` が立たないまま残る(Google の同種処理も同じ設計で、Epic 3 から受容済みのパターン)。
  evidence: `syncDeviceCalendarsNow`/Google の `get_google_sync_targets` はどちらも `selected=true` の候補しか見ない。選択解除時に `calendars` 行は論理削除され画面には出なくなるが、`events` 行自体は触れられないまま DB に残留する。再選択時に古いデータが復活するリスクもある。Google・device 共通で「選択解除時に紐づく events も論理削除する」処理を足せば直る。
- source_spec: `spec-5-3-device-calendar-sync-and-disconnect.md`
  summary: 接続解除の確認シートを開く際、`getDisconnectImpact` が失敗しても件数が「—」のまま無言で残り、確認ボタンはそのまま押せる(Google 側の既存コードと同じ挙動、新規の回帰ではない)。
  evidence: `ConnectionsSection.tsx` の `openDisconnect`/`openDeviceDisconnect` はどちらも `getDisconnectImpact` の失敗時に何もしない(`if (r.ok) setImpact(...)` のみ)。エラー表示を足すか、失敗時は確認ボタンを無効化する形にすれば直る。
- source_spec: `spec-5-3-device-calendar-sync-and-disconnect.md`
  summary: `disconnectDevice` の `calendars`/`connections` 削除がそれぞれ削除件数(count)を確認していない。RLS 不一致等で0件削除でも成功扱いになり得る。
  evidence: `.delete().eq(...)` の結果は `error` の有無しか見ておらず、0件削除でも `error` は出ない。`.select('id')` を付けて返り値の件数を確認する形にすれば直る。個人利用規模では起きにくいため優先度は低い。

- source_spec: `spec-5-4-event-reminders.md`
  summary: 予定を終日に切り替えても `reminder_minutes` がDB上に残留する。
  evidence: `update()` は `syncReminderForEvent` を呼ぶため通知自体は正しく cancel され機能的実害(誤通知)は無い。`ReminderPicker` は終日予定では表示されないため可視の不整合も無い。値の残留のみ。切り替え時に `reminder_minutes: null` を同時に書けば直る。
- source_spec: `spec-5-4-event-reminders.md`
  summary: `resyncAllReminders` は変更検知をせず全件 cancel→schedule し直す簡便設計(spec Design Notes で意図的に採用)のため、ループ実行中に別操作でユーザーがリマインダーを切ったイベントに、ループが古いスナップショットで到達すると schedule をやり直してしまうことがある。
  evidence: `resyncAllReminders` は SELECT 時点のスナップショットを1件ずつ awaitでループする。個人規模の件数(数件〜数十件)ではループが一瞬で終わるため実害は小さい。diffベースの再設計をすれば消えるが、spec の簡便設計方針と衝突するため別途 Open Question として扱う。
- source_spec: `spec-5-4-event-reminders.md`
  summary: `syncGoogleCalendarsNow`/`syncDeviceCalendarsNow` はどちらも成功後に `resyncAllReminders()` を直列 `await` しており、リマインダー設定済みの予定が多いほど「同期完了」までの体感時間が伸びる。
  evidence: `reminders.ts` 自身のコメントは「呼び出し側は結果を待たなくてよい」と書いているが実装は待っている。fire-and-forget化はエラー可視性・テストの同期タイミングの設計変更を伴うため、個人規模で実害が出た時点で改めて検討する。
- source_spec: `spec-5-4-event-reminders.md`
  summary: 通知IDの導出(`deriveNotificationId`)はUUID先頭8桁が衝突する/parse不能なケースを検出も警告もしない。
  evidence: アーキテクチャ(AD-15)・spec で明記済みの「衝突は個人規模で許容」という既存の設計方針そのもの。将来ログ出力程度の検知を足す余地はあるが、現状は許容済みリスク。
- source_spec: `spec-5-4-event-reminders.md`
  summary: `CalendarScreen` が保持する `editing`/`detailEvent` は `setReminder` 成功後もそのシート表示中は更新されない(内部の `ReminderPicker` 自体の見た目は正しいが、親のイベントオブジェクトの `reminderMinutes` は古いまま)。
  evidence: 同じシート内でその後タイトル/時刻を編集して保存すると、`update()` の楽観更新が一瞬古い `reminderMinutes` を使うが、サーバ応答で最終的に解消する。実害は薄い。
- source_spec: `spec-5-4-event-reminders.md`
  summary: 過去時刻になるリマインダー(例: 5分後に始まる予定に「1時間前」を設定)は `reminder_minutes` がDBに保存されるのに、無言で通知だけスケジュールされない。
  evidence: spec I/O Matrix の範囲外(想定シナリオに未記載)。保存前に弾くか警告を出すかはUI設計判断が要るため、別途 Open Question として扱う。

- source_spec: `spec-5-6-home-widget-android.md`
  summary: **重要・要ユーザー確認**: `android/app/capacitor.build.gradle`/`android/capacitor.settings.gradle` のdiffが、`capacitor-local-notifications`(Story 5.4)・`ebarooni-capacitor-calendar`(Story 5.2)のGradleプロジェクト登録がStory 5.6(`npx cap sync android`実行時)で初めて追加されたことを示している。
  evidence: baseline(`b72ea62`)時点でこの2エントリがGradle設定に存在しなかった = Story 5.2/5.4のAndroidネイティブモジュールは、少なくともこのリポジトリのコミット履歴上は今まで一度もビルドにリンクされていなかった可能性がある。両ストーリーの記録上の「Android実機確認」がこの2プラグインの実ネイティブコード無しで行われていた可能性があり、端末カレンダー接続(5.2)・ローカル通知スケジューリング(5.4)を今すぐエミュレータで再確認することを推奨する。
- source_spec: `spec-5-6-home-widget-android.md`
  summary: TS(`widget.ts`)とKotlin(`FeaturedEventsWidget.kt`)間で `WIDGET_GROUP`/`WIDGET_ITEM_KEY`/受信者FQCNの文字列が別々にハードコードされており、単一の情報源が無い。
  evidence: コメントで「一致させること」と明記しているだけで、機械的な保証(コード生成・共有定数ファイル等)は無い。将来どちらかの値だけ変更すると、コンパイルエラーにも実行時エラーにもならずウィジェットが無言で「予定なし」を表示し続ける。クロス言語ブリッジに内在する制約で、対策コストが個人アプリの規模に見合わない。
- source_spec: `spec-5-6-home-widget-android.md`
  summary: ウィジェットはダークモード非対応(`Color.White`/`Color.Black`/`Color.DarkGray`のハードコード)。
  evidence: 実装者が仕様のDesign Notesで意図的にスコープ外とした判断。端末がダークモードの場合、ホーム画面の他のウィジェットと調子が合わない見た目になりうる。
- source_spec: `spec-5-6-home-widget-android.md`
  summary: このマシン(日本語Windows、OneDriveの非ASCIIパス)では `./gradlew.bat testDebugUnitTest`(Kotlinユニットテストの実行)が完走できない。
  evidence: Compose/Glance導入でテスト実行時クラスパスが長くなり、GradleがWindowsのコマンドライン長制限を回避するため `@argfile` 経由でクラスパスを渡す方式に切り替わるが、この引数ファイルをJVMのネイティブランチャーがOSのANSIコードページ(CP932)で読み込むため、パス中の日本語(`デスクトップ`/`AI作業場`)が文字化けし全クラスパスエントリが無効になる(新規テストだけでなくAndroid Studio生成の既存スタブも同一エラーで失敗することを確認、コードの問題ではなく環境の問題と特定済み)。コンパイル自体は成功する。恒久対処にはWindowsのシステムロケールをUTF-8に切り替える等、システム全体への変更が要り本ストーリーの範囲を超える。今後Kotlinテストを追加するたびに同じ制約に当たる見込み。

- source_spec: `spec-year-view.md`
  summary: 年ビューからのドリルダウン(日付/月見出しタップ)でlocalStorageの表示設定が「年」から「月」へ上書きされ、次回起動時の既定ビューが変わってしまう。
  evidence: `useCalendarView.ts`の`setView`は呼ばれるたびに永続化する設計で、月ビューの「他N件→リスト」でも同じ挙動をする既存パターンの延長(本機能固有の新規逸脱ではない)。年ビューは「俯瞰してから1日だけ見て戻る」使い方が想定されるため他ビューより影響が大きい可能性はあるが、既存パターンとの一貫性を優先し今回は変更しない。
- source_spec: `spec-year-view.md`
  summary: 年ビュー切替時に最大504個のセルボタンが一括マウントされ、仮想化・段階描画が無い。
  evidence: 12ヶ月×最大6週×7日の構成上避けられず、spec Design Notesで「1画面に収める」ことを明記した上での受容済みトレードオフ。低スペック端末での初回マウントもたつきの可能性はあるが、個人利用規模では実害小と判断。
- source_spec: `spec-year-view.md`
  summary: 年ビューの`goPrev`/`goNext`を連打すると、cursorの年が4桁を割り`Date`コンストラクタの2桁年解釈(19xx年扱い)でずれる。
  evidence: 到達に数百回の連続クリックが要る非現実的な入力。月送りにも同型の理論上の限界があり同様に未対策。対策コストに見合わない。
