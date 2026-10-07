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

## 実機利用を止める条件

本番Supabaseへ、公開キーで件数0のカラム照会だけを行った。認証設定APIはHTTP200。event_tags.stamp_idとeventsのstamp_id/stamp_only照会はHTTP400、PostgreSQL 42703（列なし）。個人の予定・タグの内容は読み取っていない。

最新版の予定・タグ取得は追加列を前提にしているため、DBマイグレーション未適用のまま動作確認済みとは扱わない。`supabase/migrations/20261006000000_event_stamps.sql`はスタンプ列・制約の追加とタグ名条件の緩和だけで、予定・タグ行を削除しない。本番適用は本人の承認待ちで、まだ実行していない。

デバッグ証明書は既知のPlay署名と異なる。既存Play版への上書き成功は保証せず、署名不一致をアンインストールやデータ消去で解決しない。Googleネイティブ認可に使うデバッグ証明書の登録状態、実機での課金テストも未確認。

## iOSの残り

WindowsではXcodeのネイティブビルドはできない。GitHubへのpushと既存Mac CIでの作成について本人へ確認済みで、回答待ち。候補は1.0.24、build 28だがストア未登録。既存の署名なし検証CIは接続設定なし・版番号20固定のため、実機最新版の代わりに渡さない。

Appleアップロード・TestFlight追加・一般公開・本番設定・有料メールプランは変更していない。
