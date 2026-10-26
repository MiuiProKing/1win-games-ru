import test from 'node:test';
import assert from 'node:assert/strict';
import {startLive} from '../assets/live.js';

class Target {
  listeners=new Map(); textContent=''; innerHTML=''; className='';
  addEventListener(type,fn){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(fn);}
  removeEventListener(type,fn){this.listeners.get(type)?.delete(fn);}
  emit(type,event={}){for(const fn of this.listeners.get(type)||[])fn(event);}
}
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness(t){
  const originals=new Map(), timers=new Map(), intervals=new Map(),nodes=new Map();let next=1,cleanup=()=>{};
  const doc=new Target(), win=new Target(); doc.hidden=false;
  for(const [key,value] of Object.entries({document:doc,window:win,setTimeout:(fn,ms)=>{const id=next++;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{const id=next++;intervals.set(id,fn);return id;},clearInterval:id=>intervals.delete(id)})){
    originals.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});
  }
  originals.set('fetch',Object.getOwnPropertyDescriptor(globalThis,'fetch'));
  const queue=[],calls=[];
  globalThis.fetch=async(url,options)=>{calls.push({url:new URL(url),options});const item=queue.shift();if(item instanceof Error)throw item;assert.ok(item,'unexpected fetch');return {ok:true,json:async()=>item};};
  const root={innerHTML:'',querySelector:key=>{if(!nodes.has(key))nodes.set(key,new Target());return nodes.get(key);}};
  t.after(()=>{cleanup();for(const [key,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}});
  const run=ms=>{const entry=[...timers].find(([,item])=>item.ms===ms);assert.ok(entry,`missing timer ${ms}`);timers.delete(entry[0]);entry[1].fn();};
  const node=id=>root.querySelector('#'+id);
  const start=()=>{cleanup=startLive(root,{});return cleanup;};
  return {doc,win,queue,calls,root,node,run,start,timers,intervals};
}
const fixture=(now=Date.now())=>({rounds:Array.from({length:300},(_,i)=>({id:'r'+i,coefficient:i%5===0?12+(i%9)*10:1.25+i%4,round_timestamp:new Date(now-(300-i)*30000).toISOString(),feed_order:i+1,estimated:false}))});

test('real model renders, polls by cursor, keeps equal coefficients, and recovers after network failure',async t=>{
  const h=harness(t);h.queue.push(fixture());h.start();await flush();
  assert.equal(h.node('live-count').textContent,'300 записей');
  assert.match(h.node('live-status').textContent,/LIVE/);
  assert.match(h.node('live-model-state').textContent,/Модель по 300/);
  assert.match(h.node('live-horizons').innerHTML,/%/);
  assert.doesNotMatch(h.node('live-model-state').textContent,/undefined/);
  assert.equal(h.calls[0].options.credentials,'omit');
  assert.equal(h.calls[0].options.cache,'no-store');
  h.queue.push(new TypeError('offline'));h.run(5000);await flush();
  assert.equal(h.calls[1].url.searchParams.get('after'),'300');
  assert.equal(h.node('live-status').textContent,'Нет связи');
  assert.doesNotMatch(h.node('live-horizons').innerHTML,/\d[.,]\d%/);
  h.queue.push({rounds:[{id:'new',coefficient:4.25,round_timestamp:new Date().toISOString(),feed_order:301,estimated:false}]});
  h.run(10000);await flush();
  assert.equal(h.node('live-count').textContent,'301 записей');
  assert.match(h.node('live-status').textContent,/LIVE/);
  assert.equal(h.node('live-value').textContent,'4.25×');
});

test('pause, hidden document and BFCache suspend requests; return resumes one poller; cleanup removes timers',async t=>{
  const h=harness(t);h.queue.push(fixture());const stop=h.start();await flush();
  h.node('live-pause').emit('click');assert.equal(h.timers.size,0);assert.equal(h.node('live-status').textContent,'Пауза');
  h.queue.push({rounds:[]});h.node('live-pause').emit('click');await flush();assert.equal(h.calls.length,2);
  h.doc.hidden=true;h.doc.emit('visibilitychange');assert.equal(h.timers.size,0);
  h.queue.push({rounds:[]});h.doc.hidden=false;h.doc.emit('visibilitychange');await flush();assert.equal(h.calls.length,3);
  h.win.emit('pagehide',{persisted:true});assert.equal(h.timers.size,0);
  h.queue.push({rounds:[]});h.win.emit('pageshow',{persisted:true});await flush();assert.equal(h.calls.length,4);
  assert.equal(h.timers.size,1);stop();assert.equal(h.timers.size,0);assert.equal(h.intervals.size,0);
  assert.equal(h.doc.listeners.get('visibilitychange').size,0);
});

test('a rejected future row forces full snapshot retry instead of skipping its order',async t=>{
  const h=harness(t),data=fixture();
  data.rounds.push({id:'future',coefficient:50,round_timestamp:new Date(Date.now()+3600000).toISOString(),feed_order:301});
  h.queue.push(data);h.start();await flush();
  h.queue.push({rounds:[]});h.run(5000);await flush();
  assert.equal(h.calls[1].url.searchParams.has('after'),false);
});
