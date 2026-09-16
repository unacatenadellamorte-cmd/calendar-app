---
title: 'シークレットモード(予定の秘匿 + パスコードロック)'
type: 'feature'
created: '2026-09-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'ef1332f29bbe332402ab034ce312de5146101486'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 予定の中には他人に見せたくないものがあるが、今は全予定が常に一覧・月・週・年・ホーム・給料見込みに表示され、隠す手段がない。

**Approach:** 予定に「シークレット」フラグを追加し、アプリ起動直後(既定)は表のすべての表示箇所から除外する。設定画面でパスコードを設定し、ロック解除(=表示ON)にはそのパスコードが要る。(上部アバターアイコンのダブルタップでの切替ショートカットは別spec、`deferred-work.md`参照。)

## Boundaries & Constraints

**Always:**
- ロック中(既定)は `is_secret=true` の予定を、一覧・月・週・年のどのビューからも、ホームの代表予定選抜・給料見込みからも除外する。
- 解除状態(`unlocked`)はメモリ上の React state のみで**永続化しない**。アプリ起動・リロードのたびに必ずロック状態(`false`)に戻る(要望どおり)。
- パスコードは SHA-256 ハッシュのみ `profiles` に保存する。平文はどこにも保持・送信しない。
- 予定のシークレット設定は `source==='local'` の予定のみ(既存 `updateEvent` の制限をそのまま使う)。
- タップ領域は既存ルールどおり44px以上(`min-h-11`)。

