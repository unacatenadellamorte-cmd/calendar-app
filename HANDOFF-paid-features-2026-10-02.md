# 引き継ぎメモ: 有料機能(複数Googleアカウント ¥1,000 / Googleへの予定反映 ¥300、RevenueCat)

2026-10-02、Claude Code セッションから Codex へ実装を引き継ぐためのメモ。**このセッションは要件定義(spec作成)のみ。実装コードは一切書いていない。**

## 仕様の正本

**`_bmad-output/specs/spec-paid-features/SPEC.md`** を最初に読むこと。このメモは経緯の要約。

## ユーザーの依頼(原文)

> 1. Googleカレンダーのアカウント複数登録
> 2. Googleカレンダーへの予定反映
> この二つは課金機能としてRevenueCatを使用し課金制度としたい。2は月額300円、1は月額1000円として機能を追加して

## 確認して確定した事項(2026-10-02)

- 1(¥1,000)が2(¥300)を**内包**する。
- 対象は **Android + iOS 同時**。
- 反映は **アプリ→Google の片方向で作成・編集・削除**(取り込み済みGoogle予定の書き戻しはしない)。
- 現行の「Google 1アカウント・読み取り」は**無料のまま維持**。失効時、2つ目以降の接続は削除せず停止(suspended)。

## 着手前に必ず知っておくこと

1. `connections` は現在 **1ユーザー1接続**の部分ユニーク索引で縛られている。複数アカウントにはマイグレーションが要る。
2. 現行OAuthスコープは**読み取りのみ**。反映には書き込みスコープ(`calendar.events`)が必要で、Google の**OAuth検証審査が公開ゲートになりうる**(OAuth同意画面は現在「テスト中」)。期間は推測せず最新ドキュメントで確認すること。
3. **反映した予定を次回の取り込みが重複取り込みする罠**がある(SPEC CAP-4 参照)。実機確認必須。
4. クライアントの権利判定は信用せず、**Edge Function側で検証**(Webhook→`entitlements`テーブル推奨)。
5. RevenueCat の secret key / Webhook シークレットはリポジトリ・`.env*` に入れない(Supabase関数シークレットへ)。
6. `@revenuecat/purchases-capacitor` の Capacitor 8 対応状況は**未確認**。最初に確認して報告すること。

## ユーザー側の準備(Codexではできない)

RevenueCat のプロジェクト作成・キー発行 / Play Console と App Store Connect の定期購入商品登録 / Google Cloud のスコープ追加と OAuth 検証審査 / 接続上限(仮5件)の確定 / シークレットモード予定を反映しない方針の承認。

## 関連する既存ドキュメント

- `docs/google-connection-setup.md`(Google連携の既存手順)
- `docs/android-google-oauth-verification-20260926.md`(Android認可API移行と実機確認)
- `docs/play-data-safety-audit-20260926.md` / `docs/privacy-policy.md`(課金・書き込みスコープ反映が必要)
- `docs/testing-and-verification.md`(デプロイ後スモークの方針)
- `HANDOFF-ad-monetization-2026-09-23.md`(広告は実装済み。課金で広告を消すかは今回の範囲外)

## 次にやること

SPEC.md「9. 推奨する実装順」に従う。まず事前調査(SDK対応・書き込みスコープ要件・価格設定可否)をし、判断が分かれる点だけユーザーに確認する。
