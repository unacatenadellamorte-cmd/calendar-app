---
title: '予定タグと自作予定の色付きラベル'
type: 'feature'
created: '2026-09-25'
status: 'done'
baseline_commit: 'e6181b1e9a6375b1cd5b2d7472051067e03231a1'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="利用者が指定し、タグの挙動を確認済み">

## Intent
アプリで作った予定を、参考画像の色付き背景ラベルとしてアプリとウィジェットへ表示する。外部取込の予定は今の表示を維持する。
設定で予定名称・ラベル色・開始／終了時刻を持つタグを登録し、予定フォームでプルダウン選択する。選択後は予定ごとに編集可能。利用者の確認どおり、タグの変更・削除は登録済み予定へ波及させない。

## Boundaries & Constraints
自作の判定はイベントの source。タグ未使用・既存の自作予定はカレンダー色で塗る。予定順、秘密予定除外、全月表示、日単位表示、月週日の切替速度を維持する。外部カレンダーへの書込は禁止。既存データの破壊的変更をしない。

## I/O & Edge-Case Matrix
|状況|入力|結果|エラー|
|---|---|---|---|
|タグ選択|名称・色・時間|選択中の日付で値を複写|未選択なら通常入力|
|夜間|終了が開始より前|翌日終了|開始終了同時刻は拒否|
|終日から選択|日付＋タグ|対象日に時刻付きで適用|日付を保持|
|タグ編集・削除|使用済みタグ|既存予定は不変|保存失敗を表示|
|外部取込|Google/端末予定|今のラベルを維持|独自色を適用しない|
|オフライン|自作予定の保存|ラベル色もキューで保持|タグ管理は既存シフトと同じオンライン方式|

</frozen-after-approval>

## Code Map
- `src/data/events.ts`・`offline-write.ts`・`features/events/model/useEvents.ts`: イベントCRUDと複写するラベル色。
- `src/data/shift-templates.ts`: Result形式・ユーザー別RLSのテンプレCRUD例。
- `src/features/events/ui/EventFormSheet.tsx`: 日付を守ってタグを適用。
- `src/features/calendar/ui/EventChip.tsx`・`events/ui/EventListItem.tsx`: アプリの共通表示。
- `src/platform/widget.ts`: Androidへsource由来の塗り分けとラベル色を渡す。
- `android/app/src/main/java/jp/ryo/multicalendar/widget/WidgetCalendarCells.kt`・`DayAgendaWidget.kt`: 色付きラベル。月は予定あたり1Textを守り500View上限を回避。

## Tasks & Acceptance
- [x] `supabase/migrations/20260925000000_event_tags.sql`、`src/data/event-tags.ts`、`src/features/tags/**`: タグCRUD・設定導線。
- [x] `src/data/events.ts`、`offline-write.ts`、`useEvents.ts`、`EventFormSheet.tsx`: nullableなlabelColorの永続化とタグ選択。
- [x] `src/lib/event-label.ts`、アプリ共通表示、`src/platform/widget.ts`、Android共通表示: 自作だけ背景色を適用。
- [x] 関連テスト: 日またぎ、値複写、タグ編集後不変、外部不変、オフライン、ウィジェット密度と切替。
- [x] Web/Androidビルド・実表示・追加スキーマ適用・端末更新。

受入基準: タグ登録済みの状態で予定追加画面を開き選ぶと、名称・色・時刻が入り、保存して再読込しても色を維持する。外部予定と同居していても、自作だけ参考画像の塗りラベルになる。

