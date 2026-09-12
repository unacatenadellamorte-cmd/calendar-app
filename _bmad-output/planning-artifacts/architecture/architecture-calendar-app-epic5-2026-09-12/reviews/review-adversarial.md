# Adversarial review — Epic 5 アーキテクチャスパイン

*「AD-11〜AD-16 をすべて文字通り守っても、2人の実装者が非互換に組めるペア」を実際に構築して探す。対象は
`architecture-calendar-app-epic5-2026-09-12/ARCHITECTURE-SPINE.md`。親スパイン
(`architecture-calendar-app-2026-09-06/ARCHITECTURE-SPINE.md`)および実装済みの
`supabase/migrations/*`, `packages/core/src/google-events.ts`, `src/data/*` を実際に読み、
「ADの文面上は許されるが実データ・実DBスキーマと衝突する」箇所を優先して検証した。*

## Verdict

**Adopted-safe ではない。** 6件の穴を発見し、うち3件は「新規AD/既存ADの補強なしでは実装が始まった瞬間に破綻する」レベル(実DBの CHECK 制約・GRANT 権限と正面衝突)。残り3件は「2人が黙って別の値を選べる」設計レベルの穴で、共有インターフェースを跨ぐものは新規ADで塞ぐべき、片方の実装内に閉じるものは Deferred のままでよい。

## 方法

AD-11〜AD-16 のRuleを1件ずつ「これを一字一句守りながら、もう一人の実装者と食い違えるか」で試した。特に、Epic 5 が「既存の Google 経路と同じ形にする」と繰り返し宣言している箇所(AD-13, AD-14, Consistency Conventions)は、**実際に存在する Google 経路の実装**(migrations・RLS・GRANT・`packages/core` の型)と突き合わせて検証した。仮定ではなく実コードとの矛盾を優先して報告する。

---

## AD-11 — Capacitor 採用

**Rule:** 既存 SPA は変更しない。`@capacitor/core` 8.x でラップ。`ios/`, `android/` を追加。

実装者2人がこの1文だけを見て `ios/`, `android/` を初期化すると、必ず `capacitor.config.ts` の `appId`(iOS Bundle ID / Android applicationId)を各自で決めることになる。この値は本スペインのどこにも書かれていない。プロダクト名自体が親PRDで「未定」(`prd.md` §9-7)のままなので、実装者Aは `com.ryo.calendarapp`、実装者Bは `app.calendarapp.mobile` のような別々の値を仮決めしてよい状態にある。

- **単体では実害は小さい**(後から改名可能)が、この `appId` は AD-12(App Group ID は通常 Bundle ID から派生)・AD-16(URL スキーム名)の両方に波及する共通の未決定変数になっている。
- **判定:** 単独では Deferred でよいが、後述する横断ファインディング(「プロダクト識別子」参照)としてまとめて扱うべき。AD-11 自体に穴があるわけではない。

## AD-12 — ウィジェット(データブリッジ + ネイティブUI)

**Rule:** `selectFeaturedEvents` の呼び出しと整形は JS側(`src/platform`)で行い、結果を「代表予定1〜3件分の最小限のJSON(タイトル・時刻・色)」に整形して共有ストレージ(iOS: App Group UserDefaults、Android: SharedPreferences相当)へ書き込む。ネイティブUI実装は本スペインの対象外(Deferred、ストーリー側)。

ここが最大の穴のひとつ。**AD-12自身が「JSON を書く側」と「JSON を読む側」を別の実装者・別の実装時期に切り分けると明言している**(ネイティブUIは「本スペインの対象外」)。にもかかわらず、両者の間の契約が言葉でしか決まっていない。

構築した非互換ペア:
- 実装者A(`src/platform/widget.ts` を書く人): `{ title: string, startsAtIso: string, colorHex: string }[]` を JSON.stringify して App Group `group.jp.ryo.calendarapp.widget` の UserDefaults キー `"featuredEvents"` に書く。時刻は UTC ISO 文字列のまま(表示側で TZ 変換する想定)。
- 実装者B(SwiftUI WidgetExtension を書く人、ストーリー側・別セッション): AD-12 の文面(「タイトル・時刻・色」)だけを見て、App Group を `group.com.ryo.calendarapp`(1文字違い)で登録し、キー名を `"widget_events"`、時刻を「表示用に整形済みの文字列(例: `"14:00"`)」だと期待して実装する。

