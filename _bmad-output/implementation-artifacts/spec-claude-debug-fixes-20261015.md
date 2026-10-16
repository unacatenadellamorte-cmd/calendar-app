---
title: 'Claude指摘21件と既存iOS修正の統合'
type: 'bugfix'
created: '2026-10-15'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6ce525a7c17c02dd87eda0c0c1930fadc81e6ccb'
context:
  - docs/claude-debug-triage-20261015.md
  - _bmad-output/implementation-artifacts/spec-ios-review-three-fixes-20261014.md
---

<frozen-after-approval reason="本人承認後は意図を固定">

## Intent

Claude指摘21件を検証して修正し、既存iOS差分と統合する。データ保護・同期・課金を先に、表示・翻訳を後に検証する。

## Boundaries & Constraints

release基点、既存差分と本人device取り込みを保持。SQLは新規追加のみ。進捗YAML・mainマージ・本番適用・配布・審査提出・契約同意・実課金・実機初期化は禁止。未検証は未完了と記録し、未送信編集を無言で消さない。

本人選択1A：初回に「マイカレンダー」を1つ自動作成し、新規予定は非シフトlocalを優先。初回作成は利用者単位で冪等にし、既存利用者へ重複作成しない。
本人選択2B：同時刻＝24時間勤務の既存仕様を維持。入力で同時刻を拒否せず、給与の翌日補正を保持。Google反映の同一瞬間は終了を24時間後へ変換する。無効な日時の無限再試行は止める。

## I/O & Edge-Case Matrix

| 状態 | 期待 |
|---|---|
| 他人の接続・秘密参照 | 拒否し他人の行を変えない |
| 再送中の瞬断・応答喪失 | 順序保持・冪等、削除予定を復活させない |
| 反映先移動・再接続 | 旧コピー削除・自作コピーを再取込しない |
| ログアウト・切替 | 旧通知とキャッシュを隔離、他人のキューを送らない |
| 読込中保存・日付境界 | 既存予定を保持し、端末の日付で表示 |
| 返金・移転順序逆転 | 確認済み期限と順序で判定、理由だけで一律剥奪しない |

</frozen-after-approval>

## Code Map

参照文書の表に#1〜21の対象と根拠を対応。coreが一次ソース、Edge共有版は生成する。deviceの全面禁止はAD-17と衝突。旧pay仕様の同時刻24hは本人選択2Bにより維持。

## Tasks & Acceptance

- [x] #4 `supabase/migrations/20261015000000_reference_ownership.sql`：参照所有権・Vault保護・同期RPCを強化、PGliteでA/B分離。
- [x] #1/2/6/19 `src/data/{device-sync,sync,events,calendars}.ts`、`src/features/events/model/useEvents.ts`：回単位ID・再送・読込競合・初回作成を修正し対応テスト追加。
- [x] #3/12/18 `supabase/migrations/20261015010000_google_event_identity.sql`、`scripts/test-google-push-db.mjs`：移動削除とカレンダー別一意性、旧行補完・lease競合・無効日時の終端化を検査。
- [x] #16/17 `supabase/migrations/20261015020000_transfer_retry.sql`、`supabase/functions/sync-calendars/index.ts`、`packages/core/src/google-events.ts`：移転再送と本人マーカー除外を検査。
- [x] #7 `packages/core/src/revenuecat-webhook.ts`：期限切れ取消を失効、将来期限返金は信頼できる状態照合を設計・検証。shared生成と回帰試験。
- [x] #9 `src/data/{auth,local-db,outbox,cache,sync}.ts`、`src/app/AuthProvider.tsx`：所有者隔離と旧応答防御。既存削除再試行の検査を維持。
- [x] #5/8/10/12/13/15 `EventFormSheet.tsx`、`packages/core/src/{featured,pay,google-push}.ts`、`src/features/compact/model/useFeaturedEvents.ts`、`EventListItem.tsx`、`HomeScreen.tsx`、`ListView.tsx`、`src/lib/calendar-view.ts`、`src/platform/widget.ts`：初回通常カレンダー・日付・表示を修正し、同時刻24hの給与とGoogle反映を検査。ウィジェットも整合。
- [x] #11/14 `src/i18n/{source-keys,zh,ko,en,es,fr}.json`、`src/i18n/index.test.ts`：混在・欠落キー修正、仮名とtリテラルを検査。
- [x] #20/21 `src/data/event-stamps-migration.test.ts`、`supabase/config.toml`：個別待ち時間とローカル匿名認証を修正・検査。
- [ ] 既存iOS仕様の差分を再検証し、対象差分だけコミット。項目間依存は記録し無関係な変更を混ぜない。

