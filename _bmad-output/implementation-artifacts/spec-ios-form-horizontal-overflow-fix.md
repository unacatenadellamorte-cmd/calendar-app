---
title: 'iOS入力シートの横揺れ修正とApple再提出'
type: 'bugfix'
created: '2026-10-03'
status: 'done'
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
- [x] iOS -- レビュー修正を含む1.0.23（27）の署名済みIPAとWidget、本番設定を照合する。
- [x] App Store Connect -- 1.0.23（27）、サブスクリプショングループ、月額プラン2件を同じ提出物として再審査へ送る。
- [x] Google Play -- 1.0.23（versionCode 26）をAlphaクローズドテストへ審査送信する。

**Acceptance Criteria:**
- Given 3つの入力シート, when 横へドラッグする, then 端末幅からずれず横位置が変化しない。
- Given 320px相当の幅, when 2列の時刻・数値入力と24色を表示する, then 入力欄は幅内へ縮み色は折り返し、横スクロール領域を作らない。
- Given 修正済みコミット, when 配布ビルドする, then 1.0.23（27）のアプリとWidgetが署名検証を通る。
- Given Appleへのアップロード完了, when App Store Connectを確認する, then 1.0.23（27）と課金3項目の計4項目が「審査待ち」であることを確認できる。

## Implementation Notes

- `BottomSheet`のオーバーレイ、パネル、本文へ幅上限と横方向の非表示を追加し、本文のタッチ操作を`pan-y`へ限定した。縦スクロールと下方向ドラッグは既存実装を維持。
- 320px幅の実ブラウザーで予定・シフト・タグを測定。全画面でdocument、dialog、form、本文の`scrollWidth === clientWidth`、本文の`overflow-x: hidden`と`touch-action: pan-y`を確認。シフトとタグの2列入力は各130.5pxへ縮小し、右端289pxで本文内に収まった。
- Androidネイティブシェルが古いPWAキャッシュを表示し続け、版24でプラン画面が見えない問題を追加で確認した。ネイティブではservice workerを自己破棄し、旧キャッシュと登録を消すよう修正した。
- レビュー後、ピンチ拡大を維持し、旧Service Workerまたはキャッシュがある場合だけ画面描画前に掃除・再読込するよう補強した。失敗時は完了印を残さず次回起動で再試行する。
- ネイティブ配布の`sw.js`が登録解除とキャッシュ削除を含むことをAndroid・iOS配布スクリプトで検証する契約を追加した。
- 関連4ファイル53テスト、全体150ファイル・1,471テスト、型検査、lint（既存warning 1件のみ）、Webビルドに成功。
- Google Playで審査中のAndroid 1.0.23（versionCode 25）AABはSHA-256 `99A1795E8A1CA16733A9F782E499CD5C4D70A674264B02943D39782DBAE3E0FB`。レビュー修正を含む差し替え用versionCode 26 AABは署名・Gradleテスト・lint・bundle成功、SHA-256 `8F317FBFF56626A8A8383CE988BEC6B0E2AD913524D5E3C9FDE6A60A26E717B8`。
- iOS 1.0.23（26）のIPAはWidget・本番設定・署名を照合済み。SHA-256は`6D5F4240ACB8202982E113B523D2682DA35F034A3622FC38B83F11A0BAD2E706`。
- Google PlayはAlphaクローズドテストの「審査中の変更」、App Store Connectはアプリ版・サブスクリプショングループ・月額プラン2件の計4項目が「審査待ち」になった。

## Spec Change Log

- 2026-10-03: 版24でプラン画面が見えなかった原因をネイティブPWAキャッシュと特定し、service worker自己破棄を追加したため配布番号をAndroid 25・iOS 26へ更新した。Appleの初回サブスクリプション審査要件に合わせ、アプリ版と課金3項目を同じ提出物へ統合した。入力シート修正、Widget、本番設定を維持した。
- 2026-10-03: レビュー指摘を受け、不要な初回再読込、掃除失敗時の未処理、ピンチ拡大阻害、配布`sw.js`の検証不足を局所修正した。既存の横幅拘束・縦スクロール・課金・Google連携を維持した。差し替え候補をAndroid versionCode 26・iOS build 27とし、現行のGoogle 25／Apple 26審査は次セッションまで維持する。

