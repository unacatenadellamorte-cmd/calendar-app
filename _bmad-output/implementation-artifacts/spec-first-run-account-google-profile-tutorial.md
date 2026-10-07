---
title: '初回の登録・Google接続・名前・案内の順序'
type: feature
created: 2026-10-07
status: done
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
| Google接続・拒否・未設定・取得失敗・任意選択 | GoogleSetupScreen.test.tsx：19件。AppShell.onboarding-flow.test.tsx：実カレンダー選択とWeb callback交換、ネイティブ成功メールあり／なし、保存中離脱・失敗再試行 |
| 名前保存失敗・成功 | AppShell.onboarding-flow.test.tsx：入力保持、再試行、成功後案内 |
| 既存利用者・取得失敗 | AppShell.test.tsxと既存routes.test.tsx：ゲストも通常表示、失敗時は新規と区別 |
| 再起動・利用者切替・保存不可 | AppShell.onboarding-flow.test.tsx：途中再開、古い名前・遅延応答の遮断、保存不可でも完了 |
| 案内完了・スキップ・翻訳 | AppShell.test.tsx、FirstRunTutorial.test.tsx、辞書テスト：再表示なし、全ページ、6言語 |

## Review Triage Log

| ID | 判定 | 根拠・処置 |
| --- | --- | --- |
| B1 | medium | useGoogleCalendars.toggleは楽観更新後に非同期保存し、親の次へは保存状態を知らない。離脱後の失敗表示は消える。内部部品の保存中通知をつなぎ、保存中だけ次へ・スキップを無効にする最小patch。 |
| B2 | medium | startGoogleConnectのネイティブ認可・交換に期限がなく、現在はconnectingでスキップも無効。任意段階を止める。接続中スキップの無効化を削除するpatch。既存mounted判定が離脱後の表示更新を防ぐ。認可そのものの取消は約束しない。 |
| B3 | low | activeでも子のrefreshが再認可エラーになり、この画面に再接続ボタンはない。ただし名前へ・スキップは使え、完了後の設定で再接続できる。利用停止ではない。初回に既に許可取消済みという稀な条件へ新分岐を加える修正は却下。 |
| B4 | low | 完了保存だけ失敗して古いtutorialが残る場合、再マウントで任意案内が再表示されうる。現在の操作はメモリで完了する。保存制限が途中に変わる稀な状態への追加キャッシュ・ガードは却下。端末保存が禁止されたときの再起動保証はできない。 |
| B5 | medium | useAuthFormの確認待ちは既存実装からメモリのみで、通常/authでも再起動で失われる。今回は認証フォームの初期モード・成功先のみを変更し、この欠点自体は以前から存在。パスワードを保存せず確認待ちを再開する改善をdefer。 |
| B6 | low | first-run状態は他タブのstorageイベントを購読せず、同じ利用者の古いタブからdoneを上書きできる。プロフィール自体は消えず、更新すれば復帰する。主対象のモバイル初回利用では稀で、タブ間調停を追加する修正は却下。 |
| B7 | low | 初回段階にログアウトはないが、84fd921のプロフィール未作成ゲートも設定・Outletを隠しログアウトを置いていない。短い名前登録・案内スキップ後は設定で変更できる。既存の初回アカウント切替導線の改善としてdefer。 |
| B8 | low | zh/koの接続中の既存辞書に日本語が残り、新画面でも表示される。該当2値を直接修正し処理中の各言語試験を追加するpatch。 |
| B9 | low | 登録済みの案内に設定から登録・ログインする旧説明が残る。Googleをスキップした人の後からの接続案内へ直接置換し、5言語も合わせるpatch。 |
| B10 | low | deleteMyAccountはIndexedDB・sessionStorageを消すが、今回追加したUUID付き進捗キーは残る。AuthProviderの本人削除成功時に既存firstRunKeyで本人のキーだけ消すpatch。外部API・認証情報保存を追加しない。 |
| E1 | medium | AppShellの利用者別keyで通常/authも再マウントする。認証通知が先に描画されると旧useAuthFormのmounted判定がonSuccessを呼ばず、新AuthScreenも遷移しない。通常画面だけ認証済みなら設定へ戻す内部effectのpatchと実Provider回帰試験。 |
| E2 | medium | B1と同じ保存中離脱。GoogleAccountCalendarsに保存中を表示して親へ伝え、結果確認前の次段階を止める内部接続patchへまとめる。 |
| V1 | medium | 担当がリポジトリの参照と試験を確認済み。表示中のネイティブ成功googleEmail:nullは未検証。実AppShell・実一覧フックで文字列あり／なしの成功→接続表示→選択→名前を試験するpatch。 |

再開記録：不要な担当を停止して新規起動を再試行。境界条件の担当終了後に検証漏れ担当も新規起動でき、既存担当の再利用は行わなかった。BMadの独立性は維持し、全結果受領後に上記を判定。認証・統合のpatchは元の担当であるメインCodexが行う。

処置完了：13指摘を全件判定。8指摘を7つの最小patchへまとめて修正・回帰試験、3件の稀な軽微条件は追加複雑性との比較で却下、既存UXの2件をdeferred-work.mdへ記録。通常/authの別ID通知競合、本人削除時の進捗掃除も実Providerで確認。新しい公開API・書込認可・購入を追加しない。

## Design Notes

プロフィールだけでは「既存」と「今名前を保存した人」を区別できない。利用者別の途中進捗を保存し、保存不可時はメモリで続行する。認証・個人情報の境界と案内はメインCodex、定型翻訳のみ安価モデルへ委任。

## Verification

`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。実データに接続しない確認画面で320px・明暗・文字拡大を確認。実機のconnectedテスト・消去は禁止。

最終実行結果：157ファイル・1,548テスト成功（失敗・保留0）。型検査とビルド成功。lintは既存のFast Refresh警告1件のみ。ビルドには既存の混在import・チャンクサイズ警告が残る。最終JSON結果は端末の一時ディレクトリfirst-run-all-tests-final.json。

画面確認：専用Vite設定の架空データ画面で登録→Googleスキップ→名前→案内を操作。320px、明暗、文字150%で横溢れなし、主要ボタン44px。確認画面は専用設定でのみ動的読込し、通常設定ではアプリモジュールを起動しない。実メール送信・Google認可・本番設定・配布は行っていない。
