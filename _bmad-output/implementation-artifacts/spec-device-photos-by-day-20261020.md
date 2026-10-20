---
title: '選択日に撮影した端末写真の一覧'
type: 'feature'
created: '2026-10-20'
status: 'draft'
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

## Boundaries & Constraints

**Always:** 読み取り専用・端末内処理。操作時だけ権限を要求し、一部許可・拒否・撤回を区別。日付は現在の端末時間帯の当日開始以上・翌日開始未満で比較し、固定24時間を足さない。動画・位置情報・削除済み・OSの非表示画像は取得しない。

**Never:** 写真・識別子・日時をサーバー、広告、ログ、JSON出力へ渡さない。原本の変更、DB移行、有料化、ストア設定・版番号変更・配布をしない。未追跡AGENTS.mdは保持・コミット除外。

## I/O & Edge-Case Matrix

| 状態 | 動作 | 回復 |
|---|---|---|
| 全部／一部許可 | 許可範囲だけ日付順に表示 | 一部許可を明記、選び直せる |
| 未要求／拒否 | 写真を読まない | 任意の許可操作／設定案内 |
| 0件／読取失敗 | 空一覧とエラーを区別、予定は操作可能 | 再試行 |
| 日付変更／画面退出／権限撤回 | 古い応答を捨て、画像と要求を解放 | 現在の権限で再取得 |
| 大量画像 | 分割取得、表示範囲だけ縮小画像を読む | 全件へ順次到達可能 |

</frozen-after-approval>

## Open Questions

1. OS：A＝iOS先行、Androidは未対応表示。B＝両OSを実装し、Androidの広い写真権限の申告・承認は配布前の別ゲートにする。承認は保証できない。
2. 対象：A＝ライブラリの作成・撮影日時で分類し、スクショ・保存画像も含める。日時不明は除外、追加日・更新日で代用しない。B＝カメラ写真だけ、確実に識別できない画像は除外するため漏れがある。
3. クラウド：A＝端末にある画像だけ取得し、クラウドのみは取得不能表示。B＝一覧は同じだが、本人が個別に開く際だけOS経由のダウンロードを許す。アプリ独自の保存はしない。

## Code Map

- `src/features/calendar/ui/CalendarScreen.tsx`：日付選択を再利用。
- `src/features/calendar/ui/DayEventPanel.tsx`：選択日の予定一覧。写真はその下、初期状態は折りたたみ。月セル・年・リストへ画像を並べない。
- `src/platform/deviceCalendar.ts`：OS分岐の慣習のみ参照。
- `ios/App/App/GoogleAuthorizationPlugin.swift`：登録点。Androidは`MainActivity.java`。
- `src/ui/BottomSheet.tsx`：単一画像表示に再利用。背景の永続保存は流用禁止。

## Tasks & Acceptance

**Execution:**
- [ ] `src/platform/devicePhotos.ts`と対応テスト：権限、日付範囲、分割一覧、縮小表示、取消・解放の境界を作る。
- [ ] `ios/App/App/DevicePhotosPlugin.swift`、`Info.plist`、`GoogleAuthorizationPlugin.swift`、`ios/App/App.xcodeproj/project.pbxproj`：PhotoKitを登録し用途説明を更新。
- [ ] 対象確定後、Androidの`DevicePhotosPlugin.java`、`MainActivity.java`、`AndroidManifest.xml`と試験：MediaStore・OS別権限を接続。Android配下の実機保護規則を守る。
- [ ] `src/features/calendar/model/useDayPhotos.ts`、`ui/DayPhotoSection.tsx`、`CalendarScreen.tsx`と試験：一覧・拡大・権限案内・中断・再取得。既存レイヤーとの多重表示を防ぐ。
- [ ] `src/i18n/{source-keys,en,zh,ko,es,fr}.json`：文言。`docs/device-photos-by-day-20261020.md`：検証記録。

**Acceptance Criteria:**
- Given 許可済み、when 日付を選び写真欄を開く、then 当日の許可画像へ順次到達でき、他日の写真は混入しない。
- Given 拒否・一部許可・撤回、when 再表示、then 権限外画像を表示せず、予定は引き続き操作できる。
- Given 多数の日付と画像、when 閲覧・退出を繰り返す、then 下記上限を超えて蓄積せず、古い要求は表示を上書きしない。

## Design Notes

アプリ独自の画像ディスクキャッシュは0。縮小画像のメモリキャッシュは合計16MiB以下、一覧の要求寸法は長辺256px以下、同時生成2件以下。40件ずつの取得・表示範囲の仮想化でDOMも増やし続けない。拡大は1枚・長辺1600px以下の表示用画像だけとし原寸全体を復号しない。退出・背面移行・利用者変更で解放。OS側キャッシュは別管理であり、この数値をアプリ全体のメモリ上限とは説明しない。

## Verification

`npm test`、`npm run typecheck`、`npm run lint`、Web・iOS用ビルド。日付境界・夏時間・欠損日時・競合・上限・権限撤回を先に試験。対象OSのビルドと架空画像多数の端末で容量・復帰・限定許可を確認。Mac未検証は明記する。

## Implementation Notes

## Spec Change Log

## Review Triage Log
