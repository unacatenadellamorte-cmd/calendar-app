---
title: '端末カレンダー取り込みの権限切れ案内'
type: 'bugfix'
created: '2026-10-01'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval>

## Intent

Androidの端末カレンダー取り込みが失敗する。実機のカレンダー読み取り権限が未許可であることを確認した。接続情報の有無と現在の端末の権限を区別し、未許可のときは設定での許可を案内する。許可後は既存接続と予定を保持して取り込みを再試行できるようにする。

</frozen-after-approval>

## Implementation Notes

- 実機は versionCode 20 / versionName 1.0.19。READ_CALENDAR granted=false。未許可になった経緯は未確定。
- src/data/device-sync.ts と device-calendars.ts は読み取り前に権限を確認し、既存の connection/permission-denied メッセージを返す。自動復帰時に権限ダイアログは出さない。
- device-connections.ts は接続済みでも手動接続時には権限要求を実施し、許可後の接続行重複作成を防ぐ。
- 同じ3モジュールの回帰テストで未許可時に端末読み取り・保存・削除を実行しないことと再許可後の復帰を検証する。
- DB変更、実ユーザー予定の削除、実機でのテストランナー実行は行わない。修正専用ブランチを作成し、既存未追跡ファイルは保持。

- ユーザーがAndroid設定から権限を許可し、取り込み成功を確認。今回の実機障害は解消。
- レビュー後、接続済みUIから呼ばれない connectDevice の変更は取り除いた。復帰導線は既存メッセージの端末設定案内とし、不要な権限要求変更を避けた。

## Review Triage Log

- low / patch: 既存接続での connectDevice 再要求はUIから到達しない。不要な変更とテストを撤回。設定から許可後に取り込めることは実機で確認済み。
- maybe-false / defer: 読み取り中の権限失効で空一覧を返す可能性。実機で失効直後にプロセスが生き残り空一覧を返すという経路の証拠はない。今回以前からある競合窓。実機プロバイダの挙動を検証してから追加対応を判断。
- low / patch: 権限確認自体の例外と再試行のテストを追加。

- 検証: 関連5ファイル83件成功。不要変更撤回・例外ケース追加後の影響2ファイル35件成功。型検査と変更ファイルESLint成功。
