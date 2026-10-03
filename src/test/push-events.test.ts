import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { ModuleKind, transpileModule } from 'typescript';
import { beforeEach, expect, it, vi } from 'vitest';
import { googlePushBody } from '../../packages/core/src/google-push';

const source=(path:string)=>transpileModule(readFileSync(resolve('supabase/functions',path),'utf8'),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
let handler:(req:Request)=>Promise<Response>;
let latest:Record<string,unknown>;
let job:Record<string,unknown>;
let remote:Record<string,unknown>|null;
let authenticated:boolean;
let allowed:boolean;
let connected:boolean;
let targetEnabled:boolean;
const rpc=vi.fn();
const http=vi.fn();
let claims:number;
beforeEach(()=>{
  authenticated=true; allowed=true; connected=true; targetEnabled=true;
  latest={id:'event-a',source:'local',title:'検証予定',all_day:true,event_date:'2026-10-03',note:'メモ',location:null,is_secret:false,deleted_at:null};
  job={id:'link-a',user_id:'user-a',event_id:'event-a',connection_id:'connection-a',google_calendar_id:'destination',google_event_id:'mca123',revision:1,lease_id:'lease-a',remote_present:false,remove:false,event:latest};
  remote=null;
  claims=0;
  rpc.mockReset().mockImplementation(async(name:string)=>({error:null,data:
    name==='claim_google_push'?(claims++===0?[job]:[]):name==='can_google_write'?allowed:name==='get_google_connection_token'?'refresh-token':null}));
  http.mockReset().mockImplementation(async(_url:string,options:{method:string})=>{
    if(options.method==='GET') return remote?Response.json(remote):new Response(null,{status:404});
    if(options.method==='DELETE') return new Response(null,{status:204});
    return Response.json({id:'mca123',etag:'tag'});
  });
  const env:Record<string,string>={SUPABASE_URL:'https://db.example.test',SUPABASE_SERVICE_ROLE_KEY:'server-key',GOOGLE_OAUTH_CLIENT_ID:'client',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_PUSH_CRON_SECRET:'cron-secret'};
  const deno={env:{get:(key:string)=>env[key]},serve:(callback:typeof handler)=>{handler=callback;}};
  const cors={}; runInNewContext(source('_shared/cors.ts'),{exports:cors,Deno:deno,Response});
  const client={rpc,auth:{getUser:async()=>({data:{user:authenticated?{id:'user-a',is_anonymous:false}:null},error:null})},
    from:(table:string)=>{const q={select:()=>q,eq:()=>q,is:()=>q,update:()=>q,
      single:async()=>({data:latest,error:null}),maybeSingle:async()=>({data:(table==='google_push_targets'?targetEnabled:connected)?{id:'connection-a'}:null,error:null}),
      then:(fn:(value:unknown)=>unknown)=>Promise.resolve({data:table==='events'?latest:null,error:null}).then(fn)};return q;}};
  runInNewContext(source('push-events/index.ts'),{exports:{},Deno:deno,Response,URLSearchParams,AbortSignal,fetch:http,
    require:(name:string)=>name.includes('supabase-js')?{createClient:()=>client}:name.includes('google-push')?{googlePushBody}:name.endsWith('google.ts')?{refreshAccessToken:async()=>({ok:true,accessToken:'access'})}:cors});
});
const request=(body:unknown={},token='user-token',cronSecret?:string)=>new Request('https://edge.example.test/push-events',{method:'POST',headers:{Authorization:`Bearer ${token}`,...(cronSecret?{'X-Google-Push-Secret':cronSecret}:{})},body:JSON.stringify(body)});
const finish=()=>rpc.mock.calls.find(c=>c[0]==='finish_google_push')?.[1];
it('作成はサーバーが指定したIDを使い、権利と本人接続を確認する',async()=>{
  expect((await handler(request())).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('claim_google_push',{p_user_id:'user-a',p_event_id:null,p_calendar_id:null});
  expect(rpc).toHaveBeenCalledWith('get_google_connection_token',{p_user_id:'user-a',p_connection_id:'connection-a'});
  const sent=JSON.parse(http.mock.calls.find(c=>c[1].method==='POST')![1].body);
  expect(sent.id).toBe('mca123'); expect(sent.summary).toBe('検証予定');
  expect(finish()).toMatchObject({p_state:'synced',p_present:true});
});
it('応答消失後の再試行は同じコピーを更新して二重作成しない',async()=>{
  remote={extendedProperties:{private:{multiCalendarEventId:'event-a'}}};
  await handler(request()); expect(http.mock.calls.some(c=>c[1].method==='POST')).toBe(false);
  expect(http.mock.calls.some(c=>c[1].method==='PATCH')).toBe(true);
});
it('Google側で削除された反映済み予定を再作成しない',async()=>{
  job.remote_present=true; await handler(request());
  expect(finish()).toMatchObject({p_state:'orphaned',p_present:false});
  expect(http).toHaveBeenCalledTimes(1);
});
it('同じIDでもアプリのマーカーが違う予定は上書きしない',async()=>{
  remote={extendedProperties:{private:{multiCalendarEventId:'other-event'}}};
  await handler(request()); expect(finish()).toMatchObject({p_state:'error',p_error:'event-identity-mismatch'});
  expect(http).toHaveBeenCalledTimes(1);
});
it('シークレット化は契約失効中でも既存コピーの削除を行い本文を送らない',async()=>{
  latest.is_secret=true; allowed=false;
  remote={extendedProperties:{private:{multiCalendarEventId:'event-a'}}};
  await handler(request()); expect(finish()).toMatchObject({p_state:'deleted',p_present:false});
  expect(http.mock.calls.map(c=>c[1].method)).toEqual(['GET','DELETE']);
  expect(http.mock.calls.every(c=>c[1].body===undefined)).toBe(true);
});
it('通常の削除はGoogleのコピーだけを消す',async()=>{
  latest.deleted_at='2026-10-03T00:00:00Z';
  remote={extendedProperties:{private:{multiCalendarEventId:'event-a'}}};
  await handler(request()); expect(finish().p_state).toBe('deleted');
});
it('失効中の通常予定は外部へ送らない',async()=>{
  allowed=false; await handler(request()); expect(http).not.toHaveBeenCalled();
  expect(finish().p_error).toBe('subscription-expired');
});
it('停止接続の通常予定を送らない',async()=>{
  connected=false; await handler(request()); expect(http).not.toHaveBeenCalled();
  expect(finish().p_error).toBe('connection-suspended');
});
it('外部サービス障害は再試行可能なエラーとして記録する',async()=>{
  http.mockResolvedValue(new Response(null,{status:503})); await handler(request());
  expect(finish()).toMatchObject({p_state:'error',p_error:'google-503'});
});
it('ジョブ取得後に反映先を停止した場合は本文を送信しない',async()=>{
  targetEnabled=false; await handler(request());
  expect(http.mock.calls.map(c=>c[1].method)).toEqual(['GET']);
  expect(finish().p_error).toBe('target-disabled');
});
it('未認証は拒否し、偽の定期実行フラグでも全ユーザーへ到達しない',async()=>{
  authenticated=false; expect((await handler(request({scheduled:true}))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
it('正規の定期実行だけが全ユーザーのキューを要求できる',async()=>{
  await handler(request({scheduled:true},'server-key','cron-secret'));
  expect(rpc).toHaveBeenCalledWith('claim_google_push',{p_user_id:null,p_event_id:null,p_calendar_id:null});
});
it('個別予定の再試行は本人と指定予定のキューだけを取得する',async()=>{
  await handler(request({action:'retry',eventId:'event-a'}));
  expect(rpc).toHaveBeenCalledWith('claim_google_push',{p_user_id:'user-a',p_event_id:'event-a',p_calendar_id:null});
});
it('読み取り権限だけのGoogleカレンダーは反映先に保存しない',async()=>{
  http.mockResolvedValue(Response.json({accessRole:'reader'}));
  expect((await handler(request({action:'target',calendarId:'local',connectionId:'connection-a',googleCalendarId:'remote'}))).status).toBe(403);
  expect(rpc.mock.calls.some(c=>c[0]==='set_google_push_target')).toBe(false);
});
it.each(['owner','writer'])('Googleの%s権限を確認した反映先を保存する',async(accessRole)=>{
  http.mockResolvedValue(Response.json({accessRole}));
  expect((await handler(request({action:'target',calendarId:'local',connectionId:'connection-a',googleCalendarId:'remote'}))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('set_google_push_target',{p_user_id:'user-a',p_calendar_id:'local',p_connection_id:'connection-a',p_google_calendar_id:'remote'});
});
it('失効中でも本人の反映停止要求を受け付ける',async()=>{
  allowed=false;
  expect((await handler(request({action:'target',calendarId:'local',connectionId:null}))).status).toBe(200);
  expect(http).not.toHaveBeenCalled();
});
it('Googleカレンダー一覧の次ページも取得する',async()=>{
  http.mockReset().mockResolvedValueOnce(Response.json({items:[{id:'a',summary:'予定A'}],nextPageToken:'next'}))
    .mockResolvedValueOnce(Response.json({items:[{id:'b',summary:'予定B'}]}));
  const response=await handler(request({action:'choices',connectionId:'connection-a'}));
  expect(await response.json()).toEqual({choices:[{id:'a',name:'予定A'},{id:'b',name:'予定B'}]});
  expect(http.mock.calls[1]![0]).toContain('pageToken=next');
});
