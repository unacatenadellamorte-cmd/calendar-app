---
review-type: 技術検証(Web調査)
target: ../ARCHITECTURE-SPINE.md
target-section: Stack
reviewed-at: '2026-09-12'
reviewer: 技術検証レビュアー(サブエージェント)
---

# 技術検証レビュー — ARCHITECTURE-SPINE.md Stack セクション

対象: `architecture-calendar-app-epic5-2026-09-12/ARCHITECTURE-SPINE.md` の `## Stack` セクション(および同セクションで言及される API がドキュメント本文中の他箇所 AD-14 / AD-15 でどう使われているか)。

検証方法: npm registry(registry.npmjs.org)への直接問い合わせ、npmjs.com / GitHub リポジトリの Web 検索・フェッチ。実行日は 2026-09-12。

## 総合verdict

**Stack セクションに書かれた4件のパッケージはすべて実在し、記載APIも実在する。致命的な誤り(タイポ・存在しないパッケージ名・存在しないAPI)は無し。軽微なバージョン表記の陳腐化(執筆直後の patch 更新)と、1件(capacitor-widget-bridge)のメンテナンス体制の薄さのみ要注意。**

---

## 1. `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` 8.5.1

- **実在性:** 実在する。3パッケージとも npm registry 上に存在し、Ionic 公式(ionic-team/capacitor)のモノレポで一括バージョニングされている。
- **バージョン表記:** 妥当。npm registry を直接確認したところ、3パッケージとも `8.5.1`(2026-08-31 リリース)を経て、調査時点では `8.5.2` が最新(リリースはごく直近、ドキュメント作成日である 2026-09-12 の前後わずか十数時間以内と推定される)。ドキュメントの「8.5.1(2026-09-12 npm 確認)」という記載は、執筆時点では正確だった可能性が高い。ただし調査時点では 1 patch 分古い表記になっている。実装着手時に `npx cap sync` 前提で最新 patch を再確認すべき、という程度の軽微な指摘。
- **3パッケージ間のバージョン一致:** core / ios / android の3つとも同一バージョン番号(8.5.x)で揃っており、Capacitor のモノレポ運用と整合する。不自然な組み合わせではない。
- **メンテナンス状況:** 問題なし。Ionic 公式の第一級パッケージ、活発にメンテナンスされている。

## 2. `capacitor-widget-bridge`(kisimediaDE 製)8.0.0 系

- **実在性:** 実在する。npm 上のパッケージ名 `capacitor-widget-bridge`、GitHub リポジトリ `github.com/kisimediaDE/capacitor-widget-bridge`。ただし npmjs.com のパッケージページ自体は直接フェッチ時にアクセス拒否(403)になったため、npm registry API(`registry.npmjs.org/capacitor-widget-bridge`)経由で内容を確認した。説明文は「Capacitor plugin to bridge data between your app and iOS/Android widgets using shared preferences and timeline updates」で、ドキュメントの用途説明(共有ストレージ経由でタイムライン更新)と一致する。
- **バージョン表記:** ほぼ妥当だが軽微なずれあり。npm 上の最新は `8.1.0`(公開: 2026-03-03 頃)。ドキュメントは「8.0.0 系(要バージョン固定)」としており、実際にはすでに 8.1.0 が出ている。致命的ではないが、「8.0.0系」という表記は半歩古い。
- **Capacitor 8.x 対応:** 確認できた。8.1.0 の `peerDependencies` は `@capacitor/core: >=8.0.0` で、AD-11 の Capacitor 8.x 採用方針と整合する。
- **メンテナンス状況(要注意ポイント):** GitHub 上でスター57、オープンissue 0、コミット52。個人(kisimediaDE、単独メンテナ)による小規模プラグインであり、Ionic公式や ebarooni 版カレンダープラグインと比べて開発体制が薄い。放棄されているわけではない(2026年3月時点で更新あり)が、**単一メンテナへの依存というバスファクター・リスク**がある。ドキュメントの「要バージョン固定」という注記はこのリスクを部分的に認識しているが、「メンテナンス体制が薄い個人プラグインである」旨は明記されていない。この点は Deferred/リスク欄に一言足しておく価値がある。

## 3. `@ebarooni/capacitor-calendar`(`requestReadOnlyCalendarAccess()` の記載)

