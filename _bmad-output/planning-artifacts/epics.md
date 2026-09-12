---
stepsCompleted: [step-01, step-02, step-03, step-04, epic5-step-01, epic5-step-02, epic5-step-03, epic5-step-04]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-calendar-app-2026-09-06/prd.md
  - _bmad-output/planning-artifacts/prds/prd-calendar-app-2026-09-06/addendum.md
  - _bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-calendar-app-2026-09-06/EXPERIENCE.md
  - _bmad-output/planning-artifacts/architecture/architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-calendar-app-epic5-2026-09-12/ARCHITECTURE-SPINE.md
---

# カレンダーアプリ(仮) - Epic Breakdown

> 注: このワークスペースは独立プロジェクト(calendar-app/ 自身の `_bmad-output/`)。旧メモにある「epics-calendar-app.md」という名前は共有ワークスペース時代の名残で、実体はこの `epics.md`。

## Overview

カレンダーアプリ(仮)v1(Web / PWA、FR-1〜17)+ Epic 5「スマホアプリ化」(FR-18〜20)の、PRD・UX スパイン(DESIGN.md / EXPERIENCE.md)・アーキテクチャスパイン(v1: AD-1〜10 / Epic5: AD-11〜18)を実装可能なストーリーへ分解する。v1(Epic 1〜4)は実装・実機受け入れ・レトロまで完了済み(2026-09-11)。以下は Epic 5 の追加分。

## Requirements Inventory

### Functional Requirements

FR1: ローカル予定の作成・編集・削除(タイトル / 開始・終了 or 終日 / メモ / 所属カレンダー。開始>終了は不可。削除は確認 + 一定時間 Undo)
FR2: カレンダー表示の切り替え(月 / 週 / リスト。任意の日付へ移動。表示オンのカレンダーの予定がどのビューでも見える)
FR3: 外部接続(Google カレンダー)— OAuth 接続、取り込むカレンダーを選択、個別オン/オフ、接続解除
FR4: 取り込み(定期同期。読み取り専用で編集 UI を出さない。最終取り込み時刻の表示、手動「今すぐ取り込み」、カレンダー単位の失敗表示)
FR5: カレンダーの管理(ローカルカレンダーの作成・改名・色変更・削除。全カレンダー一覧に source を明示。「シフト用カレンダー」は既定で1つ、削除不可)
FR6: カレンダーごとの優先度設定(ドラッグ等で順位づけ。全カレンダーで一意。新規/取り込みは既定で最下位。変更は並び・選抜へ即時反映)
FR7: 予定の視覚的な優先表示(週で重なる予定は優先度が高いものを左端/前面。月で入りきらない分は優先度順に見せ「他 N 件」に畳む)
FR8: 優先度順の並び(カレンダー一覧・予定リスト・コンパクトビュー。同一日時は優先度が高いカレンダーが上。変更は再読み込みなしで反映)
FR9: 代表予定の選抜(コンパクトビュー用。今日以降 / 進行中のみ、優先度→開始時刻順、終日は後、件数上限で打ち切り。0件時は「次の予定なし」。選抜は1か所で実装)
FR10: コンパクトビュー画面(代表予定を低情報密度で優先度順表示。カレンダー名・色・時刻。タップで該当日へ。表示件数 1〜3 を設定)
FR11: お気に入りシフトの登録(名前・開始・終了・休憩分・時給・勤務先ラベル・色。数値バリデーション)
FR12: ワンタップ・シフト入力(日付を選び、お気に入りシフトを1つ選ぶだけで作成。連続日一括適用。作成後の個別上書き編集)
FR13: シフトの実働時間計算(終了−開始−休憩。日をまたぐ場合は翌日として通算、分割しない。分単位保持)
FR14: 当月の給料見込み(その月のシフトの実働時間 × 時給 の合計。暦月。シフトごとの時給差を合算。0件時 ¥0)
FR15: トップ画面での見込み表示(追加操作なしに当月を確認。前月・翌月へ切替。シフト変更で即時更新)
FR16: サインアップ / ログイン(未ログインでもローカル予定の作成・閲覧は可。Google 接続にはログイン必須。ログアウト可)
FR17: データの持ち出し(ローカルのカレンダー・予定・お気に入りシフトを JSON エクスポート。取り込んだ外部予定は含めない)

**Epic 5(スマホアプリ化、2026-09-12 追加)**

FR18: ホーム画面ウィジェット(選抜ロジック FR-9 の結果をそのまま表示。カレンダー名・色・開始時刻。サイズで1/2/3件可変。タップで該当予定/日へ。Android・iOS 両対応)
FR19: 端末カレンダーの取り込み(スマホ本体(OS)のカレンダーを Google と同様の「外部接続」として選択制で取り込み。読み取り専用。優先度がそのまま効く)
FR20: リマインダー通知(予定ごとに個別のリマインダー通知を任意設定。既定オフ。プリセット10分/30分/1時間前 + ユーザー定義。ローカル通知のみ。編集/削除に追従)

### NonFunctional Requirements

NFR1: 最小権限 — Google 連携で要求する OAuth スコープはカレンダー読み取りに必要な最小限のみ。書き込み・連絡先等を要求しない。(FR3、PRD §8.3)
NFR2: 読み取り専用 — 取り込んだ外部予定を、このアプリが外部サービスへ書き戻す・変更する経路を持たない。(FR4、AD-2)
NFR3: 接続解除でデータを残さない — 外部接続を解除したら、そのアカウント由来の取り込み予定をローカルから削除する。(FR3)
NFR4: 第三者へ渡さない — 取り込んだカレンダー内容・予定本文を、広告その他の目的で外部送信しない。ログにも予定本文・メール・トークンを書かない。(PRD §8.3、AD-3)
NFR5: データ分離 — ユーザーごとにデータを分離(全テーブル RLS)。provider_refresh_token はサーバー側のみで保持し、クライアント・キャッシュ・ログに出さない。(AD-1、AD-3)
NFR6: プラットフォーム — スマホブラウザ最適化、PWA としてインストール可、オフラインでローカルデータの閲覧が可能。(PRD §8.1、EXPERIENCE.md Responsive & Platform)
NFR7: アクセシビリティ — WCAG AA(通常 4.5:1 / 大 3:1)。色だけで意味を運ばない。並べ替えにドラッグ以外のキーボード操作を必ず用意。タップターゲット 44px 以上。Reduce Motion 尊重。スクリーンリーダーの読み上げ順 = 優先度順。(EXPERIENCE.md Accessibility Floor)
NFR8: シフト1件の入力が、テンプレ利用時3タップ以内で完了する。(PRD SM-3)
NFR9: 当月の給料見込みが、トップ画面で追加操作なしに確認できる。(PRD SM-4)
NFR10: 優先度・選抜の設定項目を増やさない。優先度は「順位」ひとつ、効き方は固定。(PRD SM-C1)
NFR11: v1 に給料計算オプション(割増・締め日・勤務先別・年別)を足さない。(PRD SM-C2)
NFR12: 静かなトーン — 感嘆符・達成演出・ストリーク・再エンゲージ通知を UI/コピーに入れない。(DESIGN.md、EXPERIENCE.md Voice)