## Review Triage Log

| ID | 判定 | 証拠と処理 |
|---|---|---|
| blind-1 | medium | `pan-y`単独指定は本文から始めるピンチ拡大を無効にする。横パン禁止を維持して`pinch-zoom`を許可するpatch。 |
| blind-2 | medium | 旧登録・キャッシュがなくても初回は必ず`reload()`し、描画と非同期競合する。旧状態がある時だけ描画前に掃除・再読込するpatch。 |
| blind-3 | medium | Storage、Service Worker、Cache APIの拒否が未処理Promiseになる。失敗時は起動を続け、完了印を付けず次回再試行するpatch。 |
| blind-4 | medium | 掃除テストは実装ソースの文字列3件しか検査せず、条件逆転や完了印削除でも通る。状態ベースの実行テストへ置換するpatch。 |
| blind-5 | low | 現行の配布スクリプトは`process.env`へ正しい値を設定するが、`.env`経由ではビルド時と実行時が分岐し得る。環境入力と`android`/`ios`判定を統一する直接patch。 |
| blind-6 | low | 単体テストは実レイアウトを測らないが、320px実ブラウザーで3フォームの寸法・横位置・縦操作を確認済み。ブラウザー試験基盤の追加はこの低頻度の検証不足に対して過大なためreject。 |
| edge-1 | medium | blind-3と同じ失敗経路を独立確認。例外捕捉と次回再試行を行うpatch。 |
| edge-2 | medium | blind-2と同じ新規起動時の不要再読込を独立確認。旧状態の有無で再読込を制御するpatch。 |
| edge-3 | medium | blind-1と同じピンチ拡大阻害を独立確認。`pan-y pinch-zoom`へ直すpatch。 |
| edge-4 | false | ビルド25は追加の更新キャッシュ障害発見前の承認時点で、ユーザー承認後にiOS 26へ更新して提出済み。非凍結の変更履歴と受入条件が最終提出番号を記録しており、ワークフロー照合は正しい。 |
| verification-1 | medium | 実行テストが存在しないことを全参照検索で確認済み。ネイティブ削除、Web無処理、2回目無処理、失敗後再試行を実行検証するpatch。 |
| verification-2 | medium | `selfDestroying`成果物の契約検証が配布経路に存在しない。Android・iOSの配布ビルド後に生成`sw.js`を検証し、検証器を局所テストするpatch。 |
| verification-3 | low | 実寸を測る自動ブラウザーテストはないが、今回の3フォームは320px実ブラウザーで検証済み。将来回帰の可能性に対して新規E2E基盤は過大なためrejectし、手動検証記録を維持する。 |

## Verification

**Commands:**
- `npm test -- src/ui/BottomSheet.test.tsx src/features/events/ui/EventFormSheet.test.tsx src/features/shifts/ui/ShiftTemplateFormSheet.test.tsx src/features/tags/ui/EventTagFormSheet.test.tsx` -- 関連回帰成功
- `npm run typecheck && npm run lint && npm test && npm run build` -- 型検査、lint（既存warning 1件）、150ファイル・1,471テスト、Webビルド成功
- `node --test scripts/ios/*.test.mjs` -- 公開設定・署名補助・自己破棄Service Worker契約を含む局所テスト成功
- `VITE_NATIVE_TARGET=android npm run build` -- 自己破棄Service Worker生成と契約照合成功
- `scripts/android/build-release.ps1`（JDK 21、署名あり） -- versionCode 26のGradle単体テスト・release lint・AAB生成成功
- GitHub Actions `37092922180` -- Swift、Widget、署名、archive、iOS 1.0.23（26）のIPA照合成功
- GitHub Actions `37093415511` -- iOS 1.0.23（26）のApp Store Connectアップロード成功
- Android AABのversionCode、versionName、アップロード鍵SHA-1、SHA-256を照合済み

