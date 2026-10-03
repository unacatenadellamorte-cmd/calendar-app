# Apple EULAリンク不足の修正・再提出（2026-10-04）

## 指摘と原因

- 提出 `cfa63106-c4eb-4296-860a-52697142e210` のアプリ版が3.1.2（サブスクリプション）で却下された。Appleの2026-10-03 22:01の自動メッセージは、App Store製品ページに表示されるメタデータに機能する利用規約リンクがないことを指摘している。
- 公式APIで日本語・英語（アメリカ）の説明文にEULA URLがないことを確認した。独自EULAの関連リソースは`null`であり、独自規約は追加せず既存のApple標準EULAを維持した。
- これは今回のメタデータ指摘への対応であり、アプリ内課金・実機QA全体の完了を意味しない。

## 修正

既存の説明本文をそのまま保ち、以下の行だけを末尾へ追加した。

日本語:

```text
利用規約（Apple標準EULA）:
https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

英語（日本語訳: 利用規約・Apple標準EULA）:

```text
Terms of Use (Apple Standard EULA):
https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

- 日本語ローカライズID: `d7f05e96-de6d-4030-8a23-d6d5deba5dcd`、保存後837文字。
- 英語ローカライズID: `4e522e7d-a94e-4050-a45b-92149d13eac5`、保存後1,457文字。
- API更新後に取得し直し、本文の保持・完全一致・URLの存在・4,000文字以内を照合した。ストア画面でも両言語の保存済みURLを確認した。
- [Apple標準EULA](https://www.apple.com/legal/internet-services/itunes/dev/stdeula/)のページが実際に開き、規約本文が表示されることを確認。
- アプリコード、IPA、選択build 27、課金価格、商品、審査アカウントは変更していない。新ビルドは作成していない。

## 再提出

- 却下されたアプリ版の「審査内容を更新」を実行し、既存の4項目を維持した。[Apple公式の未解決問題の再提出手順](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/manage-a-submission-with-unresolved-issues)に沿って、同じ提出へ再送信した。
- Appleへ日本語で返信し、標準EULA URLを日英の概要へ追加したこと、build 27・課金3項目を維持したことを伝えた。画面に返信が記録されたことを確認。
- 再提出日時: **2026-10-04 00:52:50 JST**。APIの日時は`2026-10-03T15:52:50.761Z`。
- [提出ID cfa63106-c4eb-4296-860a-52697142e210](https://appstoreconnect.apple.com/apps/6817586147/distribution/reviewsubmissions/details/cfa63106-c4eb-4296-860a-52697142e210)は同じ。画面でアプリ1.0.23（27）、有料プラングループ、複数アカウント、予定反映の4項目すべて「審査待ち」を確認。
- APIでも提出・アプリ版が`WAITING_FOR_REVIEW`、項目数4、選択build ID `23b097be-a433-4d37-ad30-4447b08254e1`、`releaseType: MANUAL`を確認した。一般公開していない。
- Android側は今回の指摘対象外であり、変更も状態確認もしていない。

## 次回の確認

- 新規・更新提出の前に、**有効な全ローカライズの概要に機能するEULA URLがあること**を確認する。独自EULAを採用する場合は別途レビューし、今回の標準EULA設定から勝手に変更しない。
- ストア審査承認は未確認。アプリ内での規約表示・購入・復元・Google認可等の実機QAは別の公開ゲートとして残る。
- 証跡: `C:\Users\Ryo\OneDrive\デスクトップ\AI作業場\出力画像\20261004_apple-eula-fixed-resubmitted.jpg`。
- 今回はメタデータ変更のみ。Webやネイティブの自動テストは再実行していない。
