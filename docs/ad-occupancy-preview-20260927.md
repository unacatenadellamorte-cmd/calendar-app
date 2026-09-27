# 広告の画面占有率イメージ

2026-09-27、ユーザー依頼に基づく表示イメージ。実配信の測定値ではない。

- 現在のコードはADAPTIVE_BANNER、BOTTOM_CENTER。AdBanner.tsxが下部タブ高さをmarginとして渡すため、広告はタブの直上に配置される。
- SDKのSizeChangedイベントの高さをCSSの余白へ反映。ダイアログまたはキーボード表示中は広告を抑止する。
- 既存の20260926_multi-calendar_raw-month.pngを参考に広告なし・ありの比較画像を生成。高さ820dpの画面に広告60dpを仮定した場合は60/820×100=約7.3%。実機やSDKから取得した広告サイズではない。
- 保存先: AI作業場/出力画像/20260927_multi-calendar_ad-occupancy-final.png。
- アプリの実装・広告設定・公開中のサービスは変更なし。
- 指定されたObsidian Vault/AGENTS.mdが現在の環境に存在せず、vault記録は未実施。本ファイルに作業記録を残す。

