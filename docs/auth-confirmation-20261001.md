# メール登録の確認待ち対応(2026-10-01)

## 背景

お試しモード(匿名セッション)からメールアドレスとパスワードを登録すると、Supabase は
確認メールを送ったうえで成功応答を返す。アプリはこれを登録完了として設定画面へ戻していたため、
確認前のログインが資格情報の不一致になり、登録の繰り返しで確認メールの送信上限に達した。
また、確認後の転送先が Site URL(ローカル開発用の値)で、ブラウザで開けなかった。

## 変更仕様

### データ層 `src/data/auth.ts`

- `signUpWithPassword` / `upgradeToPassword` は `SignUpOutcome` を返す。
  - `{ status: 'complete' }`: 登録完了
  - `{ status: 'confirmation-pending', email }`: 確認メール待ち
- 新規登録(`signUp`)は、セッションが返れば完了、返らなければ確認待ち。
- 匿名昇格(`updateUser`)は同じ uid を保つ。応答のユーザーが次をすべて満たすときだけ完了。
  - `is_anonymous` が偽
  - `email_confirmed_at` がある
  - `email` が要求したメールアドレスと一致する(大文字小文字は区別しない)
  - それ以外(`new_email` に保留された応答など)は確認待ち。ユーザーが返らない応答はエラー。
- 確認後の戻り先として `AUTH_CONFIRMATION_URL` を指定する。
  - `signUp`: `options.emailRedirectTo`
  - `updateUser`: 第2引数の `emailRedirectTo`
- エラー時の自動再実行はしない。個別に扱わないエラーは汎用の文言になる。

### エラー文言 `src/data/auth.errors.ts`

| Supabase のコード | messageKey | 案内 |
| --- | --- | --- |
| `email_not_confirmed` | `auth/email-not-confirmed` | 確認メールのリンクを開いてからログイン |
| `over_email_send_rate_limit` | `auth/email-rate-limited` | 最新のメールを確認するか時間をおく |
| (アプリ内の再送抑止) | `auth/confirmation-recently-sent` | 送信済み。1分ほど待つ |
| `invalid_credentials` | `auth/invalid-credentials` | 既存の文言のまま(アカウントの有無や確認状態を示さない) |

### フックと画面 `src/features/auth`

- 確認待ちでは設定画面へ戻らず、その場で次を案内する。
  - 送信先のメールアドレス
  - 複数届いている場合は最新のメールを使うこと
  - 確認後にアプリへ戻り、同じメールアドレスとパスワードでログインすること
- 復帰導線は「ログインへ進む」(メールアドレスは保持)と「別のメールアドレスで登録する」。
- 再送ボタンは置かない。同じ宛先への登録は60秒間は送信せず、送信済みと表示する。
  この記録はメモリ上だけに持つ。画面を開き直した後はサーバーの送信上限と専用文言で受ける。
- 送信中は連打・入力変更・モード変更を受け付けない。画面を離れた後の応答では遷移しない。
- パスワードは確認待ちに入った時点で入力欄から消す。ログ・永続ストレージへは書かない。
- ログイン成功と、確認が不要な設定での登録完了は、従来どおり設定画面へ戻る。

### 静的ページ `public/auth-confirmation.html`

- 外部の資源・通信・保存・ログを使わない単独ページ。`referrer` は `no-referrer`、
  CSP は `default-src 'none'`(インラインのスタイルとスクリプトのみ許可)。
- URL の hash / query は種別だけ判定し、直後に `history.replaceState` で URL から消す。
  値は画面へ出さない。表示は固定文言を `textContent` で入れる。
- 読み込み時に加えて `hashchange` / `popstate` / `pageshow` でも毎回判定し直す。
  同じタブでハッシュだけが変わる移動でも、表示を更新して URL を消す。
- 履歴(`history.state`)には判定した種別名だけを残す。戻る・進むではその種別を表示する。
  種別名が既定の値でなければ結果不明として扱う。
- 判定(上から順に適用)