**Epic 5(2026-09-12 追加)**

NFR13: 端末カレンダーも同じ3原則 — 最小権限・読み取り専用・接続解除でデータを残さない。OS の権限ダイアログで明示的に許可を得る。(FR19、PRD §8.3、AD-13)
NFR14: 通知はローカル完結 — リマインダーは端末側でスケジュールし、予定本文を外部の通知配信サーバーへ送らない。(FR20、PRD §8.3、AD-15)

### Additional Requirements

*(アーキテクチャスパイン AD-1〜10 + スタック由来。Epic 1 の基盤ストーリーに集約する)*

- **スターター/形態**: Vite + React 19 + TypeScript + Tailwind CSS 4 の SPA + Supabase(Auth / Postgres / Edge Functions / pg_cron)。2026-09-06 ユーザー確定。→ Epic 1 Story 1
- **モノレポ構成**: `packages/core`(純粋ドメイン: selection / priority / pay-calc。フロント + Edge Function 共有、何も import しない)、`src/features/*`(ui + model)、`src/data`(data-access)、`src/app`(シェル・ルーティング)、`supabase/migrations`、`supabase/functions`
- **AD-1**: Supabase Postgres が真実源。クライアントは IndexedDB の表示キャッシュ + 書き込みキュー。全テーブル `user_id` + RLS
- **AD-3 / oauth-exchange Edge Function**: Google OAuth のトークン交換と Calendar API 呼び出しは Edge Function のみ。`provider_refresh_token` は Supabase Vault / 暗号化カラム
- **AD-4 / sync-calendars Edge Function**: pg_cron スケジュール + 手動トリガ。`(connection_id, external_id)` で冪等 upsert、外部消失は論理削除。`sync_state` を「接続 × カレンダー」単位で記録
- **AD-5**: `(user_id, priority)` unique 制約 + 採番・並べ替えは単一 DB 関数(RPC)経由(フロントも Edge Function も)
- **AD-6**: `selectFeaturedEvents(events, calendarPriority, now, limit)` 純関数。`packages/core` が正規入力型(camelCase / UTC)を定義、`now` は引数
- **AD-7**: `timestamptz`(UTC)保存 / 終日は `date`。計算は UTC 差分
- **AD-8**: シフト = `events` の nullable カラム群(break_minutes / hourly_wage / workplace_label / template_id)。汎用予定編集はシフト属性を触らない
- **AD-9**: data-access レイヤ経由でのみ Supabase へ。UI/hooks から直接 supabase-js を呼ばない。`Result<T, AppError>`(throw しない)、`AppError = { kind, messageKey }`
- **AD-10**: 依存方向 UI → view-model → data-access → 外部。`packages/core` は葉
- **規約**: DB snake_case / TS camelCase(変換は data-access のみ)、UUID v4、`deleted_at` ソフトデリート(共通ヘルパで全読み取りが除外)、`EventItem` 型名(`Event` は DOM と衝突)
- **テスト**: `packages/core` は単体テスト必須。data-access は `supabase start` で結合テスト。Edge Function は Google API モックで単体
- **デプロイ**: SPA は静的ホスティング。DB マイグレーション / Edge Function は Supabase CLI。シークレットは Supabase の関数シークレット。prod 1 + ローカル開発のみ(ステージングなし)

**Epic 5(アーキテクチャスパイン AD-11〜18 由来。Epic 5 の基盤ストーリーに集約する)**

- **AD-11**: Capacitor(`@capacitor/core` 8.5.1)採用。既存 `src/`, `packages/core` は無変更のままラップ。`ios/`, `android/` ネイティブプロジェクトを追加
- **AD-12**: ウィジェット = データブリッジ(`src/platform/widget.ts`)+ ネイティブUI。`selectFeaturedEvents` の結果(上限3件、カレンダー名・色・開始時刻)を共有ストレージ(App Group UserDefaults / SharedPreferences)へ push。`capacitor-widget-bridge` 8.1.0。ネイティブUI(SwiftUI WidgetKit / Jetpack Glance)はストーリー側で実装
- **AD-13/14**: 端末カレンダーは `connections.provider='device'` 行としてモデル化(読み取り専用)。取り込みはクライアント発(`@ebarooni/capacitor-calendar`)、`packages/core` の device 用 normalizer を経由
- **AD-15**: リマインダーは `@capacitor/local-notifications`。通知IDは `events.id` から決定的に導出した符号あり32bit整数(`packages/core` に導出関数1本)。同期由来の時刻変更でも cancel/reschedule を経由
- **AD-16**: ウィジェット/通知タップは共通ディープリンク(`calendar-app://event/{id}`, `.../day/{date}`)、受け口は `src/app` に1つ
- **AD-17**: 端末カレンダーの書き込みは RLS 経由のクライアント直接 upsert。Google 専用の `service_role` RPC(`apply_calendar_sync` 等)は流用しない。`connections.provider` / `calendars.source` / `events.source` の CHECK 制約を1本のマイグレーションでリテラル `'device'` に拡張。`connection_calendars` に device 用の書き込み RLS ポリシーを追加
- **AD-18**: プロダクト識別子は暫定 `jp.ryo.calendarapp`。Bundle ID / App Group ID / ディープリンクスキームをここから導出
- **規約追加**: 権限拒否時のエラー表現は既存の `Result<T, AppError>` / `messageKey` 規約に乗せる。プラットフォーム分岐は `src/platform` 内に閉じる
- **デプロイ追加**: 署名鍵(iOS provisioning profile / Android キーストア)は Ryo 本人管理。ネイティブビルドのシークレットは Xcode/Android Studio のビルド設定ファイル経由。アプリ更新は毎回ストア審査(OTA不採用)

### UX Design Requirements

