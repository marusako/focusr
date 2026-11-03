import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FIRST_LEVEL_XP, LEVEL_STEP_XP, MS_PER_XP, createXp, addXpMs, totalXp, xpToReach, levelInfo, parseXp } from '../src/level.js';
import { MAX_STEP_MS } from '../src/focus-log.js';

const MIN = 60000;

// 受け入れ条件 1
test('定数: 最初のレベルは 100xp、そのあと 50xp ずつ増える、1xp は 1 分', () => {
  assert.equal(FIRST_LEVEL_XP, 100);
  assert.equal(LEVEL_STEP_XP, 50);
  assert.equal(MS_PER_XP, MIN);
});

test('作った直後は 0 ミリ秒、0xp、Lv0', () => {
  const xp = createXp();
  assert.deepEqual(xp, { ms: 0 });
  assert.equal(totalXp(xp), 0);
  assert.equal(levelInfo(xp).level, 0);
});

test('1 分 = 1xp。1 分に満たない端数は切り捨てる', () => {
  assert.equal(totalXp({ ms: MIN }), 1);
  assert.equal(totalXp({ ms: MIN - 1 }), 0);
  assert.equal(totalXp({ ms: 90 * MIN + 59999 }), 90);
});

test('累計の xp からレベルが決まる (境目の前後)', () => {
  const at = (x) => levelInfo({ ms: x * MIN });
  assert.equal(at(99).level, 0);
  assert.equal(at(100).level, 1);
  assert.equal(at(249).level, 1);
  assert.equal(at(250).level, 2);
  assert.equal(at(449).level, 2);
  assert.equal(at(450).level, 3);
});

// 受け入れ条件 2
test('Lv n に着くのに要る累計の xp', () => {
  assert.equal(xpToReach(0), 0);
  assert.equal(xpToReach(1), 100);
  assert.equal(xpToReach(2), 250);
  assert.equal(xpToReach(3), 450);
  assert.equal(xpToReach(10), 3250);
  assert.equal(xpToReach(30), 24750);
});

test('Lv n → n+1 に必要な xp は 100 + 50n', () => {
  for (let n = 0; n <= 40; n++) {
    assert.equal(xpToReach(n + 1) - xpToReach(n), 100 + 50 * n);
  }
});

test('levelInfo: 今のレベルの中での進み具合', () => {
  const info = levelInfo({ ms: 175 * MIN + 1234 });
  assert.equal(info.level, 1);
  assert.equal(info.xp, 175);
  assert.equal(info.into, 75);
  assert.equal(info.span, 150);
  assert.equal(info.ratio, 0.5);

  const zero = levelInfo(createXp());
  assert.deepEqual(zero, { level: 0, xp: 0, into: 0, span: 100, ratio: 0 });

  const edge = levelInfo({ ms: 99 * MIN });
  assert.equal(edge.level, 0);
  assert.equal(edge.into, 99);
  assert.equal(edge.span, 100);
  assert.ok(edge.ratio >= 0 && edge.ratio < 1);

  const lv = levelInfo({ ms: xpToReach(10) * MIN });
  assert.equal(lv.level, 10);
  assert.equal(lv.into, 0);
  assert.equal(lv.span, 600);
  assert.equal(lv.ratio, 0);
});

// 受け入れ条件 3
test('作業の時間を足せる。元の値は書き換えない', () => {
  const xp = createXp();
  const next = addXpMs(xp, MAX_STEP_MS);
  assert.deepEqual(next, { ms: MAX_STEP_MS });
  assert.deepEqual(xp, { ms: 0 });
  assert.deepEqual(addXpMs(next, 1000), { ms: MAX_STEP_MS + 1000 });
});

test('1 回に足せるのは MAX_STEP_MS まで', () => {
  assert.deepEqual(addXpMs(createXp(), MAX_STEP_MS * 10), { ms: MAX_STEP_MS });
  assert.deepEqual(addXpMs({ ms: 1000 }, MAX_STEP_MS + 1), { ms: 1000 + MAX_STEP_MS });
  assert.deepEqual(addXpMs(createXp(), MAX_STEP_MS), { ms: MAX_STEP_MS });
});

test('0 以下・数値でない時間は何もしない (元の値をそのまま返す)', () => {
  const xp = { ms: 5000 };
  assert.equal(addXpMs(xp, 0), xp);
  assert.equal(addXpMs(xp, -100), xp);
  assert.equal(addXpMs(xp, NaN), xp);
  assert.equal(addXpMs(xp, '1000'), xp);
  assert.equal(addXpMs(xp, undefined), xp);
  assert.equal(addXpMs(xp, null), xp);
});

// 受け入れ条件 4
test('1 分に満たない端数は持ち越す。1 秒を 30 回で 0xp、さらに 30 回で 1xp', () => {
  let xp = createXp();
  for (let i = 0; i < 30; i++) xp = addXpMs(xp, 1000);
  assert.equal(xp.ms, 30000);
  assert.equal(totalXp(xp), 0);
  for (let i = 0; i < 30; i++) xp = addXpMs(xp, 1000);
  assert.equal(totalXp(xp), 1);
  assert.equal(xp.ms, MIN);
});

// 受け入れ条件 5
test('保存データを読む: 正しい値はそのまま', () => {
  assert.deepEqual(parseXp({ ms: 123456 }), { ms: 123456 });
  assert.deepEqual(parseXp({ ms: 0 }), { ms: 0 });
});

test('保存データが壊れていても 0 として読む', () => {
  const bad = [null, undefined, 5, 'x', [], [1], {}, { ms: 'abc' }, { ms: '100' }, { ms: null }, { ms: NaN }, { ms: -1 }, { ms: Infinity }, { ms: -Infinity }];
  for (const raw of bad) {
    assert.deepEqual(parseXp(raw), { ms: 0 }, `raw=${JSON.stringify(raw)}`);
  }
});
