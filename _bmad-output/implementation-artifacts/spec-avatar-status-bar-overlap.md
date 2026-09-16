---
title: '上部アバターがステータスバーと重なる不具合の修正'
type: 'bugfix'
created: '2026-09-16'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Android実機/エミュレータで確認したところ、`AppShell.tsx`の上部アバター(+接続状態バー等)が、端末のステータスバー(電波・バッテリー等の常設アイコン)と重なって表示され、タップもステータスバー側に取られてしまっていた(ユーザーが実機確認で発見)。`viewport-fit=cover`を指定しているためアプリがステータスバー領域まで描画するが、上端のセーフエリア余白(`env(safe-area-inset-top)`)が考慮されていなかった。

**Approach:** `AppShell.tsx`の最外殻コンテナに`padding-top: env(safe-area-inset-top)`を追加し、全体表示をステータスバー分だけ下にずらす。`BottomTabs.tsx`が既に`pb-[env(safe-area-inset-bottom)]`で同じパターンを下端に適用済みなので、それに倣う。

</frozen-after-approval>

## Implementation Notes

- `src/app/AppShell.tsx`: 最外殻の`<div className="mx-auto min-h-[100dvh] w-full max-w-2xl bg-surface-sunken">`に`pt-[env(safe-area-inset-top)]`を追加。
- Android実機ビルド(Pixel_7_API_36エミュレータ)で確認: 修正前はアバターアイコンがステータスバーと重なりタップが端末側に取られていた。修正後はアバターがステータスバー下に正しく表示され、シングルタップ(`/profile`遷移、約300ms遅延)・ダブルタップ(`/secret-mode`遷移、パスコード未設定時)とも正常動作を確認。
- 検証: `npm run lint` 0 errors、`npm test -- --run` 99 files / 813 tests 全green、実機(エミュレータ)での目視+タップ確認済み。
