'use strict';
/**
 * A loopback HTTP server for the renderer.
 *
 * The auditorium used to be loaded straight off disk with `file://`, which
 * gives the page a null origin and sends no Referer. YouTube's embedded player
 * rejects that outright — "Error 153, video player configuration error" — so no
 * trailer would ever play. Serving the very same files over
 * http://127.0.0.1:<port> gives the page a real origin, and embeds behave
 * exactly as they do on any localhost dev server.
 *
 * The listener is bound to the loopback interface only, and requests whose Host
 * header is not loopback are refused so no other machine (or a rebound DNS
 * name) can reach it.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

/**
 * @param {string} root directory to serve
 * @returns {Promise<{url: string, port: number, close: () => Promise<void>}>}
 */
function serve(root) {
  const rootDir = path.resolve(root);

  const server = http.createServer((req, res) => {
    if (!LOOPBACK_HOST.test(req.headers.host || '')) {
      res.writeHead(403).end('forbidden');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end('method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    if (pathname === '/') pathname = '/index.html';

    // Resolve inside the root, so ../ can never escape it.
    const filePath = path.join(rootDir, path.normalize(pathname));
    if (filePath !== rootDir && !filePath.startsWith(rootDir + path.sep)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404).end('not found');
        return;
      }
      res.writeHead(200, {
        'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
        'content-length': stat.size,
        'cache-control': 'no-cache',
      });
      if (req.method === 'HEAD') {
        res.end();
        return;
      }
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    // Port 0 = let the OS pick a free one.
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        port,
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

module.exports = { serve, MIME, LOOPBACK_HOST };