UX-DR1: デザイントークン実装 — `DESIGN.md` frontmatter の colors(light + dark、青アクセント1色 `#2563EB`/`#6AA0FF`)、typography(amount / title / body / meta)、spacing(4/8/12/16/24/32)、rounded(6/10/16)を CSS 変数 + Tailwind 設定に落とす。テーマは `:root` + `prefers-color-scheme` + 明示切替
UX-DR2: テーマ切替 UI — 端末設定に追従 + 設定画面で固定(light / dark / 端末追従)
UX-DR3: `compact-card` コンポーネント(筆頭予定 title、次点最大2件を独立行、左端にカレンダー色バー、0件時の静かなテキスト)
UX-DR4: `month-cell` コンポーネント(7列グリッド、日付左上、今日はアクセントのリング、event-chip を優先度順に積む、「他 N 件」で畳む・展開)
UX-DR5: `week-timeline` コンポーネント(1日タイムライン、時刻軸、重なる予定を優先度順に左→右配置、並べきれない時は優先度が高いものを前面、現在時刻ライン、空きスロットタップで追加)
UX-DR6: `event-chip` コンポーネント(カレンダー色バー **必須** + 時刻 + タイトル、外部取り込みは取り込みアイコン、塗りつぶさない)
UX-DR7: `calendar-row` コンポーネント(ドラッグハンドル、色ドット、名前、source ラベル、右にトグル、左に順位番号、ドラッグ代替の ▲▼)
UX-DR8: `shift-template-chip` コンポーネント(ピル形、シフト名 + 時間帯、テンプレ色の薄い下地)
UX-DR9: `pay-card` コンポーネント(金額 amount / tabular-nums、月ラベル + 件数、前月/翌月矢印)
UX-DR10: `quick-shift-sheet` コンポーネント(ボトムシート1段、テンプレを横スクロール、タップ1回で作成しシートを閉じる、「予定を追加」タブへ切替、テンプレ未登録時は作成を促す)
UX-DR11: `connection-card` コンポーネント(未接続:接続ボタン / 接続済み:最終取り込み時刻・今すぐ取り込み・解除 / 失敗:該当カレンダー行に再試行)
UX-DR12: 情報アーキテクチャ — 下タブ3つ(ホーム / カレンダー / 設定)、ドロワーなし、モーダル/シート1段まで、カレンダー管理はホーム見出しから1タップ
UX-DR13: 状態パターン11種(初回・データなし / この後の予定なし / カレンダー未接続 / 取り込み中 / 取り込み失敗 / オフライン / 未ログインで Google 接続 / お気に入りシフト未登録で日付タップ / 給料見込み ¥0 / 破壊的操作の確認 + Undo / フォーカス)
UX-DR14: マイクロコピー — `EXPERIENCE.md` Voice and Tone の Do/Don't 表に沿う。日本語・簡潔・体言止め・感嘆符なし。`AppError.messageKey` → 文言の対応表
UX-DR15: アクセシビリティフロア — NFR7 の実装(色 + 名前セット、キーボード並べ替え、SR 読み上げ順 = 優先度順、AA、44px、Reduce Motion)
UX-DR16: インタラクションプリミティブ — タップで開く、長押しでその日にクイック追加、月/週の横スワイプ、ホーム/カレンダーの引っ張り更新、リスト行のスワイプ削除(確認付き)、禁止(カルーセル / 起動時ヒーローアニメ / バッジカウント)
UX-DR17: レスポンシブ — スマホ縦基準の単一カラム。タブレット/PC 幅は月ビューを広く(2カラムは v1 では任意)
UX-DR18: PWA シェル — インストール可、スプラッシュ、オフラインでローカルデータ閲覧、下タブのアプリシェル

**Epic 5(addendum.md の Epic 5 追記より、2026-09-12)**

UX-DR19: ウィジェットは `DESIGN.md` のトークン(色・タイポグラフィ)をそのままネイティブ実装(iOS/Android)へ落とし込み、アプリ内コンパクトビューと視覚的に統一する
UX-DR20: リマインダー設定 UI は既存の予定詳細/編集シートに「リマインダーを追加」の導線を1つ足す程度に留め、`EXPERIENCE.md` Voice(静かなトーン・感嘆符なし)を踏襲する

### FR Coverage Map

- FR1: Epic 1 — ローカル予定の CRUD
- FR2: Epic 1 — 月 / 週 / リスト表示
- FR3: Epic 3 — Google 接続とカレンダー選択
- FR4: Epic 3 — 定期取り込み(Edge Function + pg_cron)
- FR5: Epic 1 — カレンダー管理(作成・改名・色・削除、シフト用カレンダー既定)。Epic 3 で source=Google の行表示を追加
- FR6: Epic 2 — カレンダーごとの優先度(ドラッグ + キーボード代替)
- FR7: Epic 2 — 重なり時の視覚的な優先表示(週・月)
- FR8: Epic 2 — 優先度順の並び(一覧・リスト・コンパクト)
- FR9: Epic 2 — 代表予定の選抜(`packages/core`)
- FR10: Epic 2 — コンパクトビュー画面
- FR11: Epic 4 — お気に入りシフトの登録
- FR12: Epic 4 — ワンタップ・シフト入力(連続日一括)
- FR13: Epic 4 — 実働時間計算(日またぎ通算)
- FR14: Epic 4 — 当月の給料見込み
- FR15: Epic 4 — トップ画面での見込み表示
- FR16: Epic 1 — サインアップ / ログイン(未ログインでもローカル可)
- FR17: Epic 1 — JSON エクスポート
- FR18: Epic 5 — ホーム画面ウィジェット
- FR19: Epic 5 — 端末カレンダーの取り込み
- FR20: Epic 5 — リマインダー通知

## Epic List

### Epic 1: 自分の予定をカレンダーで管理する(+ 基盤)

アプリを開いてログイン(またはお試しのまま)、カレンダーを作り、予定を作成・編集・削除して、月 / 週 / リストで見られる。PWA としてホーム画面にインストールできる。このエピックで、スターター・モノレポ・Supabase・デザイントークン・アプリシェル(下タブ)・data-access レイヤ・ローカルキャッシュという土台を、「動くカレンダー」という最初のユーザー価値と一緒に立ち上げる。
**FRs covered:** FR1, FR2, FR5, FR16, FR17

### Epic 2: 優先度をつけて、大事な予定を先に見る

カレンダーごとに優先度をドラッグ(またはキーボード)で設定でき、それが一覧の並び・重なった予定の描画順・予定リストに効く。ホームのコンパクトビューで、優先度の高いカレンダーの代表予定が先頭に出る。表示件数(1〜3)を選べる。このアプリの唯一の勝ち筋を、まず自分のカレンダーだけで完成させる。
**FRs covered:** FR6, FR7, FR8, FR9, FR10

### Epic 3: Google カレンダーを取り込んで一緒に表示する

Google アカウントを接続し、選んだカレンダーを読み取り専用で取り込み、自分の予定と1つのビューに統合表示する。取り込みは定期実行 + 「今すぐ取り込み」、失敗はカレンダー単位で表示、接続解除でそのデータは消える。取り込んだカレンダーにも Epic 2 の優先度がそのまま効く。
**FRs covered:** FR3, FR4(および FR5 の外部カレンダー表示、FR6 の優先度適用)

### Epic 4: シフトを楽に入れて、今月の給料見込みを見る

よく使うシフトをお気に入りシフトとして登録し、日付をタップしてテンプレを選ぶだけ(連続日は一括)でシフトを入れられる。実働時間を計算し、当月の給料見込みをホームで追加操作なしに確認できる。Epic 1 の予定・カレンダー基盤の上に載る独立機能。
**FRs covered:** FR11, FR12, FR13, FR14, FR15

### Epic 5: スマホアプリ化(ウィジェット・端末カレンダー・リマインダー)

Web PWA(Epic 1〜4)を Capacitor でネイティブアプリとして包み、アプリを開かなくてもホーム画面ウィジェットで代表予定を確認でき、端末(OS)のカレンダーも Google と同じ感覚で取り込め、予定ごとに個別のリマインダー通知を設定できる。Android・iOS 両対応。FR18〜20 はすべて「Capacitor でネイティブ機能をラップする」という同じ技術基盤(`src/platform` ブリッジ、ネイティブプロジェクト追加)の上に載るため、1つのエピックにまとめ、まず基盤を作ってから3機能を順に積む。
**FRs covered:** FR18, FR19, FR20

