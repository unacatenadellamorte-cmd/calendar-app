---
title: '予定の場所・URLと背景編集・可読性の改善'
type: 'feature'
created: '2026-09-19'
status: 'done'
route: 'dispatch'
baseline_commit: 'c665203597f2d6151d9c5326583355b8ac4e5af8'
review_loop_iteration: 2
context: []
---

<frozen-after-approval>

## Intent

予定登録画面に場所とURLを保存する欄を追加し、地図とリンクをタップして開けるようにする。開く地図アプリは設定から選択する。背景画像はホームとカレンダーにのみ適用し、選択後にトリミングできるようにする。写真に重なる年月日リスト切替、日付移動・削除、上部見出し・今日・シフト説明をテーマに沿って読みやすくし、下部ナビとステータスバーは不透明にする。

## Boundaries & Constraints

場所・URLは保存後の再表示、オフライン保存と再送、エクスポートで失われない。既存予定・古いキャッシュに新フィールドがなくても扱える。場所とシフト勤務先は別属性。外部カレンダーの読み取り専用は維持。URL起動は利用者のタップ時だけ、危険なスキームは保存時と起動時に拒否。Zoomの会議参加そのものはテスト実行しない。地図設定と背景画像は端末ごとに保存する。トリミングのキャンセル・失敗は既存画像を壊さない。背景がない場合の表示、暗色テーマ、月セルの40%透過を維持。

## I/O & Edge-Case Matrix

| 入力・状態 | 結果 |
|---|---|
| 場所・有効なURLを新規/編集で保存 | 再表示・キャッシュ・再送でも保持、削除して空欄に戻せる |
| URLにjavascript/data等 | 保存と起動を拒否し説明 |
| 地図設定変更後に場所を開く | 選択した地図へ文字列を安全に符号化して渡す |
| 対応アプリがない/起動失敗 | ブラウザ等の適切な代替または説明、無反応にしない |
| 縦/横/小画像を選択 | 枠内の移動・拡大でトリミングできる |
| トリミング確定/キャンセル | 確定でのみ保存、キャンセルは以前の背景を維持 |
| 背景ありで画面遷移 | ホーム/月画面のみ写真、設定・プロフィール等は通常面 |
| 明暗テーマと写真 | 見出し/操作部/説明/システムバーに読める色付き面、下部ナビは透過しない |

</frozen-after-approval>

## Code Map

- `src/data/events.ts`, `offline-write.ts`, `sync.ts`, `export.ts`: 新属性と保存・再送・既存データ互換。
- `supabase/migrations/20260921000000_event_location_url.sql`: nullableのlocation/event_url列を追加。既存データ・RLSを変更しない。
- `src/features/events/ui/EventFormSheet.tsx`, `EventDetailSheet.tsx`: 入力と開く操作。
- `src/platform/`: 外部起動をまとめ、Capacitor AppLauncherとWebの差を吸収。
- `src/features/settings/`: 地図設定、BackgroundSection、backgroundImageと新トリミング部品。
- `src/app/AppShell.tsx`, `BottomTabs.tsx`, `src/ui/Screen.tsx`, `src/styles/`: 背景適用画面・安全領域の面色と読みやすさ。
- `src/features/calendar/ui/`: 表示切替、日付移動・削除、シフト説明の面色。

## Tasks & Acceptance

- [x] 予定の新属性、非破壊DB移行、入力・再表示・外部起動・地図設定。
- [x] 画像のトリミングと確定/キャンセル、保存・資源解放。
- [x] 背景の画面限定と各操作部・文字のコントラスト改善。
- [x] 多言語文言、関連回帰テスト、型検査、対象lint、ビルドと可能な端末検証。

受入: 場所・URLを登録して開き直した場合に保持され、それぞれの操作で設定済み地図や外部URLが開く。画像選択後に範囲を選んで保存した場合にその範囲が背景となり、設定などへ遷移すると背景写真が表示されない。写真ありでも上部見出し・操作・下部ナビ・システムバーが読める。

## Implementation Notes

ユーザーの費用優先指示により低コスト3担当へ分担。メインは設計、DB適用確認、統合と最終検証。既存の未追跡素材は保持。既存のbmad-build手順を継続し、明示された依頼の範囲で進める。

## Review Triage Log

- 修正済み: プレビューの移動量と保存範囲の不一致、縦長枠の比率崩れ、検証前の画像decode、保存中の閉鎖競合。
- 修正済み: 暗色面に暗色文字、写真用CSSによるナビ透過、テーマとシステムバーの不一致、翻訳キーとエラー文の不一致。
- 修正済み: 外部起動のcompleted未確認、geo URIの一般URL検証への混入。入力/起動はHTTP/HTTPSに統一し、地図内部URIのみ専用経路を使う。
- データ経路レビュー: 旧キャッシュ・patch省略・null消去・オフライン再送・エクスポートを確認。

## Verification

関連Vitest、型検査、src/packages lint、Web/Androidビルド。DB移行の適用前差分と適用後の列確認。画像と背景は実ブラウザで確認し、Google/Zoomの実会議参加など外部副作用は起こさない。実施できなかった範囲は完了報告に明記。

実績: 全体943件、最終UI40件とDateNav7件、Android単体18件成功。型検査・lint・Web/Androidビルド成功。DB列適用済み。実機1.0.13/code14へ更新。Chrome390px幅のトリミングと各テーマの面色を確認。実機全画面・実地図/Zoom・iOS実行は未確認。詳細は `docs/event-links-background-20260919.md`。
