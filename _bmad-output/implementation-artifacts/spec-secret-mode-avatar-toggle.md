---
title: '上部アバターのダブルタップでシークレットモードON/OFF切替'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '392c40dfa9789ad8fd4dd8117543365fb04e2e5a'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** シークレットモード(Part A/B完了済み)のロック解除/再ロックは現在、設定画面(`/secret-mode`)を開かないとできない。ユーザーの元要望「いちいち設定を開かなくてもいいように上端のアバターをダブルタップ等でON/OFF」のうち、このショートカットだけが未実装のまま残っている。

**Approach:** 上部アバターアイコン(`AppShell.tsx`)をダブルタップすると、パスコード設定済みなら「解除中→再ロック」は即座に、「ロック中→解除」はクイックパスコード入力シートを開く。ダブルタップは約300msのタイマーで判定する**真のダブルタップ**(ユーザー承認済み)。シングルタップは今まで通り`/profile`へ遷移するが、ダブルタップの可能性を待つため約300ms遅延する。

## Boundaries & Constraints

**Always:**
- ダブルタップが検出されなければ(300ms以内に2回目のタップが来なければ)、シングルタップとして必ず`/profile`へ遷移する(既存挙動を保つ)。
- ダブルタップ検出は明示的なJSタイマー(約300ms)で行う。ネイティブの`click`/`dblclick`併用には頼らない(単発タップの`/profile`遷移を誤発火させないため。月表示のタップ/ダブルタップ〈backlog③〉とは異なり、ここでは単発側の副作用〈画面遷移〉を確実に抑止する必要がある)。
- ダブルタップ時、`hasPasscode===false`(パスコード未設定)なら`/secret-mode`(設定画面)へ遷移し、そこでパスコードを設定してもらう。
- ダブルタップ時、`unlocked===true`なら`lock()`を即座に呼ぶ(パスコード不要、確認不要。既存の設定画面の再ロックと同じ挙動)。
- ダブルタップ時、`unlocked===false`かつ`hasPasscode===true`なら、クイックパスコード入力シートを開く。正しいパスコードで`unlock()`が成功したらシートを閉じる。誤りならシートを開いたままエラー表示する。
- タップ領域は既存ルールどおり44px以上(`min-h-11 min-w-11`)を維持する。
- iOSのダブルタップズーム対策として`touch-manipulation`クラスを付与する(backlog③のMonthViewと同じ対策)。

**Never:**
- クイックパスコード入力シートに「パスコードを変更」機能は持たせない(既存の`/secret-mode`への導線に任せる、範囲外)。
- 生体認証等の追加認証方式は導入しない(範囲外)。
- シングルタップの`/profile`遷移そのものの見た目・導線は変えない(`aria-label`等は維持)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| シングルタップのみ(300ms以内に2回目無し) | 通常操作 | `/profile`へ遷移する(約300ms遅延) | N/A |
| ダブルタップ、パスコード未設定 | `hasPasscode=false` | `/secret-mode`へ遷移する。`/profile`遷移はキャンセルされる | N/A |
| ダブルタップ、解除中 | `unlocked=true` | 即座に`unlocked=false`(再ロック)。シートは開かない | N/A |
| ダブルタップ、ロック中・パスコード設定済み | `unlocked=false`, `hasPasscode=true` | クイック解除シートが開く | N/A |
| クイック解除シートで正しいパスコード送信 | ハッシュ一致 | `unlocked=true`になりシートが閉じる | N/A |
| クイック解除シートで誤ったパスコード送信 | ハッシュ不一致 | `unlocked`は変わらず、シート内にエラー表示、シートは開いたまま | `secret/incorrect-passcode` |

</frozen-after-approval>

## Code Map

