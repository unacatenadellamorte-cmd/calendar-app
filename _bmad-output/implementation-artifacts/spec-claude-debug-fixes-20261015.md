---
title: 'Claude指摘21件と既存iOS修正の統合'
type: 'bugfix'
created: '2026-10-15'
status: 'done'
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
- [x] 既存iOS仕様の差分を再検証し、対象差分だけコミット。項目間依存は記録し無関係な変更を混ぜない。

前提として合成A/BのDBがあるとき、#4の偽装操作を行うと、拒否されBの秘密・予定は不変である。
前提として瞬断・移動・切替があるとき、回帰試験を行うと、編集順序と所有者境界が保たれる。
前提として既存iOS差分と今回修正があるとき、全体検査を行うと、型・静的検査・テスト・ビルドが成功する。実機・外部未確認を成功へ読み替えない。

## Implementation Notes

2026-10-16：本人の「追加修正もしてあげておいて」を、1A・2B反映後の仕様承認と実装続行依頼として受領。既存iOS差分を保持し、修正後のGitHub送信も本人依頼済み。本番適用・配布・審査提出は行わない。

2026-10-16実装：21件のコード・新規SQL・回帰試験を追加。端末予定はカレンダー・元ID・回開始で識別し、旧行の同じ回は行IDとリマインダーを維持。再送は専用オプションで末尾への再登録を止め、クライアントIDの23505だけを本人行と照合する。Google移動は削除フラグ・revision・維持したleaseで直列化し、同じGoogle IDをカレンダー別に保存する。無効日時の自動再試行は終端化する。

ログアウト・別ID通知では旧処理を止めて表示キャッシュ・通知・ウィジェット・背景を片付け、画面全体を再起動する。未送信キューは利用者別DBで保持する。所有者不明の旧DBは削除や自動移送をせず、隔離保管の案内を出す。個別の旧データ帰属・復旧は今回自動化しない。

返金の将来期限はRevenueCatの現在状態を照合し、請求失敗の猶予を維持する。新しいサーバー専用環境変数`REVENUECAT_SECRET_API_KEY`が適用前に必要。未設定・API障害・不正応答は503で再送し、権利を推測しない。この秘密の登録・本番適用は未実施。Apple契約同意・実購入成功・復元・iPad撮影・修正版IPA配布の未受入は既存iOS仕様に残す。

## Spec Change Log

2026-10-16：本人が追加指摘のTDD修正とGitHub送信を再依頼。公開境界（予定・カレンダー作成／同期、DB公開RPC・課金Webhook、代表予定フック／ウィジェットデータ）を了承。BMadの全面差戻しを行わず、`9536b7acc7725d549f92e77605e56d9555e9502c`を保持して問題箇所だけTDDで修正する例外を明示承認。固定意図・1A・2B・配布禁止は不変。KEEP：既存iOS対策、本人別DB、移動時のlease・削除、A/B所有権、給与24h、翻訳を保持。新しいSQLは追加ファイルだけにする。設計漏れ分類の項目も、今回の本人例外により全体再導出ではなく局所修正する。

追加修正の受入：瞬断後もキュー順序不変、初回送信前から同じIDを保持、古い一覧が保存済み／未送信の変更を消さない。端末単発予定は開始時刻変更後も行ID・通知を保持し、繰返しは各回を保持する。多数行照合を分割する。返金は古い商品期限で現在契約を剥奪せず、期限切れ行だけの移転元は後着購入を待つ。終日ウィジェットには暦日を保持する。極端な日時は例外で再試行せず無効値として返す。保護列UPDATEと実呼出元の暦日を補強する。

## Review Triage Log

独立3担当の全17指摘を分類。B=盲検、E=境界、G=検証不足。重複も別行で保持。各分類の通常工程より上記本人のTDD局所修正例外を優先する。

| ID | 判定 | 経路 | 根拠・処理 |
|---|---|---|---|
| B1 | high | patch | createEventのawait後オフライン分岐だけnoOfflineFallbackを見ず再登録する。作成→削除の順序破壊を再現する。 |
| B2 | high | bad_spec | 初回INSERTにIDがない。保存後応答喪失で別IDのキューを作り重複する。最初の送信前に固定する。 |
| B3 | high | bad_spec | listEventsがフックの応答破棄前にcacheReplaceする。保存後の古い応答＋オフライン再取得でキャッシュが欠落する。 |
| B4 | medium | bad_spec | 現在開始日時を含むキーは単発予定の時刻変更でも変わる。旧行ID・通知が失われる。ネイティブの系列情報を使い単発を区別する。 |
| B5 | medium | patch | 全複合キーを単一GETのinへ渡すため件数増加でURLが伸びる。カレンダー単位の分割取得へ直す。 |
| B6 | high | bad_spec | 移転元の期限切れ行も存在確認を通るため先行移転を成功応答し、後着購入を旧利用者へ残す。 |
| B7 | high | patch | CUSTOMER_SUPPORTでも過去期限の分岐が現在状態照合を先取りする。返金の照合を優先する。 |
| B8 | medium | patch | guardは所有者だけでlocal予定の所属カレンダー種別を検査しない。クライアント検査を迂回できる。 |
| B9 | medium | bad_spec | 終日を瞬間だけで保存するためTZ変更で別日に見える。暦日を保持しネイティブ表示へ渡す。 |
| B10 | false | reject | 保存名「マイカレンダー」は本人選択1Aの固定文言。自動翻訳やユーザー変更名の書換えは求められておらず、未使用辞書項目だけを根拠に保存名を変更しない。 |
| E1 | high | patch | B1と同じawait後の再登録。別指摘として記録し同じ修正で検査する。 |
| E2 | medium | bad_spec | B4と同じ単発予定の時刻変更。SDKはisPartOfSeriesを返すが現ラッパが捨てている。 |
| E3 | high | bad_spec | B6と同じ期限切れ行＋先着TRANSFER。公開RPCの試験で保護する。 |
| E4 | medium | patch | 同時刻24h加算がDate上限を超えるとtoISOStringが例外になる。無効日時の終端化を迂回するためnullで返す。 |
| E5 | high | patch | B1の受入不一致。並び替えず先頭を保持することを確認する。 |
| G1 | medium | patch | 既存Google行の保護列UPDATE試験がない。拒否と参照不変、通知のみ更新可を補強する。 |
| G2 | medium | patch | coreだけの日付試験では実フック・widgetから引数を落とす回帰を検出しない。実呼出元のJST朝を検査する。 |

