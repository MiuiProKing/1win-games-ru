import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONFIG,newSourceState,requestSourceSignal,advanceSource,flightDuration,restoreSourceState} from '../assets/source-logic.js';
const NOW=Date.parse('2026-10-26T10:00:30Z');
const seq=(...values)=>()=>{assert.ok(values.length,'unexpected RNG draw');return values.shift();};
const row=(id,coefficient,timestamp,order)=>({id,coefficient,timestamp,order,estimated:false});
const baseline=row('baseline',1.2,NOW-1000,100);
function ready(){const s=newSourceState('v12');requestSourceSignal(s,NOW,seq(0,0,0),baseline);return s;}

test('classic matches the source 7–12s reveal, random bounds, one-minute window and three-minute cooldown',()=>{
  const s=newSourceState('classic');assert.equal(requestSourceSignal(s,NOW,seq(0)),true);assert.equal(s.animationEnd,NOW+7000);
  assert.equal(requestSourceSignal(s,NOW+1,seq()),false);
  advanceSource(s,NOW+6999,[],seq());assert.equal(s.signal,null);
  advanceSource(s,NOW+7000,[],seq(0,0,0,0));
  assert.equal(s.signal.low,2);assert.equal(s.signal.high,3);assert.equal(s.signal.demoPercent,96);
  assert.equal(s.signal.startAt,NOW+127000);assert.equal(s.signal.endAt,s.signal.startAt+60000);assert.equal(s.nextAt,NOW+187000);
  assert.equal(s.history[0].status,'unchecked');assert.equal(requestSourceSignal(s,s.nextAt-1,seq()),false);
  assert.equal(requestSourceSignal(s,s.nextAt,seq(.999999)),true);assert.equal(s.animationEnd,s.nextAt+12000);
});
test('classic upper bounds and source random branch are retained',()=>{
  const s=newSourceState('classic');requestSourceSignal(s,NOW,seq(0));advanceSource(s,NOW+7000,[],seq(.999999,.999999,.999999,.999999));
  assert.equal(s.signal.low,2.35);assert.equal(s.signal.high,4);assert.equal(s.signal.demoPercent,98);assert.equal(s.signal.startAt,NOW+187000);
});
test('V12 preserves floor-to-minute delay, 2–2.5 target, 60s window and 45s flight margin',()=>{
  const s=ready();assert.equal(s.signal.target,2);assert.equal(s.signal.startAt,Date.parse('2026-10-26T10:02:00Z'));
  assert.equal(s.signal.verifyUntil-s.signal.startAt,105000);assert.equal(s.signal.demoPercent,96);
  assert.equal(requestSourceSignal(s,NOW+1,seq()),false);
  assert.equal(flightDuration(1),0);assert.equal(flightDuration(10000),60000);assert.equal(SOURCE_CONFIG.series,3);
});
test('source series does not generate automatic signals',()=>{
  const s=newSourceState('v12');advanceSource(s,NOW,Array.from({length:8},(_,i)=>row('r'+i,3,NOW-i*1000,10-i)),seq());
  assert.equal(s.streak,8);assert.equal(s.phase,'observe');assert.equal(s.signal,null);
});
test('V12 verifies against completion timestamp and estimated start, not delayed arrival time',()=>{
  const s=ready(),at=s.signal.startAt;
  const hit=row('hit',3,at+1000+flightDuration(3),101);
  advanceSource(s,at+104000,[baseline,hit],seq());
  assert.equal(s.phase,'result');assert.equal(s.last.status,'hit');assert.equal(s.last.roundId,'hit');assert.equal(s.last.round,1);assert.equal(s.stats.hit,1);
  advanceSource(s,at+105000,[baseline,hit],seq());assert.equal(s.stats.hit,1);
  advanceSource(s,s.resultEnd,[baseline,hit],seq());assert.equal(s.phase,'observe');assert.equal(s.signal,null);
});
test('estimated-start window is inclusive at start and exclusive at its end; estimated source timestamps cannot hit',()=>{
  for(const [offset,estimated,expected] of [[0,false,'result'],[60000,false,'window'],[0,true,'window']]){
    const s=ready(),at=s.signal.startAt;
    const r={...row('candidate',2,at+offset+flightDuration(2),101),estimated};
    advanceSource(s,at+104000,[baseline,r],seq());assert.equal(s.phase,expected);
  }
});
test('miss needs contiguous recorded coverage; missing records, disconnect and stale watermark become unknown',()=>{
  for(const mode of ['complete','gap','disconnect','short']){
    const s=ready(),at=s.signal.startAt,rows=[baseline,row('early',1.1,at+5000,101),row('end',1.2,s.signal.verifyUntil+1,mode==='gap'?103:102)];
    if(mode==='short')rows.pop();
    advanceSource(s,s.signal.verifyUntil+1,rows,seq(),{available:mode!=='disconnect'});
    if(mode==='complete'){assert.equal(s.last.status,'miss');assert.equal(s.stats.miss,1);}
    else{assert.equal(s.last,null);advanceSource(s,s.signal.verifyUntil+60001,rows,seq(),{available:mode!=='disconnect'});assert.equal(s.last.status,'unknown');assert.equal(s.stats.miss,0);}
  }
});
test('out-of-window history never passes a target, including duplicate equal coefficients',()=>{
  const s=ready(),at=s.signal.startAt;
  advanceSource(s,at+104000,[baseline,row('before',20,at-1000,101),row('after',20,at+60000+flightDuration(20),102)],seq());
  assert.equal(s.last,null);assert.equal(s.phase,'window');
});
test('reload preserves the locked V12 window and classic cooldown; malformed storage resets safely',()=>{
  const s=ready(),restored=restoreSourceState(JSON.stringify(s),'v12',NOW+1000);
  assert.deepEqual(restored,s);assert.equal(requestSourceSignal(restored,NOW+1000,seq()),false);
  const classic=newSourceState('classic');requestSourceSignal(classic,NOW,seq(0));advanceSource(classic,NOW+7000,[],seq(0,0,0,0));
  const restoredClassic=restoreSourceState(JSON.stringify(classic),'classic',NOW+8000);assert.equal(restoredClassic.nextAt,classic.nextAt);
  for(const invalid of ['{broken',null,{...s,phase:'invalid'},{...s,signal:{...s.signal,target:500}},{...s,stats:{hit:-1,miss:0,unknown:0}}])assert.equal(restoreSourceState(invalid,'v12',NOW+1000).phase,'observe');
});
