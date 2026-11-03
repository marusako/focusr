import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDevVariant } from '../scripts/android-variant.mjs';

const gradle = `apply plugin: 'com.android.application'

android {
    namespace = "io.github.marusako.focusr"
    compileSdk = rootProject.ext.compileSdkVersion
    defaultConfig {
        applicationId "io.github.marusako.focusr"
        minSdkVersion rootProject.ext.minSdkVersion
        versionCode 1
        versionName "1.0"
    }
}
`;

const strings = `<?xml version='1.0' encoding='utf-8'?>
<resources>
    <string name="app_name">Focusr</string>
    <string name="title_activity_main">Focusr</string>
    <string name="package_name">io.github.marusako.focusr</string>
    <string name="custom_url_scheme">io.github.marusako.focusr</string>
</resources>
`;

const lines = (s) => s.split('\n');
const changedLines = (before, after) => {
  const a = lines(before);
  const b = lines(after);
  assert.equal(b.length, a.length, '行の数は変わらない');
  return a.map((l, i) => [l, b[i]]).filter(([x, y]) => x !== y);
};

test('applicationId の末尾に .dev を付ける', () => {
  const out = applyDevVariant({ gradle, strings });
  assert.ok(out.gradle.includes('        applicationId "io.github.marusako.focusr.dev"'));
});

test('namespace は変えない', () => {
  const out = applyDevVariant({ gradle, strings });
  assert.ok(out.gradle.includes('    namespace = "io.github.marusako.focusr"\n'));
});

test('gradle は applicationId の 1 行だけが変わる', () => {
  const out = applyDevVariant({ gradle, strings });
  const diff = changedLines(gradle, out.gradle);
  assert.equal(diff.length, 1);
  assert.match(diff[0][0], /applicationId/);
});

test('app_name と title_activity_main を「Focusr (開発版)」にする', () => {
  const out = applyDevVariant({ gradle, strings });
  assert.ok(out.strings.includes('<string name="app_name">Focusr (開発版)</string>'));
  assert.ok(out.strings.includes('<string name="title_activity_main">Focusr (開発版)</string>'));
});

test('package_name と custom_url_scheme は変えない。ほかの行も変わらない', () => {
  const out = applyDevVariant({ gradle, strings });
  assert.ok(out.strings.includes('<string name="package_name">io.github.marusako.focusr</string>'));
  assert.ok(out.strings.includes('<string name="custom_url_scheme">io.github.marusako.focusr</string>'));
  const diff = changedLines(strings, out.strings);
  assert.equal(diff.length, 2, '変わるのは app_name と title_activity_main の 2 行だけ');
});

test('applicationId が見つからなければ Error を投げる', () => {
  const noId = gradle.replace(/^.*applicationId.*\n/m, '');
  assert.throws(() => applyDevVariant({ gradle: noId, strings }), Error);
});

test('app_name が見つからなければ Error を投げる', () => {
  const noName = strings.replace(/^.*"app_name".*\n/m, '');
  assert.throws(() => applyDevVariant({ gradle, strings: noName }), Error);
});

test('title_activity_main が見つからなければ Error を投げる', () => {
  const noTitle = strings.replace(/^.*"title_activity_main".*\n/m, '');
  assert.throws(() => applyDevVariant({ gradle, strings: noTitle }), Error);
});

test('すでに .dev の applicationId なら Error を投げる (二重適用を防ぐ)', () => {
  const once = applyDevVariant({ gradle, strings });
  assert.throws(() => applyDevVariant({ gradle: once.gradle, strings }), Error);
});

test('すでに開発版の名前の strings でも Error を投げる', () => {
  const once = applyDevVariant({ gradle, strings });
  assert.throws(() => applyDevVariant({ gradle, strings: once.strings }), Error);
});

test('入力の文字列は書き換えない (新しい文字列を返す)', () => {
  const g = gradle;
  const s = strings;
  applyDevVariant({ gradle: g, strings: s });
  assert.equal(g, gradle);
  assert.equal(s, strings);
});
