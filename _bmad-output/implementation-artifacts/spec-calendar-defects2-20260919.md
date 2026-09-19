---
title: 'カレンダー不備２の修正'
type: 'bugfix'
created: '2026-09-19'
status: 'done'
route: 'dispatch'
baseline_commit: '2253090079c941423c631d892826e52e611d000c'
review_loop_iteration: 1
context: []
---

<frozen-after-approval>

## Intent

ユーザー指定の `カレンダー不備２.txt` の8項目を修正する。月ウィジェットの複数予定表示、週ウィジェットの日別追加ボタン除去、主要3画面の上部をプロフィール付き1行へ集約、背景トリミングのピンチとカレンダープレビュー、月予定文字サイズ3段階、リストの独立スクロール、月画面の左右余白縮小、保存した場所から地図を開く操作を整える。

## Boundaries & Constraints

既存の予定・設定・背景画像を消さない。プロフィールの通常タップ/ダブルタップを維持し、ステータスバーへ重ねない。文字サイズは現在を小として保持し端末ごとに保存。モックは架空予定を使い、保存画像へ焼き込まない。外部URLの安全なスキーム制限と地図選択設定を維持。取り込み予定の読み取り専用を変更しない。既存未追跡ファイルには変更しない。

## I/O & Edge-Case Matrix

| 状態 | 操作 | 期待結果 |
|---|---|---|
| 同日複数予定 | 月ウィジェット表示 | サイズに応じ複数表示、溢れた件数を示す |
| 週ウィジェット | 日別列を見る | 各日＋がなく予定を読む領域が増える |
| ホーム/月/設定 | 開く | プロフィールアイコンと指定アクションがstatusbar直下の同じ行 |
| 背景切り出し | 2指距離を変える | 倍率変更、1指へ戻ると移動継続、プレビューと保存範囲一致 |
| 月表示 | 小/中/大設定 | 文字サイズが変わり、長い件名のアニメーションを保持 |
| 多数のリスト予定 | 日付へ移動/スクロール | 上の表示切替が残り、月へ戻れる |
| ローカル予定に場所保存 | 再度開き地図ボタン | 設定した地図へ場所を渡す。失敗なら画面内に説明 |

</frozen-after-approval>

## Code Map

- Android/iOS widgetとCalendarOverview、描画テスト: 件数制限と＋操作を変更。
- AppShell/Screen/HomeScreen/CalendarScreen/SettingsScreen: アバターを共通ヘッダーへ集約。
- MonthView/stylesと設定model/UI: 保存可能な3段階文字サイズ、月余白。
- ListView: 全体scrollIntoViewを廃し専用領域だけ移動。
- BackgroundCropSheet/cropGeometry: 複数pointer操作と非操作モック。
- EventFormSheet: local予定は詳細画面ではなくこの編集画面が開く。場所/URLの起動操作を追加。

## Tasks & Acceptance

- [x] ウィジェット表示・描画回帰テスト。
- [x] 上部集約・月余白・文字設定・リストスクロールと回帰テスト。
- [x] ピンチと月モック・操作境界テスト。
- [x] 編集画面からの地図/リンク起動と入力検証・回帰テスト。
- [x] 翻訳・型検査・lint・全体テスト・Androidビルドと可能な実機更新。

## Implementation Notes

指定ファイルの全修正が承認範囲。低コストモデル3担当を同一セッション内で利用し、mainが原因調査・統合・検証。地図不具合はlocal予定の編集画面に起動ボタンがないことを確認。不可逆なDB変更不要。

## Review Triage Log

| 指摘 | 判定・根拠と処理 |
|---|---|
| B1 超過数の追加行がはみ出す | false。日付と超過数は同じRowで、追加テキスト行ではない。最小画像とbounds確認済み。 |
| B2 未使用のmore翻訳とhelper | low。呼出なしを確認し、不要helper・翻訳・関連テストを削除。 |
| B3 6週月の実描画不足 | low。5/6週の容量計算を単体確認済み。実描画は現在月のため6週月の追加描画は未実施。公開テスト用の日付変更API追加は不要と判断。 |
| B4 拡大フォントの実描画不足 | low。fontScaleを計算へ反映し単体境界確認済み。エミュレータの追加倍率での目視までは未実施。 |
| B5 大文字が固定セル高を超える | false。min-heightは上限ではなく実セルは伸長する。3サイズとも実ブラウザで確認。 |
| B6 文字設定と実チップの検証不足 | false。保存/起動復元テストと実ブラウザの8/10/12px・marquee測定を併用している。 |
| B7 モックの固定月で保存範囲がずれる | false。架空月は装飾レイヤーのみで保存geometryには不関与。 |
| B8 lostpointercapture後に指が残る | medium。解放処理を共通化しlostpointercaptureも接続。3経路のパン復帰テストを追加。 |
| B9 avatar不在で見出しが消える | false。profileHeaderがない分岐は可視h1を返す。既存unavailableテストも成功。 |
| B10 通知バーでリスト下端がずれる | medium。親shellを含めたflex高さへ修正。40px通知＋上下safeareaでbody844px、list下端760=nav上端760、windowY0を実測。 |
| E1 古い外部起動失敗で誤エラー | medium。操作IDで後から返る古い結果を無視し、閉じる際にも失効。順序逆転テスト追加。 |
| V1 pointercancel復帰テスト不足 | medium。up/cancel/lostcaptureを同じ実値検証でカバー。 |
| V2 URL起動失敗表示の検証不足 | medium。URL保持とエラー文のテスト追加。 |
| V3 超過+1描画の検証不足 | medium。最小ウィジェットで+1の存在とセル内boundsを明示検証。 |

## Verification

関連Vitest、全体テスト、型検査、src/packages lint、Web/AndroidビルドとAndroid単体・可能なエミュレータ描画。実ブラウザでレイアウトとピンチ関連表示を確認。実会議には参加しない。

実測結果と制限は `docs/fixes2-20260919.md`、ログは作業場の `作業記録/20260919_calendar-validation/defects2-*.log`。
