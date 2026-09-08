---
title: 'Story 2.4: 代表予定の選抜ロジック(packages/core)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a1532a25fe5114759d980036140671db356f2313'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-2-priority-list-order.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** 狭い表示枠(コンパクトビュー / 将来のウィジェット・通知)に出す「代表予定」を決める規則がまだ無い。画面ごとに実装すると見える予定がバラつく(AD-6 / FR-9)。

**Approach:** `packages/core` に純関数 `selectFeaturedEvents(events, priorityOf, now, limit)` を1つ実装する。対象を「現在時刻以降 / 進行中」に絞り、Story 2.2 の `compareEventsForList` で優先度順(同順位は時刻付き→終日→開始時刻)に並べ、`limit` で打ち切る。副作用・I/O なし。`now` は引数で、内部で現在時刻を読まない。

## Boundaries & Constraints

**Always:**
- `packages/core/src/featured.ts` に実装、`index.ts` から re-export。core は何も import しない葉のまま(標準ライブラリのみ)。副作用・I/O なし。
- 正規入力型 `FeaturableEvent extends OrderableEvent { endsAt: string | null }`(camelCase、時刻は UTC ISO、終日は `eventDate` = `YYYY-MM-DD`)。`OrderableEvent`(Story 2.2)を土台にする。
- `selectFeaturedEvents<E extends FeaturableEvent>(events: readonly E[], priorityOf: PriorityLookup, now: string, limit: number): E[]` ── ジェネリックで呼び出し側の実型(`EventItem` 等)を保って返す。
- **対象の絞り込み(`now` は UTC ISO の時点):**
  - 時刻付き: `endsAt` があれば `Date.parse(endsAt) > Date.parse(now)`(進行中を含む)。`endsAt` が無ければ `Date.parse(startsAt) >= Date.parse(now)`(これから始まるもののみ)。`startsAt` が無い時刻付きは対象外。
  - 終日: `eventDate >= now.slice(0, 10)`(`now` の日付部分と文字列比較)。
- **並び順:** `compareEventsForList(a, b, priorityOf)` に委譲(規則: 優先度昇順 → 時刻付き→終日 → 開始時刻の早い順)。安定ソートで同値は入力順を保つ。
- **打ち切り:** 並べた後に `slice(0, limit)`。`limit <= 0` は `[]`。
- 対象0件のときは `[]` を返す(呼び出し側が「この後の予定はありません」を出せる)。
- 5規則それぞれ + 空結果 + `limit<=0` + 実型の保持に単体テスト(AD-6 / NFR10)。

**Never:**
- `packages/core` が何かを import すること。`Date.now()` / `new Date()` 引数なし等、内部で現在時刻を読むこと。
- コンパクトビュー画面・行コンポーネント(Story 2.5)。設定の表示件数 UI(Story 2.5)。
- 「優先度 → 今から近い順」など全体規則の対案(AD-6 の差し替え点。ここは「優先度 → 開始時刻順」= `compareEventsForList` で実装)。
- `src/` 側の変更、data-access・テーブル・マイグレーション。

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected |
|---|---|---|
| 過去に終わった時刻付き | `endsAt < now` | 除外 |
| 進行中の時刻付き | `startsAt < now < endsAt` | 含む |
| これから始まる時刻付き | `startsAt >= now` | 含む |
| `endsAt` 無し・過去の開始 | `startsAt < now`, `endsAt = null` | 除外 |
| `endsAt` 無し・未来の開始 | `startsAt >= now`, `endsAt = null` | 含む |
| 今日の終日 | `eventDate === now.slice(0,10)` | 含む |
| 過去日の終日 | `eventDate < now.slice(0,10)` | 除外 |
| 優先度がまず効く | 低優先度カレンダーの直近 + 高優先度カレンダーの後の予定 | 高優先度が先 |
| 同カレンダーの終日と時刻付き | 同 calendarId の 10:00 と終日 | 10:00 が先、終日が後 |
| `limit` 打ち切り | 対象5件、`limit = 3` | 先頭3件のみ |
| 対象0件 | すべて過去 | `[]` |
| `limit <= 0` | `limit = 0` | `[]` |
| 実型の保持 | `EventItem[]` を渡す | `EventItem[]` が返る(`title` 等が残る) |

</frozen-after-approval>

## Open Questions

*(なし ── 下記 [ASSUMPTION] はユーザーの「無回答なら仮定を置いて前進」方針に従い決定として確定。Design Notes 参照。)*

## Code Map

