# 選択日に撮影した端末写真の一覧 検証記録(2026-10-20)

仕様: `_bmad-output/implementation-artifacts/spec-device-photos-by-day-20261020.md`(唯一の真実源)。
ブランチ: `feature/device-photos-by-day-20261020`。版番号・ストア設定・課金・DB・配布は変更していない。

## 実装した範囲

| 層 | ファイル | 内容 |
|---|---|---|
| 境界 | `src/platform/devicePhotos.ts` | 権限確認/要求、当日範囲(ローカル暦日の翌日0時で計算、固定24時間を足さない)、40件ずつの一覧、縮小画像(長辺256px・同時2件・メモリ上16MiBまで)、拡大画像(長辺1600px・非キャッシュ・個別のみクラウド取得を許可)、解放と個別取消 |
| 設定 | `src/features/settings/model/useDevicePhotosEnabled.ts`、`ui/SettingsScreen.tsx` | 「カレンダーに端末の写真を表示」。既定OFF、真偽値のみ`localStorage`。OFFで要求と画像を即解放。保存不可でもセッション内は保持。Webでは項目を出さない |
| 画面 | `src/features/calendar/model/useDayPhotos.ts`、`ui/DayPhotoSection.tsx`、`ui/DayEventPanel.tsx`、`ui/CalendarScreen.tsx` | 予定一覧の下に折りたたみの写真欄。開くまで権限の確認も要求もしない。仮想化した一覧、1枚の拡大(既存`BottomSheet`/`layerBack`)、権限案内、再取得 |
| iOS | `ios/App/App/DevicePhotosPlugin.swift`、`Info.plist`、`GoogleAuthorizationPlugin.swift`、`project.pbxproj` | PhotoKit。作成日時が無い画像と非表示画像は対象外。用途説明を更新し、`CalendarBridgeViewController`で登録 |
| Android | `DevicePhotosPlugin.java`、`MainActivity.java`、`AndroidManifest.xml` | MediaStore。`DATE_TAKEN`が無い画像は除外。OS別権限(下記)。縮小復号のみ(原寸は復号しない) |
| 文言 | `src/i18n/{source-keys,en,zh,ko,es,fr}.json` | 18件を5言語で追加(翻訳は未校閲) |

### Androidの権限

| OS | 要求する権限 |
|---|---|
| 12以下 | `READ_EXTERNAL_STORAGE`(マニフェストは`maxSdkVersion=32`) |
| 13 | `READ_MEDIA_IMAGES` |
| 14以上 | `READ_MEDIA_IMAGES` + `READ_MEDIA_VISUAL_USER_SELECTED`(後者のみ許可で「一部許可」) |

## 配布前の別ゲート(未実施)

- Android: 広い写真権限(`READ_MEDIA_IMAGES`)のストア側の申告・承認は、仕様どおり配布前の別ゲート。**未申告・未承認**であり、承認が得られるまで配布しない。
- iOS/Android共通: App Storeのプライバシー回答、Google Playのデータセーフティ、プライバシーポリシーへの反映は未実施(仕様でストア設定を変更対象外としたため)。

## 検証結果(この作業環境: Windows)

| 項目 | 結果 |
|---|---|
| `npm test` | レビュー修正後の最終再実行で173ファイル・1704件すべて成功(2026-10-20 23:28開始) |
| `npm run typecheck` | 成功 |
| `npm run lint` | エラー0。警告1件は`src/ui/profile-header-context.tsx`の既存の警告で、今回の変更ではない |
| `npm run build`(Web) | 成功 |
| `npm run build:ios:device` | 成功。公開Supabase設定の読取確認とWeb資産ハッシュを検査。Swiftのコンパイルではない |
| Android JVM単体テスト | `:app:testDebugUnitTest --tests jp.ryo.multicalendar.DevicePhotos*` 9件成功。公開APIの一覧取消・null Cursor・Long日時の検査2件を含む。DebugのJavaコンパイル成功 |

