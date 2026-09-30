"""配布署名を検証し、一時的な鍵・プロファイルを必ず片づける。"""
import base64
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import plistlib
import re
import secrets
import shutil
import subprocess
import sys
import zipfile

APP = "jp.ryo.multicalendar"
WIDGET = APP + ".FeaturedEventsWidget"
GROUP = "group.jp.ryo.multicalendar.widget"
BUNDLES = (APP, WIDGET)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def diagnostic_tail(output, redactions):
    text = output.decode("utf-8", errors="replace")
    for value in sorted(set(redactions), key=len, reverse=True):
        if value:
            text = text.replace(value, "[非表示]")
    text = re.sub(r"-----BEGIN [^-]*PRIVATE KEY-----.*?-----END [^-]*PRIVATE KEY-----", "[秘密鍵を非表示]", text, flags=re.DOTALL)
    text = re.sub(r"(?im)^.*(?:PASSWORD|SECRET|TOKEN|_BASE64)\s*[=:].*$", "[秘密を含む設定行を非表示]", text)
    text = re.sub(r"(?i)(Bearer\s+)\S+", r"\1[非表示]", text)
    text = re.sub(r"[A-Za-z0-9_+/-]{120,}={0,2}", "[長い資格情報を非表示]", text)
    return "\n".join(text.splitlines()[-80:])[-16000:]


