# 独立レビュー1の結果（判定済みの原記録）

107,329バイト ÷ 1,024 = 104.81 kB、N = min(⌊√104.81 + 1⌋, 10) = 10。

- GoogleSetupScreen.tsx:87：カレンダー選択の保存中でも名前へ進める。保存失敗が離脱後に見えなくなる。
- GoogleSetupScreen.tsx:110：接続中はスキップ無効で、応答が来ない場合の中断・時間切れ導線がない。
- GoogleSetupScreen.tsx:70：active接続の取得エラー時に、この画面から再認可できない。
- first-run-state.ts:23：完了記録の保存だけ失敗すると、再マウント時に古いprofile/tutorialが再表示される可能性。
- useAuthForm.ts:40、AppShell.tsx:173：確認メール待ちやログイン切替は再起動で復元されず、空の登録画面になる。
- AppShell.tsx:78：別タブの完了を購読せず、古いタブからdoneを途中状態へ上書きできる。
- AppShell.tsx:175：初回Google・名前・取得エラー段階からアカウント変更への導線がない。
- zh.json:266、ko.json:266：接続中の文言に日本語が残り、初期表示のみの言語試験は検出しない。
- FirstRunTutorial.tsx:31：登録後の案内に設定から登録・ログインする説明が残り、再登録が必要に見える。
- first-run-state.ts:5：アカウント削除後も利用者ID付きの進捗キーが端末に残る。

これは担当の指摘の要約。残り2層も受領し、spec-first-run-account-google-profile-tutorial.mdのReview Triage Logに全件の判定・修正・後回しを記録済み。
