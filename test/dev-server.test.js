import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const modulePath = path.resolve('scripts/dev-server.mjs');
const { resolveRequestPath, contentTypeFor, createDevServer } = await import(pathToFileURL(modulePath).href);

let base;   // 一時フォルダー (outer) の中の root
let root;
let outer;
let server;
let origin;

before(async () => {
  outer = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-server-test-'));
  root = path.join(outer, 'root');
  fs.mkdirSync(path.join(root, 'sub'), { recursive: true });
  fs.mkdirSync(path.join(root, 'empty'));
  fs.writeFileSync(path.join(root, 'index.html'), '<h1>トップ</h1>');
  fs.writeFileSync(path.join(root, 'sub', 'index.html'), '<h1>サブ</h1>');
  fs.writeFileSync(path.join(root, 'a.js'), 'export const a = 1;');
  fs.writeFileSync(path.join(root, 'あ.txt'), 'にほんご');
  fs.writeFileSync(path.join(outer, 'secret.txt'), 'root の外');
  base = root;
  server = createDevServer({ root });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(outer, { recursive: true, force: true });
});

// fetch は /../ を作り直してしまうので、生のパスを送るときは http.request を使う
const rawRequest = (method, rawPath) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port: server.address().port, method, path: rawPath }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
  });
  req.on('error', reject);
  req.end();
});

test('resolveRequestPath: ファイルの絶対パスを返す', () => {
  assert.equal(resolveRequestPath(base, '/a.js'), path.join(base, 'a.js'));
  assert.ok(path.isAbsolute(resolveRequestPath(base, '/a.js')));
});

test('resolveRequestPath: ? と # のあとは捨てる', () => {
  assert.equal(resolveRequestPath(base, '/a.js?v=1'), path.join(base, 'a.js'));
  assert.equal(resolveRequestPath(base, '/a.js#top'), path.join(base, 'a.js'));
  assert.equal(resolveRequestPath(base, '/a.js?x=1#y'), path.join(base, 'a.js'));
});

test('resolveRequestPath: URL の符号を戻す。戻せなければ null', () => {
  assert.equal(resolveRequestPath(base, '/%E3%81%82.txt'), path.join(base, 'あ.txt'));
  assert.equal(resolveRequestPath(base, '/%E3%81.txt'), null);
  assert.equal(resolveRequestPath(base, '/%'), null);
});

test('resolveRequestPath: / で終わるときは、その下の index.html', () => {
  assert.equal(resolveRequestPath(base, '/'), path.join(base, 'index.html'));
  assert.equal(resolveRequestPath(base, '/sub/'), path.join(base, 'sub', 'index.html'));
  assert.equal(resolveRequestPath(base, '/?a=1'), path.join(base, 'index.html'));
});

test('resolveRequestPath: root の外に出るパスは null', () => {
  assert.equal(resolveRequestPath(base, '/../secret.txt'), null);
  assert.equal(resolveRequestPath(base, '/%2e%2e/secret.txt'), null);
  assert.equal(resolveRequestPath(base, '/%2E%2E/secret.txt'), null);
  assert.equal(resolveRequestPath(base, '/sub/../../secret.txt'), null);
  assert.equal(resolveRequestPath(base, '/../'), null);
  assert.equal(resolveRequestPath(base, '/..%2fsecret.txt'), null);
});

test('resolveRequestPath: root と名前が前方一致するだけの別のフォルダーには出られない', () => {
  assert.equal(resolveRequestPath(base, '/../root-other/x.txt'), null);
});

test('contentTypeFor: 拡張子で決める', () => {
  const table = {
    'a.html': 'text/html; charset=utf-8',
    'a.js': 'text/javascript; charset=utf-8',
    'a.mjs': 'text/javascript; charset=utf-8',
    'a.css': 'text/css; charset=utf-8',
    'a.json': 'application/json; charset=utf-8',
    'a.svg': 'image/svg+xml',
    'a.png': 'image/png',
    'a.jpg': 'image/jpeg',
    'a.jpeg': 'image/jpeg',
    'a.webp': 'image/webp',
    'a.woff2': 'font/woff2',
    'a.mp3': 'audio/mpeg',
    'a.ogg': 'audio/ogg',
    'a.wav': 'audio/wav',
    'a.ico': 'image/x-icon',
  };
  for (const [file, type] of Object.entries(table)) {
    assert.equal(contentTypeFor(file), type, file);
  }
});