- `src/app/AppShell.tsx`(現行94行、70-83行目がアバター部分) -- `<Link to="/profile">`によるシングルタップ即遷移を、`useRef`タイマーによる約300msのシングル/ダブルタップ判定へ置き換える。`useNavigate()`(react-router-dom、既存の`CalendarScreen.tsx`等で使用済みのフック)+ `useSecretMode()`(`unlocked`/`hasPasscode`/`lock`)を追加。タップ確定ロジック: 1回目のタップでタイマー開始、300ms以内に2回目が来たらタイマーを止めてダブルタップ処理(`hasPasscode`→`/secret-mode`遷移 / `unlocked`→`lock()` / それ以外→クイック解除シートを開く)、来なければタイマー満了時に`navigate('/profile')`。アンマウント時に`clearTimeout`(既存の`useEvents.ts`の削除Undoタイマーと同じパターン)。`<Link>`から`<button type="button">`へ変更(押下判定のタイミングを自前で制御するため。`aria-label="プロフィール"`・既存のclassNameはそのまま維持、`touch-manipulation`クラスを追加)。
- `src/app/SecretModeQuickUnlockSheet.tsx`(新規) -- `src/ui/BottomSheet.tsx`(既存、`EventFormSheet`等で使用)ベース。パスコード入力欄1つ(`type="password"`、`inputMode="numeric"`、`SecretModeSettingsScreen.tsx`の解除フォームと同じ文言・挙動)+ 送信ボタン。`useSecretMode()`の`unlock`/`errorKey`/`dismissError`を使う。成功で`onClose`を呼ぶ。
- `src/app/AppShell.test.tsx` / `src/app/SecretModeQuickUnlockSheet.test.tsx` -- 新規/追記テスト。

## Tasks & Acceptance

**Execution:**
- [x] `src/app/SecretModeQuickUnlockSheet.tsx` + テスト -- クイックパスコード入力シート(`BottomSheet`ベース)
- [x] `src/app/AppShell.tsx` -- アバターのシングル/ダブルタップ判定(300msタイマー)+ 3分岐(設定画面遷移/即時ロック/クイック解除シート起動)
- [x] `src/app/AppShell.test.tsx` -- シングルタップ(遅延後`/profile`)・ダブルタップ3分岐・タイマーのクリーンアップの回帰テスト

**Acceptance Criteria:**
- Given アバターを1回だけタップする、when 300ms経過する、then `/profile`へ遷移する
- Given アバターを300ms以内に2回タップする かつ パスコード未設定、when ダブルタップが検出される、then `/secret-mode`へ遷移し`/profile`へは遷移しない
- Given アバターを300ms以内に2回タップする かつ 解除中、when ダブルタップが検出される、then 即座に再ロックされ、シートは開かない
- Given アバターを300ms以内に2回タップする かつ ロック中でパスコード設定済み、when ダブルタップが検出される、then クイック解除シートが開く
- Given クイック解除シートが開いている、when 正しいパスコードを送信する、then `unlocked=true`になりシートが閉じる
- Given クイック解除シートが開いている、when 誤ったパスコードを送信する、then エラーが表示されシートは開いたまま

## Implementation Notes

