// Android の開発版 APK を作るための書き換え。完成版と並べて入れられるよう、識別子と名前を変える。
//   - applicationId の末尾に .dev を付ける (Android は別のアプリとして扱うので、データも別々になる)。namespace (Java のパッケージ名) は変えない
//   - 名前 (app_name・title_activity_main) を「Focusr (開発版)」にする
//
// 使い方 (GitHub Actions の android-build.yml から呼ぶ):
//   node scripts/android-variant.mjs dev <android のフォルダー>
//   → app/build.gradle と app/src/main/res/values/strings.xml を書き換えて保存する
// 書き換える場所が見つからない・すでに書き換え済みのときはエラーで止め、気づけるようにする
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEV_NAME = 'Focusr (開発版)';

export function applyDevVariant({ gradle, strings }) {
  const idPattern = /^(\s*applicationId\s+")([^"]+)(")/m;
  const id = idPattern.exec(gradle)?.[2];
  if (!id) throw new Error('build.gradle に applicationId が見つかりません');
  if (id.endsWith('.dev')) throw new Error(`applicationId はすでに開発版です: ${id}`);
  const newGradle = gradle.replace(idPattern, '$1$2.dev$3');

  let newStrings = strings;
  for (const key of ['app_name', 'title_activity_main']) {
    const pattern = new RegExp(`(<string name="${key}">)([^<]*)(</string>)`);
    const value = pattern.exec(newStrings)?.[2];
    if (value === undefined) throw new Error(`strings.xml に ${key} が見つかりません`);
    if (value === DEV_NAME) throw new Error(`${key} はすでに開発版の名前です`);
    newStrings = newStrings.replace(pattern, `$1${DEV_NAME}$3`);
  }
  return { gradle: newGradle, strings: newStrings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [variant, androidDir] = process.argv.slice(2);
  if (variant !== 'dev' || !androidDir) {
    console.error('使い方: node scripts/android-variant.mjs dev <android のフォルダー>');
    process.exit(1);
  }
  const gradlePath = path.join(androidDir, 'app/build.gradle');
  const stringsPath = path.join(androidDir, 'app/src/main/res/values/strings.xml');
  const out = applyDevVariant({ gradle: readFileSync(gradlePath, 'utf8'), strings: readFileSync(stringsPath, 'utf8') });
  writeFileSync(gradlePath, out.gradle);
  writeFileSync(stringsPath, out.strings);
  console.log('開発版 (applicationId の末尾に .dev、名前は開発版) に書き換えました');
}
