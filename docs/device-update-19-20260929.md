# 修正版19の実機反映（2026-09-29）

ユーザーから端末反映を依頼され、USBデバッグ再許可後にSM-F956Qを更新した。

- 既存版18（1.0.17）はGoogle Play配信署名へ変わっていた。実機からbase.apkを読み出し、証明書SHA-256を確認した。
- 色プリセット24色、年表示・代表ウィジェットのラベル色、シフト色の保存・取得修正を含む1.0.18（19）をビルド。既存の本番環境設定を使い、アップロード鍵でAABを署名。
- Play Consoleの「すべてのApp Bundle」から19を登録。未公開・リリース0件の状態で署名済みユニバーサルAPKを取得した。テスター向け配信は変更していない。
- ダウンロードした19.apkはパッケージjp.ryo.multicalendar、versionCode19、versionName1.0.18。既存版と同じ証明書SHA-256 `3edd49d697629a530267b6e22106ff301c2812b54b76a6eaf127b3116d6cc61f` を検証。
- 対象実機を明示した `adb install -r` がSuccess。実機のversionCode19、versionName1.0.18、更新日時09:42:41を確認。初回インストール日時2026-09-26 17:20:29は維持。
- アンインストール・データ消去・全接続端末のテストランナーは実行していない。個別予定の表示内容や色の実画面確認は未実施。

保存APK: `C:/Users/Ryo/AppData/Local/calendar-app/device-update-20260929/multi-calendar-19-play-signed.apk`。
AAB SHA-256: `40784978827A6DA801C6D646E1A06CB27D76D99BF65D0BD10B78C5CD4ED9E3F8`。
PlayバンドルID: 4860235220440885887。既存Alpha18は有効、今回19は未公開。

## 更新後の再確認（2026-09-29）
ユーザーが色プリセットとシフト色継承の未反映を報告。接続実機のdumpsysを再確認するとversionCode18/versionName1.0.17、lastUpdateTimeとfirstInstallTimeが2026-09-29 09:56:37となっていた。installerPackageNameとinitiatingPackageNameはいずれもcom.android.vending。前回09:42の19への上書き成功後、Play経由で修正前の18が再インストールされたことを確認。手動操作・自動保護等、再インストールのきっかけは未確認で断定しない。
Play側は18が配信中、19は登録のみで未公開だった。修正版をPlayから取得するには19のテスト配信への反映が残る。今回の問い合わせでは端末・Play配信を変更せず、原因の説明と記録のみ実施。
