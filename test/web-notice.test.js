import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webNoticeState } from '../src/web-notice.js';

const web = (permission) => webNoticeState({ isMobileApp: false, hasNotification: true, permission });

test('Android 版 (isMobileApp) では、許可の状態によらず hidden', () => {
  for (const permission of ['default', 'granted', 'denied', 'unknown', undefined]) {
    assert.equal(webNoticeState({ isMobileApp: true, hasNotification: true, permission }), 'hidden');
  }
});

test('ブラウザーに Notification がないときは、許可の状態によらず hidden', () => {
  for (const permission of ['default', 'granted', 'denied', 'unknown', undefined]) {
    assert.equal(webNoticeState({ isMobileApp: false, hasNotification: false, permission }), 'hidden');
  }
});

test('Android 版で、かつ Notification もないときも hidden', () => {
  assert.equal(webNoticeState({ isMobileApp: true, hasNotification: false, permission: 'granted' }), 'hidden');
});

test('Web 版で、まだ決めていない (default) なら ask', () => {
  assert.equal(web('default'), 'ask');
});

test('Web 版で、許可済み (granted) なら on', () => {
  assert.equal(web('granted'), 'on');
});

test('Web 版で、拒否 (denied) なら blocked', () => {
  assert.equal(web('denied'), 'blocked');
});

test('Web 版で、知らない値・undefined・null・空文字は ask', () => {
  assert.equal(web('something-new'), 'ask');
  assert.equal(web(undefined), 'ask');
  assert.equal(web(null), 'ask');
  assert.equal(web(''), 'ask');
});

test('permission は大文字小文字を区別する (Granted は granted ではない)', () => {
  assert.equal(web('Granted'), 'ask');
  assert.equal(web('DENIED'), 'ask');
});
