import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,cleanDemoHistory,DEMO_KINDS} from '../assets/demo-core.js';

function seeded(seed=123) {return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}

test('mine layouts keep all hazards and sample marks unique and disjoint for every allowed count',()=>{
  for(let hazards=1;hazards<=10;hazards++){
    const result=createDemo('mines',{hazards},seeded(hazards));
    assert.equal(result.hazards.length,hazards);
    assert.equal(new Set(result.hazards).size,hazards);
    assert.equal(result.safeCells.length,5);
    assert.equal(new Set(result.safeCells).size,5);
    assert.ok(result.hazards.every(value=>value>=0&&value<25));
    assert.ok(result.safeCells.every(value=>value>=0&&value<25&&!result.hazards.includes(value)));
    assert.match(result.label,/Учебное/);
  }
});

test('towers have exactly one in-bounds choice per each of eight levels',()=>{
  for(let seed=0;seed<25;seed++){
    const result=createDemo('towers',{},seeded(seed));
    assert.equal(result.path.length,8);
    assert.ok(result.path.every(value=>Number.isInteger(value)&&value>=0&&value<3));
  }
});

test('coin, cups and football choices cover their defined outcomes at RNG boundaries',()=>{
  for(const [kind,property,count]of[['coin','side',2],['cups','selected',3],['football','selected',9]]){
    assert.equal(createDemo(kind,{},()=>0)[property],0);
    assert.equal(createDemo(kind,{},()=>.9999999)[property],count-1);
  }
});

test('flight demonstration values are finite bounded examples rather than source timestamps or probabilities',()=>{
  for(const value of[0,.25,.5,.99999999]){
    const result=createDemo('flight',{},()=>value);
    assert.ok(Number.isFinite(result.coefficient));
    assert.ok(result.coefficient>=1.01&&result.coefficient<=25);
    assert.match(result.label,/учебное значение/);
    assert.equal('probability'in result,false);
    assert.equal('entryAt'in result,false);
    assert.equal('accuracy'in result,false);
  }
});

test('malformed kinds, mine counts and RNG outputs cannot silently create invalid patterns',()=>{
  assert.throws(()=>createDemo('actual-live-crash'),RangeError);
  for(const hazards of[0,11,2.5,NaN,'3'])assert.throws(()=>createDemo('mines',{hazards}),RangeError);
  for(const value of[-1,1,Infinity,NaN])assert.throws(()=>createDemo('flight',{},()=>value),RangeError);
  assert.throws(()=>createDemo('flight',{},null),TypeError);
});

test('a seeded demo is reproducible and leaves input options unchanged',()=>{
  const options=Object.freeze({hazards:4});
  for(const kind of DEMO_KINDS)assert.deepEqual(createDemo(kind,options,seeded()),createDemo(kind,options,seeded()));
  assert.equal(options.hazards,4);
});

test('stored demo history rejects malformed entries, preserves repeated user results and stays bounded',()=>{
  const entries=Array.from({length:15},(_,i)=>({at:1000+i,label:i%2?'Орёл':'Решка',other:'not-retained'}));
  const input=[null,{at:'1000',label:'string-time'},{at:Infinity,label:'infinite'},{at:0,label:'zero'},{at:1,label:''},{at:1,label:'a'.repeat(121)},...entries];
  const result=cleanDemoHistory(input);
  assert.equal(result.length,10);
  assert.deepEqual(result[0],{at:1000,label:'Решка'});
  assert.deepEqual(result[2],{at:1002,label:'Решка'});
  assert.equal(entries.length,15);
  assert.equal(result.some(entry=>'other'in entry),false);
  assert.deepEqual(cleanDemoHistory({}),[]);
});