結果は「実装者Aは間違ったことを何もしていない」「実装者Bもプレーンな日本語のADを読んだだけ」なのに、**ビルドは通り、実機でも例外は出ず、ウィジェットは常に空(または前回値のまま固まる)**。App Group 名の1文字不一致・キー名不一致は iOS では静かな失敗であり、ログにも出ない。

- **判定:新規ADで塞ぐべき。** 少なくとも次の3点はこのスペイン(または補強したAD-12)で確定が必要:
  1. App Group / SharedPreferences の**識別子そのもの**(定数として `src/platform` に1箇所だけ定義し、両ネイティブプロジェクトの設定もそこから機械的にコピーする、という運用ルールを含めて)
  2. JSON のフィールド名・型・時刻表現(UTC ISO のまま渡すのか、フォーマット済み文字列で渡すのか)
  3. スキーマバージョン欄の有無(将来 JS 側の形が変わったときネイティブ側が古いままでも壊れないためのガード)
  ネイティブ**レイアウト**自体(SwiftUI の見た目)はストーリー側でよいが、**JSON契約と共有ストレージのキー名**はレイアウトの手前の「インターフェース」であり、レイアウトと同列にDeferredへ落とすべきではない。

## AD-13 — 端末カレンダーは「外部接続」の一種

**Rule:** `connections` テーブルの `provider = 'device'` 行として、既存の Google 接続(`provider = 'google'`)と**同じ形でモデル化する**。

実コードを確認した。`supabase/migrations/20260911000000_connections.sql:16`:

```sql
provider text not null default 'google' check (provider in ('google')),
```

**`'device'` という値は現行スキーマでは物理的に INSERT できない。** CHECK 制約が `'google'` のみを許可している。AD-13 は「provider='device' の行として扱う」と断定形で書いているが、この制約を誰がいつどう緩めるかは本スペインのどこにも書かれていない。

構築した非互換ペア:
- 実装者A: 新規マイグレーションで `alter table connections drop constraint ... ; add constraint ... check (provider in ('google','device'))` を書き、`'device'` という文字列をそのまま使う。
- 実装者B: 同じ制約に気づかず(あるいは「既存の確定migrationは触らない方が安全」と判断し)、`connections.provider` は触らずに、`calendars` 側に `is_device_synced boolean` を足す、あるいは `provider` を `'device_ios'` / `'device_android'` とプラットフォーム別に分ける、という**別モデル**で「Google 接続と同じ形」を自己流に解釈する。

どちらも「device 用の外部接続をモデル化する」という目的語だけは満たすが、DBスキーマもクエリも非互換になる。加えて、同じ穴が `calendars.source` / `events.source` にもある(`20260907000000_calendars.sql:21`, `20260907010000_events.sql:16`、いずれも `check (source in ('local','google'))`)。AD-14 の Consistency Conventions は「`source` 列で区別する」とだけ書いており、`'device'` という**具体的なリテラル文字列そのもの**を確定させていない(プローズに一度出てくるだけで、Rule の中で正式に固定されていない)。

- **判定:新規ADで塞ぐべき(必須)。** 次を明文化する:
  - `connections.provider`, `calendars.source`, `events.source` の3箇所の CHECK 制約を widen する1本のマイグレーションで揃える(誰が・どのファイルで)
  - 3箇所すべてで使う device 用リテラルは **1つの文字列**(例: `'device'`)に統一し、iOS/Android で値を分けない(分けるなら明示的にそう書く)

## AD-14 — 端末カレンダー取り込み(クライアント発 → Postgres)

**Rule:** `src/platform` が生データを読み、`packages/core` の device 用 normalizer(「Google 用 `normalizeGoogleEvent` と同じ出力型 `EventRow` を返す」)で正規化し、**既存の `src/data` リポジトリ層(AD-9)経由で Postgres へ upsert する**。

