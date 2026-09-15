---
title: 'ユーザープロフィール登録(オンボーディング)+ 上部アバター表示'
type: 'feature'
created: '2026-09-15'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'd94cad83860eda0b5dacc477d7161e278719e46b'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** ユーザー要望。シークレットモード(別spec)の前提として、名前・プロフィール写真を持つユーザー登録と、画面上部に常時表示するアバターアイコンが無い。

**Approach:** 初回起動時(`guest`/`authenticated`いずれかの認証状態が確定し、かつ `profiles` 行がまだ無い場合)、`AppShell` が通常の画面の代わりにオンボーディング画面を表示し、名前(必須)とプロフィール写真(任意、`<input type="file">` → クライアント側でcanvasリサイズ→base64 data URIとして`profiles.avatar_data_url`に保存、Supabase Storageは使わない)を登録させる。登録後は `AppShell` の最上部に丸いアバターアイコン(写真、無ければ名前の頭文字)を常時表示し、タップで `/profile` の編集画面へ遷移できる。

## Boundaries & Constraints

**Always:** `profiles.id` は `auth.users.id` と1対1(`references auth.users(id) on delete cascade`)。RLSは`id = auth.uid()`のみ許可(SELECT/INSERT/UPDATE)。アバター画像はクライアント側で128×128程度にリサイズ・圧縮してからdata URIとして保存する(生ファイルをそのまま保存しない、行サイズ肥大化防止)。オンボーディングは名前未入力の間は送信できない。写真は任意(未設定なら名前の頭文字1文字を丸背景に表示するフォールバック)。

**Never:** Supabase Storageバケットは作らない(このspec・シークレットモードspecいずれでも)。プロフィールの削除・複数プロフィール切替などのアカウント管理機能は作らない(1ユーザー1プロフィール、更新のみ)。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 初回起動、profiles行なし | `state`が`guest`/`authenticated`に確定、`profiles`取得結果が0件 | オンボーディング画面が表示され、他の画面(下タブ含む)は見えない | N/A |
| 名前のみでオンボーディング完了 | 名前入力、写真は選ばない | `profiles`行が作成され通常のアプリ画面に進む。アバターは頭文字表示 | N/A |
| 写真付きでオンボーディング完了 | 名前入力+写真選択 | クライアント側でリサイズしたdata URIが`avatar_data_url`に保存され、アバターに反映される | N/A |
| 名前が空のまま送信しようとする | 名前欄が空 | 送信ボタンが無効、またはエラー表示 | `profile/invalid-name` |
| 既存ユーザーが再訪 | `profiles`行が既に存在 | オンボーディングは出ず、通常のアプリ画面が即座に表示される | N/A |
| 上部アバターをタップ | 通常のアプリ画面表示中 | `/profile`(プロフィール編集画面)へ遷移 | N/A |
| プロフィール編集画面で名前/写真を変更 | 既存プロフィールの更新 | `profiles`行が更新され、アバター表示に即反映 | 失敗時はエラー表示、遷移しない |
| ゲスト(匿名)のまま | `state === 'guest'` | 匿名ユーザーでも`profiles`行の作成・利用は可能(既存の匿名サインインと同じ扱い) | N/A |
| `state === 'unavailable'`(Supabase未設定) | ローカル開発等 | オンボーディングは表示せず、既存の`unavailable`扱いのまま通常画面へ(アバターは出さない) | N/A |

</frozen-after-approval>

## Code Map