def run(args, diagnostic_redactions=None, **kwargs):
    # securityの引数・出力は診断対象にしない。Xcode診断も秘密環境変数の除去後だけ許可する。
    result = subprocess.run(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        if Path(args[0]).name == "xcodebuild" and diagnostic_redactions is not None:
            require(not any(os.environ.get(key) for key in ("IOS_DISTRIBUTION_P12_BASE64", "IOS_DISTRIBUTION_P12_PASSWORD", "IOS_APP_PROFILE_BASE64", "IOS_WIDGET_PROFILE_BASE64")), "秘密環境変数の除去前はXcode診断を表示できません。")
            print("xcodebuildの診断（秘密を除いた末尾）:\n" + diagnostic_tail(result.stdout + b"\n" + result.stderr, diagnostic_redactions), file=sys.stderr)
        raise ValueError("配布署名のコマンドに失敗しました: " + Path(args[0]).name)
    return result.stdout


def validate_profile(profile, bundle, team, now=None):
    now = now or dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    ent = profile.get("Entitlements", {})
    require(profile.get("TeamIdentifier") == [team], "プロファイルのTeamが一致しません。")
    require(profile.get("ApplicationIdentifierPrefix") == [team], "プロファイルのApp ID接頭辞が一致しません。")
    require(ent.get("application-identifier") == team + "." + bundle, "プロファイルのBundle IDが一致しません。")
    require(ent.get("com.apple.developer.team-identifier") == team, "権限のTeamが一致しません。")
    require(ent.get("com.apple.security.application-groups") == [GROUP], "プロファイルのApp Groupが一致しません。")
    require(ent.get("get-task-allow") is False, "開発用プロファイルは使えません。")
    require(ent.get("beta-reports-active") is True, "App Store配布用プロファイルが必要です。")
    require(not profile.get("ProvisionedDevices") and not profile.get("ProvisionsAllDevices"), "端末限定・社内配布用プロファイルは使えません。")
    require("iOS" in profile.get("Platform", []), "iOS用プロファイルが必要です。")
    require(isinstance(profile.get("CreationDate"), dt.datetime) and isinstance(profile.get("ExpirationDate"), dt.datetime), "プロファイルの有効期間が不正です。")
    require(profile["CreationDate"] <= now < profile["ExpirationDate"], "プロファイルの有効期間外です。")
    require(re.fullmatch(r"[0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12}", profile.get("UUID", "")), "プロファイルのUUIDが不正です。")
    require(profile.get("DeveloperCertificates"), "プロファイルに配布証明書がありません。")
    return {hashlib.sha1(cert).hexdigest().upper() for cert in profile["DeveloperCertificates"]}


def validate_entitlements(ent, bundle, team):
    require(ent.get("application-identifier") == team + "." + bundle, "署名後のBundle IDが一致しません。")
    require(ent.get("com.apple.developer.team-identifier") == team, "署名後のTeamが一致しません。")
    require(ent.get("com.apple.security.application-groups") == [GROUP], "署名後のApp Groupが一致しません。")
    require(ent.get("get-task-allow") is not True, "署名後のデバッグ権限を拒否しました。")


def validate_manifest(path):
    with path.open("rb") as stream:
        manifest = plistlib.load(stream)
    reasons = next((item.get("NSPrivacyAccessedAPITypeReasons", []) for item in manifest.get("NSPrivacyAccessedAPITypes", [])
                    if item.get("NSPrivacyAccessedAPIType") == "NSPrivacyAccessedAPICategoryUserDefaults"), [])
    require("1C8F.1" in reasons, "App Groupのプライバシー宣言が同梱されていません。")


def workdir():
    parent = Path(os.environ["RUNNER_TEMP"]).resolve()
    path = (parent / "calendar-ios-release-signing").resolve()
    require(path.parent == parent, "署名用の一時パスが不正です。")
    return path


def cleanup():
    path = workdir()
    if not path.exists():
        return
    failures = []
    state_path = path / "cleanup.json"
    try:
        state = json.loads(state_path.read_text()) if state_path.exists() else {}
    except Exception:
        state = {}
        failures.append("state")
    for entry in state.get("profiles", []):
        profile_path = Path(entry)
        allowed = [Path.home() / "Library/MobileDevice/Provisioning Profiles", Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles"]
        if profile_path.parent in allowed and re.fullmatch(r"[0-9A-Fa-f-]{36}\.mobileprovision", profile_path.name):
            try:
                profile_path.unlink(missing_ok=True)
            except OSError:
                failures.append("profile")
    if state.get("keychains"):
        try:
            run(["security", "list-keychains", "-d", "user", "-s", *state["keychains"]])
        except Exception:
            failures.append("search-list")
    keychain = path / "distribution.keychain-db"
    if keychain.exists():
        try:
            run(["security", "delete-keychain", str(keychain)])
        except Exception:
            failures.append("keychain")
    # 一つの削除失敗で、残りの秘密の片づけを止めない。
    try:
        shutil.rmtree(path)
    except OSError:
        failures.append("temporary-files")
    if failures:
        # always処理が再試行できるよう、秘密を含まない片づけ一覧だけ残す。
        path.mkdir(mode=0o700, exist_ok=True)
        state_path.write_text(json.dumps(state))
    require(not failures, "署名素材の後片づけが一部失敗しました。ランナーの廃棄を確認してください。")


def verify_app(app, settings):
    for directory, bundle in [(app, APP), (app / "PlugIns/FeaturedEventsWidget.appex", WIDGET)]:
        require(directory.is_dir(), "アプリまたはウィジェットがありません。")
        run(["codesign", "--verify", "--deep", "--strict", str(directory)])
        info = plistlib.loads((directory / "Info.plist").read_bytes())
        require(info.get("CFBundleIdentifier") == bundle, "成果物のBundle IDが一致しません。")
        require(info.get("CFBundleShortVersionString") == os.environ["IOS_RELEASE_VERSION"] and info.get("CFBundleVersion") == os.environ["IOS_RELEASE_BUILD"], "成果物のバージョンが一致しません。")
        validate_manifest(directory / "PrivacyInfo.xcprivacy")
        ent = plistlib.loads(run(["codesign", "-d", "--entitlements", ":-", str(directory)]))
        validate_entitlements(ent, bundle, settings["team"])
        profile = plistlib.loads(run(["security", "cms", "-D", "-i", str(directory / "embedded.mobileprovision")]))
        certificates = validate_profile(profile, bundle, settings["team"])
        require(profile["UUID"] == settings["profiles"][bundle] and settings["identity"] in certificates, "同梱された配布プロファイルが一致しません。")
        certificate_dir = workdir() / ("app-certificate" if bundle == APP else "widget-certificate")
        certificate_dir.mkdir(exist_ok=True)
        run(["codesign", "-d", "--extract-certificates", str(directory)], cwd=certificate_dir)
        actual = hashlib.sha1((certificate_dir / "codesign0").read_bytes()).hexdigest().upper()
        require(actual == settings["identity"], "成果物の配布証明書が一致しません。")
    info = plistlib.loads((app / "Info.plist").read_bytes())
    require(info.get("GIDClientID") == os.environ["GOOGLE_IOS_CLIENT_ID"] and info.get("GIDServerClientID") == os.environ["GOOGLE_SERVER_CLIENT_ID"], "Google設定がネイティブ成果物と一致しません。")
    schemes = [scheme for item in info.get("CFBundleURLTypes", []) for scheme in item.get("CFBundleURLSchemes", [])]
    require(os.environ["GOOGLE_IOS_REVERSED_CLIENT_ID"] in schemes and "calendar-app" in schemes, "URLの戻り設定が不足しています。")
    require(info.get("GADApplicationIdentifier") == os.environ["ADMOB_IOS_APP_ID"], "ネイティブの広告設定が一致しません。")


def save_artifacts(ipa, archive, output):
    symbols = archive / "dSYMs"
    require(symbols.is_dir() and any(symbols.glob("*.dSYM")), "配布archiveのdSYMがありません。")
    output.mkdir(exist_ok=False)
    shutil.copyfile(ipa, output / "Multi-calendar.ipa")
    # archive全体や署名素材は含めず、クラッシュ解析に必要なdSYMsだけを保存する。
    shutil.make_archive(str(output / "Multi-calendar-dSYMs"), "zip", root_dir=archive, base_dir="dSYMs")


def release():
    required = ["IOS_DISTRIBUTION_P12_BASE64", "IOS_DISTRIBUTION_P12_PASSWORD", "IOS_APP_PROFILE_BASE64", "IOS_WIDGET_PROFILE_BASE64", "APPLE_TEAM_ID"]
    for key in required:
        require(bool(os.environ.get(key)), key + "が未設定です。")
    team = os.environ["APPLE_TEAM_ID"]
    require(re.fullmatch(r"[A-Z0-9]{10}", team), "APPLE_TEAM_IDが不正です。")
    require(re.fullmatch(r"(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)", os.environ.get("IOS_RELEASE_VERSION", "")), "versionが不正です。")
    require(re.fullmatch(r"[1-9]\d{0,8}", os.environ.get("IOS_RELEASE_BUILD", "")), "buildが不正です。")
    path = workdir()
    require(not path.exists(), "署名用の一時ディレクトリが既にあります。先にcleanupを実行してください。")
    path.mkdir(mode=0o700)
    state = {"profiles": [], "keychains": re.findall(r'"([^"\n]+)"', run(["security", "list-keychains", "-d", "user"]).decode())}
    state_path = path / "cleanup.json"
    state_path.write_text(json.dumps(state))
    profiles = {}
    common_certificates = None
    for bundle, key in [(APP, "IOS_APP_PROFILE_BASE64"), (WIDGET, "IOS_WIDGET_PROFILE_BASE64")]:
        source = path / (bundle + ".mobileprovision")
        source.write_bytes(base64.b64decode(os.environ[key], validate=True))
        profile = plistlib.loads(run(["security", "cms", "-D", "-i", str(source)]))
        certificates = validate_profile(profile, bundle, team)
        common_certificates = certificates if common_certificates is None else common_certificates & certificates
        profiles[bundle] = profile["UUID"]
        for directory in [Path.home() / "Library/MobileDevice/Provisioning Profiles", Path.home() / "Library/Developer/Xcode/UserData/Provisioning Profiles"]:
            directory.mkdir(parents=True, exist_ok=True)
            destination = directory / (profile["UUID"] + ".mobileprovision")
            require(not destination.exists(), "同名の既存プロファイルがあるため停止しました。")
            state["profiles"].append(str(destination))
            state_path.write_text(json.dumps(state))
            shutil.copyfile(source, destination)
    require(profiles[APP] != profiles[WIDGET], "主AppとWidgetのプロファイルが同一です。")
    require(common_certificates, "両プロファイルで同じ配布証明書を使えません。")
    p12 = path / "distribution.p12"
    p12.write_bytes(base64.b64decode(os.environ["IOS_DISTRIBUTION_P12_BASE64"], validate=True))
    keychain = path / "distribution.keychain-db"
    password = secrets.token_urlsafe(32)
    run(["security", "create-keychain", "-p", password, str(keychain)])
    run(["security", "set-keychain-settings", "-lut", "21600", str(keychain)])
    run(["security", "unlock-keychain", "-p", password, str(keychain)])
    run(["security", "import", str(p12), "-P", os.environ["IOS_DISTRIBUTION_P12_PASSWORD"], "-k", str(keychain), "-T", "/usr/bin/codesign", "-T", "/usr/bin/security"])
    p12.unlink()
    run(["security", "set-key-partition-list", "-S", "apple-tool:,apple:,codesign:", "-s", "-k", password, str(keychain)])
    run(["security", "list-keychains", "-d", "user", "-s", str(keychain), *state["keychains"]])
    identities = run(["security", "find-identity", "-v", "-p", "codesigning", str(keychain)]).decode()
    candidates = [(fingerprint, name) for fingerprint, name in re.findall(r'([0-9A-F]{40}) "([^"\n]+)"', identities)
                  if fingerprint in common_certificates and name.startswith("Apple Distribution:") and name.endswith("(" + team + ")")]
    require(len(candidates) == 1, "両プロファイルと一致する有効なApple Distribution証明書が一つ必要です。")
    diagnostic_redactions = [password, *(os.environ[name] for name in required if name != "APPLE_TEAM_ID")]
    diagnostic_redactions.extend(value for name, value in os.environ.items() if name.startswith(("VITE_", "GOOGLE_", "ADMOB_")) and len(value) >= 8)
    # XcodeやRubyには署名秘密の環境変数を引き継がない。
    for name in required:
        if name != "APPLE_TEAM_ID":
            os.environ.pop(name, None)
    settings = {"team": team, "identity": candidates[0][0], "profiles": profiles}
    settings_path = path / "signing.json"
    settings_path.write_text(json.dumps(settings))
    run(["bundle", "exec", "ruby", "scripts/ios/configure-release-signing.rb", str(settings_path)])
    archive = path / "App.xcarchive"
    print("配布証明書・両プロファイルのTeam/Bundle/App Group/有効期間を検証済み。", flush=True)
    run(["xcodebuild", "-project", "ios/App/App.xcodeproj", "-scheme", "App", "-configuration", "Release", "-destination", "generic/platform=iOS", "-archivePath", str(archive), "archive"], diagnostic_redactions=diagnostic_redactions)
    verify_app(archive / "Products/Applications/App.app", settings)
    options = {"method": "app-store-connect", "destination": "export", "signingStyle": "manual", "teamID": team,
               "signingCertificate": settings["identity"], "provisioningProfiles": profiles,
               "manageAppVersionAndBuildNumber": False, "uploadSymbols": False}
    options_path = path / "ExportOptions.plist"
    options_path.write_bytes(plistlib.dumps(options))
    exported = path / "export"
    run(["xcodebuild", "-exportArchive", "-archivePath", str(archive), "-exportOptionsPlist", str(options_path), "-exportPath", str(exported)], diagnostic_redactions=diagnostic_redactions)
    ipas = list(exported.glob("*.ipa"))
    require(len(ipas) == 1, "配布IPAが一つ生成されていません。")
    unpacked = path / "verify-ipa"
    with zipfile.ZipFile(ipas[0]) as stream:
        for member in stream.namelist():
            require((unpacked / member).resolve().is_relative_to(unpacked.resolve()), "IPA内のパスが不正です。")
    run(["ditto", "-x", "-k", str(ipas[0]), str(unpacked)])
    apps = list((unpacked / "Payload").glob("*.app"))
    require(len(apps) == 1, "IPA内のアプリ数が不正です。")
    verify_app(apps[0], settings)
    for entry in unpacked.rglob("*"):
        if entry.is_file():
            require(not entry.name.startswith('.env') and entry.suffix not in ('.p12', '.keychain-db', '.pem', '.key'), "IPAへの秘密ファイルの混入を検出しました。")
            require(entry.suffix != '.mobileprovision' or entry.name == 'embedded.mobileprovision', "IPAへの署名素材の混入を検出しました。")
    save_artifacts(ipas[0], archive, Path("ios-release-artifacts"))
    print("archiveとIPAの主App/Widget署名・Manifestを検証済み。ストア送信は行いません。", flush=True)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "cleanup":
        cleanup()
    elif len(sys.argv) > 2 and sys.argv[1] == "manifests":
        app = Path(sys.argv[2])
        validate_manifest(app / "PrivacyInfo.xcprivacy")
        validate_manifest(app / "PlugIns/FeaturedEventsWidget.appex/PrivacyInfo.xcprivacy")
        print("主App/Widgetのプライバシー宣言を検証済み。")
    else:
        try:
            release()
        except ValueError as error:
            print(str(error), file=sys.stderr)
            sys.exit(1)
        except Exception:
            print("配布署名に失敗しました。秘密は出力せず停止しました。", file=sys.stderr)
            sys.exit(1)
        finally:
            cleanup()
