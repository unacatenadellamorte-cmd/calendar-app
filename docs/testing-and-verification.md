# テストと検証の方針

> 2026-09-11 制定。Epic 1〜4 のレトロ共通のオープンアイテム
> (Epic 1 F6 / Epic 2 F3 / Epic 3 F5)への回答。
> ARCHITECTURE-SPINE の「data-access は `supabase start` で結合テスト」は
> **ローカルに Docker が無く実行できなかった**ため、実態に合わせて明文化し直す。

## 背景 ── なぜこの文書が要るか

Epic 1 / 2 / 3 で **3 回連続**、「単体テストで見えない層」の欠陥が
「done」の後に実環境で発覚した:

| Epic | 欠陥 | 発覚 | 修正 |
|---|---|---|---|
| 1 | `global.css` のリセットが `@layer base` の外 → Tailwind の余白ユーティリティを全上書き | 実ブラウザ(3日後) | `b888a15` |
| 2 | `calendars.priority DEFAULT 0` で before-insert 採番トリガが死ぬ → 2件目のカレンダー作成失敗 | 実 DB 接続 | `1cccad2` |
| 3 | pg_cron → 関数ゲートウェイが `apikey` ヘッダも要求 | 実 cron / 手動 http_post | `9a98c85` |

純ロジック(`packages/core`)のテストがどれだけ厚くても、
**実 Postgres・実ブラウザのレイアウト・外部連携の配線**はカバーできない。

## 1. 自動テストで覆う範囲(446 tests、`npm test`)

| 層 | やり方 | 例 |
|---|---|---|
| ドメイン純ロジック | `packages/core` を Vitest で単体(**必須**) | `compareEventsForList` / `selectFeaturedEvents` / `workedMinutes` / `monthlyPayEstimate` / `normalizeGoogleEvent` |
| data-access | `@/data/supabase` の**クエリビルダをモック**して呼び出し列を検証 | `calendars.ts` / `events.ts` / `connections.ts` が Result を返す・オフライン分岐・`selectActive` を通る |
| view-model(hooks) | `@/data/*` をモックして `renderHook` | 楽観更新 / ロールバック / Undo タイマ / エラーキーのクリア |
| UI コンポーネント | jsdom + Testing Library | フォームのバリデーション文言 / シートの開閉 / a11y ツリー |
| Edge Function の純ロジック | `packages/core` に切り出して単体 + `google-events.parity.test.ts` で `_shared/` 生成物とのドリフト検出 | 正規化ロジック |

## 2. 自動テストで覆えない範囲(意識された穴)

| 覆えないもの | 理由 |
|---|---|
| 実 Postgres の RLS・トリガ・制約・マイグレーション | ローカルに Docker が無く `supabase start` 不可 |
| 実ブラウザのレイアウト / CSS カスケード / `@layer` | jsdom はレイアウトを解釈しない |
| PWA の Service Worker / インストール / オフライン SW | dev サーバーでは `vite-plugin-pwa` が SW を出さない |
| Edge Function の実行時(Deno ランタイム、ゲートウェイ認証) | ローカルに Deno が無い |
| ライブ pg_cron のスケジュール発火 | prod でしか動かない |
| Android Gradle / iOS Xcode のネイティブビルド(`ios/`, `android/`) | `npm run typecheck` / `lint` / `test` / `build` は Web バンドル(`dist/`)しか見ておらず、ネイティブプロジェクトのコンパイル可否は検知できない。`cd android && gradlew.bat assembleDebug`(Windows)/ Xcode ビルド(Mac)を明示的に実行する必要がある(`docs/capacitor-mobile-setup.md`) |

**ステージング用の Supabase プロジェクトは当面持たない**(コスト・セットアップ、個人配布規模)。
利用が増える / 2人目の開発者が入る ときに再検討する。

## 3. 覆えない層の代償コントロール(必須の手順)

### 3a. マイグレーション / RPC / トリガ / RLS を触ったストーリー
1. SQL を目視レビュー(「列 default は before-insert トリガより先に評価される」等、
   SQL の基本挙動を1つずつ確認する)
2. `supabase db push` で prod(唯一の DB)へ適用
3. **実アプリを触って**、変更が効いていること + 既存動線が壊れていないことを確認
4. スペックの検証欄に「実 DB で確認」と、確認した具体的な動線を書く

### 3b. Edge Function を触った / デプロイするとき
1. 純ロジックは `packages/core` に切り出して単体テスト(関数本体は薄く保つ)
2. `_shared/` の生成物を使う場合は `npm run sync:edge-shared` → 生成物もコミット
   (`google-events.parity.test.ts` がドリフトを検出する)
3. `supabase functions deploy <name>`
4. **デプロイ後に手動スモーク1回**:
   - `sync-calendars` は `net.http_post`(`Authorization` + `apikey` の2ヘッダ、
     `docs/google-connection-setup.md` C-7)で 200 + `{"ok":true,...}` を確認
   - `oauth-exchange` / `google-calendars` は実アプリの接続フローで確認

### 3c. `global.css` / デザイントークン / レイアウト(`max-w` / grid / flex / spacing)を触ったストーリー
- **必ず実ブラウザ(`npm run dev`)で目視**。jsdom / 単体テストでは CSS カスケードも
  レイアウトも検証できない。スペックの検証欄に「実ブラウザでレイアウト確認」と書く。
- 特に `@layer` の内外を意識する(レイヤー外の宣言は全レイヤーより優先される)。

### 3d. PWA(manifest / SW / オフライン)を触ったストーリー
- `npm run build && npm run preview` でインストール / スプラッシュ / オフライン閲覧を
  1回確認(dev サーバーでは SW が出ない)。

### 3e. エピック完了時
- そのエピックの全ストーリーの受け入れ基準(epics.md の Given/When/Then)を
  **実アプリで1つずつ**通す(Phase C 方式)。検証記録を
  `_bmad-output/implementation-artifacts/` に残す。
- `bmad-retrospective` を回す。

## 4. この方針で残るリスク

- prod が唯一の DB なので、マイグレーションのミスは prod に出る。破壊的変更の前は
  バックアップ / `deleted_at` ソフトデリート / FK cascade を前提にする。
- 手動スモークは人依存。デプロイ頻度が上がったら CI + ステージングを入れる。
