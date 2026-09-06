---
title: 'Story 1.1: プロジェクト基盤とアプリシェル'
type: 'feature'
created: '2026-09-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e7087cc5f39762703a7d1de152fdec65a9f6f910'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** カレンダーアプリの実装が空のリポジトリから始まる。以降のすべてのストーリーが載る土台(モノレポ / スタック / デザイントークン / アプリシェル / Supabase 接続)が無い。

**Approach:** Vite + React 19 + TypeScript + Tailwind CSS 4 の npm ワークスペース・モノレポを立ち上げる。`packages/core`(純粋ドメインの器)と `src/`(SPA)に分け、`DESIGN.md` のトークンを CSS 変数 + Tailwind に落とし、下タブ3つ(ホーム / カレンダー / 設定)のシェルと各タブの空画面を作る。Supabase クライアントを初期化し、`supabase init` によるローカル開発設定を置く。この段階では機能ロジックは実装しない。

## Boundaries & Constraints

**Always:**
- モノレポ構成は `packages/core`(何も import しない純粋ドメイン。フロントと将来の Edge Function が共有)、`src/ui`(汎用コンポーネント)、`src/features/*`(ui + model)、`src/data`(data-access)、`src/app`(シェル・ルーティング)、`supabase/`。tsconfig の path alias で `@core`、`@/…` を通す。
- デザイントークンは `DESIGN.md` frontmatter の値をそのまま使う。light は素の `:root`、dark は `@media (prefers-color-scheme: dark)` かつ `:root[data-theme="dark"]`、light 明示は `:root[data-theme="light"]`。色・余白・角丸・タイポは CSS 変数として定義し、Tailwind 4 の `@theme` からその変数を参照する。
- 下タブは3つ(ホーム / カレンダー / 設定)のみ。ドロワー・ハンバーガーなし。スマホ縦・単一カラムを基準にしたレイアウトシェル。
- Supabase クライアントは `src/data/supabase.ts` で1つだけ生成。URL / anon key は環境変数(`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`)。未設定なら起動時にコンソール警告(クラッシュはしない)。
- **決定(2026-09-06)**: この環境には Docker / Supabase CLI が無い可能性が高い。`supabase/config.toml` は `supabase init` で生成して置くが、`supabase start` の起動確認はこのストーリーの受け入れ基準から外し、「Docker 導入後に実施」として保留する。それ以外の検証(build / typecheck / lint / test / dev の目視)で 1.1 を完了とする。
- アクセシビリティ: タブは `role="tab"` 相当のセマンティクス、キーボードで移動可能、フォーカスリングを消さない、タップターゲット 44px 以上。
- `.env.local` は gitignore 済み。`.env.local.example` を置く。

**Never:**
- 予定 / カレンダー / シフト / 優先度 / 取り込み のロジックや UI をこのストーリーで実装しない(それぞれ後続ストーリー)。
- DB テーブル・マイグレーション・RLS をこのストーリーで書かない(`calendars` は 1.3、`events` は 1.4)。
- ルーティングライブラリやUIキットを増やさない。React Router 以外のルーターや shadcn 等のコンポーネント群は入れない。
- 認証フローを実装しない(1.2)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 初回起動 | 環境変数あり | 下タブ3つのシェルが表示、既定は「ホーム」タブ、各タブは見出しだけの空画面 | N/A |
| タブ切替 | 「カレンダー」「設定」をタップ / キーボード操作 | 対応する空画面へ遷移、URL が変わる、フォーカスが移る | N/A |
| テーマ切替 | 設定画面で「端末追従 / ライト / ダーク」を選ぶ | `:root` の `data-theme` が変わり全トークンが即時反映、選択は localStorage に保存し次回復元 | localStorage 例外時は端末追従にフォールバック |
| Supabase 環境変数なし | `VITE_SUPABASE_URL` 未設定で起動 | アプリは起動しシェルは表示、コンソールに警告1行 | クラッシュしない |

</frozen-after-approval>

## Code Map

- リポジトリは実質空(`_bmad/`、`_bmad-output/`、`.gitignore` のみ)。既存アプリコードなし。このストーリーが初期構造を作る。
- `.gitignore` -- 既に `node_modules/` `dist/` `.env` `.env.local` `_bmad/render/` `supabase/.branches/` `supabase/.temp/` を含む。必要に応じて追記。
- `_bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/DESIGN.md` -- トークンの出所(frontmatter の colors / typography / spacing / rounded)。
- `_bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/mockups/*.html` -- シェル・タブバーの見た目の参考(このストーリーでは空画面でよい)。

## Tasks & Acceptance

