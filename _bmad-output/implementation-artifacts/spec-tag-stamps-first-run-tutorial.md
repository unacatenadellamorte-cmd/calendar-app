---
title: 'タグスタンプ32種類と初回案内'
type: feature
created: 2026-10-06
status: done
baseline_commit: 3f0b93f7a36e046b6287494ff6aa24a768d99ec2
route: dispatch
review_loop_iteration: 0
context: ['{project-root}/AGENTS.md']
---

<frozen-after-approval>

## Intent

登録・Google接続の違いが分かりづらい。初回だけ主要機能を案内し、タグに了承済み第3案の32種類の丸い単色線スタンプを追加する。

## Boundaries & Constraints

名称欄・既存データを保持。名称なし＋スタンプありのタグを許可し、予定には値を複写する。タグ編集・削除は既存予定に波及しない。アプリではスタンプだけ、名称ありなら絵＋名称。月は文字の約1.4倍。Google・通知・既存Widgetには用途名を内部件名として保持し、空件名を送らない。スタンプは安全な固定IDとSVGで扱う。色ラベル上は読める色に合わせる。

チュートリアルは新規プロフィールの初回フローに5ページ（予定、シフト、タグ、登録とGoogle接続、Google反映）。完了・スキップを端末に保存し再表示しない。既存プロフィールには自動表示しない。通信失敗を新規扱いしない。6言語を維持。

本番DB適用・配布・課金・認可・実予定の変更、実機の消去は禁止。既存AGENTS.mdはコミット対象外。2機能を今回扱うことは本人了承済み。

## I/O & Edge-Case Matrix

| 状態 | 結果 | 失敗時 |
| --- | --- | --- |
| 名称またはスタンプあり | タグ保存、予定へ複写 | 不正ID・両方空は拒否 |
| スタンプのみ | 月・週・日・年・一覧・ホームは絵だけ | 未知IDは件名を隠さない |
| 名称を手入力 | 文字表示を復帰 | 保存失敗で入力保持 |
| 初回・案内未完了 | 案内を表示 | 保存不可でも利用を妨げない |
| 完了・スキップ済み／既存利用者 | 通常起動 | 読込失敗では案内しない |

</frozen-after-approval>

## Code Map