### 依存関係

- **ビルド順は 1 → 2 → 3 → 4 → 5。**
- Epic 1 は単独。
- Epic 2 は Epic 1 に載る。
- Epic 3 は Epic 1 + **Epic 2 Story 2.1(`calendars.priority` カラムと採番 RPC)**を前提とする。取り込んだカレンダーは Epic 2 の優先度機構をそのまま使うため。ユーザー価値としては独立(外部カレンダーの統合表示)だが、コード上は 2.1 に依存する。
- Epic 4 は Epic 1 のみに依存(Epic 2 / 3 とは独立)。Story 1.7 の JSON エクスポートに Story 4.1 でシフトテンプレを追加する(1.7 は 4.1 なしでも完結)。
- Epic 5 は Epic 1(予定・カレンダー基盤)+ Epic 2 Story 2.4(`selectFeaturedEvents`、ウィジェットが再利用)に依存。Epic 3(Google 取り込み)・Epic 4(シフト)とは独立(端末カレンダーは Epic 3 の実装パターンを踏襲するが、コード上の依存ではない)。

### エピック分割の根拠(Epic 5、ファイル重複の検討)

FR18(ウィジェット)・FR19(端末カレンダー)・FR20(リマインダー)を3エピックに分けない。理由は Epic 2/3 分割の逆で、こちらは「同じコンポーネントの重複」パターン(参照: エピック設計原則の File Churn 例)に当てはまる ── 3機能とも `src/platform` ブリッジ層・ネイティブプロジェクト(`ios/`, `android/`)・プロダクト識別子(AD-18)という同じ技術基盤を最初に必要とし、基盤を3回に分けて作る理由が無い。1エピックにまとめ、ストーリー1本目で基盤を作ってから3機能を順に積む。

### エピック分割の根拠(ファイル重複の検討)

Epic 2 と Epic 3 はどちらも `features/calendars` / `calendar-row` を触るが、統合はしない。Epic 2 の実体は `packages/core`(優先度・選抜)+ `compact-card` で、Epic 3 の実体は Edge Functions + OAuth。異なるリスク境界(コア差別化 vs 外部連携・資格情報)を持ち、早期フィードバックが後続の方向を変えうるため分割する。

### 横断的な UX 要件の扱い

UX-DR13(状態パターン11種)/ UX-DR14(マイクロコピー)/ UX-DR15(アクセシビリティフロア)は特定エピックに属さず、各ストーリーの受け入れ基準に織り込む。すべてのユーザー向け文言は `EXPERIENCE.md` Voice and Tone の Do/Don't に従い、すべての対話要素は AA コントラスト・44px タップターゲット・Reduce Motion 尊重を満たす。

## Epic 1: 自分の予定をカレンダーで管理する(+ 基盤)

ログイン(またはお試しのまま)でアプリを使い始め、カレンダーを作り、予定を作成・編集・削除し、月 / 週 / リストで見られる。PWA としてインストールできる。土台(Vite + Supabase + デザイントークン + アプリシェル + data-access レイヤ + ローカルキャッシュ)を「動くカレンダー」という価値と一緒に立ち上げる。

### Story 1.1: プロジェクト基盤とアプリシェル

As a 開発者,
I want Vite + React + Supabase のモノレポと、デザイントークンを適用した下タブ3画面のシェル,
So that 以降のすべてのストーリーが同じ土台の上で実装できる。

**Acceptance Criteria:**

**Given** クローンした空リポジトリ
**When** 依存をインストールしてビルドする
**Then** `packages/core` / `src/features` / `src/data` / `src/app` / `supabase/` の構成でビルドが通る
**And** `supabase start` でローカルの Postgres + Auth + Edge Functions が起動する

**Given** アプリを起動する
**When** 下タブの「ホーム」「カレンダー」「設定」を切り替える
**Then** それぞれの空画面が表示され、ドロワー/ハンバーガーは存在しない

**Given** 端末のテーマが dark / light
**When** アプリを開く、または設定でテーマを「端末追従 / ライト / ダーク」に切り替える
**Then** `DESIGN.md` の colors / typography / spacing / rounded トークンが CSS 変数 + Tailwind 経由で両テーマとも正しく適用される(UX-DR1, UX-DR2, UX-DR12)

### Story 1.2: メール+パスワードのアカウントとお試しモード

As a 新規ユーザー,
I want アカウントを作ってログインでき、ログインしなくてもアプリを触れること,
So that まず試してから、必要になったら登録できる。

**Acceptance Criteria:**

**Given** 未登録のメールアドレス
**When** サインアップ → ログイン → ログアウトする
**Then** Supabase Auth でセッションが確立・破棄され、全テーブルに `user_id = auth.uid()` の RLS が有効

**Given** 未ログインの状態
**When** アプリを開く
**Then** ホーム・カレンダー画面が表示され、ローカルカレンダー/予定の作成・閲覧ができる(FR16)
**And** Google 接続を試みると、先にログイン/アカウント作成へ誘導される(UX-DR13: 未ログインで Google 接続)

### Story 1.3: カレンダーの作成・管理

As a ユーザー,
I want ローカルカレンダーを作り、名前・色を変え、削除でき、一覧で見られること,
So that 予定を用途ごとに分けて持てる。

**Acceptance Criteria:**

**Given** ログイン済み(または未ログインのローカル利用)
**When** カレンダーを作成し、名前と色を変更し、削除する
**Then** `calendars` テーブル(+ RLS)に反映され、一覧は各行の source(ローカル / Google)を明示する(FR5, UX-DR7 の一部)

**Given** 初めてアプリを使う
**When** データが初期化される
**Then** 「シフト用カレンダー」が既定で1つ存在し、改名・色変更はできるが削除はできない

**Given** カレンダーがまだ1つもない状態(初回)
**When** ホーム/カレンダーを開く
**Then** 「カレンダーを接続」「予定を追加」の2つの入口が表示される(UX-DR13: 初回・データなし)

### Story 1.4: ローカル予定の作成・編集・削除

As a ユーザー,
I want 予定を作成・編集・削除でき、間違えても取り消せること,
So that 自分のスケジュールを記録できる。

**Acceptance Criteria:**

**Given** カレンダーが1つ以上ある
**When** 予定(タイトル / 開始・終了 または終日 / メモ / 所属カレンダー)を作成・編集する
**Then** `events` テーブル(`timestamptz` UTC / 終日は `date`、`source`、`deleted_at`、シフト用 nullable カラム群を含む)に保存される(FR1, AD-1, AD-7)
**And** 書き込みは `src/data` のリポジトリ関数経由のみで、UI から直接 supabase-js を呼ばない。関数は `Result<T, AppError>` を返す(AD-9, AD-10)

**Given** 予定フォーム
**When** 開始時刻が終了時刻より後で保存する
**Then** 保存されず、`EXPERIENCE.md` Voice に沿ったエラー文言(`AppError.messageKey` 経由)を表示する(UX-DR14)

**Given** 予定を削除する
**When** 削除を確定する
**Then** `deleted_at` が立ち、一定時間 Undo を提示する。全読み取りクエリは共通ヘルパで `deleted_at IS NULL` を強制する(UX-DR13: 破壊的操作 + Undo、規約: 論理削除)

