# 有料機能の実装・検証記録（2026-10-03）

## 確定した仕様

- 月額1,000円の複数アカウントは最大5件。月額300円の予定反映も含む。
- シークレット予定は送信せず、後からシークレットにした場合も送信済みコピーを削除する。
- 無料はGoogle接続1件の読み取り。反映先はローカルカレンダーごとに明示設定する。
- DB到達から10秒待って送信する。既存の6秒Undoを吸収する。失効中は通常送信を止め、秘密コピー削除を優先する。
- Google側で削除したコピーは再作成しない。送信先の変更・停止では以前のコピーを残す。
- Googleの許可取消や接続解除後は削除APIを実行できない。接続解除で追跡情報を破棄したコピーはGoogle側で手動削除する。

## 実装

接続IDと所有者を指定してVaultからトークンを取得するよう修正した。従来のユーザー単位の任意の1件取得を廃止し、5件上限の同時追加競合と端末カレンダーがGoogle件数に混ざる問題も修正した。

追加書き込み認可、反映先設定、DBキュー、サーバー側課金検証、コピーIDの固定、再取り込み除外、排他・再試行・状態表示を追加した。認可フラグとトークンは同一トランザクションで保存する。停止済み反映先が後続キューを塞がないようにし、削除中の秘密解除時はGoogle IDを更新する。

1回の実行は3件ずつ並列処理し、60秒または20バッチで次回へ渡す。失敗は2分から最大60分まで待ち時間を延ばす。シークレット削除もGoogle APIの認可・通信回復が必要で、即時完了を保証する方式ではない。

課金画面に自動更新、解約管理、アカウント削除では解約されない説明を追加した。5言語の翻訳を更新し、日本語と合わせて6言語へ対応した。iOSの明示的なプラグイン一覧とSPM依存から抜けていたRevenueCatを追加し、In-App Purchase機能を設定した。Androidは課金中の別アプリ遷移で購入が中断される条件を減らすためsingleTopに変更した。

低思考作業はClaude CLIのHaikuで実施した（純変換の初稿、翻訳、限定的な確認）。日時変換と韓国語のキー不一致はメインで補正した。今後のモデル選択は `CLAUDE.md` に記録した。

## 検証結果

| 検証 | 結果 |
|---|---|
| Vitest全体 | 148ファイル・1,417件成功（`--maxWorkers=4`） |
| TypeScript | 成功 |
| ESLint | エラー0。既存のprofile-header-contextの警告1件 |
| PGlite | 実Postgresエンジンで全業務マイグレーション、接続分離、5件上限、排他、秘密化競合、停止後の削除、RLS、連鎖削除を確認。Vault暗号化・cronは代替。通常テストにも組込み |
| 実DB | `scripts/smoke-google-push.sql`を本番で実行。5件・包含権利・猶予・秘密化競合・失効後の削除・権限を確認後ROLLBACK。検証データを残していない |
| Deno | 変更4関数の型検証成功 |
| 定期処理 | 本番pg_cronでHTTP 200、`succeeded:0, failed:0`、タイムアウトなし。実Googleへの送信ではなく空キューの疎通 |
| Android | JDK21で単体テスト・lintRelease・署名付きbundleRelease成功。BILLING権限をマージ後Manifestで確認。端末へのインストール・データ消去はしていない |
| iOS | 正しいiOS広告設定でWebビルドとcap sync成功。課金プラグイン7件目を確認。WindowsのためXcodeコンパイル・実購入は未検証 |
| ブラウザー | 本物のUIコンポーネントを一時プレビューで390×844表示。プラン、解約、5件、シークレット説明のスクロールを確認。バックエンド接続を代替した表示検証で、実購入・有料Google操作の通し検証ではない |

高並列の全体テストで既存BackgroundSectionの2本指操作テストが一度失敗した。今回その実装は変更せず、並列数4の全体再実行で成功した。今後再発する場合は同テストの非同期初期化を調査する。

## 本番反映

`20261003000000_google_push.sql`、`20261003010000_google_push_cron.sql`、`20261003020000_google_push_scheduler_auth.sql`を適用した。`push-events`、`oauth-exchange`、`sync-calendars`、`google-calendars`をデプロイした。

初回スモークでは定期処理が401になった。受信Authorizationと関数のservice-role環境値の完全一致だけでは実環境で認証できなかったため、定期処理専用の共有秘密をVaultと関数シークレットへ設定し、専用ヘッダーで照合する方式にした。ゲートウェイのJWT検証は有効のまま。秘密値はGit・本記録に保存していない。修正後のcronで200を確認した。

## Android成果物とPlay

