import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TITLES, titleFor, nextTitle } from '../src/titles.js';

const EXPECTED = [
  ['t01', 1], ['t02', 2], ['t03', 4], ['t04', 6], ['t05', 9], ['t06', 11], ['t07', 15],
  ['t08', 26], ['t09', 34], ['t10', 41], ['t11', 48], ['t12', 59], ['t13', 68],
];

// 受け入れ条件 3
test('称号の表は 13 段階で、id と必要なレベルが計画の表どおり', () => {
  assert.equal(TITLES.length, 13);
  assert.deepEqual(TITLES.map((x) => [x.id, x.level]), EXPECTED);
});

test('称号の表は凍結されている', () => {
  assert.ok(Object.isFrozen(TITLES));
});

test('称号の表は、必要なレベルが小さい順で重ならない', () => {
  for (let i = 1; i < TITLES.length; i++) {
    assert.ok(TITLES[i].level > TITLES[i - 1].level, `${TITLES[i].id} は前より大きいレベル`);
  }
  assert.equal(new Set(TITLES.map((x) => x.id)).size, TITLES.length);
});

test('titleFor の tier は t01 が 0、t13 が 12 の連番で、表の順と一致する', () => {
  const tiers = TITLES.map((x) => titleFor(x.level).tier);
  assert.deepEqual(tiers, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  TITLES.forEach((x, i) => assert.equal(titleFor(x.level).id, x.id, `${i}`));
});

// 受け入れ条件 1
test('Lv0 はまだ称号がない (null)', () => {
  assert.equal(titleFor(0), null);
});

test('Lv1 は t01 (tier 0)', () => {
  assert.deepEqual(titleFor(1), { id: 't01', level: 1, tier: 0 });
});

test('Lv3 は t02、Lv4 は t03 (境目の前後)', () => {
  assert.equal(titleFor(3).id, 't02');
  assert.deepEqual(titleFor(4), { id: 't03', level: 4, tier: 2 });
});

test('Lv67 は t12、Lv68 は t13 (最高位の境目)', () => {
  assert.equal(titleFor(67).id, 't12');
  assert.deepEqual(titleFor(68), { id: 't13', level: 68, tier: 12 });
});

test('Lv100 は t13 のまま', () => {
  assert.equal(titleFor(100).id, 't13');
  assert.equal(titleFor(100).tier, 12);
});

test('すべての段階で、必要なレベルちょうどと 1 つ手前の称号が正しい', () => {
  TITLES.forEach((x, i) => {
    assert.equal(titleFor(x.level).id, x.id);
    const before = titleFor(x.level - 1);
    if (i === 0) assert.equal(before, null);
    else assert.equal(before.id, TITLES[i - 1].id);
  });
});

// 受け入れ条件 2
test('nextTitle: Lv0 の次は t01 で、あと 1 レベル', () => {
  assert.deepEqual(nextTitle(0), { id: 't01', level: 1, tier: 0, remaining: 1 });
});

test('nextTitle: Lv1 の次は t02 (remaining 1)、Lv3 の次は t03 (remaining 1)', () => {
  assert.deepEqual(nextTitle(1), { id: 't02', level: 2, tier: 1, remaining: 1 });
  assert.deepEqual(nextTitle(3), { id: 't03', level: 4, tier: 2, remaining: 1 });
});

test('nextTitle: 称号の境目ちょうどでは、その次の称号を指す', () => {
  assert.deepEqual(nextTitle(4), { id: 't04', level: 6, tier: 3, remaining: 2 });
});

test('nextTitle: Lv67 の次は t13 (remaining 1)', () => {
  assert.deepEqual(nextTitle(67), { id: 't13', level: 68, tier: 12, remaining: 1 });
});

test('nextTitle: 最高位 (Lv68 以上) では null', () => {
  assert.equal(nextTitle(68), null);
  assert.equal(nextTitle(100), null);
});

test('nextTitle: remaining は 次の称号の level - 今のレベル で、常に 1 以上', () => {
  for (let lv = 0; lv < 68; lv++) {
    const n = nextTitle(lv);
    assert.equal(n.remaining, n.level - lv);
    assert.ok(n.remaining >= 1);
    const cur = titleFor(lv);
    assert.equal(n.tier, cur ? cur.tier + 1 : 0);
  }
});
