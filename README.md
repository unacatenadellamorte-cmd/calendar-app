# マルチカレンダー

複数のカレンダー(自作 / Google / 端末)を集約し、**カレンダーごとの優先度が表示に効く**アプリ。
狭い表示枠(ウィジェット・スマートウォッチ)でも大事な予定が埋もれない。あわせてシフト入力と簡易な給料計算。

v1 は Web アプリ(スマホブラウザ最適化 + PWA)。技術構成は `_bmad-output/planning-artifacts/architecture/architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md` を参照。

## スタック

- Vite + React 19 + TypeScript + Tailwind CSS 4(SPA)
- Supabase(Postgres + Auth + Edge Functions + pg_cron)
- npm workspaces モノレポ:
  - `packages/core` — 純粋ドメイン(何も import しない。フロントと Edge Function が共有)
  - `src/ui` — 汎用コンポーネント / `src/features/*` — 機能(ui + model)
  - `src/data` — data-access(Supabase + ローカルキャッシュ)/ `src/app` — シェル・ルーティング
  - `supabase/` — マイグレーション・Edge Functions

## セットアップ

```bash
npm install
cp env.example .env.local   # Supabase の URL / anon key を記入
npm run dev                 # http://localhost:5173
```

### ローカル Supabase(任意 / Docker が必要)

```bash
supabase start   # 出力の API URL / anon key を .env.local に入れる
```

> Docker Desktop が未導入の環境では `supabase start` は動きません。`supabase/config.toml` は用意済みなので、Docker 導入後に実行してください。

## スクリプト

| コマンド            | 内容                                |
| ------------------- | ----------------------------------- |
| `npm run dev`       | 開発サーバ                          |
| `npm run build`     | `packages/core` ビルド → SPA ビルド |
| `npm run typecheck` | 型チェック                          |
| `npm run lint`      | ESLint(レイヤ逆流チェック含む)      |
| `npm run test`      | Vitest                              |
| `npm run format`    | Prettier                            |

## 開発の進め方(BMAD)

エピック・ストーリーは `_bmad-output/planning-artifacts/epics.md`、進捗は
`_bmad-output/implementation-artifacts/sprint-status.yaml`。
