---
name: "カレンダーアプリ(仮)"
description: "埋もれないカレンダー。静かで素直、カレンダーの色が主役、青のアクセント1色。Googleカレンダー的な見やすさ + シフカレ的な入力の軽さ。"
status: final
updated: 2026-09-06
colors:
  surface-base: '#FFFFFF'
  surface-sunken: '#F4F5F7'
  surface-raised: '#FFFFFF'
  ink-primary: '#1A1C1E'
  ink-secondary: '#585F68'
  ink-disabled: '#A0A6AD'
  accent: '#2563EB'
  accent-weak: '#EAF1FF'
  on-accent: '#FFFFFF'
  border-hairline: '#E3E6EB'
  danger: '#BE3B30'
  surface-base-dark: '#16181C'
  surface-sunken-dark: '#0F1113'
  surface-raised-dark: '#1E2126'
  ink-primary-dark: '#E6E8EB'
  ink-secondary-dark: '#9AA1A9'
  ink-disabled-dark: '#5B616A'
  accent-dark: '#6AA0FF'
  accent-weak-dark: '#1C2740'
  on-accent-dark: '#0F1113'
  border-hairline-dark: '#2A2E35'
  danger-dark: '#E3776B'
typography:
  family:
    note: '-apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif'
  amount:
    note: '約28px / semibold / tabular-nums — 給料見込みの金額'
  title:
    note: '約20px / semibold — 画面見出し、コンパクトビューの筆頭予定'
  body:
    note: '約15px / regular — 予定タイトル、本文'
  meta:
    note: '約13px / regular — 時刻、カレンダー名、日付ラベル、状態テキスト'
rounded:
  sm: 6px
  md: 10px
  lg: 16px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 24px
  '6': 32px
components:
  - compact-card
  - month-cell
  - week-timeline
  - event-chip
  - calendar-row
  - shift-template-chip
  - pay-card
  - quick-shift-sheet
  - connection-card
---

## Brand & Style

このアプリの一点物の価値は「カレンダーごとの優先度が表示に効く」こと。デザインはそれを邪魔しない方向に振る ── **静かで、素直で、カレンダーそのものの色が主役**。アプリのクロム(バー、ボタン、枠)は最小限の存在感にとどめ、画面の色情報はできるだけユーザーのカレンダーの色に譲る。

`[ASSUMPTION: 全体の方向はミニマル・静か。ユーザーの「Googleカレンダーの見やすさを参考にしたい」という回答から推定。装飾・過剰アニメは足さない。]`

参照する2つの製品:
- **Googleカレンダー** ── 月/週ビューの標準的なレイアウト、色での識別、素直なナビゲーション。奇をてらわない。
- **シフカレ** ── お気に入りシフトを日付にワンタップで置く入力の軽さ。ここだけは体験として真似る。

避けること(PRD の反指標 SM-C1 / SM-C2 由来):
- 優先度の「効き方」を細かく設定させる UI。優先度は順位ひとつ、効き方は固定。
- 給料計算の割増・締め日設定を v1 の画面に出す。
- ストリーク、再エンゲージ通知、達成バッジ。カレンダーは道具であって、急かす相手ではない。

## Colors

パレットは意図的に絞る。画面の彩度は「ユーザーのカレンダーの色」が持ち、アプリは無彩色 + 青1色でできている。

- **Surface（`#FFFFFF` / dark `#16181C`）** ── 予定やカードが乗る面。
- **Sunken（`#F4F5F7` / dark `#0F1113`）** ── アプリ背景、月グリッドの余白。面より一段沈める。
- **Ink Primary / Secondary / Disabled** ── テキストの3階層。時刻やカレンダー名は Secondary。
- **Accent（`#2563EB` / dark `#6AA0FF`）** ── 唯一の有彩色。主ボタン、選択状態、今日のリング、フォーカス。装飾には使わない。
- **Accent Weak（`#EAF1FF` / dark `#1C2740`）** ── 選択中の日、アクティブなチップの下地。
- **Hairline（`#E3E6EB` / dark `#2A2E35`）** ── 月グリッドのマス目、リストの区切り。最も低いコントラストで。
- **Danger（`#BE3B30` / dark `#E3776B`）** ── 破壊的操作の確認だけ。エラー全般には使わない(状態テキストで伝える)。

**カレンダーの色(パレット外)** ── 各カレンダーは自分の色を持つ。ローカルカレンダーの新規作成時は、色覚に配慮した10色前後のプリセットから選ぶ。取り込んだ外部カレンダーは元サービスの色をそのまま尊重する。**色だけで意味を運ばない** ── 予定チップは必ず色バー + カレンダー名(または頭文字)をセットで表示する(§Components / EXPERIENCE.md Accessibility Floor)。

`[ASSUMPTION: 具体的な hex 値、カレンダー色プリセットの内容は仮。Finalize のモックで詰める。]`

## Typography

Web アプリ。フォントはシステムスタック + 日本語フォールバック: `-apple-system, "Segoe UI", Roboto, "Hiragino Sans", "Noto Sans JP", sans-serif`。

| トークン | 用途 | 目安 |
|---|---|---|
| `amount` | 給料見込みの金額 | 約28px / semibold / tabular-nums |
| `title` | 画面見出し、コンパクトビューの筆頭予定 | 約20px / semibold |
| `body` | 予定タイトル、本文、入力欄 | 約15px / regular |
| `meta` | 時刻、カレンダー名、日付、状態テキスト | 約13px / regular |

