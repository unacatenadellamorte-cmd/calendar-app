# Multi calendar プライバシーポリシー

公開用HTMLは [`public/privacy-policy.html`](../public/privacy-policy.html) に置いている。文面を変更するときはHTMLも同じ内容に更新すること。

## 公開

GitHub Pagesを有効にすると、リポジトリの公開URLは次の形式になる。

`https://unacatenadellamorte-cmd.github.io/calendar-app/privacy-policy.html`

公開後、このURLを `.env.local` の `VITE_PRIVACY_POLICY_URL` に設定し、`VITE_ADMOB_MODE=production` で再ビルドする。Google Playのストア掲載情報にも同じURLを登録する。

公開前に、Google Playのサポート連絡先が設定済みであることと、運営者情報・保存期間・削除方法が実際の運用と一致していることを確認する。

## 2026-10-03 課金・予定反映の追記

公開用HTMLへRevenueCatが処理するユーザーID・購入商品・取引/購読状態・有効期限、Googleへの段階的な書き込み許可と送信項目、シークレット予定の削除、解約とアカウント削除の違いを追加した。HTMLの更新はローカル段階。公開サイトへの反映とストアの申告更新は別途確認する。
