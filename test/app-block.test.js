import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockWindows, normalizePackageList, appBlockState } from '../src/app-block.js';

const NOW = 1000;

test('blockWindows: 作業→休憩→作業の並びは、作業の 2 つの時間帯になる。最初の区切りの始まりは now', () => {
  const segments = [
    { mode: 'work', endAt: 2000 },
    { mode: 'shortBreak', endAt: 3000 },
    { mode: 'work', endAt: 4000 },
  ];
  assert.deepEqual(blockWindows(segments, NOW), [{ from: 1000, to: 2000 }, { from: 3000, to: 4000 }]);
});

test('blockWindows: 休憩 (短い・長い) は時間帯にならない', () => {
  const segments = [
    { mode: 'shortBreak', endAt: 2000 },
    { mode: 'longBreak', endAt: 3000 },
  ];
  assert.deepEqual(blockWindows(segments, NOW), []);
});

test('blockWindows: 休憩から始まるなら、作業の始まりは前の区切りの endAt', () => {
  const segments = [
    { mode: 'shortBreak', endAt: 1500 },
    { mode: 'work', endAt: 2500 },
  ];
  assert.deepEqual(blockWindows(segments, NOW), [{ from: 1500, to: 2500 }]);
});

test('blockWindows: 続いている作業の区切りは 1 つにまとめる', () => {
  const segments = [
    { mode: 'work', endAt: 2000 },
    { mode: 'work', endAt: 3000 },
    { mode: 'longBreak', endAt: 4000 },
    { mode: 'work', endAt: 5000 },
  ];
  assert.deepEqual(blockWindows(segments, NOW), [{ from: 1000, to: 3000 }, { from: 4000, to: 5000 }]);
});

test('blockWindows: ラウンドの区切り (phase) も同じように扱う', () => {
  const segments = [
    { round: 1, phase: 'work', koma: 1, endAt: 2000 },
    { round: 1, phase: 'break', koma: 1, endAt: 2500 },
    { round: 1, phase: 'work', koma: 2, endAt: 3500 },
    { round: 1, phase: 'work', koma: 3, endAt: 4500 },
  ];
  assert.deepEqual(blockWindows(segments, NOW), [{ from: 1000, to: 2000 }, { from: 2500, to: 4500 }]);
});

test('blockWindows: to <= now の時間帯は入れない (ちょうど now も入れない)', () => {
  assert.deepEqual(blockWindows([{ mode: 'work', endAt: 500 }], NOW), []);
  assert.deepEqual(blockWindows([{ mode: 'work', endAt: NOW }], NOW), []);
  const segments = [
    { mode: 'work', endAt: 500 },
    { mode: 'shortBreak', endAt: 1500 },
    { mode: 'work', endAt: 2500 },
  ];
  assert.deepEqual(blockWindows(segments, NOW), [{ from: 1500, to: 2500 }]);
});

test('blockWindows: 最初の時間帯の from は now より前にならない (now にそろえる)', () => {
  const segments = [
    { mode: 'shortBreak', endAt: 500 },
    { mode: 'work', endAt: 2000 },
  ];
  assert.deepEqual(blockWindows(segments, NOW), [{ from: 1000, to: 2000 }]);
});

test('blockWindows: 区切りがない・作業がないなら空', () => {
  assert.deepEqual(blockWindows([], NOW), []);
  assert.deepEqual(blockWindows([{ mode: 'shortBreak', endAt: 2000 }], NOW), []);
  assert.deepEqual(blockWindows([{ round: 1, phase: 'break', koma: 1, endAt: 2000 }], NOW), []);
});

test('normalizePackageList: 重なりを除き、並べ替える', () => {
  assert.deepEqual(
    normalizePackageList(['com.example.mail', 'com.example.game', 'com.example.mail', 'app.b']),
    ['app.b', 'com.example.game', 'com.example.mail'],
  );
  assert.deepEqual(normalizePackageList([]), []);
});

test('normalizePackageList: 文字列でないもの・空の文字列は捨てる', () => {
  assert.deepEqual(normalizePackageList([1, null, undefined, {}, [], true, '', 'com.example.game']), ['com.example.game']);
});

test('normalizePackageList: パッケージ名の形でないものは捨てる', () => {
  const bad = ['abc', 'a..b', 'a.b-c', ' a.b', 'a.b ', '.a.b', 'a.b.', 'a b.c', 'a.b/c'];
  assert.deepEqual(normalizePackageList(bad), []);
  // 英数字と _ を . で区切った形は残る
  assert.deepEqual(normalizePackageList(['a.b', 'Com.Example_1.game2']), ['Com.Example_1.game2', 'a.b']);
});

test('normalizePackageList: 最大 200 個。超えた分は捨てる', () => {
  const many = Array.from({ length: 250 }, (_, i) => `com.example.app${String(i).padStart(3, '0')}`);
  const result = normalizePackageList(many);
  assert.equal(result.length, 200);
  assert.ok(result.every((name) => many.includes(name)));
  assert.equal(new Set(result).size, 200);
});

test('normalizePackageList: 配列でない入力は空', () => {
  assert.deepEqual(normalizePackageList(undefined), []);
  assert.deepEqual(normalizePackageList('com.example.game'), []);
});

const ready = { isMobileApp: true, enabled: true, usageAccess: true, overlay: true };

test('appBlockState: 4 つの結果。権限がそろっていれば ready (アプリの一覧は判定に使わない)', () => {
  assert.equal(appBlockState({ ...ready, isMobileApp: false }), 'hidden');
  assert.equal(appBlockState({ ...ready, enabled: false }), 'off');
  assert.equal(appBlockState({ ...ready, usageAccess: false }), 'needsPermission');
  assert.equal(appBlockState({ ...ready, overlay: false }), 'needsPermission');
  assert.equal(appBlockState(ready), 'ready');
});

test('appBlockState: apps / allow の数によらず ready になり、noApps は返らない', () => {
  for (const extra of [{}, { apps: [] }, { allow: [] }, { allow: ['com.example.game'] }, { apps: ['com.example.game', 'com.example.mail'] }]) {
    assert.equal(appBlockState({ ...ready, ...extra }), 'ready');
  }
  const states = new Set();
  for (const isMobileApp of [true, false]) for (const enabled of [true, false]) for (const usageAccess of [true, false]) for (const overlay of [true, false]) {
    states.add(appBlockState({ isMobileApp, enabled, usageAccess, overlay }));
  }
  assert.deepEqual([...states].sort(), ['hidden', 'needsPermission', 'off', 'ready']);
});

test('appBlockState: 優先順は hidden → off → needsPermission → ready', () => {
  const none = { isMobileApp: false, enabled: false, usageAccess: false, overlay: false };
  assert.equal(appBlockState(none), 'hidden');
  assert.equal(appBlockState({ ...none, isMobileApp: true }), 'off');
  assert.equal(appBlockState({ ...none, isMobileApp: true, enabled: true }), 'needsPermission');
  assert.equal(appBlockState({ ...none, isMobileApp: true, enabled: true, usageAccess: true }), 'needsPermission');
  assert.equal(appBlockState({ ...none, isMobileApp: true, enabled: true, usageAccess: true, overlay: true }), 'ready');
});