試験の主な観点: 東京の既知UTC境界、夏時間の23時間/25時間、存在しない暦日・100年未満の暦年、OFF/折りたたみ時にAPIを呼ばない、未要求/拒否/一部許可、0件と失敗の区別、日付変更時に古い応答と既表示画像を捨てる、ネイティブ背面通知で拡大を含む画像解放と復帰時の権限再確認、利用者変更、40件ずつの続き読み込みと除外前の取得位置、仮想化、拡大の取消、UTF-16で保守的に数えるキャッシュ16MiB上限、同時生成2件。

## Android OSとの結合検証

専用AVD `MultiCalendar_Photos_20261020`、Android API 36、対象は明示した`emulator-5580`だけ。実機のデータや既存AVDは変更していない。通常の認証画面とは切り離した検証専用ページで、製品と同じ設定フック・予定パネル・写真UI・プラットフォームAPI・ネイティブプラグインを使った。認証・課金・サーバー・広告の結合試験ではない。

- 4000×3000の個人情報を含まない架空画像を使用。最初のPNGの日時指定はMediaStore再走査で失われたため、有効な日付データの証拠に使わない。EXIF撮影日時を埋め込んだJPEGを改めて登録。当日120枚、前日と翌日各1枚、日時不明の画像で確認した。
- **実OSで再現して修正:** Androidの`PluginCall.getDouble`はJSONのLong型を読まないため、ミリ秒日時の整数が`invalid-arguments`になっていた。`getLong`へ修正し、同じAPI入力で成功を確認。
- 実際のOS許可画面で拒否し、画像0件を確認。一部許可ではOSで許可した画像だけが対象となり、翌日の画像は当日の一覧へ混ざらなかった。選び直しから当日の23:59の1枚が表示できた。
- 全部許可時のネイティブ結合試験 `node scripts/qa/device-photos/smoke.mjs` は成功。40・40・40件、全120件の識別子重複なし、当日開始以上・翌日開始未満、256px以下の縮小と1600px以下の拡大、20件の読み込み取消後の完了を確認した。画像や識別子そのものは結果ログへ出力しない。
- 実画面でも縮小256×192、拡大1600×1200、背面化後に画像0件・拡大画面なし、前面復帰後に拡大を再表示しないことを確認。OSの背面遷移が終わる前の瞬間値と区別した。
- Capacitorの自動ログが写真の識別子・日時・画像を含めることを既存SDKで確認し、両OS共通の`loggingBehavior: 'none'`を設定。Android WebViewで`isLoggingEnabled === false`を実測した。アプリ独自のエラー処理は変更しない。
- 日付変更の描画で前日の写真が一瞬残る問題をUI試験で再現し、日付・利用者スコープが一致しない描画では既存画像を出さないよう修正。関連26件成功。ただし、この修正後の端末再導入は実行制限で拒否されたため、最新ソースの仮想端末再確認は未完了。
- 検証用の空画像と予備画像2件だけを専用AVDから除去した。再生成可能な架空データであり、本人の写真は削除していない。残りの架空画像と専用AVDは検証継続用に保持。

### マトリクスの自動試験対応

| 行 | 実行した検査 |
|---|---|
| 全部／一部許可 | `DayPhotoSection.test.tsx`の日時順・一部許可・選び直しと、実MediaStore結合試験 |
| 未要求／拒否 | 同UI試験の明示許可・拒否時の設定案内、OS実ダイアログ |
| 0件／読取失敗 | 同UI試験の空一覧・失敗・再試行と、`DayEventPanel.photos.test.tsx`の予定追加継続 |
| 日付変更／退出／権限撤回 | UIの日付変更・古い応答・ネイティブ背面／撤回・利用者変更・OFF、APIの解放と取消 |
| 大量画像 | UIの仮想化と続き読込、APIの同時2件・16MiB、実OS120枚の分割取得 |
| Web | 設定UIの非表示とAPIの非対応・権限要求なし |

