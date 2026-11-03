// レベル制度。作業の時間 (1 分 = 1xp) からレベルを決める。画面 (DOM) に依存しない純粋な関数だけを置く。
// 形: { ms: 累計の作業時間 (ミリ秒) }。1 分に満たない端数を捨てずに持ち越すため、xp ではなくミリ秒で持つ
import { MAX_STEP_MS } from './focus-log.js';

export const FIRST_LEVEL_XP = 100; // Lv0 → Lv1 に要る xp
export const LEVEL_STEP_XP = 50; // 1 つ上がるごとに、次に要る xp が増える量
export const MS_PER_XP = 60000;

export function createXp() {
  return { ms: 0 };
}

// 作業の時間を足した新しい値を返す (元は書き換えない)。1 回に足せるのは MAX_STEP_MS まで。0 以下・数値でないときは元の値のまま
export function addXpMs(xp, ms) {
  if (typeof ms !== 'number' || !(ms > 0)) return xp;
  return { ms: xp.ms + Math.min(ms, MAX_STEP_MS) };
}

// 累計の xp (1 分に満たない端数は切り捨て)
export function totalXp(xp) {
  return Math.floor(xp.ms / MS_PER_XP);
}

// Lv level に着くのに要る累計の xp。Lv n → n+1 に要るのは FIRST_LEVEL_XP + LEVEL_STEP_XP * n
export function xpToReach(level) {
  return FIRST_LEVEL_XP * level + (LEVEL_STEP_XP * level * (level - 1)) / 2;
}

// 今のレベルと、次のレベルまでの進み具合
export function levelInfo(xp) {
  const total = totalXp(xp);
  let level = 0;
  while (xpToReach(level + 1) <= total) level++;
  const into = total - xpToReach(level);
  const span = xpToReach(level + 1) - xpToReach(level);
  return { level, xp: total, into, span, ratio: into / span };
}

// 保存データから読んだ値を確かめる。形が違う・ms が有限の 0 以上の数でないときは 0 から始める
export function parseXp(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return createXp();
  const { ms } = raw;
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0 ? { ms } : createXp();
}