- `supabase/migrations/20260919000000_profiles.sql` -- 新規 -- `profiles`(`id uuid primary key references auth.users(id) on delete cascade`, `display_name text not null check (char_length(display_name) between 1 and 50)`, `avatar_data_url text`, `created_at`/`updated_at` + `set_updated_at`トリガ(既存の`calendars`等と同じ))。RLS: `profiles_select_own`/`profiles_insert_own`/`profiles_update_own`(すべて`id = auth.uid()`)
- `src/lib/image.ts` -- 新規 -- `resizeImageToDataUrl(file: File, maxSize: number): Promise<string>`(`<canvas>`で長辺`maxSize`にリサイズし`toDataURL('image/jpeg', 0.85)`相当を返す純粋なブラウザAPI利用、新規npm依存は追加しない)
- `src/lib/image.test.ts` -- 新規(jsdomでの`canvas`/`Image`モックが必要、`src/test/setup.ts`の既存モック方針を確認して合わせる)
- `src/data/profiles.ts` -- 新規 -- `Profile`型(`id`/`displayName`/`avatarDataUrl`)、`getProfile(): Promise<Result<Profile | null>>`(0件はエラーでなく`null`)、`createProfile(input: {displayName, avatarDataUrl?}): Promise<Result<Profile>>`、`updateProfile(patch): Promise<Result<Profile>>`。既存の`src/data/calendars.ts`と同じResultパターン
- `src/features/profile/model/useProfile.ts` -- 新規 -- `useCalendars`と同型のフック(`enabled`引数、`profile`/`loading`/`errorKey`/`create`/`update`)
- `src/features/profile/ui/OnboardingScreen.tsx` -- 新規 -- 名前入力+写真選択+送信。送信中はボタン無効化
- `src/features/profile/ui/ProfileScreen.tsx` -- 新規 -- オンボーディングと同じフォームを編集用に再利用(共通の`ProfileForm.tsx`に抽出)
- `src/features/profile/ui/ProfileForm.tsx` -- 新規 -- 名前入力・写真選択・アバタープレビューの共有フォーム部品(Onboarding/Profile両画面から使う)
- `src/features/profile/ui/AvatarIcon.tsx` -- 新規 -- 丸いアバター表示(写真 or 頭文字フォールバック)、`size`propで大小両対応(上部アイコン用・編集画面プレビュー用)
- `src/app/AppShell.tsx` -- 修正 -- `useProfile`を呼び、`!loading && profile === null`かつ認証状態が`guest`/`authenticated`なら`<OnboardingScreen>`を`<Outlet/>`の代わりに描画。それ以外は既存どおり+最上部に`<AvatarIcon>`(`/profile`へのリンク)を追加
- `src/app/routes.tsx` -- 修正 -- `{ path: 'profile', element: <ProfileScreen /> }` 追加(タブ外、`shift-templates`と同じパターン)
- `src/features/settings/ui/SettingsScreen.tsx` -- 修正 -- 既存の「カレンダー管理」「お気に入りシフト」と同じリンク並びに「プロフィール」を追加

## Tasks & Acceptance

**Execution:**
- [ ] `supabase/migrations/20260919000000_profiles.sql` -- 新規
- [ ] `src/lib/image.ts`, テスト -- 新規
- [ ] `src/data/profiles.ts`, テスト -- 新規
- [ ] `src/features/profile/model/useProfile.ts`, テスト -- 新規
- [ ] `src/features/profile/ui/AvatarIcon.tsx`, テスト -- 新規
- [ ] `src/features/profile/ui/ProfileForm.tsx`, テスト -- 新規
- [ ] `src/features/profile/ui/OnboardingScreen.tsx`, テスト -- 新規
- [ ] `src/features/profile/ui/ProfileScreen.tsx`, テスト -- 新規
- [ ] `src/app/AppShell.tsx`, テスト -- 修正
- [ ] `src/app/routes.tsx` -- 修正
- [ ] `src/features/settings/ui/SettingsScreen.tsx`, テスト -- 修正

**Acceptance Criteria:**
- Given `profiles`行が無い新規ユーザー, when アプリを開く, then オンボーディング画面が表示され他の画面には進めない
- Given オンボーディングで名前を入力し送信する, when 送信が成功する, then `profiles`行が作成され通常のアプリ画面(ホーム)が表示される
- Given `profiles`行が既にあるユーザー, when アプリを開く, then オンボーディングは表示されない
- Given 通常のアプリ画面, when 上部のアバターアイコンをタップする, then `/profile`でプロフィールを編集できる

## Implementation Notes

Code Map / Tasks どおり実装。spec に無かった小さい決定:
1. `AppShell`に`enabled && loading`の読み込み中ゲートを追加(認証確定→プロフィール取得の間の一瞬のフラッシュ防止、後にレビューで`state==='loading'`自体は未考慮と判明しパッチ)。
2. `AppShell`/`OnboardingScreen`/`ProfileScreen`がそれぞれ独自に`useProfile`を呼ぶ設計(`useCalendars`等の既存パターンを踏襲したつもりが、profileは「単一の真実」の共有が必要な値のため、後にレビューで致命的な欠陥と判明しパッチ)。
3. 写真リサイズ失敗時は`console.warn`のみで送信はブロックしない(後にレビューでユーザーへのフィードバック欠如と判明しパッチ)。
4. `AvatarIcon`は常にaria-hidden(装飾専用)、アクセシブルな名前は呼び出し側のLinkに持たせた。

**レビュー後パッチ(9件、詳細は Review Triage Log 参照):**
- `useProfile`を`AppShell`唯一のインスタンスに一本化、`OnboardingScreen`/`ProfileScreen`へpropsで渡す設計に変更(根本修正)
- `needsOnboarding`の判定に`!errorKey`を追加
- `enabled`判定に`state==='loading'`のガードを追加
- `AvatarIcon`の頭文字生成をコードポイント単位に修正+壊れたdata URIでの頭文字フォールバック追加
- 画像ファイルのサイズ上限チェック追加
- `profiles.avatar_data_url`にDBレベルのCHECK制約追加
- `createProfile`の同時実行競合(23505)を`getProfile`フォールバックで吸収
- 写真リサイズ失敗時のユーザー向けフィードバック追加

## Spec Change Log

## Review Triage Log

