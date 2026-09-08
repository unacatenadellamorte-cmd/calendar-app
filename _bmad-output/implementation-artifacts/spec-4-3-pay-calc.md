---
title: 'Story 4.3: 実働時間の計算(packages/core pay-calc)'
type: 'feature'
created: '2026-09-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd14de3904cb32665ced86458444fd89031442fcf'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** シフトの実働時間を求める関数が無い。給料見込み(Story 4.4)がプラットフォーム非依存で一貫するには、計算を `packages/core` の純関数1つに置く必要がある(FR-13 / AD-7 / AD-8)。

**Approach:** `packages/core/src/pay.ts` に `workedMinutes` を実装する。副作用・I/O なし。UTC の時点(ISO)で受け取り、`終了 − 開始 − 休憩`(分)を返す。終了が開始以前(日またぎ)なら終了を +24h して通算し、分割しない。

## Boundaries & Constraints

**Always:**
- `packages/core/src/pay.ts` に実装、`index.ts` から re-export。core は何も import しない葉のまま(標準ライブラリのみ)。副作用・I/O なし。
- `workedMinutes(startsAt: string, endsAt: string, breakMinutes: number): number` ── `Date.parse` で両端の時点(ms)を取り、`end <= start` なら `end += 24*60*60*1000`。実働分 = `Math.round((end - start) / 60000) - breakMinutes`。
- クランプしない(`実働 = 終了 − 開始 − 休憩` をそのまま返す)。休憩過大で負になりうるのは呼び出し側(Story 4.4)の判断に委ねる。
- `startsAt` / `endsAt` が `Date.parse` で `NaN` になる場合は `NaN` を返す(core の既存スタイル: 正規入力を信頼、`compareEventsForList` も無ガードで `Date.parse`)。
- 通常シフト・休憩控除・日またぎ・ちょうど同時刻(= 24h 扱い)の単体テスト(規約: テスト、NFR10)。

**Never:**
- 給料額の計算(`実働 × 時給`)・月次集計 ── Story 4.4。
- タイムゾーン変換・暦月の判定 ── 呼び出し側の責務(AD-7: 計算は UTC 差分)。
- テンプレの `templateWorkedMinutes`(Story 4.1、HH:MM 文字列が対象)との統合。別ドメイン。
- `src/` 側の変更、`formatMinutes` の変更。

## I/O & Edge-Case Matrix

| Scenario | Input | Expected |
|---|---|---|
| 通常シフト | `09:00Z` → `17:00Z`、休憩 0 | 480 |
| 休憩控除 | `09:00Z` → `17:00Z`、休憩 60 | 420 |
| 日またぎ(同日 ISO で end < start) | `2026-09-08T13:00:00Z` → `2026-09-08T05:00:00Z`、休憩 60 | (16h - 1h) = 900 |
| 日またぎ(正しい timestamp で end > start) | `2026-09-08T13:00:00Z` → `2026-09-09T05:00:00Z`、休憩 60 | 900(+24h 加算は発火しない) |
| ちょうど同時刻 | `10:00Z` → `10:00Z`、休憩 0 | 1440(24h 扱い) |
| 休憩が実働以上 | `09:00Z` → `10:00Z`、休憩 120 | -60(クランプしない) |
| ミリ秒・オフセット表記 | `...+09:00` / `...Z` 混在 | 瞬間で計算(書式非依存) |

</frozen-after-approval>

## Open Questions

*(なし)*

## Code Map

- `packages/core/src/priority.ts` -- `Date.parse` の瞬間比較の手本(書式差に強い)。
- `packages/core/src/featured.ts` -- `packages/core` 内での相互 import の書き方(`./priority`)。pay は何も import しない。
- `packages/core/src/index.ts` -- re-export の並び。「後続ストーリーで実装: pay-calc」コメントを消化。
- `packages/core/src/index.test.ts` / `priority.test.ts` -- テストの手本。
- `packages/core/tsconfig.json` -- `include: ["src"]`、`**/*.test.ts` 除外。新ファイルは自動。

## Tasks & Acceptance

**Execution:**
- [x] `packages/core/src/pay.ts` -- `workedMinutes(startsAt, endsAt, breakMinutes)`: `Date.parse` → `end <= start` で +24h → `Math.round((end-start)/60000) - breakMinutes`
- [x] `packages/core/src/index.ts` -- `export { workedMinutes } from './pay';`。冒頭コメント更新
- [x] `packages/core/src/pay.test.ts` -- I/O マトリクスの各行(通常 / 休憩控除 / 日またぎ2種 / 同時刻 / 休憩過大 / 書式混在)

**Acceptance Criteria:**
- Given シフト(開始 / 終了 / 休憩分), when `workedMinutes` を呼ぶ, then 実働時間 = 終了 − 開始 − 休憩(分)。終了が開始以前なら終了を翌日として通算し分割しない
- Given `packages/core` の pay-calc, when `npm run test`, then 通常シフト・休憩控除・日またぎの単体テストが揃い全パスする
- Given `npm run typecheck` / `lint` / `test` / `build`, when 実行, then すべて成功する

## Implementation Notes

- `packages/core/src/pay.ts`: `workedMinutes(startsAt, endsAt, breakMinutes)` = `Date.parse` の瞬間差 −休憩。`end <= start` なら `end += 24h`(壁時計の日またぎ / 同時刻 24h 扱い)。クランプなし。core は何も import しない。
- `index.ts` の「後続ストーリーで実装: pay-calc」を「給料見込みの月次集計(Story 4.4)」に更新。
- core 33 tests(pay 7)。全体 296 tests。

## Spec Change Log

*(なし。bad_spec / intent_gap ループバックなし。)*

## Review Triage Log

*step-04 レビュー(blind-hunter / edge-case-hunter / verification-gap の3レンズを本セッションで実施。Blind Hunter floor N=3。loopback・patch なし)。*

| 所見 | 検証 | 判定 | 対応 |
| --- | --- | --- | --- |
| `breakMinutes` が負だと実働に加算されてしまう(無ガード) | Story 4.1 のテンプレ検証で `break >= 0` を強制、4.2 のシフト実体もそこからコピー。core は正規入力を信頼する設計 | low | reject(呼び出し前に保証済み。core スタイルと整合) |
| `NaN` 入力で `NaN` を silently 返す | spec の Always に明記(`compareEventsForList` も無ガード `Date.parse`)。garbage in garbage out の契約 | low | reject(文書化済み・意図的) |
| `workedMinutes` が負を返しうるが、既存 `formatMinutes` は負で throw する | 別関数。spec Never で `formatMinutes` は触らない。負のハンドリングは Story 4.4 の責務(¥0 表示等) | low | reject(4.4 で対応。4.3 のスコープ外) |
| 24h 超のシフト(壁時計で >24h)は表現できない | シグネチャ上 end は1回しか +24h されない。v1 のシフトは <24h 前提 | low | reject(スコープ外。稀) |

## Verification

**Commands:**
- `npm run typecheck` -- 型エラー0
- `npm run test` -- `pay.test` 含め全パス
- `npm run lint` -- エラー0
- `npm run build` -- 成功(`packages/core` の tsc ビルド含む)