- `packages/core/src/priority.ts` -- `compareEventsForList` / `OrderableEvent` / `PriorityLookup`(Story 2.2)。`FeaturableEvent` はここの `OrderableEvent` を extends。**変更しない。**
- `packages/core/src/featured.ts` -- 新規。`FeaturableEvent` 型 + `selectFeaturedEvents`。
- `packages/core/src/featured.test.ts` -- 新規。5規則 + 空 + `limit<=0` + 実型保持。
- `packages/core/src/index.ts` -- `priority` の re-export の並び。`featured` を re-export。冒頭コメントの「後続ストーリーで実装: selectFeaturedEvents (Story 2.4)」を消化。
- `packages/core/src/priority.test.ts` -- テストの書き方の手本(`lookup` ヘルパ等)。
- `packages/core/tsconfig.json` -- `include: ["src"]`、`**/*.test.ts` 除外。新ファイルは自動で入る。

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/featured.ts` -- `FeaturableEvent extends OrderableEvent { endsAt: string | null }`。`selectFeaturedEvents<E extends FeaturableEvent>(events, priorityOf, now, limit)`: scope フィルタ → `compareEventsForList` でソート → `slice(0, limit)`。`limit<=0` と対象0件は `[]`
- [x] `packages/core/src/index.ts` -- `export { selectFeaturedEvents, type FeaturableEvent } from './featured';`。冒頭コメント更新
- [x] `packages/core/src/featured.test.ts` -- 規則1(scope: 過去除外 / 進行中含む / 未来含む / endsAt 無しの扱い / 終日の今日・過去日)、規則2(優先度が先)、規則3(同カレンダー開始時刻順)、規則4(終日は時刻付きの後 + 優先度が上位のときの相互作用)、規則5(`limit` 打ち切り)、対象0件 `[]`、`limit<=0` `[]`、非破壊 / 安定ソート、実型の保持、未知カレンダー

**Acceptance Criteria:**
- Given `packages/core`, when `selectFeaturedEvents` を実装, then 副作用・I/O なし・`now` は引数・正規入力型を core が定義する
- Given 予定・優先度・現在時刻, when 関数を呼ぶ, then 5規則どおりに順序付き結果を返す
- Given 対象が0件, when 関数を呼ぶ, then `[]` を返す
- Given `packages/core` のテスト, when `npm run test`, then 5規則それぞれに単体テストがあり全パスする
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- `packages/core/src/featured.ts` 実装。`FeaturableEvent extends OrderableEvent { endsAt: string | null }`。`selectFeaturedEvents` は scope フィルタ → `compareEventsForList` ソート → `slice(0, limit)` の3段だけ。順序規則は完全に `compareEventsForList`(Story 2.2)へ委譲。
- scope: 時刻付きは `endsAt` があれば `Date.parse(endsAt) > nowMs`(進行中を含む)、無ければ `Date.parse(startsAt) >= nowMs`。`startsAt` 欠損の時刻付きは対象外。終日は `(eventDate ?? '') >= now.slice(0, 10)`。
- ジェネリック `<E extends FeaturableEvent>` で `EventItem[]` → `EventItem[]` を保つ。`[...inScope].sort()` で入力配列は非破壊。
- `index.ts` の「後続ストーリーで実装: selectFeaturedEvents」行を削除。
- テスト 15(core 全体 26)。全体 222 tests。
- **未検証**: 実画面での利用は Story 2.5(コンパクトビュー)。

## Spec Change Log

*(なし。bad_spec / intent_gap ループバックなし。)*

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=4。loopback なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| 「終日は時刻付きの後」が優先度階層をまたぐケース(高優先度の終日 vs 低優先度の時刻付き)のテストが無い。PRD の「時刻付きを出し切ってから」は全体規則とも読める | 実装は `compareEventsForList` 委譲で「優先度がまず効く」= 高優先度の終日が先。epic-context 規則(2)(4)の順序、PRD「2. 優先度がまず効く」と整合。挙動は正しく、検証だけ不足 | low | patch: 相互作用テストを1本追加(コード変更なし) |
| `now` が不正な文字列だと `Date.parse` が `NaN` になり、時刻付きが全件 silently 除外される。`now` にガードが無い | 呼び出し側(Story 2.5)は `new Date().toISOString()` を渡すので到達は呼び出しバグ経由のみ。`compareEventsForList` 自身も core の正規入力を信頼して `Date.parse` を無ガードで使う(既存の core スタイル) | low | reject(core は正規入力を信頼する設計。ガード追加は非実証入力への分岐増) |
| 同一予定が `events` に重複して入っても除去しない | `compareEventsForList` 経由の他の呼び出し(ListView 等)も同様。id 重複は UUID 前提で起きない | low | reject(既存パターンと整合。実証されない状況) |
| `limit` が非整数(2.5 等)のとき `slice(0, 2.5)` の挙動が未定義的 | `Array.prototype.slice` が ToIntegerOrInfinity で 2 に切り捨て。設定 UI は 1〜3 の整数のみ | low | reject(実害なし。呼び出し側で整数に制約) |

## Design Notes

- **並びは `compareEventsForList` に委譲**: epic-context「『一覧の並び』『重なりの描画順』『代表予定の選抜』はすべてこの優先度ユーティリティを通す」。よって `selectFeaturedEvents` 自身は「scope フィルタ + limit」だけを担い、順序規則(優先度 → 時刻付き→終日 → 開始時刻)は Story 2.2 の関数を再利用する。PRD FR-9 の「終日は時刻付きの後」は、各優先度階層の中で終日が後ろに来る形で満たす(優先度がまず効く = PRD 規則2)。
- **[ASSUMPTION] 終日の「今日」判定は `now` の UTC 日付**: `now.slice(0, 10)` と `eventDate` を文字列比較する。`now` に `new Date().toISOString()`(UTC `Z`)を渡す前提。UTC 以東のユーザー(JST 含む)は `>=` 比較で常に正しい。UTC 以西の深夜帯だけ「今日の終日予定」を1日早く落としうる。呼び出し側がローカルオフセット付き ISO を渡せば厳密化できる(関数側は変更不要)。v1 の主ユーザーは JST なので許容。対案: 第5引数で `todayLocalDate` を受ける ── AD-6 が明示する4引数シグネチャから外れるので採らない。
- **ジェネリック返り値**: `selectFeaturedEvents<E extends FeaturableEvent>(...): E[]`。呼び出し側(Story 2.5)は `EventItem[]` を渡して `EventItem[]` を受け取り、`title` / 色ルックアップ用の `calendarId` などをそのまま使える。core は表示型を知らないまま実型を保てる。
- **`endsAt` 無しの時刻付き**: 「進行中」を判定できないので「これから始まる(`startsAt >= now`)」のみ対象。終了時刻がある予定は「終わっていない(`endsAt > now`)」= 進行中を含む。

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run test` -- `featured.test` 含め全パス
- `npm run lint` -- エラー0
- `npm run build` -- 成功(`packages/core` の tsc ビルド含む)
