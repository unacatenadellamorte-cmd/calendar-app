---
title: 'iOS入力シートの横揺れ修正とApple再提出'
type: 'bugfix'
created: '2026-10-03'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3fc1d4405f0da0d3faacd63d3fd2993967b484f0'
context:
  - '{project-root}/docs/responsive-width-fix-20260930.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** iOSで予定入力、お気に入りシフト登録、予定タグ登録の各ボトムシートが端末幅に完全には収まらず、指で触ると左右へわずかに動く。入力中の視認性と操作感が悪く、Appleへ再提出する版として不十分。

**Approach:** 3画面が共用するボトムシートの縦スクロール領域を端末幅へ拘束し、横スクロールと横方向のパンを止める。フォーム部品も親幅へ縮められる状態を保ち、iOS版を1.0.23（ビルド25）として検証・アップロードし、App Store Connectで再審査へ送る。

## Boundaries & Constraints

**Always:** 縦スクロール、下方向ドラッグ、safe-area、入力フォーカス、24色の折り返しを維持する。3経路を共通修正で直し、Apple提出物には本番設定とWidgetを保持する。

**Never:** ピンチ拡大や月送りを全体で無効化しない。入力・保存・課金・Google連携仕様は変えない。1.0.22（24）の成果物は再利用しない。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 予定入力 | 日時、URL、場所、タグ、色 | 縦だけスクロールし左右へ動かない | 従来どおり |
| シフト登録 | 2列入力、24色 | 入力は縮み、色は折り返す | 従来どおり |
| タグ登録 | 2列入力、24色、長い名称 | 幅内に収まり文字は切り詰める | 従来どおり |
| 狭い端末 | 320px相当の表示幅 | document、シート、入力領域に横スクロールが生じない | N/A |

</frozen-after-approval>

## Code Map

- `src/ui/BottomSheet.tsx` -- 3画面共通。縦スクロール領域の幅拘束と横パン抑制を集約する。
- `src/styles/global.css` -- 既存のsafe-area、最小幅、16px入力文字を維持し、入力幅だけ補強する。
- `src/ui/BottomSheet.test.tsx` -- 横スクロール禁止と既存操作の回帰検証。
- `src/features/events/ui/EventFormSheet.tsx` -- 予定入力。固有修正は必要時だけ行う。
- `src/features/shifts/ui/ShiftTemplateFormSheet.tsx` -- シフトの2列入力を確認。
- `src/features/tags/ui/EventTagFormSheet.tsx` -- タグの2列入力と色を確認。
- `.github/workflows/ios.yml` -- 新IPAのrun、SHA-256、1.0.23（25）を照合する。
- `docs/` -- 修正、検証、Apple提出状態を記録する。

## Tasks & Acceptance

**Execution:**
- [x] `src/ui/BottomSheet.tsx`, `src/styles/global.css` -- 本文を幅内へ拘束し横スクロール・パンを止める。
- [x] `src/ui/BottomSheet.test.tsx` と関連フォームテスト -- 横幅と既存操作を回帰検証する。
- [x] Web全体 -- 型検査・lint・テスト・ビルドを通す。
- [ ] iOS -- 1.0.23（25）の署名済みIPAとWidget、本番設定を照合する。
- [ ] App Store Connect -- 新IPAを選択し、審査情報を更新して再審査へ送る。

**Acceptance Criteria:**
- Given 3つの入力シート, when 横へドラッグする, then 端末幅からずれず横位置が変化しない。
- Given 320px相当の幅, when 2列の時刻・数値入力と24色を表示する, then 入力欄は幅内へ縮み色は折り返し、横スクロール領域を作らない。
- Given 修正済みコミット, when 配布ビルドする, then 1.0.23（25）のアプリとWidgetが署名検証を通る。
- Given Appleへのアップロード完了, when App Store Connectを確認する, then 新ビルドで再審査の提出状態を確認できる。

## Implementation Notes

- `BottomSheet`のオーバーレイ、パネル、本文へ幅上限と横方向の非表示を追加し、本文のタッチ操作を`pan-y`へ限定した。縦スクロールと下方向ドラッグは既存実装を維持。
- 320px幅の実ブラウザーで予定・シフト・タグを測定。全画面でdocument、dialog、form、本文の`scrollWidth === clientWidth`、本文の`overflow-x: hidden`と`touch-action: pan-y`を確認。シフトとタグの2列入力は各130.5pxへ縮小し、右端289pxで本文内に収まった。
- 関連4ファイル53テスト、全体1,467テスト、型検査、lint（既存warning 1件のみ）、Webビルドに成功。

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm test -- src/ui/BottomSheet.test.tsx src/features/events/ui/EventFormSheet.test.tsx src/features/shifts/ui/ShiftTemplateFormSheet.test.tsx src/features/tags/ui/EventTagFormSheet.test.tsx` -- 関連回帰成功
- `npm run typecheck && npm run lint && npm test && npm run build` -- Web全体の検証成功
- GitHub ActionsのiOS配布ワークフロー -- Swift、Widget、署名、archive、IPA照合成功

**Manual checks:**
- iPhone幅で横ドラッグが発生せず、縦スクロールと保存・閉じる操作が維持されること。
- App Store Connectで1.0.23（25）の処理・選択・再審査送信を確認すること。
