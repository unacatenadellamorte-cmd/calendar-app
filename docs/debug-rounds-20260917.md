# デバッグラウンド記録（2026-09-17）

対象リビジョン: `d0975d75a921ade557468ca971180f9f4968b02e`（1.0.10）

## ラウンド1: 通知・外部カレンダー書込・フォーム保持

対象: 通知、リマインダー、通知ディープリンク、予定データ書込、予定フォーム。

実行コマンド:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
$env:VITE_SUPABASE_ANON_KEY='local-test-placeholder'
npx vitest run src/data/events.test.ts src/data/reminders.test.ts src/platform/reminders.test.ts src/platform/deepLink.test.ts src/features/events/ui/EventFormSheet.test.tsx
```

結果: 5ファイル、71テストが通過。再現した不具合なし、修正なし。

## ラウンド2: `useEvents` / `useCalendars` 非同期競合

対象: 初期取得、`syncNonce` による再取得、楽観更新と遅延レスポンスの競合、ロールバック。

実行コマンド:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
$env:VITE_SUPABASE_ANON_KEY='local-test-placeholder'
npx vitest run src/features/events/model/useEvents.test.ts src/features/calendars/model/useCalendars.test.ts
```

結果: 2ファイル、41テストが通過。競合を再現した不具合なし、修正なし。`useEvents.test.ts` 実行時に既存のReact `act`警告が出たが、原因は未調査。

## ラウンド3: `layerBack`・MonthViewダブルタップ・ListView

対象: Web/Androidの戻る処理、レイヤー解除、月表示セルのタップ・ダブルタップ、一覧表示とスクロール。

実行コマンド:

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54321'
$env:VITE_SUPABASE_ANON_KEY='local-test-placeholder'
npx vitest run src/features/calendar/ui/MonthView.test.tsx src/features/calendar/ui/ListView.test.tsx src/platform/layerBack.test.ts src/platform/layerBack.browser.test.tsx src/ui/BottomSheet.test.tsx
```

結果: 5ファイル、36テストが通過。再現した不具合なし、修正なし。

## 未検証範囲

- 全体テスト、型チェック、lint、production build はこの3ラウンドでは実行していない。
- 実機の通知、Android戻る操作、外部カレンダー実サービス接続は未検証。
- 追加テスト、コード変更、コミット、push、リリースは実施していない。
