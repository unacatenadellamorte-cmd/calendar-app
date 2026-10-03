# 2026-10-03 課金入りモバイル版の検証とアップロード

## 実装・自動検証

課金ブランチ0de6b2bとiOS署名/認可ブランチ823ddf7を提出用release/paid-mobile-20261003で統合した。コミット8bf549b。Android/iOSの追加Google書込み認可、利用者切替拒否、有料権利・接続所有者の検査を保持。iOS公開RevenueCatキーを配布設定で必須化。実Swift SceneDelegateのcold/warm URL転送試験を追加。

- Claude Haiku 4.5による安価な検証：149ファイル、1,466テスト成功。型エラー0、lintエラー0、既存警告1。
- Node iOS設定試験7件、Python署名試験12件成功。
- Mac配布CIで再検証成功。Swift Google認可・SceneDelegate試験、Widget 10件、Xcode配布署名・archive/export検証成功。
- Android Gradle testDebugUnitTest / lintRelease / bundleRelease成功。
- Supabase oauth-exchangeをiOS対応版へ配信。本番OPTIONSでcapacitor://localhostの許可とHTTP204確認。
- 最終IPAのアプリ/Widgetとも1.0.22(24)、公開iOS課金キー・本番Supabase接続同梱を確認。

## ストア結果

- Google Play：Alphaに1.0.22(24)を未公開として保存。旧22を新リリースへ含めず、新AAB24のみ。審査提出・配信は実施していない。
- Apple：1.0.22(24)をアップロード。TestFlightの一覧で「提出準備完了」を確認。既存内部テストへのビルド追加・再審査提出は実施していない。
- AppleビルドID：4dde723b-7560-415a-9ab3-00e7a31e4587。
- Macビルド：https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/37085955122
- Apple送信：https://github.com/unacatenadellamorte-cmd/calendar-app/actions/runs/37086705670
- IPA送信対象をrun/hash/版で固定したコミット：1d2a3e8。
- 提出ブランチだけを既存GitHub環境ios-app-storeの許可対象へ追加。ほかのブランチの制限は維持。
- AAB SHA256：12c5cd73e13fe9af642dca307f5206d0febcb973aa1e2d031c70cdc856bf7d03
- IPA SHA256：b964299fe372da98f745e0c4153309bf626c77a6c7f88c7d934ec701bab31aae

## Apple購入設定

ユーザーの直前承認を受けてApple IAPキー「MultiCalendar RevenueCat」を作成し、RevenueCat Multi calendarのApp Storeアプリへ登録。「Valid credentials」でキー形式・権限の検証成功。秘密P8は保護されたローカル領域のみで管理し、Git・ログへ入れていない。

App Storeアプリ：jp.ryo.multicalendar。RevenueCatアプリID：appb67593941f。公開SDKキーをGitHub環境変数へ設定し、IPA同梱を確認。

Apple商品グループ22435790：上位multi_account_monthly（6818678828）と下位calendar_write_monthly（6818681316）。各1か月、日本向け、価格1,000円/300円。日本語表示とグループ名を登録。審査用商品画像と提出紐付けは未完了。実機購入・復元の成功はまだ確認していない。

## 前回のApple拒否とGoogle ToDo

元の審査メッセージ（2026/10/01 14:01）を再読。Guideline 2.1の追加情報要求であり、特定のクラッシュ指摘ではない。返信下書きは未送信で、「課金なし」「Google読取り専用」が今回版と不一致。

ユーザー依頼でGoogle ToDoに「Multi calendar｜Apple再審査」を作成し、以下6件を期限なしで登録。詳細手順付き。認証情報は含めていない。
1. 提出する最新版をiPhone・iPad実機で確認する
2. 実機動画を撮る：起動・登録・ログイン・削除・有料機能
3. 審査説明を最新版に直す（課金・Google書込み・地域差）
4. 審査用ログインとGoogle連携の利用手順を実機で確かめる
5. 課金2商品を審査可能に仕上げ、アプリと一緒に提出する
6. 動画・審査メモ・返信・提出ビルドを揃えて再審査へ送る

Apple元のメッセージ：https://appstoreconnect.apple.com/apps/6817586147/distribution/reviewsubmissions/details/6e285884-c8bb-4842-8d63-2050514d572d

## 公開前の残り

実機録画と購入/復元QA、利用規約公開URLとアプリ内リンク、審査用商品スクリーンショット、最新仕様に合う審査メモ/返信、商品とアプリの同時提出。Google書込みスコープの公開審査要否も既存の公開ゲート。これらをアップロード成功や自動テスト成功と混同しない。

レビュー20件の個別判定は作業場のspec-paid-mobile-upload-20261003.mdに記録。既存撮影スクリプトのruntime固定/12枚検査/後片付けは今回のアップロード経路では使わず、別途課題として記録。

### RevenueCat iOS商品連携の確定

- multi_account_monthly：prod53998ae80d。multi_accountとcalendar_write権利を紐付け。
- calendar_write_monthly：prode9942a0ecd。calendar_write権利を紐付け。
- 既存defaultオファリングofrng8041f9550fの各パッケージへ、Android商品を保持したままApp Store商品を追加。画面の再表示で両商品を確認。
- App Store Connect API用の別キーは未登録のため、RevenueCatのストア状態自動取得はCould not check表示。IAP検証キーのValid credentialsとは別機能。
- Appleサーバー通知URLのASC登録は未実施。実機購入前の設定確認として残る。