## 未検証・未実施

- **iOS**: Swift(`DevicePhotosPlugin.swift`)はMacが無くコンパイルしていない。`project.pbxproj`の手編集(固有IDは重複なしを確認)もXcodeで開いて確認していない。実機でのPhotoKit動作、限定アクセス、iCloud上の画像の個別取得は未確認。
- **Android**: 本人の実機は未接続。OS別の12以下／13／14は実端末試験未実施(API36のみ)。最新UI修正後のAVD再導入、UI自動巡回の完走、メモリ・アプリディスクの反復実測は未完了。`connected`系ランナー・アンインストール・データ消去は使用していない。
- キャッシュの16MiBは画像文字列をUTF-16上限で数えた値。ブラウザーが復号した描画画像、文字列管理の固定費、OS側キャッシュ、アプリ全体のメモリは別。総メモリの実測上限を保証していない。
- 本人は今回はローカル検証までを指定。GitHub送信、新しいTestFlight、ストア設定・審査版の差し替えは行わない。

## 既知の制約・リスク

- 月の日付選択と日ビュー(内部値week)の両方へ実装。年・月セル・リストへ写真は出さない。
- Androidは「未要求」と「拒否」をOSが区別しないため、要求した履歴と再説明の要否で判定している。`resolveStatus`が`showRationale`を示す場合は再要求し、再要求できない場合に設定アプリでの許可を案内する。
- Androidは`allowNetwork`を使わない(MediaStoreはクラウド上の写真を取得しない)。取得できない画像は案内文を出す。
- 背面化は`visibilitychange`とCapacitorの`appStateChange`を購読する。
- Androidの実行中デコーダーは割込みが最善努力。取消結果は即時に返し、待機処理は削除し、終了したBitmapは破棄するが、OS内部の復号を途中で強制終了できるとは保証しない。
- 一覧検索も取消対象。Androidは別実行枠とCancellationSignal、iOSは検索前・列挙中・返却前の失効確認を使う。PhotoKitの同期検索そのものを強制中断できるとは保証しない。
- 旧Android(API24〜27)のEXIF反転を含む全8方向とiOSの極細画像の下限1pxは修正済みだが、該当OSの実画像での確認は残る。
- iOSの用途説明(`NSPhotoLibraryUsageDescription`)は日本語のみ。`InfoPlist.strings`による多言語化は既存になく、今回も行っていない。

## レビュー後の局所修正

3担当の19指摘は仕様のReview Triage Logへ個別記録した。本人の承認に従い検証済み実装を保持し、画面外の縮小画像と一覧検索自体の取消を局所修正した。null Cursor、旧AndroidのEXIF反転、iOSの極細画像、取得中表示、検証準備の初回・重複防止、存在しないローカル日付と深夜0時の夏時間境界も修正。製品CalendarScreenの月／日と編集／詳細の4経路、続き取得だけの失敗・再試行も回帰試験で確認した。停止配線を外すと4経路とも試験が失敗することを確認して復元した。ローカル修正は完了したが、未検証の実OS・容量反復・配布前ゲートがあるため配布可能とはしない。

### 検証資産の扱い

`scripts/qa/device-photos/`は認証・課金・広告を使わない専用AVD用の検証資産。`seed.mjs`は既存QA_EXIF_画像があれば削除せず停止する。登録済みなら再投入せず既存画像で`smoke.mjs`を実行する。製品ビルドには検証ページを入れず、配布前は正規のWebビルドとCapacitor資産コピーで作り直す。今回、最新版をAVDへ再導入する操作は実行制限で拒否され、回避や別経路での導入は行っていない。

写真一覧を開いている間に別の外部処理が既取得画像を削除した場合、数値の取得位置がずれる制約がある。通常の写真アプリへの移動・復帰時は初めから読み直すが、前面のままライブラリが同時変更された場合は写真欄を開き直して再取得する。今回の対象では検索結果固定や新しいカーソル方式は採用しないと判定した。
