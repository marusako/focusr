import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStopwatch, startStopwatch, pauseStopwatch, resetStopwatch, elapsedMs, stopwatchRatio, formatStopwatch, stopwatchFocusMs } from '../src/stopwatch.js';

test('作った直後は 0 で止まっている', () => {
  const sw = createStopwatch();
  assert.equal(sw.running, false);
  assert.equal(elapsedMs(sw, 1000), 0);
});

test('スタートしてから now までが経過時間になる', () => {
  const sw = startStopwatch(createStopwatch(), 1000);
  assert.equal(sw.running, true);
  assert.equal(elapsedMs(sw, 1000), 0);
  assert.equal(elapsedMs(sw, 6500), 5500);
});

test('一時停止すると経過時間が止まり、再開すると続きから数える', () => {
  let sw = startStopwatch(createStopwatch(), 0);
  sw = pauseStopwatch(sw, 4000);
  assert.equal(sw.running, false);
  assert.equal(elapsedMs(sw, 99999), 4000, '止めている間は増えない');
  sw = startStopwatch(sw, 10000);
  assert.equal(elapsedMs(sw, 13000), 7000, '4 秒 + 再開後の 3 秒');
});

test('動いているときのスタート、止まっているときの一時停止は何も変えない', () => {
  const running = startStopwatch(createStopwatch(), 0);
  assert.equal(startStopwatch(running, 5000), running);
  const stopped = createStopwatch();
  assert.equal(pauseStopwatch(stopped, 5000), stopped);
});

test('リセットすると 0 で止まる (動いていても)', () => {
  const sw = resetStopwatch(startStopwatch(createStopwatch(), 0));
  assert.equal(sw.running, false);
  assert.equal(elapsedMs(sw, 50000), 0);
});

test('時計が戻っても経過時間はマイナスにならない', () => {
  const sw = startStopwatch(createStopwatch(), 5000);
  assert.equal(elapsedMs(sw, 1000), 0);
});

test('表示: 1 時間未満は MM:SS、1 時間からは H:MM:SS (秒は切り捨て)', () => {
  assert.equal(formatStopwatch(0), '00:00');
  assert.equal(formatStopwatch(999), '00:00');
  assert.equal(formatStopwatch(61000), '01:01');
  assert.equal(formatStopwatch(59 * 60000 + 59999), '59:59');
  assert.equal(formatStopwatch(3600000), '1:00:00');
  assert.equal(formatStopwatch(3600000 * 12 + 5 * 60000 + 7000), '12:05:07');
});

test('円の進み: 1 分で一周する (0〜1)', () => {
  assert.equal(stopwatchRatio(0), 0);
  assert.equal(stopwatchRatio(30000), 0.5);
  assert.equal(stopwatchRatio(60000), 0);
  assert.equal(stopwatchRatio(90000), 0.5);
});

test('集中の記録に足す時間: 動いている間だけ、前に数えた時刻から now まで', () => {
  const running = startStopwatch(createStopwatch(), 1000);
  assert.equal(stopwatchFocusMs(running, 1500, 2500), 1000);
  assert.equal(stopwatchFocusMs(running, 500, 2500), 1500, 'スタートより前は数えない');
  assert.equal(stopwatchFocusMs(createStopwatch(), 0, 5000), 0, '止まっている間は数えない');
  assert.equal(stopwatchFocusMs(running, 3000, 2000), 0, '時計が戻ったら 0');
});
