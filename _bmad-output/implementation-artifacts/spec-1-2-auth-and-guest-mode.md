---
title: 'Story 1.2: メール+パスワードのアカウントとお試しモード'
type: 'feature'
created: '2026-09-06'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-1-1-project-foundation-and-app-shell.md'
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** アプリにアカウントの概念が無い。ユーザーが自分のデータを複数端末で持つには認証が要るが、登録前にまず試せる必要もある(FR16)。

**Approach:** Supabase Auth を使い、(1) メール+パスワードのサインアップ / ログイン / ログアウト、(2) 登録前でも使える「お試しモード」= Supabase の匿名サインインで実 `auth.uid()` を持つ匿名セッションを張り、後から `updateUser` で同じユーザーをメールアカウントへ昇格(データはそのまま引き継ぐ)。認証状態を1つの AuthProvider で配り、ログイン画面と最小限の導線を用意する。Supabase 未設定のローカル開発でもアプリの UI は動く(認証機能だけ無効表示)。

## Boundaries & Constraints

**Always:**
- 認証は `src/data/auth.ts` に集約(`signUpWithPassword` / `signInWithPassword` / `signOut` / `getSession` / `onAuthStateChange` を薄くラップ)。UI・hooks は supabase-js の auth を直接呼ばない(AD-9)。
- 認証状態は `src/app` の `AuthProvider` + `useAuth()` フックで配る。状態は `loading` / `guest`(匿名)/ `authenticated`(メールあり)/ `unavailable`(Supabase 未設定)。
- **お試しモード**: Supabase が設定済みで匿名サインインが有効なら、セッションが無いとき自動で匿名サインインを試みる。匿名ユーザーも実 `auth.uid()` を持つので、後続ストーリーの RLS(`user_id = auth.uid()`)がそのまま効く。
- **アカウント昇格**: 匿名セッションからメール+パスワードを設定すると、同じ `auth.uid()` のままメールアカウントになる(データ移行の別経路を作らない)。
- ログイン画面: メール / パスワードの入力、サインアップとログインの切替、エラーは `EXPERIENCE.md` Voice に沿った日本語(「メールアドレスかパスワードが違います」等)。フォーカスリング維持、44px ターゲット。
- 設定画面にアカウント欄を追加: 未ログインなら「アカウントを作成 / ログイン」、匿名なら「登録するとデータを複数端末で使えます」、ログイン済みならメール表示 + ログアウト。
- Supabase 未設定(`unavailable`)のとき: 認証 UI は「ローカル開発では認証は無効です」と表示し、アプリの他機能は通常どおり。クラッシュしない。
- `data-access` レイヤは `Result<T, AppError>` を返す(throw しない)。認証エラーは `AppError { kind, messageKey }` に正規化。
- **決定(2026-09-06)**: お試しモードは匿名サインインで実現する(ユーザー確定)。
- **決定(2026-09-06)**: Docker 未導入で Supabase ローカルが起動できないため、認証ラッパーは supabase クライアントをモックした単体テストで検証する。サインアップ / ログイン / 昇格の実フロー確認は Supabase 接続後にユーザーが実施する(このストーリーの完了条件からは外す)。

**Never:**
- 独自のパスワードハッシュ・トークン発行・セッション管理を作らない(Supabase Auth に委ねる)。
- ソーシャルログイン(Google 等)をこのストーリーで実装しない(Epic 3)。ただし「匿名のまま Google 接続を試みたらメール登録を促す」ための判定関数 or フラグの置き場所は用意してよい。
- パスワードリセット / メール確認フローの作り込みはしない(Supabase の既定に任せ、最小の導線のみ)。
- DB テーブル・マイグレーション・RLS ポリシーをこのストーリーで書かない(テーブルは 1.3 から。RLS は各テーブル作成時に付ける)。
- ルートを認証でガードしない(Epic 1 の全機能は匿名 / 未ログインでも使える)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 初回起動(Supabase 設定済み・セッション無し) | 匿名サインイン有効 | 自動で匿名セッションを張り、状態は `guest`。アプリは通常表示 | 匿名サインイン失敗時は `unavailable` 相当にフォールバックし、警告1行。クラッシュしない |
| サインアップ | 有効なメール + パスワード | アカウント作成、状態 `authenticated`、メール表示 | 既存メール / 弱いパスワード → 正規化した日本語メッセージ |
| ログイン | 登録済みメール + 正しいパスワード | 状態 `authenticated` | 資格情報不一致 → 「メールアドレスかパスワードが違います」 |
| ログアウト | ログイン済み | セッション破棄。設定済みかつ匿名可なら再度 `guest`、不可なら未ログイン表示 | N/A |
| 匿名 → 昇格 | 匿名セッション + 新規メール + パスワード | 同じ `auth.uid()` のまま `authenticated` に、警告なし | メール重複 → 日本語メッセージ、匿名セッションは維持 |
| Supabase 未設定 | env 無し | 状態 `unavailable`。認証 UI は無効表示。他機能は通常 | N/A(警告は Story 1.1 の supabase.ts が1行出す) |
| 認証状態の変化 | 別タブでログアウト等 | `onAuthStateChange` 経由で `useAuth()` が更新される | N/A |

</frozen-after-approval>

## Code Map

