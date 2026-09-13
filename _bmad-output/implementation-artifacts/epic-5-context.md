# Epic 5 Context: スマホアプリ化(ウィジェット・端末カレンダー・リマインダー)

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Web PWA(Epic 1〜4)を Capacitor でネイティブアプリとして包み、ブラウザだけでは提供できない3つのOSネイティブ機能を追加する: アプリを開かずに代表予定を見られるホーム画面ウィジェット、端末(OS)本体のカレンダーをGoogleと同じ感覚で取り込む機能、予定ごとの個別リマインダー通知。Android・iOS両対応。3機能とも「Capacitorでネイティブ機能をラップする」同じ技術基盤(`src/platform`ブリッジ+ネイティブプロジェクト追加)の上に載るため1エピックにまとめ、基盤(5.1)→端末カレンダー→リマインダー→ウィジェットの順に積む。既存の優先度・選抜ロジック(Epic 2)を新しい判断基準を持ち込まずそのまま再利用する。

## Stories

- Story 5.1: Capacitor 基盤とネイティブプロジェクトの追加
- Story 5.2: 端末カレンダーの接続と取り込み対象の選択
- Story 5.3: 端末カレンダーの同期実行と接続解除
- Story 5.4: 予定ごとのリマインダー通知
- Story 5.5: ホーム画面ウィジェット — iOS
- Story 5.6: ホーム画面ウィジェット — Android

## Requirements & Constraints

- **ウィジェット**: 既存の選抜ロジック(Epic 2)の結果をそのまま、カレンダー名・色・開始時刻のみで表示(タイトルは出さない)。サイズに応じ1/2/3件。タップで該当予定/該当日へ。0件時は感嘆符のない静かな表示。レイアウト・配色カスタマイズや直接操作(予定作成・編集)は対象外。更新頻度はOSのバックグラウンド制約に従い、アプリ本体ほどの即時性は保証しない。
- **端末カレンダー取り込み**: Googleと同じ「外部接続」の一種。読み取り専用、OS権限ダイアログで明示同意(拒否時は機能無効化のみでアプリ全体は落とさない)。取り込み対象は名前・色付き一覧から個別オン/オフ(Googleと同じ操作感)。取り込んだ予定は優先度がそのまま効き他の予定と同列。接続解除で当該ローカルデータは削除。端末側への書き戻しは対象外。
- **リマインダー通知**: 既定オフ、予定ごとの任意オプトイン。プリセット(10分/30分/1時間前)またはユーザー定義の分数。source(ローカル/Google/端末)を問わず設定可。ローカル通知のみ(push配信サーバーなし)。タップで該当予定詳細へ。時刻編集・同期による時刻書き換えで再スケジュール、削除で取り消し。繰り返し予定への個別設定・代表予定のダイジェスト通知は対象外。
- 対象はAndroid・iOS同時。iOSはApple Developer Program登録+審査が必要(登録可否は引き続きPM判断待ちだが、技術設計はどちらでも成立させる)。
- 端末カレンダー・通知とも既存の最小権限・読み取り専用・第三者非送信の原則を継承(予定本文・トークンをログに書かない)。
- 静かなトーン(感嘆符・達成演出・再エンゲージ通知なし)をウィジェット/通知コピーにも適用する。
- 成功指標: 作り手がウィジェットを見るだけ(アプリを開かず)で代表予定を確認する頻度が、アプリを開いて確認する頻度を上回ること。

## Technical Decisions

