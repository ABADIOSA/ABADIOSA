'use strict';
/* The loopback server exists so the renderer has a real http origin — without
   it YouTube refuses to play anything ("Error 153"). These check that it serves
   the app correctly and stays reachable only from this machine. */
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');

const staticServer = require('../src/main/static-server');

const RENDERER = path.join(__dirname, '..', 'src', 'renderer');

/** Raw request so we can set headers fetch() refuses to forge, like Host. */
function raw(port, request) {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1', () => socket.write(request));
    let body = '';
    socket.on('data', (chunk) => (body += chunk));
    socket.on('end', () => resolve(body));
    socket.on('error', () => resolve(''));
  });
}
const statusOf = (response) => Number((response.split('\r\n')[0] || '').split(' ')[1]);

test('serves the renderer over an http origin', async () => {
  const site = await staticServer.serve(RENDERER);
  try {
    assert.match(site.url, /^http:\/\/127\.0\.0\.1:\d+$/);

    const page = await fetch(`${site.url}/index.html`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    const html = await page.text();
    assert.match(html, /Cinema Hall/);

    const css = await fetch(`${site.url}/css/cinema.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type'), /text\/css/);

    const js = await fetch(`${site.url}/js/youtube.js`);
    assert.equal(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);

    // "/" must land on the app, not a directory listing.
    const root = await fetch(`${site.url}/`);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Cinema Hall/);
  } finally {
    await site.close();
  }
});

test('refuses anything that is not a local GET for a real file', async () => {
  const site = await staticServer.serve(RENDERER);
  try {
    const local = `Host: 127.0.0.1:${site.port}`;
    assert.equal(statusOf(await raw(site.port, `GET /index.html HTTP/1.1\r\n${local}\r\nConnection: close\r\n\r\n`)), 200);

    // DNS-rebinding guard: only loopback names are served.
    assert.equal(
      statusOf(await raw(site.port, 'GET /index.html HTTP/1.1\r\nHost: attacker.example\r\nConnection: close\r\n\r\n')),
      403
    );

    assert.equal(
      statusOf(await raw(site.port, `POST /index.html HTTP/1.1\r\n${local}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`)),
      405
    );

    // Nothing above the renderer directory is reachable, encoded or not.
    for (const target of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/%2e%2e/package.json']) {
      const status = statusOf(await raw(site.port, `GET ${target} HTTP/1.1\r\n${local}\r\nConnection: close\r\n\r\n`));
      assert.ok(status === 403 || status === 404, `${target} should not be served (got ${status})`);
    }

    assert.equal(statusOf(await raw(site.port, `GET /nope.html HTTP/1.1\r\n${local}\r\nConnection: close\r\n\r\n`)), 404);
  } finally {
    await site.close();
  }
});

test('each launch takes its own free port and releases it', async () => {
  const first = await staticServer.serve(RENDERER);
  const second = await staticServer.serve(RENDERER);
  assert.notEqual(first.port, second.port);
  await first.close();
  await second.close();

  // Once closed the port is genuinely gone, not left listening.
  const after = await fetch(`${first.url}/index.html`).then(() => 'answered', () => 'refused');
  assert.equal(after, 'refused');
});
