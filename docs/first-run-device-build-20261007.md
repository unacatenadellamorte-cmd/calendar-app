# 初回設定・スタンプの実機確認候補（2026-10-07）

## 作成済み

- ソース：`10c03b6069f1e3e956ed92ebf3ea5c237be48b0e`。初回フロー実装・レビューはb11cf18、資料整理は40c6ea4。
- Android：1.0.24（versionCode 27）、`jp.ryo.multicalendar`、デバッグ署名、公式テスト広告。
- APK：`C:/Users/Ryo/AppData/Local/calendar-app/first-run-device-20261007/multi-calendar-1.0.24-27-debug.apk`
- SHA-256：`39f2ac84ba668f7a525f4ea4945ebe06cbc5d5eee9717ba87e6ab7e869fde512`
- デバッグ証明書SHA-256：`710bb7840ee0d2fd970e25ba0211ea65f41a765ecc453a0da340f571c9b64c00`

Java 25が既定だったため最初のGradleはmajor version 69で失敗。既存のJDK 21をこのビルドの起動引数で指定して再実行し、PC全体の環境設定は変えていない。

`assembleDebug`、`testDebugUnitTest`、`lintDebug`成功。Android 39テスト、失敗・エラー0。lintは警告43件・エラー0。iOS設定・ネイティブ旧Webキャッシュ破棄契約のNode試験5件成功。直前のUI実装では157ファイル1,548テスト成功済み。

APKの署名v2、パッケージ・版・SDK、初回進捗キー・スタンプ資産・Androidテスト広告を検査。ネイティブ用Webビルドは旧静的Webキャッシュを破棄する契約を保持。APK生成・検査のみで、端末のアプリ削除・データ消去・接続端末テスト・インストールはしていない。確認時のadb端末一覧は空。

## 本番スタンプDBの適用（本人承認後）

本番Supabaseへ、公開キーで件数0のカラム照会だけを行った。認証設定APIはHTTP200。event_tags.stamp_idとeventsのstamp_id/stamp_only照会はHTTP400、PostgreSQL 42703（列なし）。個人の予定・タグの内容は読み取っていない。

その後、本人の「進めて」でDB適用とGitHub push・iOSビルドの両方が承認された。対象プロジェクトgcjcrztzjzhbcjpigdvjに再リンクし、履歴とdry-runで未適用が`20261006000000_event_stamps.sql`の1件だけであることを確認して適用した。スタンプ列・制約の追加とタグ名条件の緩和だけで、予定・タグ行の削除、seed、rolesの変更はない。

適用後は両テーブルの追加列を件数0で照会してHTTP200・空配列を確認。リモート履歴も20261006000000まで一致し、再dry-runは未適用0件。本番の個人データへの登録・更新テストはしていない。Dockerなしによるローカルカタログのキャッシュ警告は出たが、リモート適用と確認は成功。

## 実機確認時の注意

デバッグ証明書は既知のPlay署名と異なる。既存Play版への上書き成功は保証せず、署名不一致をアンインストールやデータ消去で解決しない。Googleネイティブ認可に使うデバッグ証明書の登録状態、実機での課金テストも未確認。

## iOS署名付き候補の作成・取得

WindowsではXcodeのネイティブビルドはできないため、承認後に65d7285c3f88b333ade8578bb00d949bb249a74cを既存releaseブランチへpush。既存Mac CIを1.0.24、build 28、release=true・upload=false・capture=falseで起動し成功した。実行はhttps://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/37558899146。Appleへの送信ジョブはスキップ。既存の接続設定なし・版番号20固定の署名なしCI成果物を最新版の代わりに渡さない。

- 保存先：`C:/Users/Ryo/AppData/Local/calendar-app/first-run-device-20261007/ios-1.0.24-28-run37558899146/`
- IPA：`Multi-calendar.ipa`、8,484,741バイト、SHA-256 `2e7e3b04f3769ce1a97e7025cfb6d50b7a5936cfa39439d99fdc0db666690ac4`
- dSYM：`Multi-calendar-dSYMs.zip`、17,045,974バイト、SHA-256 `87b727a52046d2b61c26fddf26ed732d9a09ff821a9a1abbc6088d34b223c923`

CIで型・lint・Web回帰1,548件（157ファイル）、Node8件、署名Python12件、ターゲットRuby2件（30検証）、Swift10件、ネイティブGoogle認可試験が成功。archiveとIPAの主アプリ／Widgetについて署名・プロファイル・共有領域・プライバシー宣言・版番号・公開接続設定を検証し、一時鍵の片づけも成功。

取得後にもZIP整合性、両Bundleの1.0.24（28）、App Store用プロファイル・共有領域、Google戻り先、本番広告、最新初回進捗・スタンプ・本番バックエンド設定、旧静的キャッシュ破棄コード、両dSYMを照合。実機起動・登録・購入・Google接続は未確認。IPAはApp Store配布署名で、直接端末へインストールできると断定しない。TestFlightを更新するにはAppleアップロードとテスト配信への追加が別途必要。

この作成段階ではAppleアップロード・TestFlight追加・一般公開・認証／課金設定・有料メールプランは変更していない。本番変更は承認されたスタンプDBの1件だけ。その後の承認によるApple送信・TestFlight28追加・Android27配信提出は[first-run-test-distribution-20261007.md](first-run-test-distribution-20261007.md)に記録。
