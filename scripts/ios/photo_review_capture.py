"""審査用の「端末の写真」画面を撮るための撮影専用の補助関数。

製品のUIや写真の一覧は描画しない。架空PNG・起動時のlocalStorage/history挿入・
権利fixture・既存の「この日の写真」ボタンをQA用に押す処理だけを担当する。
"""
from __future__ import annotations

from datetime import datetime
import json
from pathlib import Path
import struct
import zlib

# 製品の既存キー(src/features/settings/model/useDevicePhotosEnabled.ts と src/i18n/index.ts)。
PHOTO_ENABLED_KEY = 'calendar-app.device-photos-enabled'
LANGUAGE_KEY = 'calendar-app.language'
# supabase-js の既定キー sb-<hostname先頭>-auth-token。撮影URLは 127.0.0.1 なので sb-127。
SESSION_KEY = 'sb-127-auth-token'
BUNDLE_ID = 'jp.ryo.multicalendar'

# 撮影専用fixtureの権利。期限は十分先の架空値で、外部の課金状態を参照しない。
ENTITLEMENT_ROWS = [{'entitlement': 'device_photos', 'expires_at': '2099-12-31T00:00:00+00:00'}]

# 製品の「この日の写真」ボタンを、利用者の操作と同じくclickする。描画や表示の模擬はしない。
OPEN_PHOTO_LIST_SCRIPT = """
(function () {
  var tries = 0;
  var dayOpened = false;
  var timer = setInterval(function () {
    if (!dayOpened) {
      var day = document.querySelector('button[data-day-button][aria-pressed="true"]');
      if (day) { day.click(); dayOpened = true; }
      return;
    }
    var button = Array.prototype.find.call(document.querySelectorAll('button'), function (el) {
      return el.textContent.indexOf('この日の写真') !== -1 && el.getAttribute('aria-expanded') === 'false';
    });
    if (button) {
      button.click();
      var section = button.closest('section');
      var permissionTimer = setInterval(function () {
        var permission = Array.prototype.find.call(section.querySelectorAll('button'), function (el) {
          return el.textContent.indexOf('写真へのアクセスを許可') !== -1;
        });
        // 起動後にsimctlで許可を再適用してから製品のボタンを押す。
        if (permission && tries > 20) { permission.click(); clearInterval(permissionTimer); }
        if (++tries > 80) { clearInterval(permissionTimer); }
      }, 500);
      [500, 1500, 4000, 8000].forEach(function (delay) {
        setTimeout(function () { section.scrollIntoView({block: 'center'}); }, delay);
      });
      clearInterval(timer);
    }
    else if (++tries > 120) { clearInterval(timer); }
  }, 500);
})();
"""

PHOTO_PALETTES = [
    ((242, 181, 120), (96, 140, 200)),
    ((160, 210, 170), (60, 110, 90)),
    ((200, 170, 230), (80, 60, 120)),
    ((250, 230, 160), (170, 120, 60)),
]


def review_date(now: datetime | None = None) -> str:
    """撮影機のローカル日付(YYYY-MM-DD)。写真の撮影日時の判定と同じ基準にする。"""
    return (now or datetime.now().astimezone()).strftime('%Y-%m-%d')


def write_png(path: Path, width: int, height: int, top: tuple[int, int, int], bottom: tuple[int, int, int]) -> None:
    """縦方向のグラデーションの架空PNGを標準ライブラリだけで書き出す。"""
    rows = bytearray()
    for y in range(height):
        ratio = y / (height - 1)
        pixel = bytes(round(a + (b - a) * ratio) for a, b in zip(top, bottom))
        rows.append(0)  # フィルタ種別 None
        rows += pixel * width

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xFFFFFFFF)

    header = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)  # 8bit RGB
    path.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(bytes(rows)))
        + chunk(b'IEND', b'')
    )


def write_fixture_photos(directory: Path, count: int = 4) -> list[Path]:
    """シミュレータへ投入する架空の写真を作る。実写真・実人物・実画面は含めない。"""
    directory.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for number, (top, bottom) in enumerate(PHOTO_PALETTES[:count], start=1):
        path = directory / f'fixture-photo-{number}.png'
        write_png(path, 640, 480, top, bottom)
        paths.append(path)
    return paths


def startup_script(route: str, session: dict, *, open_photo_list: bool = False) -> str:
    """index.html の <head> に挿入する撮影専用のスクリプト。history と localStorage だけを触る。"""
    parts = [
        f'history.replaceState(null,"",{json.dumps(route)});',
        f'localStorage.setItem({json.dumps(LANGUAGE_KEY)},"ja");',
        f'localStorage.setItem({json.dumps(PHOTO_ENABLED_KEY)},"true");',
        f'localStorage.setItem({json.dumps(SESSION_KEY)},{json.dumps(json.dumps(session, ensure_ascii=False))});',
    ]
    if open_photo_list:
        parts.append(OPEN_PHOTO_LIST_SCRIPT)
    else:
        parts.append('var photoSettingsTimer=setInterval(function(){var heading=document.getElementById("device-photos-heading");if(heading){heading.scrollIntoView({block:"start"});clearInterval(photoSettingsTimer);}},500);')
    return '<script>' + ''.join(parts) + '</script>'
