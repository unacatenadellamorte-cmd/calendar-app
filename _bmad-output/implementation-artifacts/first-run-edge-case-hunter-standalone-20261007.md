アーカイブ：この別セッション用資料は再開後の独立レビュー完了により不要になった。最新の判定はspec-first-run-account-google-profile-tutorial.mdを参照。以下は停止時点の旧差分と旧指示。

Read
<review-instructions>
# Edge Case Hunter Review

**Goal:** You are a pure path tracer. Never comment on whether code is good or bad; only list missing handling.
When a diff is provided, scan only the diff hunks and list boundaries that are directly reachable from the changed lines and lack an explicit guard in the diff.
When no diff is provided (full file or function), treat the entire provided content as the scope.
Ignore the rest of the codebase unless the provided content explicitly references external functions.
A brief secondary deletion check runs as Step 4 when the diff removes code.
A claims check runs as Step 5.

**Inputs:**
- **content** — Content to review, or a path to read it from: diff, full file, or function
- **also_consider** (optional) — Areas to keep in mind during review alongside normal edge-case analysis
- **claims_file** — Path to the spec this change was built from. Do NOT read it before Step 5: the path tracing in Steps 2–3 must finish before the claims are seen.

**MANDATORY: Execute steps in the Execution section IN EXACT ORDER. DO NOT skip steps or change the sequence. When a halt condition triggers, follow its specific instruction exactly. Each action within a step is a REQUIRED action to complete that step.**

**Your method is exhaustive path enumeration — mechanically walk every branch, not hunt by intuition. Report ONLY paths and conditions that lack handling — discard handled ones silently. Do NOT editorialize or add filler. Do not assign severity labels, rankings, or priority levels.**


## EXECUTION

### Step 1: Receive Content

- Take the content to review from the parent message that launched you — inline, or by reading the file it points to (never from this instruction file)
- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
- Identify content type (diff, full file, or function) to determine scope rules

### Step 2: Exhaustive Path Analysis

**Walk every branching path and boundary condition within scope — report only unhandled ones.**

- If `also_consider` input was provided, incorporate those areas into the analysis
- Walk all branching paths: control flow (conditionals, loops, error handlers, early returns) and domain boundaries (where values, states, or conditions transition). Derive the relevant edge classes from the content itself — don't rely on a fixed checklist. Examples: missing else/default, unguarded inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Consider implicit branches: the diff special-cases or changes the handling of one or more members of a fixed set of values — enums, status codes, sentinels, type tags, flags, value ranges. The rest of the set is implicit branches (e.g. the diff changes the `RED` and `YELLOW` cases of a `RED`/`YELLOW`/`GREEN` enum; `GREEN` is the implicit branch)
- Consider handle lifetime: when the changed code re-checks, re-fetches, or re-validates something it already held — a handle, index, id, pointer — the re-check exists because an intervening call can invalidate it. Identify that call, what it does to the thing held, and what the changed code silently skips when the re-check fails
- For each call site the diff adds or changes — in test files as well as production code — read the callee's declaration and check the call against it: argument count, order, types, and defaults. Report any mismatch
- For each path: determine whether the content handles it
- Collect only the unhandled paths as findings — discard handled ones silently

### Step 3: Validate Completeness

- Revisit every edge class from Step 2 — e.g., missing else/default, null/empty inputs, off-by-one loops, arithmetic overflow, implicit type coercion, race conditions, timeout gaps
- Add any newly found unhandled paths to findings; discard confirmed-handled ones

### Step 4: Deletion Check

If the diff removed or replaced meaningful code (ignore pure renames and whitespace): load `references/deletion-check.md` and follow it.

### Step 5: Claims Check

Load `references/claims-check.md` and follow it.

### Step 6: Present Findings

Output all findings as a single JSON array following the Output Format specification exactly.


## OUTPUT FORMAT

Return ONLY a valid JSON array of objects. Each edge-case finding contains exactly these four fields:

```json
[{
  "location": "file:start-end (or file:line when single line, or file:hunk when exact line unavailable)",
  "trigger_condition": "one-line description (max 15 words)",
  "guard_snippet": "minimal code sketch that closes the gap (single-line escaped string, no raw newlines or unescaped quotes)",
  "potential_consequence": "what could actually go wrong (max 15 words)"
}]
```

No extra text, no explanations, no markdown wrapping. An empty array `[]` is valid when nothing is found. Deletion findings from Step 4 and claim findings from Step 5, if any, go in the same array with the extra fields defined in `references/deletion-check.md` and `references/claims-check.md`.


## HALT CONDITIONS

- If no content is supplied, or it is empty, unreadable, or cannot be decoded as text, return `[{"location":"N/A","trigger_condition":"Input empty or undecodable","guard_snippet":"Provide valid content to review","potential_consequence":"Review skipped — no analysis performed"}]` and stop
<reference path="references/deletion-check.md">
# Deletion Check

Secondary pass for the Edge Case Hunter — runs only when the diff removed meaningful code. Subordinate to the edge-case pass; findings are usually few or none.

For each chunk of removed or replaced code (ignore pure renames and whitespace), ask: did it carry behavior or a contract that the change neither re-established nor intentionally retired? Add a finding for any resulting regression, orphaned reference, or newly-dead code. Skip anything already covered by your edge-case findings.

Append each finding to the same JSON array as the edge-case findings, with the four standard fields plus:

- `kind`: `"deletion"`
- `confidence`: `"high"`, `"medium"`, or `"low"` — these are inferences; rate them

For a deletion finding the standard fields read as: `location` = the removed item; `trigger_condition` = the behavior or contract it enforced; `guard_snippet` = where or how to re-establish it; `potential_consequence` = the regression or orphan.

Add nothing if nothing qualifies.
</reference>
<reference path="references/claims-check.md">
# Claims Check

Final pass for the Edge Case Hunter. Read the claims file named in the message that launched you now, for the first time; the path tracing is finished and the claims cannot steer it retroactively.

It is the spec the change was built from. Read only its `## Intent` and `## Tasks & Acceptance` sections — the claims live there; ignore the rest of the file. The spec is the change's own account of itself: testimony, not evidence — a claim repeated in a code comment is still the same claim, not confirmation. Extract each checkable claim — what the change does, what it preserves, ordering, arithmetic, and parity with existing code ("exactly as X does") — then try to falsify each one against the code you have already traced. Where your trace is not enough to decide, read the code that decides it: the compared-to function, the actual callee, the state the claim assumes.

Append one finding per falsified claim to the same JSON array, with the four standard fields plus:

- `kind`: `"claim"`
- `confidence`: `"high"`, `"medium"`, or `"low"`

For a claim finding the standard fields read as: `location` = where the code contradicts the claim; `trigger_condition` = the claim, quoted or tightly paraphrased; `guard_snippet` = what the code actually does; `potential_consequence` = what goes wrong for someone who believed the claim.

Verified claims produce nothing. Add nothing if nothing is falsified.
</reference>

## CONTENT SOURCE

"Review content:" in the message that launched you gives the content itself or a path to read it from. Read the file when it is a path; either way that is the content under review, and this instruction file never is.
</review-instructions>
 completely and follow it as your review instructions.

claims_file (leave unread until your instructions call for it):
<claims_file>
---
title: '初回の登録・Google接続・名前・案内の順序'
type: feature
created: 2026-10-07
status: in-review
route: dispatch
review_loop_iteration: 0
baseline_commit: 84fd921149ccb69e9d3f95f6ef4c77007dac94fd
context: ['{project-root}/AGENTS.md']
---

<frozen-after-approval>

## Intent

初回の順序を、アプリ登録・ログイン→任意Google接続→ユーザー名→チュートリアル→カレンダーへ揃える。新規利用はアプリ登録必須、Googleだけスキップ可。

## Boundaries & Constraints

既存プロフィールはゲストを含め初回案内を強制しない。匿名セッション・同じIDへの昇格・既存データを保持。メール送信成功を登録完了と扱わず、確認後のログインを待つ。Googleは既存の読取接続とカレンダー選択を再利用し、選択なしでも次へ進める。購入・書込許可を要求しない。

プロフィール取得中・失敗は新規扱いしない。途中再起動・Web認可復帰で順序を保持。名前保存成功後だけ案内。完了・スキップ後は再表示しない。状態は利用者別、別アカウントへ持ち越さない。保存不可でも現在の操作を妨げない。6言語・44px操作を維持。

本番DB・配布・認証設定・実認可・課金・メール送信方式を変更しない。有料メールプランへ変更しない。AGENTS.mdは保持・コミット除外。

## I/O & Edge-Case Matrix

| 状態 | 表示・次段階 |
| --- | --- |
| 新規ゲスト | 登録を初期表示、ログインへ切替可 |
| 確認メール待ち／認証失敗 | 説明・再試行、Googleへ進めない |
| 認証済み・プロフィールなし | Google接続またはスキップ→名前 |
| Google拒否・取得失敗・未設定 | 説明・再試行／明示スキップ、接続済みと偽らない |
| 名前保存失敗／成功 | 入力保持／案内を表示 |
| 既存プロフィール／取得失敗 | 通常利用／エラーと再試行 |
| 再起動・利用者変更 | 自分の途中段階を再開、他人の状態・名前は出さない |

</frozen-after-approval>

## Code Map

- `src/app/AppShell.tsx`：唯一のuseProfile、旧案内→名前の分岐。利用者変更で状態を分離。
- `src/features/auth/{ui/AuthScreen.tsx,model/useAuthForm.ts}`：既存登録・確認待ちを再利用。成功先は今/settings。
- `src/features/connections/ui/{GoogleCallbackScreen.tsx,GoogleCalendarPicker.tsx}`：Web復帰は今/settings。GoogleAccountCalendarsを再利用。
- `src/features/profile/ui/OnboardingScreen.tsx`：ProfileFormとcreateを保持。
- `src/data/{auth.ts,connections.ts}`：昇格・認可は変更しない。startGoogleConnectはWeb遷移／native結果。

## Tasks & Acceptance

- [x] `src/features/onboarding/model/first-run-state.ts`：利用者別のgoogle/profile/tutorial進捗と安全な保存。
- [x] `src/features/onboarding/ui/GoogleSetupScreen.tsx`：接続、再取得、任意選択、次へ／スキップ。
- [x] `src/app/AppShell.tsx`：上記順序、状態分離、認可callbackを遮らず下タブは隠す。
- [x] `src/features/auth/ui/AuthScreen.tsx`、`src/features/auth/model/useAuthForm.ts`：初期モード・成功先を選べるようにし、通常/authは維持。
- [x] `src/features/connections/ui/GoogleCallbackScreen.tsx`：初回はGoogle段階へ、通常は設定へ戻す。戻り先は固定値のみ。
- [x] `src/features/profile/ui/OnboardingScreen.tsx`、`src/features/tutorial/ui/FirstRunTutorial.tsx`：名前→案内の文言を一致。
- [x] `src/i18n/{source-keys,en,fr,es,zh,ko}.json`：新規説明・操作を翻訳。
- [x] 各同名テスト、`src/app/{AppShell.test.tsx,AppShell.onboarding-flow.test.tsx,routes.test.tsx}`：表の全条件、実フックで順序・再起動・利用者切替・callbackを検証。

Given 新規利用、When 登録確認・ログイン後にGoogleをスキップして名前保存、Then 案内後カレンダーへ進む。
Given 既存プロフィール、When 更新版を起動、Then データを保ち通常利用できる。

## Implementation Notes

- 本人のCodex指定とAGENTS.mdの認証境界方針を優先し、認証・案内・統合はメインが実装。サブエージェントへの実装割当は辞書6ファイルの翻訳のみで、他のコード・仕様・コミット・外部操作は担当させない。画面文言が確定してから仕様だけを渡し、結果を同セッションで検証する。

## Spec Change Log

## Matrix Coverage Audit

| 条件 | 実行済み証拠 |
| --- | --- |
| 新規登録・確認待ち・ログイン | AppShell.auth-flow.test.tsx：実AuthProviderの認証通知から全順序。AuthScreen.test.tsx：確認待ちで成功先を呼ばない |
| Google接続・拒否・未設定・取得失敗・任意選択 | GoogleSetupScreen.test.tsx：14件。AppShell.onboarding-flow.test.tsx：実カレンダー選択とWeb callback交換 |
| 名前保存失敗・成功 | AppShell.onboarding-flow.test.tsx：入力保持、再試行、成功後案内 |
| 既存利用者・取得失敗 | AppShell.test.tsxと既存routes.test.tsx：ゲストも通常表示、失敗時は新規と区別 |
| 再起動・利用者切替・保存不可 | AppShell.onboarding-flow.test.tsx：途中再開、古い名前・遅延応答の遮断、保存不可でも完了 |
| 案内完了・スキップ・翻訳 | AppShell.test.tsx、FirstRunTutorial.test.tsx、辞書テスト：再表示なし、全ページ、6言語 |

## Review Triage Log

## Design Notes

プロフィールだけでは「既存」と「今名前を保存した人」を区別できない。利用者別の途中進捗を保存し、保存不可時はメモリで続行する。認証・個人情報の境界と案内はメインCodex、定型翻訳のみ安価モデルへ委任。

## Verification

