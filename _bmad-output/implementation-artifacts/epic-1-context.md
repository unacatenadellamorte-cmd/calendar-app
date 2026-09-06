# Epic 1 Context: 自分の予定をカレンダーで管理する(+ 基盤)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

ユーザーがログイン(またはお試しのまま)でアプリを使い始め、カレンダーを作り、予定を作成・編集・削除し、月 / 週 / リストで見られ、PWA としてインストールできる状態を届ける。同時に、以降のすべてのエピックが載る土台 ── Vite + React SPA + Supabase のモノレポ、デザイントークン、下タブのアプリシェル、data-access レイヤ、オフライン用ローカルキャッシュ ── を「動くカレンダー」という最初のユーザー価値と一緒に立ち上げる。基盤だけの価値なしエピックにはしない。

## Stories

- Story 1.1: プロジェクト基盤とアプリシェル
- Story 1.2: メール+パスワードのアカウントとお試しモード
- Story 1.3: カレンダーの作成・管理
- Story 1.4: ローカル予定の作成・編集・削除
- Story 1.5: 月 / 週 / リストのカレンダー表示
- Story 1.6: PWA インストールとオフライン閲覧
- Story 1.7: データの JSON エクスポート

## Requirements & Constraints

- 予定は「タイトル / 開始・終了 または終日 / メモ / 所属カレンダー」を持つ。開始が終了より後は保存不可。終日予定は時刻を持たない。削除は確認 → 一定時間 Undo を提示。
- カレンダーはローカルカレンダー(このアプリで作成)を作成・改名・色変更・削除できる。一覧は各行の source(ローカル / 外部)を明示。「シフト用カレンダー」が初回に1つ自動作成され、改名・色変更はできるが削除できない。
- 月 / 週 / リストの3ビューを切り替えられ、任意の日付へ移動できる。表示オンのカレンダーの予定がどのビューでも見える。
- 週ビューは v1 では「1日タイムライン + 前日/翌日スワイプ」に割り切る(複数日横並びは将来)。
- 未ログインでもローカルカレンダー・予定の作成と閲覧はできる。外部接続(将来のエピック)にはログインが必要。ログアウト可。
- JSON エクスポートはローカルで作成したデータのみを含む(取り込んだ外部予定は含めない)。お気に入りシフトは Epic 4 で登録機能ができ次第、同じエクスポートに追加。
- PWA としてインストール可能(マニフェスト・アイコン・スプラッシュ)。オフラインでローカルキャッシュのデータを閲覧できる。
- スマホ縦を基準に単一カラム。タブレット / PC 幅では月ビューを広く使う。
- アクセシビリティ: AA コントラスト(通常 4.5:1 / 大 3:1)、タップターゲット 44px 以上、Reduce Motion 尊重、色だけで意味を運ばない(予定チップは色バー + カレンダー名をセットで表示)。
- トーンは静か: 感嘆符・達成演出・ストリーク・再エンゲージ通知を入れない。文言は簡潔・体言止め。
- 反スコープ: 優先度・選抜(Epic 2)、外部カレンダー取り込み(Epic 3)、シフト入力・給料計算(Epic 4)はこのエピックには含まない。

## Technical Decisions

