import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_PORT, portOf } from '../src/port.ts';

const API = path.join(import.meta.dirname, '..');

test('PORT unset or empty is 8787, 0 is any free port, and a number is that port', () => {
  assert.equal(portOf(undefined), DEFAULT_PORT);
  assert.equal(portOf(''), DEFAULT_PORT);
  assert.equal(portOf('0'), 0);
  assert.equal(portOf('9001'), 9001);
  assert.equal(portOf(' 65535 '), 65535);
});

test('a PORT that is not a port is refused with the fix, not read as 8787', () => {
  for (const value of ['abc', '80a', '-1', '65536', '1e3', '0x50', '8787.0', '100000']) {
    assert.throws(() => portOf(value), (err: Error & { exitCode?: number }) =>
      err.exitCode === 2 && err.message.startsWith(`PORT=${value} is not a port.`) && /0 for any free port/.test(err.message), value);
  }
});

/** `node src/main.ts` with `PORT`, in a store of its own: what it printed, and how it ended if it did. */
function startApi(port: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-api-main-'));
  const child = spawn(process.execPath, ['src/main.ts'], { cwd: API, env: { ...process.env, PORT: port, WF_ROOT: root } });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  const ended = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const said = (pattern: RegExp) =>
    new Promise<RegExpMatchArray>((resolve, reject) => {
      const timer = setInterval(() => {
        const m = pattern.exec(output);
        if (m) { clearInterval(timer); resolve(m); }
      }, 20);
      void ended.then(() => { clearInterval(timer); const m = pattern.exec(output); m ? resolve(m) : reject(new Error(`exited without ${pattern}:\n${output}`)); });
    });
  return { child, ended, said, output: () => output };
}

test('PORT=0 starts the api on a free port, and it prints the port it got', async (t) => {
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [, got] = await api.said(/api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  assert.notEqual(Number(got), 0);
  assert.notEqual(Number(got), DEFAULT_PORT);
  const res = await fetch(`http://127.0.0.1:${got}/api/health`);
  assert.deepEqual(await res.json(), { ok: true }, 'and it is listening there');
});

test("REFUSED: the api listens on 127.0.0.1 alone — nothing answers on this machine's other addresses, where anyone on the network could start a run", async (t) => {
  // Before it listened on loopback alone, a text/plain POST /api/runs to this address answered 201 and wrote a run.
  const outward = Object.values(os.networkInterfaces()).flat().find((a) => a?.family === 'IPv4' && !a.internal)?.address;
  const api = startApi('0');
  t.after(() => api.child.kill());
  const [, got] = await api.said(/api listening on http:\/\/127\.0\.0\.1:(\d+)/);
  assert.deepEqual(await (await fetch(`http://127.0.0.1:${got}/api/health`)).json(), { ok: true }, 'it answers on loopback');
  if (!outward) return t.skip('this machine has no address but loopback to try');
  await assert.rejects(
    fetch(`http://${outward}:${got}/api/health`),
    (err: Error & { cause?: { code?: string } }) => err.cause?.code === 'ECONNREFUSED',
    `nothing answers on ${outward}:${got}`,
  );
});

test('the api refuses a PORT that is not a port: exit 2, the fix on stderr, nothing listening', async () => {
  const api = startApi('80a');
  assert.equal(await api.ended, 2);
  assert.match(api.output(), /PORT=80a is not a port\. Give a whole number from 0 to 65535/);
  assert.doesNotMatch(api.output(), /listening/);
});
