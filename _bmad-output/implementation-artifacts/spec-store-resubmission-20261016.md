---
title: 'Multi Calendar修正版の両ストア更新・再申請'
type: 'chore'
created: '2026-10-16'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'cb9c44169caaf135c6c60466732037f1d262be9f'
context: [docs/ios-app-store-release.md]
---

<frozen-after-approval reason="本人の配布・再申請依頼">

## Intent

既存iOS対策とTDD追加修正を含む最新版を両ストアへ送り、審査へ再提出する。アップロードと審査送信は別々に確認する。

## Boundaries & Constraints

既存release・1A・2B・利用者データ・署名鍵を保持。AGENTS.mdは本人了承どおり除外。Androidは既存Alpha・テスター・地域、Appleは手動公開を維持し、一般公開はしない。契約同意・金融入力・実課金・権利手動付与・端末初期化・本番SQL/Edge適用は行わない。必要なら別承認を求める。実機未確認を成功と記載しない。

## I/O & Edge-Case Matrix

| 状態 | 期待 |
|---|---|
| 署名・設定不足 | 提出版を偽装せず停止 |
| 既存番号 | ストアを照合し未使用番号へ更新 |
| Apple契約・購入の未受入 | 本人対応と実確認を待ち、解消を断定しない |
| CI成功 | SHA・版・署名を照合してから送信 |
| 送信後 | ストアの審査状態と選択ビルドを確認 |

</frozen-after-approval>

## Code Map

- android/app/build.gradle、scripts/android/build-release.ps1：コード27・1.0.24。既存署名検査を再利用。
- .github/workflows/ios.yml、ios-release.yml、scripts/ios/release-signing.py：Mac署名・Swift試験。既存uploadは旧run・28へ固定されており差替え必須。
- docs/ios-review-investigation-20261014.md：実機購入・復元・iPad撮影は未受入。
- spec-claude-debug-fixes-20261015.md：全1,642件成功。新規SQL/Edgeは未適用。

## Tasks & Acceptance

- [x] android/app/build.gradle：ストア照合後、未使用コードで署名AAB作成。
- [ ] .github/workflows/ios.yml：既存releaseで新IPA作成、検証済みrun・ハッシュ・版に送信対象を固定。
- [ ] docs/store-resubmission-20261016.md：成果物・設定・未受入・提出結果を記録。
- [ ] 両管理画面：掲載情報と審査メモを修正内容へ合わせ、条件が揃った側から再申請。

検証済み成果物があるとき、送信すると、その版だけが選択されること。再申請後、審査待ち／審査中を画面等で確認すること。片側が未完了なら両側完了としない。

## Implementation Notes

2026-10-16：本人が「進めて」と仕様を承認。AGENTS.md保持・除外も承認済み。直後にin-progressへ進める。実装担当はandroid/app/build.gradleのversionCodeを28、versionNameを1.0.25へ変更する局所修正だけを行い、差分を返す。新規実装は不要。担当はビルド、外部操作、コミット、pushをせず、仕様も編集しない。メインが署名・CI・成果物・ストア操作を統合する。Androidの最新登録27と既存Alpha配信を管理画面で実確認済み。

本人のストア更新・再申請依頼により、配布に必要なGitHub送信・CI・ストア外部操作を許可された範囲で行う。旧実装工程の一律リモート操作禁止は今回の明示依頼を優先。Appleの最新番号は再ログイン後に照合し、作成済み候補が競合するなら送信せず番号を増やして再作成する。

Appleは既存の公式API認証で最新28と却下された1.0.23・手動公開を実確認した。ブラウザーの再ログインを待たず安全なAPI経路を使用できる。Mac CI 38848984870はcb9c441から1.0.25（29）を作成し成功。主AppとWidgetの版、署名検査、カメラ・写真用途、本番設定、他ストア文言非混入を照合。送信run・IPAハッシュを固定し、旧28を再送しない。

Android 1.0.25（28）は署名AAB作成、単体42件、lintエラー0・警告1、公式bundletool構造検査、実体の版・識別子・署名・公開設定を照合。Alphaリリース9に28だけ登録し、既存27は新リリースへ含めない。対象端末増減なし、Play警告は難読化解除ファイル未添付1件。

## Spec Change Log

## Review Triage Log

## Verification

型・静的検査・全体試験、Android単体/lint/署名検証、Mac Swift/Xcode/IPA検査。送信前に本番公開設定と撮影用設定非混入を照合。Appleログイン・契約、実機課金の受入は自動試験と区別する。
