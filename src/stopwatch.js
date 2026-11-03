// ストップウォッチの状態遷移ロジック。画面 (DOM) にも Electron にも依存しない純粋な関数だけを置く。
// タイマー (timer.js) と同じく、状態は書き換えずに新しいオブジェクトを返す。
// 形: { running: 動いているか, elapsedMs: 止めたときまでの経過時間, startedAt: 動いている間だけ使う、今の区間のスタート時刻 (ミリ秒のタイムスタンプ) }

export function createStopwatch() {
  return { running: false, elapsedMs: 0, startedAt: null };
}

export function startStopwatch(state, now) {
  if (state.running) return state;
  return { ...state, running: true, startedAt: now };
}

export function pauseStopwatch(state, now) {
  if (!state.running) return state;
  return { running: false, elapsedMs: elapsedMs(state, now), startedAt: null };
}

export function resetStopwatch() {
  return createStopwatch();
}

// 経過時間。「スタートした時刻との差」で数えるので、setInterval の遅れでズレない。時計が戻ってもマイナスにしない
export function elapsedMs(state, now) {
  if (!state.running) return state.elapsedMs;
  return state.elapsedMs + Math.max(0, now - state.startedAt);
}

// lastAt から now までに、集中の記録へ足す時間。動いている間だけ、今の区間のスタートより前は数えない
export function stopwatchFocusMs(state, lastAt, now) {
  if (!state.running) return 0;
  return Math.max(0, now - Math.max(lastAt, state.startedAt));
}

// 円の進み (0〜1)。1 分で一周する
export function stopwatchRatio(ms) {
  return (ms % 60000) / 60000;
}

// 1 時間未満は MM:SS、1 時間からは H:MM:SS。秒は切り捨て (タイマーの切り上げと違い、数え上げなので経過した分だけ見せる)
export function formatStopwatch(ms) {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return hours > 0 ? `${hours}:${minutes}:${seconds}` : `${minutes}:${seconds}`;
}