**Execution:**
- [x] `package.json`(ルート) -- npm workspaces(`packages/*`)、スクリプト `dev` / `build` / `preview` / `typecheck` / `lint` / `test` を定義 -- モノレポの起点
- [x] `packages/core/package.json`, `packages/core/src/index.ts`, `packages/core/tsconfig.json` -- 純粋ドメインパッケージの器(中身は最小のプレースホルダ export)-- 後続ストーリーが selection / priority / pay-calc を足す
- [x] `tsconfig.json` + `tsconfig.app.json` + `tsconfig.node.json` -- strict、path alias `@core` → `packages/core/src`、`@/*` → `src/*` -- AD-10 のレイヤ分離を型で支える土台
- [x] `vite.config.ts` -- React プラグイン、alias 解決、`vite-plugin-pwa` は入れるが `disable: true` / `injectRegister: null` で無効化(有効化は 1.6)、Vitest の test 設定も内包 -- ビルド設定
- [x] `index.html`, `src/main.tsx` -- エントリ。React 19 の `createRoot` -- 起動点
- [x] `src/styles/tokens.css` -- `DESIGN.md` の全トークンを CSS 変数で定義(light / dark / `[data-theme]`)-- UX-DR1
- [x] `src/styles/global.css` -- リセット、`body` に背景・フォント、Tailwind の読み込み、`@theme` でトークン変数を Tailwind に橋渡し -- UX-DR1
- [x] CSS 内 `@theme`(`src/styles/global.css`)-- Tailwind 4 の CSS-first 設定でトークンを参照 -- UX-DR1
- [x] `src/app/AppShell.tsx`, `src/app/routes.tsx` -- React Router で3ルート、下タブバー、単一カラムのレイアウト、アクティブタブ強調(アクセント色)-- UX-DR12
- [x] `src/app/BottomTabs.tsx` -- タブバーコンポーネント。キーボード操作・フォーカス可視・44px ターゲット -- UX-DR12 / UX-DR15
- [x] `src/features/home/ui/HomeScreen.tsx`, `src/features/calendar/ui/CalendarScreen.tsx`, `src/features/settings/ui/SettingsScreen.tsx` -- 見出しだけの空画面 -- シェルの受け皿
- [x] `src/features/settings/model/useTheme.ts`, 設定画面のテーマ切替 UI -- 端末追従 / ライト / ダークの3択、localStorage 永続化(try/catch)-- UX-DR2
- [x] `src/data/supabase.ts` -- `createSupabaseClient(env)` を1回。env 未設定時はコンソール警告 -- AD-1 / AD-9 の土台
- [x] `src/data/env.ts` -- 環境変数の読み取りと検証を1か所に -- 設定の一元化
- [x] `env.example`(`.env.local.example` はハーネス制限で不可)-- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` のテンプレ -- セットアップ手引き
- [x] `supabase/config.toml`(`supabase init` で生成)、`supabase/migrations/.gitkeep`、`supabase/functions/.gitkeep` -- デプロイ規約(Supabase CLI 管理)
- [x] `eslint.config.js`, `.prettierrc.json`, `.prettierignore` -- lint / format 設定。`import/no-restricted-paths` でレイヤ逆流を検出 -- AD-10
- [x] `README.md` -- セットアップ手順 -- オンボーディング
- [x] `src/app/__tests__/shell.test.tsx` + `src/data/supabase.test.ts` + `src/features/settings/model/useTheme.test.ts` + `packages/core/src/index.test.ts` -- I/O マトリクスの各行を含むテスト -- 回帰防止
- [x] `.gitattributes` -- 改行コードを LF に統一(Windows 対応)

**Acceptance Criteria:**
- Given クローン直後のリポジトリ, when `npm install && npm run build` を実行, then `packages/core` と SPA がエラーなくビルドされる
- Given 開発サーバ, when `npm run dev` で開く, then 下タブ3つのシェルが表示され、既定は「ホーム」、各タブは見出しだけの空画面で、タブ切替で URL が変わる
- Given 端末が dark / light, when アプリを開く or 設定でテーマを切り替える, then `DESIGN.md` のトークンが両テーマとも正しく適用され、選択は次回起動時に復元される
- Given `VITE_SUPABASE_URL` 未設定, when 起動する, then クラッシュせずシェルが表示され、コンソールに警告が1行出る
- Given `npm run typecheck` と `npm run lint` と `npm run test`, when 実行する, then すべて成功する
- Given `supabase/config.toml` が `supabase init` で生成されている, when リポジトリを確認する, then ファイルが存在する(`supabase start` の起動確認は Docker 導入後に別途実施)

## Implementation Notes

- **スタック確定版**: Vite 7.3 / React 19 / TypeScript 5.9 / Tailwind CSS 4(`@tailwindcss/vite` プラグイン、CSS-first `@theme`)/ react-router-dom 7(宣言的 `<BrowserRouter>` + `useRoutes`)/ @supabase/supabase-js 2 / vite-plugin-pwa 1(このストーリーでは `disable: true`)。テストは Vitest 3 + Testing Library + jsdom。
- **tsconfig は3分割**: ルート `tsconfig.json`(solution)→ `tsconfig.app.json`(src + packages/core、noEmit、alias)/ `tsconfig.node.json`(vite.config、node types)。`typecheck` は `tsc -b`。
- **ルーティング**: 当初 `createBrowserRouter`(data router)で組んだが、jsdom + Node 24 + undici の `AbortSignal` 不整合で RR7 の data router がテスト中に unhandled rejection を起こした。宣言的 `<BrowserRouter>` + `useRoutes(routes)` に変更して回避。`routes` 配列は `routes.tsx` 内に閉じ、公開は `<AppRoutes />` コンポーネントのみ(react-refresh 警告も解消)。
- **`.env.local.example`**: ハーネスが `.env*` 名のファイル書き込みを拒否するため `env.example`(先頭ドットなし)にした。`.gitignore` は `.env` / `.env.*` を無視しつつ `!env.example` で例外。
- **npm install スクリプト承認**: この環境の npm は install スクリプトを既定で実行しない設定。`esbuild` と `unrs-resolver` の postinstall を `npm approve-scripts` で承認(`package.json` の `allowScripts` に記録)。esbuild のバイナリ取得に必須。
- **Supabase**: CLI はインストール済みだが Docker 未導入のため `supabase start` は未検証(Open Question の決定どおり)。`supabase init` で `config.toml` は生成済み。
- **検証結果**: `npm run build` / `tsc -b` / `eslint .` / `vitest run`(12 tests、4 ファイル)すべて成功。`npm run dev` は未起動(CLI セッションのため)。目視確認は Story 完了後にユーザーが実施。
- **タブのアイコン**: プレースホルダの記号(▦ / ▤ / ⚙)。正式なアイコンセットは後続で検討。

## Verification

**Commands:**
- `npm install` -- expected: 依存解決、ワークスペースリンク成功
- `npm run build` -- expected: `packages/core` と SPA が成功、`dist/` 生成
- `npm run typecheck` -- expected: 型エラー0
- `npm run lint` -- expected: エラー0(レイヤ逆流ルール含む)
- `npm run test` -- expected: シェルのテストがパス
- `test -f supabase/config.toml` -- expected: 存在する(`supabase start` の起動確認は Docker 導入後)

**Manual checks:**
- `npm run dev` を開き、3タブの切替、テーマ3択の切替と再読み込み後の復元、Supabase 環境変数を外したときのコンソール警告を目視確認。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズをこのセッションで実施 — この環境ではバックグラウンドのサブエージェントを使えないため)。*

| 所見 | 検証 | 判定 | ルート |
| --- | --- | --- | --- |
| `src/main.tsx` の `import('@/data/supabase')` が fire-and-forget の Promise で `.catch` なし → import 失敗時に unhandled rejection | ローカル静的モジュールなので実際には失敗しないが、副作用 import に動的 import を使う理由もない | low | patch(静的 `import '@/data/supabase'` に変更、適用済み) |
| `vite.config.ts` の `VitePWA` に `disable: true` と併せて `registerType: 'prompt'` の死んだ設定 | `disable: true` で全設定が無効。害はないが誤読の元 | low | patch(死んだ行を削除、適用済み) |
| `package.json` の `allowScripts`(esbuild / unrs-resolver)がこの環境固有 → 他マシン / CI で `npm ci` 時に install スクリプトが走らずビルド不能になりうる | この環境の npm が install スクリプトを既定で止める設定。CI は未決定(アーキで Deferred)。ストーリー起因ではなく環境起因 | medium(未検証・CI 導入時) | defer |
| `Screen.tsx` の `pb-24`(96px)がタブバー高さ(56px + safe-area)に対する経験則のマジックナンバー | 余白過多だが表示は崩れない。トークン化は複雑さを足す | low | reject(日常利用で当たらず、修正が単純な訂正を超える) |
| 44px タップターゲット / フォーカスリングがコードで表現されるがテストされていない(jsdom はレイアウトを計算しない) | `min-h-14`(56px)と `:focus-visible` outline で担保。E2E / 視覚監査は 1.1 の範囲外 | low | reject(仕組みはコードにあり、検証手段が単体テストの守備範囲外) |
| `import/no-restricted-paths` の `src/data` ゾーンが `except: ['../data/index.ts']` を参照するが `src/data/index.ts` 未作成 | ルールは先行定義。features → data の import はまだ無いので実害ゼロ。1.4 で `src/data/index.ts` 作成時に有効化 | low | reject(将来ストーリーで自然に解消) |
| PWA マニフェスト / favicon 未整備で dev 時に favicon 404 | UX-DR18 / Story 1.6 の範囲。1.1 の Non-goal | — | 対象外(intent が 1.6 に切り出し済み) |
