---
status: done
baseline_commit: 1577410f1313b5719ab995223a00aab0b52bc52b
context: []
---
# シフト・予定の終日入力

## Intent
Android・iOS共通画面で、時刻のない休み・休日を終日として入力・保存・表示できるようにする。ユーザーは終日シフトを給料計算へ含めないと指定済み。通常予定、予定タグ、お気に入りシフトで「終日」を選択できるようにする。iOSの既存月カレンダー型・予定一覧型ウィジェットは維持する。

## Constraints
作業場所は C:\Users\Ryo\AppData\Local\calendar-app\all-day-input-20260930。コメント・説明は日本語。既存の入力色、翌日カーソル移動、画面横幅対応を維持する。実ユーザーデータ削除、外部への公開、DB実行、アプリ導入、コミットは実装担当では実行しない。既存データを削除・書き換えない加算的なマイグレーションのみ作成する。仕様から必要性を導ける局所的な調整は実装時に決めてよい。

## Code Map
- src/data/shift-templates.ts: ShiftTemplate型、create/update/list、明示COLUMNSとsnake/camel変換。現在時刻と給料必須。allDayを保存・復元する。
- src/data/event-tags.ts: EventTag型とCRUD、同じくallDayを保存・復元する。
- supabase/migrations/: 20260930000000_template_all_day.sqlを新設。shift_templates,event_tagsへall_day boolean NOT NULL DEFAULT falseのみ追加。既存start/end等の列は残す。時間の非表示時もDB制約を満たす有効値を保持または09:00/18:00へ正規化する。
- src/data/shifts.ts:createShiftsで終日ならall_day=true,event_date=選択日,starts_at/ends_at=null、給料/休憩は0。template ID,色,勤務先,sourceは維持。通常シフトと日またぎは現状維持。
- src/lib/event-tag.ts:applyEventTagでタグallDayを複写、日付維持。時刻タグは従来通り翌日対応。
- src/features/shifts/ui/ShiftTemplateFormSheet.tsx:名前直後に終日チェック。終日時は時間/休憩/時給の入力を非表示にし、給料計算対象外と説明。切り替え途中の時刻を保持。保存時は非表示の不正値が保存を妨げないよう正規化。
- src/features/shifts/ui/ShiftTemplateChip.tsx、src/features/calendar/ui/MonthShiftTiles.tsx（実パスは検索）:終日テンプレートは時間帯の代わりに「終日」を表示。
- src/features/tags/ui/EventTagFormSheet.tsx:名前直後の終日チェック、時刻と翌日説明を非表示。EventTagsScreenにも終日ラベル。
- src/features/events/ui/EventFormSheet.tsx:既存終日チェックと日付/時刻入力をタイトル直後へ移して見つけやすくする。タグ選択肢に終日表示。終日切替で選択していた日付を保持する（既存の編集予定で今日に戻らない、終日の日付を変更後に時刻付きへ戻してもその日付になる）。夜勤の開始/終了日差も壊さない。既存イベント保存仕様に合わせる。
- src/features/pay/model/usePayEstimate.ts:calculateMonthlyPayは既にallDayを除外している。回帰テストで金額と件数が増えないことを確認。
- src/i18n/:新しい説明文は既存方式に従い6言語へ翻訳。既存「終日」は再利用。
- 関連 *.test.ts(x):既存テストを活かしデータ往復、UI作成/編集/切替、支給対象外、日付境界、通常時刻維持を検証。

## Tasks & Acceptance
- [x] DB列追加とallDayのCRUD保存/取得。Given既存のテンプレート When移行 Then allDay=falseで現状維持。Given終日を保存 When再取得・編集 Then終日のまま。
- [x] 予定・タグ・シフトUI。Given作成/編集画面 When終日を選択 Then不要な時刻入力を隠して保存できる。Given入力途中で切替 When時刻付きへ戻す Then入力した時刻を維持する。
- [x] シフト生成。Given終日テンプレート When月末をまたいで複数日へ登録 Then各選択日に終日予定を生成し色とtemplate IDを維持、翌日以降へ時間が漏れない。
- [x] 給料。Given通常勤務と終日シフト When集計 Then終日分は金額・勤務件数とも加算しない。通常夜勤の金額は現状維持。
- [x] タグ適用と日付。Given終日タグ When予定へ適用 Then選択日を維持して終日保存。Given別の日の予定を編集 When終日へ切替 Then今日へ戻らない。Given終日の日付を変更 When通常へ戻す Then選んだ日を維持。
- [x] 必要な回帰テスト、typecheck、lintを実行して結果報告。ビルド・公開・DB適用は主担当が実施。

## Implementation Notes
ユーザー承認済み: 終日は休み・休日等として給料計算に含めない。ShiftTemplate/EventTagのallDay型は取得結果でboolean必須を推奨。既存テストfixtureはfalseを追加し、入力API互換が必要なら入力のみ省略=false扱いでよい。

