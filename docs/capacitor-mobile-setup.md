# Epic 5 の環境準備手順(Capacitor / モバイルアプリ化)

Epic 5(スマホアプリ化)の基盤ストーリー(5.1)で `@capacitor/core` を導入し、`ios/` / `android/`
ネイティブプロジェクトを追加した。ここは **Ryo さんが手元でビルド・実機確認するときの手順**と、
実装中に踏んだ環境の落とし穴をまとめたもの。`docs/google-connection-setup.md` と同じ立ち位置のドキュメント。

---

## 全体像

- プロダクト識別子は `jp.ryo.multicalendar`(2026-09-17ユーザー確定)。
  `capacitor.config.ts` の `appId`、Android の `applicationId`/`namespace`
  (`android/app/build.gradle`)、iOS の `PRODUCT_BUNDLE_IDENTIFIER`
  (`ios/App/App.xcodeproj`)はすべてこの値で揃っている。
- ディープリンクスキームは `calendar-app://`(AD-16)。`calendar-app://event/{id}` と
  `calendar-app://day/{date}` の2形式のみ。受け口は `src/app/DeepLinkListener.tsx` の1箇所。
- 本ストーリーでビルド・エミュレータ確認まで完了しているのは **Android のみ**。開発機が
  Windows のため iOS(Xcode)のビルド確認はできない(下記「iOS(Mac 確保後のフォローアップ)」参照)。

---

## Android — ビルド・エミュレータ確認の手順

### 前提環境(この開発機で確認済みの構成)

- Android SDK: `%LOCALAPPDATA%\Android\Sdk`(`ANDROID_HOME` に設定済み)
- AVD: `Pixel_7_API_36`(Android Studio で作成済み)
- JDK: **Eclipse Adoptium Temurin 21**(`C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot`)

### 落とし穴1: Android Studio 同梱の JBR (JDK 25) では Gradle が動かない

`JAVA_HOME` が Android Studio 同梱の JBR(`...\Android Studio\jbr`、JDK 25)を指していると、

```
BUG! exception in phase 'semantic analysis' in source unit '_BuildScript_'
Unsupported class file major version 69
```

で Gradle が落ちる(Gradle 8.14.3 は JDK 25 未対応)。ビルド前に **JDK 21 を明示的に指す**こと。

```powershell
$env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-21.0.12.8-hotspot"
cd android
.\gradlew.bat assembleDebug
```

### 落とし穴2: プロジェクトパスの日本語(非 ASCII)で AGP がビルド拒否する

このリポジトリは `...\デスクトップ\AI作業場\calendar-app` という日本語混じりのパスに置かれているため、
素の Android Gradle Plugin は

```
Your project path contains non-ASCII characters. This will most likely cause the
build to fail on Windows. ... This warning can be disabled by adding the line
'android.overridePathCheck=true' to gradle.properties
```

でビルドを止める。`android/gradle.properties` に `android.overridePathCheck=true` を追加済み
(この設定でビルド・実機確認まで通ることは確認済み)。ネイティブ(NDK/JNI)コードを将来追加する場合は、
このパス問題が実際に悪さをしないか再確認すること。

### 落とし穴3: `android/local.properties` が無いと SDK パスを見つけられない

`android/local.properties` は `.gitignore` 対象(各自の環境に依存するため)。無ければ以下の1行を作る。

```properties
sdk.dir=C\:/Users/Ryo/AppData/Local/Android/Sdk
```

### ビルド〜エミュレータ起動〜ディープリンク確認

```powershell
# 1. Web ビルド → Android へ同期
npm run build
npx cap sync android

# 2. デバッグ APK をビルド(JDK 21 を指すこと。落とし穴1参照)
cd android
.\gradlew.bat assembleDebug

# 3. エミュレータを起動(AVD マネージャからでも可)
cd "$env:LOCALAPPDATA\Android\Sdk\emulator"
.\emulator.exe -avd Pixel_7_API_36

# 4. インストールして起動(別ターミナルで)
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -W -n jp.ryo.multicalendar/.MainActivity

# 5. ディープリンクの動作確認(実装時に以下すべて実機/エミュレータで確認済み)
adb shell am start -W -a android.intent.action.VIEW -d "calendar-app://day/2026-09-20"
adb shell am start -W -a android.intent.action.VIEW -d "calendar-app://event/<既存の予定id>"
```

