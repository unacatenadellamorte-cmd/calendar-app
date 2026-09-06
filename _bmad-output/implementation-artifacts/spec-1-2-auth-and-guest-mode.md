---
title: 'Story 1.2: メール+パスワードのアカウントとお試しモード'
type: 'feature'
created: '2026-09-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a5390a82b1bcce9b613f41a2d601c13cf0af1404'
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
- [x] `src/data/result.ts` -- `Result<T, E>` 型(`ok` / `err`)と `AppError = { kind, messageKey, cause? }`、生成ヘルパ -- 規約「エラー形」の土台(1.4 以降も使う)
- [x] `src/data/auth.ts` -- supabase.auth の薄いラッパ。`signUpWithPassword` / `signInWithPassword` / `signOut` / `getSession` / `onAuthStateChange` / `signInAnonymously` / `upgradeToPassword` / `isAuthAvailable` / `looksLikeEmail`。すべて `Result` を返す -- AD-9
- [x] `src/data/auth.errors.ts` -- Supabase の認証エラーを `AppError` に正規化(`normalizeAuthError`)+ `messageKey` → 日本語文言(`authMessage` / `AUTH_MESSAGES`)-- UX-DR14
- [x] `src/app/auth-context.ts` + `src/app/AuthProvider.tsx` -- context/hook を `auth-context.ts` に、Provider を `AuthProvider.tsx` に分離(fast-refresh 警告回避)。`AuthState`(`loading` / `guest` / `authenticated` / `unavailable`)、初回 + サインアウト後の匿名サインイン -- 認証状態の一元配布
- [x] `src/main.tsx` -- `<AuthProvider>` で `<BrowserRouter>` をラップ -- 配線
- [x] `src/features/auth/ui/AuthScreen.tsx` -- メール / パスワードのフォーム、サインアップ↔ログイン切替、送信中状態、エラー表示、匿名時「昇格」文言、`unavailable` 時は無効表示 -- FR16 / UX-DR14 / UX-DR15
- [x] `src/features/auth/model/useAuthForm.ts` -- フォーム状態と送信ロジック。バリデーション(メール形式、パスワード6文字以上)-- ロジック分離
- [x] `src/app/routes.tsx` -- `/auth` ルートを追加(タブ外)-- 導線
- [x] `src/features/settings/ui/SettingsScreen.tsx` + `AccountSection.tsx` -- アカウント欄を独立コンポーネントで追加(状態別表示 + ログアウト + `/auth` 導線)-- 設定への露出
- [x] `src/data/auth.test.ts`(11)/ `src/data/auth.errors.test.ts`(4)-- モックした supabase で I/O マトリクス各行を検証 -- 回帰防止
- [x] `src/app/AuthProvider.test.tsx`(5)-- `unavailable` / `guest` 初期化、状態変化、サインアウト後の再匿名化 -- 回帰防止
- [x] `src/features/auth/model/useAuthForm.test.ts`(6)-- バリデーションと送信結果 -- 回帰防止

**Acceptance Criteria:**
- Given Supabase をモックした環境, when サインアップ → ログアウト → ログイン, then `auth.ts` が対応する supabase.auth を1回ずつ呼び、`Result` の成否と `AuthState` 遷移が期待どおり
- Given 匿名セッション, when メール + パスワードで昇格, then `updateUser` が呼ばれ、状態が `authenticated` になり、`auth.uid()` は変わらない(モックで確認)
- Given Supabase 未設定, when アプリを起動, then `AuthState` は `unavailable`、認証 UI は無効表示、ホーム / カレンダー / 設定は通常表示、コンソール警告は Story 1.1 の1行のみ
- Given ログイン画面, when 資格情報が不一致, then 日本語のエラー文言(コード非表示、感嘆符なし)が表示される
- Given `npm run typecheck` / `npm run lint` / `npm run test` / `npm run build`, when 実行する, then すべて成功する

## Implementation Notes