`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。実データに接続しない確認画面で320px・明暗・文字拡大を確認。実機のconnectedテスト・消去は禁止。

実行結果：157ファイル・1,536テスト成功（失敗・保留0）。型検査とビルド成功。lintは既存のFast Refresh警告1件のみ。ビルドには既存の混在import・チャンクサイズ警告が残る。

画面確認：専用Vite設定の架空データ画面で登録→Googleスキップ→名前→案内を操作。320px、明暗、文字150%で横溢れなし、主要ボタン44px。確認画面は専用設定でのみ動的読込し、通常設定ではアプリモジュールを起動しない。実メール送信・Google認可・本番設定・配布は行っていない。
</claims_file>

Review content: the unified diff below.
<review-content>
diff --git a/_bmad-output/implementation-artifacts/spec-first-run-account-google-profile-tutorial.md b/_bmad-output/implementation-artifacts/spec-first-run-account-google-profile-tutorial.md
new file mode 100644
index 0000000..97ef2e2
--- /dev/null
+++ b/_bmad-output/implementation-artifacts/spec-first-run-account-google-profile-tutorial.md
@@ -0,0 +1,91 @@
+---
+title: '初回の登録・Google接続・名前・案内の順序'
+type: feature
+created: 2026-10-07
+status: in-review
+route: dispatch
+review_loop_iteration: 0
+baseline_commit: 84fd921149ccb69e9d3f95f6ef4c77007dac94fd
+context: ['{project-root}/AGENTS.md']
+---
+
+<frozen-after-approval>
+
+## Intent
+
+初回の順序を、アプリ登録・ログイン→任意Google接続→ユーザー名→チュートリアル→カレンダーへ揃える。新規利用はアプリ登録必須、Googleだけスキップ可。
+
+## Boundaries & Constraints
+
+既存プロフィールはゲストを含め初回案内を強制しない。匿名セッション・同じIDへの昇格・既存データを保持。メール送信成功を登録完了と扱わず、確認後のログインを待つ。Googleは既存の読取接続とカレンダー選択を再利用し、選択なしでも次へ進める。購入・書込許可を要求しない。
+
+プロフィール取得中・失敗は新規扱いしない。途中再起動・Web認可復帰で順序を保持。名前保存成功後だけ案内。完了・スキップ後は再表示しない。状態は利用者別、別アカウントへ持ち越さない。保存不可でも現在の操作を妨げない。6言語・44px操作を維持。
+
+本番DB・配布・認証設定・実認可・課金・メール送信方式を変更しない。有料メールプランへ変更しない。AGENTS.mdは保持・コミット除外。
+
+## I/O & Edge-Case Matrix
+
+| 状態 | 表示・次段階 |
+| --- | --- |
+| 新規ゲスト | 登録を初期表示、ログインへ切替可 |
+| 確認メール待ち／認証失敗 | 説明・再試行、Googleへ進めない |
+| 認証済み・プロフィールなし | Google接続またはスキップ→名前 |
+| Google拒否・取得失敗・未設定 | 説明・再試行／明示スキップ、接続済みと偽らない |
+| 名前保存失敗／成功 | 入力保持／案内を表示 |
+| 既存プロフィール／取得失敗 | 通常利用／エラーと再試行 |
+| 再起動・利用者変更 | 自分の途中段階を再開、他人の状態・名前は出さない |
+
+</frozen-after-approval>
+
+## Code Map
+
+- `src/app/AppShell.tsx`：唯一のuseProfile、旧案内→名前の分岐。利用者変更で状態を分離。
+- `src/features/auth/{ui/AuthScreen.tsx,model/useAuthForm.ts}`：既存登録・確認待ちを再利用。成功先は今/settings。
+- `src/features/connections/ui/{GoogleCallbackScreen.tsx,GoogleCalendarPicker.tsx}`：Web復帰は今/settings。GoogleAccountCalendarsを再利用。
+- `src/features/profile/ui/OnboardingScreen.tsx`：ProfileFormとcreateを保持。
+- `src/data/{auth.ts,connections.ts}`：昇格・認可は変更しない。startGoogleConnectはWeb遷移／native結果。
+
+## Tasks & Acceptance
+
+- [x] `src/features/onboarding/model/first-run-state.ts`：利用者別のgoogle/profile/tutorial進捗と安全な保存。
+- [x] `src/features/onboarding/ui/GoogleSetupScreen.tsx`：接続、再取得、任意選択、次へ／スキップ。
+- [x] `src/app/AppShell.tsx`：上記順序、状態分離、認可callbackを遮らず下タブは隠す。
+- [x] `src/features/auth/ui/AuthScreen.tsx`、`src/features/auth/model/useAuthForm.ts`：初期モード・成功先を選べるようにし、通常/authは維持。
+- [x] `src/features/connections/ui/GoogleCallbackScreen.tsx`：初回はGoogle段階へ、通常は設定へ戻す。戻り先は固定値のみ。
+- [x] `src/features/profile/ui/OnboardingScreen.tsx`、`src/features/tutorial/ui/FirstRunTutorial.tsx`：名前→案内の文言を一致。
+- [x] `src/i18n/{source-keys,en,fr,es,zh,ko}.json`：新規説明・操作を翻訳。
+- [x] 各同名テスト、`src/app/{AppShell.test.tsx,AppShell.onboarding-flow.test.tsx,routes.test.tsx}`：表の全条件、実フックで順序・再起動・利用者切替・callbackを検証。
+
+Given 新規利用、When 登録確認・ログイン後にGoogleをスキップして名前保存、Then 案内後カレンダーへ進む。
+Given 既存プロフィール、When 更新版を起動、Then データを保ち通常利用できる。
+
+## Implementation Notes
+
+- 本人のCodex指定とAGENTS.mdの認証境界方針を優先し、認証・案内・統合はメインが実装。サブエージェントへの実装割当は辞書6ファイルの翻訳のみで、他のコード・仕様・コミット・外部操作は担当させない。画面文言が確定してから仕様だけを渡し、結果を同セッションで検証する。
+
+## Spec Change Log
+
+## Matrix Coverage Audit
+
+| 条件 | 実行済み証拠 |
+| --- | --- |
+| 新規登録・確認待ち・ログイン | AppShell.auth-flow.test.tsx：実AuthProviderの認証通知から全順序。AuthScreen.test.tsx：確認待ちで成功先を呼ばない |
+| Google接続・拒否・未設定・取得失敗・任意選択 | GoogleSetupScreen.test.tsx：14件。AppShell.onboarding-flow.test.tsx：実カレンダー選択とWeb callback交換 |
+| 名前保存失敗・成功 | AppShell.onboarding-flow.test.tsx：入力保持、再試行、成功後案内 |
+| 既存利用者・取得失敗 | AppShell.test.tsxと既存routes.test.tsx：ゲストも通常表示、失敗時は新規と区別 |
+| 再起動・利用者切替・保存不可 | AppShell.onboarding-flow.test.tsx：途中再開、古い名前・遅延応答の遮断、保存不可でも完了 |
+| 案内完了・スキップ・翻訳 | AppShell.test.tsx、FirstRunTutorial.test.tsx、辞書テスト：再表示なし、全ページ、6言語 |
+
+## Review Triage Log
+
+## Design Notes
+
+プロフィールだけでは「既存」と「今名前を保存した人」を区別できない。利用者別の途中進捗を保存し、保存不可時はメモリで続行する。認証・個人情報の境界と案内はメインCodex、定型翻訳のみ安価モデルへ委任。
+
+## Verification
+
+`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。実データに接続しない確認画面で320px・明暗・文字拡大を確認。実機のconnectedテスト・消去は禁止。
+
+実行結果：157ファイル・1,536テスト成功（失敗・保留0）。型検査とビルド成功。lintは既存のFast Refresh警告1件のみ。ビルドには既存の混在import・チャンクサイズ警告が残る。
+
+画面確認：専用Vite設定の架空データ画面で登録→Googleスキップ→名前→案内を操作。320px、明暗、文字150%で横溢れなし、主要ボタン44px。確認画面は専用設定でのみ動的読込し、通常設定ではアプリモジュールを起動しない。実メール送信・Google認可・本番設定・配布は行っていない。
diff --git a/docs/previews/first-run-stubs.ts b/docs/previews/first-run-stubs.ts
new file mode 100644
index 0000000..11ffff8
--- /dev/null
+++ b/docs/previews/first-run-stubs.ts
@@ -0,0 +1,24 @@
+import { ok } from '../../src/data/result';
+
+// 専用Vite設定だけで使用する架空のデータ層。実認証・通信・課金は開始しない。
+export const env = { hasSupabase: true, hasGoogleOauth: true };
+export const looksLikeEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
+export const upgradeToPassword = async (email: string) =>
+  ok({ status: 'confirmation-pending', email });
+export const signUpWithPassword = upgradeToPassword;
+export const signInWithPassword = async () => ok({ user: { id: 'preview' } });
+let connected = false;
+export const listConnections = async () =>
+  ok(
+    connected
+      ? [{ id: 'preview', status: 'active', googleEmail: 'sample@example.invalid' }]
+      : [],
+  );
+export const startGoogleConnect = async () => {
+  connected = true;
+  return ok({ googleEmail: 'sample@example.invalid' });
+};
+export const listConnectionCalendars = async () =>
+  ok([{ externalCalendarId: 'preview', summary: 'サンプルカレンダー', selected: false }]);
+export const refreshGoogleCalendars = async () => ok(undefined);
+export const setGoogleCalendarSelected = async () => ok(undefined);
diff --git a/docs/previews/first-run.html b/docs/previews/first-run.html
new file mode 100644
index 0000000..4816584
--- /dev/null
+++ b/docs/previews/first-run.html
@@ -0,0 +1,20 @@
+<!doctype html>
+<html lang="ja">
+  <head>
+    <meta charset="UTF-8" />
+    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
+    <title>Multi calendar 初回設定の確認</title>
+  </head>
+  <body>
+    <div id="root"></div>
+    <script type="module">
+      // 架空データ専用の設定で起動した場合だけ、確認画面を読み込む。
+      if (import.meta.env.FIRST_RUN_PREVIEW === true) {
+        import('./first-run.tsx');
+      } else {
+        document.getElementById('root').textContent =
+          'この確認画面は first-run.vite.config.ts を指定して起動してな。';
+      }
+    </script>
+  </body>
+</html>
diff --git a/docs/previews/first-run.tsx b/docs/previews/first-run.tsx
new file mode 100644
index 0000000..7b16cf3
--- /dev/null
+++ b/docs/previews/first-run.tsx
@@ -0,0 +1,107 @@
+import { useEffect, useState } from 'react';
+import { createRoot } from 'react-dom/client';
+import { MemoryRouter } from 'react-router-dom';
+import { AuthContext, type AuthContextValue } from '@/app/auth-context';
+import { AuthScreen } from '@/features/auth/ui/AuthScreen';
+import { GoogleSetupScreen } from '@/features/onboarding/ui/GoogleSetupScreen';
+import { OnboardingScreen } from '@/features/profile/ui/OnboardingScreen';
+import { FirstRunTutorial } from '@/features/tutorial/ui/FirstRunTutorial';
+import { applyLanguage, t, type Language } from '@/i18n';
+import { ok } from '@/data/result';
+import '@/styles/global.css';
+
+export default function Preview() {
+  const [step, setStep] = useState(1);
+  const [dark, setDark] = useState(false);
+  const [large, setLarge] = useState(false);
+  const [language, setLanguage] = useState<Language>('ja');
+  useEffect(() => {
+    applyLanguage(language);
+    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
+    document.documentElement.style.fontSize = large ? '24px' : '16px';
+  }, [dark, large, language]);
+  const auth: AuthContextValue = {
+    state: step === 1 ? 'guest' : 'authenticated',
+    session: null,
+    email: null,
+    signOut: async () => ok(undefined),
+    deleteAccount: async () => ok(undefined),
+  };
+  return (
+    <MemoryRouter>
+      <AuthContext value={auth}>
+        <div className="mx-auto max-w-2xl bg-surface-sunken text-ink-primary">
+          <div className="flex flex-wrap items-center gap-3 border-b border-border-hairline p-3 text-meta">
+            <p>確認用（実アカウント・通信なし）</p>
+            <label>
+              画面
+              <select
+                aria-label="確認する段階"
+                value={step}
+                onChange={(event) => setStep(Number(event.target.value))}
+              >
+                <option value="1">登録・ログイン</option>
+                <option value="2">Google接続</option>
+                <option value="3">ユーザー名</option>
+                <option value="4">チュートリアル</option>
+              </select>
+            </label>
+            <label>
+              <input
+                type="checkbox"
+                checked={dark}
+                onChange={(event) => setDark(event.target.checked)}
+              />
+              暗い背景
+            </label>
+            <label>
+              <input
+                type="checkbox"
+                checked={large}
+                onChange={(event) => setLarge(event.target.checked)}
+              />
+              文字拡大
+            </label>
+            <label>
+              言語
+              <select
+                aria-label="確認言語"
+                value={language}
+                onChange={(event) => setLanguage(event.target.value as Language)}
+              >
+                {['ja', 'en', 'fr', 'es', 'zh', 'ko'].map((code) => (
+                  <option key={code}>{code}</option>
+                ))}
+              </select>
+            </label>
+          </div>
+          {step <= 4 && (
+            <p className="px-4 pt-4 text-meta text-ink-secondary">
+              {t('初回設定 {0}/4', [step])} ·{' '}
+              {t(['アプリアカウント', 'Google接続', 'ユーザー名', '使い方ガイド'][step - 1]!)}
+            </p>
+          )}
+          {step === 1 ? (
+            <AuthScreen initialMode="signup" onSuccess={() => setStep(2)} />
+          ) : step === 2 ? (
+            <GoogleSetupScreen onContinue={() => setStep(3)} />
+          ) : step === 3 ? (
+            <OnboardingScreen
+              continueToTutorial
+              errorKey={null}
+              create={async () => {
+                setStep(4);
+                return true;
+              }}
+            />
+          ) : step === 4 ? (
+            <FirstRunTutorial onFinish={() => setStep(5)} />
+          ) : (
+            <h1 className="p-4">カレンダーへ（確認画面のみ）</h1>
+          )}
+        </div>
+      </AuthContext>
+    </MemoryRouter>
+  );
+}
+createRoot(document.getElementById('root')!).render(<Preview />);
diff --git a/docs/previews/first-run.vite.config.ts b/docs/previews/first-run.vite.config.ts
new file mode 100644
index 0000000..629f7f0
--- /dev/null
+++ b/docs/previews/first-run.vite.config.ts
@@ -0,0 +1,26 @@
+import { fileURLToPath, URL } from 'node:url';
+import { defineConfig } from 'vite';
+import react from '@vitejs/plugin-react';
+import tailwindcss from '@tailwindcss/vite';
+
+// 一般アプリの設定とは分離し、確認画面のデータ層を必ず架空実装へ差し替える。
+export default defineConfig({
+  define: { 'import.meta.env.FIRST_RUN_PREVIEW': 'true' },
+  optimizeDeps: { entries: ['docs/previews/first-run.html'] },
+  plugins: [react(), tailwindcss()],
+  resolve: {
+    alias: [
+      {
+        find: /^@\/data\/(auth|connections|google-calendars|env)$/,
+        replacement: fileURLToPath(new URL('./first-run-stubs.ts', import.meta.url)),
+      },
+      {
+        find: '@core',
+        replacement: fileURLToPath(
+          new URL('../../packages/core/src/index.ts', import.meta.url),
+        ),
+      },
+      { find: '@', replacement: fileURLToPath(new URL('../../src', import.meta.url)) },
+    ],
+  },
+});
diff --git a/src/app/AppShell.auth-flow.test.tsx b/src/app/AppShell.auth-flow.test.tsx
new file mode 100644
index 0000000..1aaac2a
--- /dev/null
+++ b/src/app/AppShell.auth-flow.test.tsx
@@ -0,0 +1,99 @@
+import { expect, it, vi } from 'vitest';
+import { fireEvent, render, screen } from '@testing-library/react';
+import userEvent from '@testing-library/user-event';
+import { MemoryRouter, Route, Routes } from 'react-router-dom';
+import { ok } from '@/data/result';
+import type { Session } from '@supabase/supabase-js';
+import { readFirstRunStage } from '@/features/onboarding/model/first-run-state';
+
+const api = vi.hoisted(() => ({
+  getProfile: vi.fn(),
+  createProfile: vi.fn(),
+  signin: vi.fn(),
+}));
+let publish: (session: Session | null) => void;
+const guest = { user: { id: 'u1', is_anonymous: true } } as Session;
+const account = {
+  user: {
+    id: 'u1',
+    is_anonymous: false,
+    email: 'sample@example.invalid',
+    email_confirmed_at: '2026-10-07T00:00:00Z',
+  },
+} as Session;
+
+vi.mock('@/data/auth', () => ({
+  isAuthAvailable: () => true,
+  getSession: async () => ok(guest),
+  signInAnonymously: async () => ok(guest),
+  onAuthStateChange: (listener: typeof publish) => {
+    publish = listener;
+    return { unsubscribe: vi.fn() };
+  },
+  looksLikeEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
+  upgradeToPassword: async () =>
+    ok({ status: 'confirmation-pending', email: 'sample@example.invalid' }),
+  signUpWithPassword: vi.fn(),
+  signInWithPassword: (...args: unknown[]) => api.signin(...args),
+  signOut: vi.fn(),
+  deleteMyAccount: vi.fn(),
+}));
+vi.mock('@/data/profiles', () => ({
+  getProfile: () => api.getProfile(),
+  createProfile: (value: unknown) => api.createProfile(value),
+  updateProfile: vi.fn(),
+}));
+vi.mock('@/data/env', () => ({ env: { hasSupabase: true, hasGoogleOauth: false } }));
+const { AuthProvider } = await import('./AuthProvider');
+const { AppShell } = await import('./AppShell');
+
+it('実AuthProviderの認証通知から、同一ID昇格→Googleスキップ→名前→案内へ進む', async () => {
+  api.getProfile.mockResolvedValue(ok(null));
+  api.createProfile.mockResolvedValue(
+    ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
+  );
+  api.signin.mockImplementation(async () => {
+    publish(account);
+    return ok(account);
+  });
+  render(
+    <AuthProvider>
+      <MemoryRouter>
+        <Routes>
+          <Route path="/" element={<AppShell />}>
+            <Route index element={<p>通常画面</p>} />
+            <Route path="calendar" element={<h1>カレンダー画面</h1>} />
+          </Route>
+        </Routes>
+      </MemoryRouter>
+    </AuthProvider>,
+  );
+  await screen.findByRole('heading', { name: 'アカウントを作成' });
+  fireEvent.change(screen.getByLabelText('メールアドレス'), {
+    target: { value: 'sample@example.invalid' },
+  });
+  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), {
+    target: { value: 'sample-password' },
+  });
+  fireEvent.click(screen.getByRole('button', { name: '登録する' }));
+  expect(await screen.findByRole('status')).toHaveTextContent('登録はまだ完了していません');
+  expect(
+    screen.queryByRole('button', { name: 'スキップしてユーザー名を設定' }),
+  ).not.toBeInTheDocument();
+  fireEvent.click(screen.getByRole('button', { name: 'ログインへ進む' }));
+  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), {
+    target: { value: 'sample-password' },
+  });
+  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }));
+  const user = userEvent.setup();
+  await user.click(
+    await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
+  );
+  await user.type(screen.getByLabelText('名前'), '花子');
+  await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
+  expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
+  expect(readFirstRunStage('u1')).toBe('tutorial');
+  await user.click(screen.getByRole('button', { name: 'スキップ' }));
+  expect(await screen.findByRole('heading', { name: 'カレンダー画面' })).toBeInTheDocument();
+  expect(readFirstRunStage('u1')).toBe('done');
+});
diff --git a/src/app/AppShell.onboarding-flow.test.tsx b/src/app/AppShell.onboarding-flow.test.tsx
index 77c814a..0e74443 100644
--- a/src/app/AppShell.onboarding-flow.test.tsx
+++ b/src/app/AppShell.onboarding-flow.test.tsx
@@ -1,11 +1,16 @@
 import { beforeEach, describe, expect, it, vi } from 'vitest';