3並列レビュアー(Blind Hunter 11件 / Edge Case Hunter 13件 / Verification Gap 1件、計25件、重複多数)を baseline `d94cad8` からの unified diff(54.3KB)に対して実施。重複統合・実ソース照合の上でトリアージ:

**patch(9件、同一実装サブエージェントへ差し戻し)**

1. **`useProfile`のインスタンス非共有によりオンボーディング完了後も先に進めない** — high。**3レビュアー全員が独立に到達**、うち Verification Gap は実際に再現テストを書いて実行し実証(`AppShell`を`OnboardingScreen`の親として実レンダーし、送信後2000ms待ってもホーム画面が出現せずタイムアウト)。仕様のAcceptance Criteria違反の確定バグ。根本修正として`AppShell`への一本化を指示。
2. **`needsOnboarding`が取得エラーを考慮しない** — high。Blind Hunter・Edge Case Hunter独立指摘。既存ユーザーが通信エラーでオンボーディングに強制送還される。
3. **`enabled`が認証未確定状態(`state==='loading'`)を考慮しない** — medium。Blind Hunter・Edge Case Hunter独立指摘。コード内コメントの意図と実装が不一致。
4. **`AvatarIcon`の頭文字生成のサロゲートペア非対応+壊れたdata URIでのフォールバック欠如** — medium。Blind Hunter・Edge Case Hunter独立指摘。
5. **画像ファイルのサイズ上限チェック欠如** — medium。Blind Hunter・Edge Case Hunter独立指摘。低スペック端末でのフリーズリスク。
6. **`profiles.avatar_data_url`にDBレベルのサイズ制約が無い** — low(cheap)。Blind Hunter。既存の`calendars.name`等の慣習からの逸脱。
7. **`createProfile`の同時実行競合(PK重複)への対処が無い** — low(cheap)。Edge Case Hunter。
8. **写真リサイズ失敗のユーザーフィードバック欠如** — low(cheap)。Blind Hunter。

**defer(`deferred-work.md`へ記録)**

- EXIF Orientation未対応(スマホ写真が横倒し/逆さまで保存されうる、Blind Hunter)— 実際によく起きうる問題だが、`createImageBitmap({imageOrientation:'from-image'})`への切替は現行の`Image`+canvas実装からの構成変更+フォールバック対応が要り、今回のパッチ規模を超えるため別途対応。
- 写真の連続選び直しでの競合(遅い1回目のresizeが後で選んだ写真を上書き、Edge Case Hunter)— リクエストトークン等の対応が要る、発生条件が狭い。
- 一度設定した写真を削除して頭文字表示に戻す導線が無い(Edge Case Hunter)— 仕様のBoundariesが要求する範囲を超える機能追加。
- クライアント側`.length`とPostgres`char_length`の数え方の違い(絵文字混在名で境界値がずれうる、Edge Case Hunter)— 発生条件が狭い。
- `updateProfile`で空patchが送られるケース(Edge Case Hunter)— UIは常に両フィールドを送るため実質到達しない経路。

## Design Notes

**写真を任意にした理由**: 「名前」は表示・識別に必須だが、「写真」は無くてもアプリの利用に支障が無い(頭文字フォールバックで代替可能)。写真アップロードを必須にすると、カメラ/写真ライブラリへのアクセス許可が無い・単に設定したくない、というユーザーの初回起動を止めてしまうリスクがある。

**base64 data URI保存(Supabase Storage不使用)の理由**: ユーザー確認済み。個人利用規模でアバター1枚(128×128程度)なら`profiles`テーブルの1カラムとして十分軽量。Storageバケットの新設・RLSポリシー設定という新規インフラを増やさずに済む。

## Verification

**Commands(パッチ適用後、独立に再実行して確認済み):**
- `npm run typecheck` -- 0 errors
- `npm run lint` -- 0 errors
- `npm test -- --run` -- 95 files / 736 tests すべて green(`AppShell.onboarding-flow.test.tsx` の実結線回帰テスト含む)
- `npm run build` -- 成功(既存の>500kBチャンク警告のみ、新規警告なし)

**Manual checks (if no CLI):**
- `npx supabase db push`(または`db diff`)でのマイグレーション適用はDocker未導入のためこのマシンでは未検証(既知の制約、他ストーリーと同様)
- `npm run dev`での実機オンボーディング通し確認は未実施(次回実機確認時にあわせて確認)

**レビューで見つかったCritical bugと修正:**
- `useProfile()`をAppShell/OnboardingScreen/ProfileScreenがそれぞれ独立インスタンスとして呼んでいたため、オンボーディング送信成功後もAppShell側のprofileがnullのままでオンボーディングから抜けられないバグを3レビュアー全員が独立に検出(Verification Gapは再現テストで実証)。`AppShell`のみが`useProfile()`を呼び、`OnboardingScreen`へはprops、`ProfileScreen`へは`<Outlet context>`で状態を渡す形に修正。回帰防止として`AppShell.onboarding-flow.test.tsx`を追加。
