# Multi Calendar両ストア更新・再申請（2026-10-16）

## 作成元と境界

修正元はcb9c44169caaf135c6c60466732037f1d262be9f。既存9536b7aとiOS審査対策、TDD追加修正を保持。AGENTS.mdは保持・除外。新規SQL/Edgeの本番適用、契約同意、金融入力、実課金、端末初期化は実施しない。

## Android

- 1.0.25、versionCode 28。既存Alpha・テスター・地域を維持。
- AAB：C:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261016/android28-build/app/outputs/bundle/release/app-release.aab
- サイズ13,683,144 bytes、SHA-256：5823fc92712f67875bd96880eed6a1be872adb02afb45dfbe1fb627cbda53726。
- 登録済みアップロード証明書の一致、jarsigner、Google公式bundletoolの構造・28/1.0.25/jp.ryo.multicalendarを確認。
- 本番接続・Google・課金・広告・ポリシー同梱、撮影URL非混入、SW自己破棄を実体照合。単体42件成功、lintエラー0・警告1。
- Alphaリリース9に28だけを登録。旧27は含めない。対象端末の増減なし。Play警告は難読化解除ファイル未添付1件のみ。
- 審査送信の最終状態は後段で確認する。

## iOS

- 1.0.25、build 29。主AppとWidgetの両方。
- [Mac配布CI 38848984870](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/38848984870)：成功。168テストファイル、型・静的検査、Swift、archive/export・署名を検査。
- IPA：C:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261016/ios-1.0.25-29-run38848984870/Multi-calendar.ipa
- サイズ8,491,258 bytes、SHA-256：7c5063fe886ad50b4c7ab8472abf3beaec6b3bd1e65826cd8375d7caaa0e8c65。dSYMも同じ保存先に取得。
- WindowsでもIPA内の両版・識別子・カメラ/写真用途、本番公開設定・広告を照合。生成JS8ファイルに他ストア言及・URLなし。撮影用設定非混入。
- 公式APIで最新28、旧提出1.0.23はREJECTED、提出はUNRESOLVED_ISSUES、手動公開を確認。日英説明の標準EULAリンクは保持されている。
- 送信workflowを上記run・ハッシュ・29へ固定。アップロード・処理完了・審査提出は別々に確認する。

## 未受入

Apple契約の現在状態、修正版による実機購入・復元とiPad撮影は未受入。自動試験や署名成功を実機成功へ読み替えない。本人対応を必要とする契約同意は代行しない。両ストアの審査承認・一般公開は今回の送信作業とは別。
