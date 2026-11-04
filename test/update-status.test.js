import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_UPDATE_STATE, nextUpdateState, isBannerVisible, updateBannerView } from '../src/update-status.js';

const run = (...events) => events.reduce(nextUpdateState, INITIAL_UPDATE_STATE);
const available = { type: 'available', version: '1.2.0' };
const download = { type: 'download' };
const downloadingState = () => run(available, download);
const downloadedState = () => run(available, download, { type: 'downloaded' });
const failedState = () => run(available, { type: 'fail' });
const hiddenState = () => run(available, { type: 'dismiss' });
const everyState = () => [run(), run(available), downloadingState(), downloadedState(), failedState(), hiddenState()];

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
  const s = hiddenState();
  assert.equal(s.phase, 'hidden');
  assert.equal(isBannerVisible(s), false);
});

test('ダウンロードを始める (download) と downloading で progress は 0', () => {
  const s = downloadingState();
  assert.equal(s.phase, 'downloading');
  assert.equal(s.progress, 0);
  assert.equal(s.version, '1.2.0');
});

test('progress: downloading のとき、進み具合を更新する', () => {
  const s = run(available, download, { type: 'progress', progress: 0.4 });
  assert.equal(s.phase, 'downloading');
  assert.equal(s.progress, 0.4);
});

test('progress: 0〜1 に収める', () => {
  const over = run(available, download, { type: 'progress', progress: 1.7 });
  assert.equal(over.progress, 1, '1 より大きければ 1');
  const under = run(available, download, { type: 'progress', progress: -0.5 });
  assert.equal(under.progress, 0, '0 より小さければ 0');
});

test('progress: 減らさない (遅れて届いた小さい値は無視する)', () => {
  const s = run(available, download, { type: 'progress', progress: 0.6 }, { type: 'progress', progress: 0.3 });
  assert.equal(s.progress, 0.6);
});

test('progress: downloading 以外のときは何も変えない', () => {
  for (const before of [run(), run(available), downloadedState(), failedState(), hiddenState()]) {
    const after = nextUpdateState(before, { type: 'progress', progress: 0.5 });
    assert.deepEqual(after, before, `${before.phase} のときは変わらない`);
  }
});

test('downloaded: downloading のとき downloaded になり、版は残る', () => {
  const s = downloadedState();
  assert.equal(s.phase, 'downloaded');
  assert.equal(s.version, '1.2.0');
  assert.equal(isBannerVisible(s), true);
});

test('downloaded: downloading 以外のときは何も変えない', () => {
  for (const before of [run(), run(available), failedState(), hiddenState(), downloadedState()]) {
    assert.deepEqual(nextUpdateState(before, { type: 'downloaded' }), before, `${before.phase} のときは変わらない`);
  }
});

test('fail で failed になり、版は残る (もう一度のため)', () => {
  const failed = run(available, download, { type: 'fail' });
  assert.equal(failed.phase, 'failed');
  assert.equal(failed.version, '1.2.0');
  assert.equal(isBannerVisible(failed), true);
});

test('fail: 「あとで」で閉じた (hidden) あとは、失敗しても出さない (ダウンロード中に閉じられるため)', () => {
  const hidden = run(available, download, { type: 'dismiss' });
  assert.deepEqual(nextUpdateState(hidden, { type: 'fail' }), hidden);
});

test('retry: failed のときだけ available に戻す', () => {
  const fromFailed = run(available, { type: 'fail' }, { type: 'retry' });
  assert.equal(fromFailed.phase, 'available');
  assert.equal(fromFailed.version, '1.2.0');
  for (const before of [run(), run(available), downloadingState(), downloadedState(), hiddenState()]) {
    assert.deepEqual(nextUpdateState(before, { type: 'retry' }), before, `${before.phase} のときは変わらない`);
  }
});

test('前の形の出来事 needsPermission・install は何も変えない (状態をそのまま返す)', () => {
  for (const type of ['needsPermission', 'install']) {
    for (const before of everyState()) {
      assert.deepEqual(nextUpdateState(before, { type }), before, `${before.phase} に ${type} を渡しても変わらない`);
    }
  }
  const s = downloadingState();
  assert.equal(nextUpdateState(s, { type: 'install' }), s, '同じ状態を返す');
});

test('知らない出来事では変わらない', () => {
  const s = run(available);
  assert.equal(nextUpdateState(s, { type: 'unknown-event' }), s);
});

test('状態を直接書き換えない (前の状態はそのまま)', () => {
  const before = run(available);
  const snapshot = { ...before };
  nextUpdateState(before, download);
  assert.deepEqual(before, snapshot);
});

test('isBannerVisible: available・downloading・downloaded・failed のとき true、idle・hidden は false', () => {
  assert.equal(isBannerVisible(run(available)), true);
  assert.equal(isBannerVisible(downloadingState()), true);
  assert.equal(isBannerVisible(downloadedState()), true);
  assert.equal(isBannerVisible(failedState()), true);
  assert.equal(isBannerVisible(run()), false);
  assert.equal(isBannerVisible(hiddenState()), false);
});

test('updateBannerView: available', () => {
  const v = updateBannerView(run(available));
  assert.equal(v.text, 'updateAvailable');
  assert.deepEqual(v.actions, ['update', 'later']);
});

// 通信が切れると、Android のダウンロードは失敗にせず、通信が戻るのを待つ。止まって見えても閉じられるように「あとで」を出す
test('updateBannerView: downloading は percent (0〜100 の整数) と「あとで」を持つ', () => {
  const at = (p) => updateBannerView(run(available, download, { type: 'progress', progress: p }));
  const start = updateBannerView(downloadingState());
  assert.equal(start.text, 'updateDownloading');
  assert.equal(start.percent, 0);
  assert.deepEqual(start.actions, ['later']);
  assert.equal(at(0.5).percent, 50);
  assert.equal(at(1).percent, 100);
  const odd = at(0.456).percent;
  assert.ok(Number.isInteger(odd), '整数');
  assert.ok(odd >= 45 && odd <= 46, `0.456 は 45 か 46 (実際: ${odd})`);
});

test('updateBannerView: downloaded は「ダウンロードを開く」と「あとで」', () => {
  const v = updateBannerView(downloadedState());
  assert.equal(v.text, 'updateDownloaded');
  assert.deepEqual(v.actions, ['open', 'later']);
});

test('updateBannerView: failed', () => {
  const v = updateBannerView(failedState());
  assert.equal(v.text, 'updateFailed');
  assert.deepEqual(v.actions, ['retry', 'browser', 'later']);
});

test('updateBannerView: downloading 以外では percent を出さない', () => {
  for (const s of [run(available), downloadedState(), failedState()]) {
    assert.ok(updateBannerView(s).percent == null, `${s.phase} には percent がない`);
  }
});

test('updateBannerView: idle・hidden は null', () => {
  assert.equal(updateBannerView(run()), null);
  assert.equal(updateBannerView(hiddenState()), null);
});
