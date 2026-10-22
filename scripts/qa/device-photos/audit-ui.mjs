// 専用AVDの架空写真を使い、端末時間帯に合わせて実UIと実MediaStoreを照合する。
import { execFileSync } from 'node:child_process';
const expression = `(async () => {
  const wait = async (predicate, stage) => { for(let i=0;i<120;i++){if(predicate())return;await new Promise(r=>setTimeout(r,100));}throw new Error('表示待ち: '+stage); };
  const button = text => [...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||(text==='この日の写真'&&b.textContent.includes(text)));
  const tiles = () => [...document.querySelectorAll('button[aria-label]')].filter(b=>b.getAttribute('aria-label').includes('の写真を拡大'));
  const grid = () => document.querySelector('[role=list]');
  // 一覧の内側の高さ(行数×行高)。下端までの続き取得で増えていく。
  const spacer = () => parseFloat(grid()?.firstElementChild?.style.height||'0');
  // 写真OSへの呼び出し回数(メソッド名と回数だけ。引数・結果は記録しない)。
  const osCalls = {};
  const nativePromise = Capacitor.nativePromise;
  Capacitor.nativePromise = (plugin, method, options) => { if(plugin==='DevicePhotos') osCalls[method]=(osCalls[method]||0)+1; return nativePromise.call(Capacitor, plugin, method, options); };
  const expected = async date => {
    const [y,m,d]=date.split('-').map(Number);let offset=0,total=0,more=true;
    while(more){const page=await Capacitor.nativePromise('DevicePhotos','listAssets',{fromMs:new Date(y,m-1,d).getTime(),toMs:new Date(y,m-1,d+1).getTime(),offset,limit:40});total+=page.assets.length;offset+=page.assets.length;more=page.hasMore;if(offset>1000)throw new Error('架空写真の上限超過');}
    return total;
  };
  const setDay = date => {
    const input=document.querySelector('#day');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,date);
    input.dispatchEvent(new Event('change',{bubbles:true}));input.dispatchEvent(new Event('input',{bubbles:true}));
  };
  const toggle=document.querySelector('#enabled');if(!toggle)throw new Error('検証専用画面ではない');
  const entitled=document.querySelector('#photo-entitled');if(!entitled)throw new Error('写真契約の検証欄がない');
  if(!toggle.checked)toggle.click();
  if(!entitled.checked)entitled.click();
  await wait(()=>button('この日の写真'),'写真欄');
  if(button('この日の写真').getAttribute('aria-expanded')!=='true')button('この日の写真').click();
  const choose = async date => {
    setDay(date);
    await wait(()=>document.querySelector('section[data-date]')?.dataset.date===date,'日付変更');
    const count=await expected(date);
    await wait(()=>count?tiles().length>0:document.body.innerText.includes('この日に撮影した写真はありません。'),'当日の写真');
    // 操作ボタンは使わず、一覧の下端へ送って次の40件が増えるのを待つ。MediaStore件数分の行高になるまで最大10回。
    for(let i=0;i<10&&count&&spacer()!==Math.ceil(count/4)*84;i++){
      const old=spacer();grid().scrollTop=grid().scrollHeight;
      await wait(()=>spacer()!==old,'続き取得');
    }
    if(spacer()!==Math.ceil(count/4)*84)throw new Error('MediaStore件数とUI行数が不一致');
    if(count>40&&tiles().length>=40)throw new Error('仮想化されていない');
    return count;
  };
  const counts={};for(const date of ['2026-10-19','2026-10-20','2026-10-21','2026-10-22'])counts[date]=await choose(date);
  await choose('2026-10-20');grid().scrollTop=100000;
  await wait(()=>grid().scrollTop>1000,'最終行スクロール');await new Promise(r=>setTimeout(r,200));
  tiles().at(-1).click();await wait(()=>document.querySelector('[role=dialog] img')?.naturalWidth>0,'拡大');
  const image=document.querySelector('[role=dialog] img');if(Math.max(image.naturalWidth,image.naturalHeight)>1600)throw new Error('拡大サイズ超過');
  document.querySelector('[role=dialog] button').click();await wait(()=>!document.querySelector('[role=dialog]'),'閉じる');
  for(let i=0;i<10;i++){await choose('2026-10-20');await choose('2026-10-22');}
  // 写真契約なし: 写真欄は案内に変わり、画像・一覧は出ず、OSへの写真要求も発生しない。
  entitled.click();
  await wait(()=>!button('この日の写真')&&button('写真表示のプランを見る'),'権利なしの案内');
  // 区間内にOS APIが呼ばれた回数の差分(メソッド名と回数だけ)。
  const callsSince=before=>Object.fromEntries(Object.entries(osCalls).filter(([method,n])=>n!==(before[method]||0)).map(([method,n])=>[method,n-(before[method]||0)]));
  const freeBefore={...osCalls};
  setDay('2026-10-20');await new Promise(r=>setTimeout(r,1000));
  setDay('2026-10-22');await new Promise(r=>setTimeout(r,1000));
  if(document.images.length)throw new Error('権利なしで画像が表示された');
  if(grid())throw new Error('権利なしで一覧が表示された');
  const freeCalls=callsSince(freeBefore);
  if(Object.keys(freeCalls).length)throw new Error('権利なしでOS APIが呼ばれた: '+Object.keys(freeCalls).join(','));
  // 契約を戻しても、利用者が開くまでは開かず、写真も読まない。権利復帰の前後でOS呼出回数が変わらないことも確かめる。
  const restoreBefore={...osCalls};
  entitled.click();await wait(()=>button('この日の写真'),'権利の復帰');
  await new Promise(r=>setTimeout(r,1000));
  if(button('この日の写真').getAttribute('aria-expanded')==='true')throw new Error('権利の復帰で自動的に開いた');
  const restoreCalls=callsSince(restoreBefore);
  if(Object.keys(restoreCalls).length)throw new Error('権利の復帰でOS APIが呼ばれた: '+Object.keys(restoreCalls).join(','));
  toggle.click();await wait(()=>!button('この日の写真'),'表示OFF');
  if(document.images.length)throw new Error('OFF後に画像が残存');
  return {時間帯:Intl.DateTimeFormat().resolvedOptions().timeZone,日別件数:counts,最終行と拡大:'成功',日付往復:10,権利なし表示:'案内のみ',権利なし中画像数:0,権利なし中OS呼出回数:freeCalls,権利復帰中OS呼出回数:restoreCalls,OFF後画像数:document.images.length};
})()`;
console.log(execFileSync(process.execPath, ['scripts/qa/device-photos/cdp.mjs', expression], { encoding: 'utf8' }).trim());