これが今回見つけた**最重要の穴**。実コードで検証すると、AD-14 が「同じ形」と呼んでいる Google の書き込み経路は、クライアントから直接呼べない設計になっている。

根拠(実装済みコード):
- `apply_calendar_sync` RPC(`20260913000000_google_event_sync.sql:176-179`):
  ```sql
  revoke execute on function public.apply_calendar_sync(...) from public, anon, authenticated;
  grant execute on function public.apply_calendar_sync(...) to service_role;
  ```
  加えてこの関数は `p_user_id` を**呼び出し側が渡すパラメータとしてそのまま信頼**しており、内部で `auth.uid()` との一致チェックを一切していない(`security definer` で RLS もバイパスする)。これは「Edge Function(service_role)からしか呼ばれない」ことを前提にした設計。
- 同様に `upsert_connection_calendars` / `set_google_calendar_selection`(`20260912000000_connection_calendars.sql:117-118, 197-198`)も `authenticated` から `revoke` 済みで `service_role` 専用。FR-19 は「Google と同じ選択制UI」を明示要求している(`prd.md:339, 473`)ため、device 版でも本来この「カタログ選択」相当の仕組みが要る。
- 一方、`events` テーブルの RLS(`20260907010000_events.sql:66-73`)は `events_insert_own` / `events_update_own` が **`user_id = auth.uid()` だけ**をチェックしており、`source` 列は見ていない。つまり、モバイルクライアントが `supabase-js` で直接 `.from('events').upsert(...)` を呼ぶこと自体は(CHECK 制約さえ通れば)RLS 的には**通ってしまう**。
- 加えて `src/data/google-sync.ts:50` と `google-sync.test.ts:46` を見ると、この codebase にはすでに「クライアントが `supabase.functions.invoke('sync-calendars', ...)` で Edge Function をトリガーする」という**既存の慣行**がある(＝「今すぐ取り込み」ボタン)。

つまり AD-9(「data-access 層経由でのみ外部へ」)は Edge Function 呼び出しも、生 `supabase-js` テーブル書き込みも、どちらも文字通り満たせてしまう。AD-14はこの二択のどちらかを選んでおらず、「既存の Google コードパスと同じ形」という言葉だけでは決まらない。

構築した非互換ペア:
- 実装者A: `src/data/deviceCalendars.ts` を新設し、新規 Edge Function(例: `sync-device-calendar`)を `functions.invoke` で叩く。Edge Function 内で新しい `apply_device_calendar_sync` RPC(`auth.uid()` ベースで安全にスコープ)を service_role として呼ぶ。冪等 upsert・時間窓削除差分のロジックは既存の `apply_calendar_sync` を極力共有・複製する。
- 実装者B: Edge Function を増やさない方針を取り、`src/data/deviceCalendars.ts` から**素の `supabase-js` upsert**(`.from('events').upsert(rows, { onConflict: 'connection_id,external_id' })`)を直接呼ぶ。時間窓内の削除差分(Google 側にある「今回応答に無い外部IDは論理削除」ロジック)はクライアント側で別途 SELECT → 差分計算 → UPDATE として再実装する。
- **さらに悪いケース(実装者C)**: AD-14 の文面を字義通り読みすぎて、既存の `apply_calendar_sync` RPC そのものを流用しようとし、「動かないなら `authenticated` に `grant execute` すればいい」と判断してしまう。この RPC は `p_user_id` を検証していないため、**他ユーザーの `connection_id`/`calendar_id` を渡せば他人のカレンダーに書き込める**、という実在のセキュリティホールを作り込んでしまう。これは「ADに書かれている通りにやったら壊れる」の中でも特に悪質な例で、AD-9(「data-access 経由」)にもAD-14(「既存の…コードパスと同じ形」)にも反していない、という点が危険。

いずれのケースも、AD-13/AD-14 のどの文言にも違反していない(「既存の Google コードパスと同じ形」の解釈がそれぞれ違うだけ)。3実装は互いに非互換であり、Cはセキュリティ上危険。