- パッケージ `jp.ryo.multicalendar`、1.0.21／versionCode 22。
- 署名済みAAB: `%LOCALAPPDATA%/calendar-app/android-paid-release/app/outputs/bundle/release/app-release.aab`。
- SHA256: `1B23637AA31FF17B8D544A4E27DFDA423B1FFF286C3BB41A76A60C2463C3C0B3`。
- 既存の提出用キーを使用。鍵・パスワードはGit対象外。OneDriveのファイル属性によるGradleエラーは、AndroidソースをLOCALAPPDATAへコピーして解消した。
- ユーザーがGoogle Payments販売アカウント登録を完了。画面上で販売アカウント設定要求が消えたことを確認。
- ユーザーがAABの未公開アップロードを承認。Alphaの新規リリース4へ22をアップロードし、「1.0.21 課金・Google予定反映（検証用）」として保存。Google側の検証は難読化解除ファイルの警告のみ（本ビルドは難読化しない）。審査提出・テスター配信はしていない。

## 公開前に残る作業

Google Playの2商品は作成・有効化済み。`calendar_write_monthly`（予定反映）は月額300円、`multi_account_monthly`（複数アカウント）は月額1,000円。いずれも基本プランIDは `monthly`、1か月ごとの自動更新、日本のみ。無料試用は作成していない。猶予7日・一時停止期間の自動計算・再定期購入許可は既定値のまま。AABを検証画面まで保存したことで商品作成が可能になった。リリースの審査提出・配信はしていない。

### Google購入検証と通知連携（2026-10-03完了）

- ユーザーが専用アカウント・鍵作成、必要権限、RevenueCatへのJSON登録を承認。API共通・Play Developer・Google Cloud規約への同意と3 APIの有効化も操作直前に承認した。
- Cloudプロジェクト `calendar-app-508202` で `androidpublisher.googleapis.com`、`playdeveloperreporting.googleapis.com`、`pubsub.googleapis.com` が有効であることを画面で確認。
- `revenuecat-service-account@calendar-app-508202.iam.gserviceaccount.com` を作成。CloudはPub/Sub編集者とモニタリング閲覧者。PlayはMulti calendarだけにアプリ情報閲覧、従属する品質情報閲覧、売上データ表示、注文と定期購入管理を付与。アカウント全体・公開・ストア掲載管理の権限は付与していない。
- JSON鍵はRevenueCatの既存Androidアプリ `app329cb0a5d3` に保存。ローカルの鍵は `C:\Users\Ryo\secure-keys\multi-calendar-revenuecat\` に保管し、現在のWindowsユーザーとSYSTEMだけのアクセス権にした。秘密値はGit・チャット・本記録に含めていない。
- 当初は購入検証が権限不足。商品説明を一時変更して保存し、元の83文字へ戻す公式の反映促進手順を実行した時間帯に、RevenueCatが「Valid credentials（認証情報は有効）」へ変化。購入検証、商品一覧、定期購入・基本プラン一覧の3項目が成功。反映待ちの解消と再保存の因果関係は断定しない。
- 通知トピック `projects/calendar-app-508202/topics/Play-Store-Notifications` をRevenueCatが作成。初回の接続は権限エラーだったが、トピックは存在していた。Google Playの送信元 `google-play-developer-notifications@system.gserviceaccount.com` に、このトピック限定のPub/Subパブリッシャーを付与し、既存トピックとして接続すると成功。サービスアカウントを管理者へ昇格していない。
- Playのリアルタイム通知を有効化し、同トピックと「定期購入、取り消し済みの購入、すべての1回限りのアイテム」を保存。テスト通知を送信し、RevenueCatの最終受信 `2026-10-03 00:44 UTC（日本時間09:44）` を確認。通知だけから未登録購入を取り込む追加機能は既定の無効のまま。
- 証拠画像はAI作業場の `出力画像/20261003_multi-calendar_revenuecat-valid.jpg` と `20261003_multi-calendar_revenuecat-connected.jpg`。

課金全体を完了とは扱わない。以下にはまだ実施証拠がない。

- 実機の購入・復元・プラン変更・失効からWebhook、5件制御、追加OAuth、Googleへの作成・編集・削除までの通し検証。認可取り消し時、秘密化時の削除、再取り込み除外も実Googleで確認する。
- iOSのRevenueCat公開キー、ストア商品・グループ・鍵、Xcodeビルド、Sandbox購入。
- 更新したプライバシーポリシーの公開、利用条件の公開リンク、PlayとApp Storeの購入データ申告、Google OAuthスコープの公開審査状態。
- AndroidのsingleTop変更後の実機ディープリンクと、支払い確認で別アプリへ移ったあとの復帰確認。

## 記録の制約と根拠

Obsidianへの保存は未実施。saveスキルが参照する `operation-transactions.md` は「Windows users must run the skill under WSL rather than native Windows or Git Bash」と定める。この環境はWSL未導入のため、vaultへ直接書いて制約を迂回せず、本記録とAI作業場の作業記録を残した。vaultのindex/log/hot更新とコミットも未実施。

- [RevenueCatのCapacitor導入要件](https://www.revenuecat.com/docs/getting-started/installation/capacitor)
- [Google Calendar PATCHの仕様](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch)
- [Google Play定期購入の管理](https://support.google.com/googleplay/android-developer/answer/140504)
- [RevenueCatのGoogle認証設定と反映促進手順](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
- [RevenueCatのGoogle購入通知設定](https://www.revenuecat.com/docs/platform-resources/server-notifications/google-server-notifications)
