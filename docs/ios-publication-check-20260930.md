# iOS公開可否の再確認（2026-09-30）

## 確認結果
- Apple Developer Programの保留表示は解消。個人会員の詳細と更新日2027年10月1日を確認。
- App Store Connectの初回サービス規約はユーザー本人が確認・同意する方針を選択。その後「アプリがありません」「まだアプリが追加されていません」の画面へ進んだことを確認。Codexは同意を実行していない。Multi calendarのストア登録・アップロード済みビルドはまだない。
- Certificates一覧にあるのはiOS Developmentのみ。配布用証明書は未登録。
- App IDs一覧にはSideloadlyのチーム接尾辞付きMulti calendarのみ。ソースの正式識別子jp.ryo.multicalendarとウィジェット識別子の登録は確認できない。
- Profiles一覧は初期案内画面。配布プロファイルは未登録。
- 最新の端末確認用IPAは未署名、元archiveのネイティブ部分を保持してWeb更新したもの。Supabase接続済み、テスト広告。App Storeへそのまま提出できる成果物ではない。

## 公開までに必要な作業
App Store Connectのアプリレコードと掲載情報を準備する。正式App ID、ウィジェットID、App Group、配布署名を設定し、MacまたはmacOS CIで配布用archiveを作成・アップロードする。TestFlight実機検証、プライバシー等の申告、スクリーンショット、審査提出が必要。今回の依頼は公開可否の確認であり、登録・公開操作は実行していない。

参照: [Appleの新規アプリ追加手順](https://developer.apple.com/jp/help/app-store-connect/create-an-app-record/add-a-new-app)、[ビルドのアップロード](https://developer.apple.com/jp/help/app-store-connect/manage-builds/upload-builds)。
