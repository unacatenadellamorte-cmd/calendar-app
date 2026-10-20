"""個人情報を含まない架空画像へ、検証用の撮影日時だけを埋め込む。"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

destination = Path(sys.argv[1])
image = Image.new("RGB", (4000, 3000), "lightblue")
ImageDraw.Draw(image).rectangle((500, 400, 3000, 2000), fill="coral")
dates = {
    "start": "2026:10:20 00:00:00",
    "middle": "2026:10:20 09:05:00",
    "end": "2026:10:20 23:59:59",
    "before": "2026:10:19 23:59:59",
    "after": "2026:10:21 00:00:00",
}
for name, taken in dates.items():
    exif = Image.Exif()
    exif[0x0132] = taken
    exif[0x8769] = {0x9003: taken, 0x9004: taken, 0x9011: "+09:00", 0x9012: "+09:00"}
    image.save(destination / f"20261020_photo-qa-{name}.jpg", exif=exif)
print("日時付き架空画像5枚を作成しました。")
