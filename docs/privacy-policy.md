# Multi calendar プライバシーポリシー

公開用HTMLは [`public/privacy-policy.html`](../public/privacy-policy.html) に置いている。文面を変更するときはHTMLも同じ内容に更新すること。

## 公開

GitHub Pagesを有効にすると、リポジトリの公開URLは次の形式になる。

`https://unacatenadellamorte-cmd.github.io/calendar-app/privacy-policy.html`

公開後、このURLを `.env.local` の `VITE_PRIVACY_POLICY_URL` に設定し、`VITE_ADMOB_MODE=production` で再ビルドする。Google Playのストア掲載情報にも同じURLを登録する。

公開前に、Google Playのサポート連絡先が設定済みであることと、運営者情報・保存期間・削除方法が実際の運用と一致していることを確認する。
