import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_UPDATE_STATE, nextUpdateState, isBannerVisible, updateBannerView } from '../src/update-status.js';

const run = (...events) => events.reduce(nextUpdateState, INITIAL_UPDATE_STATE);
const available = { type: 'available', version: '1.2.0' };

test('最初の状態は idle で、phase・version・progress を持つ。バナーは出さない', () => {
  assert.equal(INITIAL_UPDATE_STATE.phase, 'idle');
  assert.ok('version' in INITIAL_UPDATE_STATE, 'version がある');
  assert.ok('progress' in INITIAL_UPDATE_STATE, 'progress がある');
  assert.equal(isBannerVisible(INITIAL_UPDATE_STATE), false);
});

test('新しい版が見つかったら、バージョン付きで案内する', () => {
  const s = run(available);
  assert.equal(s.phase, 'available');
  assert.equal(s.version, '1.2.0');
  assert.equal(isBannerVisible(s), true);
});

test('「あとで」で閉じる (dismiss) と hidden になり、バナーは消える', () => {
  const s = run(available, { type: 'dismiss' });
  assert.equal(s.phase, 'hidden');
  assert.equal(isBannerVisible(s), false);
});

test('許可がないとき (needsPermission) は needsPermission になる', () => {
  const s = run(available, { type: 'needsPermission' });
  assert.equal(s.phase, 'needsPermission');
  assert.equal(s.version, '1.2.0', '版は残る');
});

test('ダウンロードを始める (download) と downloading で progress は 0', () => {
  const s = run(available, { type: 'download' });
  assert.equal(s.phase, 'downloading');
  assert.equal(s.progress, 0);
  assert.equal(s.version, '1.2.0');
});

test('progress: downloading のとき、進み具合を更新する', () => {
  const s = run(available, { type: 'download' }, { type: 'progress', progress: 0.4 });
  assert.equal(s.phase, 'downloading');
  assert.equal(s.progress, 0.4);
});

test('progress: 0〜1 に収める', () => {
  const over = run(available, { type: 'download' }, { type: 'progress', progress: 1.7 });
  assert.equal(over.progress, 1, '1 より大きければ 1');
  const under = run(available, { type: 'download' }, { type: 'progress', progress: -0.5 });
  assert.equal(under.progress, 0, '0 より小さければ 0');
});

test('progress: 減らさない (遅れて届いた小さい値は無視する)', () => {
  const s = run(available, { type: 'download' }, { type: 'progress', progress: 0.6 }, { type: 'progress', progress: 0.3 });
  assert.equal(s.progress, 0.6);
});

test('progress: downloading 以外のときは何も変えない', () => {
  for (const before of [run(), run(available), run(available, { type: 'needsPermission' }), run(available, { type: 'download' }, { type: 'install' }), run(available, { type: 'fail' }), run(available, { type: 'dismiss' })]) {
    const after = nextUpdateState(before, { type: 'progress', progress: 0.5 });
    assert.deepEqual(after, before, `${before.phase} のときは変わらない`);
  }
});

test('install で installing、fail で failed になる', () => {
  const installing = run(available, { type: 'download' }, { type: 'install' });
  assert.equal(installing.phase, 'installing');
  const failed = run(available, { type: 'download' }, { type: 'fail' });
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.version, '1.2.0', '失敗しても版は残る (もう一度のため)');
  assert.equal(isBannerVisible(failed), true);
});

test('retry: failed と needsPermission のときだけ available に戻す', () => {
  const fromFailed = run(available, { type: 'fail' }, { type: 'retry' });
  assert.equal(fromFailed.phase, 'available');
  assert.equal(fromFailed.version, '1.2.0');
  const fromPermission = run(available, { type: 'needsPermission' }, { type: 'retry' });
  assert.equal(fromPermission.phase, 'available');
  assert.equal(fromPermission.version, '1.2.0');
  for (const before of [run(), run(available), run(available, { type: 'download' }), run(available, { type: 'download' }, { type: 'install' }), run(available, { type: 'dismiss' })]) {
    assert.deepEqual(nextUpdateState(before, { type: 'retry' }), before, `${before.phase} のときは変わらない`);
  }
});

test('知らない出来事では変わらない', () => {
  const s = run(available);
  assert.equal(nextUpdateState(s, { type: 'unknown-event' }), s);
});

test('状態を直接書き換えない (前の状態はそのまま)', () => {
  const before = run(available);
  const snapshot = { ...before };
  nextUpdateState(before, { type: 'download' });
  assert.deepEqual(before, snapshot);
});

test('isBannerVisible: available・needsPermission・downloading・installing・failed のとき true、idle・hidden は false', () => {
  assert.equal(isBannerVisible(run(available)), true);
  assert.equal(isBannerVisible(run(available, { type: 'needsPermission' })), true);
  assert.equal(isBannerVisible(run(available, { type: 'download' })), true);
  assert.equal(isBannerVisible(run(available, { type: 'download' }, { type: 'install' })), true);
  assert.equal(isBannerVisible(run(available, { type: 'fail' })), true);
  assert.equal(isBannerVisible(run()), false);
  assert.equal(isBannerVisible(run(available, { type: 'dismiss' })), false);
});

test('updateBannerView: available', () => {
  const v = updateBannerView(run(available));
  assert.equal(v.text, 'updateAvailable');
  assert.deepEqual(v.actions, ['update', 'later']);
});

test('updateBannerView: needsPermission', () => {
  const v = updateBannerView(run(available, { type: 'needsPermission' }));
  assert.equal(v.text, 'updateNeedsPermission');
  assert.deepEqual(v.actions, ['allow', 'later']);
});

test('updateBannerView: downloading は percent (0〜100 の整数) を持ち、ボタンはない', () => {
  const at = (p) => updateBannerView(run(available, { type: 'download' }, { type: 'progress', progress: p }));
  const start = updateBannerView(run(available, { type: 'download' }));
  assert.equal(start.text, 'updateDownloading');
  assert.equal(start.percent, 0);
  assert.deepEqual(start.actions, []);
  assert.equal(at(0.5).percent, 50);
  assert.equal(at(1).percent, 100);
  const odd = at(0.456).percent;
  assert.ok(Number.isInteger(odd), '整数');
  assert.ok(odd >= 45 && odd <= 46, `0.456 は 45 か 46 (実際: ${odd})`);
});

test('updateBannerView: installing', () => {
  const v = updateBannerView(run(available, { type: 'download' }, { type: 'install' }));
  assert.equal(v.text, 'updateInstalling');
  assert.deepEqual(v.actions, []);
});

test('updateBannerView: failed', () => {
  const v = updateBannerView(run(available, { type: 'fail' }));
  assert.equal(v.text, 'updateFailed');
  assert.deepEqual(v.actions, ['retry', 'browser', 'later']);
});

test('updateBannerView: downloading 以外では percent を出さない', () => {
  for (const s of [run(available), run(available, { type: 'needsPermission' }), run(available, { type: 'download' }, { type: 'install' }), run(available, { type: 'fail' })]) {
    assert.ok(updateBannerView(s).percent == null, `${s.phase} には percent がない`);
  }
});

test('updateBannerView: idle・hidden は null', () => {
  assert.equal(updateBannerView(run()), null);
  assert.equal(updateBannerView(run(available, { type: 'dismiss' })), null);
});
