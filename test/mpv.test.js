'use strict';
/* The mpv engine. Argument building and binary discovery are checked always;
   the control tests run against a real mpv when one is installed and skip
   cleanly when it is not. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mpv = require('../src/core/mpv');

const BINARY = mpv.locate();
const skip = BINARY ? false : 'mpv is not installed on this machine';

/** A short, seekable WAV — enough to exercise every control we use. */
function writeSample() {
  const rate = 8000;
  const samples = rate * 6;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) data.writeInt16LE(Math.round(9000 * Math.sin((2 * Math.PI * 440 * i) / rate)), i * 2);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  const file = path.join(os.tmpdir(), `cinema-mpv-test-${process.pid}.wav`);
  fs.writeFileSync(file, Buffer.concat([header, data]));
  return file;
}

const HEADLESS = ['--vo=null', '--ao=null', '--no-config', '--really-quiet'];

/**
 * Poll until a condition about the player holds. Sleeping a fixed time and then
 * asserting makes the test a race against a loaded machine; waiting for the
 * state we actually care about does not.
 */
async function waitFor(check, { timeout = 8000, every = 50, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
      last = value;
    } catch (err) {
      // Before mpv has loaded the file, reading time-pos rejects with
      // "property unavailable" rather than returning nothing. That is a
      // not-yet, not a failure — keep polling.
      last = `<${err.message}>`;
    }
    await new Promise((r) => setTimeout(r, every));
  }
  throw new Error(`timed out after ${timeout}ms waiting for ${what} (last: ${JSON.stringify(last)})`);
}

/* ------------------------------------------------------------------ args */

test('the media path is always last, after --', () => {
  const args = mpv.buildArgs({ url: '--not-an-option.mkv', ipcPath: '/tmp/s' });
  assert.equal(args[args.length - 1], '--not-an-option.mkv');
  assert.equal(args[args.length - 2], '--');
});

test('the film opens on the television, by coordinate and by index', () => {
  const args = mpv.buildArgs({ url: 'x', ipcPath: '/tmp/s', origin: { x: 1920, y: 0 }, screen: 1 });
  assert.ok(args.includes('--fullscreen'));
  assert.ok(args.includes('--geometry=+1920+0'), 'a coordinate lands on the right monitor whatever mpv calls it');
  assert.ok(args.includes('--fs-screen=1'));
});

test('optional settings only appear when asked for', () => {
  const bare = mpv.buildArgs({ url: 'x', ipcPath: '/tmp/s' });
  assert.ok(!bare.some((a) => a.startsWith('--start=')));
  assert.ok(!bare.some((a) => a.startsWith('--volume=')));
  assert.ok(!bare.some((a) => a.startsWith('--sub-file=')));

  const full = mpv.buildArgs({
    url: 'x',
    ipcPath: '/tmp/s',
    startTime: 61.7,
    volume: 80,
    subtitles: [{ url: 'https://s/a.srt' }, { url: 'https://s/b.srt' }, null],
    title: 'A Film',
  });
  assert.ok(full.includes('--start=61'));
  assert.ok(full.includes('--volume=80'));
  assert.equal(full.filter((a) => a.startsWith('--sub-file=')).length, 2);
  assert.ok(full.includes('--force-media-title=A Film'));
});

test('volume is clamped to a range mpv accepts', () => {
  assert.ok(mpv.buildArgs({ url: 'x', ipcPath: '/s', volume: 999 }).includes('--volume=130'));
  assert.ok(mpv.buildArgs({ url: 'x', ipcPath: '/s', volume: -5 }).includes('--volume=0'));
});

test('candidate locations are platform-appropriate and honour an override', () => {
  const win = mpv.candidatePaths({ platform: 'win32', configured: 'D:\\mpv\\mpv.exe', env: {} });
  assert.equal(win[0], 'D:\\mpv\\mpv.exe', 'a configured path wins');
  assert.ok(win.some((p) => p.includes('Program Files')));

  const mac = mpv.candidatePaths({ platform: 'darwin', env: {} });
  assert.ok(mac.some((p) => p.includes('homebrew')));
  assert.ok(mac.some((p) => p.includes('mpv.app')));

  // Build the expectation the same way the code does, so the separator is
  // whatever this platform uses rather than a hard-coded slash.
  const bundled = mpv.candidatePaths({ platform: 'linux', bundledDir: path.join('/app', 'resources', 'mpv'), env: {} });
  assert.equal(
    bundled[0],
    path.join('/app', 'resources', 'mpv', 'mpv'),
    'a shipped binary is preferred over the system one'
  );
});