- `src/data/event-tags.ts`、`src/lib/event-tag.ts`：タグCRUDと値複写。時刻・終日規則を再利用。
- `src/data/events.ts`、`src/data/offline-write.ts`：件名必須を維持し、追加値をキャッシュ・送信へ通す。
- `src/features/tags/ui/`、`src/features/events/ui/`：名称欄、タグ選択、編集。
- `src/features/calendar/ui/EventChip.tsx`：月・週共有、横流れあり。名称なしでは横流れ不要。
- `src/app/AppShell.tsx`：プロフィール取得は一箇所。取得中・失敗の分岐を維持。

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/event-stamps.ts`、`src/ui/EventStamp.tsx`、`src/ui/StampPicker.tsx`：32種類のID・名称・線画・選択UI。参照は共通出力画像の第3案。
- [x] `supabase/migrations/20261006000000_event_stamps.sql`、`src/data/event-tags.ts`、`src/data/events.ts`、`src/data/offline-write.ts`：stampId、予定stampOnlyを追加。タグ名のみ条件付き空欄可。旧値はnull/false。
- [x] `src/lib/event-tag.ts`、`src/features/tags/ui/EventTagFormSheet.tsx`、`EventTagsScreen.tsx`、`src/features/events/ui/EventFormSheet.tsx`：選択・解除・プレビュー・コピー。内部件名と名称入力を区別。
- [x] `src/features/calendar/ui/EventChip.tsx`、`MonthShiftTiles.tsx`、`src/features/events/ui/EventListItem.tsx`、`src/features/home/ui/HomeScreen.tsx`、`src/data/export.ts`：表示・読み上げ・書出しを保持。
- [x] `src/features/tutorial/ui/FirstRunTutorial.tsx`、`src/features/tutorial/model/tutorial-state.ts`、`src/app/AppShell.tsx`：初回状態と案内、既存プロフィール画面を再利用。
- [x] `src/i18n/source-keys.json`、`src/i18n/{en,fr,es,zh,ko}.json`：新規文言・32名称を翻訳。
- [x] 各変更の同名 `.test.ts(x)`、`src/data/event-stamps-migration.test.ts`：表の条件、DB制約、オフライン復帰、コピー独立性、秘密予定除外を検証。

**Acceptance Criteria:**
- Given 名称なしタグ、When 予定作成・再読込、Then 絵のみで表示し詳細編集と連携の件名を失わない。
- Given 新規利用、When 完了またはスキップ後に再起動、Then 案内を繰り返さない。
- Given 旧データ・外部予定、When 更新版を利用、Then 名称・色・時刻・秘密属性を保持する。

## Implementation Notes

- 2026-10-07: 本人の追加指示でチュートリアルはメインのCodexが作成する。低コストモデルの全体実装を編集開始前に停止した。チュートリアルとAppShell・関連テストはメインが先に検証し、その後、残りの未完了タスクだけを低コストモデルへ渡す。翻訳辞書はメインの新規文言も含めて担当する。並列編集・本番変更・pushはしない。
- 2026-10-07: メインがチュートリアル・AppShellの配線とテストを作成。対象4ファイル29テスト、typecheck、lint成功。完了・スキップ後の再起動、既存利用者、読込中・失敗、保存禁止を検証した。低コスト担当は未完了タスクのみ進め、`src/features/tutorial/`と`src/app/AppShell*.tsx`は変更しない。関連する問題はメインへ報告する。新規文言の6言語翻訳と全体検証は残る。gitのcommit・pushや外部操作は担当させず、最終統合はメインで行う。
## Spec Change Log

## Review Triage Log

2026-10-07：3層の結果を全て受領後に判定。本人の費用節約指示を優先し低コストモデルを使用。枠制限で検証ギャップ担当のみ既存の読み取り専用担当を再利用した。エッジケース担当は指摘0件。

| 指摘 | 判定 | 根拠・処理 |
| --- | --- | --- |
| B1 タイトルrequiredでスタンプのみ保存不可 | false | EventFormSheetのformはnoValidate。名称なしタグは空でない内部用途名とstampOnly=trueを複写し、統合テストで保存・再読込成功。ブラウザー必須検証で拒否されない。 |
| B2 書出しv4の読み込み対応なし | false | DataSectionは書出しのみで、既存の復元経路は存在しない。export.testはスタンプ・タグ値を含むv4を確認。存在しない復元機能の追加はこの不具合の修正ではない。 |
| B3 非日本語利用でも内部用途名が日本語 | medium | applyEventTagはeventStampNameの日本語を無翻訳で返し、通知・Google反映が件名をそのまま使う。6言語維持の方針に対し名称なし予定だけ日本語になる。用途名を作成時の言語で翻訳する直接修正にroute=patch。保存後の件名は再翻訳しない。 |
| B4 stampOnly=true/IDなしのDB整合制約なし | false | 既存・未知IDはタイトルを隠さない安全な表示を要求し、EventChip/EventListItemは固定ID確認とstampOnlyの両方で非表示を決める。件名必須は既存制約を維持。不整合による空表示の経路は示されていない。 |
| B5 stampOnlyの実行時型検証なし | false | 書込呼出元は型付きフォーム値・既存booleanから生成し、DB列もboolean。文字列を渡す利用経路はない。不正値を外部から注入できるという根拠がなく、未実証状態への追加ガードは採らない。 |
| B6 案内のページ切替でフォーカス移動なし | false | FirstRunTutorialのuseEffect([page])でh2 refへfocusし、role=statusのページ番号もある。見出しフォーカスのテストが成功。 |
| B7 固定画面名が古くなる恐れ | false | 現在の設定・カレンダー順・Google反映先の実装と案内文を照合済み。名称の相違はない。将来の画面変更だけを仮定した指摘で、今の誤案内は起きていない。 |
| B8 スタンプ選択にキーボード位置案内なし | false | role=group内の通常buttonで、全32項目の用途ラベル・aria-pressed・フォーカス表示を持つ。要求されていないgrid式キー操作や位置説明がないことは操作不能を示さない。 |
| B9 年表示の名称あり予定も絵だけ | false | 既存YearViewは省スペースの代表1件ドットのみで名称を元々表示しない。今回ドットをスタンプへ置換し月への導線は維持。名称を新たに年セルへ詰め込む仕様変更は採らない。 |
| B10 移行試験の旧スキーマが簡略 | false | 実際の20260925000000_event_tags.sqlと試験のname制約式・制約名は一致。移行対象は追加列とそのname制約だけで、他の列・RLSは変更しない。現在の制約衝突・既存値破損の根拠はない。 |
| V1 名称なしタグのフォーム送信テストなし | medium | 検証担当の確認を採用。CRUD・選択部品の単体試験ではフォームからstampIdが抜けても検出できない。空名＋workの送信値と編集時復元を直接検証するroute=patch。 |
| V2 内部用途名を表示したまま保存すると通常件名になる | false | 未編集ではform.stampOnly=trueがtoInputへ保持され、保存・再編集でも絵だけを維持する統合テストが成功。タイトルinputのonChangeだけがfalseへ戻すため、単にそのまま保存したとき通常件名になるという主張は成立しない。名称入力空表示という候補案は承認仕様ではない。 |

生存指摘B3とV1は別の根本原因で、両方patchへ分類。意図の不足・仕様変更・後回し対象はない。

同じ実装担当へ最小修正を依頼し、対象15テスト成功。メインが差分を確認し全体検証を再実行して成功。B3は作成時の用途名だけt()で翻訳、V1は空名の送信値・編集選択復元の2テストを追加した。レビューの未解決・延期は0件。

## Verification

`npm run typecheck`、`npm run lint`、`npm test`、`npm run build`を成功させる。狭幅・文字拡大・明暗で32選択と月表示を確認。実ユーザー端末のconnectedテストは禁止。

- 2026-10-07 メイン最終検証：typecheck成功、154ファイル1505テスト成功、lintエラー0（既存警告1）、build成功（既存の分割・サイズ警告）、git diff --check成功。本番DB未適用、push・配布・実機消去なし。
- `useEvents.inputToPatch`のstampId/stampOnly抜けを統合テストで検出・修正。`useProfile`の認証確定後、初回取得前のnull誤判定を防止。PGlite制約テストはNode環境で成功。
- 年表示は代表予定のスタンプ、ホームはCompactCard→EventListItemを再利用。ネイティブWidget・Google・通知の内部件名は維持。
- ブラウザーで320px/640px、明暗・150%文字拡大、5ページ遷移、33選択肢を確認。320pxで横はみ出しなし、月の12px文字に16.8pxスタンプ、44px以上の案内ボタン。実データに接続しない[確認画面](../../docs/previews/stamps-tutorial.html)を追加。画像は共通出力画像へ保存。

| 承認表の行 | 実行・成功した検証 |
| --- | --- |
| 名称またはスタンプあり／不正・両方空拒否 | event-tags.test、event-tag.test、PGlite移行制約 |
| スタンプのみ／未知ID | EventLabelFlow統合、EventChip、EventListItem、YearView、CompactCard |
| 名称手入力／失敗時保持 | EventFormSheet、EventLabelFlow統合 |
| 初回／保存不可 | FirstRunTutorial、tutorial-state、AppShell、useProfile |
| 完了・スキップ／既存／読込失敗 | AppShell、onboarding-flow、useProfile |

- オフライン作成のcache/outboxと接続復帰はevents.test・sync.test、値複写独立性はevent-tag.test・EventLabelFlow、秘密除外とスタンプ書出しはexport.test、5外国語の全5ページはFirstRunTutorial.test、全辞書のキー・差込はi18n/index.testで成功。
- 追加依頼の登録メールは別作業。本番画面を読取確認した結果、無料＋標準送信ではSMTP設定またはProが必要と表示。送信方式を維持する許可範囲では変更不可のため、件名・本文を含む本番設定は未変更。本人へ保留／SMTP調査の選択を確認中。