## Implementation Notes
- 追加スキーマを実DBへ適用済み。dry-runでは今回の1ファイルのみ、適用成功。Docker未導入によるカタログキャッシュ警告のみ（移行失敗ではない）。
- ブラウザの独立した検証用ゲストでタグ登録・夜間時刻編集・再読込、予定への値複写・保存・再読込を確認。
- 自作のみラベル色を複写しnullable列へ保存。既存自作はカレンダー色、外部は従来の表示を維持。タグはオンライン管理。JSON書出しにもタグを含めschemaVersion=3。
- ウィジェットは画像背景を使うとGlance内部の部品が増えるため、単色背景+cornerRadiusを使用。31日分でも最大4件の表示を維持。角丸はAndroid12以降で有効、旧OSは同じ背景色の四角形。
- レビュー後の新旧背景検証を含むAndroid実描画5件が109.692秒で成功。放置後の月864ms・週674ms・日744ms。ログ: C:/Temp/calendar-tags-render-final.log。
承認済みの機能追加として継続。追加列・新テーブルのみの移行。元のリビジョン: e6181b1e9a6375b1cd5b2d7472051067e03231a1。

## Spec Change Log

## Review Triage Log

|指摘|判定と根拠・対応|
|---|---|
|B1 タグ操作文言の訳不足|medium。フォーム側の追加キーも全5言語へ追加。|
|B2 エラー文が翻訳を通らない|medium。タグ画面・フォームのerrorTextをt経由に変更。|
|B3 中間明度のコントラスト|medium。白・濃紺とも4.5未満なら黒を使用。JSとKotlinを統一。|
|B4 ユーザー切替時の古いタグ|medium。session.user.idで管理画面内部を再生成。|
|B5 認証待ちでも作成可能|false。AppShellがloading時にOutletを表示しない。画面側の!enabledガードも追加。|
|B6 一覧失敗と未登録の混同|medium。取得エラーを独立させて再試行を追加。|
|B7 一覧取得前の作成で一部しか表示しない|medium。取得成功前は作成を無効にする。|
|B8 送信中の入力消失|medium。送信中はタグ入力とシートの閉じ操作を無効にする。|
|B9 時刻空欄の案内が不適切|low。空欄にも対応した文言へ直接修正。|
|B10 作成モックが配列|medium。single結果を単一行へ修正し保存・戻値を確認。|
|E1 タグ操作文言の訳不足|medium。B1と同じ不足。全辞書を検証。|
|E2 エラーのt未適用|medium。B2と同じ経路を修正。|
|E3 4桁未満の終了年|low。年月日の年をゼロ埋めし0099年→0100年テストを追加。|
|E4 色なし外部予定の既定色変更|medium。Android payloadの外部色フォールバックを従来の#7A7A7Aに維持。|
|V1 タグ更新失敗経路の検証不足|medium。実hookを通る管理画面テストで一覧復元と入力保持を検証。|
|V2 既存予定の色変更・解除の検証不足|medium。useEventsの保存・再取得を通るテストを追加。|
|V3 一覧・ホームの色検証不足|medium。EventListItemの自作指定色・既定色・Google・端末の描画を検証。|
|V4 全自作の実描画検査が失敗|high。画像背景が内部でViewを増加し500View上限に到達。単色background+appwidget.cornerRadiusへ変更し、全自作の月末・切替まで実描画で成功。|

## Verification
関連Vitest、型検査、ビルド、Android単体・実描画テスト。実DBでタグと色の保存を確認。実ブラウザと端末で表示を確認。

### 最終確認（2026-09-26）
- Vitest: 124ファイル・1,023件成功。型検査・変更範囲のlint・Webビルド成功。
- Android: 単体35件、実描画・操作5件成功。全自作で予定が多い月も月末まで描画。
- 確認用ゲストの実ブラウザでタグ登録、夜間予定への適用、保存後の再読込を確認。タグを別名・緑色・別時刻へ変更後も、既存予定は元の名称・黄色・22時開始を維持。
- 追加スキーマ適用済み。最新版APKを接続端末へ上書き導入し、設定の予定タグと作成画面を確認。利用者の予定には検証用データを追加していない。
- 画像: 共通の出力画像/20260926_calendar-tag-settings.png（実機）、20260926_widget-label-month.png・week.png・day.png（エミュレーターの検証用予定）。
- ソース変更は今回の機能と検証・仕様書だけをローカルコミット。公開・pushは行わない。
