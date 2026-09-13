import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';

type Binding={installationId:string;bindingGeneration:string}|undefined;
function workerFixture(binding:Binding,visible=true) {
  const events:Record<string,(event:unknown)=>void>={};
  const messages:unknown[]=[],notifications:unknown[]=[],opened:string[]=[];
  const state={binding};
  const self={location:{origin:'https://loyalty.example'},addEventListener:(name:string,listener:(event:unknown)=>void)=>{events[name]=listener;},
    clients:{matchAll:async()=>[{visibilityState:visible?'visible':'hidden',postMessage:(message:unknown)=>messages.push(message)}],openWindow:async(url:string)=>{opened.push(url);}},
    registration:{showNotification:async(title:string,options:unknown)=>{notifications.push({title,options});},getNotifications:async()=>[]}};
  const context={self,URL,Promise,Response,importScripts:()=>{},indexedDB:{open:()=>{
    const request:{onsuccess?:()=>void;result?:unknown}={};
    queueMicrotask(()=>{request.result={close:()=>{},transaction:()=>({objectStore:()=>({get:()=>{
      const read:{onsuccess?:()=>void;result?:unknown}={};queueMicrotask(()=>{read.result=state.binding;read.onsuccess?.();});return read;
    }})})};request.onsuccess?.();});return request;
  }}};
  runInNewContext(readFileSync('public/push-protocol.js','utf8'),context);
  runInNewContext(readFileSync('public/sw.js','utf8'),context);
  return {state,messages,notifications,opened,async push(payload:unknown){
    let work:Promise<unknown>|undefined;
    events.push!({data:{json:()=>payload},waitUntil:(promise:Promise<unknown>)=>{work=promise;}});await work;
  }};
}
describe('coordinated service-worker privacy boundary',()=>{
  it('drops mismatched generations, installations and missing local bindings',async()=>{
    const binding={installationId:randomUUID(),bindingGeneration:randomUUID()},fixture=workerFixture(binding);
    for(const data of [{type:'loyalty.notification.v1',...binding,bindingGeneration:randomUUID()},
      {type:'loyalty.notification.v1',...binding,installationId:randomUUID()},{}])await fixture.push({data});
    expect(fixture.notifications).toEqual([]);
    fixture.state.binding=undefined;
    await fixture.push({data:{type:'loyalty.notification.v1',...binding}});
    expect(fixture.notifications).toEqual([]);
  });
  it('uses minimal previews and refuses automatic provider notification payloads',async()=>{
    const binding={installationId:randomUUID(),bindingGeneration:randomUUID()},fixture=workerFixture(binding);
    const data={type:'loyalty.notification.v1',...binding,title:'Private customer detail',url:'https://attacker.invalid'};
    await fixture.push({notification:{title:'Unsafe automatic preview'},data});
    expect(fixture.notifications).toEqual([]);
    await fixture.push({data});
    expect(fixture.notifications).toHaveLength(1);
    expect(JSON.stringify(fixture.notifications)).not.toContain('Private customer detail');
    expect(JSON.stringify(fixture.notifications)).not.toContain('attacker.invalid');
  });
  it('forwards a registration nonce only to a visible page, never as a notification',async()=>{
    const payload={data:{type:'loyalty.registration.v1',installationId:randomUUID(),challengeId:randomUUID(),nonce:'A'.repeat(43)}};
    const hidden=workerFixture(undefined,false);await hidden.push(payload);
    expect(hidden.messages).toEqual([]);expect(hidden.notifications).toEqual([]);
    const visible=workerFixture(undefined);await visible.push(payload);
    expect(visible.messages).toEqual([{type:'loyalty-foreground-challenge',data:payload.data}]);
    expect(visible.notifications).toEqual([]);
    await visible.push({data:{...payload.data,nonce:'malformed'}});expect(visible.messages).toHaveLength(1);
  });
});