**Never:**
- サーバー(Edge Function)側でのパスコード検証や、RLSでのシークレット行レベル制御は作らない(Design Notes参照)。あくまで表示レイヤーの機能であり、データの暗号化・アクセス制御は範囲外。
- パスコード忘れ時の複雑な復旧フロー(メール再設定等)は作らない。ログイン済み本人はいつでも再設定できる。
- `/shifts/add`(QuickShiftScreen)へのシークレットトグル追加はしない。作成後は通常の予定編集(EventFormSheet)から秘匿設定する。
- ローカル通知(リマインダー)の内容をシークレット予定用に変える対応はしない(範囲外)。
- 上部アバターアイコンのダブルタップでのON/OFF切替は作らない(別spec、`deferred-work.md`)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ロック中に画面を開く | `is_secret=true` の予定を含む複数件 | 一覧・月・週・年・ホーム・給料見込みすべてから除外される | N/A |
| パスコード未設定でロック解除操作 | `secretPasscodeHash=null` | まずパスコード設定フォームを出し、解除トグルそのものを出さない | N/A |
| 正しいパスコードで解除 | ハッシュ一致 | `unlocked=true` になり全画面に即座に反映 | N/A |
| 誤ったパスコードで解除 | ハッシュ不一致 | `unlocked` は変わらずエラー表示 | `secret/incorrect-passcode` |
| 形式不正なパスコードを設定 | 4桁未満/9桁超/数字以外 | 保存せずエラー表示 | `secret/invalid-passcode` |
| 再ロック | 解除中に設定画面で操作 | パスコード不要で即座に `unlocked=false` | N/A |
| 取り込み予定にシークレット設定を試みる | `source!=='local'` | 既存 `updateEvent` の制限により拒否 | `event/not-editable` |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260920000000_secret_mode.sql` -- 新規。`events.is_secret boolean not null default false` を追加(`20260918000000_event_reminders.sql` と同じ ALTER TABLE 手順)。`profiles.secret_passcode_hash text`(nullable)+ `check (secret_passcode_hash is null or char_length(secret_passcode_hash) = 64)`(SHA-256 hex=64文字)を追加。RLS は変更しない(既存ポリシーが両列をそのままカバーする)。
- `src/lib/passcode.ts` -- 新規。`hashPasscode(passcode): Promise<string>`(Web Crypto `crypto.subtle.digest('SHA-256', ...)` → hex文字列、`src/lib/image.ts` と同じ「新規npm依存を足さない」方針)、`isValidPasscodeFormat(passcode): boolean`(`/^\d{4,8}$/`)。
- `src/data/events.ts` -- `EventItem`/`EventRow`/`COLUMNS`/`toEvent`/`rowFromInput`/`updateEvent`(126-146, 187-206, 295-335行目付近)に `isSecret`/`is_secret` を追加(`reminderMinutes` 追加時と同じ手順)。`NewEventInput`/`EventPatch` に `isSecret?: boolean` を追加。新規 `hideSecretEvents(events: EventItem[], unlocked: boolean): EventItem[]`(pure、`unlocked ? events : events.filter(e => !e.isSecret)`)をエクスポート。
- `src/data/offline-write.ts` -- `offlineCreateEvent`(手動フィールド列挙、40-58行目付近)に `isSecret: input.isSecret ?? false` を追加。`offlineUpdateEvent` はスプレッドで自動対応、変更不要。
- `src/data/profiles.ts` -- `Profile`/`ProfileRow`/`COLUMNS`/`toProfile` に `secretPasscodeHash: string | null` を追加。`ProfilePatch` に `secretPasscodeHash?: string | null` を追加(既存 `updateProfile` がそのまま使える)。
- `src/app/secret-mode-context.ts` -- 新規。`src/app/online-context.ts` と同型の React Context:`SecretModeState`(`unlocked`/`hasPasscode`/`errorKey`/`unlock(passcode)`/`lock()`/`setPasscode(passcode)`/`dismissError()`)+ `useSecretMode()`。HomeScreen/CalendarScreen/設定画面から Outlet 越しでなく直接 `useSecretMode()` で読める(`OnlineProvider`/`useOnline` と同じ理由)。
- `src/app/SecretModeProvider.tsx` -- 新規。`unlocked` は `useState(false)` のみ保持(**永続化しない**)。パスコードハッシュ自体は独自フェッチせず `passcodeHash`/`onChangePasscodeHash` を props で受け取る(Part Aの「`useProfile` 分散」の反省を踏まえ、真実源は AppShell の単一 `useProfile()` のまま)。`unlock(passcode)` は `hashPasscode` して `passcodeHash` と比較(オフラインでも動く、DB往復不要)。
- `src/app/AppShell.tsx`(現行84行) -- `<OnlineProvider>` の内側全体を `<SecretModeProvider passcodeHash={profile?.secretPasscodeHash ?? null} onChangePasscodeHash={(hash) => update({ secretPasscodeHash: hash })}>` で包む。アバター部分・タップ挙動(63-73行目)は無変更。
- `src/features/events/ui/EventFormSheet.tsx` -- 「終日」チェックボックス(167-175行目)と同じパターンで「シークレット」チェックボックスを追加。`FormState`/`initialState`/`toInput` に `isSecret` を通す。
- `src/features/events/model/useEvents.ts` -- `inputToPatch`(20-31行目)に `isSecret: input.isSecret ?? false` を追加。
- `src/features/home/ui/HomeScreen.tsx` -- `useSecretMode()` の `unlocked` で `ev.events` を `hideSecretEvents` してから `useFeaturedEvents`/`PayCard` へ渡す(22行目直後)。
- `src/features/calendar/ui/CalendarScreen.tsx` -- 同様に `ev.events` を `hideSecretEvents` してから `useCalendarView` へ渡す(38-41行目)。
- `src/features/settings/ui/SecretModeSettingsScreen.tsx` -- 新規。`hasPasscode===false` ならパスコード設定フォーム、`true` ならON/OFFトグル(OFF→ON はパスコード入力必須)+「パスコードを変更」導線。`useSecretMode()` を使う。
- `src/features/settings/ui/SettingsScreen.tsx` -- 「シークレットモード」行を「プロフィール」等(102-129行目)と同じパターンで追加。
- `src/app/routes.tsx` -- `{ path: 'secret-mode', element: <SecretModeSettingsScreen /> }` を追加(`profile`/`shift-templates` と同じ、タブ外)。
- `src/data/messages.ts` -- 新規 messageKey: `secret/invalid-passcode`、`secret/incorrect-passcode`。

## Tasks & Acceptance

**Execution:**
- [x] `supabase/migrations/20260920000000_secret_mode.sql` -- `events.is_secret` + `profiles.secret_passcode_hash` を追加
- [x] `src/lib/passcode.ts` + テスト -- ハッシュ化・形式検証の純関数(Web Crypto、新規依存なし)
- [x] `src/data/events.ts` -- `isSecret` フィールド配線 + `hideSecretEvents` + テスト
- [x] `src/data/offline-write.ts` -- `offlineCreateEvent` に `isSecret` 追加
- [x] `src/data/profiles.ts` -- `secretPasscodeHash` フィールド配線 + テスト
- [x] `src/app/secret-mode-context.ts` + `SecretModeProvider.tsx` + テスト -- 解除状態の単一の真実源
- [x] `src/app/AppShell.tsx` -- `SecretModeProvider` を配線
- [x] `src/features/events/ui/EventFormSheet.tsx` + `useEvents.ts` -- シークレットチェックボックス
- [x] `src/features/home/ui/HomeScreen.tsx` / `src/features/calendar/ui/CalendarScreen.tsx` -- `hideSecretEvents` を適用
- [x] `src/features/settings/ui/SecretModeSettingsScreen.tsx` + テスト -- パスコード設定・ON/OFF画面
- [x] `src/features/settings/ui/SettingsScreen.tsx` + `src/app/routes.tsx` -- 導線追加
- [x] `src/data/messages.ts` -- messageKey追加
- [x] `src/platform/widget.ts` -- `refreshFeaturedWidget()` が参照する予定選抜でも `hideSecretEvents(events, false)` を常に通す(ウィジェット自体にロック/解除の概念が無いため、シークレット予定は常に除外)。実装サブエージェントが「Code Mapに無かったが脅威モデル上ここが最も典型的な露出経路」と指摘、ユーザー確認の上で本specに追加

**Acceptance Criteria:**
- Given シークレット予定が存在し `unlocked=false`、when ホーム/カレンダー画面(月・週・年・リスト全部)を開く、then その予定はどこにも表示されない
- Given パスコード未設定、when 設定のシークレットモード画面を開く、then ON/OFFトグルではなくパスコード設定フォームが出る
- Given パスコード設定済みでロック中、when 正しいパスコードを入力して解除する、then `unlocked=true` になり全画面に即座に反映される
- Given 解除中、when 再ロック操作をする、then パスコード入力なしで即座にロックに戻る
- Given アプリをリロードする、when `unlocked=true` だった、then リロード後は必ず `unlocked=false`(ロック)に戻る

## Implementation Notes

## Spec Change Log

- 2026-09-16: トークン数超過のため、上部アバターアイコンのダブルタップでのON/OFFショートカットを `deferred-work.md` へ先送りし、スコープを「予定フラグ+全画面除外+設定画面でのパスコード設定・ON/OFF」に絞った。ユーザー承認済み(分割案を選択)。これに伴い、アバターのタップ衝突に関する Open Question(3択)も消滅(対象機能が本specの範囲外になったため)。
- 2026-09-16: 実装サブエージェントの指摘により、ホーム画面ウィジェット(`src/platform/widget.ts`、Story 5.6)がシークレット予定をフィルタせず露出させる欠陥を発見。当初のCode Mapに含まれていなかった。ユーザー確認の上、本specの範囲に追加(Tasks参照)。

## Review Triage Log

- **パスコード変更に現行パスコード確認が無い(`SecretModeSettingsScreen.tsx`「パスコードを変更」)** -- verdict: high -- Blind Hunter指摘。自分で確認: 「パスコードを変更」ボタン/フォームは`hasPasscode===true`の分岐内に無条件表示され、`unlocked`を問わない。`SecretModeProvider.setPasscode`も現行ハッシュとの照合を一切しない。ロック中でも設定画面から新パスコードを設定→その場で解除でき、機能の意味が成立しなくなる致命的な穴。route: patch(表示条件を`unlocked===true`に絞るのみ、公開面の追加なし)。
- **`/calendar?event=<id>` ディープリンクがロック状態を無視する(`CalendarScreen.tsx:139`)** -- verdict: high -- Verification Gap・Edge Case Hunterの2人が独立に到達(claim照合でもspecの「どこにも表示されない」に反すると確認)。`initialEventId`の検索が`hideSecretEvents`適用前の生の`ev.events`を見ており、ロック中でもシークレット予定を直接開けてしまう。route: patch(`unlockedEvents`を検索対象にするだけ)。
- **JSONエクスポート(`src/data/export.ts`)がシークレット予定を除外しない** -- verdict: high -- Blind Hunter・Verification Gapが独立に発見。`buildExportBundle`は`source==='local'`のみで絞り`isSecret`を見ない。ウィジェット(`widget.ts`)と同じ「ロック概念を持たない露出経路」で、同じ理由(`hideSecretEvents(events, false)`固定)で直すべき。route: patch。
- **パスコード保存失敗が無言で終わる(`SecretModeProvider.setPasscode`)** -- verdict: medium -- Blind Hunter・Verification Gap・Edge Case Hunterの3人全員が同一箇所に到達。`onChangePasscodeHash`が`false`を返しても`errorKey`をセットしない。オフライン等での保存失敗がユーザーに一切伝わらない。route: patch(汎用の保存失敗messageKeyを追加してセットするだけ)。
- **パスコード入力欄が`type="text"`で平文表示される(設定・解除・変更の3フォーム全部)** -- verdict: medium -- Blind Hunter指摘、自分で確認(3箇所とも`type="text"`)。「ふと見られても見えない」がこの機能の趣旨なのに、入力中はまさにそのリスクにさらす本末転倒。route: patch(`type="password"`へ変更、`inputMode="numeric"`は維持)。
- **誤ったパスコード入力後、値がフィールドに残る** -- verdict: low -- Blind Hunter指摘。直接の修正(失敗時に`formInput`をクリア)。route: patch(上の平文表示修正と合わせて対応)。
- **再ロック後もエラーメッセージが残る** -- verdict: low -- Edge Case Hunter指摘。「ロック中」ラジオのonClickに`dismissError()`が抜けている。route: patch(1行追加)。
- **解除/変更フォーム送信中もラジオボタンが操作可能** -- verdict: low -- Edge Case Hunter指摘。送信中に別のラジオを押すとフォーム状態がリセットされうる(非同期呼び出し自体は送信時の値を使うため実害は限定的だが、UIの一貫性としては直すべき)。route: patch(`disabled={submitting}`を追加するだけ)。
- **月・週・年ビュー、給料見込み(PayCard)でのシークレット除外を直接検証するテストが無い** -- verdict: low -- Blind Hunter指摘。`CalendarScreen`/`HomeScreen`とも単一のフィルタ済み変数を全ビュー・全カードに渡す構造(月・週・年・リストは同じ`unlockedEvents`を、`CompactCard`/`PayCard`は同じ`visibleEvents`を共有)のため、アーキテクチャ上は担保されているが、直接のアサーションが無い。route: patch(既存の仕組みを変えず、テストを追加するだけ)。
- **総当たり対策(試行回数制限・クールダウン)が無い** -- verdict: false(out of scope) -- Blind Hunter指摘。frozen Boundaries「データの暗号化・アクセス制御は範囲外」が明示的にこの種の対策を除外している(Design Notesの脅威モデルも「ふと見られる」レベルの秘匿であり、意図した設計)。
- **パスコードハッシュがソルト無しの単一SHA-256で探索空間が狭い** -- verdict: false(out of scope) -- Blind Hunter指摘。同じくfrozen Boundariesの「データの暗号化…は範囲外」に該当。DB自体が漏れた場合の耐性は、このアプリの脅威モデル(表示レイヤーのみの秘匿)の対象外と明記済み。
- **バックグラウンド化・アイドルタイムアウトでの自動再ロックが無い** -- verdict: medium(未検証、real would be medium) -- Blind Hunter指摘。frozen Always は「アプリ起動・リロードのたびに必ずロック状態に戻る」とだけ約束しており、要望文言も「アプリ立ち上げ時は非表示」のみでアイドル再ロックには触れていない。意図が定めていない拡張であり、この story の欠陥ではなく将来の改善提案。route: defer。
- **`crypto.subtle`が使えない環境で`hashPasscode`が未処理の例外を投げる** -- verdict: medium(未検証、real would be medium) -- Edge Case Hunter指摘。Capacitorネイティブ+モダンブラウザというこのアプリの実際の対象環境ではまず起こらない(secure context前提)。route: defer(将来環境が変わった場合の防御として記録のみ)。
- **フォーム送信中に例外が飛ぶと`submitting`がtrueのまま固まる(try/finally未使用、3フォーム共通)** -- verdict: medium(未検証、real would be medium) -- Edge Case Hunter指摘。`EventFormSheet.tsx`等、このコードベースの既存の送信ハンドラも同じパターン(try/finally無し)を使っており、本story固有の劣化ではなくコードベース全体の既存規約。route: defer(secret-mode単体でここだけ直すと既存パターンと不整合になるため、規約自体を見直す別の機会に)。
- **`unlock()`が`passcodeHash===null`の状態で呼ばれると誤った文言になる** -- verdict: false -- Edge Case Hunter指摘。UIは`hasPasscode===true`の時だけ解除フォームを描画するため、通常操作では到達不能(他タブでの同時パスコード削除等、極めて稀な競合のみ)。

## Design Notes

**パスコードの保護レベル(クライアント側ハッシュ比較のみ、サーバー検証・RLS遮断は作らない)**: このアプリは個人利用規模の単一ユーザーアプリで、`profiles`/`events` の RLS は既に「本人(`auth.uid()`)のみ全行アクセス可」という設計(Part Aで踏襲済み)。シークレットフラグを RLS レベルで遮断する設計(解除で一時セッションクレームを発行しSELECT自体を制限)は、PostgRESTがステートレスな都合上、専用Edge Functionプロキシ層が要り個人アプリの規模に見合わない。サーバー側でパスコードだけをハッシュ比較する設計も、`listEvents()` が無条件に全件取得する既存構造上、結局予定データ自体はクライアントに全件届くため実質的な保護レベルは変わらない。よってクライアント側ハッシュ比較+UI層フィルタを採用する。「他人がふと画面を見ても見えない」レベルの秘匿であり、暗号化やアクセス制御ではないことを実装・ドキュメント双方で明確にする。ユーザーが気づく挙動には影響しないためOpen Questionにはしていない。

**パスコードは数字4〜8桁のPIN形式に限定**: 汎用パスワードではなく、モバイルの画面ロックPINと同じ体験(`inputmode="numeric"`)を狙う。「パスコード」という要望文言もこの想定に沿う。

**解除操作は常にパスコード入力を要求、再ロックは常に即時**: 要望の「設定の部分にON(パスコードを入力)」から解除側のみパスコードが要ると読み取れる。隠す側に認証を課す一般的なプライバシー機能は無く、非対称が自然。

## Verification

**Commands(パッチ適用後、独立に再実行して確認済み):**
- `npm run typecheck` -- 0 errors
- `npm run lint` -- 0 errors
- `npm test -- --run` -- 98 files / 799 tests すべて green(パッチ前784→+15)
- `npm run build` -- 成功(既存の>500kBチャンク警告のみ)

**Manual checks (if no CLI):**
- `npx supabase db push` でのマイグレーション適用はDocker未導入のためこのマシンでは未検証(既知の制約、他ストーリーと同様)
- `npm run dev` での実機確認(パスコード設定→シークレット化→リロードで非表示→パスコード入力で表示)は未実施

**レビューで見つかった致命的な欠陥と修正:**
- 「パスコードを変更」導線がロック中でも表示され、現行パスコードの確認なしに新パスコードを設定してそのまま解除できてしまう(機能の意味が無くなる穴)をBlind Hunterが発見。`unlocked===true`のときだけ表示するよう修正。
- ディープリンク(`/calendar?event=<id>`)経由だとロック中でもシークレット予定を直接開けてしまう欠陥をVerification Gap・Edge Case Hunterの2人が独立に発見。検索対象を`unlockedEvents`に変更。
- JSONエクスポートがシークレット予定を除外していない欠陥をBlind Hunter・Verification Gapが独立に発見(Story 5.6のウィジェットと同種の「ロック概念を持たない露出経路」)。`hideSecretEvents(events, false)`を常時適用するよう修正。
- 他、パスコード保存失敗の無言化・入力欄の平文表示・エラーメッセージの残留・送信中のラジオボタン操作可能・テストカバレッジの直接性、計6件patch。3件(アイドル自動再ロック・crypto.subtle未対応環境・送信ハンドラのtry/finally)はdeferred-work.mdへ記録。
