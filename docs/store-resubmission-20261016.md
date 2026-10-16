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
- 審査送信済み。公開の概要で「審査中の変更」と上記28のリリース名を確認し、その後の再読込で「変更内容は現在審査中です」を確認。事前チェック待ちも終了。審査承認・配信開始とは区別する。
- 一般公開ではなく、既存クローズドテストAlpha内の100%配信が審査対象。管理対象の公開オフ、対象地域・テスターは変更していない。

## iOS

- 1.0.25、build 29。主AppとWidgetの両方。
- [Mac配布CI 38848984870](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/38848984870)：成功。168テストファイル、型・静的検査、Swift、archive/export・署名を検査。
- IPA：C:/Users/Ryo/AppData/Local/calendar-app/store-resubmission-20261016/ios-1.0.25-29-run38848984870/Multi-calendar.ipa
- サイズ8,491,258 bytes、SHA-256：7c5063fe886ad50b4c7ab8472abf3beaec6b3bd1e65826cd8375d7caaa0e8c65。dSYMも同じ保存先に取得。
- WindowsでもIPA内の両版・識別子・カメラ/写真用途、本番公開設定・広告を照合。生成JS8ファイルに他ストア言及・URLなし。撮影用設定非混入。
- 作業開始時の公式APIで最新28、旧提出1.0.23はREJECTED、提出はUNRESOLVED_ISSUES、手動公開を確認。日英説明の標準EULAリンクは保持されている。
- 送信workflowを上記run・ハッシュ・29へ固定。[アップロードCI 38885512599](https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/38885512599)は成功。2026-10-16 10:12:41 UTCにエラーなしの受領を確認。
- Apple公式APIでbuild 29（16302f28-3db0-4785-ac42-fdd68ee99637）がVALIDになったことを確認。既存内部グループ「実機審査確認」へ追加し、関係一覧の29とIN_BETA_TESTINGを再取得して照合。既存23/27/28・テスターは削除／拡張していない。日本語テスト項目も登録した。
- App Store提出候補を1.0.25・build 29へ更新し、別取得で選択29/VALIDと手動公開を確認。標準EULA入り説明と既存審査用ログイン情報を保持し、旧番号より29を優先する準備メモを追記。実機未受入を明記。
- 初回提出の却下状態では「このバージョンの最新情報」の更新をAPIがSTATE_ERROR（編集不可）として拒否した。説明や既存掲載情報を上書きする回避はしていない。TestFlightの日本語テスト案内は別途登録済み。
- 再審査は未送信。差替え後の再取得で1.0.25はPREPARE_FOR_SUBMISSION（提出準備）、既存の審査提出はUNRESOLVED_ISSUES（未解決の指摘あり）を確認。アップロード・TestFlight配布成功を再申請完了とは扱わない。

## 未受入

Apple契約の現在状態、修正版による実機購入・復元とiPad撮影は未受入。Chromeと内蔵ブラウザーの契約ページはともにログインへ戻るため、キャッシュに残った契約更新通知だけで現在の契約状態を断定しない。本人の再ログイン後、有料契約と更新契約の状態を読み取り、必要な同意・金融入力は本人へ引き継ぐ。自動試験や署名成功を実機成功へ読み替えない。両ストアの審査承認・一般公開は今回の送信作業とは別。

## 次の引継ぎ

1. 本人がAppleの契約ページへ再ログイン。必要な契約確認は本人が行う。
2. TestFlight 1.0.25（29）で実機購入・復元、iPadの写真選択から撮影を受入確認。未実施・失敗は未完了のまま記録。
3. 条件が揃ったら審査メモの未受入部分を実際の結果へ更新し、既存却下提出を再送。選択29・手動公開・審査待ちを再取得して完了判定。