- 数字(時刻・金額・日付)は tabular-nums で桁を揃える。
- 全角の見出しは詰めすぎない。行間は本文 1.6 目安。
- すべて相対単位(rem)。ブラウザ/OS の文字サイズ設定を尊重し、最大設定でも切れない。
- 大文字化・字間の演出はしない。

## Layout & Spacing

- スケール: 4 / 8 / 12 / 16 / 24 / 32 px。密に関係する要素ほど小さいギャップ、画面の主要ブロック間は大きいギャップ。
- 基準はスマホ縦・単一カラム。画面横端の余白は 16px。
- **月ビュー** は 7 列グリッド。セルの高さは可変で、入る予定数で伸びる(はみ出しは「他 N 件」)。
- **週ビュー** は左に時刻軸、右に1日分のタイムライン(v1 は 1 日表示。複数日横並びは v2)。 `[ASSUMPTION: 週ビューはまず「1日タイムライン」。§Do's and Don'ts]`
- モーダル/シートは1段まで。2段重ねない。
- 下タブバーは3つ(ホーム / カレンダー / 設定)。ドロワー・ハンバーガーは使わない。

## Elevation & Depth

影は階層表現に使わない。カード同士は色調(surface vs sunken)と hairline で分ける。影を許すのはボトムシートとモーダルだけ ── 「手前に浮いて出てきた」という物理的な合図としてのみ。今日のセルや選択中の日は、影ではなくアクセント色のリング/下地で示す。

## Shapes

- `rounded/sm`(6px) ── 入力欄、予定チップ、リスト行。
- `rounded/md`(10px) ── カード(コンパクトビュー、給料見込み、接続カード)。
- `rounded/lg`(16px) ── ボトムシート上端。
- ピル形(全丸)は「お気に入りシフトのチップ」と「今日」バッジだけ。それ以外の面は角丸どまり。
- 画像・アバターはコンテナの角丸に合わせる。

## Components

視覚仕様。挙動は EXPERIENCE.md.Component Patterns。図示: `mockups/key-home.html`(compact-card, pay-card)、`mockups/key-month.html`(month-cell, event-chip, quick-shift-sheet)、`mockups/key-week.html`(week-timeline)、`mockups/key-calendars.html`(calendar-row, connection-card)。矛盾時はこの Spine が勝つ。

- **compact-card** ── ホームの主役。`surface-raised` / `rounded/md`。筆頭の代表予定を `title`、時刻を `meta`、その下に次点を最大2件、1件ずつ独立した行で。各行の左端にカレンダー色の細いバー。予定ゼロなら1行の静かなテキスト。
- **month-cell** ── 7列グリッドの1マス。日付を左上に `meta`。今日はアクセントのリング。中に **event-chip** を優先度順に積み、入りきらない分は最下部に「他 N 件」を `meta` / `ink-secondary` で。
- **week-timeline** ── 1日分の時間軸。時間が重なる予定は左端から優先度順に並べ、並べきれない場合は優先度が高いものを前面に。
- **event-chip** ── 予定1件。左に**カレンダー色のバー(必須)**、次に時刻 `meta`、タイトル `body`。外部取り込みの予定は右端に小さな取り込みアイコン。`rounded/sm`。塗りつぶしは使わず、色はバーだけが持つ。
- **calendar-row** ── カレンダー管理画面の1行。左にドラッグハンドル、色ドット、カレンダー名 `body`、source ラベル(ローカル / Google)`meta`。右に表示トグル。行の並び順がそのまま優先度で、左端に順位番号。
- **shift-template-chip** ── お気に入りシフト。ピル形。シフト名 + 時間帯を `meta`。テンプレの色を薄い下地に。
- **pay-card** ── 当月の給料見込み。`surface-raised` / `rounded/md`。金額を `amount`、月ラベルと「◯件のシフト」を `meta`。前月/翌月の切り替え矢印。
- **quick-shift-sheet** ── 日付をタップしたときに下から出るシート。登録済みの **shift-template-chip** を横スクロールで並べ、タップ1回でその日にシフトを作成。「予定を追加」への切り替えもここに。
- **connection-card** ── 「Googleカレンダーを接続」の誘導、および接続済みアカウントの状態(最終同期時刻、失敗表示、再試行、解除)。

## Do's and Don'ts

| Do | Don't |
|---|---|
| 有彩色は青1色。ボタン・選択・今日・フォーカスのみ | カレンダー色以外の色を状態バッジや装飾に足す |
| 予定は「色バー + カレンダー名」をセットで示す | 色だけで所属カレンダーを表す |
| 階層は余白と文字で。影はシート/モーダルのみ | カードに影を付けて浮かせる、グラデーション |
| 月/週はGoogleカレンダー的な素直なレイアウト | 独自の凝ったカレンダー表現、カルーセル |
| 状態はテキストで静かに伝える(「この後の予定なし」) | 感嘆符、達成演出、ストリーク、再エンゲージ通知 |
| 週ビューは v1 では1日タイムラインに割り切る | v1 で複数日横並び・週7列タイムラインまで作り込む |
| 優先度は「順位」ひとつ。効き方は固定 | 優先度の重み・ルールを設定画面で刻ませる |
