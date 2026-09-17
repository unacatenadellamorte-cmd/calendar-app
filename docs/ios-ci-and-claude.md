# iOSウィジェットのビルド検証とClaude連携

Story 5.5は、小・中・大に代表予定を1・2・3件表示するWidgetKit拡張。
カレンダー名・色・開始時刻だけを表示し、タイトルは保存しない。
タップすると先頭の予定、0件なら今日のカレンダーを開く。
日・週・月のグリッド型ウィジェットは別の開発項目。

## ローカルとCIで共通の手順

macOS、Xcode 26以降、Node.js 22以降、RubyとBundlerを使う。
最低対応OSはiOS 15。iOS 17以降の背景指定は可用性チェックで分岐する。
このプロジェクトの依存管理はSwift Package Managerで、CocoaPodsではない。

```bash
npm ci
npm run build
npx cap sync ios
export BUNDLE_GEMFILE="$PWD/scripts/ios/Gemfile"
bundle install
bundle exec ruby scripts/ios/test-widget-target.rb
bundle exec ruby scripts/ios/add-widget-target.rb
swift test --package-path ios/App/FeaturedEventsWidget
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Debug -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath ios/DerivedData CODE_SIGNING_ALLOWED=NO build
```

`add-widget-target.rb`が`project.pbxproj`をxcodeprojライブラリ経由で更新し、
ターゲット依存・拡張の埋め込み・両ターゲットのApp Groupsを設定する。
再実行で差分が増えないことをテストする。プロジェクトファイルの手編集は不要。
App Groupは`group.jp.ryo.calendarapp.widget`、キーは`featuredEvents`。
`npx cap sync ios`は現在の全プラグインをSPMへ登録するため必須。

`.github/workflows/ios.yml`はPR、mainと作業ブランチへのpush、手動実行で動く。
macos-15の既定Xcodeは使わず、26.3を明示する。署名情報と本番Supabase情報は不要。
Web回帰検証、ターゲット生成テスト、Swiftテスト、アプリ＋拡張のコンパイル、
`.appex`の埋め込み確認を行い、ログを7日間保存する。

**署名なしビルド成功は、端末へのインストール・App Groupの実機動作・配布成功を意味しない。**
アプリ未起動中は保存済みスナップショットを再表示するだけで、予定の再取得はしない。
端末での予定反映、3サイズの表示、タップ、終日と日付境界、シークレット予定除外は別途確認する。
実機では両ターゲットに同じ開発チームを指定し、利用可能な署名・App Groupを設定する。

## GitHub認証と初回実行

1. 会話に貼った旧トークンは[GitHubのトークン設定](https://github.com/settings/tokens)で失効させる。
2. ターミナルで`gh auth login --hostname github.com --git-protocol https --web --scopes workflow`を実行し、ブラウザで認証する。
   トークンを会話やGit URLに貼り付けない。
3. `gh auth setup-git`後、作業ブランチ`feature/ios-widget-ci`をpushする。
4. Actionsの「iOSビルド検証」を確認する。失敗した場合はログを確認して修正し、成功前に完了扱いにしない。

## Claude Code GitHub Appの連携

Claude連携は通常のビルド検証とは独立している。必要な設定が無くてもiOS CIは動く。

1. [Claude GitHub App](https://github.com/apps/claude)を、対象の`calendar-app`リポジトリだけにインストールする。
2. ローカルのClaude Codeで`claude setup-token`を実行し、サブスクリプション用トークンを作る。
3. GitHubのリポジトリ設定→Secrets and variables→Actionsに、`CLAUDE_CODE_OAUTH_TOKEN`として登録する。
   値をチャット・ファイル・コマンド引数へ貼らない。CLIでは`gh secret set CLAUDE_CODE_OAUTH_TOKEN`の入力欄を使える。
4. `.github/workflows/claude.yml`をデフォルトブランチへ反映する。
5. リポジトリ所有者・メンバー・共同編集者がIssue/PRコメントで`@claude`に依頼すると、macOS上で起動する。
   外部投稿者のコメント、単なるpushでは起動しない。20ターン・30分の上限がある。
6. 手動の接続確認は`gh workflow run claude.yml --repo unacatenadellamorte-cmd/calendar-app`。
   この経路では固定の確認文だけを実行し、コード変更やIssueへの依頼投稿は行わない。

Claudeの資格情報とGitHub Appのインストール、実際の起動確認が揃うまでは「連携済み」としない。
APIキー方式へ変える場合は、公式資料に沿ってシークレット名とAction入力を同時に変更する。

## 参照した公式資料

- [Capacitor iOS要件](https://capacitorjs.com/docs/ios)
- [macOS 15ランナーのXcode一覧](https://github.com/actions/runner-images/blob/main/images/macos/macos-15-Readme.md)
- [WidgetKitの背景指定](https://developer.apple.com/documentation/widgetkit/displaying-the-right-widget-background)
- [Claude Code GitHub Actionsの設定](https://code.claude.com/docs/en/github-actions)
