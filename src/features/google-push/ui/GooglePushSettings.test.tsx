import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GooglePushSettings } from './GooglePushSettings';
const api=vi.hoisted(()=>({ canWrite:true, writeGranted:true, target: null as unknown,
  save:vi.fn(),authorize:vi.fn(),choices:vi.fn() }));
vi.mock('@/features/billing/model/useEntitlements',()=>({useEntitlements:()=>({canWrite:api.canWrite})}));
vi.mock('@/features/billing/ui/PlanSheet',()=>({PlanSheet:({open}:{open:boolean})=>open?<div>課金画面</div>:null}));
vi.mock('@/data/google-push',()=>({
  getPushTarget:async()=>({ok:true,value:api.target}),listPushStatus:async()=>({ok:true,value:[]}),
  getWriteCalendars:api.choices,setPushTarget:api.save,runGooglePush:async()=>({ok:true,value:{failed:0}}),
}));
vi.mock('@/data/connections',()=>({listConnections:async()=>({ok:true,value:[{id:'a',googleEmail:'a@example.test',status:'active',writeGranted:api.writeGranted}]}),startGoogleConnect:api.authorize}));
beforeEach(()=>{api.canWrite=true;api.writeGranted=true;api.target=null;api.save.mockReset().mockResolvedValue({ok:true});api.authorize.mockReset().mockResolvedValue({ok:true});api.choices.mockReset().mockResolvedValue({ok:true,value:{choices:[{id:'g',name:'反映用'}]}});});
it('契約中は選択した接続とGoogleカレンダーを保存する',async()=>{
 render(<GooglePushSettings calendarId="local"/>);
 await waitFor(()=>expect(screen.getByLabelText('Googleアカウント')).toBeEnabled());
 fireEvent.change(screen.getByLabelText('Googleアカウント'),{target:{value:'a'}});
 await screen.findByRole('option',{name:'反映用'});
 fireEvent.change(screen.getByLabelText('反映先カレンダー'),{target:{value:'g'}});
 fireEvent.click(screen.getByRole('button',{name:'この反映先を保存'}));
 await waitFor(()=>expect(api.save).toHaveBeenCalledWith('local','a','g'));
});
it('未認可では先に追加認可を求める',async()=>{
 api.writeGranted=false; render(<GooglePushSettings calendarId="local"/>);
 await waitFor(()=>expect(screen.getByLabelText('Googleアカウント')).toBeEnabled());
 fireEvent.change(screen.getByLabelText('Googleアカウント'),{target:{value:'a'}});
 fireEvent.click(screen.getByRole('button',{name:'Googleへの書き込みを許可'}));
 await waitFor(()=>expect(api.authorize).toHaveBeenCalledWith({writeConnectionId:'a'}));
 expect(api.save).not.toHaveBeenCalled();
});
it('無料状態では反映先を設定できずプラン案内を開ける',async()=>{
 api.canWrite=false; render(<GooglePushSettings calendarId="local"/>);
 expect(screen.queryByLabelText('Googleアカウント')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'プランを選ぶ'}));
 expect(screen.getByText('課金画面')).toBeInTheDocument();
 await waitFor(()=>expect(api.save).not.toHaveBeenCalled());
});
