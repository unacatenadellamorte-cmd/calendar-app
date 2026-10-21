import {it,expect,vi} from 'vitest';
import {act,renderHook,waitFor} from '@testing-library/react';
const mock=vi.hoisted(()=>({list:vi.fn(),refresh:vi.fn(),toggle:vi.fn()}));
vi.mock('@/data/google-calendars',()=>({listConnectionCalendars:mock.list,refreshGoogleCalendars:mock.refresh,setGoogleCalendarSelected:mock.toggle}));
import {useGoogleCalendars} from '@/features/connections/model/useGoogleCalendars';
it('D11 候補の更新中に選択保存すると遅い一覧応答でチェックを維持する',async()=>{
 const choice={externalCalendarId:'g1',selected:false,summary:'架空'};let finish!:(v:unknown)=>void;
 mock.list.mockResolvedValueOnce({ok:true,value:[choice]}).mockImplementationOnce(()=>new Promise(r=>finish=r));mock.refresh.mockResolvedValue({ok:true,value:{count:1}});mock.toggle.mockResolvedValue({ok:true,value:undefined});
 const {result}=renderHook(()=>useGoogleCalendars('connection'));
 await waitFor(()=>expect(mock.list).toHaveBeenCalledTimes(2));
 mock.list.mockResolvedValueOnce({ok:true,value:[{...choice,selected:true}]});
 await act(async()=>{await result.current.toggle('g1',true);});expect(result.current.choices[0]!.selected).toBe(true);
 await act(async()=>{finish({ok:true,value:[choice]});await Promise.resolve();});
 expect(result.current.choices[0]!.selected).toBe(true);expect(mock.toggle).toHaveBeenCalledWith('connection','g1',true);
});
