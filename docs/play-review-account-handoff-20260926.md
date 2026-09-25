# 審査用ログイン情報の入力引き継ぎ

## 現在の状態
- アプリ用アカウント `una.catena.della.morte+playreview@gmail.com` をユーザー承認のもと作成した。
- Supabaseのメール・パスワード認証でログイン成功を確認。「Play審査用」のプロフィールのみ作成。個人の予定はコピーしていない。
- Googleアカウントを作成したわけではない。Googleカレンダーの審査用アクセスは未準備。
- Play Consoleに名前、メール、説明を入力済み。パスワード未入力・未保存。

## パスワードを手動で入力する
1. PowerShellを開き、次を実行する。パスワードは表示せずクリップボードへコピーする。

```powershell
& "$env:LOCALAPPDATA\calendar-app\play-review\copy-password.ps1"
```

2. Chromeで開いているPlay Consoleの「ログイン情報を追加」画面のパスワード欄へ貼り付ける。
3. 入力できたらCodexへ知らせる。パスワードをチャットへ貼り付ける必要はない。

「すべての機能とコンテンツを制限なく利用できる」のチェックは、Googleカレンダーのアクセスも検証するまで付けない。最終審査提出はまだ行わない。

管理画面: https://play.google.com/console/u/0/developers/5645797689705270553/app/4972216250695957379/app-content/testing-credentials

## 保管
`%LOCALAPPDATA%/calendar-app/play-review/password.dpapi.xml` は現在のWindowsユーザーで復号できる暗号化ファイル。`account.json` は専用アカウントの識別情報。フォルダーのアクセス権は現在のユーザーとSYSTEMに制限してある。

ブラウザの自動承認審査により、認証情報の一時HTMLをローカルファイルURLで開く操作が拒否された。ブラウザURLポリシーによる制限であり、別経路で回避していない。一時HTMLは削除済み。コピー用スクリプトはユーザー操作専用で、Codexは実行していない。