-import { render, screen, waitFor, within } from '@testing-library/react';
+import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
 import userEvent from '@testing-library/user-event';
 import { MemoryRouter, Route, Routes } from 'react-router-dom';
 import { appError, err, ok } from '@/data/result';
 import type { Profile } from '@/data/profiles';
 import { Screen } from '@/ui/Screen';
 import { TUTORIAL_COMPLETED_KEY } from '@/features/tutorial/model/tutorial-state';
+import {
+  saveFirstRunStage,
+  readFirstRunStage,
+} from '@/features/onboarding/model/first-run-state';
+import { GoogleCallbackScreen } from '@/features/connections/ui/GoogleCallbackScreen';

 /**
  * 回帰テスト(コードレビュー指摘): `AppShell` / `OnboardingScreen` / `ProfileScreen` が
@@ -19,9 +24,40 @@ import { TUTORIAL_COMPLETED_KEY } from '@/features/tutorial/model/tutorial-state
  */

 let authState: 'guest' | 'authenticated' | 'unavailable' = 'guest';
+let userId = 'u1';
 vi.mock('@/app/auth-context', () => ({
-  useAuth: () => ({ state: authState, session: null, email: null, signOut: vi.fn() }),
+  useAuth: () => ({
+    state: authState,
+    session: { user: { id: userId } },
+    email: null,
+    signOut: vi.fn(),
+  }),
 }));
+const authApi = vi.hoisted(() => ({
+  upgradeToPassword: vi.fn(),
+  signUpWithPassword: vi.fn(),
+  signInWithPassword: vi.fn(),
+}));
+vi.mock('@/data/auth', () => ({
+  ...authApi,
+  looksLikeEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
+}));
+const googleApi = vi.hoisted(() => ({
+  listConnections: vi.fn(),
+  startGoogleConnect: vi.fn(),
+  completeGoogleConnect: vi.fn(),
+}));
+vi.mock('@/data/connections', () => ({
+  ...googleApi,
+  GOOGLE_CALLBACK_PATH: '/connections/google/callback',
+}));
+const calendarApi = vi.hoisted(() => ({
+  listConnectionCalendars: vi.fn(),
+  refreshGoogleCalendars: vi.fn(),
+  setGoogleCalendarSelected: vi.fn(),
+}));
+vi.mock('@/data/google-calendars', () => calendarApi);
+vi.mock('@/data/env', () => ({ env: { hasSupabase: true, hasGoogleOauth: true } }));

 const getProfile = vi.fn();
 const createProfile = vi.fn();
