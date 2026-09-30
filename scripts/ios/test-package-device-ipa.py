"""実機IPAの再梱包でネイティブ資産と既存成果物を保護する回帰検証。"""

import hashlib
import importlib.util
import json
import plistlib
import tempfile
import unittest
import zipfile
from pathlib import Path

module_spec = importlib.util.spec_from_file_location('package_device_ipa', Path(__file__).with_name('package-device-ipa.py'))
module = importlib.util.module_from_spec(module_spec)
module_spec.loader.exec_module(module)


class PackageDeviceTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.base = self.root / 'base.ipa'
        self.output = self.root / 'new.ipa'
        self.web = self.root / 'dist'
        self.web.mkdir()
        ads = {'platform': 'ios', 'mode': 'test', 'appId': 'example-app', 'bannerId': 'example-banner'}
        (self.web / 'index.html').write_text('新しいWeb資産', encoding='utf-8')
        (self.web / 'admob-config.json').write_text(json.dumps(ads), encoding='utf-8')
        manifest = {'schema': 1, 'supabaseConfigured': True, 'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in self.web.iterdir()}}
        (self.web / 'ios-device-build.json').write_text(json.dumps(manifest), encoding='utf-8')
        with zipfile.ZipFile(self.base, 'w') as z:
            z.writestr('Payload/App.app/Info.plist', plistlib.dumps({'CFBundleIdentifier': 'jp.ryo.multicalendar', 'CFBundleShortVersionString': '1.0.19', 'CFBundleVersion': '20', 'GADApplicationIdentifier': ads['appId']}))
            for name in ['App', 'PlugIns/FeaturedEventsWidget.appex/FeaturedEventsWidget']:
                entry = zipfile.ZipInfo('Payload/App.app/' + name)
                entry.create_system = 3
                entry.external_attr = 0o100755 << 16
                z.writestr(entry, b'unchanged-native')
            z.writestr('Payload/App.app/public/cordova.js', b'')
            z.writestr('Payload/App.app/public/cordova_plugins.js', b'')
            z.writestr('Payload/App.app/public/index.html', b'old')
            z.writestr('Payload/App.app/public/admob-config.json', json.dumps(ads))

    def package(self):
        return module.package_ipa(self.base, self.web, self.output, hashlib.sha256(self.base.read_bytes()).hexdigest())

    def test_native_and_source_are_unchanged(self):
        before = self.base.read_bytes()
        result = self.package()
        self.assertTrue(result['nativeBytesPreserved'])
        self.assertEqual(self.base.read_bytes(), before)
        with zipfile.ZipFile(self.base) as source, zipfile.ZipFile(self.output) as target:
            self.assertEqual(target.read('Payload/App.app/public/index.html'), (self.web / 'index.html').read_bytes())
            for entry in source.infolist():
                if '/public/' not in entry.filename or 'cordova' in entry.filename:
                    self.assertEqual(target.read(entry.filename), source.read(entry))
                    self.assertEqual(target.getinfo(entry.filename).external_attr, entry.external_attr)

    def test_changed_web_is_not_published(self):
        (self.web / 'index.html').write_text('検証後の変更', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '検証後'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_unconfigured_build_is_rejected(self):
        (self.web / 'ios-device-build.json').write_text('{"schema":1,"supabaseConfigured":false}', encoding='utf-8')
        with self.assertRaisesRegex(ValueError, '実機用ビルド'):
            self.package()
        self.assertFalse(self.output.exists())

    def test_existing_output_is_preserved(self):
        self.output.write_bytes(b'previous-artifact')
        with self.assertRaisesRegex(ValueError, '上書き'):
            self.package()
        self.assertEqual(self.output.read_bytes(), b'previous-artifact')

    def test_unverified_native_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'ネイティブIPAと一致'):
            module.package_ipa(self.base, self.web, self.output)
        self.assertFalse(self.output.exists())


if __name__ == '__main__':
    unittest.main()