- **`AvatarNav` サブコンポーネント(Code Map からの実装上の逸脱)**: `useSecretMode()` は AppShell の関数本体では正しく読めない。AppShell 自身は自分がこれからレンダーする `<SecretModeProvider>` の外側(その親)にあたるため、AppShell の関数本体で直接 `useSecretMode()` を呼ぶと React の Context 解決規則により `defaultSecretModeState`(`unlocked=false`固定・`lock`が no-op 等)が返ってしまい、実際の状態を読めない。そのため、アバターのタップロジックは `AppShell.tsx` 内に新設した非公開コンポーネント `AvatarNav`(`SecretModeProvider` の子として JSX 上でレンダーされる)に切り出した。`ConnectivityBar` が `useOnline()` を読むために独立コンポーネントになっているのと同じ理由・同じパターンで、ファイルは Code Map どおり `src/app/AppShell.tsx` 1つに収まっている。
- **タップ判定**: `useRef<ReturnType<typeof setTimeout> | null>` で1回目のタップのタイマーを保持し、300ms 以内の2回目のクリックで `clearTimeout` してダブルタップ処理へ分岐する(`hasPasscode`→`/secret-mode`遷移 / `unlocked`→即時`lock()` / それ以外→クイック解除シート)。アンマウント時 `clearTimeout` は `useEvents.ts` の削除 Undo タイマーと同じパターン。ネイティブの `click`/`dblclick` 併用は使っていない(Design Notes どおり)。
- **`<Link>` → `<button type="button">`**: 押下タイミングを自前の `setTimeout` で制御する必要があるため変更。`aria-label="プロフィール"`・既存の `min-h-11 min-w-11` 等の className は維持し、`touch-manipulation` を追加。この変更に伴い、既存の `AppShell.test.tsx`(2箇所)と `AppShell.onboarding-flow.test.tsx`(2箇所)の `getByRole('link', { name: 'プロフィール' })` を `getByRole('button', ...)` に更新した(回帰、spec Code Map 記載外だが Verification の「既存 + 新規テストすべて green」を満たすために必須)。
- **テストの `useSecretMode` モック方針**: `AppShell.test.tsx` は `vi.mock('./secret-mode-context', async (importOriginal) => ({ ...await importOriginal(), useSecretMode: () => secretState }))` で `useSecretMode` だけを差し替えた(`SecretModeContext` 自体は実物を残す必要がある。`SecretModeProvider` 本体が `SecretModeContext.Provider` をレンダーするため、`useSecretMode` だけでなく `SecretModeContext` も含めて丸ごとモックすると `SecretModeProvider` がクラッシュする)。`SecretModeProvider` 自体は AppShell 内で実物のまま(ラップするだけで中身は使われない)。`SecretModeQuickUnlockSheet.test.tsx` は既存の `SecretModeSettingsScreen.test.tsx` と同じ方式(`useSecretMode` を完全にモック、`@/app/secret-mode-context` 経由)。
- **検証結果**: `npm run typecheck`(0 errors)/ `npm run lint`(0 errors)/ `npm test`(99 files, 811 tests, すべて green)/ `npm run build`(成功)。`npm run dev` での実機タップ確認は未実施(Manual checks は下記参照、CLI セッションのため未実施)。

## Spec Change Log

## Review Triage Log

