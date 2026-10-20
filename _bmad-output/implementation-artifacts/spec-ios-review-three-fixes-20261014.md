---
title: 'iOS審査3件の修正と再審査前検証'
type: 'bugfix'
created: '2026-10-14'
status: 'in-progress'
baseline_commit: '6ce525a7c17c02dd87eda0c0c1930fadc81e6ccb'
route: 'dispatch'
review_loop_iteration: 0
context: [docs/ios-review-investigation-20261014.md]
---

<frozen-after-approval reason="本人承認後は意図を固定">

## Intent

1.0.23（27）の撮影クラッシュ・Google Play言及・購入失敗へ対応する。28のIPAにも権限説明欠落と他ストア文言が残る。3件をまとめて扱い、原因未確定の購入は観測と再試行を改善して実機・外部設定と照合する。

## Boundaries & Constraints

撮影・既存写真選択、無料利用、6言語、Androidの課金導線、サーバー権利判定を維持。AGENTS.mdは保持・コミット除外。実機の消去、実課金、商品削除、契約同意、権利の手動付与、無関係な改修は禁止。今回のローカル修正と検証ではデプロイ・Apple送信・再提出を行わない。

## I/O & Edge-Case Matrix

| 状態 | 期待 |
|---|---|
| iOS撮影・写真選択 | 用途説明があり、取消・拒否でも名前のみ登録可 |
| iOS購入・削除確認 | App Store導線のみ。他ストア表示・URLなし |
| Android / Web | 既存ストア管理の動作を維持 |
| 初期化・商品取得失敗 | 段階に応じた案内と再試行。仮価格で購入させない |
| ログアウト・ユーザー切替 | 古い取得結果を捨て、別ユーザーで購入しない |
| 購入取消・承認待ち・反映待ち | 区別して案内。復元を維持、未検証の権利を付与しない |

</frozen-after-approval>

## Code Map

- `ios/App/App/Info.plist`：カメラ・写真用途説明が欠落。
- `src/features/billing/ui/SubscriptionNotice.tsx`：プランと削除確認が共用。他ストアを無条件表示。
- `src/data/purchases.ts`、`src/app/PurchasesSync.tsx`：初期化・ユーザー紐付け。失敗が画面に届かない。
- `src/features/billing/model/usePurchase.ts`、`src/features/billing/ui/PlanSheet.tsx`：価格取得失敗を隠して仮価格へ戻す。
- `src/i18n/catalog.ts`、`vite.config.ts`：翻訳辞書のiOS向け出力を制御。
- `scripts/ios/release-signing.py`、`scripts/ios/build-release-web.mjs`：署名済み成果物の再発防止検査。

## Tasks & Acceptance

- [x] `ios/App/App/Info.plist`：プロフィール・背景画像の用途に合う権限説明を追加。
- [x] `src/features/billing/ui/SubscriptionNotice.tsx`、新規 `src/features/billing/ui/SubscriptionNotice.test.tsx`：OS別導線とプラン・削除確認の検査。
- [x] `vite.config.ts`、新規 `scripts/native-store-contract.mjs`・`scripts/ios/native-store-contract.test.mjs`：iOS不要文言を出力から除外し、他OSを維持。
- [x] `src/data/purchases.ts`、`src/app/PurchasesSync.tsx`、`src/features/billing/model/usePurchase.ts`、`src/features/billing/ui/PlanSheet.tsx`：初期化と商品取得の状態・再試行・購入可否を整理。ログは段階と安全なエラーコードのみ。
- [x] `src/data/purchases.test.ts`、`src/app/PurchasesSync.test.tsx`、`src/features/billing/ui/PlanSheet.purchase.test.tsx`：失敗・再試行・切替・取得済みパッケージのcontext保持を追加検査。
- [x] `scripts/ios/release-signing.py`、`scripts/ios/test-release-signing.py`、`scripts/ios/build-release-web.mjs`：権限説明欠落・iOSの他ストア出力を拒否する検査を追加。
- [x] `src/features/billing/ui/PlanSheet.purchase.test.tsx`：購入モックが第2引数の利用者IDも転送するよう補強し、通常購入と利用者切替後の購入で現在のIDが渡ることを直接検査。
- [x] `src/features/settings/ui/AccountSection.test.tsx`、`src/app/AuthProvider.test.tsx`：削除処理が失敗した際のエラー表示・再試行後の成功と、削除未完了時に旧画面を再表示しない経路を実行する。ローカルのモックと専用保存領域だけを使う。
- [x] `src/platform/layerBack.test.ts`：各試験前に共有モックのplatform・コールバック配列・remove呼出履歴を初期化し、通常順とseed 20261015を含む複数順で既存4件を検査。製品コード・期待値は変更しない。
- [ ] `docs/ios-review-investigation-20261014.md`：クラッシュログ、契約・商品設定、実購入段階を再ログイン後に照合。証拠が得られない項目を未確認として保持。

前提として修正済みビルドがあるとき、iPadで撮影・写真選択・取消・拒否を試すと、クラッシュせず登録を続けられること。
前提としてログイン済みのSandbox利用者がいるとき、両商品購入・取消・復元を試すと、StoreKitとサーバー権利が整合し、二重購入しないこと。
前提として実機・外部設定を未確認の場合、検査結果を提示すると、購入解消・再提出完了と誤記しないこと。

