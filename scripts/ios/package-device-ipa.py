"""検証済みのWeb資産を既存の未署名IPAへ組み込む。ネイティブ変更時には使わない。"""

import argparse
import copy
import hashlib
import json
import os
import plistlib
import tempfile
import zipfile
from pathlib import Path

# このWeb修正と組み合わせて実際に検証したネイティブarchive由来のIPAだけを使う。
SUPPORTED_BASE_SHA256 = '40f8f6e9cd25f96ca248326c5c287a16761f6bf992bb4289249e79712f65ee3e'


def package_ipa(base: Path, web: Path, output: Path, expected_base_sha256=SUPPORTED_BASE_SHA256):
    if base.resolve() == output.resolve() or output.exists():
        raise ValueError('元IPAや既存成果物は上書きできません。新しい出力先を指定してください。')
    base_sha256 = hashlib.sha256(base.read_bytes()).hexdigest()
    if base_sha256 != expected_base_sha256:
        raise ValueError('検証済みのネイティブIPAと一致しません。対応するarchiveを確認してください。')
    manifest = json.loads((web / 'ios-device-build.json').read_text(encoding='utf-8'))
    if manifest.get('schema') != 1 or manifest.get('supabaseConfigured') is not True:
        raise ValueError('Supabase設定を検証した実機用ビルドが必要です。')
    files = manifest['files']
    actual = {p.relative_to(web).as_posix() for p in web.rglob('*') if p.is_file()} - {'ios-device-build.json'}
    if set(files) != actual or not {'index.html', 'admob-config.json'}.issubset(actual):
        raise ValueError('Web資産の一覧が検証時と一致しません。')
    for name, digest in files.items():
        if hashlib.sha256((web / name).read_bytes()).hexdigest() != digest:
            raise ValueError('検証後にWeb資産が変更されています。再ビルドしてください。')
    prefix = 'Payload/App.app/public/'
    with zipfile.ZipFile(base) as source:
        if source.testzip() is not None:
            raise ValueError('元IPAの整合性検査に失敗しました。')
        names = source.namelist()
        if any('/_CodeSignature/' in n or n.endswith('/embedded.mobileprovision') for n in names):
            raise ValueError('未署名IPAだけを入力してください。')
        info = plistlib.loads(source.read('Payload/App.app/Info.plist'))
        if info['CFBundleIdentifier'] != 'jp.ryo.multicalendar':
            raise ValueError('別アプリのIPAは入力できません。')
        ads = json.loads((web / 'admob-config.json').read_text(encoding='utf-8'))
        if ads['platform'] != 'ios' or ads['appId'] != info.get('GADApplicationIdentifier'):
            raise ValueError('Webとネイティブの広告設定が一致しません。')
        if ads != json.loads(source.read(prefix + 'admob-config.json')):
            raise ValueError('元IPAと広告設定が異なります。ネイティブを再ビルドしてください。')
        output.parent.mkdir(parents=True, exist_ok=True)
        bridges = {prefix + 'cordova.js', prefix + 'cordova_plugins.js'}
        def retained(name):
            return not name.startswith(prefix) or name in bridges
        with tempfile.TemporaryDirectory(prefix='ipa-build-', dir=output.parent) as staging:
            staged = Path(staging) / 'unsigned.ipa'
            with zipfile.ZipFile(staged, 'w', compression=zipfile.ZIP_DEFLATED) as target:
                for entry in source.infolist():
                    if retained(entry.filename):
                        # ZipInfoは書込時に変更されるためコピーし、元ZIPの読取位置を保護する。
                        target.writestr(copy.copy(entry), source.read(entry))
                for name in sorted(actual | {'ios-device-build.json'}):
                    if prefix + name in bridges:
                        raise ValueError('Web資産にネイティブブリッジの予約名が含まれています。')
                    target.write(web / name, prefix + name)
            with zipfile.ZipFile(staged) as target:
                if target.testzip() is not None:
                    raise ValueError('出力IPAの整合性検査に失敗しました。')
                for entry in source.infolist():
                    if retained(entry.filename):
                        if source.read(entry) != target.read(entry.filename) or entry.external_attr != target.getinfo(entry.filename).external_attr:
                            raise ValueError('ネイティブ資産の保持検査に失敗しました。')
            # 検証成功後だけ公開し、競合しても既存ファイルを上書きしない。
            os.link(staged, output)
        return {
            'version': info['CFBundleShortVersionString'],
            'build': info['CFBundleVersion'],
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
            'nativeBytesPreserved': True,
            'supabaseConfigured': True,
            'signed': False,
            'baseSha256': base_sha256,
        }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base', required=True, type=Path)
    parser.add_argument('--web', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(package_ipa(args.base, args.web, args.output), ensure_ascii=False, indent=2))
