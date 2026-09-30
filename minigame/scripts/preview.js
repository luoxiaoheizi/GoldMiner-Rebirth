'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DIST, inside } = require('./build');
const root = path.join(DIST, 'web');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

function createServer() {
  return http.createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch (_) { response.writeHead(400); response.end('Bad request'); return; }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (pathname.includes('\\') || pathname.includes('\0') || !inside(root, file)) { response.writeHead(403); response.end('Forbidden'); return; }
    let realFile;
    try {
      realFile = fs.realpathSync(file);
      if (!inside(fs.realpathSync(root), realFile) || !fs.statSync(realFile).isFile()) throw new Error('Forbidden');
    } catch (_) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; media-src 'self'; object-src 'none'; base-uri 'none'",
    });
    if (request.method === 'HEAD') response.end();
    else fs.createReadStream(realFile).on('error', () => response.destroy()).pipe(response);
  });
}
if (require.main === module) {
  const args = process.argv.slice(2);
  const port = args.length === 0 ? 4173 : args[0] === '--port' && args.length === 2 ? Number(args[1]) : NaN;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('用法：node scripts/preview.js [--port 4173]，端口范围 1024–65535');
    process.exitCode = 1;
  } else if (!fs.existsSync(path.join(root, 'index.html'))) {
    console.error('尚未构建。请先运行 npm run build。');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.on('error', (error) => { console.error('预览启动失败：' + error.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => console.log('本地预览：http://127.0.0.1:' + port + '（Ctrl+C 停止）'));
    process.on('SIGINT', () => server.close(() => process.exit(0)));
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
  }
}
module.exports = { createServer };