- **匿名サインイン**: `supabase.auth.signInAnonymously()` を使用(supabase-js 2.115)。`AuthProvider` は初回に `getSession` → 無ければ `signInAnonymously`。`onAuthStateChange` で `session === null`(サインアウト等)になったら**匿名セッションを張り直す**(matrix「ログアウト → 再度 guest」)。多重発行は `anonInFlight` ref でガードし、解決後に false に戻す(Story 1.1 の一発 ref だと StrictMode の cancel 済み初期化が retry できない問題を修正)。
- **context/hook の分離**: `useAuth` と `AuthContext` を `src/app/auth-context.ts` に、`AuthProvider` コンポーネントを `AuthProvider.tsx` に。同一ファイルで component と hook を両方 export すると react-refresh 警告が出るため(Story 1.1 の routes.tsx と同じ対処)。consumer は `@/app/auth-context` から `useAuth` を import。
- **エラー正規化**: `normalizeAuthError` が Supabase の `code` / `status` / メッセージ文字列から `AppError` を作り、`messageKey`(`auth/*`)を返す。表示層は `authMessage(messageKey)` で日本語に。コード・英語メッセージ・感嘆符は出さない。
- **`upgradeToPassword`**: `updateUser({ email, password })`。匿名ユーザーの `auth.uid()` は変わらないので、データ移行の別経路は作っていない(アーキ AD-1 と整合)。
- **Supabase 未設定**: `supabase` が null のとき `isAuthAvailable()` が false → `AuthState = 'unavailable'`、非同期処理を一切走らせない。`AuthScreen` / `AccountSection` は無効表示。警告は Story 1.1 の supabase.ts の1行のみ。
- **未検証**: 実際のサインアップ / ログイン / 匿名昇格フロー(Docker 未導入で Supabase ローカルが起動できない)。38 tests(8 ファイル)は supabase クライアントをモックして I/O マトリクス全行をカバー。build / typecheck / lint green。実フロー確認は Supabase 接続後にユーザーが実施。
- **Supabase 側の設定が別途必要**: 匿名サインインの有効化(Authentication 設定)。プロジェクト作成時に .env.local へ URL / anon key。

## Verification

**Commands:**
- `npm run typecheck` -- expected: 型エラー0
- `npm run lint` -- expected: エラー0
- `npm run test` -- expected: 認証関連の新規テストを含め全パス
- `npm run build` -- expected: 成功

**Manual checks:**
- Supabase 未設定で `npm run dev`: 設定画面のアカウント欄が「ローカル開発では認証は無効」表示、他画面は正常。
- (Supabase 接続後)サインアップ → ログアウト → ログイン、匿名からの昇格を実機確認。

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズをこのセッションで実施。バックグラウンドのサブエージェントを使えないため。finding floor N=4)。すべて patch 相当で、実装と同じパスで修正済み。loopback なし。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| サインアウトでセッションが null になった後、匿名セッションが張り直されず「session 無しの guest」状態で固まる。以降 `upgradeToPassword` が対象なしで失敗する(matrix「ログアウト → 再度 guest」に反する) | `AuthProvider` の初回 anon は一発 ref ガードで、`onAuthStateChange(null)` では再実行されなかった | high | patch: `onAuthStateChange` で `session===null` かつ auth 有効なら `ensureGuest()` を再実行。ガードを `anonInFlight` ref(解決後 false)に変更 |
| StrictMode の二重 effect で、1回目の匿名サインインが cancel された場合、一発 ref のせいで2回目が retry せず state が `loading` のまま固まりうる | Story 1.1 の routes と同型。dev のみ | medium | patch: 上と同じ `anonInFlight` 化で解決(cancel 済みでも次回実行できる) |
| `useAuth` と `AuthProvider` を同一ファイルで export → react-refresh 警告 | lint は exit 0 だが警告あり | low | patch: `src/app/auth-context.ts` に context/hook を分離。consumer は `@/app/auth-context` から import |
| `authMessage`(messageKey → 日本語)が単体テストされていない | matrix「エラー文言表示」の一部が未カバー | low | patch: `src/data/auth.errors.test.ts` を追加(authMessage / normalizeAuthError) |
| `getSession` がエラーを返したとき(null と区別されず)匿名サインインに流れ、エラーが握り潰される | `getSession` がエラーを返すのは稀。匿名化にフォールバックするのは実用上妥当 | low | reject(実害が薄く、分岐追加は複雑さに見合わない) |
| ブラウザの `type="email"` / `required` バリデーションが `useAuthForm` の独自バリデーションより先に効き、`auth/invalid-email` 文言が出ないことがある | 独自バリデーションはフォールバックとして機能。二重に弾くだけで害はない | low | reject(冗長だが誤動作しない) |
| `AuthScreen` コンポーネント自体のレンダリングテストが無い | ロジックは `useAuthForm`(テスト済み)にあり、表示は `authMessage`(テスト済み)。コンポーネントは薄い配線 | low | reject(仕様のタスク範囲外。ロジックは別途カバー済み) |
