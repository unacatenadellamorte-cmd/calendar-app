# iOS実機版のSupabase接続修正

## 原因と対象

CIの`ios.yml`はSupabase設定を空にしてコンパイルを検証する。そこで作成した1.0.19（20）の未署名IPAをそのまま案内したため、端末では認証が無効になった。接続なしの状態を「お試しモード」と案内したのは誤りで、実際のお試しモードにもSupabaseの匿名認証が必要。

今回は同じソースのWeb部分を公開接続設定込みでビルドし、検証済みarchiveのネイティブ部分を保持して再梱包する。ネイティブコード、プラグイン構成、権限、広告App IDを変更する場合には、この手順で流用せずmacOSでarchiveを作り直す。

## 作成手順

1. `.env.local`に既存環境の`VITE_SUPABASE_URL`、公開用`VITE_SUPABASE_ANON_KEY`、必要なら`VITE_GOOGLE_OAUTH_CLIENT_ID`を用意する。値やファイルはコミットしない。管理者用キーは使用しない。
2. `npm ci`を実行する。
3. `node --test scripts/ios/build-device-web.test.mjs`を実行する。
4. `npm run build:ios:device`を実行する。Supabase設定の有無、キー種別、JWTに含まれるプロジェクトを検査し、認証設定APIへの読み取りとメール認証の有効化も確認する。全APIの権限・動作を保証する検査ではない。iOSの公式テスト広告に固定する。
5. `python scripts/ios/package-device-ipa.py --base <元の未署名IPA> --web dist --output <新しいIPA>`を実行する。元IPAはSHA-256 `40f8f6e9cd25f96ca248326c5c287a16761f6bf992bb4289249e79712f65ee3e` の1.0.19（20）に限定する。Web資産ハッシュ、広告設定、ZIP整合性、ネイティブの内容と権限を検査する。成功後だけ出力する。
6. Sideloadlyで同じAppleアカウント・同じ識別子のまま再署名して上書きインストールする。元のアプリの削除は不要。

## 今回の成果物と検証

- `C:/Users/Ryo/AppData/Local/calendar-app/ios-connected-20260930-artifacts/multi-calendar-ios-auth-fixed.ipa`
- SHA-256: `5a00f5282c6855e2797a0962e3324515a7c7e580de8ec0b17f9218c5204135cc`
- バージョン1.0.19（20）、Supabase接続あり、iOS公式テスト広告、Widget保持。公開キーはアプリに組み込む設計で、管理者権限は含めない。
- 実機向けネイティブarchiveは既存のビルド成功済み成果物を利用。Web部分の型チェック、既存認証テスト18件、新しいビルド設定検証4件、再梱包検証5件、lint（エラー0・既存警告1件）を確認。
- Supabase認証設定APIへの読み取りがHTTP 200。これは認証画面と予定の操作検証とは分ける。
- 同じ最終Web資産をローカルプレビューし、新しい匿名セッションで「iOS動作確認」というプロフィールを作成、ホームと2026年9月のカレンダー月表示を確認した。個人の予定は読み取らず、削除操作も行わない。iPhone上の動作確認は別途必要。
- 未署名IPAなのでSideloadlyで署名が必要。実機の更新・起動確認は本人操作で確認する。

Apple有料会員の有効化とTestFlight提出は別工程。この修正は既存アプリのRLS・認証設定・ユーザーデータを変更しない。