| 条件 | 表示 |
| --- | --- |
| `error` / `error_code` / `error_description` があり、`error_code=otp_expired` | このリンクは使えません(失効・使用済み) |
| 上記以外のエラー | 確認を完了できませんでした |
| hash に空でない `access_token` があり、`type` が `signup` か `email_change` | メールアドレスの確認を受け付けました |
| 空でない `message` がある | 確認はまだ完了していません |
| それ以外(`code` だけ、空のトークン、`recovery` などの対象外の種別、パラメータなし) | 確認結果を表示できません |

- トークンの検証・セッション保存・自動ログインはしない。どの表示でも、アプリに戻って
  ログインすること、できない場合はアプリから登録し直して最新のメールを開くことを案内する。
- 言語は端末の第一言語が日本語なら日本語、それ以外は英語。

### Service Worker `vite.config.ts`

- `navigateFallbackDenylist` に受け皿を追加。`/calendar-app/auth-confirmation.html` と
  `/auth-confirmation.html` のどちらも(query 付きを含めて)`index.html` へ差し替えない。
- `globIgnores` で受け皿を事前キャッシュから除外し、常にネットワークの HTML を使う。
- 既存の `/api` 除外はそのまま。

### 多言語

確認待ちの案内とエラー文言の9件を、`src/i18n` の6言語(日本語はキー、英・中・韓・西・仏は辞書)へ追加。

## 検証結果

実サービス・実端末・実メールは使わず、モックと jsdom 上で確認した。

| コマンド | 結果 |
| --- | --- |
| `npm test -- src/data/auth.test.ts src/data/auth.errors.test.ts src/features/auth src/test/auth-confirmation-page.test.ts` | 5ファイル・70件成功 |
| `npm run typecheck` | エラーなし |
| `npm run lint` | エラー0(既存の警告1件: `src/ui/profile-header-context.tsx`) |

テストで確認している主な点:

- データ層: 即時完了 / 確認待ち(`new_email` 保留、確認日時なし、メール不一致、匿名のまま)/
  送信上限 / メール未確認 / 再実行しないこと / 戻り先 URL の指定
- フック: 確認待ちで `onSuccess` を呼ばない / 60秒の再送抑止 / 連打 / 送信中の変更 /
  画面を離れた後の応答 / パスワードをログ・ストレージへ出さない
- 画面: 確認待ちの案内と復帰導線 / 個別のエラー文言 / 送信中の無効化 / 英語表示
- 静的ページ: URL の秘密値の消去 / 失効リンク / 対象外のトークン・コードを受付と表示しない /
  同じタブでのハッシュ変更 / 履歴の戻る・進む / 説明文を画面へ出さない / 日英
- Service Worker 設定: 受け皿が差し替え対象外で、事前キャッシュからも除外されていること

未確認の点:

- 実環境の Supabase が返す転送 URL の形(hash の `type` の値など)は、auth-js 2.115.0 の
  ローカルソースと既知の仕様に基づく。公開後に実際の確認メールで一度確認すること。
- ビルド後の `sw.js` の中身は確認していない(設定値の単体テストのみ)。

## 公開先と設定手順

公開先 URL(固定):

```
https://unacatenadellamorte-cmd.github.io/calendar-app/auth-confirmation.html
```

1. `public/auth-confirmation.html` を GitHub Pages へ公開し、上の URL をブラウザで開いて
   「確認結果を表示できません」と表示されることを確認する。
2. Supabase ダッシュボードの Authentication → URL Configuration を開く。
   - Redirect URLs に上の URL を完全一致で追加する(ワイルドカードは使わない)。
   - Site URL をローカル開発用の値から、公開している URL へ変更する。
     許可されていない戻り先は無視され、Site URL へ転送されるため。
3. Authentication → Emails のテンプレート(Confirm signup / Change Email Address)が
   `{{ .ConfirmationURL }}` を使っていることを確認する。`{{ .SiteURL }}` を直接書いた
   リンクでは受け皿へ届かない。
4. 検証用のアカウントで、匿名状態からの登録 → 確認メールのリンク → 受け皿の表示 →
   アプリでログイン、の順に確認する。あわせて次も確認する。
   - 古い確認メールのリンクで「このリンクは使えません」と表示される
   - リンクを開いた後、ブラウザのアドレス欄にトークンが残っていない
5. アプリの Web 版を配布している場合は、新しい Service Worker が有効になった後に
   受け皿の URL(query 付き)がアプリ画面へ差し替わらないことを確認する。
