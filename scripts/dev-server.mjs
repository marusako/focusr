// 開発中の画面 (src) をブラウザーで確かめるための、小さなサーバー。Node の標準の機能だけで作る。
// ES モジュールを使うので、ファイルを直接開かず、このサーバーを通して開く。
//
// 使い方: npm run dev (node scripts/dev-server.mjs)
//   → src を http://127.0.0.1:5173/ で配る。ポートは環境変数 PORT で変えられる。外から見えないよう 127.0.0.1 だけで待つ
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.ico': 'image/x-icon',
};

export function contentTypeFor(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
}

// URL のパスから、配るファイルの絶対パスを決める。root の外に出るパスや、戻せない符号は null
export function resolveRequestPath(root, urlPath) {
  const rawPath = urlPath.split(/[?#]/)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const rootPath = path.resolve(root);
  let target = path.resolve(rootPath, `.${decoded.startsWith('/') ? '' : '/'}${decoded}`);
  if (decoded.endsWith('/')) target = path.join(target, 'index.html');
  const relative = path.relative(rootPath, target);
  if (relative === '' || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return null;
  return target;
}

export function createDevServer({ root }) {
  return http.createServer((req, res) => {
    const reply = (status, headers = {}, body = '') => {
      res.writeHead(status, headers);
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply(405, { Allow: 'GET, HEAD' });
    const filePath = resolveRequestPath(root, req.url ?? '/');
    if (!filePath) return reply(404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
    fs.readFile(filePath, (error, data) => {
      if (error) return reply(404, { 'Content-Type': 'text/plain; charset=utf-8' }, 'Not Found');
      // 直したらすぐ見えるように、ブラウザーに覚えさせない
      reply(200, { 'Content-Type': contentTypeFor(filePath), 'Cache-Control': 'no-store' }, data);
    });
  });
}

// 直接実行したときだけ、src を配り始める (import しただけでは待たない)
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = fileURLToPath(new URL('../src', import.meta.url));
  const rawPort = process.env.PORT;
  const port = rawPort === undefined || rawPort === '' ? 5173 : Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`PORT は 1〜65535 の整数で指定してください (指定された値: ${rawPort})`);
    process.exit(1);
  }
  const server = createDevServer({ root });
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`ポート ${port} は使用中です。PORT=5174 npm run dev のように変えられます`);
    } else {
      console.error(`サーバーを始められませんでした: ${error.message}`);
    }
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`http://127.0.0.1:${port}/`);
  });
}
