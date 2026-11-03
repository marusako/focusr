// スマホ版 (Capacitor) の更新のお知らせの決まりごと (画面 (DOM) に依存しない純粋な関数)。
// APK は、GitHub Release に focusr-<版>.apk として置く (.github/workflows/android-build.yml)。
// スマホ版は起動したときに最新の Release を見て、今より新しい版の APK があれば知らせる。
// アプリの中で APK をダウンロードして Android のインストールの仕組みに渡す (mobile/AppUpdate.java)。
// 使えないとき・失敗したときは、ブラウザーで Release のページを開いて、利用者に入れてもらう
const VERSION = /^v?(\d+)\.(\d+)\.(\d+)$/;
// 2026-11-03 に、リポジトリの名前とアプリの識別子も focusr にそろえた。識別子が変わったので、このコードのアプリは
// 以前の名前 (kugiri-timer) の Release を見ることがなく、以前の名前は受け付けない
const APK_NAME = /^focusr-(\d+\.\d+\.\d+)\.apk$/;
const REPOSITORY = 'https://github.com/marusako/focusr';
const fromRepository = (url, kind) => url.startsWith(`${REPOSITORY}/releases/${kind}/`);

function parseVersion(text) {
  const match = VERSION.exec(String(text ?? '').trim());
  return match ? match.slice(1).map(Number) : null;
}

// a が b より新しい版か (数字ごとに比べる)。形がおかしければ false
export function isNewerVersion(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) {
    if (x[i] !== y[i]) return x[i] > y[i];
  }
  return false;
}

// Android の更新の番号 (versionCode)。新しい版ほど大きくなるように、1.2.3 → 210203 にする。
// Android は、番号が小さいアプリを上から入れられない。版の番号を付け直したときに、付け直す前に入れたアプリの上から入れられるよう、
// 土台の数を足している: 2026-10-12 (2.16.0 → 2.6.0) に 100000、2026-11-03 (2.9.1 → 0.x。2.9.1 = 120901) に 200000 にした (0.2.0 = 200200)。
// 小さい 2 つの桁が 100 以上だと順番が崩れるので止める
const VERSION_CODE_BASE = 200000;
export function versionCode(version) {
  const parts = parseVersion(version);
  if (!parts || parts[1] >= 100 || parts[2] >= 100) throw new Error(`versionCode にできない版: ${version}`);
  return VERSION_CODE_BASE + parts[0] * 10000 + parts[1] * 100 + parts[2];
}

// 開発版 APK (識別子が .dev で終わる。scripts/android-variant.mjs) か。開発版は更新のお知らせを出さない
export function isDevAppId(appId) {
  return typeof appId === 'string' && appId.endsWith('.dev');
}

// GitHub の最新の Release (API の答え) に、今より新しい版の APK があれば { version, page: Release のページの URL, apk: APK の URL }。なければ null。
// apk は、アプリの中でダウンロードするときに使う。ダウンロードに失敗したときは、page をブラウザーで開く。
// APK を直接ブラウザーで開くと、アプリから開いた簡易版のブラウザー (Custom Tab) で、ダウンロードの表示が終わっても変わらなかったので、
// Release のページを開いて、そこで APK を押してもらう
export function apkUpdate(release, currentVersion) {
  if (!release || release.draft || release.prerelease || !Array.isArray(release.assets)) return null;
  // URL は、このリポジトリの Release のものだけ受け付ける (ほかの場所に飛ばない)
  const page = String(release.html_url ?? '');
  if (!fromRepository(page, 'tag')) return null;
  for (const asset of release.assets) {
    const match = APK_NAME.exec(String(asset?.name ?? ''));
    const url = String(asset?.browser_download_url ?? '');
    if (match && fromRepository(url, 'download') && isNewerVersion(match[1], currentVersion)) return { version: match[1], page, apk: url };
  }
  return null;
}