**Manual checks:**
- iPhone幅で横ドラッグが発生せず、縦スクロールと保存・閉じる操作が維持されること。
- App Store Connectで1.0.23（26）と課金4項目が「審査待ち」であることを確認済み。
- Google Play Consoleで1.0.23（versionCode 25）がAlphaクローズドテストの「審査中の変更」であることを確認済み。

## 2026-10-03 差し替え直前までの引継ぎ結果

- 指定された `8424325811f2fcf2b61f941b65a413eb71fcd25b` から、GitHub Actions `37098312898` でiOS 1.0.23（27）を作成した。全1,471テスト、型検査、lint、iOS補助8件、署名条件12件、Widget Swift 10件、archiveとIPAのアプリ・Widget署名検証に成功。
- IPAは8,464,747 bytes、SHA-256 `3eef691d448e73b2077e697093c90e32f77ed0939c1a7cffcbad476f52378ec8`。手元でも両Info.plist、本番Supabase・Google OAuth・RevenueCat・AdMob・プライバシーURL、自己破棄Service Workerを照合した。
- uploadジョブをrun・SHA-256・build 27へ固定した `2d0140b986447c656c0bfabc05532af81999f177` をpushし、送信CI `37098879979` が検証・アップロードともエラーなしで成功。App Store Connect画面で「提出準備完了」、APIで`VALID`。ビルドID `23b097be-a433-4d37-ad30-4447b08254e1`。
- Android code 26をGoogle Play成果物ライブラリへアップロードし、1.0.23・未公開・リリース0件・対象SDK 36・16KB対応を確認した。AABハッシュとアップロード鍵は前記値に一致。
- Google code 25は確認中に審査が終わり、Alphaで選択したテスターへ100%公開済みとなった。こちらで現行変更の削除・公開操作はしていない。次回はcode 26の新しいAlphaリリースを作成して審査へ送る。
- Appleの現行build 26と課金3項目は審査待ちを維持。ユーザー指定の「差し替え直前」へ到達したため、提出キャンセル・更新提出は行っていない。仕様書の`in-review`を維持し、差し替え再提出後に`done`へ進める。
- 詳細と証跡は `docs/store-replacement-ready-20261003.md`。

## 2026-10-03 差し替え・再提出完了

- ユーザーの「続けて」を受け、準備済みAndroid code 26とApple build 27への差し替え・再提出を実行した。追加のコード変更や成果物再生成はしていない。
- Google Play: 新しいAlphaリリース7にcode 26だけを追加し、code 25は新リリースから除外。リリース名は「1.0.23 入力画面・更新キャッシュ修正（26）」、対象は既存Alphaテスターの100%。審査送信操作後に「審査中の変更」を確認。クイックチェック完了後に審査へ自動送信される状態であり、code 26の配信開始はまだ確認していない。対応端末の増減なし、難読化解除ファイル未添付の警告1件のみ。
- Apple: 旧提出 `276c1a0f-d1a9-4949-9343-cf7a34facf46` を取り下げ、アプリ版の選択をbuild 26から27へ変更。既存の審査メモはビルド番号だけ27へ更新し、審査アカウント・課金情報は維持した。
- 新提出 `cfa63106-c4eb-4296-860a-52697142e210` は2026-10-03 14:22 JSTに送信。アプリ1.0.23（27）、Multi calendar 有料プラングループ、複数アカウント、予定反映の4項目すべてが画面上「審査待ち」。APIも`WAITING_FOR_REVIEW`、項目数4、選択build ID `23b097be-a433-4d37-ad30-4447b08254e1`、`releaseType: MANUAL`を確認した。
- 承認後の一般公開操作、実ユーザー端末の変更・削除、実機購入・復元QAは行っていない。仕様書の`done`は今回の修正・成果物検証・再提出の完了を表し、ストア承認や一般公開の完了ではない。
- 詳細・証跡: `docs/store-replacement-submitted-20261003.md`。