## Verification
- 実装後の全体検証: 133ファイル・1173テスト成功。レビュー後の年4桁補完と追加テスト: 対象3ファイル66テスト成功。型検査成功、lintはエラー0、既存警告1件。
- DB: db push --dry-runで今回の2列追加だけと確認して適用。migration listで20260930000000のローカル/リモート一致を確認。Docker不在でローカルカタログのキャッシュ警告が出たが、リモート適用は成功。
- テスト用匿名プロフィールで終日シフト・予定タグを新規保存し、再読込後の復元を確認。月画面から終日シフトを作成し、終日表示・日付・色・給料0を確認。予定タグの適用でも終日・タイトル・色を確認。
- 320px幅の予定入力で横あふれなし。ブラウザの日付入力は自動fillがDOM値だけを変えるため、実キー操作で日付を変更し、時間指定へ戻して変更日を保つことを確認（未保存で閉じた）。
- 既存ウィジェット用共通ペイロードの終日テスト、およびSwiftの終日モデルテストが存在し、今回ネイティブ側の変更はなし。iPhoneのウィジェット追加・表示の実機確認は未実施。

## Review Triage Log
| 指摘 | 判定 | 根拠と対応 |
| --- | --- | --- |
| B1: 名前だけの更新が時刻を上書き | false | 現在の実利用の更新呼出しは両フォームとも全入力値を渡しており、従前から時刻を送信する。追加された正規化による新たなユーザー側の競合経路はない。 |
| B2: undefinedの部分更新で時刻が初期化 | false | 実際のフォームとモデルの呼出しは有効な時刻文字列を送信し、undefinedを送る呼出しはない。到達しない入力のため追加の分岐は設けない。 |
| B3: DB未適用環境で取得不可 | false | 現行環境へDB列を先に適用してから配布物を作成。配布前提を本記録へ記載。未適用の別環境で新クライアントを先行配布しない。 |
| B4: 実DB保存未確認 | false | 主担当が実DBへ適用し、テストプロフィールでシフト/タグ保存・再取得・終日予定作成を画面確認済み。既存行はdefault falseで時刻・給料列は変更しないDDL。 |
| B5: 夏時間専用テストなし | low | 暦日差はUTC日付で算出し、移動先はローカル正午のsetDateを使う。年末・うるう日の回帰は確認済み。夏時間地域の専用実機検証は未実施で、その確認まで済んだとは記載しない。追加の環境切替テスト基盤は今回設けない。 |
| B6: 保存済み終日→時間指定のテスト不足 | medium / patch | 過去・未来・0099年の保存済み予定から09:00〜10:00へ戻して送信する3ケース追加、成功。 |
| B7: 終日生成のキャッシュ検証不足 | low / patch | 既存ケースへ2件のキャッシュの日付・終日・null時刻の確認を追加、成功。 |
| B8: エクスポートで終日フラグが落ちる未検証 | false | exportは取得したタグとテンプレートのオブジェクトをそのまま複写・並替えし、属性を射影/除去しない。インポート機能は存在しない。今回変換ロジックを追加していないため同型の追加テストは不要。 |
| B9: iOSウィジェットの終日対応未検証 | false | 共通widget.test.tsはnull時刻と日付の終日ペイロードを確認し、Swiftにも終日表示とグリッド範囲の既存テストがある。今回の変更は同じ形のEventItemを生成する。実機未確認は明記。 |
| B10: 受入項目・結果未記録 | false | レビュー開始時点の作業中記録であり、完了時に主担当が更新する項目。今回の検証結果を追記した。 |
| E1: 0001〜0999年の終了日が非4桁 | low / patch | 終日→時間指定の終了日だけ4桁補完し、0099年の回帰テストを追加。 |
| V1: 時刻付きシフト→終日更新の検証不足 | medium / patch | 実際のupdate payloadを保持する模擬サーバーで更新・一覧再取得を確認し、trueと時刻維持、休憩/時給0を検証した。 |
## Build Artifacts
生成先: `%LOCALAPPDATA%\calendar-app\all-day-input-20260930-artifacts`
- Android 1.0.20 (21): 署名済みAAB/APK生成成功、Android単体テスト39件成功、lintReleaseエラー0/既存警告43。AABのSHA256は`fb359d8b1ea737918a84be484268f3f0f9d18560c479832526430dd98f3a085f`。
- iOS: `multi-calendar-ios-all-day.ipa`、SHA256 `6f20666890825af9233c96d047708a837f6237886f7d395bfd03aa7767ddd0a0`。Webビルド成功・Supabase設定検証済み。元archiveのネイティブ/ウィジェットを保持した未署名実機確認用。ネイティブ版番号1.0.19 (20)、テスト広告。
- 両プラットフォームの最終パッケージに終日コードと接続先が含まれ、ZIP整合性検査成功。APK署名・バージョン確認成功。Play配布・App Store提出・実機へのインストールは未実施。
- ユーザーより先の画面左右修正は直ったとの実機確認を受領。