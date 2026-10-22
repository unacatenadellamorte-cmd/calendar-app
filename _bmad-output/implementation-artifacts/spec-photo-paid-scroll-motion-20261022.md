---
title: '写真の有料プラン化・連続スクロール・操作感の改善と再提出'
type: 'feature'
created: '2026-10-22'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '156c89160701dd04d0cbaeaaf6a286e6837047c1'
---

<frozen-after-approval reason="本人が依頼内容と契約移行を確定">

## Intent

**Problem:** 写真表示には失敗案内と権限応答の競合に問題があり、手動の続き読込が必要。Google予定反映が有料のままで、写真の購入権利がない。

**Approach:** 写真を月額500円、複数Googleアカウント＋写真を1000円へ変更し、1アカウントのGoogle同期・予定反映は標準化。写真2不具合、下方向の連続スクロール、短いアニメーションをまとめて検証し両ストアへ再提出する。

## Boundaries & Constraints

**Always:** 本人回答により1000円に写真を含め、旧500円契約は有効期間中写真利用可・新規受付停止。写真は別商品として作成、旧契約を自動変更しない。秘密予定保護・所有者検証・Google書込同意を維持。写真は既定OFF、許可範囲のみ、端末内読取。40件/256px/1600px/16MiB/同時2件を維持。失効・利用者切替・OFFで画像解放。短いopacity/transform中心の動き、動きを減らす設定を尊重。実機操作なし、既存専用AVDのみ。

**Never:** 原本変更、写真のサーバー送信、実課金、購入者の自動解約・移行、外部契約同意、製品版アクセス申請、無関係な変更、新規依存追加。iOS手動公開・Android既存Alphaを維持。

## I/O & Edge-Case Matrix

| 状態 | 期待する動作 | 失敗時 |
|---|---|---|
| 無料/写真500/複数1000/旧500有効 | Google1件の予定反映は標準、写真は新権利または有効な旧500/1000のみ | 課金不明は購入案内と再確認 |
| 写真欄下端へスクロール | 次40件を重複なく自動取得、仮想化を維持 | 既存写真保持、停止して明示再試行 |
| 縮小取得失敗 | 空ボタンにせず失敗と再試行 | 他画像は継続 |
| 許可中の背面/復帰 | 許可完了後に現在の状態を再確認 | 古い利用者・日付へ表示しない |
| 動きを減らす設定 | 移動/フェードを抑え、操作自体は即時反映 | 遷移完了待ちで操作を塞がない |

</frozen-after-approval>

## Code Map

- `src/features/calendar/{model/useDayPhotos.ts,ui/DayPhotoSection.tsx}`：P1/P2修正、同期ロック、仮想一覧と下端読込、画像フェード。既存取消・解放を保持。
- `src/{data/entitlements.ts,data/purchases.ts,features/billing/}`：新device_photos権利・商品、無料writeと写真権利を分離、購入反映待ち/復元/管理/案内更新。旧商品を販売対象から除外し有効権利は保持。
- `src/features/settings/ui/SettingsScreen.tsx`：写真設定の権利案内。写真欄でも必ず再検査。権利は利用者別・期限内の確認済みキャッシュのみオフライン利用、失効時停止。
- `packages/core/src/revenuecat-webhook.ts` と生成先、`supabase/migrations/`：3権利、RPCの許可名と制約を追加。can_google_writeを非匿名の本人へ標準化、接続上限5/1を保持。既存Webhookの順序・移転・返金対策を維持。
- `src/{styles/global.css,ui/BottomSheet.tsx,ui/Screen.tsx}` と月/日表示：既存アニメを再利用し150〜220ms程度へ調整。日付や画像取得を不必要な再マウントでやり直さない。
- 既存配布手順 `docs/store-resubmission-20261022.md`：新版32以降を現況照合。Apple商品グループ22435790、旧calendar_write_monthlyとmulti_account_monthlyを維持し写真商品追加。RevenueCatの既存default offeringと両OSを更新。

## Tasks & Acceptance

**Execution:**
- [ ] 写真2不具合を正常期待の試験へ変更し修正、自動読込の重複/失敗/最終ページ/日付変更を検証。
- [ ] 権利・購入・画面・翻訳・DB/Webhookを統合し、無料/期限切れ/復元/利用者切替を検証。
- [ ] 軽い動きを実装し、専用AVDで画像120枚・反復・動き抑制・操作競合を確認。
- [ ] ストア/RevenueCat商品を更新、移行とDBの退避・差分確認後に配布、署名版を作成し両OS申請を読戻し確認。

**Acceptance Criteria:**
- Given 無料の本人、when Google1アカウントを同期/予定反映、then 有料契約不要で秘密保護を維持。
- Given 有効写真権利、when 下へスクロール、then ボタン操作なしで全写真に到達し重複要求なし。
- Given 写真権利失効または別利用者、when 再描画、then 写真が残らず再購入/確認導線がある。
- Given 新版の審査送信、when 別取得、then iOS手動公開/Android Alphaと新版番号を照合できる。

## Implementation Notes

本人が料金・旧契約の扱いを回答済み。写真UIの局所修正のみ軽量モデルが担当し、権限競合・課金・認証・サーバー・ストア変更と最終検証はメインが担当。全体を無人実行へ渡さず、同じセッション内で成果を検証する。

