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