@@ -35,8 +71,8 @@ vi.mock('@/data/profiles', () => ({
 const { AppShell } = await import('./AppShell');
 const { ProfileScreen } = await import('@/features/profile/ui/ProfileScreen');

-function renderShell(initialPath = '/') {
-  return render(
+function ShellRoutes({ initialPath = '/' }: { initialPath?: string }) {
+  return (
     <MemoryRouter initialEntries={[initialPath]}>
       <Routes>
         <Route path="/" element={<AppShell />}>
@@ -49,22 +85,43 @@ function renderShell(initialPath = '/') {
             }
           />
           <Route path="profile" element={<ProfileScreen />} />
+          <Route
+            path="calendar"
+            element={
+              <Screen title="カレンダー画面" showProfileHeader>
+                カレンダー画面
+              </Screen>
+            }
+          />
+          <Route path="connections/google/callback" element={<GoogleCallbackScreen />} />
         </Route>
       </Routes>
-    </MemoryRouter>,
+    </MemoryRouter>
   );
 }
+function renderShell(initialPath = '/') {
+  return render(<ShellRoutes initialPath={initialPath} />);
+}

 beforeEach(() => {
   localStorage.setItem(TUTORIAL_COMPLETED_KEY, '1');
   authState = 'guest';
+  userId = 'u1';
   getProfile.mockReset();
   createProfile.mockReset();
   updateProfile.mockReset();
+  Object.values(authApi).forEach((api) => api.mockReset());
+  Object.values(googleApi).forEach((api) => api.mockReset());
+  Object.values(calendarApi).forEach((api) => api.mockReset());
+  googleApi.listConnections.mockResolvedValue(ok([]));
+  calendarApi.listConnectionCalendars.mockResolvedValue(ok([]));
+  calendarApi.refreshGoogleCalendars.mockResolvedValue(ok([]));
+  calendarApi.setGoogleCalendarSelected.mockResolvedValue(ok(undefined));
 });

 describe('AppShell × OnboardingScreen(実フック、data層のみモック)', () => {
   it('オンボーディングで送信成功すると、AppShell 自身が profile を認識して通常画面へ切り替わる', async () => {
+    authState = 'authenticated';
     getProfile.mockResolvedValue(ok(null));
     const created: Profile = {
       id: 'u1',
@@ -77,15 +134,22 @@ describe('AppShell × OnboardingScreen(実フック、data層のみモック)',
     const user = userEvent.setup();
     renderShell();

+    await user.click(
+      await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
+    );
+
     // 最初はオンボーディング(下タブ・ホーム画面は出ない)
     expect(await screen.findByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
     expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();

     await user.type(screen.getByLabelText('名前'), '花子');
-    await user.click(screen.getByRole('button', { name: 'はじめる' }));
+    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
+
+    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
+    await user.click(screen.getByRole('button', { name: 'スキップ' }));

     // 別インスタンス問題が直っていれば、AppShell が同じ profile を認識して通常画面に切り替わる
-    expect(await screen.findByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
+    expect(await screen.findByRole('heading', { name: 'カレンダー画面' })).toBeInTheDocument();
     expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
     expect(screen.getByRole('link', { name: 'プロフィール' })).toBeInTheDocument();
   });
@@ -140,6 +204,201 @@ describe('AppShell × OnboardingScreen(実フック、data層のみモック)',
     getProfile.mockResolvedValueOnce(ok(null));
     const user = userEvent.setup();
     await user.click(screen.getByRole('button', { name: 'もう一度試す' }));
-    expect(await screen.findByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
+    expect(
+      await screen.findByRole('heading', { name: 'アカウントを作成' }),
+    ).toBeInTheDocument();
+  });
+
+  it('登録確認待ち→ログイン→Googleスキップ→名前→案内の順を守り、再起動後に繰り返さない', async () => {
+    getProfile.mockResolvedValue(ok(null));
+    const created = {
+      id: 'u1',
+      displayName: '花子',
+      avatarDataUrl: null,
+      secretPasscodeHash: null,
+    };
+    createProfile.mockResolvedValue(ok(created));
+    authApi.upgradeToPassword.mockResolvedValue(
+      ok({ status: 'confirmation-pending', email: 'sample@example.invalid' }),
+    );
+    authApi.signInWithPassword.mockImplementation(async () => {
+      authState = 'authenticated';
+      return ok({ user: { id: 'u1' } });
+    });
+    const user = userEvent.setup();
+    const view = renderShell();
+    await screen.findByRole('heading', { name: 'アカウントを作成' });
+    await user.type(screen.getByLabelText('メールアドレス'), 'sample@example.invalid');
+    await user.type(screen.getByLabelText('パスワード(6文字以上)'), 'sample-password');
+    await user.click(screen.getByRole('button', { name: '登録する' }));
+    expect(await screen.findByRole('status')).toHaveTextContent('登録はまだ完了していません');
+    expect(
+      screen.queryByRole('button', { name: 'スキップしてユーザー名を設定' }),
+    ).not.toBeInTheDocument();
+    expect(createProfile).not.toHaveBeenCalled();
+    await user.click(screen.getByRole('button', { name: 'ログインへ進む' }));
+    await user.type(screen.getByLabelText('パスワード(6文字以上)'), 'sample-password');
+    await user.click(screen.getByRole('button', { name: 'ログイン' }));
+    // 認証Contextの更新を模擬する。実Providerの購読経路はauth-flow.testで確認する。
+    view.rerender(<ShellRoutes />);
+    await user.click(
+      await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
+    );
+    await user.type(screen.getByLabelText('名前'), '花子');
+    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
+    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
+    expect(readFirstRunStage('u1')).toBe('tutorial');
+    for (let page = 0; page < 4; page++)
+      await user.click(screen.getByRole('button', { name: '次へ' }));
+    await user.click(screen.getByRole('button', { name: '使いはじめる' }));
+    expect(await screen.findByRole('heading', { name: 'カレンダー画面' })).toBeInTheDocument();
+    expect(readFirstRunStage('u1')).toBe('done');
+    view.unmount();
+    getProfile.mockResolvedValue(ok(created));
+    renderShell();
+    expect(await screen.findByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
+    expect(screen.queryByRole('region', { name: '使い方ガイド' })).not.toBeInTheDocument();
+    expect(googleApi.startGoogleConnect).not.toHaveBeenCalled();
+    expect(JSON.stringify({ ...localStorage })).not.toContain('sample-password');
+  });
+
+  it('名前保存の失敗では入力を保持し、成功してからだけ案内へ進む', async () => {
+    authState = 'authenticated';
+    saveFirstRunStage('u1', 'profile');
+    getProfile.mockResolvedValue(ok(null));
+    createProfile.mockResolvedValueOnce(err(appError('data/query', 'data/query')));
+    createProfile.mockResolvedValueOnce(
+      ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
+    );
+    renderShell();
+    const user = userEvent.setup();
+    await user.type(await screen.findByLabelText('名前'), '花子');
+    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
+    await screen.findByRole('alert');
+    expect(screen.getByLabelText('名前')).toHaveValue('花子');
+    expect(screen.queryByRole('region', { name: '使い方ガイド' })).not.toBeInTheDocument();
+    await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
+    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
+  });
+
+  it('名前保存直後の再起動でも、途中記録から案内だけ再開する', async () => {
+    authState = 'authenticated';
+    saveFirstRunStage('u1', 'profile');
+    getProfile.mockResolvedValue(
+      ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
+    );
+    renderShell();
+    expect(await screen.findByRole('region', { name: '使い方ガイド' })).toBeInTheDocument();
+    expect(screen.queryByLabelText('名前')).not.toBeInTheDocument();
+    expect(readFirstRunStage('u1')).toBe('tutorial');
+  });
+
+  it('利用者が変わった瞬間に、前の名前入力・進捗を出さない', async () => {
+    authState = 'authenticated';
+    saveFirstRunStage('u1', 'profile');
+    getProfile.mockResolvedValue(ok(null));
+    const view = renderShell();
+    await userEvent.setup().type(await screen.findByLabelText('名前'), '前の利用者');
+    userId = 'u2';
+    view.rerender(<ShellRoutes />);
+    expect(screen.queryByDisplayValue('前の利用者')).not.toBeInTheDocument();
+    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
+    await screen.findByRole('heading', { name: 'Googleアカウントを接続（任意）' });
+    expect(readFirstRunStage('u2')).toBe('google');
+    expect(readFirstRunStage('u1')).toBe('profile');
+  });
+
+  it('前の利用者の遅いプロフィール応答を新しい画面へ反映しない', async () => {
+    authState = 'authenticated';
+    let finish!: (value: unknown) => void;
+    getProfile.mockReturnValueOnce(
+      new Promise((resolve) => {
+        finish = resolve;
+      }),
+    );
+    getProfile.mockResolvedValue(ok(null));
+    const view = renderShell();
+    userId = 'u2';
+    view.rerender(<ShellRoutes />);
+    await screen.findByRole('heading', { name: 'Googleアカウントを接続（任意）' });
+    await act(async () =>
+      finish(
+        ok({
+          id: 'u1',
+          displayName: '前の名前',
+          avatarDataUrl: null,
+          secretPasscodeHash: null,
+        }),
+      ),
+    );
+    expect(screen.queryByText('前の名前')).not.toBeInTheDocument();
+    expect(screen.queryByRole('link', { name: 'プロフィール' })).not.toBeInTheDocument();
+  });
+
+  it('保存禁止でもGoogleスキップから名前・案内・カレンダーまで進める', async () => {
+    authState = 'authenticated';
+    getProfile.mockResolvedValue(ok(null));
+    createProfile.mockResolvedValue(
+      ok({ id: 'u1', displayName: '花子', avatarDataUrl: null, secretPasscodeHash: null }),
+    );
+    const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
+      throw new Error('保存不可');
+    });
+    try {
+      renderShell();
+      const user = userEvent.setup();
+      await user.click(
+        await screen.findByRole('button', { name: 'スキップしてユーザー名を設定' }),
+      );
+      await user.type(screen.getByLabelText('名前'), '花子');
+      await user.click(screen.getByRole('button', { name: 'チュートリアルへ進む' }));
+      await screen.findByRole('region', { name: '使い方ガイド' });
+      await user.click(screen.getByRole('button', { name: 'スキップ' }));
+      expect(
+        await screen.findByRole('heading', { name: 'カレンダー画面' }),
+      ).toBeInTheDocument();
+    } finally {
+      storage.mockRestore();
+    }
+  });
+
+  it('Web認可復帰をプロフィール取得エラーで遮らず、接続・選択後に名前へ戻る', async () => {
+    authState = 'authenticated';
+    saveFirstRunStage('u1', 'google');
+    getProfile.mockResolvedValueOnce(err(appError('data/query', 'data/query')));
+    getProfile.mockResolvedValue(ok(null));
+    googleApi.completeGoogleConnect.mockImplementation(async () => {
+      googleApi.listConnections.mockResolvedValue(
+        ok([
+          {
+            id: 'c1',
+            provider: 'google',
+            status: 'active',
+            googleEmail: 'sample@example.invalid',
+          },
+        ]),
+      );
+      return ok({ googleEmail: 'sample@example.invalid' });
+    });
+    calendarApi.listConnectionCalendars.mockResolvedValue(
+      ok([{ externalCalendarId: 'cal1', summary: 'サンプルカレンダー', selected: false }]),
+    );
+    renderShell('/connections/google/callback?code=sample&state=sample');
+    expect(await screen.findByText('接続しました')).toBeInTheDocument();
+    expect(googleApi.completeGoogleConnect).toHaveBeenCalledTimes(1);
+    await userEvent
+      .setup()
+      .click(await screen.findByRole('button', { name: 'もう一度試す' }, { timeout: 2000 }));
+    expect(
+      await screen.findByRole('heading', { name: 'Googleアカウントを接続（任意）' }),
+    ).toBeInTheDocument();
+    const choice = await screen.findByRole('checkbox');
+    fireEvent.click(choice);
+    await waitFor(() =>
+      expect(calendarApi.setGoogleCalendarSelected).toHaveBeenCalledWith('c1', 'cal1', true),
+    );
+    await userEvent.setup().click(screen.getByRole('button', { name: 'ユーザー名の設定へ' }));
+    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
+    expect(readFirstRunStage('u1')).toBe('profile');
   });
 });
diff --git a/src/app/AppShell.test.tsx b/src/app/AppShell.test.tsx
index f20d260..5eb0190 100644
--- a/src/app/AppShell.test.tsx
+++ b/src/app/AppShell.test.tsx
@@ -4,6 +4,10 @@ import userEvent from '@testing-library/user-event';
 import { MemoryRouter, Route, Routes } from 'react-router-dom';
 import { Screen } from '@/ui/Screen';
 import { TUTORIAL_COMPLETED_KEY } from '@/features/tutorial/model/tutorial-state';
+import {
+  saveFirstRunStage,
+  readFirstRunStage,
+} from '@/features/onboarding/model/first-run-state';

 /**
  * オンボーディング(profiles 行なし)分岐・取得エラー分岐・通常表示 + 上部アバター分岐を検証する。
@@ -23,8 +27,15 @@ import { TUTORIAL_COMPLETED_KEY } from '@/features/tutorial/model/tutorial-state
  */

 let authState: 'loading' | 'guest' | 'authenticated' | 'unavailable' = 'guest';
+const config = vi.hoisted(() => ({ hasSupabase: false, hasGoogleOauth: false }));
+vi.mock('@/data/env', () => ({ env: config }));
 vi.mock('@/app/auth-context', () => ({
-  useAuth: () => ({ state: authState, session: null, email: null, signOut: vi.fn() }),
+  useAuth: () => ({
+    state: authState,
+    session: { user: { id: 'u1' } },
+    email: null,
+    signOut: vi.fn(),
+  }),
 }));

 const reload = vi.fn();
@@ -80,8 +91,8 @@ vi.mock('./secret-mode-context', async (importOriginal) => {

 const { AppShell } = await import('./AppShell');

-function renderShell() {
-  return render(
+function ShellRoutes() {
+  return (
     <MemoryRouter initialEntries={['/']}>
       <Routes>
         <Route path="/" element={<AppShell />}>
@@ -95,14 +106,18 @@ function renderShell() {
           />
         </Route>
       </Routes>
-    </MemoryRouter>,
+    </MemoryRouter>
   );
 }
+function renderShell() {
+  return render(<ShellRoutes />);
+}

 beforeEach(() => {
   // 既存のプロフィール分岐試験は案内完了後の状態で行う。
   localStorage.setItem(TUTORIAL_COMPLETED_KEY, '1');
   authState = 'guest';
+  config.hasSupabase = false;
   profileState = { profile: null, loading: false, errorKey: null, loadErrorKey: null };
   reload.mockReset();
   navigateMock.mockReset();
@@ -124,21 +139,17 @@ afterEach(() => {
 });

 describe('AppShell', () => {
-  it('新規利用で案内を表示し、スキップ後は名前設定へ進み再表示しない', async () => {
+  it('新規ゲストは登録を最初に表示し、ログインへ切替可だがGoogle・名前・案内へは進めない', async () => {
     localStorage.removeItem(TUTORIAL_COMPLETED_KEY);
-    const view = renderShell();
-    expect(
-      screen.getByRole('heading', { name: '予定をカレンダーに登録' }),
-    ).toBeInTheDocument();
-    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
-    await userEvent.setup().click(screen.getByRole('button', { name: 'スキップ' }));
-    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
-    expect(localStorage.getItem(TUTORIAL_COMPLETED_KEY)).toBe('1');
-    view.unmount();
     renderShell();
-    expect(
-      screen.queryByRole('heading', { name: '予定をカレンダーに登録' }),
-    ).not.toBeInTheDocument();
+    expect(screen.getByRole('heading', { name: 'アカウントを作成' })).toBeInTheDocument();
+    expect(screen.queryByRole('heading', { name: 'ようこそ' })).not.toBeInTheDocument();
+    await userEvent
+      .setup()
+      .click(screen.getByRole('button', { name: 'アカウントを持っている場合はログイン' }));
+    expect(screen.getByRole('heading', { name: 'ログイン' })).toBeInTheDocument();
+    expect(screen.queryByRole('region', { name: '使い方ガイド' })).not.toBeInTheDocument();
+    expect(screen.queryByRole('button', { name: 'Google を接続' })).not.toBeInTheDocument();
   });

   it('初回フラグがない既存利用者には案内を表示しない', () => {
@@ -154,14 +165,18 @@ describe('AppShell', () => {

   it('全ページ完了後の再起動でも案内を表示しない', async () => {
     localStorage.removeItem(TUTORIAL_COMPLETED_KEY);
+    authState = 'authenticated';
+    profileState.profile = { id: 'u1', displayName: '花子', avatarDataUrl: null };
+    saveFirstRunStage('u1', 'tutorial');
     const view = renderShell();
     const user = userEvent.setup();
     for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: '次へ' }));
     await user.click(screen.getByRole('button', { name: '使いはじめる' }));
-    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
+    expect(readFirstRunStage('u1')).toBe('done');
+    expect(navigateMock).toHaveBeenCalledWith('/calendar', { replace: true });
     view.unmount();
     renderShell();
-    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
+    expect(screen.getByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
     expect(screen.queryByRole('region', { name: '使い方ガイド' })).not.toBeInTheDocument();
   });

@@ -175,15 +190,18 @@ describe('AppShell', () => {
     expect(localStorage.getItem(TUTORIAL_COMPLETED_KEY)).toBeNull();
   });

-  it('案内完了を保存できなくても名前設定へ進める', async () => {
+  it('案内完了を保存できなくても通常利用へ進める', async () => {
     localStorage.removeItem(TUTORIAL_COMPLETED_KEY);
+    authState = 'authenticated';
+    profileState.profile = { id: 'u1', displayName: '花子', avatarDataUrl: null };
+    saveFirstRunStage('u1', 'tutorial');
     const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
       throw new Error('保存不可');
     });
     try {
       renderShell();
       await userEvent.setup().click(screen.getByRole('button', { name: 'スキップ' }));
-      expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
+      expect(screen.getByRole('heading', { name: 'ホーム画面' })).toBeInTheDocument();
     } finally {
       storage.mockRestore();
     }
@@ -200,9 +218,9 @@ describe('AppShell', () => {
     expect(localStorage.getItem(TUTORIAL_COMPLETED_KEY)).toBeNull();
   });

-  it('profiles 行が無ければオンボーディングを表示し、下タブ・Outlet は出さない', () => {
+  it('profiles 行が無ければ登録画面を表示し、下タブ・Outlet は出さない', () => {
     renderShell();
-    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
+    expect(screen.getByRole('heading', { name: 'アカウントを作成' })).toBeInTheDocument();
     expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();
     expect(
       screen.queryByRole('navigation', { name: 'メインナビゲーション' }),
@@ -232,6 +250,32 @@ describe('AppShell', () => {
     expect(screen.queryByRole('link', { name: 'プロフィール' })).not.toBeInTheDocument();
   });

+  it('本番設定済みの認証失敗は通常利用へ通さず、再試行を案内する', () => {
+    config.hasSupabase = true;
+    authState = 'unavailable';
+    renderShell();
+    expect(screen.getByRole('alert')).toHaveTextContent('認証を確認できません');
+    expect(screen.queryByText('ホーム画面')).not.toBeInTheDocument();
+    expect(screen.getByRole('button', { name: 'もう一度試す' })).toBeInTheDocument();
+  });
+
+  it('認証後だけGoogle段階へ進み、スキップした名前設定を再起動後も保つ', async () => {
+    authState = 'authenticated';
+    const view = renderShell();
+    expect(
+      screen.getByRole('heading', { name: 'Googleアカウントを接続（任意）' }),
+    ).toBeInTheDocument();
+    await userEvent
+      .setup()
+      .click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
+    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
+    expect(readFirstRunStage('u1')).toBe('profile');
+    view.unmount();
+    renderShell();
+    expect(screen.getByRole('button', { name: 'チュートリアルへ進む' })).toBeInTheDocument();
+    expect(screen.queryByRole('region', { name: '使い方ガイド' })).not.toBeInTheDocument();
+  });
+
   it('認証未確定(state===loading)の間は待機表示のまま、通常画面は一瞬も出さない', () => {
     authState = 'loading';
     renderShell();
diff --git a/src/app/AppShell.tsx b/src/app/AppShell.tsx
index b356760..b36bee1 100644
--- a/src/app/AppShell.tsx
+++ b/src/app/AppShell.tsx
@@ -10,14 +10,21 @@ import { ConnectivityBar } from './ConnectivityBar';
 import { PwaUpdatePrompt } from './PwaUpdatePrompt';
 import { useAuth } from './auth-context';
 import { resolveMessage } from '@/data/messages';
+import { env } from '@/data/env';
 import { useProfile } from '@/features/profile/model/useProfile';
 import { AvatarIcon } from '@/features/profile/ui/AvatarIcon';
 import { OnboardingScreen } from '@/features/profile/ui/OnboardingScreen';
 import { FirstRunTutorial } from '@/features/tutorial/ui/FirstRunTutorial';
+import { completeTutorial } from '@/features/tutorial/model/tutorial-state';
+import { AuthScreen } from '@/features/auth/ui/AuthScreen';
+import { GoogleCallbackScreen } from '@/features/connections/ui/GoogleCallbackScreen';
+import { GOOGLE_CALLBACK_PATH } from '@/data/connections';
+import { GoogleSetupScreen } from '@/features/onboarding/ui/GoogleSetupScreen';
 import {
-  completeTutorial,
-  hasCompletedTutorial,
-} from '@/features/tutorial/model/tutorial-state';
+  readFirstRunStage,
+  saveFirstRunStage,
+  type FirstRunStage,
+} from '@/features/onboarding/model/first-run-state';
 import type { Profile } from '@/data/profiles';
 import type { ProfileOutletContext } from './profile-outlet-context';
 import { ProfileHeaderProvider } from '@/ui/profile-header-context';
@@ -34,13 +41,22 @@ import { ProfileHeaderProvider } from '@/ui/profile-header-context';
  *  1. 認証未確定(`state==='loading'`)、または profiles 取得中 → 待機表示のみ
  *  2. profiles 取得(reload)自体が失敗 → エラー表示 + 再試行(オンボーディングには倒さない。
  *     既存ユーザーが通信エラーに遭遇するたびオンボーディングへ閉じ込められるのを防ぐ)
- *  3. guest/authenticated が確定 かつ profiles 行が無い → オンボーディング(下タブ含め他は見せない)
+ *  3. profiles行なし → 登録・ログイン → 任意Google接続 → 名前 → 案内
  *  4. それ以外 → 従来どおり Outlet + 下タブ。profiles 行があれば最上部にアバター
  *     (シングルタップ→ /profile、ダブルタップ→シークレットモードON/OFF、`AvatarNav`)
  */
 export function AppShell() {
+  const { state, session } = useAuth();
+  // アカウントが変わった瞬間にプロフィール・フォーム・進捗を一緒に破棄する。
+  // 同じIDへの匿名昇格ではデータと入力を保持する。
+  const userId = session?.user.id ?? null;
+  return <AppShellContent key={userId ?? state} userId={userId} />;
+}
+
+function AppShellContent({ userId }: { userId: string | null }) {
   useLanguage();
   const location = useLocation();
+  const navigate = useNavigate();
   useEffect(() => {
     // 保存済み画像(data-background)とは分けて、写真を見せる画面だけを指定する。
     const root = document.documentElement;
@@ -59,18 +75,49 @@ export function AppShell() {
   const showWaiting = authResolving || (enabled && loading);
   const showProfileError = !showWaiting && enabled && Boolean(loadErrorKey);
   const needsOnboarding = !showWaiting && !showProfileError && enabled && profile === null;
-  const [tutorialDone, setTutorialDone] = useState(hasCompletedTutorial);
+  const [stage, setStage] = useState(() => readFirstRunStage(userId));
+  const changeStage = (next: FirstRunStage) => {
+    saveFirstRunStage(userId, next);
+    setStage(next);
+  };
+  const showTutorial =
+    !showWaiting &&
+    !showProfileError &&
+    state === 'authenticated' &&
+    Boolean(profile) &&
+    (stage === 'profile' || stage === 'tutorial');
+  const googleCallback =
+    state === 'authenticated' && location.pathname === GOOGLE_CALLBACK_PATH;
+  const authUnavailable = state === 'unavailable' && env.hasSupabase;
   useEffect(() => {
-    // 既存プロフィールは更新後の初回案内対象にしない。取得失敗とは区別する。
-    if (!showWaiting && !showProfileError && enabled && profile && !tutorialDone) {
-      completeTutorial();
-      setTutorialDone(true);
+    if (showWaiting || showProfileError || !enabled) return;
+    if (profile) {
+      // 名前保存の直後と既存利用者は、利用者別の途中記録で区別する。
+      if (stage === 'profile') {
+        saveFirstRunStage(userId, 'tutorial');
+        setStage('tutorial');
+      } else if (stage !== 'tutorial' && stage !== 'done') {
+        saveFirstRunStage(userId, 'done');
+        setStage('done');
+        completeTutorial();
+      }
+    } else if (state === 'authenticated' && (stage === null || stage === 'done')) {
+      saveFirstRunStage(userId, 'google');
+      setStage('google');
     }
-  }, [showWaiting, showProfileError, enabled, profile, tutorialDone]);
+  }, [showWaiting, showProfileError, enabled, profile, stage, state, userId]);
   const finishTutorial = () => {
     completeTutorial();
-    setTutorialDone(true);
+    changeStage('done');
+    navigate('/calendar', { replace: true });
   };
+  const needsAccount = needsOnboarding && state !== 'authenticated';
+  const needsGoogle =
+    needsOnboarding &&
+    state === 'authenticated' &&
+    stage !== 'profile' &&
+    stage !== 'tutorial';
+  const step = needsAccount ? 1 : needsGoogle || googleCallback ? 2 : showTutorial ? 4 : 3;
   const outletContext: ProfileOutletContext = { profile, loading, errorKey, update, reload };
   return (
     <OnlineProvider>
@@ -84,7 +131,28 @@ export function AppShell() {
         >
           <div className="app-status-bar" aria-hidden="true" />
           <ConnectivityBar />
-          {showWaiting ? (
+          {(needsOnboarding || showTutorial || (googleCallback && stage === 'google')) && (
+            <p className="px-4 pt-4 text-meta text-ink-secondary">
+              {t('初回設定 {0}/4', [step])} ·{' '}
+              {t(['アプリアカウント', 'Google接続', 'ユーザー名', '使い方ガイド'][step - 1]!)}
+            </p>
+          )}
+          {googleCallback ? (
+            <GoogleCallbackScreen returnTo={stage === 'google' ? '/' : '/settings'} />
+          ) : authUnavailable ? (
+            <div className="flex flex-col gap-3 px-4 py-8">
+              <p role="alert" className="text-meta text-danger">
+                {t('認証を確認できません。通信を確認して再試行してください。')}
+              </p>
+              <button
+                type="button"
+                onClick={() => window.location.reload()}
+                className="min-h-11 rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
+              >
+                {t('もう一度試す')}
+              </button>
+            </div>
+          ) : showWaiting ? (
             <p className="px-4 py-8 text-center text-meta text-ink-secondary">
               {t('読み込み中…')}
             </p>
@@ -101,10 +169,14 @@ export function AppShell() {
                 {t('もう一度試す')}
               </button>
             </div>
-          ) : needsOnboarding && !tutorialDone ? (
+          ) : needsAccount ? (
+            <AuthScreen initialMode="signup" onSuccess={() => void reload()} />
+          ) : needsGoogle ? (
+            <GoogleSetupScreen onContinue={() => changeStage('profile')} />
+          ) : showTutorial ? (
             <FirstRunTutorial onFinish={finishTutorial} />
           ) : needsOnboarding ? (
-            <OnboardingScreen create={create} errorKey={errorKey} />
+            <OnboardingScreen create={create} errorKey={errorKey} continueToTutorial />
           ) : (
             <>
               <ProfileHeaderProvider value={profile ? <AvatarNav profile={profile} /> : null}>
diff --git a/src/app/__tests__/shell.test.tsx b/src/app/__tests__/shell.test.tsx
index f49e0c4..fd2cb8e 100644
--- a/src/app/__tests__/shell.test.tsx
+++ b/src/app/__tests__/shell.test.tsx
@@ -2,6 +2,9 @@ import { describe, expect, it, vi } from 'vitest';
 import { render, screen, within } from '@testing-library/react';
 import userEvent from '@testing-library/user-event';
 import { MemoryRouter } from 'react-router-dom';
+
+// この試験は認証未設定の開発用シェル。端末の.envには依存させない。
+vi.mock('@/data/env', () => ({ env: { hasSupabase: false, hasGoogleOauth: false } }));
 import { AppRoutes } from '@/app/routes';
 import { AuthProvider } from '@/app/AuthProvider';

diff --git a/src/features/auth/model/useAuthForm.ts b/src/features/auth/model/useAuthForm.ts
index 998c787..8fb0d86 100644
--- a/src/features/auth/model/useAuthForm.ts
+++ b/src/features/auth/model/useAuthForm.ts
@@ -9,6 +9,7 @@ import {
 export type AuthMode = 'signin' | 'signup';

 interface UseAuthFormOptions {
+  initialMode?: AuthMode;
   /** 匿名セッション中か。true のとき signup は「昇格」(updateUser)になる。 */
   isGuest: boolean;
   /** 成功時に呼ばれる(画面遷移など)。確認メール待ちでは呼ばない。 */
@@ -30,9 +31,13 @@ const PASSWORD_MIN = 6;
 /** 同じ宛先へ確認メールを出し直せるまでの間隔(Supabase の既定の送信間隔に合わせる)。 */
 const RESEND_COOLDOWN_MS = 60_000;

-export function useAuthForm({ isGuest, onSuccess }: UseAuthFormOptions) {
+export function useAuthForm({
+  isGuest,
+  onSuccess,
+  initialMode = 'signin',
+}: UseAuthFormOptions) {
   const [form, setForm] = useState<AuthFormState>({
-    mode: 'signin',
+    mode: initialMode,
     email: '',
     password: '',
     submitting: false,
@@ -107,7 +112,8 @@ export function useAuthForm({ isGuest, onSuccess }: UseAuthFormOptions) {
           ? await upgradeToPassword(email, password)
           : await signUpWithPassword(email, password);
         if (!result.ok) errorKey = result.error.messageKey;
-        else if (result.value.status === 'confirmation-pending') pendingEmail = result.value.email;
+        else if (result.value.status === 'confirmation-pending')
+          pendingEmail = result.value.email;
       } else {
         const result = await signInWithPassword(email, password);
         if (!result.ok) errorKey = result.error.messageKey;
diff --git a/src/features/auth/ui/AuthScreen.test.tsx b/src/features/auth/ui/AuthScreen.test.tsx
index 7ff3518..386e314 100644
--- a/src/features/auth/ui/AuthScreen.test.tsx
+++ b/src/features/auth/ui/AuthScreen.test.tsx
@@ -5,6 +5,23 @@ import { appError, err, ok } from '@/data/result';
 import { applyLanguage } from '@/i18n';
 import { AuthScreen } from './AuthScreen';

+it('初回は登録モードを指定でき、確認待ちで成功先へは進まない', async () => {
+  api.upgradeToPassword.mockResolvedValue(
+    ok({ status: 'confirmation-pending', email: 'a@b.com' }),
+  );
+  const success = vi.fn();
+  render(
+    <MemoryRouter>
+      <AuthScreen initialMode="signup" onSuccess={success} />
+    </MemoryRouter>,
+  );
+  expect(screen.getByRole('heading', { name: 'アカウントを作成' })).toBeInTheDocument();
+  fill('a@b.com', 'secret1');
+  fireEvent.click(screen.getByRole('button', { name: '登録する' }));
+  expect(await screen.findByRole('status')).toHaveTextContent('登録はまだ完了していません');
+  expect(success).not.toHaveBeenCalled();
+});
+
 const api = vi.hoisted(() => ({
   signInWithPassword: vi.fn(),
   signUpWithPassword: vi.fn(),
@@ -35,20 +52,28 @@ function renderScreen() {

 function fill(email: string, password: string) {
   fireEvent.change(screen.getByLabelText('メールアドレス'), { target: { value: email } });
-  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), { target: { value: password } });
+  fireEvent.change(screen.getByLabelText('パスワード(6文字以上)'), {
+    target: { value: password },
+  });
 }

 it('確認待ちは設定へ戻らず、送信先・最新メール・確認後のログインを案内する', async () => {
-  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
+  api.upgradeToPassword.mockResolvedValue(
+    ok({ status: 'confirmation-pending', email: 'a@b.com' }),
+  );
   renderScreen();
   fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
   fill('a@b.com', 'secret1');
   fireEvent.click(screen.getByRole('button', { name: '登録する' }));

   const guide = await screen.findByRole('status');
-  expect(guide).toHaveTextContent('a@b.com に確認メールを送信しました。登録はまだ完了していません。');
+  expect(guide).toHaveTextContent(
+    'a@b.com に確認メールを送信しました。登録はまだ完了していません。',
+  );
   expect(guide).toHaveTextContent('最新のメール');
-  expect(guide).toHaveTextContent('このアプリに戻り、同じメールアドレスとパスワードでログインしてください。');
+  expect(guide).toHaveTextContent(
+    'このアプリに戻り、同じメールアドレスとパスワードでログインしてください。',
+  );
   expect(screen.queryByText('設定画面')).not.toBeInTheDocument();
   // パスワード欄も値も画面に残さない。再送の操作も置かない。
   expect(document.body.innerHTML).not.toContain('secret1');
@@ -57,7 +82,9 @@ it('確認待ちは設定へ戻らず、送信先・最新メール・確認後
 });

 it('確認待ちからログインへ進み、成功したら従来どおり設定へ戻る', async () => {
-  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
+  api.upgradeToPassword.mockResolvedValue(
+    ok({ status: 'confirmation-pending', email: 'a@b.com' }),
+  );
   api.signInWithPassword.mockResolvedValue(ok({ user: { id: 'u1' } }));
   renderScreen();
   fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
@@ -74,7 +101,9 @@ it('確認待ちからログインへ進み、成功したら従来どおり設
 });

 it('確認待ちから別のメールアドレスでの登録に戻れる', async () => {
-  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
+  api.upgradeToPassword.mockResolvedValue(
+    ok({ status: 'confirmation-pending', email: 'a@b.com' }),
+  );
   renderScreen();
   fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
   fill('a@b.com', 'secret1');
@@ -95,8 +124,14 @@ it('即時完了の登録は従来どおり設定へ戻る', async () => {
 });

 it.each([
-  ['auth/email-rate-limited', '確認メールの送信回数が上限に達しました。届いている最新のメールを確認するか、時間をおいてください'],
-  ['auth/email-not-confirmed', 'メールアドレスの確認が完了していません。確認メールのリンクを開いてからログインしてください'],
+  [
+    'auth/email-rate-limited',
+    '確認メールの送信回数が上限に達しました。届いている最新のメールを確認するか、時間をおいてください',
+  ],
+  [
+    'auth/email-not-confirmed',
+    'メールアドレスの確認が完了していません。確認メールのリンクを開いてからログインしてください',
+  ],
 ])('%s はその場で個別の文言を出す', async (key, message) => {
   api.signInWithPassword.mockResolvedValue(err(appError(key, key)));
   renderScreen();
@@ -108,7 +143,11 @@ it.each([

 it('送信中は連打とモード変更を受け付けない', async () => {
   let finish!: (value: unknown) => void;
-  api.upgradeToPassword.mockReturnValue(new Promise((done) => { finish = done; }));
+  api.upgradeToPassword.mockReturnValue(
+    new Promise((done) => {
+      finish = done;
+    }),
+  );
   renderScreen();
   fireEvent.click(screen.getByRole('button', { name: 'アカウントを作成する' }));
   fill('a@b.com', 'secret1');
@@ -117,7 +156,9 @@ it('送信中は連打とモード変更を受け付けない', async () => {
   fireEvent.submit(form);

   expect(await screen.findByRole('button', { name: '処理中…' })).toBeDisabled();
-  expect(screen.getByRole('button', { name: 'アカウントを持っている場合はログイン' })).toBeDisabled();
+  expect(
+    screen.getByRole('button', { name: 'アカウントを持っている場合はログイン' }),
+  ).toBeDisabled();
   expect(api.upgradeToPassword).toHaveBeenCalledTimes(1);
   finish(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
   await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
@@ -125,11 +166,15 @@ it('送信中は連打とモード変更を受け付けない', async () => {

 it('確認待ちの案内は選択中の言語で出す', async () => {
   applyLanguage('en');
-  api.upgradeToPassword.mockResolvedValue(ok({ status: 'confirmation-pending', email: 'a@b.com' }));
+  api.upgradeToPassword.mockResolvedValue(
+    ok({ status: 'confirmation-pending', email: 'a@b.com' }),
+  );
   renderScreen();
   fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
   fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'a@b.com' } });
-  fireEvent.change(screen.getByLabelText('Password (6+ characters)'), { target: { value: 'secret1' } });
+  fireEvent.change(screen.getByLabelText('Password (6+ characters)'), {
+    target: { value: 'secret1' },
+  });
   fireEvent.click(screen.getByRole('button', { name: 'Register' }));
   expect(await screen.findByRole('status')).toHaveTextContent(
     'We sent a confirmation email to a@b.com. Registration is not complete yet.',
diff --git a/src/features/auth/ui/AuthScreen.tsx b/src/features/auth/ui/AuthScreen.tsx
index fbfc0fd..d477ceb 100644
--- a/src/features/auth/ui/AuthScreen.tsx
+++ b/src/features/auth/ui/AuthScreen.tsx
@@ -3,19 +3,26 @@ import { useNavigate } from 'react-router-dom';
 import { Screen } from '@/ui/Screen';
 import { useAuth } from '@/app/auth-context';
 import { resolveMessage } from '@/data/messages';
-import { useAuthForm } from '@/features/auth/model/useAuthForm';
+import { useAuthForm, type AuthMode } from '@/features/auth/model/useAuthForm';
 /**
  * ログイン / アカウント作成画面(タブ外、設定から遷移)。
  * 匿名セッション中はサインアップが「登録(昇格)」になる。
  */
-export function AuthScreen() {
+export function AuthScreen({
+  initialMode,
+  onSuccess,
+}: {
+  initialMode?: AuthMode;
+  onSuccess?: () => void;
+} = {}) {
   useLanguage();
   const { state } = useAuth();
   const navigate = useNavigate();
   const isGuest = state === 'guest';
   const { form, setMode, setEmail, setPassword, changeEmail, submit } = useAuthForm({
     isGuest,
-    onSuccess: () => navigate('/settings'),
+    initialMode,
+    onSuccess: onSuccess ?? (() => navigate('/settings')),
   });
   if (state === 'unavailable') {
     return (
@@ -31,7 +38,11 @@ export function AuthScreen() {
     return (
       <Screen title={t('確認メールを送信しました')}>
         <div role="status" className="mt-1 flex flex-col gap-3 text-body text-ink-primary">
-          <p>{t('{0} に確認メールを送信しました。登録はまだ完了していません。', [form.pendingEmail])}</p>
+          <p>
+            {t('{0} に確認メールを送信しました。登録はまだ完了していません。', [
+              form.pendingEmail,
+            ])}
+          </p>
           <p>
             {t(
               '届いたメールのリンクを開いて確認してください。複数届いている場合は最新のメールを使ってください。',
@@ -50,7 +61,11 @@ export function AuthScreen() {
         >
           {t('ログインへ進む')}
         </button>
-        <button type="button" onClick={changeEmail} className="mt-4 min-h-11 text-meta text-accent">
+        <button
+          type="button"
+          onClick={changeEmail}
+          className="mt-4 min-h-11 text-meta text-accent"
+        >
           {t('別のメールアドレスで登録する')}
         </button>
       </Screen>
diff --git a/src/features/connections/ui/GoogleCallbackScreen.test.tsx b/src/features/connections/ui/GoogleCallbackScreen.test.tsx
index d7d114a..a5b7fc4 100644
--- a/src/features/connections/ui/GoogleCallbackScreen.test.tsx
+++ b/src/features/connections/ui/GoogleCallbackScreen.test.tsx
@@ -1,5 +1,6 @@
 import { beforeEach, describe, expect, it, vi } from 'vitest';
-import { render, screen, waitFor } from '@testing-library/react';
+import { act, render, screen, waitFor } from '@testing-library/react';
+import { StrictMode } from 'react';
 import userEvent from '@testing-library/user-event';
 import { appError, err, ok } from '@/data/result';

@@ -25,6 +26,43 @@ beforeEach(() => {
 });

 describe('GoogleCallbackScreen', () => {
+  it('初回の成功は設定ではなく初回フローへ戻り、StrictModeでも交換は一度', async () => {
+    completeGoogleConnect.mockResolvedValue(ok({ googleEmail: null }));
+    render(
+      <StrictMode>
+        <GoogleCallbackScreen returnTo="/" />
+      </StrictMode>,
+    );
+    await screen.findByText('接続しました');
+    expect(completeGoogleConnect).toHaveBeenCalledTimes(1);
+    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
+  });
+
+  it('初回の拒否はエラーと初回へ戻る導線を出す', async () => {
+    completeGoogleConnect.mockResolvedValue(
+      err(appError('connection/cancelled', 'connection/cancelled')),
+    );
+    render(<GoogleCallbackScreen returnTo="/" />);
+    await screen.findByRole('alert');
+    await userEvent.setup().click(screen.getByRole('button', { name: '初回設定へ戻る' }));
+    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
+  });
+
+  it('交換結果が画面を離れた後に届いても遷移しない', async () => {
+    vi.useFakeTimers();
+    let finish!: (value: unknown) => void;
+    completeGoogleConnect.mockReturnValue(
+      new Promise((resolve) => {
+        finish = resolve;
+      }),
+    );
+    const view = render(<GoogleCallbackScreen returnTo="/" />);
+    view.unmount();
+    await act(async () => finish(ok({ googleEmail: null })));
+    act(() => vi.advanceTimersByTime(1000));
+    expect(navigate).not.toHaveBeenCalled();
+    vi.useRealTimers();
+  });
   it('成功: 受け取ったパラメータで completeGoogleConnect を呼び、設定へ戻る', async () => {
     completeGoogleConnect.mockResolvedValue(ok({ googleEmail: 'me@gmail.com' }));
     render(<GoogleCallbackScreen />);
diff --git a/src/features/connections/ui/GoogleCallbackScreen.tsx b/src/features/connections/ui/GoogleCallbackScreen.tsx
index db710d3..4e1bb83 100644
--- a/src/features/connections/ui/GoogleCallbackScreen.tsx
+++ b/src/features/connections/ui/GoogleCallbackScreen.tsx
@@ -21,27 +21,34 @@ type Phase =
  * Google から戻ってきた認可コードを oauth-exchange に渡す。
  * 成功したら設定へ戻る。失敗はメッセージと戻る導線を出す。
  */
-export function GoogleCallbackScreen() {
+export function GoogleCallbackScreen({
+  returnTo = '/settings',
+}: { returnTo?: '/' | '/settings' } = {}) {
   useLanguage();
   const [params] = useSearchParams();
   const navigate = useNavigate();
   const [phase, setPhase] = useState<Phase>({ kind: 'working' });
-  const ran = useRef(false);
+  const request = useRef<ReturnType<typeof completeGoogleConnect> | null>(null);
   useEffect(() => {
-    if (ran.current) return;
-    ran.current = true;
+    let cancelled = false;
     let timer: number | undefined;
-    void completeGoogleConnect(params).then((result) => {
+    // StrictModeの再購読でも、消費済みの認可コードを交換し直さない。
+    request.current ??= completeGoogleConnect(params);
+    void request.current.then((result) => {
+      if (cancelled) return;
       if (result.ok) {
         setPhase({ kind: 'done', email: result.value.googleEmail });
         // 少し見せてから設定へ。
-        timer = window.setTimeout(() => navigate('/settings', { replace: true }), 900);
+        timer = window.setTimeout(() => navigate(returnTo, { replace: true }), 900);
       } else {
         setPhase({ kind: 'error', messageKey: result.error.messageKey });
       }
     });
-    return () => window.clearTimeout(timer);
-  }, [params, navigate]);
+    return () => {
+      cancelled = true;
+      window.clearTimeout(timer);
+    };
+  }, [params, navigate, returnTo]);
   return (
     <Screen title={t('Google を接続')}>
       <div className="mt-4 rounded-md border border-border-hairline bg-surface-raised p-4">
@@ -67,10 +74,10 @@ export function GoogleCallbackScreen() {
             </p>
             <button
               type="button"
-              onClick={() => navigate('/settings', { replace: true })}
+              onClick={() => navigate(returnTo, { replace: true })}
               className="mt-3 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary"
             >
-              {t('設定へ戻る')}
+              {returnTo === '/' ? t('初回設定へ戻る') : t('設定へ戻る')}
             </button>
           </>
         )}
diff --git a/src/features/onboarding/model/first-run-state.test.ts b/src/features/onboarding/model/first-run-state.test.ts
new file mode 100644
index 0000000..c1701a9
--- /dev/null
+++ b/src/features/onboarding/model/first-run-state.test.ts
@@ -0,0 +1,34 @@
+import { expect, it, vi } from 'vitest';
+import { firstRunKey, readFirstRunStage, saveFirstRunStage } from './first-run-state';
+
+it('利用者別の全段階を保存し、他の利用者へ持ち越さない', () => {
+  for (const stage of ['google', 'profile', 'tutorial', 'done'] as const) {
+    saveFirstRunStage('u1', stage);
+    expect(readFirstRunStage('u1')).toBe(stage);
+    expect(readFirstRunStage('u2')).toBeNull();
+  }
+});
+
+it('不正な段階と利用者なしは採用せず、認証情報を保存しない', () => {
+  localStorage.setItem(firstRunKey('u1'), 'https://example.invalid');
+  expect(readFirstRunStage('u1')).toBeNull();
+  saveFirstRunStage(null, 'profile');
+  expect(readFirstRunStage(null)).toBeNull();
+  expect(firstRunKey('a/b')).not.toBe(firstRunKey('a%2Fb'));
+});
+
+it('端末の読取・保存が禁止されても例外を出さない', () => {
+  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
+    throw new Error('読取不可');
+  });
+  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
+    throw new Error('保存不可');
+  });
+  try {
+    expect(readFirstRunStage('u1')).toBeNull();
+    expect(() => saveFirstRunStage('u1', 'google')).not.toThrow();
+  } finally {
+    read.mockRestore();
+    write.mockRestore();
+  }
+});
diff --git a/src/features/onboarding/model/first-run-state.ts b/src/features/onboarding/model/first-run-state.ts
new file mode 100644
index 0000000..fb99b66
--- /dev/null
+++ b/src/features/onboarding/model/first-run-state.ts
@@ -0,0 +1,30 @@
+export type FirstRunStage = 'google' | 'profile' | 'tutorial' | 'done';
+
+/** 認証情報は保存せず、利用者ごとの初回進捗だけを端末へ記録する。 */
+export function firstRunKey(userId: string): string {
+  return `calendar-app.first-run.v1.${encodeURIComponent(userId)}`;
+}
+
+export function readFirstRunStage(userId: string | null): FirstRunStage | null {
+  if (!userId) return null;
+  try {
+    const value = localStorage.getItem(firstRunKey(userId));
+    return value === 'google' ||
+      value === 'profile' ||
+      value === 'tutorial' ||
+      value === 'done'
+      ? value
+      : null;
+  } catch {
+    return null;
+  }
+}
+
+export function saveFirstRunStage(userId: string | null, stage: FirstRunStage): void {
+  if (!userId) return;
+  try {
+    localStorage.setItem(firstRunKey(userId), stage);
+  } catch {
+    // 保存できなくても、画面側のメモリ状態で現在の設定を続ける。
+  }
+}
diff --git a/src/features/onboarding/ui/GoogleSetupScreen.test.tsx b/src/features/onboarding/ui/GoogleSetupScreen.test.tsx
new file mode 100644
index 0000000..71e2a1b
--- /dev/null
+++ b/src/features/onboarding/ui/GoogleSetupScreen.test.tsx
@@ -0,0 +1,134 @@
+import { beforeEach, expect, it, vi } from 'vitest';
+import { act, fireEvent, render, screen } from '@testing-library/react';
+import { appError, err, ok } from '@/data/result';
+import { applyLanguage, languages } from '@/i18n';
+import { GoogleSetupScreen } from './GoogleSetupScreen';
+
+const api = vi.hoisted(() => ({ start: vi.fn(), refresh: vi.fn(), available: true }));
+let connectionState = {
+  connections: [] as {
+    id: string;
+    status: 'active' | 'suspended';
+    googleEmail: string | null;
+  }[],
+  loading: false,
+  errorKey: null as string | null,
+};
+vi.mock('@/data/env', () => ({
+  env: {
+    get hasSupabase() {
+      return api.available;
+    },
+    get hasGoogleOauth() {
+      return api.available;
+    },
+  },
+}));
+vi.mock('@/data/connections', () => ({ startGoogleConnect: () => api.start() }));
+vi.mock('@/features/connections/model/useGoogleConnections', () => ({
+  useGoogleConnections: () => ({ ...connectionState, refresh: api.refresh }),
+}));
+vi.mock('@/features/connections/ui/GoogleCalendarPicker', () => ({
+  GoogleAccountCalendars: ({ email }: { email: string }) => <p>{email}（カレンダー選択）</p>,
+}));
+
+beforeEach(() => {
+  connectionState = { connections: [], loading: false, errorKey: null };
+  api.start.mockReset();
+  api.refresh.mockReset();
+  api.available = true;
+});
+
+it('未接続では接続かスキップを選べ、購入や書込許可を開始しない', () => {
+  const next = vi.fn();
+  render(<GoogleSetupScreen onContinue={next} />);
+  expect(screen.getByRole('button', { name: 'Google を接続' })).toBeInTheDocument();
+  fireEvent.click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
+  expect(next).toHaveBeenCalledTimes(1);
+  expect(api.start).not.toHaveBeenCalled();
+});
+
+it('ネイティブ接続成功は一覧再取得まで接続済みとせず、連打・処理中スキップを防ぐ', async () => {
+  let finish!: (value: unknown) => void;
+  api.start.mockReturnValue(
+    new Promise((resolve) => {
+      finish = resolve;
+    }),
+  );
+  render(<GoogleSetupScreen onContinue={vi.fn()} />);
+  fireEvent.click(screen.getByRole('button', { name: 'Google を接続' }));
+  expect(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' })).toBeDisabled();
+  fireEvent.click(screen.getByRole('button', { name: '接続を確認しています…' }));
+  expect(api.start).toHaveBeenCalledTimes(1);
+  await act(async () => finish(ok({ googleEmail: 'sample@example.invalid' })));
+  expect(api.refresh).toHaveBeenCalledTimes(1);
+  expect(screen.queryByText('接続しました')).not.toBeInTheDocument();
+});
+
+it('拒否されたらメッセージを出し、スキップで先へ進める', async () => {
+  api.start.mockResolvedValue(err(appError('connection/cancelled', 'connection/cancelled')));
+  const next = vi.fn();
+  render(<GoogleSetupScreen onContinue={next} />);
+  fireEvent.click(screen.getByRole('button', { name: 'Google を接続' }));
+  expect(await screen.findByRole('alert')).toHaveTextContent('キャンセル');
+  fireEvent.click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
+  expect(next).toHaveBeenCalledTimes(1);
+});
+
+it.each(['loading', 'error', 'unavailable', 'suspended'] as const)(
+  '%sを接続成功扱いせず、明示スキップは可能',
+  (kind) => {
+    if (kind === 'loading') connectionState.loading = true;
+    if (kind === 'error') connectionState.errorKey = 'data/query';
+    if (kind === 'unavailable') api.available = false;
+    if (kind === 'suspended')
+      connectionState.connections = [
+        { id: 'c', status: 'suspended', googleEmail: 'sample@example.invalid' },
+      ];
+    const next = vi.fn();
+    render(<GoogleSetupScreen onContinue={next} />);
+    expect(screen.queryByText('接続しました')).not.toBeInTheDocument();
+    if (kind === 'error') {
+      fireEvent.click(screen.getByRole('button', { name: 'もう一度試す' }));
+      expect(api.refresh).toHaveBeenCalledTimes(1);
+    }
+    fireEvent.click(screen.getByRole('button', { name: 'スキップしてユーザー名を設定' }));
+    expect(next).toHaveBeenCalledTimes(1);
+  },
+);
+
+it('確認済みactiveだけを表示し、選択なしでも名前へ進める', () => {
+  connectionState.connections = [
+    { id: 'c', status: 'active', googleEmail: 'sample@example.invalid' },
+  ];
+  const next = vi.fn();
+  render(<GoogleSetupScreen onContinue={next} />);
+  expect(screen.getByText('接続しました')).toBeInTheDocument();
+  expect(screen.getByText(/sample@example.invalid/)).toBeInTheDocument();
+  fireEvent.click(screen.getByRole('button', { name: 'ユーザー名の設定へ' }));
+  expect(next).toHaveBeenCalledTimes(1);
+});
+
+it('画面を離れた後の接続結果で再取得・遷移しない', async () => {
+  let finish!: (value: unknown) => void;
+  api.start.mockReturnValue(
+    new Promise((resolve) => {
+      finish = resolve;
+    }),
+  );
+  const { unmount } = render(<GoogleSetupScreen onContinue={vi.fn()} />);
+  fireEvent.click(screen.getByRole('button', { name: 'Google を接続' }));
+  unmount();
+  await act(async () => finish(ok({ googleEmail: null })));
+  expect(api.refresh).not.toHaveBeenCalled();
+});
+
+it.each(languages.filter(({ code }) => code !== 'ja'))(
+  '$nameの初回Google案内を翻訳する',
+  ({ code }) => {
+    applyLanguage(code);
+    const { container } = render(<GoogleSetupScreen onContinue={vi.fn()} />);
+    expect(container.textContent).not.toMatch(/[ぁ-んァ-ヶ]/);
+    applyLanguage('ja');
+  },
+);
diff --git a/src/features/onboarding/ui/GoogleSetupScreen.tsx b/src/features/onboarding/ui/GoogleSetupScreen.tsx
new file mode 100644
index 0000000..2ccb40b
--- /dev/null
+++ b/src/features/onboarding/ui/GoogleSetupScreen.tsx
@@ -0,0 +1,118 @@
+import { useEffect, useRef, useState } from 'react';
+import { t, useLanguage } from '@/i18n';
+import { env } from '@/data/env';
+import { startGoogleConnect } from '@/data/connections';
+import { resolveMessage } from '@/data/messages';
+import { useGoogleConnections } from '@/features/connections/model/useGoogleConnections';
+import { GoogleAccountCalendars } from '@/features/connections/ui/GoogleCalendarPicker';
+import { Screen } from '@/ui/Screen';
+
+/** アプリの認証とは別の、任意のGoogle読取接続。購入や書込認可は開始しない。 */
+export function GoogleSetupScreen({ onContinue }: { onContinue: () => void }) {
+  useLanguage();
+  const available = env.hasSupabase && env.hasGoogleOauth;
+  const { connections, loading, errorKey, refresh } = useGoogleConnections(available);
+  const active = connections.filter((connection) => connection.status === 'active');
+  const [connecting, setConnecting] = useState(false);
+  const [actionError, setActionError] = useState<string | null>(null);
+  const busy = useRef(false);
+  const mounted = useRef(false);
+  useEffect(() => {
+    mounted.current = true;
+    return () => {
+      mounted.current = false;
+    };
+  }, []);
+
+  const connect = async () => {
+    if (busy.current) return;
+    busy.current = true;
+    setConnecting(true);
+    setActionError(null);
+    try {
+      const result = await startGoogleConnect();
+      if (!mounted.current) return;
+      if (result?.ok) refresh();
+      else if (result) setActionError(result.error.messageKey);
+    } catch {
+      if (mounted.current) setActionError('connection/exchange-failed');
+    } finally {
+      busy.current = false;
+      if (mounted.current) setConnecting(false);
+    }
+  };
+
+  return (
+    <Screen title={t('Googleアカウントを接続（任意）')}>
+      <p className="mb-4 text-body text-ink-primary">
+        {t('アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。')}
+      </p>
+      <p className="mb-4 text-meta text-ink-secondary">
+        {t('接続はスキップできます。後から「設定」で追加できます。')}
+      </p>
+      {!available ? (
+        <p className="text-meta text-ink-secondary">
+          {t('Google接続は現在利用できません。後から設定できます。')}
+        </p>
+      ) : loading ? (
+        <p role="status" className="text-meta text-ink-secondary">
+          {t('読み込み中…')}
+        </p>
+      ) : errorKey ? (
+        <div className="flex flex-col gap-2">
+          <p role="alert" className="text-meta text-danger">
+            {resolveMessage(errorKey)}
+          </p>
+          <button type="button" onClick={refresh} className="min-h-11 text-meta text-accent">
+            {t('もう一度試す')}
+          </button>
+        </div>
+      ) : active.length > 0 ? (
+        <>
+          <p role="status" className="text-body text-ink-primary">
+            {t('接続しました')}
+          </p>
+          <p className="mt-3 text-meta text-ink-secondary">
+            {t('取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。')}
+          </p>
+          {active.map((connection) => (
+            <GoogleAccountCalendars
+              key={connection.id}
+              connectionId={connection.id}
+              email={connection.googleEmail ?? t('Google アカウント')}
+            />
+          ))}
+          <button
+            type="button"
+            onClick={onContinue}
+            className="mt-6 min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
+          >
+            {t('ユーザー名の設定へ')}
+          </button>
+        </>
+      ) : (
+        <button
+          type="button"
+          disabled={connecting}
+          onClick={() => void connect()}
+          className="min-h-11 w-full rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
+        >
+          {connecting ? t('接続を確認しています…') : t('Google を接続')}
+        </button>
+      )}
+      {actionError && (
+        <p role="alert" className="mt-3 text-meta text-danger">
+          {resolveMessage(actionError)}
+        </p>
+      )}
+      <button
+        type="button"
+        disabled={connecting}
+        onClick={onContinue}
+        className="mt-4 min-h-11 w-full rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-60"
+      >
+        {t('スキップしてユーザー名を設定')}
+      </button>
+    </Screen>
+  );
+}
diff --git a/src/features/profile/ui/OnboardingScreen.tsx b/src/features/profile/ui/OnboardingScreen.tsx
index 61f066a..d45ddc2 100644
--- a/src/features/profile/ui/OnboardingScreen.tsx
+++ b/src/features/profile/ui/OnboardingScreen.tsx
@@ -3,6 +3,7 @@ import { resolveMessage } from '@/data/messages';
 import type { NewProfileInput } from '@/data/profiles';
 import { ProfileForm } from './ProfileForm';
 interface OnboardingScreenProps {
+  continueToTutorial?: boolean;
   /** `AppShell` の唯一の `useProfile()` インスタンスから渡される(自前で呼ばない)。 */
   create: (input: NewProfileInput) => Promise<boolean>;
   errorKey: string | null;
@@ -11,7 +12,11 @@ interface OnboardingScreenProps {
  * 初回起動時、profiles 行がまだ無いユーザーに表示するオンボーディング。
  * `AppShell` が `<Outlet/>` の代わりに描画する(他の画面・下タブへは進めない)。
  */
-export function OnboardingScreen({ create, errorKey }: OnboardingScreenProps) {
+export function OnboardingScreen({
+  create,
+  errorKey,
+  continueToTutorial = false,
+}: OnboardingScreenProps) {
   useLanguage();
   return (
     <div className="flex min-h-[100dvh] flex-col justify-center bg-surface-sunken px-4 py-8">
@@ -26,7 +31,10 @@ export function OnboardingScreen({ create, errorKey }: OnboardingScreenProps) {
         </p>
       )}

-      <ProfileForm submitLabel={t('はじめる')} onSubmit={create} />
+      <ProfileForm
+        submitLabel={continueToTutorial ? t('チュートリアルへ進む') : t('はじめる')}
+        onSubmit={create}
+      />
     </div>
   );
 }
diff --git a/src/features/tutorial/ui/FirstRunTutorial.test.tsx b/src/features/tutorial/ui/FirstRunTutorial.test.tsx
index 0d8eaf3..8399a03 100644
--- a/src/features/tutorial/ui/FirstRunTutorial.test.tsx
+++ b/src/features/tutorial/ui/FirstRunTutorial.test.tsx
@@ -47,7 +47,7 @@ describe('初回使い方ガイド', () => {
     const user = userEvent.setup();
     for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: '次へ' }));
     expect(
-      screen.getByText(/Googleカレンダーを接続するには、アプリのアカウント登録/),
+      screen.getByText(/アプリの登録・ログインとGoogle接続は別の設定/),
     ).toBeInTheDocument();
     expect(screen.getByText(/プロフィールの名前は、アカウント登録とは別/)).toBeInTheDocument();
   });
diff --git a/src/features/tutorial/ui/FirstRunTutorial.tsx b/src/features/tutorial/ui/FirstRunTutorial.tsx
index b8f1b60..8a2f680 100644
--- a/src/features/tutorial/ui/FirstRunTutorial.tsx
+++ b/src/features/tutorial/ui/FirstRunTutorial.tsx
@@ -28,9 +28,9 @@ const pages = [
   },
   {
     title: 'Google接続とアプリの登録は別',
-    body: '予定やシフトはゲストでも使えます。Googleカレンダーを接続するには、アプリのアカウント登録・ログインが必要です。',
+    body: 'アプリの登録・ログインとGoogle接続は別の設定です。Google接続をスキップしても、予定やシフトを使えます。',
     tips: [
-      '最初に設定するプロフィールの名前は、アカウント登録とは別です。',
+      'プロフィールの名前は、アカウント登録とは別の表示名です。',
       '「設定」のアカウント欄で登録・ログインしてから、Googleアカウントを接続します。',
     ],
   },
diff --git a/src/i18n/en.json b/src/i18n/en.json
index 9ca3a9b..b18e225 100644
--- a/src/i18n/en.json
+++ b/src/i18n/en.json
@@ -538,5 +538,21 @@
   "有料プランの利用条件": "Paid plan terms",
   "予定反映プランはGoogleアカウント1件、複数アカウントプランは最大5件で予定反映も含みます。無料利用は1件の読み取り専用です。": "The event sync plan covers 1 Google account; the multiple accounts plan covers up to 5 accounts and includes event sync. The free plan covers 1 account as read-only.",
   "失効後は新しい反映を停止します。Google側のコピーは残ります。返金・解約の条件は購入したストアの規定に従います。": "After expiration, new syncs will stop. Copies on Google’s side will remain. Refund and cancellation terms follow the store’s policy.",
-  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "Private events won’t be synced; sent copies will be deleted. If you revoke Google permission, reconnection is needed to delete."
+  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "Private events won’t be synced; sent copies will be deleted. If you revoke Google permission, reconnection is needed to delete.",
+  "Googleアカウントを接続（任意）": "Connect a Google account (optional)",
+  "アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。": "Your app account is ready. Connect Google Calendar here if you want to use it.",
+  "接続はスキップできます。後から「設定」で追加できます。": "You can skip this and connect later in Settings.",
+  "Google接続は現在利用できません。後から設定できます。": "Google connection is unavailable right now. You can set it up later.",
+  "取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。": "Choose calendars to import. You can continue without choosing and set this up later.",
+  "ユーザー名の設定へ": "Set your username",
+  "スキップしてユーザー名を設定": "Skip and set your username",
+  "初回設定へ戻る": "Back to first-time setup",
+  "チュートリアルへ進む": "Continue to the tutorial",
+  "初回設定 {0}/4": "First-time setup {0}/4",
+  "アプリアカウント": "App account",
+  "Google接続": "Google connection",
+  "ユーザー名": "Username",
+  "認証を確認できません。通信を確認して再試行してください。": "Couldn’t verify your account. Check your connection and try again.",
+  "アプリの登録・ログインとGoogle接続は別の設定です。Google接続をスキップしても、予定やシフトを使えます。": "App registration or sign-in and Google connection are separate settings. You can use events and shifts even if you skip Google connection.",
+  "プロフィールの名前は、アカウント登録とは別の表示名です。": "Your profile name is a display name, separate from app account registration."
 }
diff --git a/src/i18n/es.json b/src/i18n/es.json
index fd80126..210c582 100644
--- a/src/i18n/es.json
+++ b/src/i18n/es.json
@@ -538,5 +538,21 @@
   "有料プランの利用条件": "Términos del plan de pago",
   "予定反映プランはGoogleアカウント1件、複数アカウントプランは最大5件で予定反映も含みます。無料利用は1件の読み取り専用です。": "El plan de sincronización de eventos cubre 1 cuenta de Google; el plan de múltiples cuentas cubre hasta 5 cuentas e incluye sincronización de eventos. El plan gratuito cubre 1 cuenta de solo lectura.",
   "失効後は新しい反映を停止します。Google側のコピーは残ります。返金・解約の条件は購入したストアの規定に従います。": "Después de la expiración, se detendrán las nuevas sincronizaciones. Las copias del lado de Google permanecerán. Los términos de reembolso y cancelación siguen la política de la tienda.",
-  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "Los eventos privados no se sincronizarán; las copias enviadas serán eliminadas. Si revoca el permiso de Google, se requiere reconexión para eliminar."
+  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "Los eventos privados no se sincronizarán; las copias enviadas serán eliminadas. Si revoca el permiso de Google, se requiere reconexión para eliminar.",
+  "Googleアカウントを接続（任意）": "Conectar una cuenta de Google (opcional)",
+  "アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。": "Tu cuenta de la aplicación está lista. Conecta Google Calendar aquí si quieres usarlo.",
+  "接続はスキップできます。後から「設定」で追加できます。": "Puedes omitir este paso y conectar la cuenta más tarde en Ajustes.",
+  "Google接続は現在利用できません。後から設定できます。": "La conexión con Google no está disponible ahora. Puedes configurarla más tarde.",
+  "取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。": "Puedes elegir los calendarios que quieres importar. También puedes continuar sin elegirlos y configurarlo más tarde.",
+  "ユーザー名の設定へ": "Configurar tu nombre de usuario",
+  "スキップしてユーザー名を設定": "Omitir y configurar tu nombre de usuario",
+  "初回設定へ戻る": "Volver a la configuración inicial",
+  "チュートリアルへ進む": "Continuar al tutorial",
+  "初回設定 {0}/4": "Configuración inicial {0}/4",
+  "アプリアカウント": "Cuenta de la aplicación",
+  "Google接続": "Conexión con Google",
+  "ユーザー名": "Nombre de usuario",
+  "認証を確認できません。通信を確認して再試行してください。": "No se pudo verificar tu cuenta. Comprueba la conexión e inténtalo de nuevo.",
+  "アプリの登録・ログインとGoogle接続は別の設定です。Google接続をスキップしても、予定やシフトを使えます。": "El registro o inicio de sesión en la aplicación y la conexión con Google son ajustes distintos. Puedes usar eventos y turnos aunque omitas la conexión con Google.",
+  "プロフィールの名前は、アカウント登録とは別の表示名です。": "El nombre del perfil es un nombre visible, distinto del registro de la cuenta."
 }
diff --git a/src/i18n/fr.json b/src/i18n/fr.json
index 6f386b6..66b56c0 100644
--- a/src/i18n/fr.json
+++ b/src/i18n/fr.json
@@ -538,5 +538,21 @@
   "有料プランの利用条件": "Conditions du forfait payant",
   "予定反映プランはGoogleアカウント1件、複数アカウントプランは最大5件で予定反映も含みます。無料利用は1件の読み取り専用です。": "Le plan de synchronisation d’événements couvre 1 compte Google ; le plan multi-comptes couvre jusqu’à 5 comptes et inclut la synchronisation d’événements. Le forfait gratuit couvre 1 compte en lecture seule.",
   "失効後は新しい反映を停止します。Google側のコピーは残ります。返金・解約の条件は購入したストアの規定に従います。": "Après expiration, les nouvelles synchronisations s’arrêteront. Les copies du côté de Google resteront. Les conditions de remboursement et d’annulation suivent la politique du magasin.",
-  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "Les événements privés ne seront pas synchronisés ; les copies envoyées seront supprimées. Si vous révoquez l’autorisation de Google, une reconnexion est nécessaire pour supprimer."
+  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "Les événements privés ne seront pas synchronisés ; les copies envoyées seront supprimées. Si vous révoquez l’autorisation de Google, une reconnexion est nécessaire pour supprimer.",
+  "Googleアカウントを接続（任意）": "Connecter un compte Google (facultatif)",
+  "アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。": "Votre compte dans l’application est prêt. Connectez Google Agenda ici si vous souhaitez l’utiliser.",
+  "接続はスキップできます。後から「設定」で追加できます。": "Vous pouvez ignorer cette étape et connecter votre compte plus tard dans les Paramètres.",
+  "Google接続は現在利用できません。後から設定できます。": "La connexion Google est indisponible pour le moment. Vous pourrez la configurer plus tard.",
+  "取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。": "Choisissez les calendriers à importer. Vous pouvez continuer sans en choisir et configurer cela plus tard.",
+  "ユーザー名の設定へ": "Définir votre nom d’utilisateur",
+  "スキップしてユーザー名を設定": "Ignorer et définir votre nom d’utilisateur",
+  "初回設定へ戻る": "Retour à la configuration initiale",
+  "チュートリアルへ進む": "Continuer vers le tutoriel",
+  "初回設定 {0}/4": "Configuration initiale {0}/4",
+  "アプリアカウント": "Compte de l’application",
+  "Google接続": "Connexion Google",
+  "ユーザー名": "Nom d’utilisateur",
+  "認証を確認できません。通信を確認して再試行してください。": "Impossible de vérifier votre compte. Vérifiez votre connexion et réessayez.",
+  "アプリの登録・ログインとGoogle接続は別の設定です。Google接続をスキップしても、予定やシフトを使えます。": "L’inscription ou la connexion à l’application et la connexion Google sont deux réglages distincts. Vous pouvez utiliser les événements et les shifts sans connecter Google.",
+  "プロフィールの名前は、アカウント登録とは別の表示名です。": "Le nom du profil est un nom d’affichage, distinct de l’inscription du compte."
 }
diff --git a/src/i18n/ko.json b/src/i18n/ko.json
index a19c30c..c173d3d 100644
--- a/src/i18n/ko.json
+++ b/src/i18n/ko.json
@@ -73,7 +73,7 @@
   "Google に接続中": "Google に연결 중",
   "Google の今すぐ取り込み": "Google の지금 가져오기",
   "Google の接続を解除": "Google の연결 해제",
-  "Google を接続": "Google を연결",
+  "Google を接続": "Google 연결",
   "Google を接続し直してください": "Google を연결し直して주세요",
   "Google カレンダー": "Google 캘린더",
   "Google カレンダーを接続": "Google 캘린더を연결",
@@ -538,5 +538,21 @@
   "有料プランの利用条件": "유료 플랜 약관",
   "予定反映プランはGoogleアカウント1件、複数アカウントプランは最大5件で予定反映も含みます。無料利用は1件の読み取り専用です。": "일정 반영 플랜은 1개의 Google 계정을 포함합니다. 다중 계정 플랜은 최대 5개 계정을 포함하며 일정 반영도 포함합니다. 무료 플랜은 1개 계정의 읽기 전용입니다.",
   "失効後は新しい反映を停止します。Google側のコピーは残ります。返金・解約の条件は購入したストアの規定に従います。": "만료 후에는 새 동기화가 중지됩니다. Google측의 복사본은 유지됩니다. 환불 및 취소 조건은 구매한 스토어의 정책을 따릅니다.",
-  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "비공개 일정은 동기화되지 않습니다. 전송된 복사본은 삭제됩니다. Google 권한을 취소한 경우 삭제하려면 재접속이 필요합니다."
+  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "비공개 일정은 동기화되지 않습니다. 전송된 복사본은 삭제됩니다. Google 권한을 취소한 경우 삭제하려면 재접속이 필요합니다.",
+  "Googleアカウントを接続（任意）": "Google 계정 연결 (선택)",
+  "アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。": "앱 계정 설정이 완료되었습니다. Google 캘린더를 사용하려면 여기에서 연결하세요.",
+  "接続はスキップできます。後から「設定」で追加できます。": "이 단계를 건너뛰고 나중에 설정에서 연결할 수 있습니다.",
+  "Google接続は現在利用できません。後から設定できます。": "현재 Google 연결을 사용할 수 없습니다. 나중에 설정할 수 있습니다.",
+  "取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。": "가져올 캘린더를 선택할 수 있습니다. 선택하지 않고 계속한 뒤 나중에 설정해도 됩니다.",
+  "ユーザー名の設定へ": "사용자 이름 설정",
+  "スキップしてユーザー名を設定": "건너뛰고 사용자 이름 설정",
+  "初回設定へ戻る": "초기 설정으로 돌아가기",
+  "チュートリアルへ進む": "튜토리얼로 계속",
+  "初回設定 {0}/4": "초기 설정 {0}/4",
+  "アプリアカウント": "앱 계정",
+  "Google接続": "Google 연결",
+  "ユーザー名": "사용자 이름",
+  "認証を確認できません。通信を確認して再試行してください。": "계정을 확인할 수 없습니다. 연결을 확인한 뒤 다시 시도하세요.",
+  "アプリの登録・ログインとGoogle接続は別の設定です。Google接続をスキップしても、予定やシフトを使えます。": "앱 가입 또는 로그인과 Google 연결은 별도의 설정입니다. Google 연결을 건너뛰어도 일정과 근무를 사용할 수 있습니다.",
+  "プロフィールの名前は、アカウント登録とは別の表示名です。": "프로필 이름은 표시용 이름이며 앱 계정 가입과는 별개입니다."
 }
diff --git a/src/i18n/source-keys.json b/src/i18n/source-keys.json
index 1b2bdf9..580a415 100644
--- a/src/i18n/source-keys.json
+++ b/src/i18n/source-keys.json
@@ -538,5 +538,21 @@
   "「取り込み」はGoogleの予定をアプリで見る機能。「予定反映」はアプリで作った予定をGoogleへ送る有料機能です。",
   "反映には対応プランとGoogleへの書き込み許可が必要です。",
   "「設定」→「カレンダーの並び順」→対象カレンダーの「Googleへの予定反映」で反映先を選び、「この反映先を保存」を押します。",
-  "接続・購入だけでは反映は始まりません。シークレット予定はGoogleへ送りません。"
+  "接続・購入だけでは反映は始まりません。シークレット予定はGoogleへ送りません。",
+  "Googleアカウントを接続（任意）",
+  "アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。",
+  "接続はスキップできます。後から「設定」で追加できます。",
+  "Google接続は現在利用できません。後から設定できます。",
+  "取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。",
+  "ユーザー名の設定へ",
+  "スキップしてユーザー名を設定",
+  "初回設定へ戻る",
+  "チュートリアルへ進む",
+  "初回設定 {0}/4",
+  "アプリアカウント",
+  "Google接続",
+  "ユーザー名",
+  "認証を確認できません。通信を確認して再試行してください。",
+  "アプリの登録・ログインとGoogle接続は別の設定です。Google接続をスキップしても、予定やシフトを使えます。",
+  "プロフィールの名前は、アカウント登録とは別の表示名です。"
 ]
diff --git a/src/i18n/zh.json b/src/i18n/zh.json
index 8092785..bdb3344 100644
--- a/src/i18n/zh.json
+++ b/src/i18n/zh.json
@@ -73,7 +73,7 @@
   "Google に接続中": "Google に连接中",
   "Google の今すぐ取り込み": "Google の立即导入",
   "Google の接続を解除": "Google の断开连接",
-  "Google を接続": "Google を连接",
+  "Google を接続": "连接 Google",
   "Google を接続し直してください": "Google を连接し直して请",
   "Google カレンダー": "Google 日历",
   "Google カレンダーを接続": "Google 日历を连接",
@@ -538,5 +538,21 @@
   "有料プランの利用条件": "付费套餐条款",
   "予定反映プランはGoogleアカウント1件、複数アカウントプランは最大5件で予定反映も含みます。無料利用は1件の読み取り専用です。": "日程同步套餐支持 1 个 Google 账户；多账户套餐支持最多 5 个账户，包含日程同步。免费套餐支持 1 个只读账户。",
   "失効後は新しい反映を停止します。Google側のコピーは残ります。返金・解約の条件は購入したストアの規定に従います。": "到期后，新同步将停止。Google 端的副本将保留。退款和取消条款遵循应用商店的规定。",
-  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "私密日程不会同步，已发送副本将被删除。如果取消 Google 权限，重新连接后才能删除。"
+  "シークレット予定は反映せず、送信済みコピーは削除します。Googleの許可を取り消した場合、削除には再接続が必要です。": "私密日程不会同步，已发送副本将被删除。如果取消 Google 权限，重新连接后才能删除。",
+  "Googleアカウントを接続（任意）": "连接 Google 账号（可选）",
+  "アプリの登録は完了しました。Googleカレンダーを使う場合は、ここで接続できます。": "应用账号已准备就绪。如果要使用 Google 日历，可以在此连接。",
+  "接続はスキップできます。後から「設定」で追加できます。": "可以跳过此步骤，之后也可以在“设置”中连接。",
+  "Google接続は現在利用できません。後から設定できます。": "目前无法连接 Google，之后可以再进行设置。",
+  "取り込むカレンダーを選べます。選ばずに進んでも、後から設定できます。": "可以选择要导入的日历。也可以暂不选择并继续，之后再设置。",
+  "ユーザー名の設定へ": "设置用户名",
+  "スキップしてユーザー名を設定": "跳过并设置用户名",
+  "初回設定へ戻る": "返回初始设置",
+  "チュートリアルへ進む": "继续查看教程",
+  "初回設定 {0}/4": "初始设置 {0}/4",
+  "アプリアカウント": "应用账号",
+  "Google接続": "Google 连接",
+  "ユーザー名": "用户名",
+  "認証を確認できません。通信を確認して再試行してください。": "无法确认账号认证状态。请检查网络连接后重试。",
+  "アプリの登録・ログインとGoogle接続は別の設定です。Google接続をスキップしても、予定やシフトを使えます。": "应用账号注册或登录与 Google 连接是不同的设置。即使跳过 Google 连接，也可以使用日程和排班。",
+  "プロフィールの名前は、アカウント登録とは別の表示名です。": "个人资料中的姓名是显示名称，与应用账号注册不同。"
 }
</review-content>
Read that file — it is the content under review.

Do not invoke any skill, and do not spawn subagents of your own — you are the reviewer. If the instruction file is unreadable, report that exact failure and stop. Return your findings as text in your final message; do not route them through any findings-reporting tool the host may offer.
