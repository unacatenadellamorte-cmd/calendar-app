---
title: 'カレンダー不備3とAndroidバナー広告'
type: 'feature'
created: '2026-09-23'
status: 'done'
route: 'dispatch'
baseline_commit: 'c41b0d4da1f0e73c814f3187c0ce027359a93347'
context: []
---

<frozen-after-approval>

## Intent

指定された「カレンダー不備3.txt」の3点を修正し、修正後のホーム画面を画像として出力する。ユーザーは追加回答で広告も今回実装すると明示した。広告の要件は既存のspec-ad-monetization/SPEC.mdとprerequisites.mdに従う。

## Boundaries & Constraints

- Androidの代表予定・週・月ウィジェットへアプリのテーマと文字サイズを反映する。
- ウィジェットからの冷起動・再開でカレンダー画面を操作でき、予定リンクはデータ取得完了後に一度だけ開く。
- 共通上部ヘッダーの下側角丸と、ステータスバーとの境界線をなくす。
- Androidのみ、下タブの直上へアダプティブバナー。シークレット切替とは独立。オンボーディングには非表示。
- UMPのcanRequestAdsを配信条件とし、同意拒否を非パーソナライズ指定で迂回しない。必要な場合は設定から同意を変更できる。
- 開発は公式テスト広告。本番ID・公開ポリシーはビルド設定で変更する。アカウント登録、実際の公開、個人データの変更は対象外。
- 画像はAI作業場/出力画像/に20260923_接頭辞で保存。既存未追跡資料は保持。

## I/O & Edge-Case Matrix

| 状況 | 期待する動作 |
|---|---|
| ウィジェット起動後に別タブへ移動 | 起動URLの再購読ループが発生しない |
| 予定リンク到着時に読込中 | 読込後に表示してクエリを消費 |
| 同じ予定を別の要求で再度タップ | 再び予定を開く |
| テーマ・文字サイズ変更 | ウィジェットへ反映、秘密予定は引き続き除外 |
| Web/iOS・オンボーディング | 広告リクエストなし |
| UMP拒否・通信失敗 | 配信可能と判定されるまで広告なし、アプリ操作継続 |
| 広告表示中に画面破棄 | 遅い初期化でも広告を残さない |

</frozen-after-approval>

## Code Map

- src/app/DeepLinkListener.tsx: BrowserRouterのnavigate変更で再購読され、getLaunchUrlを再配信する構造。購読を固定する。
- src/features/calendar/ui/CalendarScreen.tsx: 予定データの準備が済んでからリンクを消費する。
- src/platform/widget.ts、src/app/WidgetSync.tsx、Android widget/: 共有データ・テーマ通知・Glance描画。
- src/features/settings/model/: 既存テーマ・月予定文字サイズの設定を再利用。
- src/styles/global.css: 共通ヘッダー、下タブ、本文の広告分余白。
- src/platform/ads.ts、src/app/AdBanner.tsx: Android広告ライフサイクルと下タブ位置の計測。
- android/app/build.gradle、AndroidManifest.xml: App IDとバージョン設定。

## Tasks & Acceptance

- [x] ディープリンク購読ループを修正し実ルーターで回帰検証。
- [x] テーマと文字サイズを共有して3種のウィジェットへ適用し検証。
- [x] ヘッダー形状・境界線を修正。
- [x] 広告SDK、同意、配置、破棄、本番設定、プライバシー設定を実装し検証。
- [x] 型・静的解析・単体試験・Androidビルドを確認。
- [x] エミュレータで起動・遷移・ホーム画像を確認し出力。
- [x] 広告公開準備と作業記録を更新。

受入条件: 起動リンクを持つ状態でホームへ移動したとき、カレンダーへ戻されない。テーマとサイズを変更したときウィジェット表示が一致する。Androidの通常画面ではタブを隠さず広告表示が可能で、同意未許可とオンボーディングでは広告を表示しない。

## Implementation Notes

既存未追跡の仕様・資料は今回の入力として保持。複雑な原因調査・広告統合はメイン、局所CSSとウィジェット設定連動は限定したエージェントが担当し、メインで統合検証する。

## Verification

npm run typecheck、npm run lint、npm test、npm run build、cap sync android、Android単体試験・assembleDebug、エミュレータ操作と画像確認。


## Review Triage Log

| 指摘 | 判定・対応と根拠 |
|---|---|
| blind-1 開始中の停止再表示 | medium、修正。停止時の状態と開始Promiseを無効化し、遅延開始・表示済み双方の再マウント回帰テスト成功。 |
| blind-2 同意失敗から復帰不能 | medium、修正。onlineとアプリresumeで再試行する。 |
| blind-3 バナー失敗後復帰不能 | medium、修正。上記再試行から配置を再調整する。タイマーによる連続リクエストは行わない。 |
| blind-4 取得エラー時の予定リンク消費 | medium、修正。データエラーが解消してから消費する回帰テスト成功。 |
| blind-5 外観更新が通信に依存 | medium、修正。外観とウィジェット登録を取得前へ移動、失敗時は旧予定を保持して再描画。 |
| blind-6 月イベント行高不足 | medium、修正。10sp本文に12dp行高、実描画と超過件数を確認。 |
| blind-7 拡大時の見出し不足 | medium、修正。週・月ヘッダー高と月の残り領域計算へ倍率を反映。 |
| blind-8 停止中systemテーマ更新 | medium、修正。ネイティブ再描画時にuiModeを参照。 |
| blind-9 通常releaseのテスト広告 | false。テスト用releaseは必要な経路。本番広告モードを宣言した場合の入力検証と、既存の提出用requireReleaseSigning経路を保護。一般公開は未実施。 |
| blind-10 ローカルSDK修正 | false。npm packの配布版と全Androidソースを比較して差分なし。不要なpatch-package依存を除去。 |
| edge-1 開始停止競合 | medium、blind-1と同根で修正。 |
| edge-2 通信復帰 | medium、blind-2と同根で修正。 |
| edge-3 外観の通信依存 | medium、blind-5と同根で修正。 |
| verification-1 Android JSON読み込み未検証 | medium、修正。実Context・共有設定を使った3件のinstrumentation testを追加して成功。欠落色が全体既定値へ戻る実害も発見し修正。 |
| verification-2 広告配置数値未検証 | medium、修正。タブ78/余白20→58、90/20→70の具体値、リサイズ、onlineの回帰テスト成功。 |

## 検証結果

- Web/共有ロジック: 119ファイル・993テスト成功。
- 型チェック成功。lintはエラー0、既存のReact context警告1。
- Webビルド、Capacitor同期、Android debugビルド成功。
- Android JVM単体20件成功。エミュレータで外観読取3件・週/月Glance実描画1件成功。
- テスト広告の実ロード・下タブ直上表示成功。オンボーディングの非表示とリンク冷起動後のホーム・設定移動を確認。
- 本番AdMob ID・公開プライバシーポリシー・本人のUMP管理画面の設定は未実施。EEAの本人設定フォーム、iOS、実機端末は未検証。
