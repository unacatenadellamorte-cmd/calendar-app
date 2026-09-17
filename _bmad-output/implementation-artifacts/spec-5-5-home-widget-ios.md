---
title: 'iOS代表予定ウィジェットとmacOSビルド検証'
type: 'feature'
created: '2026-09-17'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '6f964408185415a67c52303483ccfb5e6a67b033'
---

<frozen-after-approval reason="最新引き継ぎのCI化方針とユーザーの継続指示に基づく">

## Intent

iOSホーム画面に代表予定を表示する。既存Android版と同じ共有JSONを読むWidgetKit拡張を追加し、WindowsからGitHub ActionsのmacOS環境でビルドを検証できる形にする。署名と実機確認は別途必要。

## Boundaries & Constraints

- 小・中・大は1・2・3件。カレンダー名・色・開始時刻のみ。タイトル非表示、選抜は既存JS側。
- 共有契約は6項目のまま。App Groupは`group.jp.ryo.calendarapp.widget`、キーは`featuredEvents`。
- 予定タップは先頭の`calendar-app://event/{id}`、0件は今日の`calendar-app://day/{date}`。
- iOS 15対応。17以降の背景APIは可用性チェック付きで利用する。
- `project.pbxproj`は直接手編集せずxcodeprojスクリプトで生成。再実行は冪等。
- JS変更はiOSに無いAndroid専用登録APIの分岐に限定し、共有契約・選抜を変えない。
- macOS CIで署名なしシミュレータビルドを実施。配布、DB変更、日週月グリッド型は対象外。
- Claude連携用ワークフローは所有者等の明示的なコメントだけで起動。資格情報はGitHub Secretsで管理。

## I/O & Edge-Case Matrix

| 前提・操作 | 期待結果 | 検証 |
|---|---|---|
| JSON無し・壊れたJSON・空配列を読む | 空表示へ戻る | Swiftテスト |
| 共有領域を更新して再読込 | 最新の保存配列が反映される | Swiftテスト |
| 4件以上・未知のschemaVersion | 最大3件・未知版は除外 | Swiftテスト |
| ミリ秒有無・終日・不正時刻 | ローカルH:mmまたは終日 | Swiftテスト |
| 予定・0件・日付境界をタップ | エンコード済み予定URLまたはローカル今日 | Swiftテスト |
| 不正な色 | 既定の灰色 | Swiftテスト |
| iOSで共有処理を実行 | Android専用APIを呼ばず書込み・再描画 | Vitest |
| ターゲット生成を2回実行 | 2回目に差分なし・依存と埋め込み維持 | Rubyテスト |

</frozen-after-approval>

## Code Map

- `src/platform/widget.ts` / `.test.ts`: 既存選抜とブリッジ。Android専用APIの呼出しだけ分岐。
- `ios/App/FeaturedEventsWidget/`: モデル・WidgetKit画面・Bundle・plist・entitlements・Swiftテスト。
- `ios/App/App/App.entitlements`: 親アプリの共有領域。
- `ios/App/CapApp-SPM/Package.swift`: cap sync生成物。通知・端末カレンダー・ウィジェットの登録不足を更新。
- `scripts/ios/`: xcodeproj依存・冪等なターゲット生成・構造テスト。
- `.github/workflows/ios.yml`: Web検証とmacOSのSwift/Ruby/Xcode検証。
- `.github/workflows/claude.yml`: 依頼コメントからmacOS上でClaudeを起動する設定。
- `docs/ios-ci-and-claude.md` / `docs/capacitor-mobile-setup.md`: 環境・署名・認証・検証範囲。

## Tasks & Acceptance

- [x] Swift本体とデータ契約テストを追加する。
- [x] App Groups・ターゲット自動生成と冪等性テストを追加する。
- [x] JSのiOS呼出しを修正し回帰テストを通す。
- [x] iOSプラグイン一覧をCLIで同期する。
- [x] CI・Claude設定・手順書を作成する。
- [x] ローカルの型・lint・テスト・Webビルドを検証する。
- [ ] GitHub認証後、macOS CIの成功を確認する。
- [ ] Claude App・資格情報を設定し起動を確認する。

受入条件:
- 保存済みJSONがあるとき、拡張を表示すると、サイズに応じた1/2/3件だけを表示する。
- クリーンなチェックアウトでCIを動かすと、App内にWidget拡張を埋め込んだ署名なしビルドが成功する。
- iOSで予定が更新されると、Android専用APIで中断せず共有データを更新する。
- 外部投稿者がコメントしても、Claudeのジョブを起動しない。

## Implementation Notes

開発はユーザーの方針に従いメインセッションで実施する。GitHub CLI未認証、ローカルはWindowsでXcode/Swift無し。検証用Rubyは公式のポータブル版を一時領域に展開し、システム設定を変えず利用した。未実行のネイティブ検証を成功扱いにしない。

## Spec Change Log

- 2026-09-17: 最新引き継ぎと継続指示に合わせ、Mac確保後の手動設定からスクリプト＋CIへ改訂。旧仕様はAI作業場の作業記録へ保存。
- 2026-09-17: インストール済みiOSプラグインに`setRegisteredWidgets`が存在しないため、JS無変更方針を必要最小限のOS分岐へ修正。
- 2026-09-17: iOS 17以降の背景表示要件を満たすため、背景APIを可用性チェックで利用する。iOS 15対応は維持。

## Review Triage Log

メインセッション内で差分・データ契約・検証経路を確認した。独立したサブエージェントレビューは実施していない。

| 判定 | 発見・対応・根拠 |
|---|---|
| 高・修正済み | iOSブリッジにAndroid専用登録APIが無く、共有書込みより先に例外になる。OS分岐とiOS回帰テストを追加。 |
| 高・修正済み | iOSのSPM生成物にウィジェット等の3プラグインが無かった。cap syncで4プラグイン登録を確認。 |
| 中・修正済み | xcodeprojのFoundation参照が特定iPhoneOS SDKのパスになる。SDKROOT参照へ修正しRubyテストで確認。 |
| 中・修正済み | 共有Appスキームが無かった。生成スクリプトで追加し再実行で不変であることを検証。 |
| 検証待ち | Swift契約テストとXcodeビルドはmacOS CI未実行。実機表示・共有ストレージの反映も未確認。 |

## Verification

ローカル: `npm run typecheck`、`npm run lint`、`npm test`、`npm run build`。
macOS: Rubyターゲットテスト、`swift test`、`xcodebuild`、埋め込まれたappex確認。
実機: 共有領域反映、3サイズ、タップ、シークレット除外。CI成功とは別に記録する。

### 2026-09-17 ローカル検証結果

- `npm run typecheck`、`npm run lint`: 成功。
- `npm test -- --reporter=dot`: 99ファイル・820テスト成功。本番接続を避けてローカル用ダミー環境変数で実行。
- `npm run build`: 成功。既存の大きなチャンク警告あり。
- `npx cap sync ios`: 4プラグイン登録に成功。
- Ruby 3.3.12 / xcodeproj 1.27.0: 2テスト・22アサーション成功。新規ターゲット生成、再実行、ソース実在、SDK参照、App Groups、拡張埋込み、既存SPM依存、スキーム維持を確認。
- actionlint: 2つのGitHub Actionsワークフローにエラーなし。
- Swift/Xcode/実機/Claudeの実起動は未実施。Storyは進行中のままとする。
