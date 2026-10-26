import test from 'node:test';
import assert from 'node:assert/strict';
import {filterGames, gameCountLabel} from '../assets/catalog.js';
import {GAMES} from '../assets/catalog-data.js';

test('both LuckyJet variants remain discoverable by Russian and original names', () => {
  for (const query of [' ЛАКИ ДЖЕТ ', 'luckyjet', 'LuckyJet']) {
    assert.deepEqual(filterGames(GAMES,query).map(g=>g.key),['luckyjetv12','luckyjet']);
  }
  assert.equal(filterGames(GAMES,'v12')[0].key,'luckyjetv12');
});
test('query and mode filters compose without mutating the catalog', () => {
  const original=JSON.stringify(GAMES);
  assert.equal(filterGames(GAMES,'','live').length,2);
  assert.equal(filterGames(GAMES,'','demo').length,12);
  assert.equal(filterGames(GAMES,'luckyjet','demo').length,0);
  assert.equal(filterGames(GAMES,'несуществующая игра').length,0);
  assert.equal(filterGames(GAMES,'','invalid').length,14);
  assert.equal(JSON.stringify(GAMES),original);
  assert.equal(filterGames(GAMES,'орел')[0].key,'coinflip');
});
test('Russian result counters use singular, paucal and plural forms', () => {
  for (const [n,label] of [[0,'0 игр'],[1,'1 игра'],[2,'2 игры'],[4,'4 игры'],[5,'5 игр'],[11,'11 игр'],[14,'14 игр'],[21,'21 игра'],[22,'22 игры']]) assert.equal(gameCountLabel(n),label);
});