test('contentTypeFor: 大文字の拡張子も同じに扱う。知らない拡張子は octet-stream', () => {
  assert.equal(contentTypeFor('A.HTML'), 'text/html; charset=utf-8');
  assert.equal(contentTypeFor('/x/y/PHOTO.JPG'), 'image/jpeg');
  assert.equal(contentTypeFor('a.xyz'), 'application/octet-stream');
  assert.equal(contentTypeFor('noext'), 'application/octet-stream');
});

test('createDevServer: まだ listen していない http.Server を返す', () => {
  const s = createDevServer({ root });
  assert.ok(s instanceof http.Server);
  assert.equal(s.listening, false);
});

test('サーバー: GET で 200 と中身、Content-Type、Cache-Control: no-store', async () => {
  const res = await fetch(`${origin}/a.js`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'export const a = 1;');
  assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('サーバー: 日本語名のファイルも配る', async () => {
  const res = await fetch(`${origin}/${encodeURIComponent('あ.txt')}`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'にほんご');
});

test('サーバー: / と、/ で終わるパスは index.html を返す', async () => {
  const top = await fetch(`${origin}/`);
  assert.equal(top.status, 200);
  assert.equal(await top.text(), '<h1>トップ</h1>');
  assert.equal(top.headers.get('content-type'), 'text/html; charset=utf-8');
  const sub = await fetch(`${origin}/sub/`);
  assert.equal(sub.status, 200);
  assert.equal(await sub.text(), '<h1>サブ</h1>');
});

test('サーバー: ? のあとを捨ててファイルを探す', async () => {
  const res = await fetch(`${origin}/a.js?v=123`);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'export const a = 1;');
});

test('サーバー: ファイルがなければ 404', async () => {
  const res = await fetch(`${origin}/nothing.js`);
  assert.equal(res.status, 404);
  await res.arrayBuffer();
});

test('サーバー: index.html がないフォルダーは 404', async () => {
  const a = await fetch(`${origin}/empty/`);
  assert.equal(a.status, 404);
  await a.arrayBuffer();
  const b = await fetch(`${origin}/empty`);
  assert.equal(b.status, 404);
  await b.arrayBuffer();
});

test('サーバー: root の外のファイルは配らず 404', async () => {
  for (const p of ['/../secret.txt', '/%2e%2e/secret.txt', '/sub/../../secret.txt']) {
    const res = await rawRequest('GET', p);
    assert.equal(res.status, 404, p);
    assert.ok(!res.body.includes('root の外'), `${p} で中身が漏れていない`);
  }
});

test('サーバー: HEAD は 200 とヘッダーだけで、本文は空', async () => {
  const res = await fetch(`${origin}/a.js`, { method: 'HEAD' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(await res.text(), '');
});

test('サーバー: ないファイルへの HEAD は 404', async () => {
  const res = await fetch(`${origin}/nothing.js`, { method: 'HEAD' });
  assert.equal(res.status, 404);
});

test('サーバー: GET・HEAD 以外は 405', async () => {
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const res = await fetch(`${origin}/a.js`, { method, body: method === 'DELETE' ? undefined : 'x' });
    assert.equal(res.status, 405, method);
    await res.arrayBuffer();
  }
});

test('import しただけでは listen しない (プロセスが待たずに終わる)', () => {
  const code = `await import(${JSON.stringify(pathToFileURL(modulePath).href)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.error, undefined, '5 秒以内に終わる (listen して待ち続けていない)');
  assert.equal(result.status, 0, result.stderr);
});
