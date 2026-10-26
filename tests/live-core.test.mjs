import test from 'node:test';
import assert from 'node:assert/strict';
import {HISTORY_API, MAX_RECORDS, STALE_MS, normalizeRounds, mergeRounds, sourceStatus, historyStats} from '../assets/live-core.js';

const NOW = Date.parse('2026-10-25T15:00:00Z');
const raw = (id, coefficient, offset = 0, order = 100) => ({id, coefficient, round_timestamp:new Date(NOW + offset).toISOString(), feed_order:order, estimated:false});

test('read endpoint is our fixed public history proxy', () => {
  const url = new URL(HISTORY_API);
  assert.equal(url.origin, 'https://luckyjet-full-logic-v13-mpk.miuipro1993.chatgpt.site');
  assert.equal(url.pathname, '/api/rounds');
  assert.equal(url.search, '');
  assert.equal(url.username + url.password, '');
});

test('normalization retains equal coefficients with distinct IDs and exact absolute source time', () => {
  const result = normalizeRounds({rounds:[raw('a',11,-2000,100),raw('b',11,-1000,101),raw('b',11,-1000,101)]}, NOW);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(row => row.id), ['a','b']);
  assert.deepEqual(result.map(row => row.coefficient), [11,11]);
  assert.deepEqual(result.map(row => row.timestamp), [NOW-2000,NOW-1000]);
  assert.deepEqual(result.map(row => row.order), [100,101]);
});

test('invalid numbers, missing IDs and unbounded local/future timestamps do not become observations', () => {
  const input = [raw('ok','2.5',-1000),raw('',2),raw(null,2),raw('bad',NaN),raw('boolean',true),raw('small',.99),raw('future',100,1),{...raw('untimed',3),round_timestamp:null},{...raw('local',3),round_timestamp:'2026-10-25T14:00:00'}];
  const result = normalizeRounds({rounds:input}, NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'ok');
  assert.equal(result[0].coefficient, 2.5);
  assert.throws(() => normalizeRounds({data:[]}, NOW), /истори/);
  assert.deepEqual(normalizeRounds({rounds:[]}, NOW), []);
});

test('a future conflicting duplicate cannot poison a currently available record', () => {
  const result = normalizeRounds({rounds:[raw('same',100,NOW,1000),raw('same',2,-1000,100)]}, NOW);
  assert.equal(result.length, 1);
  assert.equal(result[0].coefficient, 2);
  assert.equal(result[0].timestamp, NOW-1000);
});

test('conflicting result IDs stop both a snapshot and a merge', () => {
  assert.throws(() => normalizeRounds({rounds:[raw('same',2,-1000),raw('same',3,-1000)]}, NOW), Error);
  const before = normalizeRounds({rounds:[raw('same',2,-1000)]}, NOW);
  const after = normalizeRounds({rounds:[raw('same',3,-1000)]}, NOW);
  assert.throws(() => mergeRounds(before, after), /изменил/);
});

test('merging uses distinct IDs, source timestamps and order tie break while retaining at most2000', () => {
  const all = normalizeRounds({rounds:Array.from({length:2100}, (_, index) => raw('r'+index,2,-(2100-index)*1000,index+1))}, NOW);
  const before = all.slice(0,1000), incoming = all.slice(500);
  const result = mergeRounds(before,incoming);
  assert.equal(MAX_RECORDS, 2000);
  assert.equal(result.length, 2000);
  assert.equal(result[0].id, 'r2099');
  assert.equal(result.at(-1).id, 'r100');
  assert.equal(new Set(result.map(row => row.id)).size, 2000);
  const tie = normalizeRounds({rounds:[raw('low',2,-1000,100),raw('high',2,-1000,101)]}, NOW);
  assert.deepEqual(mergeRounds([],tie).map(row => row.id), ['high','low']);
});

test('empty deltas preserve history and operations never mutate retained inputs', () => {
  const rows = normalizeRounds({rounds:[raw('a',11,-1000)]}, NOW);
  Object.freeze(rows[0]); Object.freeze(rows);
  const copy = structuredClone(rows);
  assert.deepEqual(mergeRounds(rows,[]), copy);
  sourceStatus(rows, NOW); historyStats(rows);
  assert.deepEqual(rows, copy);
});

test('source freshness distinguishes empty, future, estimated and stale records at exact boundary', () => {
  assert.equal(sourceStatus([],NOW).kind,'empty');
  const row = normalizeRounds({rounds:[raw('a',2,-STALE_MS)]}, NOW)[0];
  assert.equal(sourceStatus([row],NOW).kind,'live');
  assert.equal(sourceStatus([row],NOW+1).kind,'stale');
  assert.equal(sourceStatus([{...row,timestamp:NOW+1}],NOW).kind,'stale');
  assert.equal(sourceStatus([{...row,estimated:true}],NOW).kind,'estimated');
  assert.equal(sourceStatus([{...row,timestamp:NaN}],NOW).kind,'stale');
  assert.equal(sourceStatus([{...row,timestamp:null}],NOW).kind,'stale');
});

test('ambiguous duplicate timestamps, estimation flags and feed order cannot silently choose one version', () => {
  const base = raw('same',2,-1000,100);
  for (const conflicting of [{...base,round_timestamp:new Date(NOW-2000).toISOString()},{...base,estimated:true},{...base,feed_order:101}]) {
    assert.throws(() => normalizeRounds({rounds:[base,conflicting]}, NOW), Error);
  }
});

test('history summaries use inclusive10x/100x thresholds and no invented empty values', () => {
  const rows = normalizeRounds({rounds:[raw('a',1),raw('b',2),raw('c',9.99),raw('d',10),raw('e',100)]}, NOW);
  assert.deepEqual(historyStats(rows),{count:5,maximum:100,above10:.4,above100:.2});
  assert.deepEqual(historyStats([]),{count:0,maximum:null,above10:null,above100:null});
});
