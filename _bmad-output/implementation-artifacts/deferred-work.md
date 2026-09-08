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
