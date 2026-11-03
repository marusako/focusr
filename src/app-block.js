// スマホ版の「作業中のアプリの制限」の決まり (画面にも Capacitor にも依存しない純粋な関数)。
// 作業のタイマーが動いている間の時間帯と、制限しないアプリの一覧を Android に渡し、Android が選んだアプリ以外を開けなくする
// (mobile/AppBlock.java・mobile/AppBlockService.java。src/renderer.js の syncAppBlock)

// 制限しないアプリの最大の数
const MAX_APPS = 200;

// Android のパッケージ名の形 (英数字と _ を . で区切る。区切りは 1 つ以上)
const PACKAGE_NAME = /^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)+$/;

// segments ({ mode, endAt } か { round, phase, koma, endAt } の並び。時刻の順) から、作業の時間帯 ([{ from, to }]) を作る。
// - 区切りの始まりは、1 つ前の区切りの endAt (最初の区切りは now)
// - 続いている作業の区切りは 1 つにまとめる。to <= now の時間帯は入れない
export function blockWindows(segments, now) {
  const windows = [];
  let from = now;
  for (const segment of segments) {
    const to = segment.endAt;
    const isWork = segment.mode === 'work' || segment.phase === 'work';
    if (isWork && to > now) {
      const last = windows[windows.length - 1];
      if (last && last.to === from) last.to = to;
      else windows.push({ from: Math.max(from, now), to });
    }
    from = to;
  }
  return windows;
}

// パッケージ名の一覧 (制限しないアプリ) を整える。パッケージ名の形のものだけを、重ならないように並べ、最大 200 個にする
export function normalizePackageList(list) {
  if (!Array.isArray(list)) return [];
  const names = list.filter((name) => typeof name === 'string' && PACKAGE_NAME.test(name));
  return [...new Set(names)].sort().slice(0, MAX_APPS);
}

// 設定の「作業中のアプリの制限」の欄の様子
// - hidden: 出さない (スマホ版以外)
// - off: オフ
// - needsPermission: オンだが、Android の許可 (使用状況へのアクセス・ほかのアプリの上に重ねて表示) が足りない
// - ready: 動く
export function appBlockState({ isMobileApp, enabled, usageAccess, overlay }) {
  if (!isMobileApp) return 'hidden';
  if (!enabled) return 'off';
  if (!usageAccess || !overlay) return 'needsPermission';
  return 'ready';
}