- **Capacitor採用**(`@capacitor/core` 8.5.1)。既存`src/`・`packages/core`は無変更のままラップし`ios/`・`android/`を追加する(React Native/Flutterへの書き換えは不可)。
- **新設レイヤ**`src/platform`(widget.ts / deviceCalendar.ts / reminders.ts / deepLink.ts)はネイティブブリッジ専用でロジックを持たない受け渡し役。Capacitorプラグイン呼び出し・`Capacitor.getPlatform()`判定はここに閉じ、UIコンポーネントに分岐を書かない。ネイティブUI本体は`ios/App/WidgetExtension`(SwiftUI WidgetKit)、`android/.../widget`(Kotlin, Jetpack Glance/RemoteViews)。`packages/core`は葉のまま、選抜関数・通知ID導出関数・端末カレンダー用normalizerの置き場になる。
- **ウィジェット契約**: JSは常に選抜結果の上限3件を`{calendarName, colorHex, startsAtIso, schemaVersion: 1}`のJSON配列に整形し(タイトル含めない)、共有ストレージへ書き込む(iOS: App Group `group.jp.ryo.calendarapp.widget`のUserDefaultsキー`featuredEvents` / Android: 同名のSharedPreferencesキー)。実際の表示件数はネイティブ側がサイズに応じて切り詰める。ブリッジは`capacitor-widget-bridge`(または明示的後継フォークのみ、自作禁止)。更新はイベント駆動(フォアグラウンド復帰・取り込み完了・予定CRUD直後)が基本、OS定期更新は補助扱い。
- **端末カレンダー**: `connections.provider='device'`行としてGoogleと同形にモデル化。読み取りは`@ebarooni/capacitor-calendar`(iOS/Android差異の吸収はこの1本に任せる)。生データは`packages/core`のdevice用normalizer(Google用と同形の正規化型)を経由。**Postgresへの実書き込みはクライアント発・`src/data`経由の直接upsertで既存RLSの範囲内**——Google専用の`service_role`RPC(`apply_calendar_sync`等)は流用も`authenticated`への開放もしない。外部消失の論理削除は「既存行SELECT→今回の外部IDとdiff→`deleted_at`セット」というクライアント側の逐次処理。`connection_calendars`に`provider='device'`専用の新規書き込みRLSポリシーを追加(Google行の既存ポリシーは変更しない)。`connections.provider`/`calendars.source`/`events.source`のCHECK制約を1本のマイグレーションでリテラル`'device'`許可へ拡張。同期トリガーはフォアグラウンド復帰+手動更新のみ(OSバックグラウンド定期実行は不安定なため持たない)。
- **リマインダー**: `@capacitor/local-notifications`でローカルスケジュールのみ。通知IDは`events.id`から`packages/core`の単一の導出関数で計算した符号あり32bit整数(衝突は個人利用規模で許容する劣化として扱う)。1予定につき通知は最大1件。分数は`events`のnullableカラムに保存(シフト属性と同じパターン)。予定時刻が変わる全経路(ユーザー編集・Google同期upsert・端末カレンダー同期upsert)が同じ導出IDでcancel()→必要ならschedule()し直す。
- **ディープリンク**: スキーム`calendar-app://`、形状は`event/{eventId}`と`day/{yyyy-mm-dd}`の2つのみ。受け口は`src/app`に1箇所だけ実装し、ウィジェット・通知タップとも同じ経路を使う。存在しない予定IDは統合ビューへフォールバック。
- **プロダクト識別子**: 暫定`jp.ryo.calendarapp`。`capacitor.config.ts`のappId・App Group ID・ディープリンクスキームはすべてこの1値から導出し、正式名決定時は3箇所を同一PRで同時変更する。
- **エラー表現**: 権限拒否(カレンダー・通知とも)は既存の`Result<T, AppError>`/`messageKey`規約にそのまま乗せ、`src/platform`独自のエラー型は作らない。
- **署名・配布**: iOS provisioning profile・Androidキーストアはユーザー本人が保持。OTA不採用で毎回ストア審査。モバイルCI/CDは手動ビルド(Deferred)。

## Cross-Story Dependencies

- Epic 5全体はEpic 1(予定・カレンダー基盤)とEpic 2 Story 2.4(選抜ロジック)に依存する。ウィジェットはこの既存関数を再利用し独自実装しない。
- Epic 3(Google取り込み)・Epic 4(シフト)とはコード非依存。ただし端末カレンダー(5.2〜5.3)はEpic 3の接続/同期のUIパターンを踏襲する(コード依存ではない)。
- エピック内ビルド順は固定: 5.1(Capacitor基盤+ネイティブプロジェクト+ディープリンク受け口)→5.2〜5.3(端末カレンダー)→5.4(リマインダー)→5.5〜5.6(ウィジェットiOS/Android)。全ストーリーが5.1の基盤を前提にする。
- Story 5.4は、時刻を書き換える全経路(Story 3.3のGoogle同期upsert、Story 5.3の端末カレンダー同期upsert)から同じcancel/rescheduleフックが呼ばれることを前提にする。
- Story 5.5・5.6は、5.1で定義される共有ストレージ契約(JSONスキーマ・キー名)を両OSで同一に保つ必要がある。
