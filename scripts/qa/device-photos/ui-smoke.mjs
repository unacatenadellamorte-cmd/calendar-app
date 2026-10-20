// 実フック・実UI・実MediaStoreの結合試験。検証画面で全部許可にした後に使う。
import { execFileSync } from 'node:child_process';
const expression = `(async () => {
  const wait = async predicate => { for(let i=0;i<100;i++){if(predicate())return;await new Promise(r=>setTimeout(r,100));}throw new Error('表示待ちが時間切れです'); };
  const button = text => [...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||(text==='この日の写真'&&b.textContent.includes(text)));
  const photos = () => [...document.querySelectorAll('button[aria-label]')].filter(b=>b.getAttribute('aria-label').includes('の写真を拡大'));
  const initialDay = document.querySelector('#day');
  if(initialDay.value!=='2026-10-20'){
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(initialDay,'2026-10-20');
    initialDay.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
  }
  const toggle = document.querySelector('#enabled');
  if (!toggle.checked) toggle.click();
  await wait(()=>button('この日の写真'));
  if (button('この日の写真').getAttribute('aria-expanded')==='true') {button('この日の写真').click();await new Promise(r=>setTimeout(r,100));}
  button('この日の写真').click();
  await wait(()=>button('さらに読み込む'));
  if (photos().length>=40) throw new Error('一覧が仮想化されていません');
  for(let page=0;page<2;page++){
    const oldHeight = document.querySelector('[role=list] > div').style.height;
    button('さらに読み込む').click();
    await wait(()=>document.querySelector('[role=list] > div').style.height!==oldHeight);
  }
  if(button('さらに読み込む')) throw new Error('最終ページへ到達していません');
  document.querySelector('[role=list]').scrollTop=100000;
  await wait(()=>photos().some(b=>b.getAttribute('aria-label')==='23:59 の写真を拡大'));
  photos().at(-1).click();
  await wait(()=>document.querySelector('[role=dialog] img')?.naturalWidth===1600);
  document.querySelector('[role=dialog] button').click();
  await wait(()=>!document.querySelector('[role=dialog]'));
  const dateInput=document.querySelector('#day');
  const choose = async date => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(dateInput,date);
    dateInput.dispatchEvent(new Event('change',{bubbles:true}));
    dateInput.dispatchEvent(new Event('input',{bubbles:true}));
    await wait(()=>document.querySelector('section[data-date]')?.dataset.date===date);
    await wait(()=>photos().length>0||document.body.innerText.includes('この日に撮影した写真はありません。'));
  };
  await choose('2026-10-19'); if(photos().length!==1)throw new Error('前日の表示が不正です');
  await choose('2026-10-21'); if(photos().length!==1)throw new Error('翌日の表示が不正です');
  await choose('2026-10-22'); if(photos().length!==0)throw new Error('0件の表示が不正です');
  for(let i=0;i<10;i++){await choose('2026-10-20');await choose('2026-10-22');}
  toggle.click();await wait(()=>!button('この日の写真'));
  if(document.images.length)throw new Error('OFF後に画像が残っています');
  return { 一覧と最終ページ: '成功', 拡大と閉じる: '成功', 前日翌日0件: '成功', 日付往復: 10, OFF画像数: document.images.length };
})()`;
console.log(execFileSync(process.execPath, ['scripts/qa/device-photos/cdp.mjs', expression], { encoding: 'utf8' }).trim());
