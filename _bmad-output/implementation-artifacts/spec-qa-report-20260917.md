---
title: 'QAレポート20260917の不具合修正'
type: bugfix
created: '2026-09-17'
status: completed
route: dispatch
baseline_commit: '621ae93e8ad83abc3402b1cd7a7ff3fdd3e83866'
context: []
---
<frozen-after-approval>
## Intent
ユーザー指定のdocs/qa-report-20260917.mdの指摘1〜17を現行コードで検証し、実際の不具合を修正する。修正済み・未再現・ブラウザ標準動作を区別して証拠を残す。
## Boundaries & Constraints
既存の個人予定・プロフィール・外部アカウントやQA残置データを削除しない。Google同期専用書込経路は維持し、ユーザーの直接作成先から外部カレンダーを除外。入力途中の状態を参照更新で消さない。秘密予定の除外と4〜8英数字規則を維持。月金額・横スライド・6言語を維持する。OS環境のACL変更や旧アプリ削除は行わず、既存の外部ステージ方式でビルドする。
</frozen-after-approval>
## Code Map
- src/features/events/、data/events.ts、platform/reminders.ts: 外部calendar書込防止、通知選択と保存、予定フォーム保持。
- src/features/calendars/ui/CalendarFormSheet.tsx: open/editing/usedColors参照更新が入力を消す問題。
- src/features/profile/ui/、shifts/ui/ShiftTemplateFormSheet.tsx、settings/ui/: 入力とフィードバック。
- src/platform/layerBack.ts: Android以外の履歴レイヤーを追加。
- src/features/calendar/ui/MonthView.tsx、CalendarScreen.tsx、ListView.tsx: ダブルタップと一覧初期位置。
- src/data/secret*、app/SecretMode*、events/model/useEvents.ts、MonthShiftTiles.tsx: 上限・機密・削除競合。
## Tasks & Acceptance
- [x] QA各指摘を現行コードとテストで検証し処置を記録。
- [x] 実在する不具合を所有範囲を分けて修正。
- [x] 関連回帰、型検査、アプリlint、Androidビルド、実機で非破壊操作確認。
Given 外部カレンダー, when ユーザーが直接予定を保存, then 拒否して理由が見える。
Given フォーム入力中, when データ参照が再取得で変化, then 同じ編集対象なら入力が保持される。
Given Web月の週一覧, when ブラウザで戻る, then 月へ戻りホームへ離脱しない。
Given 月の日付, when ダブルタップ, then 日の時間軸へ移る。
## Implementation Notes
ユーザーの費用方針に従い定型修正を3つのlunaサブエージェントへ分担。メインが履歴・ジェスチャー・統合検証を担当。レポート全体の修正依頼に基づき継続して実装、無関係な未追跡資料は維持。

## 検証結果
全110ファイル908テスト、型検査、src/packages lint、Web/Androidビルド成功。実機1.0.10への更新・起動成功。詳細はdocs/qa-fixes-20260917.md。実機で17日タップ→週一覧、Android戻る→月、ダブルタップ→日表示を確認済み。
