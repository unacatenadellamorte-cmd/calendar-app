---
title: '選択日に撮影した端末写真の一覧'
type: 'feature'
created: '2026-10-20'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '8f7e2840cfa0fbb51fcbbfe7e071f49727c55933'
branch: 'feature/device-photos-by-day-20261020'
---

<frozen-after-approval reason="本人の承認後は意図を固定する">

## Intent

**Problem:** 過去の予定と同じ日に撮った端末の写真を、カレンダー内で振り返れない。

**Approach:** OSが許可したライブラリの画像を日付で読み取り、選択日の一覧に表示する。写真を複製・蓄積せず、審査中30と分離した追加機能版にする。

**本人の決定:** 両OSを実装し、Androidの広い写真権限の申告・承認は配布前の別ゲートにする。作成・撮影日時でスクショ・保存画像も分類し、日時不明は除外（追加日・更新日で代用しない）。一覧でクラウド取得せず、個別に開く時だけOS経由で取得を許す。OSが提供できない画像は案内する。

## Boundaries & Constraints

**Always:** 読み取り専用。操作時だけ権限を要求し、一部許可・拒否・撤回を区別。現在の端末時間帯の当日開始以上・翌日開始未満を比較し、固定24時間を足さない。動画・位置情報・削除済み・OSの非表示画像は取得しない。

**表示設定:** 設定に「カレンダーに端末の写真を表示」のスイッチを追加。既定OFF、端末内に真偽値のみ保存。OFFでは権限要求・一覧取得・画像読込を行わず、実行中の要求・画像・拡大表示を即解放。ONでも写真欄を開くまで権限要求しない。OS権限の撤回とは別の機能と説明する。

**Never:** 写真・識別子・日時をアプリのサーバー、広告、ログ、JSONへ渡さない。原本変更・DB移行・有料化・ストア設定・版番号変更・配布なし。AGENTS.mdは保持・コミット除外。

## I/O & Edge-Case Matrix

| 状態 | 動作 | 回復 |
|---|---|---|
| 全部／一部許可 | 許可範囲だけ日付順に表示 | 一部許可を明記、選び直せる |
| 未要求／拒否 | 写真を読まない | 任意の許可操作／設定案内 |
| 0件／読取失敗 | 空一覧とエラーを区別、予定は操作可能 | 再試行 |
| 日付変更／画面退出／権限撤回 | 古い応答を捨て、画像と要求を解放 | 現在の権限で再取得 |
| 大量画像 | 分割取得、表示範囲だけ縮小画像を読む | 全件へ順次到達可能 |
| Web | 写真機能は非対応 | 写真権限を要求しない |

</frozen-after-approval>

## Code Map

- `src/features/calendar/ui/CalendarScreen.tsx`：日付選択を再利用。
- `src/features/calendar/ui/DayEventPanel.tsx`：選択日の予定一覧。写真はその下、初期状態は折りたたみ。月セル・年・リストへ画像を並べない。
- `src/features/settings/model/useShiftAutoAdvance.ts`：共有設定・保存失敗時の慣習。

## Tasks & Acceptance

**Execution:**
- [x] `src/platform/devicePhotos.ts`と対応テスト：権限、日付範囲、分割一覧、縮小表示、取消・解放の境界を作る。
- [x] `ios/App/App/DevicePhotosPlugin.swift`、`Info.plist`、`GoogleAuthorizationPlugin.swift`、`ios/App/App.xcodeproj/project.pbxproj`：PhotoKitを登録し用途説明を更新。
- [x] `android/app/src/main/java/jp/ryo/multicalendar/{DevicePhotosPlugin,MainActivity}.java`、`android/app/src/main/AndroidManifest.xml`と試験：MediaStore・OS別権限。実機保護規則を守る。
- [x] `src/features/calendar/model/useDayPhotos.ts`、`ui/DayPhotoSection.tsx`、`CalendarScreen.tsx`と試験：一覧・拡大・権限案内・中断・再取得。既存レイヤーとの多重表示を防ぐ。
- [x] `src/features/settings/model/useDevicePhotosEnabled.ts`、`ui/SettingsScreen.tsx`と試験：共有スイッチ・永続化・即時停止。保存不可はセッション内保持。
- [x] `src/i18n/{source-keys,en,zh,ko,es,fr}.json`：文言。`docs/device-photos-by-day-20261020.md`：検証記録。