- **判定:新規ADで塞ぐべき(必須・最優先)。** 少なくとも次を確定する:
  - device 取り込みの書き込み経路は「新規 Edge Function 経由」か「クライアント直接 upsert」かのどちらか一方に決める
  - 選んだ経路の RPC/ポリシーは **`auth.uid()` を内部で強制**し、呼び出し側パラメータの `user_id` を信頼しない、という制約を明記する(既存 `apply_calendar_sync` のパターンをそのまま流用禁止、と明記してもよい)
  - FR-19 が要求する「カレンダー選択制UI」の device 版カタログ(`connection_calendars` 相当)をどう持つかも同時に決める(現行の `upsert_connection_calendars` 系は Google/service_role 専用でそのままは使えない)

副次的に: AD-14 の「Google 用 `normalizeGoogleEvent` と同じ出力型 `EventRow` を返す」という記述自体、実コード(`packages/core/src/google-events.ts`)と厳密には食い違う。`normalizeGoogleEvent` が返すのは `NormalizedGoogleEvent`(camelCase)であり、`EventRow`(snake_case)は別関数 `toEventRow()` が生成する、Edge Function 向けRPC入力専用の型(コメントに「RPC `apply_calendar_sync` の `p_events` が期待する行」と明記)。device normalizer が本当に「`EventRow` を直接返す」設計にすると、それは Edge Function 向け専用形を前提にした型を再利用することになり、上記の「Edge Function経由か直接か」の決定と絡んで余計にねじれる。これは実害というより**スペインの記述と実装の食い違い**なので、次回のスペイン改訂で用語を `NormalizedGoogleEvent` 相当/`EventRow` のどちらを指すか明確にすべき(新規ADは不要、既存ADの文言修正で足りる)。

## AD-15 — リマインダー通知(ローカル・決定的ID)

**Rule:** 通知IDは `events.id`(UUID)から決定的に導出した32bit整数。導出関数は `packages/core` に1本だけ置き、呼び出し側が独自にハッシュを書かない。

「1本だけ」という縛りがあるため、**2つの異なるハッシュ実装が同時に本番に混在する**というAD違反レベルの分岐は文面上ブロックされている。ここは他のADよりよく書けている。ただし実装者2人が「同じ1つの関数」を最初に書くタイミングが分かれる場合(例: iOS担当・Android担当が同時に着手し、互いのブランチをまだ見ていない)、両者が別々に `packages/core/src/notificationId.ts` を追加してしまう余地は残る。これは通常のコードレビュー・マージ競合で普通に検出できるので、アーキテクチャの穴というより開発プロセスの話。

具体的なアルゴリズムそのもの(UUIDの16バイトのどこを使うか、FNV-1aかCRC32か、ハイフン込み文字列かバイト列か)は本スペインでは未確定。ここは実際に手を動かすと2つの実務上の制約にぶつかる:
- Android の `@capacitor/local-notifications` の通知IDは Java の signed 32bit `int` として渡る。ハッシュの出力が符号なし32bit(0〜2^32-1)のままだと、`0x7FFFFFFF` を超える値でプラグインブリッジの型変換が環境によって不定になりうる。「32bit整数」だけでは符号あり/なしの範囲まで決まっていない。
- 同一ユーザー内でUUID→32bit整数のハッシュ衝突が起きた場合(理論上は avoidable ではない)、片方の予定の通知を `cancel()` したつもりが別の予定の通知を消してしまう。衝突時の扱い(許容する/検出する)は書かれていない。

- **判定:** 「関数を1本にする」という核のルールは既に穴を塞いでいるので**新規ADは不要**。ただし上記2点(符号あり32bitに収める・衝突時の扱いを明記/許容と言い切る)は**AD-15への軽い追記**で足りる粒度であり、Deferred(＝実装者の裁量に委ねてよい細部)とは言い切れない。落ちると実機で気づきにくい不具合になるため、追記を推奨。

## AD-16 — ディープリンク経路の統一