## Spec Change Log

- 2026-10-22 ストア実価格の読戻しで旧予定反映商品は両OSとも300円、複数アカウントは1000円と確認。本人の旧500円という呼称とは区別し、旧価格・契約は変更しない。新しい写真商品だけ500円に設定。Apple写真商品6825605307とAndroid device_photos_monthly/monthlyを日本のみで作成。現時点で販売・新審査送信は未完了。

- 2026-10-22 本人追加回答：iOSの旧商品はアプリ購入導線とRevenueCatの販売一覧から外し、ストア販売可否を変えず既存更新を維持。Androidは新規受付だけ停止。Apple公式仕様で販売停止は既存更新も止めるため、合意を具体化した。期限不明の無期限権利はオンライン確認時のみ使用し、オフライン保存は確認済み期限付き権利に限定。

## Review Triage Log

| ID | 判定・扱い | 検証根拠 |
|---|---|---|
| B1 | medium / patch | Settingsの保存ONが権利なしでOFF表示となりOFF操作できない。保存値表示とON権利確認を分離する最小修正をClaudeへ依頼。 |
| B2 | low / defer | Androidの複数→下位の専用変更は旧実装にも存在しない。購読管理による更新停止と有効期間終了後の写真購入は可能。専用変更導線は今後の改善として記録。自動変更は追加しない。 |
| B3 | false | PlanSheetは有効な写真・旧契約・multiがある場合に写真の購入ボタン自体を表示しない。標準Google権利は写真完了条件に含まれず、未反映の無料購入が完了になる経路はない。 |
| B4 | medium / patch | 復元時にSDKがmulti契約を返してもDBの写真だけで完了となる経路を確認。SDKの有効商品からmultiの待機要否だけを返し、権利確定はDBのhasMultiAccountまで待つ。回帰試験成功。 |
| B5 | false | 同一利用者の最新要求だけが全インスタンスへ通知する設計。後発正常応答は全listenerをloading=falseへし、エラーも空または期限内キャッシュを通知する。新要求が未完了の間の確認中は誤権利を採用しない意図した状態であり、古い応答を採用する修正は行わない。 |
| B6 | medium / patch | clearPreviousAccountSessionの先頭キャッシュ削除失敗が後続解放を中断する。finallyで後続解放を試し、元の失敗は保持して利用者切替を止める。Storage失敗の回帰試験成功。 |
| B7 | medium / patch | スクロール領域に明示フォーカスがなく、全プラットフォームでキーボード到達を保証しない。tabIndex追加を依頼。 |
| B8 | medium / patch | 画像取得成功後のimgデコード失敗が既存Promiseエラー導線へ入らない。onErrorで既存失敗表示へ切替える最小修正を依頼。 |
| B9 | false | global.css:160の全要素と疑似要素へのreduced-motion規則が既存で有効。新しい外側slide-upと写真fadeも0.01ms・1回へ抑制され、スワイプ終了も即時反映する。 |
| B10 | medium / patch | 権利復帰で閉じたままOSを呼ばない試験の計数assertが不足。audit-uiの復帰前後計数比較を依頼。 |
| E1 | false | AndroidはDATE_TAKENの同じ範囲述語、iOSはcreationDate述語で絞ったあと40件へページングする。hasMore=trueなら前ページは40件で、12件以下かつ続きありの状態は実ブリッジから生成されない。 |
| E2 | low / reject | 権限復帰と要求完了が逆転すると先頭一覧を取り直すことはあるがrunRefで旧応答を捨てる。重複表示や旧利用者への漏れはなく、復帰側を止める新分岐は許可応答が背面で完了する経路の再確認を妨げるため追加しない。 |
| E3 | medium / patch | B8と同根のimgデコード失敗。両レビューの指摘を保持し同じ修正へまとめる。 |
| G1 | medium / patch | 期限付きAキャッシュがある状態でBへ切替・通信断という退行検証が不足。実キャッシュ保存を経由した試験を追加し成功。 |

## Verification

2026-10-22 再開後の最終全体試験は178ファイル1778件成功、typecheck成功、lintは既存警告1件・エラー0。B1/B7/B8/E3をClaudeが最小修正し対象104件成功、B6/G1は親の境界25件、B4は購入・復元58件成功。Android32は最新修正から再生成済み。DBとWebhook配布済み、旧商品停止・販売一覧切替・両OS審査送信は引き続き未完了。

2026-10-22 Claudeの専用Android API36エミュレーター検証報告を受領。既存の架空120枚で40/40/40ページ、スクロール、1600px以内の拡大、日付10往復、OFF後画像0、権利なしOS呼出0が成功。JVM境界2件・プラグイン7件が成功。実機・iOS写真受入ではない。全体試験の旧期待7件を分類し、親がDBの無料反映継続と返金時3権利の期待を修正して8件成功、Claudeが写真権利fixture等を修正して154件成功。全体の再実行は継続中。

写真/課金/Google/権利/SQL/Webhookの対象試験→全体試験、型/静的検査、Web/両OS配布ビルド。専用AVDのOS/実UI結果と、iOSコンパイル・実機未確認を区別。商品実価格を取得し、表示だけ500円へ書き換えない。