**Acceptance Criteria:**
- Given 許可済み、when 日付を選び写真欄を開く、then 当日の許可画像へ順次到達でき、他日の写真は混入しない。
- Given 拒否・一部許可・撤回、when 再表示、then 権限外画像を表示せず、予定は引き続き操作できる。
- Given 多数の日付と画像、when 閲覧・退出を繰り返す、then 下記上限を超えて蓄積せず、古い要求は表示を上書きしない。
- Given 表示ON、when OFFにして再起動、then OFFを保持し写真読込が再開しない。初期OFFも写真APIを呼ばない。

## Design Notes

独自の画像ディスク保存0。縮小画像キャッシュ16MiB以下、要求長辺256px以下、同時生成2件以下。40件ずつ取得・仮想化。拡大は1枚・長辺1600px以下で原寸を復号しない。退出・背面・利用者変更で解放。OS側キャッシュとアプリ全体のメモリ上限は別。

## Verification

`npm test`、`npm run typecheck`、`npm run lint`、Web・iOS用ビルド。日付境界・夏時間・欠損日時・競合・上限・権限撤回を先に試験。対象OSのビルドと架空画像多数の端末で容量・復帰・限定許可を確認。Mac未検証は明記する。

## Implementation Notes

- 2026-10-20、本人が仕様全体を承認して実装続行を指示。固定部分は変更しない。新規作成はClaude、統合・修正・最終検証はCodex。作業は逐次実行し、コミット・送信・配布・バックグラウンド実行は作成担当へ委ねない。
- TDDの承認済み公開境界は、設定UIと公開設定フック、月の日付選択／日ビューの写真UI、写真プラットフォームAPI。OSだけを模擬し、実フック・設定・画面を組み合わせて検査する。外部OSとメモリ制限を内部実装モックで代用しない。新規試験を1つ失敗させて最小実装し、次へ進む。
- 写真スコープ外のコード・AGENTS.md・固定部分・本番設定は変更しない。ファイル編集にはapply_patchを使用する。依存追加はせず、既存Capacitorからローカルのネイティブプラグインを使う。画像の一時保存も行わず、OS→表示用縮小データのみをメモリに渡す。
- 元の背景保存経路は流用禁止。単一画像の表示は既存BottomSheetとlayerBackを再利用する。型・翻訳辞書と実OSのネイティブ権限・取消・サイズ制限を最後まで接続し、スタブだけの完了報告はしない。実機・Mac未確認は未確認と報告する。
- 初回出力の試験一括追加と期待値の同型演算をCodexが修正。東京の既知UTC境界1件から開始する。試験1件→失敗→最小実装→成功を繰り返す。ファイルの作成・更新はapply_patchだけを使用し、Write/Edit/リダイレクト/スクリプト書込は使用しない。
- 低コスト作成担当が編集方式と逐次TDDの指示を守れなかったため停止。生成済みdevicePhotos.tsは未検証の初稿で、型とAPI形だけ参考にし、実装の正解とは扱わない。作成担当を切替え、Codexが引き続き統合・最終検証する。画像キャッシュの実バイト、古い要求のOS側取消、一部権限の再確認は特に検証する。
- 今回の作成環境ではapply_patchがPATHにないが、Bashから `/c/Users/Ryo/AppData/Local/OpenAI/Codex/bin/e78bad9887fa50cf/codex.exe --codex-run-as-apply-patch "$patch"` で同じ編集機能を使えることを空パッチで確認済み。patch変数はヒアドキュメントをコマンド置換で受け取り、ファイルへリダイレクトしない。東京境界の試験1件はCodexが成功確認済み。
- 進捗確認時、前景の作成処理は終了していた。Codexがplatform10件・設定フック5件の計15件を再実行し成功確認。画面・iOS/Androidネイティブはまだ未実装。既存の通った試験は保持し、残りの画面とOS側を続行する。現コードの完了・実機成功とは扱わない。
- アプリ更新により上記e78bad9887fa50cfの実行体は削除済み。再開時に空パッチで再確認した現在の編集呼出し先は `/c/Users/Ryo/AppData/Local/OpenAI/Codex/bin/896a0166b774037a/codex.exe --codex-run-as-apply-patch "$patch"`。新旧の手順を混同せず、こちらを使う。
## Spec Change Log

