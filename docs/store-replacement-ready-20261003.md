# Multi calendar 差し替え候補の準備（2026-10-03）

## 作成元と検証

- 配布元コミット: `8424325811f2fcf2b61f941b65a413eb71fcd25b`
- ブランチ: `release/paid-mobile-20261003`
- [iOS配布CI 37098312898](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/37098312898): 1.0.23（build 27）、成功。
- 150ファイル・1,471テスト、型検査、lint（既存warning 1件のみ）、iOS補助8件、署名条件12件、Widget Swift 10件成功。Google認可の補助試験、本番Webビルド、ネイティブ構成の生成と冪等性検証も成功。
- MacでarchiveとIPAのアプリ・Widget署名、Team、Bundle ID、App Group、プロファイル、有効期限、配布証明書、Privacy Manifestを検証した。
- Windowsで取得済みIPAの両Info.plistを1.0.23（27）と照合。本番Supabase、Google OAuth、RevenueCat、プライバシーURL、AdMobをGitHub環境変数と照合し、Service Workerの登録解除・キャッシュ削除契約と撮影用通信設定の非混入を確認した。設定値や秘密は記録しない。

## iOS成果物

- IPA: `C:\Users\Ryo\AppData\Local\calendar-app\ios-1.0.23-27-20261003-run37098312898\Multi-calendar.ipa`
- サイズ: 8,464,747 bytes
- SHA-256: `3eef691d448e73b2077e697093c90e32f77ed0939c1a7cffcbad476f52378ec8`
- dSYM: 同じディレクトリの `Multi-calendar-dSYMs.zip`（17,045,974 bytes）。
- 送信対象をrun、SHA-256、build 27へ固定したコミット: `2d0140b986447c656c0bfabc05532af81999f177`、originへpush済み。
- [Apple送信CI 37098879979](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/37098879979): 検証・アップロードともエラーなしで成功。
- 送信UUID: `23b097be-a433-4d37-ad30-4447b08254e1`
- App Store Connectでbuild 27が「提出準備完了」、APIで`VALID`を確認。ビルドID: `23b097be-a433-4d37-ad30-4447b08254e1`、公開バージョン1.0.23。現行提出の差し替え選択はまだ行っていない。

## Android成果物

- 1.0.23（versionCode 26）。前セッションで署名付きAAB、Gradle単体テスト、release lint、bundle生成を完了している。
- AAB: `C:\Users\Ryo\AppData\Local\calendar-app\android-paid26-release\app\outputs\bundle\release\app-release.aab`
- SHA-256: `8f317fbff56626a8a8383ce988bec6b0e2ad913524d5e3c9fde6a60a26e717b8`。今回も一致を確認。
- アップロード証明書SHA-1: `F8:B5:AC:88:4A:C4:0E:5E:49:34:F9:B5:CC:4C:EE:1E:E1:A8:77:3E`、今回も一致を確認。
- [成果物ライブラリのcode 26](https://play.google.com/console/u/0/developers/5645797689705270553/app/4972216250695957379/app-bundle-explorer?artifactId=4860236665202600103): アップロード・処理完了、未公開、リリース0件、対象SDK 36、API 24以上、16KBページサイズ対応。
- `jarsigner -verify` は終了コード0。自己署名・タイムスタンプなし等の警告と、JAR読取り方式によるmanifest順序の警告を出す。Play側はこのAABを受け付けて処理を完了している。

## 現行版と停止位置

- Google code 25は今回確認中に審査が完了し、Alphaクローズドテストで「選択したテスターに公開されました」。画面上の公開日時は2026-10-03 13:19、割合100%。こちらでは現行変更の削除・公開操作はしていない。
- Androidの次回作業は、code 25の審査取消ではなく、登録済みcode 26を使う新しいAlphaリリースの作成・審査送信となる。
- Appleの現行提出ID: `276c1a0f-d1a9-4949-9343-cf7a34facf46`。build 26、サブスクリプショングループ、月額商品2件の4項目が審査待ち。提出キャンセルはしていない。
- 今回の依頼は両候補の準備と差し替え直前まで。現行Apple提出のキャンセルと両候補の更新提出は次の承認後に行う。
- BMad仕様書は `status: in-review` を維持し、差し替え再提出後に `done` へ進める。
- 実機購入・復元、実機Google認可、Widget等のQAは配布成果物の検証と別であり、このセッションでは実施していない。

## 証跡

- `C:\Users\Ryo\OneDrive\デスクトップ\AI作業場\出力画像\20261003_google-play-code26-ready.jpg`
- `C:\Users\Ryo\OneDrive\デスクトップ\AI作業場\出力画像\20261003_google-play-code25-published.jpg`
- `C:\Users\Ryo\OneDrive\デスクトップ\AI作業場\出力画像\20261003_apple-build27-ready.jpg`
- `C:\Users\Ryo\OneDrive\デスクトップ\AI作業場\作業記録\20261003_multi-calendar_build27_成果物検証.json`