前提として合成A/BのDBがあるとき、#4の偽装操作を行うと、拒否されBの秘密・予定は不変である。
前提として瞬断・移動・切替があるとき、回帰試験を行うと、編集順序と所有者境界が保たれる。
前提として既存iOS差分と今回修正があるとき、全体検査を行うと、型・静的検査・テスト・ビルドが成功する。実機・外部未確認を成功へ読み替えない。

## Implementation Notes

2026-10-16：本人の「追加修正もしてあげておいて」を、1A・2B反映後の仕様承認と実装続行依頼として受領。既存iOS差分を保持し、修正後のGitHub送信も本人依頼済み。本番適用・配布・審査提出は行わない。

2026-10-16実装：21件のコード・新規SQL・回帰試験を追加。端末予定はカレンダー・元ID・回開始で識別し、旧行の同じ回は行IDとリマインダーを維持。再送は専用オプションで末尾への再登録を止め、クライアントIDの23505だけを本人行と照合する。Google移動は削除フラグ・revision・維持したleaseで直列化し、同じGoogle IDをカレンダー別に保存する。無効日時の自動再試行は終端化する。

ログアウト・別ID通知では旧処理を止めて表示キャッシュ・通知・ウィジェット・背景を片付け、画面全体を再起動する。未送信キューは利用者別DBで保持する。所有者不明の旧DBは削除や自動移送をせず、隔離保管の案内を出す。個別の旧データ帰属・復旧は今回自動化しない。

返金の将来期限はRevenueCatの現在状態を照合し、請求失敗の猶予を維持する。新しいサーバー専用環境変数`REVENUECAT_SECRET_API_KEY`が適用前に必要。未設定・API障害・不正応答は503で再送し、権利を推測しない。この秘密の登録・本番適用は未実施。Apple契約同意・実購入成功・復元・iPad撮影・修正版IPA配布の未受入は既存iOS仕様に残す。

## Spec Change Log

## Review Triage Log

## Verification

`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`、PGlite回帰、core/sharedパリティ、既存iOSスクリプトとiOS向け他ストア除外検査。既存警告は区別。購入成功・復元・iPad撮影は実機の別受入とし、今回のローカル完了と混同しない。

2026-10-16：全168ファイル1,610件成功（修正した旧モック・見出し検査を含む）。その後、実辞書キー一致を含む16件、旧端末予定の通知保持と利用者別初期化を含む41件も成功。型検査成功、eslintはエラー0・既存警告1。Web/iOS向けWebビルド成功、iOS全JS8ファイルの他ストア出力なし。Androidホスト単体40件（失敗・エラー・スキップ0）、Node11件、Python14+5件成功。Swift/XcodeはWindowsで実行不可、変更したSwiftの実行・OS上描画は未確認。

| 固定行列 | 実行済みの根拠 |
|---|---|
| 他人の参照保護 | `claude-security-migration.test.ts`：A/B・Vault・本人device・同期所有者 |
| 瞬断と冪等性 | `sync-replay.integration.test.ts`：A→B、保存応答喪失→23505→削除、カレンダー作成→改名→削除 |
| 移動・再接続 | `claude-sync-migration.test.ts`：旧lease保持と無課金時削除、`sync-calendars-push.test.ts`：本人マーカーのみ除外 |
| 切替 | `account-scope.test.ts`・`account-session.test.ts`・`AuthProvider.test.tsx`・`AppShell.auth-flow.test.tsx`：キュー分離・遅延応答遮断・清掃再試行・再起動後の戻り先 |
| 読込と暦日 | `useEvents.test.ts`：3件＋新規1件、`featured.test.ts`：正負TZ境界、CompactCard・ListView・calendar-viewの表示回帰 |
| 返金・移転 | `revenuecat-refund.test.ts`・`revenuecat-refund-webhook.test.ts`：現在状態・猶予・失敗再送、`claude-sync-migration.test.ts`：移転先行→購入→再送・古い移転 |