- `src/data/supabase.ts` -- `supabase: SupabaseClient | null` と `createSupabaseClient(env)`。auth.ts はこの `supabase` を使う。`null` のとき `unavailable`。
- `src/data/env.ts` -- `env.hasSupabase` で設定有無を判定。
- `src/main.tsx` -- `<BrowserRouter><AppRoutes /></BrowserRouter>`。ここを `<AuthProvider>` でラップする。
- `src/app/routes.tsx` -- `routes` 配列(非公開)+ `AppRoutes`(公開)。ガードは不要。
- `src/app/AppShell.tsx` -- `<Outlet />` + `<BottomTabs />`。
- `src/features/settings/ui/SettingsScreen.tsx` -- テーマ切替のみ。ここにアカウント欄セクションを追加。
- `src/features/settings/model/useTheme.ts` -- localStorage の try/catch パターンの手本。
- 既存の `AppError` 型は未定義 -- このストーリーで `src/data/result.ts`(`Result<T,E>` と `AppError`)を新設する。
- テスト: `src/test/setup.ts`(jsdom + jest-dom)、`vitest` は `globals: true`。認証テストは supabase クライアントをモック。

## Tasks & Acceptance

**Execution:**
- [ ] `src/data/result.ts` -- `Result<T, E>` 型(`ok` / `err`)と `AppError = { kind: string; messageKey: string }`、生成ヘルパ -- 規約「エラー形」の土台(1.4 以降も使う)
- [ ] `src/data/auth.ts` -- supabase.auth の薄いラッパ。`signUpWithPassword` / `signInWithPassword` / `signOut` / `getSession` / `onAuthStateChange` / `signInAnonymously` / `upgradeToPassword`。すべて `Result` を返し、Supabase エラーを `AppError` に正規化 -- AD-9
- [ ] `src/data/auth.errors.ts`(または auth.ts 内)-- Supabase の代表的な認証エラーを日本語 `messageKey` に対応づける表 -- UX-DR14
- [ ] `src/app/AuthProvider.tsx` -- セッション取得 + `onAuthStateChange` 購読 + 初回の匿名サインイン試行。`AuthState`(`loading` / `guest` / `authenticated` / `unavailable`)を context に載せる。`useAuth()` エクスポート -- 認証状態の一元配布
- [ ] `src/main.tsx` -- `<AuthProvider>` で `<AppRoutes />` をラップ -- 配線
- [ ] `src/features/auth/ui/AuthScreen.tsx` -- メール / パスワードのフォーム、サインアップ↔ログイン切替、送信中状態、エラー表示。匿名セッション中なら「昇格」文言 -- FR16 / UX-DR14 / UX-DR15
- [ ] `src/features/auth/model/useAuthForm.ts` -- フォーム状態と送信ロジック(`auth.ts` を呼ぶ)。バリデーション(メール形式、パスワード最小長)-- ロジック分離
- [ ] `src/app/routes.tsx` -- `/auth` ルートを追加(タブ外、設定から遷移)-- 導線
- [ ] `src/features/settings/ui/SettingsScreen.tsx` -- アカウント欄を追加(状態別の表示 + ログアウト + `/auth` への導線)-- 設定への露出
- [ ] `src/features/settings/ui/AccountSection.tsx` -- 上記を独立コンポーネントに -- 見通し
- [ ] `src/data/auth.test.ts` -- supabase クライアントをモックし、I/O マトリクスの各行(サインアップ成功 / ログイン失敗 / ログアウト / 匿名 / 昇格 / 未設定 / 状態変化)を検証 -- 回帰防止
- [ ] `src/app/AuthProvider.test.tsx` -- `unavailable` と `guest` の初期化、`useAuth()` の値、認証状態変化の反映をテスト -- 回帰防止
- [ ] `src/features/auth/model/useAuthForm.test.ts` -- バリデーションと送信結果の反映をテスト -- 回帰防止

**Acceptance Criteria:**
- Given Supabase をモックした環境, when サインアップ → ログアウト → ログイン, then `auth.ts` が対応する supabase.auth を1回ずつ呼び、`Result` の成否と `AuthState` 遷移が期待どおり
- Given 匿名セッション, when メール + パスワードで昇格, then `updateUser` が呼ばれ、状態が `authenticated` になり、`auth.uid()` は変わらない(モックで確認)
- Given Supabase 未設定, when アプリを起動, then `AuthState` は `unavailable`、認証 UI は無効表示、ホーム / カレンダー / 設定は通常表示、コンソール警告は Story 1.1 の1行のみ
- Given ログイン画面, when 資格情報が不一致, then 日本語のエラー文言(コード非表示、感嘆符なし)が表示される
- Given `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build`, when 実行する, then すべて成功する

## Implementation Notes

<!-- 実装中に追記 -->

## Verification

**Commands:**
- `npm run typecheck` -- expected: 型エラー0
- `npm run lint` -- expected: エラー0
- `npm run test` -- expected: 認証関連の新規テストを含め全パス
- `npm run build` -- expected: 成功

**Manual checks:**
- Supabase 未設定で `npm run dev`: 設定画面のアカウント欄が「ローカル開発では認証は無効」表示、他画面は正常。
- (Supabase 接続後)サインアップ → ログアウト → ログイン、匿名からの昇格を実機確認。
