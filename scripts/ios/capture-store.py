"""隔離したiOSシミュレータで架空データだけを使い、実画面を撮影する。"""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('store_fixture', ROOT / 'docs/store-kit-20260926/preview_server.py')
fixture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fixture)
review_spec = importlib.util.spec_from_file_location('photo_review_capture', Path(__file__).with_name('photo_review_capture.py'))
photo_review = importlib.util.module_from_spec(review_spec)
review_spec.loader.exec_module(photo_review)


class Handler(fixture.Handler):
    # 写真審査画像の撮影中だけ権利fixtureを返す。店舗画像の撮影では従来どおり空の応答のまま。
    photo_review_active = False

    def handle_api(self, method, path, parsed):
        if self.photo_review_active and method == 'GET' and path == '/rest/v1/entitlements':
            self.send_data(200, fixture.json_bytes(photo_review.ENTITLEMENT_ROWS))
            return
        super().handle_api(method, path, parsed)

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


def prepare_photos(udid, fixture_dir):
    """隔離シミュレータの写真ライブラリに架空の写真だけを入れ、製品アプリへ読み取り許可を与える。"""
    try:
        photos = photo_review.write_fixture_photos(fixture_dir)
        run('xcrun', 'simctl', 'addmedia', udid, *[str(path) for path in photos])
        run('xcrun', 'simctl', 'privacy', udid, 'grant', 'photos', photo_review.BUNDLE_ID)
        return True
    except (OSError, subprocess.SubprocessError) as error:
        print('写真fixtureを投入できませんでした:', type(error).__name__, flush=True)
        return False


def capture_photo_review(device, app, index, original_index, output, manifest):
    """審査用の「端末の写真」画面を撮る。写真を投入できない時は写真一覧を撮らず、設定画面だけを撮る。"""
    udid = device['udid']
    today = photo_review.review_date()
    fixture_dir = Path(os.environ.get('RUNNER_TEMP', tempfile.gettempdir())) / 'photo-review-fixture'
    shots = [
        ('photo-day-list', f'/calendar?date={today}', True),
        ('photo-settings', '/settings', False),
    ]
    run('xcrun', 'simctl', 'boot', udid)
    run('xcrun', 'simctl', 'bootstatus', udid, '-b')
    run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100')
    Handler.photo_review_active = True
    launched = False
    prepared = False
    photos_ready = False
    try:
        for label, route, open_list in shots:
            if launched:
                run('xcrun', 'simctl', 'terminate', udid, photo_review.BUNDLE_ID)
            startup = photo_review.startup_script(route, fixture.SESSION, open_photo_list=open_list)
            index.write_text(original_index.replace('<head>', '<head>' + startup, 1), encoding='utf-8')
            run('xcrun', 'simctl', 'install', udid, str(app))
            if not prepared:
                prepared = True
                photos_ready = prepare_photos(udid, fixture_dir)
            if open_list and not photos_ready:
                print('写真fixtureがないため、写真一覧の画面は撮影しません。', flush=True)
                continue
            run('xcrun', 'simctl', 'launch', udid, photo_review.BUNDLE_ID, '-AppleLanguages', '(ja)', '-AppleLocale', 'ja_JP')
            launched = True
            # 初回のライブラリ作成・起動後に隔離シミュレータの許可を再適用する。
            # 製品の許可案内のボタンを撮影用JSから押し、OSの現在値を取り直す。
            time.sleep(5)
            if photos_ready:
                run('xcrun', 'simctl', 'privacy', udid, 'grant', 'photos', photo_review.BUNDLE_ID)
                # OSのプライバシー設定変更でプロセスが終了するため、再インストールせず再起動する。
                run('xcrun', 'simctl', 'launch', udid, photo_review.BUNDLE_ID, '-AppleLanguages', '(ja)', '-AppleLocale', 'ja_JP')
            time.sleep(25)
            name = f'20261022_ios_iphone_ja_{label}.png'
            run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / name))
            manifest.append({
                'file': name,
                'device': device['name'],
                'language': 'ja',
                'route': route,
                'data': '架空データのみ',
                'photos': '架空PNG4枚をsimctl addmediaで投入(撮影日は投入時刻)' if open_list else '写真設定のみ',
                'photo_list_verified': '未確認。撮影画像で一覧の表示を目視確認すること' if open_list else None,
            })
    finally:
        Handler.photo_review_active = False
        run('xcrun', 'simctl', 'shutdown', udid)


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
    for family, device in ([] if os.environ.get('PHOTO_REVIEW_ONLY') == '1' else targets):
        udid = device['udid']
        if device['state'] != 'Booted':
            run('xcrun', 'simctl', 'boot', udid)
        run('xcrun', 'simctl', 'bootstatus', udid, '-b')
        run('xcrun', 'simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100')
        launched = False
        for language, region in [('ja', 'ja_JP'), ('en', 'en_US')]:
            for label, route in [('calendar', '/calendar?date=2026-09-26'), ('event', '/calendar?create=2026-09-26'), ('settings', '/settings')]:
                if launched:
                    run('xcrun', 'simctl', 'terminate', udid, 'jp.ryo.multicalendar')
                # 撮影用成果物の開始URLのみを指定し、アプリ本体の描画処理は変更しない。
                startup = '<script>history.replaceState(null,"",' + json.dumps(route) + ');localStorage.setItem("calendar-app.language",' + json.dumps(language) + ');</script>'
                index.write_text(original_index.replace('<head>', '<head>' + startup, 1), encoding='utf-8')
                run('xcrun', 'simctl', 'install', udid, str(app))
                run('xcrun', 'simctl', 'launch', udid, 'jp.ryo.multicalendar', '-AppleLanguages', f'({language})', '-AppleLocale', region)
                launched = True
                time.sleep(15)
                name = f'20260930_ios_{family}_{language}_{label}.png'
                run('xcrun', 'simctl', 'io', udid, 'screenshot', str(output / name))
                manifest.append({'file': name, 'device': device['name'], 'language': language, 'route': route, 'data': '架空データのみ'})
        run('xcrun', 'simctl', 'shutdown', udid)
    # 審査用の写真画面は既存の店舗画像のあとに、iPhoneだけで撮る。
    capture_photo_review(targets[0][1], app, index, original_index, output, manifest)
finally:
    server.shutdown()
(output / 'capture-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
