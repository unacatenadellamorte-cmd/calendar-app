---
title: '月カレンダーのシフト金額と横スライド'
type: feature
created: '2026-09-17'
status: done
route: dispatch
baseline_commit: '754757de9997d77e680e5d5c4778004d061889bb'
context: []
---
<frozen-after-approval>
## Intent
月見出し（例2026年9月）の右にその月のシフト金額を表示する。月送りはホーム画面のページ送りのように、旧月と新月が横方向に入れ替わる動きにする。
## Boundaries & Constraints
ホームの給料見込みと同じ暦月・休憩・時給の計算を再利用。ロック中のシークレット予定を除外する。通貨は円。集計値や予定を新たに保存しない。スワイプ方向は左で翌月、右で前月。短いタップ・長押し・週折りたたみ・縦スクロールを維持する。動きを減らすOS設定を尊重する。
</frozen-after-approval>
## Code Map
- src/features/pay/model/usePayEstimate.ts: ホーム用の月別集計。共通純粋関数に抽出し、ホームとカレンダーで利用。
- src/features/calendar/ui/CalendarScreen.tsx: unlockedEvents、cal.calendars、cursorから対象月の合計を求めDateNavへ渡す。
- src/features/calendar/ui/DateNav.tsx: 月のときのみ見出し右に金額。狭い画面で日付と金額が潰れないレイアウト。
- src/features/calendar/ui/MonthView.tsx: スワイプは現在touchstart/endのみ。旧月グリッドの無操作スナップショットと新月グリッドを横スライドさせる。指移動への追従、閾値未満の復帰、cancel処理を追加。
- src/styles/global.css: 既存月フェードを本件では使わず横移動。reduce motion対応。
## Tasks & Acceptance
- [x] 月別金額の共通計算とDateNavへの表示・配線。追加・削除・月変更時に再計算する。
- [x] 月送りの方向に応じて旧月が退出し新月が入る横アニメーション。日付選択だけでは月送りアニメーションを発生させない。
- [x] 月境界・ゼロ件・秘密予定・月送り・操作回帰を検証する。
- [x] 型検査、lint、関連テスト、Androidビルド・実機確認。
Given 対象月にシフトがある, when 月カレンダーを開く, then ホームと同じ合計が年月の右に出る。
Given 月カレンダー, when 左右スワイプ, then 対応する隣月へ横スライドし、月と合計が一致する。
Given 縦スクロールや短い横ドラッグ, when 指を離す, then 月を誤変更しない。
## Implementation Notes
ユーザーの既存許可に従い承認待ちを挟まず実装。無関係な未追跡ファイルは維持する。定型的な金額表示部分を低コストサブエージェント、ジェスチャー設計・統合をメインが担当。同じセッション内で検証を回収する。

## 検証
- 全107ファイル876テスト成功。秘密シフトの金額除外を追加後、関連54テスト成功。
- npm run typecheck、npx eslint src packages成功。npm run lintは無関係な未追跡docs/store-kitの外部GSAPで458エラー（本件変更対象外）。
- Android 1.0.9/versionCode10をビルド・更新インストール。実機の年月右金額、ホームと同額、横方向ドラッグ追従、左で翌月/右で前月のtransform、退出コピーの消去を確認。
- 短い日付タップ→7日分表示、Android戻る→月表示、長押し→予定追加レイヤーを実機確認。予定データは変更せず。
- 画像: ../出力画像/20260917_multi-calendar-month-pay.png。
## Review Triage Log
費用節約方針に従い定型金額実装をlunaへ、動作の読取レビューを1エージェントへ委任。メインが全差分と統合動作を確認。
- medium: 月送り中の再ロックで退出コピーに秘密予定が最大300ms残る。byDay変更をcontentVersionとしてコピーを即時破棄、古い版を再利用しない。回帰テスト成功。
- medium: 連続ドラッグ中は既存CSSアニメーションがtransformを上書きする。ドラッグ開始時に旧アニメーションとコピーを終了。回帰テスト成功。
- メイン確認: 金額のaria-hiddenを除去し既存翻訳キーの読み上げラベルを使用。月別集計はホームの条件を保持。
