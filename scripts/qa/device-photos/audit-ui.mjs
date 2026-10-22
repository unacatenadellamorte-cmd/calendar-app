// 専用AVDの架空写真を使い、端末時間帯に合わせて実UIと実MediaStoreを照合する。
import { execFileSync } from 'node:child_process';
const expression = `(async () => {
  const wait = async (predicate, stage) => { for(let i=0;i<120;i++){if(predicate())return;await new Promise(r=>setTimeout(r,100));}throw new Error('表示待ち: '+stage); };
  const button = text => [...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||(text==='この日の写真'&&b.textContent.includes(text)));
  const tiles = () => [...document.querySelectorAll('button[aria-label]')].filter(b=>b.getAttribute('aria-label').includes('の写真を拡大'));
  const expected = async date => {
    const [y,m,d]=date.split('-').map(Number);let offset=0,total=0,more=true;
    while(more){const page=await Capacitor.nativePromise('DevicePhotos','listAssets',{fromMs:new Date(y,m-1,d).getTime(),toMs:new Date(y,m-1,d+1).getTime(),offset,limit:40});total+=page.assets.length;offset+=page.assets.length;more=page.hasMore;if(offset>1000)throw new Error('架空写真の上限超過');}
    return total;
  };
  const toggle=document.querySelector('#enabled');if(!toggle)throw new Error('検証専用画面ではない');
  if(!toggle.checked)toggle.click();await wait(()=>button('この日の写真'),'写真欄');
  if(button('この日の写真').getAttribute('aria-expanded')!=='true')button('この日の写真').click();
  const choose = async date => {
    const input=document.querySelector('#day');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,date);
    input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new Event('input',{bubbles:true}));
    await wait(()=>document.querySelector('section[data-date]')?.dataset.date===date,'日付変更');
    const count=await expected(date);
    await wait(()=>count?tiles().length>0:document.body.innerText.includes('この日に撮影した写真はありません。'),'当日の写真');
    while(button('さらに読み込む')){
      const old=document.querySelector('[role=list] > div').style.height;
      button('さらに読み込む').click();
      await wait(()=>document.querySelector('[role=list] > div').style.height!==old||!button('さらに読み込む'),'続き取得');
    }
    const height=parseFloat(document.querySelector('[role=list] > div')?.style.height||'0');
    if(height!==Math.ceil(count/4)*84)throw new Error('MediaStore件数とUI行数が不一致');
    if(count>40&&tiles().length>=40)throw new Error('仮想化されていない');
    return count;
  };
  const counts={};for(const date of ['2026-10-19','2026-10-20','2026-10-21','2026-10-22'])counts[date]=await choose(date);
  await choose('2026-10-20');const grid=document.querySelector('[role=list]');grid.scrollTop=100000;
  await wait(()=>grid.scrollTop>1000,'最終行スクロール');await new Promise(r=>setTimeout(r,200));
  tiles().at(-1).click();await wait(()=>document.querySelector('[role=dialog] img')?.naturalWidth>0,'拡大');
  const image=document.querySelector('[role=dialog] img');if(Math.max(image.naturalWidth,image.naturalHeight)>1600)throw new Error('拡大サイズ超過');
  document.querySelector('[role=dialog] button').click();await wait(()=>!document.querySelector('[role=dialog]'),'閉じる');
  for(let i=0;i<10;i++){await choose('2026-10-20');await choose('2026-10-22');}
  toggle.click();await wait(()=>!button('この日の写真'),'表示OFF');
  if(document.images.length)throw new Error('OFF後に画像が残存');
  return {時間帯:Intl.DateTimeFormat().resolvedOptions().timeZone,日別件数:counts,最終行と拡大:'成功',日付往復:10,OFF後画像数:document.images.length};
})()`;
console.log(execFileSync(process.execPath, ['scripts/qa/device-photos/cdp.mjs', expression], { encoding: 'utf8' }).trim());