test('the ipc endpoint matches the platform', () => {
  const endpoint = mpv.ipcPathFor('abc');
  if (process.platform === 'win32') assert.match(endpoint, /^\\\\\.\\pipe\\/);
  else assert.ok(path.isAbsolute(endpoint) && endpoint.endsWith('.sock'));
});

/* --------------------------------------------------------------- control */

test('finds and identifies a real mpv', { skip }, async () => {
  const info = await mpv.probe(BINARY);
  assert.ok(info, 'probe should recognise the binary');
  assert.match(info.version, /^v?\d+\.\d+/);
});

test('probe rejects something that is not mpv', async () => {
  assert.equal(await mpv.probe(process.execPath), null, 'node is not mpv');
  assert.equal(await mpv.probe('/definitely/not/here'), null);
});

test('plays a file and answers every control we use', { skip }, async () => {
  const sample = writeSample();
  const session = await mpv.launch(BINARY, { url: sample, fullscreen: false, volume: 70, extra: HEADLESS });
  try {
    await waitFor(async () => (await session.client.getProperty('time-pos')) > 0.3, { what: 'playback to start' });

    assert.equal(await session.client.getProperty('duration'), 6);
    assert.equal(await session.client.getProperty('volume'), 70, 'the launch volume is applied');

    await session.client.setProperty('pause', true);
    // Read after the pause has taken effect, not merely after it was requested.
    const held = await waitFor(
      async () => ((await session.client.getProperty('pause')) ? await session.client.getProperty('time-pos') : null),
      { what: 'the pause to take effect' }
    );
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(await session.client.getProperty('time-pos'), held, 'pause must actually hold the position');

    await session.client.command('seek', 4, 'absolute');
    const sought = await waitFor(
      async () => {
        const at = await session.client.getProperty('time-pos');
        return at > 3.5 && at < 4.5 ? at : null;
      },
      { what: 'the seek to land near 4s' }
    );
    assert.ok(sought > 3.5 && sought < 4.5, `seek should land near 4s, got ${sought}`);

    await session.client.setProperty('mute', true);
    assert.equal(await session.client.getProperty('mute'), true);

    // The opening values must survive, not be missed by a late subscriber.
    assert.equal(session.state.duration, 6);
    assert.ok('media-title' in session.state);
  } finally {
    await session.stop();
    await session.exited;
    fs.unlinkSync(sample);
  }
});

test('closes itself when the film ends', { skip }, async () => {
  const sample = writeSample();
  const session = await mpv.launch(BINARY, {
    url: sample,
    fullscreen: false,
    extra: [...HEADLESS, '--length=1'],
  });
  const events = [];
  session.client.on('event', (e) => events.push(e.event));
  const { code } = await session.exited;
  fs.unlinkSync(sample);

  assert.equal(code, 0, 'a finished film should be a clean exit, not a crash');
  assert.ok(events.includes('end-file'), 'end-of-file is what returns the room to the lobby');
});

test('stop() ends a film that is still running', { skip }, async () => {
  const sample = writeSample();
  const session = await mpv.launch(BINARY, { url: sample, fullscreen: false, extra: HEADLESS });
  await waitFor(async () => (await session.client.getProperty('time-pos')) >= 0, { what: 'playback to begin' });
  await session.stop();
  const { code } = await session.exited;
  fs.unlinkSync(sample);
  assert.equal(code, 0);
});

test('a missing binary fails with a clear message', async () => {
  await assert.rejects(
    () => mpv.launch('/definitely/not/mpv', { url: 'x', ipcPath: mpv.ipcPathFor('nope') }),
    /control channel|ENOENT/
  );
});