- **3連続タップで意図せず`/profile`へ遷移する** -- verdict: high -- Blind Hunter・Verification Gap・Edge Case Hunterの3人全員が独立に到達。自分でコードを確認: `handleTap`はダブルタップ確定後`tapTimerRef.current`を`null`に戻すため、直後の3回目のタップが新しい「1回目のタップ」として扱われ、300ms後に`navigate('/profile')`が発火する。ロック解除/再ロック直後にユーザーが3回連続で触れただけで意図しない画面遷移が起きる。route: patch(ダブルタップ確定直後の短いクールダウンで追加のタップを無視する)。
- **`<Link>`→`<button>`でアンカーセマンティクスが失われた** -- verdict: medium -- Blind Hunter・Edge Case Hunterの2人が独立に到達。中クリック/Ctrl+クリックでの新規タブ表示・スクリーンリーダーの「リンク」ロール・`href`によるステータスバー表示がすべて失われた。route: patch(`<Link to="/profile">`に戻し、`onClick`で修飾キー/非主ボタンクリックのときは`preventDefault`せずネイティブ動作に任せ、通常クリックのみ自前のタップ判定で`preventDefault`+`navigate`する)。
- **`AvatarNav`のContext位置依存(`SecretModeProvider`の子であること)が実物のProviderツリー経由でテストされていない** -- verdict: medium -- Verification Gap指摘(pre-verified)。既存テストは`useSecretMode`をモジュールごとモックしており、実装ノートが警告する「`AppShell`の関数本体で呼ぶと`defaultSecretModeState`が返る」という回帰をテストが検知できない。route: patch(`AppShell.onboarding-flow.test.tsx`と同じ「実フック使用」方式で、実物の`SecretModeProvider`配下でのダブルタップ動作を検証するテストを1本追加)。
- **クイック解除シートで`unlock(input)`に空白がtrimされないまま渡る** -- verdict: low -- Edge Case Hunter指摘。`disabled`判定は`input.trim()`を使うが送信は生の`input`。修正は直接的。route: patch。
- **クイック解除シートに「キャンセル」ボタンが無い** -- verdict: low -- Blind Hunter指摘、自分で確認(既存の`SecretModeSettingsScreen`解除フォームにはある)。route: patch(1つ追加するだけ)。
- **バックドロップでシートを閉じてもパスコード入力値がstateに残る** -- verdict: low -- Blind Hunter指摘、自分で確認(`useEffect`は`open→true`のときしか`input`をリセットしない)。route: patch(`onClose`側でもクリアする)。
- **`unlock()`が例外を投げると送信ボタンが固まったまま(try/catch/finally無し)** -- verdict: medium(未検証、real would be medium) -- Blind Hunter・Edge Case Hunterの2人が独立に到達。自分で確認: Part B本体の`SecretModeSettingsScreen.tsx`の解除フォームも同じ欠落を持つ既存パターンで、この diff 固有の劣化ではない。Part Bレビューで既に同種の欠陥(送信ハンドラのtry/finally未使用)を「コードベース全体の既存規約」としてdeferした判断を踏襲する。route: defer(deferred-work.mdの既存エントリと同根)。
- **単発タップの`/profile`遷移が約300ms遅延する** -- verdict: false -- Blind Hunter指摘。frozen Intentの「シングルタップは...ダブルタップの可能性を待つため約300ms遅延する」がまさにこの点であり、Open Questionの選択肢提示時に「シングルタップの/profile遷移に毎回300ms前後の体感遅延が常に乗る」と明記した上でユーザーが承認済みの設計。再審議ではなく承認済みトレードオフ。
- **OS/端末のタップ調整(アクセシビリティ)設定でダブルタップが認識されない可能性** -- verdict: medium(未検証、real would be medium) -- Blind Hunter指摘。個人利用アプリでこの機能を使うのは基本的にユーザー本人であり、既存の設定画面(`/secret-mode`)という代替導線が既にあるため、300ms固定のまま出荷しても機能自体は失われない。route: defer。
- **ダブルタップ確定後もクイック解除シートが開いている間にアバターへの再ダブルタップが可能** -- verdict: false -- Blind Hunter指摘。自分で`src/ui/BottomSheet.tsx`を確認: 背景の閉じるボタンが`fixed inset-0 z-20`で画面全体を覆っており、シート表示中はアバターボタンへのクリックがそもそも到達しない。指摘の引き金となる状態(シート表示中にアバターを再度タップできる)が成立しない。
- **実タッチ操作でのダブルタップ判定を検証する自動テストが無い(jsdom+fireEvent.clickのみ)** -- verdict: false -- Blind Hunter指摘。`docs/testing-and-verification.md`に明記済みの、このプロジェクト全体で既知・受容済みのテスト方針の限界(実ブラウザ・実タッチ操作はjsdomでカバーできない)。backlog③のMonthViewタップ再設計も同じ制約下で同じ方式(fireEvent)のみでテストされており、この diff 固有の欠陥ではない。
- **クイック解除シートを閉じて即座に再度開くと、前回の`unlock()`の遅延応答が新しいシートを閉じてしまう** -- verdict: false -- Edge Case Hunter指摘。`unlock()`はクライアント側のハッシュ比較のみ(ネットワークI/O無し)で、Web Cryptoの`digest`はサブミリ秒〜数ミリ秒で解決する。人間の操作(送信→背景タップで閉じる→再度タップして開く)がこの時間窓に収まることは事実上不可能。
- **キーボードのキーリピート(Enter長押し)でダブルタップが誤発火しうる** -- verdict: low -- Edge Case Hunter指摘。トリガー条件(フォーカスしたアバターボタンでEnterを長押しし続ける)が狭く、発生しても取り消し可能(もう一度操作すれば戻せる)。修正が`e.detail===0`のような新規ガード分岐の追加を伴うため、low severityの却下基準(発生しにくい かつ 修正が単純な直接修正を超える)に該当。reject。
- **`BottomSheet`が閉じたときに呼び出し元(アバターボタン)へフォーカスを戻さない** -- verdict: defer -- Blind Hunter指摘、自分で確認。`BottomSheet.tsx`自体は今回のdiffに含まれておらず、既存の全シート(`EventFormSheet`等)に共通する既存挙動。この story 固有の劣化ではない。route: defer(`BottomSheet.tsx`を触る別の機会に回収)。