**Rule:** ウィジェット・通知タップは同じディープリンク形式(例: `calendar-app://event/{eventId}` **相当**のカスタムスキーム)で呼び出す。受け口は `src/app` に1つだけ実装。

「相当」「例」という言葉がついている時点で、**このAD自身が URL スキーム名を確定させていないと宣言している**。受け口を1箇所に決めている点(AD-16後半)は良い設計だが、それでも両ネイティブ側(iOS Info.plist の `CFBundleURLSchemes`、Android Manifest の intent-filter `scheme=`)にこの文字列を**バイト単位で一致させて登録する**必要があり、この登録は「受け口」より手前で、しかも2つの別ファイル(iOS/Android それぞれのネイティブプロジェクト)に書く。

構築した非互換ペア:
- 実装者A(iOS担当): スキームを `calendar-app` のまま採用し `calendar-app://event/{eventId}` を登録。
- 実装者B(Android担当): AD-11の `appId` 決定待ちで最終プロダクト名が変わる可能性を考慮し、暫定で `calapp://event/{eventId}` を登録(「例」に過ぎないので変えても違反ではない、と読める)。

さらに、Rule文には「該当予定(または**該当日**)を開く」とあるが、URL形状が具体的に決まっているのは `event/{eventId}` のみ。「該当日」の遷移(ウィジェットが0件時や日付ベースの表示のときに使う想定)のURL形状は一切書かれていない。実装者Aは `calendar-app://day/{yyyy-mm-dd}` を追加し、実装者Bは `calendar-app://event/{eventId}?fallback=day` のように既存パスへクエリを足す、といった別解が両立してしまう。

なお、これは親スパインの Deferred「プロダクト名…アーキテクチャに影響なし」という前提とも矛盾する。ディープリンクのスキーム名はプロダクト名に直接紐づく、正真正銘のアーキテクチャ事項であり、プロダクト名が未定のままでは確定できない。

- **判定:新規AD(または既存AD-16の補強)で塞ぐべき。** 少なくとも:
  - スキーム文字列そのものをこのスペインで確定する(暫定名でよいが「例」ではなく「決定」として明記し、変更時は両ネイティブプロジェクト+ストア掲載情報を同時に直す運用ルールもセットで書く)
  - 「該当日」の URL 形状も `event/{id}` と同格で確定する

## Consistency Conventions 表について

表自体は概ね各ADの繰り返しだが、「端末カレンダーのデータ形」の行(「Google 取り込みと同じ `EventRow` 型…`source` 列で区別」)は AD-14 のセクションで指摘した「経路そのものが未決定」という穴をそのまま持ち越しているだけで、追加の独自の穴は見当たらなかった。「プラットフォーム分岐は `src/platform` 内のみ」という行は、UI崩れの分岐漏れを防ぐルールとしてよく機能しており、ここに穴は見つけられなかった。

---

## 横断的ファインディング:「プロダクト識別子」が単一障害点になっている

AD-11(Bundle ID / applicationId)、AD-12(App Group ID)、AD-16(URLスキーム)の3つの穴は、根っこをたどると**プロダクト名・アプリ識別子が未確定**という1つの上流未決定事項(親PRD §9-7「プロダクト名 — 未定」)に行き着く。3つのADがそれぞれ独立に「まだ決まっていない」と言っているように見えるが、実際は1つのボトルネックが3箇所に染み出している。

親スパインは「プロダクト名は…アーキテクチャに影響なし」としているが、Epic 5 に入った時点でこれは成立しなくなっている(ネイティブアプリはBundle ID・App Group・URLスキームという形でプロダクト名がアーキテクチャに直接刻まれる)。**新規ADとして「プロダクト識別子を1つの暫定値で確定し、3箇所(capacitor.config.ts の appId / App Group ID / URLスキーム)がそこから機械的に導出される」という決定を追加すべき。** 値そのものはPM判断待ちでよいが、「決まっていない」を許すADの書き方自体が穴の温床になっている。

---

## 一覧表(穴の分類)

