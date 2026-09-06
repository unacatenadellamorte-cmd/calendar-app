# Tech verification review — アーキテクチャスパイン

*committed な技術判断が web / 現物確認済みか。*

## Verdict

主要な判断は 2026-08 時点の web で確認済み。Vite / vite-plugin-pwa のマイナーは未固定(フロント形態が [ASSUMPTION] のため許容)。

| 技術 | 確認状況 |
|---|---|
| Next.js 16.3.4(対案側) | web 確認(nextjs.org, 2026-08) |
| Capacitor 8 | web 確認(Next.js 15/16 との組み合わせ実績) |
| Supabase Auth Google + `provider_refresh_token` | web 確認(supabase docs / gh discussions)。**Supabase はプロバイダトークンを自動更新しない** → AD-3/AD-4 でサーバー側必須の根拠 |
| Google Calendar API v3 | 長期安定版。読み取りスコープのみ要求 |
| pg_cron on Supabase | Supabase の標準機能(既知) |
| React 19 / TypeScript 5.x / Tailwind 4 | 現行。human-book で使用実績 |
| Vite 7.x / vite-plugin-pwa | **個別バージョン未確認**。フロント形態確定時にマイナーまで固定する(スパインに注記済み) |

## 指摘

- **low**: Vite・vite-plugin-pwa のバージョン未固定。フロント形態(Vite SPA か Next.js か)が未確定のため現時点では妥当。形態確定時に固定。
