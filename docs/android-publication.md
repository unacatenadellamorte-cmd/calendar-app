# Android公開準備

更新日: 2026-09-17。**公開・審査提出は未実施。**

技術検証: ビルドスクリプトで未署名AABの生成成功。Android 12テスト成功、release lintはエラー0・警告23。未署名であることも確認済み。署名済み提出物・実機受入れは未完了。

## 確定事項と現在地

- 公開先: Google Play。開発者アカウントは未登録。
- 開発者名: Ryo。
- 公開問い合わせ先: una.catena.della.morte@gmail.com。
- 2026-09-17ユーザー承認: 名前は「Multi calendar」、識別子は`jp.ryo.multicalendar`に確定。Android/iOSとApp Groupの設定を更新。
- 現在のversionCodeは1、versionNameは1.0。アップロード済みのversionCodeは再使用しない。
- targetSdk 36、minSdk 24。API 36は調査時点の新規提出要件を満たす。

## ビルド

JDK 21、Android SDK 36、Node/npmが必要。署名キーはユーザー本人が管理し、Git・会話へ貼らない。

```powershell
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
# 検証用。未署名なのでGoogle Playへ提出できない。
.\scripts\android\build-release.ps1 -Unsigned
```

Webビルド、Capacitor同期、Androidユニットテスト、release lint、AAB生成を順に実行する。生成先は既定で`%LOCALAPPDATA%\calendar-app\android-release\app\outputs\bundle\release\app-release.aab`。OneDrive外の生成先を使い、同期による読み取り専用ディレクトリの問題を避ける。

提出用は`ANDROID_KEYSTORE_PATH`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`をローカル環境変数へ設定し、`-Unsigned`を付けずに実行する。パスワードをコマンド引数や履歴へ直接入力しない。Gradleだけを呼ぶ場合も`-PrequireReleaseSigning`を付けると設定不足で停止する。`*.jks`、`*.keystore`、`keystore.properties`はGit除外対象。

このスクリプトは既存の`.env.local`を使う。提出前にSupabase・Google OAuthの接続先が公開用であることを確認する。クライアントへ含めてよい公開キーだけを設定し、service_roleキーは絶対に入れない。ビルド成功だけでバックエンド設定や公開可否は保証しない。

## 公開までの順序

1. 本人が[Play Console](https://play.google.com/console/signup)で開発者登録・本人確認・必要な支払いと端末確認を行う。
2. 新しい表示名と識別子を確定する。識別子変更時はAndroid/iOS/Capacitor/App Group/URL関連の参照を一緒に確認する。
3. アップロードキーを準備し、復旧できるよう本人が安全な場所へバックアップする。Play App Signingを設定する。
4. 下記の公開阻害事項を解消し、署名済みAABを作る。
5. 内部テストへ提出し、実機で起動・登録・ログイン・同期・通知・ウィジェット・データ削除を確認する。
6. ストア情報、画像、プライバシーポリシーURL、データセーフティ、広告、対象年齢、コンテンツレーティング、アプリへのアクセス情報、配信地域・価格を登録する。未確認項目を推測して申告しない。
7. 新しい個人アカウントでは12人以上が連続14日間参加するクローズドテストを行い、本番アクセスを申請する。一般公開はその後。

## 公開阻害事項

- **アカウント削除**: 現在は登録・ログアウトしかない。アプリ内の削除開始手段、外部から削除を依頼できる公開Webページ、本人確認付きの実削除処理が必要。単なるログアウトやGoogle接続解除はアカウント削除の代わりにならない。DB、Auth、Google OAuthのVault秘密、端末キャッシュ、ウィジェット、通知を確認する。
- **プライバシー**: 公開ポリシーとアプリ内リンクが未実装。バックアップを含む保存期間・削除運用・委託先の実設定を確認してから確定する。
- **端末カレンダーの説明**: `src/data/device-sync.ts`は端末由来の予定もSupabaseへ送信する。OS権限の許可だけでなく、利用者がクラウド保存を理解できる説明が必要。データ非収集とは申告できない。
- **Google OAuth**: Play公開とは別に同意画面の公開状態、読み取りスコープの審査要否、実機のリダイレクト動作を確認する。テストユーザーだけでの成功を一般公開可能と扱わない。
- **ストア素材**: 確定名のアイコン、実際の画面のスクリーンショット、フィーチャーグラフィックを用意する。個人の予定・メールを写さない。画像保存先はAI作業場の`出力画像/`、名前は日付接頭辞付き。

## ストア掲載文の下書き

アプリ名: Multi calendar。

短い説明:

複数のカレンダーとシフトをまとめて、優先度に合わせて予定を確認。

詳しい説明:

仕事やプライベート、シフトの予定をひとつの画面にまとめて確認できるカレンダーアプリです。

- カレンダーごとに色と優先度を設定
- 日・週・月・年の表示で予定を確認
- Googleカレンダーや端末カレンダーを選んで取り込み
- お気に入りのシフトを登録し、勤務時間と給与の目安を確認
- 任意のリマインダー通知
- ホーム画面のウィジェットで代表予定を確認

外部カレンダーは読み取り専用です。接続と通知には必要に応じて許可を求めます。同期にはインターネット接続が必要です。給与表示は入力した条件による目安です。

この原稿は新しい名前・実機検証結果に合わせて提出前に確定する。

## データセーフティ調査メモ（申告前の下書き）

| データ | コード上の取扱い | 主な根拠 |
|---|---|---|
| メール・ユーザーID | Supabase Authで認証。匿名利用でもIDを発行 | `src/data/auth.ts` |
| 表示名・任意の写真 | Supabaseのprofilesへ保存 | `src/data/profiles.ts` |
| 予定・カレンダー | クラウド保存と端末キャッシュ。端末由来の予定も送信 | `src/data/events.ts`、`device-sync.ts`、`local-db.ts` |
| Google連携情報 | OAuth経由でアクセスし、サーバー側でトークン管理 | `supabase/functions/oauth-exchange` |
| シフト・時給情報 | ユーザー入力に基づいて保存・計算 | `src/data/events.ts` |
| 通知・ウィジェット | OSのローカル通知と共有データ | `src/platform/` |
| 広告SDK | AndroidへAdMob/UMPを追加。IPアドレス由来の概略位置、広告・アプリ操作、診断情報、端末等の識別子についてGoogleのSDK開示と実設定を照合して申告 | `src/platform/adsController.ts`、`docs/admob-setup.md`、Google公式データ開示 |

2026-09-23にAndroid広告SDKを追加した。設定手順は[広告設定](admob-setup.md)を参照。本番ID・公開ポリシー・UMP管理画面・データセーフティ申告は未完了。SDK導入だけで配信や申告が完了したとは扱わず、[Google公式のSDKデータ開示](https://developers.google.com/admob/android/privacy/play-data-disclosure)と実際のサービス運用を照合する。

## 公式資料

- [対象APIレベル](https://support.google.com/googleplay/android-developer/answer/11926878?hl=ja)
- [新しい個人アカウントのテスト要件](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ja)
- [アカウント削除要件](https://support.google.com/googleplay/android-developer/answer/13327111?hl=ja)
- [ユーザーデータのポリシー](https://support.google.com/googleplay/android-developer/answer/10144311?hl=ja)
