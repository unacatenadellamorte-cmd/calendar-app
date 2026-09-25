"""現行の実画面から、掲載用HTMLレイアウトを組み立てる。画像の生成・加工はしない。"""
from pathlib import Path
import json
KIT=Path(__file__).parent
PREFIX='20260926_multi-calendar_'
def image(name, cls='', style=''):
    return f'<img class="{cls}" style="{style}" src="/images/{PREFIX}{name}.png">'
CSS='''*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px;overflow:hidden}body{position:relative;font-family:"Yu Gothic","Meiryo",sans-serif;background:var(--bg,#f4f3ef);color:#112452} .halo{position:absolute;width:1000px;height:1000px;border-radius:50%;background:var(--halo,#e9eeef);right:-520px;top:480px;z-index:-1}header{position:absolute;left:72px;right:72px;top:45px}.brand{font-size:25px;font-weight:700;letter-spacing:1px;display:flex;align-items:center;gap:13px}.dot{width:13px;height:13px;background:var(--accent,#20b4ad);border-radius:50%;box-shadow:19px 0 #7355db;margin-right:19px}h1{font-size:59px;line-height:1.35;letter-spacing:-2px;margin:24px 0 10px;font-weight:700}p{font-size:28px;color:#51627d;margin:0;line-height:1.7}.screen{display:block;border:1px solid #11245219;border-radius:26px;box-shadow:0 22px 55px #11245216;overflow:hidden;background:#fff}.screen img{display:block;width:100%;height:auto}.standard{position:absolute;top:287px;left:144px;width:792px}.widget-month{position:absolute;top:344px;left:90px;width:900px}.caption{position:absolute;left:90px;right:90px;top:1635px;border-top:1px solid #11245225;padding-top:32px;display:flex;gap:20px;font-size:30px;color:#415572}.caption span{background:#ffffffaa;border:1px solid #11245210;border-radius:18px;padding:17px 28px}.small-label{font-size:31px;font-weight:700;color:#425574;margin-bottom:20px}.widget-block{position:absolute;left:80px;right:80px}.widget-block .screen{border-radius:24px}footer{position:absolute;bottom:23px;left:72px;right:72px;display:flex;justify-content:space-between;font-size:17px;color:#7c8799}.narrow-screen{position:absolute;left:128px;top:335px;width:824px;max-height:1500px}.narrow-screen img{width:100%}.secret-note{position:absolute;left:128px;right:128px;top:1650px;font-size:25px;line-height:1.8;color:#51627d}'''
slides=[
('month','予定を、ひとつに。','仕事も暮らしも、色付きラベルで見渡す。','#f3f4ef','#e1ebea'),
('tag-form','いつもの予定は、タグで。','名前・色・時間をまとめて入力。','#f1f3fb','#e3e6f9'),
('widget-month','月の予定を、ホーム画面に。','月末まで見渡して、▲▼で月を移動。','#edf4f2','#dcebe8'),
('widgets','今日と今週を、すぐ確認。','日・週・月から、暮らしに合う表示を。','#eff3f8','#e1e8f4'),
('shifts','シフト入力を、もっと手軽に。','勤務時間を登録して、給料の目安も確認。','#fbf4e9','#f1e7d6'),
('calendars','大切な予定を、見つけやすく。','カレンダーの色・表示・優先順を調整。','#f1f3f8','#e4e8f1'),
('secret','見せたくない予定は、非表示に。','予定ごとのシークレット設定に対応。','#f3f0fa','#e9e2f6'),
('theme','毎日使うから、好きな色に。','テーマや背景で、自分らしいカレンダーへ。','#faf0f3','#f1dfe8'),
]
manifest=[]
for n,(key,title,sub,bg,halo) in enumerate(slides,1):
    if key=='widget-month':
        content='<div class="screen widget-month">'+image('raw-widget-month')+'</div><div class="caption"><span>色付きラベル</span><span>カレンダーの優先順を反映</span></div>'
    elif key=='widgets':
        content='<div class="widget-block" style="top:330px"><div class="small-label">週の予定</div><div class="screen">'+image('raw-widget-week')+'</div></div><div class="widget-block" style="top:935px"><div class="small-label">選んだ日の予定</div><div class="screen">'+image('raw-widget-day')+'</div></div>'
    elif key=='shifts':
        content='<div class="screen standard" style="top:330px;left:120px;width:840px">'+image('raw-shifts')+'</div>'
    else:
        content='<div class="screen standard">'+image('raw-'+key)+'</div>'
    body=f'<div class="halo"></div><header><div class="brand"><i class="dot"></i>Multi calendar</div><h1>{title}</h1><p>{sub}</p></header>{content}<footer><span>画面はサンプルデータです</span><span>{n:02} / 08</span></footer>'
    html='<!doctype html><html lang="ja"><meta charset="utf-8"><title>掲載画像'+str(n)+'</title><style>'+CSS+f'body{{--bg:{bg};--halo:{halo}}}</style><body>'+body+'</body></html>'
    (KIT/f'store-{n:02}.html').write_text(html,encoding='utf-8')
    manifest.append(dict(file=f'{PREFIX}store-{n:02}.png',title=title,alt=sub,width=1080,height=1920,source=key))
# フィーチャー画像は既存のHTMLベースのブランド表現を更新する。
feature='''<!doctype html><html lang="ja"><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1024px;height:500px;overflow:hidden}body{background:#dcebe9;color:#112452;font-family:"Yu Gothic","Meiryo",sans-serif}.copy{position:absolute;left:72px;top:82px;z-index:2}.brand{font-size:27px;font-weight:700;letter-spacing:1px}h1{font-size:49px;line-height:1.4;margin:40px 0 13px;letter-spacing:-2px}.sub{font-size:21px;color:#4e6578}.card{position:absolute;left:688px;top:73px;width:246px;height:352px;border-radius:23px;background:#fff;box-shadow:0 18px 44px #12345918;transform:rotate(6deg);overflow:hidden}.bar{height:30px;background:#173465;margin-bottom:19px}.label{height:39px;border-radius:7px;margin:15px 20px;padding:5px 13px;font-size:21px;color:white;background:#2994c9}.grid{position:absolute;right:-18px;top:6px;width:380px;height:490px;border-radius:50%;border:1px solid #749aa333;transform:rotate(16deg)}.label:nth-child(3){background:#31aa95}.label:nth-child(4){background:#edaa4d;color:#47300d}.label:nth-child(5){background:#8365bd}.small{font-size:15px;color:#728299;margin:21px}</style><body><div class="grid"></div><div class="copy"><div class="brand">Multi calendar</div><h1>日々の予定に、<br>見通しを。</h1><div class="sub">カレンダー・タグ・ウィジェット</div></div><div class="card"><div class="bar"></div><div class="label">朝会</div><div class="label">散歩</div><div class="label">ランチ</div><div class="label">読書</div><div class="small">仕事も、暮らしも。</div></div></body></html>'''
(KIT/'feature.html').write_text(feature,encoding='utf-8')
(KIT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(KIT/'icon.html').write_text('<!doctype html><style>html,body{margin:0;width:512px;height:512px;overflow:hidden}img{width:512px;height:512px;display:block}</style><img src="/pwa-512x512.png">',encoding='utf-8')
print('掲載用HTML8枚・フィーチャー・アイコンのレイアウトを作成')
