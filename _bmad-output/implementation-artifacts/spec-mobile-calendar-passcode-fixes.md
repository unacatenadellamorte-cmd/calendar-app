---
title: '実機フィードバック: 月カレンダー操作とパスコード保存'
type: 'bugfix'
created: '2026-09-17'
status: 'in-review'
route: 'dispatch'
baseline_commit: '62204a1e71e62057a36960aa7dd17e41aac16fc9'
context: []
---

<frozen-after-approval reason="ユーザーの修正指示">

## Intent

タブを年・月・日・リストの順にし、カレンダーを開いたときは月表示にする。月の下に登録シフトを四角いタイルとして配置し、タップで選択日の予定に登録する。日付タップは選択、長押しは従来の週1行＋予定入力パネル。パスコード保存失敗を直し半角英数字を許可する。

## Boundaries & Constraints

ユーザーの予定や既存パスコードをテストのために書き換えない。既存の数字パスコードも有効。長さは従来の4〜8文字を維持し英字の大小を区別。DBのRLSは維持し更新を本人のプロフィールIDで絞る。

## I/O & Edge-Case Matrix

| 操作 | 期待 |
|---|---|
| 再びカレンダーを開く | 保存済みビューにかかわらず月 |
| 日付タップ | カーソルだけ移動 |
| 500ms長押し | 週1行と当日の予定入力パネル |
| 指移動・キャンセル | 長押しを起動しない |
| シフトタイル | 選択日だけ作成し月表示へ反映 |
| 保存中に連打 | 追加要求を重複発行しない |
| シフト登録失敗 | エラー表示し再試行可能 |
| パスコード保存 | 本人IDのWHERE条件付きで更新 |
| 半角英数字4〜8文字 | 登録可能。空白・全角・記号は拒否 |

</frozen-after-approval>

## Code Map

- `src/features/calendar/ui/CalendarScreen.tsx`、`MonthView.tsx`、`ViewSwitcher.tsx`: 選択・長押し・タブ順。
- `src/features/calendar/ui/MonthShiftTiles.tsx`: `createShifts`と`useEvents.addLocal`を再利用。
- `src/features/calendar/model/useCalendarView.ts`: 再入場時の既定表示。
- `src/data/profiles.ts`、`src/features/profile/model/useProfile.ts`: ID指定の更新。
- `src/lib/passcode.ts`、設定画面・クイック解除: 英数字対応。

## Tasks & Acceptance

- [x] タブ順と初期表示を修正。
- [x] 選択日ハイライト、シフトタイル、長押し操作を実装。
- [x] 実機のプロフィール更新エラーを特定し修正。
- [x] パスコードを半角英数字対応。
- [x] Web回帰テスト、型検査、lint、ビルド。
- [x] Android更新APKを検証して実機へ反映。

## Implementation Notes

実機通信でHTTP400、code 21000、message「UPDATE requires a WHERE clause」を確認。入力や認証情報は記録していない。更新にeq('id', profileId)を追加。パスコード値を勝手に変更する検証はしない。

## Review Triage Log

メインセッションで確認。独立サブエージェントレビューは未実施。スワイプ・長押し後クリックの誤発火、連打、保存失敗、選択日の取り違えを回帰テストに追加。DB変更なし。

## Verification

型検査・lint成功。100ファイル828テスト成功。変更した英数字フォームのテストも再実行。Webビルド成功（既存の大きなチャンク警告あり）。Androidと実機検証は後続結果を追記。

### Android・実機検証

Androidのユニットテスト、lintDebug、assembleDebug成功。APK署名検証成功。実機へデータを保持したまま上書きインストールし、起動成功。versionCode 2 / versionName 1.0.1。
実機DOMで「年・月・日・リスト」の順と月の初期選択、登録シフト領域と3個のタイル表示を確認。更新版のJSファイル名とも一致。本人のパスコード登録結果はユーザー確認待ち。長押し・作成失敗・連打抑止は自動テストで確認済み。本人の予定を自動テスト用には作成していない。

### 追加修正：シフト操作（1.0.2）

ユーザーの追加指示により、シフトタイルを小さくして横最大5列へ変更。上部に小さな前日・翌日・削除ボタンを追加した。削除は選択日に表示対象となるローカルのシフト予定のみを対象とし、1件なら直接削除、複数なら選択ウィンドウを表示する。既存の削除処理・通知取消・取り消し操作を再利用。

関連72テスト、型検査、lint、Webビルド、Android assembleDebugとAPK署名検証に成功。実機へデータ保持で1.0.2（versionCode 3）を上書きし、5列・横はみ出しなし・翌日移動と元の日への復帰を確認。実データの削除は行わず、複数選択と通常予定の除外は自動テストで検証。独立したサブエージェントレビューは未実施。

前回のパスコード登録はユーザーから「OK」と成功確認を受領。
