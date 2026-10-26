import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {referenceView} from '../assets/lucky-reference-core.js';
const now=Date.parse('2026-10-26T10:00:00Z');
const state={rows:[{id:'a',coefficient:15,timestamp:now-10000},{id:'b',coefficient:3,timestamp:now-30000}],active:true,error:'',analyzedAt:now-1000,report:{status:'ready',event:{threshold:10,horizons:[{rounds:5,probability:.27}]},timing:{eventWait:{medianMs:60000,fromAt:now+10000,toAt:now+90000}}}};
test('reference screens project the actual history and model with a fixed calculation timestamp',()=>{
  const view=referenceView(state,now);
  assert.equal(view.latest.coefficient,15);assert.equal(view.previous.coefficient,3);
  assert.equal(view.threshold,10);assert.equal(view.probability,.27);assert.equal(view.frequency,.5);
  assert.equal(view.estimateAt,now+59000);assert.equal(view.remaining,59000);
  assert.equal(referenceView(state,now+30000).estimateAt,view.estimateAt);
  assert.equal(referenceView(state,now+30000).remaining,29000);
});
test('stale, paused, disconnected and insufficient input hides current estimates but preserves history',()=>{
  for(const input of [{...state,error:'Нет связи'},{...state,active:false},{...state,report:{status:'insufficient'}},{...state,rows:[{...state.rows[0],estimated:true}]},{...state,rows:[{...state.rows[0],timestamp:now-180001}]}]){
    const view=referenceView(input,now);assert.equal(view.threshold,null);assert.equal(view.probability,null);assert.equal(view.estimateAt,null);assert.equal(view.latest.coefficient,15);
  }
});
test('expired or missing time estimates are not pushed into another future window',()=>{
  assert.equal(referenceView(state,now+60000).estimateAt,null);
  for(const report of [{...state.report,timing:null},{...state.report,timing:{eventWait:{medianMs:NaN}}}])assert.equal(referenceView({...state,report},now).remaining,null);
  assert.equal(referenceView({rows:[]},now).latest,null);
});
test('both skins expose every controller element once, retain mobile zoom, and link to complete analysis',()=>{
  const root=new URL('../',import.meta.url),controller=fs.readFileSync(new URL('assets/lucky-reference.js',root),'utf8');
  const required=[...controller.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
  for(const name of ['luckyjet','luckyjetv12']){
    const html=fs.readFileSync(new URL('games/'+name+'.html',root),'utf8');
    const ids=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
    for(const id of required)assert.equal(ids.filter(v=>v===id).length,1,`${name}: ${id}`);
    assert.match(html,/analysis\.html#journal/);assert.doesNotMatch(html,/user-scalable=no/);
  }
  const analysis=fs.readFileSync(new URL('games/analysis.html',root),'utf8');
  assert.match(analysis,/LuckyJetMarked/);assert.match(analysis,/api\/rounds/);
  assert.doesNotMatch(controller,/Math\.random/);
});
