import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript';
import { expect, it, vi } from 'vitest';
import { normalizeGoogleEvent, toEventRow } from '../../packages/core/src/google-events';

const source=(file:string)=>transpileModule(readFileSync(resolve('supabase/functions',file),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
async function importCopies(failLookup=false) {
  let handler!:(request:Request)=>Promise<Response>;
  const filters:Record<string,unknown>[]=[];
  const raw=Array.from({length:205},(_,i)=>({id:`copy-${i}`,summary:'自作コピー',start:{date:'2026-10-03'},end:{date:'2026-10-04'}}));
  raw.push({id:'external',summary:'外部予定',start:{date:'2026-10-03'},end:{date:'2026-10-04'}});
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>({error:null,data:
    name==='get_google_sync_targets'?[{user_id:'user',connection_id:'other-connection',calendar_id:'local-import',external_calendar_id:'shared-google',calendar_name:'検証'}]:
    name==='get_google_connection_token'?'refresh':name==='apply_calendar_sync'?{upserted:(args.p_events as unknown[]).length,deleted:0}:null}));
  const client={rpc,auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},from:(table:string)=>{
    const selected:Record<string,unknown>={};
    const q={select:()=>q,eq:(key:string,value:unknown)=>{selected[key]=value;return q;},is:()=>q,
      in:(key:string,value:string[])=>{selected[key]=value;return q;},then:(fn:(value:unknown)=>unknown)=>{
        if(table==='event_google_links') filters.push(selected);
        return Promise.resolve({error:failLookup&&table==='event_google_links'?{message:'照合失敗'}:null,
          data:table==='connections'?[{id:'other-connection'}]:(selected.google_event_id as string[]).filter(id=>id.startsWith('copy-')).map(id=>({google_event_id:id}))}).then(fn);
      }};return q;
  }};
  const deno={env:{get:()=> 'configured'},serve:(fn:typeof handler)=>{handler=fn;}};
  const cors={};runInNewContext(source('_shared/cors.ts'),{exports:cors,Deno:deno,Response});
  runInNewContext(source('sync-calendars/index.ts'),{exports:{},Deno:deno,Response,atob,console:{log:vi.fn(),warn:vi.fn(),error:vi.fn()},
    require:(name:string)=>name.includes('supabase-js')?{createClient:()=>client}:name.includes('google-events')?{normalizeGoogleEvent,toEventRow}:
      name.endsWith('google.ts')?{refreshAccessToken:async()=>({ok:true,accessToken:'access'}),fetchGoogleEvents:async()=>raw}:cors});
  const response=await handler(new Request('https://edge.example.test/sync-calendars',{method:'POST',headers:{Authorization:'Bearer user'},body:'{}'}));
  return {rpc,filters,body:await response.json()};
}
it('別接続経由で読む205件の自作コピーを除外し、外部予定だけを取り込む',async()=>{
  const {rpc,filters,body}=await importCopies();
  const args=rpc.mock.calls.find(c=>c[0]==='apply_calendar_sync')![1];
  expect(args.p_events).toEqual([expect.objectContaining({external_id:'external',title:'外部予定'})]);
  expect(filters).toHaveLength(2);
  expect(filters[0]).toMatchObject({user_id:'user',google_calendar_id:'shared-google'});
  expect(filters[0]).not.toHaveProperty('connection_id');
  expect(body.errors).toEqual([]);
  expect(body.synced[0].upserted).toBe(1);
});
it('コピーの照合が失敗したら重複取り込みせず、そのカレンダーをエラーにする',async()=>{
  const {rpc,body}=await importCopies(true);
  expect(rpc.mock.calls.some(c=>c[0]==='apply_calendar_sync')).toBe(false);
  expect(body.errors).toHaveLength(1);
});