- **パラダイム**: BaaS 上のレイヤード SPA。フロントのレイヤは UI → view-model(hooks)→ data-access → 外部。書き込みは必ず data-access リポジトリ関数経由(UI / hooks から直接 supabase-js を呼ばない)。
- **モノレポ構成**: `packages/core`(純粋ドメイン: 何も import しない、フロント + Edge Function 共有)、`src/features/*`(ui + model)、`src/data`(data-access + ローカルキャッシュ + 書き込みキュー)、`src/ui`(汎用コンポーネント)、`src/app`(シェル・ルーティング)、`supabase/migrations`、`supabase/functions`。
- **スタック**: Vite(7 目安)+ React 19 + TypeScript 5 + Tailwind CSS 4。Supabase(Postgres 15+ / Auth / Edge Functions(Deno)/ pg_cron)。PWA は vite-plugin-pwa(Workbox)。
- **データ所有**: Supabase Postgres が真実の源。クライアントの IndexedDB は表示専用の複製 + 書き込みキュー。全テーブルに `user_id` と RLS(`user_id = auth.uid()`)。
- **依存方向**: UI → view-model → data-access → 外部。逆流禁止。`packages/core` は葉(標準ライブラリのみ)。
- **命名**: DB は snake_case、TS は camelCase、変換は data-access のみ。型名は `Calendar` / `EventItem`(`Event` は DOM と衝突するため回避)/ `ShiftTemplate`。ID は UUID v4(DB 生成)。
- **時刻**: 時刻付きは `timestamptz`(UTC)保存、表示・入力時にユーザーのタイムゾーンへ変換。終日は `date`(TZ 無し)。
- **論理削除**: 削除は `deleted_at` を立てる。data-access の共通ヘルパで全読み取りが `deleted_at IS NULL` を強制。
- **エラー形**: data-access は `Result<T, AppError>` を返す(throw しない)。`AppError = { kind, messageKey }`。UI は `messageKey` を Voice の文言に対応づける。
- **状態変更**: 楽観更新 → 失敗時ロールバック。オフラインは順序保持の書き込みキュー → オンライン復帰でフラッシュ。
- **認証**: Supabase Auth(メール+パスワード。Google は Epic 3)。
- **テーブルはストーリー単位で作成**: `calendars` は 1.3、`events`(nullable なシフト用カラム群を含む)は 1.4。前倒しの一括作成はしない。
- **テスト**: `packages/core` は単体テスト必須。data-access は `supabase start` のローカルで結合テスト。
- **デプロイ**: SPA は静的ホスティング。DB マイグレーションと Edge Functions は Supabase CLI 管理。シークレットは Supabase 側。prod 1 + ローカル開発のみ(ステージングなし)。

## UX & Interaction Patterns

- **IA**: 下タブ3つ(ホーム / カレンダー / 設定)。ドロワー・ハンバーガーなし。モーダル / シートは1段まで。カレンダー管理画面はホームの見出しから1タップ(タブには入れない)。
- **デザイントークン**: `DESIGN.md` frontmatter の colors(light + dark、アクセントは青1色 `#2563EB` / dark `#6AA0FF`)、typography(amount / title / body / meta)、spacing(4/8/12/16/24/32)、rounded(6/10/16)を CSS 変数 + Tailwind に落とす。テーマは `:root` + `prefers-color-scheme` + 明示切替(端末追従 / ライト / ダーク)。
- **コンポーネント(このエピックで作る)**: `month-cell`(7列グリッド、今日はアクセントのリング、「他 N 件」で畳む・展開)、`week-timeline`(1日タイムライン、時刻軸、現在時刻ライン、空きスロットタップで追加)、`event-chip`(カレンダー色バー必須 + 時刻 + タイトル)、`calendar-row`(色ドット + 名前 + source ラベル + 表示トグル。優先度 UI は Epic 2)。
- **状態パターン**: 初回・データなし(「カレンダーを接続」「予定を追加」の2入口)、オフライン(ローカルは通常表示 + 取り込み系に「オフライン」表示)、破壊的操作(影響を明示 + 削除後 Undo)、フォーカス(ブラウザ標準のフォーカスリング、消さない)。
- **マイクロコピー**: 「10:00 役員会議」/「Googleカレンダーを接続」/「このシフトを削除しますか」。感嘆符・励まし・エラーコードの露出はしない。
- **インタラクション**: タップで開く / 実行。月・週は横スワイプで前後移動。ホーム / カレンダーは引っ張って更新。リスト行はスワイプ削除(確認付き)。長押しはその日にすばやく追加(Epic 4 で使用)。

## Cross-Story Dependencies

- Story 1.1(基盤・シェル・トークン)がすべての前提。以降は 1.1 → 1.2 → … の順で、各ストーリーは前のストーリーの成果物のみに依存する。
- Story 1.3(`calendars`)は Story 1.4(`events`。予定は所属カレンダーを持つ)の前提。
- Story 1.5(表示)は 1.3 + 1.4 の後。
- Story 1.7(エクスポート)は 1.3 + 1.4 の後。Epic 4 Story 4.1 で shift_templates をこのエクスポートに追加する(1.7 は 4.1 なしで完結)。
- Epic 2 / 3 / 4 はこのエピックの `calendars` / `events` / カレンダー表示基盤の上に載る。