- 2026-10-20、本人が「実装を保持して局所修正する」と回答。B1/E4・B5に対して全面差戻しは行わず、既存試験とコードをKEEPして取消の設計だけ補う。縮小画像APIはAbortSignalで待機・実行中の1件を中止でき、要求ごとの一時識別子で別の同一画像要求を取り消さない。cancelLoadsは一覧検索も失効させ、AndroidはCancellationSignalと待機処理取消、iOSは検索前・列挙中・返却前の失効確認と呼出し完了を接続する。OSが強制中断APIを提供しない同期処理は最善努力と明記する。固定部分・審査版・送信配布なしは維持。

- 2026-10-20の最新指示でローカル検証までと確定。送信・配布なしの固定意図を維持する。実装タスクのチェックはコード作成とローカル試験の完了を示し、未実施のiOSコンパイル・実機試験や残る端末実測まで成功とするものではない。

## Review Triage Log

2026-10-20、3担当全員の最終結果を受信してから19指摘を個別判定。重複は判定後に整理する。

| ID | 判定 | 経路 | 照合した根拠 |
|---|---|---|---|
| B1 | medium | bad_spec | PhotoTile解除は結果を無視するだけで、APIの待機列から縮小要求を除かない。大量写真の高速スクロールで可視画像と拡大が待たされる。非固定の設計に画像単位の取消契約が不足。 |
| B2 | medium | patch | Androidのnull Cursorがwhileを通らず空配列で成功する。既存の取得失敗と0件の区別を破る。nullを拒否する直接修正が必要。 |
| B3 | medium | patch | API24〜27のEXIF分岐が3回転しか返さず、反転を含む4種の向きを再現しない。既存の向き変換にケースを補う。 |
| B4 | high | patch | iOSの縮小計算は例として4000×1を256へ縮めると短辺0。画像描画器へ0を渡す経路があり、下限1の直接修正が必要。実機で異常終了したという実測ではない。 |
| B5 | medium | bad_spec | cancelLoadsは画像要求だけを扱い、一覧のPHFetch／MediaStore検索には失効・取消が接続されていない。JSの古い応答抑止はあるが検索処理の終了ではない。非固定の取消設計を補う必要がある。 |
| B6 | low | reject | ページ間で外部処理が既取得画像を削除するとoffsetがずれて欠落し得る。ただし本人が写真アプリへ移る通常の変更は背面化・復帰の再取得で解消される。前面のまま外部ライブラリが同時変更される稀なケースに、検索結果の保持や新しいカーソル契約を追加する複雑化は今回は採用しない。再表示で読み直す制約を記録する。 |
| B7 | low | patch | loadingのUI分岐がなく、初回取得中は空欄になる。既存の読み込み文言と状態通知を直接追加する。 |
| B8 | medium | patch | seedのcpより前に検証用フォルダーを作らない。初回AVDで準備が失敗するため、専用AVD確認後にmkdirを追加する。 |
| B9 | low | patch | 時刻付き別名での追加を繰り返すと120件固定の試験が失敗する。重複投入を事前に拒否し、既存画像での再試験手順を記載する。 |
| B10 | low | patch | 文書の「一度拒否した後は設定」は、showRationale=trueならpromptを返す実装と実OS観測に不一致。再要求可能か否かを区別して訂正する。 |
| E1 | medium | patch | B2と同じnull Cursorの空成功経路を確認。 |
| E2 | medium | patch | B3と同じ旧OSのEXIF反転未処理を確認。 |
| E3 | high | patch | B4と同じ0寸法への切捨てを確認。PhotoKit自体の実機再現は未実施。 |
| E4 | medium | bad_spec | B1と同じ画面外へ出たタイルの待機要求取消漏れを確認。 |
| E5 | low | patch | Apiaの存在しない2011-12-30はDateが翌日に補正する。Gregorianの暦日検査だけでは防げないため、生成したローカル年月日との一致を直接検査する。 |
| G1 | medium | patch | 検証担当の実テスト・参照検索により、製品CalendarScreenからphotosSuspendedを渡す配線の回帰試験不足が確定。子UIのtrue直渡し試験だけでは配線を検査できない。 |
| G2 | medium | patch | 検証担当の検索により、続きページだけの失敗と同位置再試行の回帰試験不足が確定。初回ページの失敗試験では代用できない。 |
| G3 | medium | defer | iOSの通信禁止はSwift実行を含む試験がなく、JS試験は外部境界を模擬する。本人のローカル限定とMac環境なしのため、配布前のPhotoKit実行で確認する未検証ゲート。 |
| G4 | medium | patch | その他指摘のEXIF反転もB3／E2と同じ原因と確認。 |