## Design Notes

**ダブルタップをJSタイマーで判定する理由**: backlog③のMonthView(月表示のタップ/ダブルタップ再設計)は、単発タップ・ダブルタップのどちらも「その日を開く系」の非破壊的な操作だったため、ネイティブの`click`/`dblclick`併用(タイマー無し)を許容トレードオフとして採用した。今回はシングルタップの結果が`/profile`への画面遷移という、取り消しにくい副作用を持つため、ダブルタップの可能性を待たずに単発タップを即発火させると、ダブルタップのつもりだったユーザーが毎回`/profile`へ弾き飛ばされてしまう。そのため明示的なタイマーで単発タップの発火を約300ms保留する設計とする(ユーザー承認済みのOpen Question回答)。

**パスコード未設定時は`/secret-mode`へ誘導するだけ**: ダブルタップ用に別の初回パスコード設定フォームを作らず、既存の設定画面の導線にそのまま委ねる。ダブルタップというショートカット自体が「既にパスコードが設定済みの人向けの時短」であり、初回設定は頻度が低いため重複UIを持たない判断。

**再ロックに確認・トーストは出さない**: 既存の`SecretModeSettingsScreen`の「ロック中」ボタンも確認無しの即時再ロックであり、同じ挙動に揃える。成功時の視覚的フィードバックは、次にカレンダー/ホーム画面を見たときに予定が消えていることそのもので足りると判断(このアプリに既存のトースト基盤〈Story 3.4の接続解除等が例外的に持つ〉を新規に持ち込まない)。

## Verification

**Commands(パッチ適用後、独立に再実行して確認済み):**
- `npm run typecheck` -- 0 errors
- `npm run lint` -- 0 errors
- `npm test -- --run` -- 99 files / 813 tests すべて green(パッチ前811→+2)
- `npm run build` -- 成功

**Manual checks (if no CLI):**
- `npm run dev` で実際にアバターを素早く2回タップし、ロック中→解除→パスコード入力→表示反映、解除中→再ロック→非表示反映、の一連は未実施(実機でのタップ感度・ダブルタップ検出は未検証、CLIセッションのため)

**レビューで見つかった欠陥と修正:**
- 3人のレビュアー全員(Blind Hunter/Edge Case Hunter/Verification Gap)が独立に、3連続タップでダブルタップ確定直後に意図せず`/profile`へ遷移してしまう欠陥を発見。ダブルタップ確定後の短いクールダウンで追加タップを無視するよう修正。
- `<Link>`→`<button>`化でアンカーセマンティクス(中クリック新規タブ・スクリーンリーダーのリンクロール)が失われた欠陥をBlind Hunter・Edge Case Hunterが独立発見。`<Link>`に戻し、修飾キー/非主ボタンクリックはネイティブ動作に委ねる形に修正。
- `AvatarNav`のContext位置依存(`SecretModeProvider`の子であること)が実物のProviderツリー経由でテストされていない検証ギャップをVerification Gapが発見。実フックを使う回帰テストを追加。
- 他、パスコードのtrim漏れ・キャンセルボタン不在・バックドロップ閉じ時の入力値残留、計3件追加patch。**パッチ適用中に実装サブエージェント自身が新たな回帰(`handleClose`の参照不安定によるフォーカス奪取、入力中に最初の1文字しか送信されない)を発見し自主的に修正**。3件(送信ハンドラのtry/finally未使用・アクセシビリティのタップ調整設定・BottomSheetのフォーカス復帰)はdeferred-work.mdへ。
