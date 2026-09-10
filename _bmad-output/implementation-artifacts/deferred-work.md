# 先送りにした作業

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
  evidence: `useCalendars.remove` / `useEvents.remove` に同じパターンが残る(`pendingRef.current = { ..., timer }` の前に `clearTimeout` が無い)。連続削除は稀だが、両フックにも同じ1行を足せば揃う。

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