## Implementation Notes

- 追加の「直して」を受領。今回の追加実装担当は新規のlayerBack試験タスクだけを扱い、既に完了した実装・3試験補強や外部確認タスクは変更しない。初期化漏れはWeb試験のplatform値がAndroid試験へ残るもの。変更対象は`src/platform/layerBack.test.ts`だけ。仕様・調査文書の記録、統合検証、コミット判断、実端末購入確認はメインが担当し、担当はコミット・公開・端末操作をしない。
- 承認された3試験ファイルを補強して4件を追加。担当が通常順・seed 20261014、メインがseed 20261015で3ファイル47件の成功を確認し、差分も検査した。購入引数の現利用者ID、切替途中の購入抑止、登録済み・匿名の削除失敗からの再試行、削除未完了中の旧画面遮断を直接検査する。製品コード・外部設定は追加変更していない。
- 本人の全機能反復QA依頼で、既存158ファイルの通常順と異なる2seed、機能別サブセットの反復を追加検証。検証タスク欄への上記2件追加と既存3試験ファイルの補強は、本人が「検証タスク追記とテスト補強を進める」と明示承認した。固定部分は変更しない。追加作業は該当3つの試験ファイルのみを変更し、製品コード変更が必要な場合は実装せずメインへ根拠を返す。模擬試験と実端末・実決済は引き続き分ける。
- 2026-10-14：本人の「続行」を仕様承認として受領。固定部分を維持し、実装担当の成果をメインが差分で検証した。AGENTS.mdは保持・除外。
- メインで関連7ファイル93件、全158ファイル1,567件、型・静的検査、Node11件、Python14件を再実行して成功。静的検査は既存警告1件。iOS向けWebを再ビルドし、JavaScript8ファイルの他ストア文言・URLなしとApp Store管理URLを照合した。
- `src/features/profile/ui/ProfileForm.test.tsx`に、取消・拒否でファイルが返らない場合も名前だけで登録できる検査を追加。用途説明の実ファイル検査と組み合わせたローカル検証であり、iPadのOS権限・撮影実行を確認したものではない。
- 行列の他5行はSubscriptionNotice、購入data層、PlanSheetのモック・生成物テストで実行済み。購入取消・承認待ち・反映待ち・復元の経路と、権利のサーバー判定を維持した。
- 本人の再ログイン後、Apple添付ログで1.0.23（27）のTCC停止と`NSCameraUsageDescription`欠落を照合し、撮影クラッシュ原因を確定。契約一覧は無料アプリ契約のみで、有効な有料アプリ契約を確認できず、課金失敗の有力候補。別にDeveloper Program契約更新への本人同意が提出前提。商品の詳細条件、修正済みIPA、iPad実機とSandbox購入の受け入れ条件は未完了。Step 3の完了条件が揃わないためin-progressを維持し、Step 4の正式な独立レビューへはまだ進まない。契約同意・金融情報入力・設定変更はせず、修正コードはローカルに保持。push・デプロイ・Apple送信・再提出は未実施。

## Spec Change Log

## Review Triage Log

## Verification

2026-10-20：USBで接続iPhoneの1.0.25（29）を実測。本人のTestFlight操作結果として、予定反映の購入完了／契約中／復元と、複数アカウントの購入切替／予定反映を含む表示／復元が成功したと回答を受領。購入キャンセルは本人が確定まで行ったため未実施として残す。プロフィール撮影後のプレビュー／クラッシュなしも受領。既存関連7ファイル94件は成功。対象プロセスの短時間ログは生データを保存せず語の件数だけを取得し、成功証拠と混同しない。iPadの撮影／権限拒否と実機再起動後の権利維持は未受入なので、固定ACや仕様全体を完了扱いにしない。製品コード変更・実課金・本番適用・再提出はしていない。

戻る試験の修正後、メインの全体再実行もseed 20261015で全158ファイル1,571件成功、失敗・保留0。以前の同seedの失敗は修正済み。本人添付の修正前TestFlightプラン画面を受領したが、実購入は未完了として保持する。

追加承認の戻る試験はメインが本体のリポジトリへ最小変更を反映し、通常順・seed 20261014・seed 20261015の各4件、対象eslint・型検査・差分検査に成功。担当が誤って別作業コピーを編集した分は、その追加だけ取り除き差分なしを確認した。製品コードと既存期待値は不変。後続の全体再実行結果は調査文書に記録する。

追加補強後、メインで通常順・seed 20261014とも全158ファイル1,571件成功、3ファイル47件はseed 20261015でも成功。別のlayerBack試験にはseed 20261015の共有モック初期化漏れが残り、追加承認待ちで未変更。Android単体は各39件を2回成功。これらは実決済・実機撮影・修正版IPAの受け入れ条件を満たす証拠にはしない。

`npm run typecheck`、`npm run lint`、`npm test -- --maxWorkers=4`、`node --test scripts/ios/*.test.mjs`、`python scripts/ios/test-release-signing.py`：成功と既存警告を区別。iOS向けWeb成果物も検査。WindowsでXcode・iPad動作を確認済みとはしない。