**Given** オフライン
**When** 予定を作成・編集する
**Then** 書き込みキュー(順序保持)に積まれ、オンライン復帰でフラッシュされる

### Story 1.5: 月 / 週 / リストのカレンダー表示

As a ユーザー,
I want 予定を月・週・リストで見られ、日付を移動できること,
So that 予定を一望したり詳しく見たりできる。

**Acceptance Criteria:**

**Given** 表示オンのカレンダーに予定がある
**When** 月 / 週 / リストを切り替える
**Then** どのビューでも表示オンのカレンダーの予定が見える。月は7列グリッド(今日はアクセントのリング)、週は1日タイムライン(時刻軸 + 現在時刻ライン)、リストは日付昇順(この時点では同時刻内は開始時刻順)(FR2, UX-DR4, UX-DR5)

**Given** 予定チップ
**When** 表示される
**Then** 各チップは「カレンダー色バー(必須)+ 時刻 + タイトル」で、色だけで所属を表さない(UX-DR6, UX-DR15)

**Given** 月 / 週ビュー
**When** 横スワイプする / 週の空きスロットをタップする
**Then** 前月・翌月(週は前日・翌日)へ移動 / その時刻をプリセットした予定追加が開く(UX-DR16)
**And** スマホ縦を基準に単一カラム、タブレット/PC 幅では月ビューを広く使う(UX-DR17)

### Story 1.6: PWA インストールとオフライン閲覧

As a ユーザー,
I want アプリをホーム画面に入れ、オフラインでも自分の予定を見られること,
So that ネットが無くても予定を確認できる。

**Acceptance Criteria:**

**Given** 対応ブラウザ
**When** インストールを実行する
**Then** マニフェスト・アイコン・スプラッシュを備えた PWA としてホーム画面に追加できる(NFR6, UX-DR18)

**Given** オフライン
**When** アプリを開く
**Then** ローカルキャッシュのカレンダー・予定は通常どおり表示され、取り込み系の UI には「オフライン」表示が出る(UX-DR13: オフライン)

### Story 1.7: データの JSON エクスポート

As a ユーザー,
I want 自分のデータを JSON で書き出せること,
So that バックアップや持ち出しができる。

**Acceptance Criteria:**

**Given** 設定画面
**When** エクスポートを実行する
**Then** ローカルで作成したカレンダーと予定を含む JSON ファイルが得られる(FR17)
**And** 取り込んだ外部予定は含まれない
**And** お気に入りシフトのテンプレは、Epic 4 で登録機能ができ次第、同じエクスポートに追加される

## Epic 2: 優先度をつけて、大事な予定を先に見る

カレンダーごとに優先度をドラッグ(またはキーボード)で設定でき、それが一覧の並び・重なった予定の描画順・予定リスト・ホームのコンパクトビューに効く。このアプリの唯一の勝ち筋を、まず自分のカレンダーだけで完成させる。

### Story 2.1: カレンダーの優先度設定(ドラッグ + キーボード)

As a ユーザー,
I want カレンダーを並べ替えて優先順位をつけられること(マウスでもキーボードでも),
So that 大事なカレンダーを上位に置ける。

**Acceptance Criteria:**

**Given** カレンダーが2つ以上ある
**When** カレンダー管理画面で行をドラッグして並べ替える
**Then** `calendars.priority` が更新され、`(user_id, priority)` の unique 制約と単一の採番/並べ替え RPC 経由で一意性が保たれる(FR6, AD-5)

**Given** ドラッグが使えない状況(キーボードのみ / スクリーンリーダー)
**When** 行にフォーカスして「上へ / 下へ」を操作する
**Then** 同じ並べ替えができ、スクリーンリーダーは「優先度 2/5、上へ移動可能」のように現在地と操作を読む(NFR7, UX-DR7, UX-DR15)

**Given** 新しくカレンダーを作る / 取り込む
**When** 一覧に追加される
**Then** 既定で最下位の優先度に入る

### Story 2.2: 優先度ユーティリティと一覧・リストの並び

As a ユーザー,
I want カレンダー一覧と予定リストが優先度順に並ぶこと,
So that 上から見れば大事なものから目に入る。

**Acceptance Criteria:**

**Given** 優先度が設定されたカレンダー
**When** カレンダー一覧・予定リストを表示する
**Then** 並びは優先度順、同順位内は開始時刻順になる(FR8)
**And** 並べ替えは `packages/core` の優先度ユーティリティ(純関数)を通り、UI はその場でソートを書かない(AD-5, AD-10)

**Given** `packages/core` の優先度ユーティリティ
**When** テストを実行する
**Then** 並び規則の単体テストが揃っている(規約: テスト)

**Given** 優先度を変更する
**When** 一覧・リストを見る
**Then** 再読み込みなしで並びが更新される

### Story 2.3: 重なった予定の視覚的な優先表示(週・月)

As a ユーザー,
I want 予定が重なったとき、優先度の高いカレンダーのものが目立つこと,
So that 狭い画面でも大事な予定を見落とさない。

**Acceptance Criteria:**

**Given** 週ビューで時間が重なる複数の予定
**When** 表示する
**Then** 優先度が高いカレンダーのものを左端に置き、左右に並べきれない場合は優先度が高いものを前面にする(FR7, UX-DR5)

**Given** 月ビューで1日のマスに入りきらない予定
**When** 表示する
**Then** 優先度が高い予定から見せ、あふれた分は「他 N 件」に畳む。「他 N 件」を開くとその日の全予定を優先度順(同順は開始時刻順)で見られる(FR7, UX-DR4)

### Story 2.4: 代表予定の選抜ロジック(packages/core)

As a 開発者,
I want 代表予定を決める純粋関数が1つだけ存在すること,
So that 画面・ウィジェット・通知がずっと同じ予定を選ぶ。

**Acceptance Criteria:**

**Given** `packages/core`
**When** `selectFeaturedEvents(events, calendarPriority, now, limit)` を実装する
**Then** 副作用・I/O なし、`now` は引数(内部で現在時刻を読まない)、正規入力型(camelCase / UTC)を core が定義する(FR9, AD-6)

**Given** 予定リストと優先度と現在時刻
**When** 関数を呼ぶ
**Then** (1) 現在時刻以降 / 進行中のみ対象 (2) 優先度が高いカレンダーが先 (3) 同カレンダー内は開始時刻順 (4) 終日は時刻付きの後 (5) `limit` で打ち切り、の5規則どおりに順序付き結果を返す
**And** 対象0件のときは空を返す(呼び出し側が「次の予定なし」を出せる)
**And** 5規則それぞれに単体テストがある(規約: テスト、NFR10)

### Story 2.5: ホームのコンパクトビュー

As a ユーザー,
I want ホームを開くと、この後の大事な予定だけが優先度順で出ること,
So that 一目で「次に外せないもの」が分かる。

**Acceptance Criteria:**