- **実在性:** 実在する。npm 上に `@ebarooni/capacitor-calendar` として存在し、GitHub `github.com/ebarooni/capacitor-calendar`(スター86、オープンissue 4、878コミット、非アーカイブ)。作者本人により継続的にメンテナンスされている。
- **API の実在確認:** `requestReadOnlyCalendarAccess()` は実在する。このプラグインは権限まわりのAPIとして `requestWriteOnlyCalendarAccess()` / `requestReadOnlyCalendarAccess()` / `requestFullCalendarAccess()` / `requestFullRemindersAccess()` という粒度別のメソッド群を提供しており、ドキュメント(AD-13)の「読み取り専用のみ要求する」という設計方針とAPI名が正確に対応している。
- **バージョン・Capacitor 8.x対応:** 最新版 `8.6.0` の `peerDependencies` は `@capacitor/core: >=8.0.0` で、README にも Capacitor 8.x 対応バッジが確認できた。ドキュメントの「最新(Capacitor 8.x 対応)」という記載は正確。
- **補足(参考情報、問題ではない):** `Cap-go/capacitor-calendar` という、この ebarooni 版を Capgo のプラグインテンプレートに移植したフォークも存在する。ただし ebarooni 本家がすでに Capacitor 8 系に対応し活発にメンテされているため、フォークへの乗り換えを検討する必然性は今のところ無い。将来 ebarooni 版のメンテが止まった場合の代替候補として頭に入れておく程度でよい。
- **メンテナンス状況:** 良好。放棄・非推奨の兆候なし。

## 4. `@capacitor/local-notifications` 8.x系(公式)

- **実在性・第一級パッケージ性:** 実在する。Ionic 公式(ionic-team/capacitor-plugins モノレポ)配下の first-party プラグインであり、`@capacitor/*` スコープに置かれている点も含めて記載通り。
- **バージョン表記:** 妥当。npm registry 確認で最新 `8.3.1`、メジャーバージョンは Capacitor 本体と同じ 8 系。「8.x 系(公式 first-party)」という粒度の粗い書き方は、本体と歩調を合わせて patch が細かく動くプラグインの記載としてはむしろ適切(ここだけピンポイントの patch を書くと逆にすぐ陳腐化する)。
- **API の実在確認:** ドキュメント本文(AD-15)が使っている `cancel()` / `schedule()` はいずれも実在するメソッド。加えて依頼元から確認observation対象に挙がっていた `update()` / `getPending()` も実在を確認済み(`update()` は id で既存の予約済み通知を更新、`getPending()` は予約中の通知一覧取得)。ただし AD-15 の実装方針自体は `cancel()` → 必要なら `schedule()` の再登録であり、`update()` は使っていない。これはAPIの誤用ではなく、単純に「更新」ではなく「取り消してから作り直す」という設計判断であり妥当な選択。
- **メンテナンス状況:** 問題なし。Ionic 公式、Capacitor 本体とロックステップでメンテナンスされている。

---

## まとめ(指摘の優先順位)

| # | 深刻度 | 指摘内容 |
| --- | --- | --- |
| 1 | 低 | `capacitor-widget-bridge` は個人(単独メンテナ)による小規模プラグイン(スター57、コミット52)。放棄はされていないが、Ionic公式や ebarooni版カレンダープラグインに比べて体制が薄く、バスファクターリスクがある。ドキュメントに一言「単一メンテナ依存のリスクあり」と明記する価値がある。 |
| 2 | 低 | `capacitor-widget-bridge` の最新は `8.1.0` であり、ドキュメントの「8.0.0 系」は半歩古い表記。実装着手時に再確認が必要(ドキュメント自身も「要バージョン固定」と注記済みなので実害は小さい)。 |
| 3 | 極小 | `@capacitor/core`/`ios`/`android` は執筆直後(調査時点)に `8.5.1` → `8.5.2` へ patch が上がっている。ドキュメント記載の 8.5.1 自体は執筆時点で正確だったとみられ、通常の patch churn の範囲。 |
| — | 問題なし | `@ebarooni/capacitor-calendar` の `requestReadOnlyCalendarAccess()` は実在し記載通り。Capacitor 8.x 対応も確認済み。 |
| — | 問題なし | `@capacitor/local-notifications` は公式 first-party で実在。`cancel()`/`schedule()`(本文で使用)、`update()`/`getPending()`(依頼元確認対象)いずれも実在するAPI。 |

タイポ・存在しないパッケージ名・存在しないAPIの類は見つからなかった。全体として Stack セクションの技術決定は現行(2026年9月時点)のものとして妥当と判断する。
