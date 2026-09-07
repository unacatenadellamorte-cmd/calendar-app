# 先送りにした作業

- source_spec: `spec-1-1-project-foundation-and-app-shell.md`
  summary: `package.json` の `allowScripts`(esbuild / unrs-resolver)が開発環境固有で、CI や他マシンで `npm ci` するとネイティブバイナリの postinstall が走らずビルドできない可能性がある。
  evidence: この環境の npm は install スクリプトを既定でブロックする設定になっており、承認結果が `package.json` の `allowScripts` に書き込まれた。CI は未決定(ARCHITECTURE-SPINE で Deferred)。CI を導入するストーリーで、`.npmrc` や CI 設定でネイティブ依存(esbuild)のビルドを担保する方針を決める。標準的な npm 環境なら現状の `package.json` でそのまま動く。

- source_spec: `spec-1-4-events-crud.md`
  summary: オフライン時の書き込みキュー(IndexedDB 永続化・順序保持・オンライン復帰でフラッシュ)は Story 1.4 では実装せず Story 1.6(PWA + オフライン)に委ねた。
  evidence: Story 1.4 のスコープを「予定 CRUD + オンライン前提の楽観更新」に絞った。epic-1-context の 1.4 AC にはオフラインキューが含まれるため、1.6 で必ず回収する。1.4 ではオフライン時「保存できません」を表示するにとどめる。
