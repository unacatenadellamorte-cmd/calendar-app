"""書き出し済みの掲載素材を検証し、配布ZIPとローカル一覧を作成する。"""
from pathlib import Path
from html import escape
import hashlib
import json
import zipfile
from PIL import Image

KIT = Path(__file__).resolve().parent
OUT = KIT.parents[2] / '出力画像'
PREFIX = '20260926_multi-calendar_'
slides = json.loads((KIT / 'manifest.json').read_text(encoding='utf-8'))
icon = OUT / (PREFIX + 'store-icon-512.png')
# 見た目と画素のRGB値を変えず、ストアアイコンの32ビットPNG形式へ書き出す。
with Image.open(icon) as source:
    source.convert('RGBA').save(icon)
assets = [(s['file'], (1080, 1920), 'RGB') for s in slides]
assets += [(PREFIX + 'feature-1024x500.png', (1024, 500), 'RGB'),
           (PREFIX + 'store-icon-512.png', (512, 512), 'RGBA')]
report = []
for name, size, mode in assets:
    path = OUT / name
    with Image.open(path) as img:
        assert img.size == size, (name, img.size)
        assert img.mode == mode, (name, img.mode)
        img.verify()
    assert path.stat().st_size < (1024 * 1024 if mode == 'RGBA' else 8 * 1024 * 1024)
    report.append(dict(file=name, width=size[0], height=size[1], mode=mode,
                       bytes=path.stat().st_size, sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
assert len(slides) == 8
assert all(len(s['alt']) <= 140 for s in slides)
(KIT / '成果物検証.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

def preview(base):
    cards = ''.join(f'<figure><a href="{base}{s["file"]}"><img src="{base}{s["file"]}" alt="{escape(s["alt"])}"></a><figcaption>{i:02}　{escape(s["title"])}<p>代替テキスト：{escape(s["alt"])}</p></figcaption></figure>' for i,s in enumerate(slides,1))
    extras = ''.join(f'<p><a href="{base}{name}">{escape(name)}</a></p>' for name,_,_ in assets[8:])
    return '<!doctype html><html lang="ja"><meta charset="utf-8"><title>Multi calendar 掲載素材</title><style>body{font-family:Meiryo,sans-serif;max-width:1500px;margin:auto;padding:32px;background:#edf1f4;color:#112452}h1{font-size:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:22px}figure{margin:0}img{width:100%;border-radius:12px}figcaption{padding:12px 0}figcaption p{font-size:13px;line-height:1.6}</style><h1>Multi calendar ｜ Google Play掲載素材</h1><p>01〜08をスマートフォンのスクリーンショット欄に番号順で使用。紹介画像とアイコンはそれぞれの専用欄へ。画面は架空のサンプルデータ。作成日：2026-09-26。</p><div class="grid">'+cards+'</div><h2>紹介画像・アイコン</h2>'+extras+'</html>'

(KIT / '素材一覧.html').write_text(preview('../../../出力画像/'), encoding='utf-8')
archive = OUT / (PREFIX + 'GooglePlay掲載画像.zip')
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
    for name,_,_ in assets:
        z.write(OUT / name, 'images/' + name)
    z.write(OUT / (PREFIX + 'store-contact-sheet.png'), '確認用一覧.png')
    z.writestr('最初に開く.html', preview('images/'))
    z.write(KIT / 'README.md', '説明.md')
    z.write(KIT / 'manifest.json', '代替テキスト.json')
    z.write(KIT / '成果物検証.json', '成果物検証.json')
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == 15
print(json.dumps(dict(assets=len(assets), archive=str(archive), bytes=archive.stat().st_size), ensure_ascii=False))
