"""配布プロファイルと完成した署名の境界をオフラインで検証する。"""
import copy
import datetime as dt
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch
import tempfile
import json
import os
import plistlib
import hashlib
import io
import subprocess
import zipfile
from contextlib import redirect_stderr

spec = importlib.util.spec_from_file_location("release_signing", Path(__file__).with_name("release-signing.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)
TEAM = "ABCD123456"
NOW = dt.datetime(2026, 9, 30)


def profile(bundle=release.APP):
    return {
        "UUID": "12345678-1234-1234-1234-123456789abc", "TeamIdentifier": [TEAM],
        "ApplicationIdentifierPrefix": [TEAM], "Platform": ["iOS"],
        "CreationDate": NOW - dt.timedelta(days=1), "ExpirationDate": NOW + dt.timedelta(days=1),
        "DeveloperCertificates": [b"fixture-certificate"],
        "Entitlements": {
            "application-identifier": TEAM + "." + bundle,
            "com.apple.developer.team-identifier": TEAM,
            "com.apple.security.application-groups": [release.GROUP],
            "get-task-allow": False, "beta-reports-active": True,
        },
    }


class SigningTest(unittest.TestCase):
    def test_app_and_widget_profiles(self):
        for bundle in release.BUNDLES:
            self.assertTrue(release.validate_profile(profile(bundle), bundle, TEAM, NOW))

    def test_wrong_team_bundle_group_debug_and_expired(self):
        for key, value in [("TeamIdentifier", ["OTHER12345"]), ("ApplicationIdentifierPrefix", ["OTHER12345"]),
                           ("ExpirationDate", NOW), ("CreationDate", NOW + dt.timedelta(days=1)),
                           ("ProvisionedDevices", ["device"]), ("ProvisionsAllDevices", True),
                           ("DeveloperCertificates", []), ("UUID", "../outside"), ("Platform", ["OSX"])]:
            candidate = profile()
            candidate[key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                release.validate_profile(candidate, release.APP, TEAM, NOW)
        for key, value in [("application-identifier", TEAM + ".*"), ("application-identifier", TEAM + "." + release.WIDGET),
                           ("com.apple.developer.team-identifier", "OTHER12345"),
                           ("com.apple.security.application-groups", []), ("get-task-allow", True), ("beta-reports-active", False)]:
            candidate = profile()
            candidate["Entitlements"][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                release.validate_profile(candidate, release.APP, TEAM, NOW)

    def test_completed_entitlements(self):
        ent = profile()["Entitlements"]
        release.validate_entitlements(ent, release.APP, TEAM)
        wrong = copy.deepcopy(ent)
        wrong["com.apple.security.application-groups"] = ["group.wrong"]
        with self.assertRaises(ValueError):
            release.validate_entitlements(wrong, release.APP, TEAM)
        with self.assertRaises(ValueError):
            release.validate_entitlements(ent, release.WIDGET, TEAM)

    def test_cleanup_continues_after_keychain_restore_failure(self):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary) / "home"
            with patch.dict(os.environ, {"RUNNER_TEMP": temporary}), patch.object(Path, "home", return_value=home):
                directory = release.workdir()
                directory.mkdir()
                installed = home / "Library/MobileDevice/Provisioning Profiles/12345678-1234-1234-1234-123456789abc.mobileprovision"
                installed.parent.mkdir(parents=True)
                installed.write_bytes(b"profile")
                (directory / "distribution.p12").write_bytes(b"private")
                (directory / "distribution.keychain-db").write_bytes(b"private")
                (directory / "cleanup.json").write_text(json.dumps({"profiles": [str(installed)], "keychains": ["original"]}))
                with patch.object(release, "run", side_effect=[ValueError("failure"), b""]):
                    with self.assertRaises(ValueError):
                        release.cleanup()
                self.assertFalse(installed.exists())
                self.assertEqual([entry.name for entry in directory.iterdir()], ["cleanup.json"])
                with patch.object(release, "run", return_value=b""):
                    release.cleanup()
                self.assertFalse(directory.exists())

    def verify_app_fixture(self, mismatched_bundle=None):
        with tempfile.TemporaryDirectory() as temporary:
            fixture_env = {
                "RUNNER_TEMP": temporary, "IOS_RELEASE_VERSION": "1.0.20", "IOS_RELEASE_BUILD": "21",
                "GOOGLE_IOS_CLIENT_ID": "123-ios.apps.googleusercontent.com",
                "GOOGLE_SERVER_CLIENT_ID": "123-server.apps.googleusercontent.com",
                "GOOGLE_IOS_REVERSED_CLIENT_ID": "com.googleusercontent.apps.123-ios",
                "ADMOB_IOS_APP_ID": "ca-app-pub-1234567890123456~1234567890",
            }
            certificate = b"fixture-certificate"
            settings = {"team": TEAM, "identity": hashlib.sha1(certificate).hexdigest().upper(), "profiles": {}}
            root = Path(__file__).resolve().parents[2]
            app = Path(temporary) / "App.app"
            checked = []
            for directory, bundle, source in [(app, release.APP, "App"), (app / "PlugIns/FeaturedEventsWidget.appex", release.WIDGET, "FeaturedEventsWidget")]:
                directory.mkdir(parents=True)
                info = {"CFBundleIdentifier": bundle, "CFBundleShortVersionString": "1.0.20", "CFBundleVersion": "21"}
                if bundle == release.APP:
                    info.update({"GIDClientID": fixture_env["GOOGLE_IOS_CLIENT_ID"], "GIDServerClientID": fixture_env["GOOGLE_SERVER_CLIENT_ID"],
                                 "GADApplicationIdentifier": fixture_env["ADMOB_IOS_APP_ID"],
                                 "CFBundleURLTypes": [{"CFBundleURLSchemes": ["calendar-app", fixture_env["GOOGLE_IOS_REVERSED_CLIENT_ID"]]}]})
                (directory / "Info.plist").write_bytes(plistlib.dumps(info))
                (directory / "PrivacyInfo.xcprivacy").write_bytes((root / "ios/App" / source / "PrivacyInfo.xcprivacy").read_bytes())
                embedded = profile(bundle)
                today = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
                embedded.update({"CreationDate": today - dt.timedelta(days=1), "ExpirationDate": today + dt.timedelta(days=1)})
                if bundle == release.WIDGET:
                    embedded["UUID"] = "87654321-1234-1234-1234-123456789abc"
                settings["profiles"][bundle] = embedded["UUID"]
                (directory / "embedded.mobileprovision").write_bytes(plistlib.dumps(embedded))

            def command(args, **kwargs):
                path = Path(args[-1])
                if args[0] == "security":
                    self.assertEqual(args[1:5], ["cms", "-D", "-i", str(path)])
                    return path.read_bytes()
                bundle = release.WIDGET if path.suffix == ".appex" else release.APP
                if "--verify" in args:
                    checked.append(bundle)
                    self.assertIn("--strict", args)
                    return b""
                if "--entitlements" in args:
                    return plistlib.dumps(profile(bundle)["Entitlements"])
                self.assertIn("--extract-certificates", args)
                actual = b"wrong-certificate" if bundle == mismatched_bundle else certificate
                (Path(kwargs["cwd"]) / "codesign0").write_bytes(actual)
                return b""

            with patch.dict(os.environ, fixture_env), patch.object(release, "run", side_effect=command):
                release.workdir().mkdir()
                release.verify_app(app, settings)
            self.assertEqual(checked, list(release.BUNDLES))

    def test_verify_app_success_checks_both_actual_bundle_fixtures(self):
        self.verify_app_fixture()

    def test_verify_app_rejects_main_certificate_mismatch(self):
        with self.assertRaisesRegex(ValueError, "成果物の配布証明書"):
            self.verify_app_fixture(release.APP)

    def test_verify_app_rejects_widget_certificate_mismatch(self):
        with self.assertRaisesRegex(ValueError, "成果物の配布証明書"):
            self.verify_app_fixture(release.WIDGET)

    def test_xcode_failure_diagnostics_redact_secrets_but_keep_compiler_error(self):
        result = subprocess.CompletedProcess(["xcodebuild"], 65, stdout=b"secret-value\nTOKEN=other-secret\n", stderr=b"Plugin.swift:42: error: missing member\n")
        stream = io.StringIO()
        cleared = {key: "" for key in ("IOS_DISTRIBUTION_P12_BASE64", "IOS_DISTRIBUTION_P12_PASSWORD", "IOS_APP_PROFILE_BASE64", "IOS_WIDGET_PROFILE_BASE64")}
        with patch.dict(os.environ, cleared), patch.object(release.subprocess, "run", return_value=result), redirect_stderr(stream):
            with self.assertRaises(ValueError):
                release.run(["xcodebuild", "archive"], diagnostic_redactions=["secret-value"])
        self.assertIn("Plugin.swift:42: error: missing member", stream.getvalue())
        self.assertNotIn("secret-value", stream.getvalue())
        self.assertNotIn("other-secret", stream.getvalue())

    def test_security_failure_never_prints_arguments_or_output(self):
        result = subprocess.CompletedProcess(["security"], 1, stdout=b"secret-output", stderr=b"secret-error")
        stream = io.StringIO()
        with patch.object(release.subprocess, "run", return_value=result), redirect_stderr(stream):
            with self.assertRaises(ValueError):
                release.run(["security", "import", "secret-argument"], diagnostic_redactions=[])
        self.assertEqual(stream.getvalue(), "")

    def test_diagnostics_are_suppressed_before_secret_environment_is_cleared(self):
        result = subprocess.CompletedProcess(["xcodebuild"], 65, stdout=b"private-output", stderr=b"")
        stream = io.StringIO()
        with patch.dict(os.environ, {"IOS_DISTRIBUTION_P12_PASSWORD": "secret"}), patch.object(release.subprocess, "run", return_value=result), redirect_stderr(stream):
            with self.assertRaisesRegex(ValueError, "秘密環境変数の除去前"):
                release.run(["xcodebuild"], diagnostic_redactions=[])
        self.assertEqual(stream.getvalue(), "")

    def test_saved_symbols_do_not_include_archive_signing_materials(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive = root / "App.xcarchive"
            symbol = archive / "dSYMs/App.app.dSYM/Contents/Resources/DWARF/App"
            symbol.parent.mkdir(parents=True)
            symbol.write_bytes(b"debug-symbols")
            (archive / "private.p12").write_bytes(b"private")
            (archive / "original.mobileprovision").write_bytes(b"profile")
            ipa = root / "App.ipa"
            ipa.write_bytes(b"verified-ipa")
            output = root / "artifacts"
            release.save_artifacts(ipa, archive, output)
            self.assertEqual((output / "Multi-calendar.ipa").read_bytes(), b"verified-ipa")
            with zipfile.ZipFile(output / "Multi-calendar-dSYMs.zip") as zipped:
                self.assertTrue(all(name.startswith("dSYMs/") for name in zipped.namelist()))
                self.assertEqual(zipped.read("dSYMs/App.app.dSYM/Contents/Resources/DWARF/App"), b"debug-symbols")

    def test_both_manifests(self):
        root = Path(__file__).resolve().parents[2]
        for target in ["App", "FeaturedEventsWidget"]:
            release.validate_manifest(root / "ios/App" / target / "PrivacyInfo.xcprivacy")


if __name__ == "__main__":
    unittest.main()
