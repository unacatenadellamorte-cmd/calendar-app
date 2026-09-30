"""隔離したiOSシミュレータで架空データだけを使い、実画面を撮影する。"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('store_fixture', ROOT / 'docs/store-kit-20260926/preview_server.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)


class Handler(fixture.Handler):
    def send_data(self, status, data, content_type='application/json; charset=utf-8', csp=None):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', 'capacitor://localhost')
        self.send_header('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, x-client-info, accept-profile, content-profile, x-supabase-api-version, range')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
        self.end_headers()
        self.wfile.write(data)


def run(*args):
    print('実行:', ' '.join(args), flush=True)
    # 起動したサービスが出力パイプを保持しても待ち続けないよう、通常操作は直接出力する。
    if args[:4] == ('xcrun', 'simctl', 'list', 'devices'):
        return subprocess.check_output(args, text=True, timeout=60).strip()
    subprocess.run(args, check=True, timeout=240)
    return ''


server = fixture.ThreadingHTTPServer(('127.0.0.1', 5188), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
output = Path(os.environ['CAPTURE_OUTPUT'])
output.mkdir(parents=True, exist_ok=True)
app = ROOT / 'ios/CaptureDerivedData/Build/Products/Debug-iphonesimulator/App.app'
index = app / 'public/index.html'
original_index = index.read_text(encoding='utf-8')
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
available = [device for runtime, entries in devices.items() if 'iOS-18-5' in runtime for device in entries]
print('撮影環境: iOS 18.5', flush=True)
targets = [
    ('iphone', next(device for device in available if device['name'] == 'iPhone 16 Plus')),
    ('ipad', next(device for device in available if 'iPad Pro 13-inch' in device['name'])),
]
manifest = []
try:
    for family, device in targets:
        udid = device['udid']
        if device['state'] != 'Booted':
            run('xcrun', 'simctl', 'boot', udid)
        run('xcrun', 'simctl', 'bootstatus', udid, '-b')
        run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100')
        for language, region in [('ja', 'ja_JP'), ('en', 'en_US')]:
            for label, route in [('calendar', '/calendar?date=2026-09-26'), ('event', '/calendar?create=2026-09-26'), ('settings', '/settings')]:
                subprocess.run(['xcrun', 'simctl', 'terminate', udid, 'jp.ryo.multicalendar'], capture_output=True, timeout=30)
                # 撮影用成果物の開始URLのみを指定し、アプリ本体の描画処理は変更しない。
                startup = '<script>history.replaceState(null,"",' + json.dumps(route) + ');localStorage.setItem("calendar-app.language",' + json.dumps(language) + ');</script>'
                index.write_text(original_index.replace('<head>', '<head>' + startup, 1), encoding='utf-8')
                run('xcrun', 'simctl', 'install', udid, str(app))
                run('xcrun', 'simctl', 'launch', udid, 'jp.ryo.multicalendar', '-AppleLanguages', f'({language})', '-AppleLocale', region)
                time.sleep(15)
                name = f'20260930_ios_{family}_{language}_{label}.png'
                run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / name))
                manifest.append({'file': name, 'device': device['name'], 'language': language, 'route': route, 'data': '架空データのみ'})
        run('xcrun', 'simctl', 'shutdown', udid)
finally:
    server.shutdown()
(output / 'capture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