**Given** この後に予定がある
**When** ホームを開く
**Then** `compact-card` が `selectFeaturedEvents` の結果を、低い情報密度で(1件ずつ独立した行)優先度順に表示する。各行にカレンダー名・色・開始時刻(FR10, UX-DR3)
**And** 表示件数(1〜3)を設定で選べる(既定3)

**Given** 代表予定
**When** タップする
**Then** カレンダーの該当日へ遷移する

**Given** この後に予定がない
**When** ホームを開く
**Then** 「この後の予定はありません」を1行で静かに表示する(感嘆符なし)(UX-DR13, UX-DR14, NFR12)

**Given** スクリーンリーダー
**When** コンパクトビューを読む
**Then** 読み上げ順が優先度順になっている(UX-DR15)

## Epic 3: Google カレンダーを取り込んで一緒に表示する

Google アカウントを接続し、選んだカレンダーを読み取り専用で取り込み、自分の予定と1つのビューに統合する。取り込みは定期 + 手動、失敗はカレンダー単位、接続解除でそのデータは消える。取り込んだカレンダーにも Epic 2 の優先度が効く。

### Story 3.1: Google 接続(OAuth)と資格情報の安全な保管

As a ユーザー,
I want Google アカウントを接続でき、その資格情報が安全に扱われること,
So that 自分の Google カレンダーをこのアプリで見られる。

**Acceptance Criteria:**

**Given** ログイン済みユーザー
**When** 「Googleカレンダーを接続」から OAuth を実行する
**Then** `access_type=offline` + `prompt=consent` でカレンダー**読み取りスコープのみ**を要求し、認可が完了する(FR3, NFR1)

**Given** OAuth 完了
**When** トークンを保存する
**Then** `provider_refresh_token` は Supabase 側(Vault / 暗号化カラム、RLS で本人のみ)にのみ保存され、クライアント・ローカルキャッシュ・ログ・エラー本文には出ない。トークン交換と Google API 呼び出しは `oauth-exchange` / `sync-calendars` Edge Function だけが行う(AD-3, NFR4, NFR5)

**Given** 未ログインで接続を試みる
**When** 「接続」を押す
**Then** ログイン / アカウント作成へ誘導し、完了後に接続フローへ戻る(FR16, UX-DR13)

### Story 3.2: 取り込むカレンダーの選択と一覧表示

As a ユーザー,
I want 接続した Google アカウントのどのカレンダーを取り込むか選べること,
So that 必要なカレンダーだけを表示できる。

**Acceptance Criteria:**

**Given** Google 接続済み
**When** 取り込み対象を選ぶ画面を開く
**Then** そのアカウントのカレンダー一覧(名前・色)が表示され、取り込む対象を選択でき、個別にオン/オフできる(FR3)

**Given** カレンダーを取り込み対象にする
**When** カレンダー管理の一覧を見る
**Then** `source = 'external'`(Google)の行として表示され、Story 2.1 の採番 RPC 経由で既定の最下位優先度が付き、Epic 2 の並べ替え・優先度がそのまま効く(FR5, FR6。ビルド順の前提: 2.1 完了済み)

### Story 3.3: 定期取り込みと手動取り込み(sync-calendars Edge Function)

As a ユーザー,
I want 取り込んだカレンダーが自動で最新になり、必要なら今すぐ更新できること,
So that Google 側の変更がこのアプリにも反映される。

**Acceptance Criteria:**

**Given** 取り込み対象のカレンダー
**When** `sync-calendars` Edge Function が pg_cron のスケジュールで、または「今すぐ取り込み」で起動する
**Then** Google → Postgres の一方向で予定を取り込む。外部イベントの安定 ID `(connection_id, external_id)` で upsert し、二重登録しない(FR4, AD-4)

**Given** 前回取り込んだ予定が Google 側で削除された
**When** 次の取り込みが走る
**Then** その予定は論理削除される(AD-4)

**Given** 取り込んだ予定
**When** 詳細を開く
**Then** 閲覧のみで、編集・削除の UI が出ない。外部へ書き込む経路はコードに存在しない(AD-2, NFR2)
**And** 時刻は UTC で保存され、表示時にユーザーのタイムゾーンへ変換される(AD-7)
**And** カレンダーごとに最終取り込み時刻が表示される

### Story 3.4: 取り込み失敗の表示と接続解除

As a ユーザー,
I want 取り込みに失敗したカレンダーが分かり、接続をやめたら痕跡が残らないこと,
So that 何が最新でないか把握でき、やめたいときにやめられる。

**Acceptance Criteria:**

**Given** 1つのカレンダーの取り込みが失敗する
**When** カレンダー管理を見る
**Then** その行に「取り込めませんでした・再試行」が表示され、他のカレンダーの取り込みと表示は止まらない。ホーム/カレンダーは最後に取り込めた内容を出し続ける(FR4, UX-DR11, UX-DR13)

**Given** Google 接続を解除する
**When** 解除を確定する
**Then** そのアカウント由来の取り込み予定がローカル(Postgres + キャッシュ)から削除され、影響が事前に明示される(FR3, NFR3, UX-DR13: 破壊的操作)

## Epic 4: シフトを楽に入れて、今月の給料見込みを見る

よく使うシフトをテンプレとして登録し、日付タップ + テンプレ選択でワンタップ入力(連続日は一括)。実働時間を計算し、当月の給料見込みをホームで追加操作なしに確認できる。Epic 1 の予定・カレンダー基盤の上に載る独立機能。

### Story 4.1: お気に入りシフトの登録

As a シフト勤務のユーザー,
I want よく使うシフトをテンプレとして登録・編集・削除できること,
So that 毎回同じ時間を打ち込まずに済む。

**Acceptance Criteria:**

**Given** 設定 / お気に入りシフト管理
**When** テンプレ(名前 / 開始 / 終了 / 休憩分 / 時給 / 勤務先ラベル / 色)を登録・編集・削除する
**Then** `shift_templates` テーブル(+ RLS)に反映され、複数のテンプレを持てる(FR11)
**And** `shift-template-chip` はピル形で「シフト名 + 時間帯」を表示する(UX-DR8)

**Given** テンプレの入力
**When** 時給や休憩分に負値、または休憩 ≥ 実働 を入れる
**Then** バリデーションで弾かれる

**Given** テンプレを登録済み
**When** データを JSON エクスポートする
**Then** エクスポートにお気に入りシフトのテンプレが含まれる(FR17 の完成)

### Story 4.2: ワンタップ・シフト入力(quick-shift-sheet)

As a シフト勤務のユーザー,
I want 日付をタップしてテンプレを選ぶだけでシフトを入れられること(連続日はまとめて),
So that 1週間分のシフトをすぐ登録できる。

**Acceptance Criteria:**

**Given** お気に入りシフトを登録済み
**When** 月 / 週で日付をタップする
**Then** 下から `quick-shift-sheet` が出て、登録済みテンプレが横スクロールで並ぶ(UX-DR10)

**Given** `quick-shift-sheet`
**When** テンプレのチップを1回タップする
**Then** その日にシフトが作成され(`events` にシフト属性 = 休憩分・時給・勤務先ラベル・由来テンプレ ID をセット、「シフト用カレンダー」所属)、シートが閉じる。テンプレ利用時の合計操作は3タップ以内(FR12, AD-8, NFR8)