グループ化後の仕様戻り対象はB1/E4とB5の2件。本人が現実装保持・局所修正を承認したため、その手順で対応した。固定部分は変更していない。

### 局所修正の結果

- B1/E4：タイル解除でAbortSignalを送信し、JSの待機列から除去、実行中は要求単位の一時IDでネイティブ取消。待機取消と高速スクロールの失敗→修正→成功を確認。
- B2/E1：null Cursorをunavailableで拒否。実プラグインの公開APIを使うJVM試験で、Long日時の受取と空一覧への誤変換防止を確認。
- B3/E2/G4：旧AndroidのEXIF全8方向を処理。Javaコンパイル成功。API24〜27の実画像での向き確認は配布前に残す。
- B4/E3：iOS縮小画像の短辺を1px以上に補正。Swiftの実行環境がないためネイティブ実行は未検証。
- B5：Androidは一覧検索を別実行枠へ移しCancellationSignalで中止し、呼出しを一度だけ完了。公開APIのJVM試験で検索中の即時取消を確認。iOSは検索前・列挙中・返却前の失効確認と即時取消応答を実装。PhotoKitの同期検索自体の強制中断は保証しない。
- B7：一覧の取得中に読み込み中の状態通知を表示。失敗試験→最小修正→成功。
- B8/B9：専用AVD確認後に準備フォルダーを作り、既存の架空画像があれば重複投入を拒否。構文検査成功。実行制限を回避しての再投入は行っていない。
- B10：Androidの再要求可能な拒否と、設定アプリを案内する拒否を文書で区別。
- E5：Apiaの消滅日を拒否し、深夜0時がない夏時間開始日でも終端を翌日0時に補正。既知UTC値との失敗→修正→成功を確認。
- G1：製品CalendarScreenの月／日表示×ローカル編集／Google詳細の4経路で写真を閉じる回帰試験を追加。実画面・写真フックを使用し、写真停止の配線を一時的に外すと4件失敗、復元後成功を確認。予定データ等は既存画面試験の境界設定を使用し、写真OSだけを模擬。
- G2：続き取得失敗時の既存写真保持・同じoffsetからの再試行・最後の写真への到達を公開UIで確認。既存処理は最初から通り、本体変更なし。
- B6は制約として維持、G3はdeferred-workへ記録。iOS実行・最新版のAVD再導入・本人実機・容量反復実測は完了扱いにしない。

### 最終ローカル検証

2026-10-20 23:28開始の全体試験は173ファイル・1704件成功。型検査成功、lintはエラー0・既存警告1。WebとiOS実機向けWebビルド成功。AndroidのJavaコンパイルとJVM9件成功。ローカルの実装・レビュー修正を完了としてstatusをdoneにしたが、上記の実OS未検証と配布前ゲートの完了・配布可能を意味しない。本人指定に従いGitHub送信・TestFlight・審査版変更は行わない。