## Verification

### 追加指摘のTDD記録（2026-10-16）

本人了承の3境界で、失敗を確認してから最小修正した。通常の回帰補強（G1・G2）は修正前から成功するため、失敗→修正の実績と混同しない。

| 対応 | 先行する失敗 | 修正後の確認 |
|---|---|---|
| B1/E1/E5 | 再送検証中切断でflushed=1、期待0 | キュー不変・復帰後の削除を確認 |
| B2 | 初回応答喪失で保存先IDとキューIDが相違（予定・カレンダー） | 初回通信前にID固定、再送後も1件 |
| B3 | 古い一覧後のオフライン読込が既存3件だけ | 新規1件も保持。取得前からの未送信作成・編集・削除も3件失敗を確認後に保持 |
| B4/E2 | 単発時刻変更でINSERTされ元の行IDを失う | SDK系列情報を保持し、単発は時刻に依存しないIDで旧行を一意照合。系列各回の既存検査も成功 |
| B5 | 1,001件で重複INSERT、多数削除のID条件が長すぎる | 500件単位の安定順取得、エンコード長で削除を分割 |
| B7 | 過去期限の返金にreconciliationがない | 現在状態照合を優先、関連40件成功 |
| B8 | Googleカレンダーへlocal予定の直接INSERTが成功 | 追加SQLで拒否し本人device・通知設定の許可を保持 |
| E4 | Date上限の24h加算でRangeError | nullで終端、Google反映24件成功 |
| G1/G2 | 検証不足の補強であり製品の失敗ではない | 認証済みGoogle参照UPDATE拒否と通知のみ可、実フック／widgetのJST朝を確認 |
| B9 | 暦日フィールド欠落、旧値のAndroid終日表示が別日になる | 暦日を渡しTZ間で保持。Android42件成功。Swiftも同等修正・試験追加だが実行不可 |
| B6/E3 | Claudeが先行失敗4件を報告。メインでも削除元／先の識別子残留、循環・複数先・上限・逆順移転の誤付与、同権利の後着更新と正式再移転の失効を個別に先行失敗確認 | 移転履歴を時刻順に辿り、購入・移転とも最終移転先へ反映。元は連鎖削除、削除先はNULL終端。推測不能は40001で失敗。購入状態の時刻を移転時刻で上書きしない。最終17件成功 |

Codexの独立統合では通常順の全168ファイル1,642件成功、型検査成功、静的検査は既存警告1件。Android全ホスト42件（失敗・エラー・スキップ0）、iOS Node11件・Python14件・梱包5件成功。Web/iOS向けWebビルド成功、iOS生成JS8ファイルの他ストア文言・URLなし。Google反映の合成DB検査・core/shared一致も成功。Swift/Xcode、OS上の表示、実購入／復元、本物の複数接続によるadvisory lock競合は未実行。本番SQL適用・配布は行わない。

通常順後のseed 20261015検査では初回案内の既存テストが1件失敗（保存前のnullを観測）。画面表示と進捗保存は別の副作用であり、表示完了を保存完了とみなしていた待機不足。既存テストの保存確認だけwaitForへ変え、旧利用者の入力が瞬時に消える検査・期待値・アプリ本体は維持。単独14件成功、全体の同seed再検査でも168ファイル1,642件成功。これは公開境界の追加ではなく既存検査の待機補正。

Claudeの初回成果は実受信し保持した。追加依頼は公式履歴で未読のため、メインが引継ぎ通知を送信して局所修正を担当。追加未受信を担当完了とは扱わない。移転元が完全に空なら既存どおり40001でWebhook再送を要求する。クライアントには移転履歴・内部経路関数を公開しない。

今回のローカル受入と追加指摘対応は完了。17指摘を個別分類し、本人固定文言の変更要求1件は根拠付きで棄却、重複を含む残りは対応済み。新たな保留指摘はない。上記の実機・外部受入は完了へ読み替えず、既存iOS仕様はin-progressのまま保持する。本人依頼により既存releaseブランチへ通常pushする。mainマージ、PR、配布ワークフロー起動、本番反映は行わない。

2026-10-16最終統合：seed 20261015・4ワーカーで全168ファイル1,612件成功。最終の型検査成功、静的検査はエラー0・既存警告1。Web/iOS向けWebビルド成功、iOS生成JS8ファイルに他ストア文言・URLなし。対象100ファイルをローカルコミット`9536b7a`へ保存。AGENTS.mdは除外し、本番適用・配布・審査提出は未実施。独立レビューとGitHub送信は後続で行う。

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