**Given** 連続する複数日を選択している
**When** テンプレを選ぶ
**Then** 選択したすべての日にそのシフトが入る

**Given** お気に入りシフトが未登録
**When** 日付をタップする
**Then** シートが「よく使うシフトを登録すると1タップで入れられます」+ 作成ボタンを出す(UX-DR13)

**Given** 作成済みのシフト
**When** 汎用の予定編集(FR1)で開始 / 終了 / メモを変更する
**Then** シフト属性(休憩分・時給等)は変更されない。シフト属性の編集は `features/shifts` の経路のみ(AD-8)

### Story 4.3: 実働時間の計算(packages/core pay-calc)

As a 開発者,
I want 実働時間を計算する純粋関数が `packages/core` にあること,
So that 給料計算がプラットフォームに依らず一貫する。

**Acceptance Criteria:**

**Given** シフト(開始 / 終了 / 休憩分)
**When** 実働時間を計算する
**Then** 実働時間 = 終了 − 開始 − 休憩(分単位)。終了が開始より前(日をまたぐ)場合は終了を翌日として通算し、分割しない(FR13, AD-7, AD-8)

**Given** `packages/core` の pay-calc
**When** テストを実行する
**Then** 通常シフト・休憩控除・日またぎシフトの単体テストが揃っている(規約: テスト)

### Story 4.4: 当月の給料見込みとトップ画面表示(pay-card)

As a シフト勤務のユーザー,
I want ホームで当月の給料見込みを追加操作なしに見られること,
So that 今月いくらになるか常に把握できる。

**Acceptance Criteria:**

**Given** 今月にシフトがある
**When** ホームを開く
**Then** `pay-card` が当月の給料見込み(その月のシフトの 実働時間 × 時給 の合計、暦月、シフトごとの時給差を合算)を `amount` 書式で表示する。集計値は保存せず都度計算する(FR14, FR15, AD-8, UX-DR9, NFR9)

**Given** `pay-card`
**When** 前月 / 翌月の矢印を押す / シフトを追加・編集・削除する
**Then** 対象月が切り替わる / 金額が即時に再計算される

**Given** 対象月にシフトがない
**When** `pay-card` を見る
**Then** 「¥0」と「今月のシフトはまだありません」を表示する(UX-DR13)

**Given** `pay-card` をタップする
**When** 給料見込みの詳細を開く
**Then** その月のシフトの内訳が見える。v1 では割増・締め日・勤務先別の設定項目を出さない(NFR11)

## Epic 5: スマホアプリ化(ウィジェット・端末カレンダー・リマインダー)

Web PWA(Epic 1〜4)を Capacitor でネイティブアプリとして包み、ホーム画面ウィジェットで代表予定を確認でき、端末(OS)のカレンダーも Google と同じ感覚で取り込め、予定ごとに個別のリマインダー通知を設定できる。Android・iOS 両対応。基盤(5.1)→ 端末カレンダー(5.2〜5.3)→ リマインダー(5.4)→ ウィジェット iOS/Android(5.5〜5.6)の順で積む。

### Story 5.1: Capacitor 基盤とネイティブプロジェクトの追加

As a 開発者,
I want 既存の Web SPA を Capacitor でラップし、iOS/Android のネイティブプロジェクトとディープリンクの受け口が揃うこと,
So that 以降のウィジェット・端末カレンダー・通知ストーリーが同じ土台の上で実装できる。

**Acceptance Criteria:**

**Given** 既存の Vite + React19 SPA(Epic 1〜4 完了状態)
**When** `@capacitor/core` 8.5.1 を導入し `npx cap add ios` / `npx cap add android` を実行する
**Then** `ios/`, `android/` ディレクトリが追加され、`capacitor.config.ts` の `appId` が暫定プロダクト識別子 `jp.ryo.calendarapp` に設定される(AD-11, AD-18)

**Given** ネイティブプロジェクトが追加された
**When** Xcode / Android Studio でビルドし、それぞれのシミュレータ/エミュレータで起動する
**Then** 既存の Web SPA が WebView 経由で表示され、Epic 1〜4 の機能(カレンダー表示・予定 CRUD・優先度・PWA 機能等)がそのまま動作する(AD-11)

**Given** ディープリンクのスキーム
**When** iOS の `Info.plist`(`CFBundleURLSchemes`)と Android Manifest(`intent-filter scheme`)に `calendar-app` を登録する
**Then** `calendar-app://event/{eventId}` と `calendar-app://day/{yyyy-mm-dd}` の両形式で OS からアプリが起動でき、`src/app` の受け口が該当予定 / 該当日へ遷移する。存在しない予定 ID は統合ビューへフォールバックする(AD-16)

**Given** 開発用ビルド
**When** 実機 / シミュレータ向けにビルドする
**Then** iOS は自動管理の開発用証明書、Android はデバッグ鍵でビルドが通る。ストア配布用の正式な署名鍵の準備は別途(Deferred、Apple Developer Program 登録待ち)

### Story 5.2: 端末カレンダーの接続と取り込み対象の選択

As a ユーザー,
I want スマホ本体のカレンダーを、Google と同じ感覚で取り込み対象に選べること,
So that 会社携帯・家族共有カレンダー等、Google 以外の予定もこのアプリで一元管理できる。

**Acceptance Criteria:**

**Given** 未接続の状態
**When** 設定から「端末カレンダーを接続」を選ぶ
**Then** OS の権限ダイアログ(iOS: カレンダーの読み取り許可 / Android: `READ_CALENDAR`)が表示され、許可すると `connections` テーブルに `provider='device'` の行が作られる(FR19, AD-13)
**And** 権限要求は読み取り専用スコープのみで、書き込み権限は要求しない(NFR13)

**Given** 権限ダイアログで拒否する
**When** 「端末カレンダーを接続」を再度確認する
**Then** 機能が無効化されている旨が既存の `Result<T, AppError>` / `messageKey` 規約で表示され、アプリ全体は落ちない(FR19 Consequence, NFR13)

**Given** `connections.provider` / `calendars.source` / `events.source` の既存 CHECK 制約
**When** このストーリーのマイグレーションを適用する
**Then** 3箇所すべてがリテラル `'device'` を許可するよう1本のマイグレーションで拡張される(AD-17)

**Given** 端末カレンダー接続済み
**When** 取り込み対象カレンダーの選択画面を開く
**Then** 端末上のカレンダー一覧(名前・色)が表示され、Google の取り込み対象選択(Story 3.2)と同じ操作感で個別にオン/オフできる(FR19)
**And** 選択は `connection_calendars` テーブルを再利用し、`provider='device'` の接続に属す行に限り本人が直接 INSERT/UPDATE できる新規 RLS ポリシーで書き込む(Google 行の既存ポリシーは変更しない、AD-17)

### Story 5.3: 端末カレンダーの同期実行と接続解除

As a ユーザー,
I want 選んだ端末カレンダーの予定が実際に取り込まれ、接続をやめたら痕跡が残らないこと,
So that 会社携帯の予定もアプリ内で見られ、やめたいときにやめられる。

