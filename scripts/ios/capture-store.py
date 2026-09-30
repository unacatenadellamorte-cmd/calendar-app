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
        self.send_header('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, x-client-info')
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
devices = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '-j'))['devices']
available = [device for runtime, entries in devices.items() if 'iOS' in runtime for device in entries]
targets = [
    ('iphone', next(device for name in ['iPhone 17 Pro Max', 'iPhone 16 Pro Max', 'iPhone 16 Plus'] for device in available if device['name'] == name)),
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
        run('xcrun', 'simctl', 'install', udid, str(app))
        for language, region in [('ja', 'ja_JP'), ('en', 'en_US')]:
            subprocess.run(['xcrun', 'simctl', 'terminate', udid, 'jp.ryo.multicalendar'], capture_output=True)
            run('xcrun', 'simctl', 'launch', udid, 'jp.ryo.multicalendar', '-AppleLanguages', f'({language})', '-AppleLocale', region)
            time.sleep(8)
            for label, url in [('calendar', 'calendar-app://day/2026-09-26'), ('event', 'calendar-app://create/2026-09-26'), ('settings', 'calendar-app://settings/')]:
                run('xcrun', 'simctl', 'openurl', udid, url)
                time.sleep(4)
                name = f'20260930_ios_{family}_{language}_{label}.png'
                run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / name))
                manifest.append({'file': name, 'device': device['name'], 'language': language, 'route': url, 'data': '架空データのみ'})
        run('xcrun', 'simctl', 'shutdown', udid)
finally:
    server.shutdown()
(output / 'capture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
