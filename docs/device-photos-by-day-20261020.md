# 選択日の端末写真一覧：設計調査（2026-10-20）

## 本人の指示と現状

- 本人が、その日に撮影した端末写真ライブラリ全体の一覧を希望。審査対応とは別版に分割済み。
- 今回、AGENTS.mdを保持・除外し、専用ブランチでキャッシュ過多を避ける進め方を本人が承認した。
- 基点は`8f7e2840cfa0fbb51fcbbfe7e071f49727c55933`、ブランチは`feature/device-photos-by-day-20261020`。
- 仕様は`_bmad-output/implementation-artifacts/spec-device-photos-by-day-20261020.md`のdraft。コード変更・画像アクセス・実機試験・新配布・ストア変更なし。審査中30に新機能を混ぜない。

## コードで確認したこと

- `CalendarScreen.tsx`に月表示の`selectedDay`と日ビューの`cursor`がある。月では`DayEventPanel.tsx`へ予定一覧を描画している。
- 写真ライブラリの日付別一覧ブリッジは未実装。既存のプロフィール・背景の画像入力だけでは、ライブラリ全体を日付で一覧できない。
- `backgroundImage.ts`はIndexedDBへ背景Blobを保存する設計。この永続保存経路は今回の写真一覧には使わない。
- iOSの独自ブリッジ登録点は`GoogleAuthorizationPlugin.swift`内の`CalendarBridgeViewController`。Androidは`MainActivity.java`。
- 写真権限はAndroid Manifestに未宣言。SDKの設定はmin24／target36。iOSの写真用途説明はプロフィール・背景用のため、機能追加時に見直す必要がある。
- 日付は既存のローカル暦日と整合させる。撮影・作成日時が分からない画像を、追加日や更新日で「撮影した日」と偽らない。

## 公式資料で確認した条件

- [Google Playの最小スコープ権限方針](https://support.google.com/googleplay/android-developer/answer/16935362?hl=ja)：写真全体を読む権限は、選択ツールだけでは中核機能を提供できない場合に限定され、申告・審査が必要。カレンダーの追加機能として認められるかは未確認。クローズドテストをこの要件の免除と推測しない。
- [Androidの限定写真アクセス](https://developer.android.com/about/versions/14/changes/partial-photo-video-access)：全部許可だけでなく限定許可・再選択・復帰時の権限変更に対応する必要がある。権限や一覧を恒久キャッシュして真実源にしない。
- [Appleの画像取得とキャッシュ](https://developer.apple.com/documentation/photokit/loading-and-caching-assets-and-thumbnails)：指定寸法の縮小画像を取得でき、OS側も画像をキャッシュする。アプリ独自キャッシュを制限してもOSの総容量・総メモリを保証することにはならない。
- [Appleのクラウド取得制御](https://developer.apple.com/documentation/photos/phimagerequestoptions/isnetworkaccessallowed)：クラウドにしかない画像は、ネットワーク取得を許すかで結果が異なる。
- [Appleの作成日時](https://developer.apple.com/documentation/photos/phasset/creationdate?changes=_5%2C_5&language=objc%2Cobjc)：画像の作成日時は任意値で、ライブラリ追加日時とは別。ライブラリ日時が実際の撮影地・撮影日時を常に正確に表すという保証ではない。

Grokは既存連携チームに登録がなく、今回の調査はCodexが公式資料で補った。Claudeは名簿上の登録のみ確認し、接続応答や実装依頼・成果の受信はまだ行っていない。

## 提案と本人の選択

提案は、月の日付選択後と日ビューに折りたたみ式写真欄を置き、開く操作で権限を求める形。写真をサーバーへ送らず、独自の画像ディスク保存0、縮小画像のメモリキャッシュ16MiB以下・要求寸法256px以下・生成同時数2以下を目標にする。分割取得と仮想化で、画像数に比例してDOMやメモリを保持し続けない。拡大は1枚の表示用縮小画像に限定する。これらはまだ実装・実測されていない設計値。

2026-10-20、本人が「1B、2A、3B」を選択した。

1. 両OSを実装し、Android配布前に広い写真権限の申告・承認を別途確認する。承認可否はまだ未確認。
2. ライブラリの作成・撮影日時で、スクショ・保存画像も含める。日時不明は除外し、追加日・更新日で撮影日を代用しない。
3. クラウド取得は個別画像を開いた時だけOS経由で許す。OSが提供できない画像まで表示可能とは説明しない。

本人は画像表示のON・OFF設定も追加依頼した。仕様案では「カレンダーに端末の写真を表示」を設定へ置き、既定OFF、端末内へ真偽値のみ保存する。ONでも写真欄を開くまでは権限を要求せず、OFFでは読込・待機中要求・表示・拡大画像を解放し、再起動後もOFFを保持する。保存失敗時は同一セッションで設定を保つ。アプリのOFFはOS権限撤回ではないと案内する。

未決事項の欄は解消。BMadの仕様全体承認チェックポイントで停止し、draftを維持する。承認後にClaudeへ範囲限定で作成依頼し、Codexが統合・修正・検証を行う。今回、製品コード変更・新しい権限による写真取得・ストア配布は行わない。
