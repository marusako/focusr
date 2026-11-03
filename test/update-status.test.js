import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INITIAL_UPDATE_STATE, nextUpdateState, isBannerVisible } from '../src/update-status.js';

const run = (...events) => events.reduce(nextUpdateState, INITIAL_UPDATE_STATE);

test('最初はバナーを出さない', () => {
  assert.equal(isBannerVisible(INITIAL_UPDATE_STATE), false);
});

test('新しい版が見つかったら、バージョン付きで案内する', () => {
  const s = run({ type: 'available', version: '1.2.0' });
  assert.equal(s.phase, 'available');
  assert.equal(s.version, '1.2.0');
  assert.equal(isBannerVisible(s), true);
});

test('「更新する」「あとで」で閉じる (dismiss)', () => {
  const s = run({ type: 'available', version: '1.2.0' }, { type: 'dismiss' });
  assert.equal(isBannerVisible(s), false);
});

test('知らないイベントでは変わらない', () => {
  const s = run({ type: 'available', version: '1.2.0' });
  assert.equal(nextUpdateState(s, { type: 'progress', percent: 50 }), s);
});
