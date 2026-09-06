# 入力照合 — PRD / UX → アーキテクチャスパイン

## 結論

PRD の 17 FR すべてが Capability→Architecture Map でモジュールと AD に対応。UX の挙動(優先度=並べ替え、選抜の一貫性、色非依存)も AD に反映。落ちた要件は無し。PRD の未解決論点は Deferred / Open に引き継ぎ。

## 主要な対応

| 入力側の要求 | スパインでの反映 |
|---|---|
| PRD §9-4 データ保管を最初に決める | AD-1 [ADOPTED] Supabase クラウド(ユーザー選択) |
| PRD FR-4 取り込みは読み取り専用・冪等・カレンダー単位の失敗表示 | AD-2, AD-4 |
| PRD §8.3 最小スコープ・トークンを第三者に渡さない・接続解除でデータ削除 | AD-3、Conventions(秘匿情報・ロギング) |
| PRD FR-9 選抜は1か所で実装、画面/ウィジェット/通知が同じ結果 | AD-6(純関数、正規入力型、`now` は引数) |
| PRD FR-13 日をまたぐシフトを分割せず通算 | AD-7(UTC 差分計算) |
| PRD FR-14 集計値を保存しない(明細とずれない) | AD-8 |
| UX: 優先度の設定 = ドラッグ並べ替え、全カレンダー一意 | AD-5(unique 制約 + 単一 RPC) |
| UX: data-access レイヤ越し、UI から直接 supabase-js を呼ばない | AD-9 |
| PRD §9-1 選抜ロジックの全体規則が未確定 | AD-6 の純関数で差し替え可能に。Deferred に明記 |
| PRD §8.1 将来 Capacitor 化(ウィジェット/通知/端末カレンダー) | Deferred。`packages/core` 共有で選抜を再利用可能に |

## gap / 注意

- **フロント形態(Vite SPA vs Next.js 16)** は PRD/UX に指定がなく、スパインで [ASSUMPTION] を置いた(Vite SPA + Supabase)。addendum の第一候補(Next.js 踏襲)からは逸れる。→ 最初のスプリント前に確定を推奨。
- PRD addendum の「Supabase + Next.js + Capacitor(human-book 踏襲)」のうち、Next.js の部分だけスパインで対案(Vite)に振っている。理由は memlog と review-tech-verification.md に記録。