確認済みの挙動(I/O & Edge-Case Matrix どおり):

| コマンド | 結果 |
| --- | --- |
| `calendar-app://day/2026-09-20` | カレンダー画面の週ビューが「9月20日(日)」へ遷移 |
| `calendar-app://event/<存在しないID>` | エラー無し・シート無しでカレンダー画面のまま(静かにフォールバック) |
| `calendar-app://unknown/xyz`(未知の形式) | 何も起きない(画面そのまま、クラッシュ無し) |
| `calendar-app://event/<実在する予定ID>` | 該当予定の編集/詳細シートが開く(vitest の自動テストで検証。`src/features/calendar/ui/CalendarScreen.test.tsx` の `initialEventId` テスト群) |

`npm run build` のたびに `npx cap sync android` を忘れないこと(`dist/` の中身が
`android/app/src/main/assets/public` にコピーされる。忘れるとエミュレータ上で古い Web 版が動く)。

---

## 端末カレンダー権限(Story 5.2)

`@ebarooni/capacitor-calendar` 経由で端末のカレンダーを読み取り専用で取り込む
(ARCHITECTURE-SPINE Epic5 AD-13)。権限は Android/iOS で区分が違う:

| プラットフォーム | 要求する権限 | 宣言場所 |
| --- | --- | --- |
| Android | `READ_CALENDAR`(読み取り専用の区分あり) | `android/app/src/main/AndroidManifest.xml` |
| iOS | full access(読み取り専用の区分が無い。`requestFullCalendarAccess()` を使う) | `ios/App/App/Info.plist` の `NSCalendarsUsageDescription`(iOS 13-16)・`NSCalendarsFullAccessUsageDescription`(iOS 17+) |

どちらも `WRITE_CALENDAR` / `NSCalendarsWriteOnlyAccessUsageDescription` は追加しない。
アプリのコードが書き込み系 API(`createCalendar` / `modifyCalendar` / `deleteCalendar` 等)を
一切呼ばないため、iOS で権限ダイアログの文言が「読み書き」相当になっていても、実際の挙動としての
「読み取り専用」原則(AD-13, NFR13)は保たれる。

Android はエミュレータ(`Pixel_7_API_36`)で許可ダイアログの実地確認まで可能:

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat assembleDebug
adb install -r android\app\build\outputs\apk\debug\app-debug.apk
adb shell am start -W -n jp.ryo.multicalendar/.MainActivity
```

設定画面の「端末カレンダーを接続」をタップ → OS の権限ダイアログで許可 → 端末のカレンダー
(通常は「バースデー」等が最低1つ存在)が選択画面の一覧に出ることを確認する。

iOS は `Info.plist` の設定のみで、Xcode でのビルド確認はしていない(開発機が Windows のため。
Story 5.1 と同じ理由。下記「iOS(Mac 確保後のフォローアップ)」に合流する)。

---

## iOS(Mac 確保後のフォローアップ)

Story 5.5でWidgetKit拡張とmacOS CIの検証手順を追加した。
具体的なコマンド・認証・実機確認は[ iOSビルド検証とClaude連携](ios-ci-and-claude.md)を参照する。

このプロジェクトはSwift Package Manager構成。`npm run build` → `npx cap sync ios`で
プラグイン登録を更新し、RubyスクリプトでWidget Extensionを追加してからXcodeで開く。
WindowsでのWebテストだけではSwiftや署名を検証できない。macOS CIの成功と実機確認を区別する。
旧手順の`pod install`はこの構成では使わない。

---

## プロダクト識別子を変更するとき

`jp.ryo.multicalendar` は2026-09-17の確定値。将来識別子を変更するときは、以下を**同一 PR で同時に**変更する
(一部だけ変えると App Group やディープリンクの整合が壊れ、実機で静かに失敗する):

- `capacitor.config.ts` の `appId`
- `android/app/build.gradle` の `namespace` / `applicationId`
- `ios/App/App.xcodeproj` の `PRODUCT_BUNDLE_IDENTIFIER`(2箇所: Debug/Release)
- `android/app/src/main/AndroidManifest.xml` の intent-filter(`android:scheme`)
- `ios/App/App/Info.plist` の `CFBundleURLSchemes`
- (5.2 以降で追加される)App Group ID `group.jp.ryo.multicalendar.widget`