**Acceptance Criteria:**

**Given** 取り込み対象に選んだ端末カレンダー
**When** アプリがフォアグラウンドに復帰する、または「今すぐ取り込み」を手動実行する
**Then** `src/platform/deviceCalendar.ts` が `@ebarooni/capacitor-calendar` 経由で生データを読み、`packages/core` の device 用 normalizer で正規化し、認証済みクライアントが `src/data` 経由で RLS(`user_id = auth.uid()`)の範囲内で直接 upsert する。Google 専用の `service_role` RPC(`apply_calendar_sync` 等)は一切呼ばれない(FR19, AD-14, AD-17)

**Given** 前回取り込んだ予定が端末側で削除された
**When** 次の取り込みが走る
**Then** 対象 `connection_id`+`calendar_id` の既存行を SELECT → 今回読んだ外部 ID と diff → 消えた予定は `deleted_at` をセットする、というクライアント側の逐次処理で論理削除される(AD-17)

**Given** 取り込んだ端末予定
**When** 詳細を開く
**Then** 閲覧のみで編集・削除 UI が出ない。優先度(Epic 2)がそのまま効き、月/週/リスト/コンパクトビューのどこでも他の予定と同列に扱われる(FR19, AD-2 継承)

**Given** 端末カレンダー接続を解除する
**When** 解除を確定する
**Then** その接続由来の取り込み予定・`connection_calendars` 行がローカル(Postgres + キャッシュ)から削除され、影響が事前に明示される(Story 3.4 と同じパターン、NFR13)

### Story 5.4: 予定ごとのリマインダー通知

As a ユーザー,
I want 予定ごとに個別のリマインダー通知を任意で設定できること,
So that 見落としたくない予定だけ、事前に気づける。

**Acceptance Criteria:**

**Given** 予定の詳細/編集シート
**When** 「リマインダーを追加」を選ぶ
**Then** プリセット(10分前 / 30分前 / 1時間前)またはユーザー定義の分数から選べ、`events` テーブルの nullable カラム(既定 `null` = 通知なし)に保存される(FR20, AD-15)
**And** UI は既存シートに導線を1つ足す程度に留め、`EXPERIENCE.md` Voice(静かなトーン)を踏襲する(UX-DR20)

**Given** リマインダーを設定した予定
**When** 保存する
**Then** `@capacitor/local-notifications` で端末ローカルにスケジュールされる。通知 ID は `events.id` から `packages/core` の導出関数で決定的に計算した符号あり 32bit 整数で、予定の source(ローカル / Google / 端末カレンダー)を問わず同じ経路が使われる(FR20, AD-15)

**Given** リマインダー設定済みの予定
**When** 開始/終了時刻を編集する、または削除する
**Then** 同じ導出 ID で `cancel()` してから必要なら `schedule()` し直す。削除時は再スケジュールしない(FR20)

**Given** Google 取り込み・端末カレンダー取り込みの同期が予定時刻を書き換えた
**When** 同期の upsert が完了する
**Then** ユーザーによる編集と同じ cancel/reschedule フックを経由し、古い時刻のまま通知が残らない(FR20 Consequence)

**Given** 通知をタップする
**When** アプリが起動する
**Then** `calendar-app://event/{eventId}` のディープリンク(Story 5.1)経由で該当予定の詳細へ遷移する(AD-16)

**Given** OS の通知権限(iOS 許可ダイアログ / Android 13+ の `POST_NOTIFICATIONS`)を拒否する
**When** リマインダーを設定しようとする
**Then** 通知が送れない旨が `Result<T, AppError>` / `messageKey` 規約で表示され、予定自体の保存は妨げられない

### Story 5.5: ホーム画面ウィジェット — iOS

As a ユーザー,
I want iOS のホーム画面に置いたウィジェットで、アプリを開かず代表予定を確認できること,
So that ロック解除してアプリを開く手間なしに、次に外せない予定が分かる。

**Acceptance Criteria:**

**Given** ウィジェットが未追加
**When** iOS のホーム画面にウィジェットを追加する
**Then** WidgetKit の SwiftUI 実装が表示され、`DESIGN.md` のトークン(色・タイポグラフィ)をアプリ内コンパクトビューと統一して使う(FR18, UX-DR19)

**Given** アプリ側
**When** `selectFeaturedEvents`(Epic 2 Story 2.4)を呼ぶ
**Then** `src/platform/widget.ts` が上限3件を計算し、`{ calendarName, colorHex, startsAtIso, schemaVersion }` の JSON を App Group `group.jp.ryo.calendarapp.widget` の UserDefaults キー `featuredEvents` へ書き込む(AD-12)

**Given** 共有ストレージに書き込まれた代表予定
**When** ウィジェットのサイズ(小/中/大 = 1/2/3件相当)が決まる
**Then** ネイティブ側が渡された配列を現在のサイズに応じて切り詰めて表示する。各行はカレンダー名・色・開始時刻(タイトルは表示しない、FR18, AD-12)

**Given** 対象予定が0件
**When** ウィジェットを表示する
**Then** 感嘆符のない静かな表示になる(コンパクトビューの「次の予定なし」に準じる、NFR12)

**Given** ウィジェットをタップする
**When** OS がアプリを起動する
**Then** `calendar-app://event/{eventId}` のディープリンク(Story 5.1)経由で該当予定へ、0件時は該当日へ遷移する(FR18, AD-16)

**Given** アプリのフォアグラウンド復帰・取り込み完了・予定の作成/編集/削除
**When** これらのイベントが起きる
**Then** ウィジェットのタイムライン再読み込みが明示的にトリガーされる。OS の定期更新は補助として扱う(AD-12)

### Story 5.6: ホーム画面ウィジェット — Android

As a ユーザー,
I want Android のホーム画面に置いたウィジェットで、アプリを開かず代表予定を確認できること,
So that iOS と同じ体験を Android でも得られる。

**Acceptance Criteria:**

**Given** ウィジェットが未追加
**When** Android のホーム画面にウィジェットを追加する
**Then** App Widget(Jetpack Glance または RemoteViews)の実装が表示され、Story 5.5 と同じ共有ストレージ契約(SharedPreferences キー `featuredEvents`、同じ JSON スキーマ)を読む(FR18, AD-12)

**Given** 共有ストレージに書き込まれた代表予定
**When** ウィジェットのサイズが決まる
**Then** Story 5.5 と同じ切り詰めロジックで、カレンダー名・色・開始時刻を表示する(FR18, AD-12, UX-DR19)

**Given** 対象予定が0件
**When** ウィジェットを表示する
**Then** Story 5.5 と同じ静かな表示になる(NFR12)

**Given** ウィジェットをタップする
**When** OS がアプリを起動する
**Then** Story 5.5 と同じディープリンクで該当予定/該当日へ遷移する(FR18, AD-16)

**Given** `updatePeriodMillis`(最短30分)による OS 定期更新
**When** イベント駆動の明示的な再読み込み(Story 5.5 と同じトリガー)と併用する
**Then** Android 実機でウィジェットが極端に古い情報のまま固まらないことを確認する(AD-12)
