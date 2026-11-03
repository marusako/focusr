import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backAction } from '../src/back-action.js';

test('戻る (Esc・Android の「戻る」・何もないところのクリック): 設定パネル → 小窓 の順に閉じる', () => {
  assert.equal(backAction({ settingsOpen: true, popupOpen: true }), 'closeSettings', '設定パネルが手前にある');
  assert.equal(backAction({ settingsOpen: true, popupOpen: false }), 'closeSettings');
  assert.equal(backAction({ settingsOpen: false, popupOpen: true }), 'closePopup');
});

test('戻る: メイン画面では何もしない', () => {
  assert.equal(backAction({ settingsOpen: false, popupOpen: false }), null);
  assert.equal(backAction({ settingsOpen: false }), null, '小窓の指定がなければ閉じていることにする');
});
