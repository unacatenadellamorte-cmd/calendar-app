---
title: 'AndroidのGoogle Play公開準備'
type: 'chore'
created: '2026-09-17'
status: 'in-progress'
route: 'dispatch'
baseline_commit: 'ba4c72ae350fa061e7d32d8be9f9a4a6373e59a1'
context: []
---

<frozen-after-approval reason="ユーザーの公開準備指示とGoogle Play指定に基づく">

## Intent

マルチカレンダーのAndroid版をGoogle Playへ提出できる状態へ進める。開発者アカウントは未登録。開発者名はRyo、公開問い合わせ先はuna.catena.della.morte@gmail.com。

## Boundaries & Constraints

署名キーとパスワードはユーザーが保持しGitには入れない。本人確認・課金は本人が操作する。未署名AABを提出可能と表示しない。既存のアプリ・データを壊す変更や登録内容の推測はしない。

## I/O & Edge-Case Matrix

| 状態 | 期待結果 |
|---|---|
| 署名なしの検証ビルド | unsigned明示のAABを作る |
| 提出モードで署名設定が欠ける | ビルド前に失敗する |
| 署名設定が全部ある | release署名設定を使う |
| OneDriveの生成物がロックされる | 指定した外部生成先で検証できる |

</frozen-after-approval>

## Code Map

- `android/app/build.gradle`: versionCode 1、API 36、署名設定なし。
- `android/build.gradle`: モジュール共通設定。
- `scripts/android/build-release.ps1`: 新設。Web同期からAndroid検査・AAB生成まで。
- `docs/android-publication.md`: 提出状況とストア原稿、審査上の未完事項。
- `src/features/settings/ui/AccountSection.tsx`: 登録・ログアウトのみ。削除導線は未実装。
- `src/data/device-sync.ts`、`profiles.ts`: 端末由来の予定やプロフィールもSupabaseへ保存するためデータ非収集とは申告できない。

## Tasks & Acceptance

- [x] 署名設定・秘密ファイルの除外を追加する。
- [x] ビルドスクリプトと外部生成先を追加する。
- [x] Androidテスト・lint・未署名AABを検証する。
- [x] ストア原稿・データ取扱い調査・提出手順を記録する。
- [ ] 開発者登録、アプリ識別子確定、署名キー準備。
- [ ] アカウント削除導線と実際の削除処理、公開ポリシー、ストア画像を完成する。
- [ ] 内部テスト提出、実機確認、必要なクローズドテスト、一般公開申請。

受入条件: 提出ビルドで秘密設定がない場合、未署名の成果物を誤って渡さず停止する。検証ビルドは成功しても一般公開完了として扱わない。

## Implementation Notes

メインセッションで実行。アカウント登録を待つ間に可逆的な準備を進める。既存の未追跡ユーザーファイルは変更しない。独立したサブエージェントレビューは実施しない。

## Verification

Androidのユニットテスト、release lint、bundleRelease、提出モードで資格情報不足時の失敗を確認する。

2026-09-17: `build-release.ps1 -Unsigned`が一貫して成功。Android 12テスト成功（ウィジェット11件＋既存サンプル1件）。lintはエラー0・警告23。SDKパスのコロンのエスケープを修正し、lint再生成で確認。AABのSHA256は`BFFE5AEB14742AE4E1F16D4085E04D41C06A9CA6D7AE7979DBB4E077EC12F7CA`。jarsignerでも未署名を確認。提出モードは環境変数不足でビルド前に停止することを確認。実際のアップロードキーを使う署名と提出は未検証。

## Review Triage Log

メインセッションで差分と生成物を確認。独立レビューは未実施。OneDriveロックは外部生成先で回避。署名キー未設定で提出版を誤生成しないガードを確認。ユーザーは名前か識別子の変更を希望しており、確定値は回答待ち。