| # | 穴 | 該当AD | 分類 | 深刻度 |
|---|---|---|---|---|
| 1 | `apply_calendar_sync` 等の書き込みRPCが `service_role` 専用で、モバイルクライアントから直接呼べない。加えて `p_user_id` 未検証で流用は危険 | AD-9(継承)/ AD-14 | **新規ADで塞ぐべき** | 最高(セキュリティ含む) |
| 2 | `connections.provider` / `calendars.source` / `events.source` の CHECK 制約が現行スキーマで `'device'` を許可していない。widenする担当・リテラル文字列も未確定 | AD-13 / AD-14 | **新規ADで塞ぐべき** | 高 |
| 3 | ウィジェット共有ストレージのキー名・App Group識別子・JSONフィールド名/型が未確定なまま、書く側と読む側が別実装に分離されている | AD-12 | **新規ADで塞ぐべき** | 高 |
| 4 | ディープリンクのスキーム文字列が「例」のまま確定しておらず、「該当日」遷移のURL形状も未定義 | AD-16 | **新規ADで塞ぐべき** | 中 |
| 5 | プロダクト識別子(Bundle ID/App Group/URLスキームの元ネタ)が親PRDで未定のまま3ADに波及 | AD-11/12/16(横断) | **新規ADで塞ぐべき**(束ねて1件) | 中 |
| 6 | 通知IDの符号あり32bit範囲・衝突時の扱いが未記載 | AD-15 | 既存ADへの軽い追記で足りる(新規ADは不要) | 低〜中 |
| 7 | FR-19「選択制UI」相当の device 用カレンダーカタログの持ち方が未決定(#1と表裏) | AD-13 | #1と統合して新規ADで扱う | 高 |
| 8 | ウィジェット/Androidのネイティブレイアウト・タイマー実装そのもの | AD-12 | **Deferredのままでよい**(本スペインが明示的にストーリー側へ送っている実装詳細) | — |
| 9 | Apple Developer Program登録可否 | 親Deferred | **Deferredのままでよい**(PM判断待ちで技術方式に影響しないと明記済み) | — |
| 10 | モバイルCI/CD自動化 | 親Deferred | **Deferredのままでよい** | — |
| 11 | 1予定に複数リマインダー | AD-15 | **Deferredのままでよい**(スコープ外と明記済み) | — |
| 12 | Androidバックグラウンド定期同期・Doze耐性 | AD-14/親Deferred | **Deferredのままでよい** | — |
| 13 | EventKit/CalendarContractの「安定外部ID」がGoogleほど安定でない可能性(繰り返し予定の同一性判定) | AD-14 | 単一 normalizer 関数に閉じ込められる限りDeferredでよいが、実装時に一言注記推奨 | 低 |

## 推奨アクション(優先順)

1. **AD-17(新規)相当として「端末カレンダー取り込みの書き込み経路」を確定する** — Edge Function経由か直接upsertか、`auth.uid()`必須スコープ、既存`apply_calendar_sync`の流用禁止を明記。カレンダー選択制カタログの持ち方も同時決定(#1, #7)。
2. **AD-13/AD-14へ追記** — `connections.provider` / `calendars.source` / `events.source` の CHECK 制約を widen する1本のマイグレーションと、そこで使うリテラル文字列(`'device'`)を確定(#2)。
3. **AD-12へ追記(または新規AD)** — App Group / SharedPreferences のキー名・識別子・JSONスキーマ(フィールド名・時刻表現・バージョン欄)を確定(#3)。
4. **AD-16へ追記** — URLスキームを「例」から「決定」に格上げし、「該当日」遷移のURL形状も定義(#4)。
5. **プロダクト識別子の暫定確定を1件のAD(または既存ADへの共通脚注)としてまとめ、#3・#4・AD-11のappIdが同じ値から導出されることを明記**(#5)。
6. AD-15に符号あり32bit範囲・衝突時の扱いを1〜2行追記(#6)。

以上6件のうち1〜5は「2人の実装者が同じADを読んで正反対に手を動かせる」実在の穴であり、Finalize前に埋めるべき。6は望ましいが致命的ではない追記。8〜13はスペインが既に正しくDeferredへ送っている項目で、追加対応は不要と判断する。
