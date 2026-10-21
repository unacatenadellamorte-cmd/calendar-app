import {it,expect,vi} from 'vitest';
import {act,renderHook,waitFor} from '@testing-library/react';
const boundary=vi.hoisted(()=>({list:vi.fn(),resume:undefined as (()=>void)|undefined,sync:vi.fn()}));
vi.mock('@/data/events',()=>({listEvents:boundary.list,createEvent:vi.fn(),deleteEvent:vi.fn(),restoreEvent:vi.fn(),setEventReminder:vi.fn(),updateEvent:vi.fn()}));
vi.mock('@/platform/widget',()=>({refreshFeaturedWidget:vi.fn()}));
vi.mock('@/platform/appLifecycle',()=>({onAppResume:(cb:()=>void)=>{boundary.resume=cb;return()=>{};}}));
vi.mock('@/data/device-sync',()=>({syncDeviceCalendarsNow:boundary.sync}));
vi.mock('@/app/auth-context',()=>({useAuth:()=>({state:'guest',session:null})}));
import {useEvents} from '@/features/events/model/useEvents';
import {DeviceSyncOnResume} from '@/app/DeviceSyncOnResume';
import {render} from '@testing-library/react';
const event=(title:string)=>({id:'e1',title,calendarId:'c1',source:'local',allDay:false,startsAt:'2026-10-22T01:00:00Z',endsAt:'2026-10-22T02:00:00Z'});
it('D9 重複した一覧取得の古い応答が新しい予定名を上書きしない',async()=>{
 boundary.list.mockResolvedValue({ok:true,value:[event('初期')]});
 const {result}=renderHook(()=>useEvents(true));await waitFor(()=>expect(result.current.loading).toBe(false));
 let oldDone!:(v:unknown)=>void,newDone!:(v:unknown)=>void;
 boundary.list.mockImplementationOnce(()=>new Promise(r=>oldDone=r)).mockImplementationOnce(()=>new Promise(r=>newDone=r));
 let first!:Promise<void>,second!:Promise<void>;act(()=>{first=result.current.reload();second=result.current.reload();});
 await act(async()=>{newDone({ok:true,value:[event('最新')]});await second;});expect(result.current.events[0]!.title).toBe('最新');
 await act(async()=>{oldDone({ok:true,value:[event('古い')]});await first;});expect(result.current.events[0]!.title).toBe('最新');
});
it('D10 復帰同期が保存先を更新しても表示中の予定は再取得される',async()=>{
 boundary.list.mockReset().mockResolvedValue({ok:true,value:[event('同期前')]});
 boundary.sync.mockImplementation(async()=>{boundary.list.mockResolvedValue({ok:true,value:[event('同期後')]});return {ok:true,value:{synced:[],errors:[]}};});
 const {result}=renderHook(()=>useEvents(true));render(<DeviceSyncOnResume/>);
 await waitFor(()=>expect(result.current.loading).toBe(false));
 await act(async()=>{boundary.resume?.();await Promise.resolve();});
 expect(boundary.sync).toHaveBeenCalled();expect(boundary.list).toHaveBeenCalledTimes(2);expect(result.current.events[0]!.title).toBe('同期後');
});
