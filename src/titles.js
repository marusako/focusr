// 称号。レベルから決まる 13 段階の呼び名。保存するものはなく、今のレベルからいつでも計算できる。
// 画面 (DOM) にも Electron にも依存しない純粋な関数だけを置く。名前は翻訳の項目 title.<id> にある
export const TITLES = Object.freeze([
  { id: 't01', level: 1 },
  { id: 't02', level: 2 },
  { id: 't03', level: 4 },
  { id: 't04', level: 6 },
  { id: 't05', level: 9 },
  { id: 't06', level: 11 },
  { id: 't07', level: 15 },
  { id: 't08', level: 26 },
  { id: 't09', level: 34 },
  { id: 't10', level: 41 },
  { id: 't11', level: 48 },
  { id: 't12', level: 59 },
  { id: 't13', level: 68 },
]);

// 今の称号 { id, level, tier } (tier は 0 から数えた段階の番号)。まだ届いていないとき (Lv0) は null
export function titleFor(level) {
  let tier = -1;
  while (tier + 1 < TITLES.length && TITLES[tier + 1].level <= level) tier++;
  if (tier < 0) return null;
  return { ...TITLES[tier], tier };
}

// 次の称号 { id, level, tier, remaining } (remaining は足りないレベル)。最高位に着いているときは null
export function nextTitle(level) {
  const tier = TITLES.findIndex((x) => x.level > level);
  if (tier < 0) return null;
  return { ...TITLES[tier], tier, remaining: TITLES[tier].level - level };
}
