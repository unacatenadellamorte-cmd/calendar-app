// 旧entry。目的: 既存の運用コマンド(node scripts/qa/device-photos/ui-smoke.mjs)を壊さないための薄い委譲だけを残す。
// 検証の正本は audit-ui.mjs。旧版の固定タイムゾーン(23:59 期待)は使わず、端末ローカルの暦日で
// 下端スクロールによる続き取得・日付往復・権利なし・OFF後の画像解放を確認する。
await import('./audit-ui.mjs');
