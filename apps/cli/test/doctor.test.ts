/**
 * `nemia doctor` and `nemia doctor fix <need>`, against a stand-in of the api's readiness routes under a remote context: the read
 * prints the server's pieces and adds the laptop's own under the area `client` — the server reached, the token accepted, `~/.local/bin`
 * on PATH — and still answers, non-zero, where the server takes no connection; the fix is started with its answers and its output
 * followed to its end, the code it declares shown again, and the exit is its phase's. A met piece shows the fix that removes it, a typed
 * fix the command to type; the verb it replaced, `readiness`, is refused with exit 2.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import type { Said } from './served.ts';
import { configWritten } from '../src/context.ts';
import { doctorLines } from '../src/doctor.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const GOOD = 'nm_good';
/** A token the stub answers with ADVISED, the read of a server missing only a piece no run waits on. */
const ADVISED_TOKEN = 'nm_advised';

const FIX = {
  message: 'sign in',
  command: 'tool login',
  startable: true,
  index: 0,
  asks: [{ name: 'host', message: 'which host' }],
  code: '[A-Z0-9]{4}-[A-Z0-9]{4}',
};
const READ = {
  ready: false,
  ran: true,
  pieces: [
    { name: 'claude-token', area: 'harness', state: 'met', message: 'a Claude token is set and loads', fixes: [] },
    {
      name: 'tool',
      area: 'harness',
      state: 'met',
      message: 'tool 1.0 is installed',
      fixes: [{ message: 'take tool off this server', command: 'tool uninstall', startable: true, index: 1, kind: 'removes' }],
    },
    {
      name: 'tool-sign-in',
      area: 'harness',
      state: 'missing',
      message: 'tool is not signed in',
      fixes: [{ message: 'sign in at a terminal', command: 'tool auth login', startable: false, index: 0, kind: 'typed' }],
    },
    { name: 'tool-auth', area: 'workflow', state: 'missing', message: 'not signed in', factory: 'f1', workflow: 'build', fixes: [FIX] },
  ],
};

/** A server whose runs have started, missing only linger, which keeps it up and no run waits on. */
const ADVISED = {
  ready: false,
  ran: true,
  pieces: [
    { name: 'claude-token', area: 'harness', state: 'met', message: 'a Claude token is set and loads', fixes: [], cost: 'run' },
    {
      name: 'linger',
      area: 'service',
      state: 'missing',
      message: 'their services stop when they log out',
      fixes: [{ message: 'keep them running', command: 'sudo loginctl enable-linger someone', startable: false }],
      cost: 'server',
    },
  ],
};

/** The bodies of the fixes started. */
const started: unknown[] = [];

/** An SSE block. */
const sse = (event: string, data: string): string =>
  `event: ${event}\n${data
    .split('\n')
    .map((l) => `data: ${l}`)
    .join('\n')}\n\n`;

const stub = http.createServer((req, res) => {
  let text = '';
  req.on('data', (chunk) => (text += chunk));
  req.on('end', () => {
    const url = new URL(req.url ?? '/', 'http://stub').pathname;
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url === '/api/health') return json(200, {});
    if (url === '/api/readiness' && req.headers.authorization === `Bearer ${ADVISED_TOKEN}`) return json(200, ADVISED);
    if (req.headers.authorization !== `Bearer ${GOOD}`) return json(401, { error: 'no such token' });
    if (url === '/api/readiness') return json(200, READ);
    if (url === '/api/readiness/fixes' && req.method === 'POST') {
      const body = JSON.parse(text) as { need: string };
      started.push(body);
      return json(200, { id: body.need === 'tool-auth' ? 'fx-ok' : 'fx-bad', need: body.need, phase: 'running', output: '' });
    }
    const output = /^\/api\/readiness\/fixes\/([^/]+)\/output$/.exec(url);
    if (output) {
      const ok = output[1] === 'fx-ok';
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write(sse('output', 'Open https://example.test/device\n'));
      res.write(sse('output', 'and enter WXYZ-1234 there\n'));
      res.end(
        sse('ended', JSON.stringify({ id: output[1], need: 'n', phase: ok ? 'succeeded' : 'failed', output: '', exitCode: ok ? 0 : 1 })),
      );
      return undefined;
    }
    return json(404, {});
  });
});
await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
after(() => {
  stub.closeAllConnections();
  stub.close();
});
const server = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;

/** A port nothing listens on: taken and given back. */
const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const address = s.address();
      s.close(() => resolve(typeof address === 'object' && address !== null ? address.port : 0));
    });
  });

/** A laptop whose context in use is `at` with `token`, `~/.local/bin` on its PATH where `onPath`. */
function aLaptop(prefix: string, at: string, token: string, onPath = true): NodeJS.ProcessEnv {
  const folder = scratch(prefix);
  const home = path.join(folder, 'home');
  const env = {
    ...ambient(),
    HOME: home,
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    WF_ROOT: path.join(folder, 'store'),
    NEMIA_DAEMON_START: 'off',
    PATH: [...(onPath ? [path.join(home, '.local', 'bin')] : []), process.env.PATH ?? ''].join(path.delimiter),
  };
  configWritten({ contexts: [{ name: 'vps', server: at, token }], current: 'vps' }, env);
  return env;
}

/** `nemia <argv>` on `env`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

type Piece = { name: string; area: string; state: string };
const piecesOf = (said: Said): Piece[] => (JSON.parse(said.out) as { pieces: Piece[] }).pieces;
const clientStates = (said: Said): Record<string, string> =>
  Object.fromEntries(
    piecesOf(said)
      .filter((p) => p.area === 'client')
      .map((p) => [p.name, p.state]),
  );

test("`nemia doctor --json`: the server's pieces, and the laptop's own under `client`, every one in place", async () => {
  const said = await nemia(['doctor', '--json'], aLaptop('nemia-ready-json-', server, GOOD));
  assert.equal(said.code, 1, `a missing piece of the server's: ${said.err}`);
  const pieces = piecesOf(said);
  assert.deepEqual(
    pieces.filter((p) => p.area !== 'client').map((p) => p.name),
    ['claude-token', 'tool', 'tool-sign-in', 'tool-auth'],
  );
  assert.deepEqual(clientStates(said), { 'server-reached': 'met', 'token-accepted': 'met', 'local-bin-on-path': 'met' });
  assert.equal((JSON.parse(said.out) as { ran?: boolean }).ran, true, 'whether the server ever ran a run is carried as it answered');
});

test('`nemia doctor`: a token the server refuses, and ~/.local/bin off PATH, are missing pieces of the client', async () => {
  const said = await nemia(['doctor', '--json'], aLaptop('nemia-ready-token-', server, 'nm_wrong', false));
  assert.equal(said.code, 1);
  assert.deepEqual(clientStates(said), { 'server-reached': 'met', 'token-accepted': 'missing', 'local-bin-on-path': 'missing' });
});

test('`nemia doctor`: a context whose server takes no connection is flagged, and the read still answers, non-zero', async () => {
  const env = aLaptop('nemia-ready-down-', `http://127.0.0.1:${await freePort()}`, GOOD);
  const json = await nemia(['doctor', '--json'], env);
  assert.equal(json.code, 1, json.err);
  assert.equal(clientStates(json)['server-reached'], 'missing');
  const text = await nemia(['doctor'], env);
  assert.equal(text.code, 1);
  assert.match(text.out, /server-reached/);
  assert.match(text.out, /nemia config get-contexts/, 'the fix names a command');
});

test('`nemia doctor` on a server missing only linger, which no run waits on: exit 0, said ready with the piece advised and its fix', async () => {
  const said = await nemia(['doctor'], aLaptop('nemia-ready-advised-', server, ADVISED_TOKEN));
  assert.equal(said.code, 0, `a script waiting on the read goes on: ${said.err}`);
  const last = said.out.trimEnd().split('\n').at(-1) ?? '';
  assert.match(last, /^ready\b/);
  assert.doesNotMatch(last, /not ready|first run/);
  assert.match(said.out, /sudo loginctl enable-linger/, 'the advised piece is listed with its fix');
  const json = await nemia(['doctor', '--json'], aLaptop('nemia-ready-advised-json-', server, ADVISED_TOKEN));
  assert.equal(json.code, 0, json.err);
});

test('`nemia doctor` as text: each area, each piece, and the command of each fix', async () => {
  const said = await nemia(['doctor'], aLaptop('nemia-ready-text-', server, GOOD));
  assert.equal(said.code, 1);
  for (const word of ['harness', 'workflow', 'client', 'claude-token', 'tool-auth', 'tool login']) assert.ok(said.out.includes(word), word);
  assert.match(said.out, /nemia doctor fix tool --index 1/, 'a met piece names the fix that removes it');
  assert.match(said.out, /fix: tool auth login/, 'a typed fix is the command to type');
  assert.doesNotMatch(said.out, /nemia doctor fix tool-sign-in/, 'a typed fix is never started from here');
});

test('`nemia doctor fix <need>` posts the need alone where nothing else is typed', async () => {
  const from = started.length;
  const said = await nemia(['doctor', 'fix', 'claude'], aLaptop('nemia-fix-need-', server, GOOD));
  assert.equal(said.code, 1, said.err);
  assert.deepEqual(started.slice(from), [{ need: 'claude' }]);
});

test('REFUSED: the retired verb `readiness`, with or without its words, is a usage refusal naming `nemia doctor`', async () => {
  const env = aLaptop('nemia-retired-', server, GOOD);
  for (const argv of [['readiness'], ['readiness', 'fix', 'tool-auth'], ['readiness', '--local']]) {
    const said = await nemia(argv, env);
    assert.equal(said.code, 2, argv.join(' '));
    assert.match(said.err, /nemia doctor/, 'the refusal names the verb to type');
  }
});

test('`nemia doctor fix <need>`: started with its answers, its output followed, its code shown again, exit 0 on success', async () => {
  const from = started.length;
  const said = await nemia(
    ['doctor', 'fix', 'tool-auth', '--factory', 'f1', '--workflow', 'build', '--answer', 'host=example.test'],
    aLaptop('nemia-fix-ok-', server, GOOD),
  );
  assert.equal(said.code, 0, said.err);
  assert.deepEqual(started.slice(from), [{ need: 'tool-auth', factory: 'f1', workflow: 'build', answers: { host: 'example.test' } }]);
  assert.ok(said.out.includes('https://example.test/device'), 'the output, as it came');
  assert.equal(said.out.split('WXYZ-1234').length - 1, 2, 'the code in its line, and again on its own');
});

test('`nemia doctor fix`: a fix that failed exits 1', async () => {
  const said = await nemia(['doctor', 'fix', 'other-need'], aLaptop('nemia-fix-bad-', server, GOOD));
  assert.equal(said.code, 1, said.err);
});

test('REFUSED: an ask with no `--answer` and no terminal to ask it on is a usage refusal naming the flag', async () => {
  const from = started.length;
  const said = await nemia(
    ['doctor', 'fix', 'tool-auth', '--factory', 'f1', '--workflow', 'build'],
    aLaptop('nemia-fix-ask-', server, GOOD),
  );
  assert.equal(said.code, 2);
  assert.match(said.err, /--answer host=/);
  assert.equal(started.length, from, 'no fix started');
});

test('`nemia doctor`\'s last line says what the missing pieces cost, never "not ready", and "first run" only where none ran', async (t) => {
  const linger = { name: 'linger', area: 'service', state: 'missing', message: 'stops at log out', fixes: [], cost: 'server' } as const;
  const token = { name: 'claude-token', area: 'harness', state: 'missing', message: 'no token', fixes: [], cost: 'run' } as const;
  const last = (read: Parameters<typeof doctorLines>[0]) => doctorLines(read).at(-1) ?? '';
  await t.test('a server whose factories have run, missing only linger: no run waits on it', () => {
    const said = last({ ready: false, ran: true, pieces: [linger] });
    assert.match(said, /no run waits on/);
    assert.doesNotMatch(said, /not ready|first run/);
  });
  await t.test('a server that never ran, missing a piece a run waits on: before its first run', () => {
    assert.match(last({ ready: false, ran: false, pieces: [token] }), /first run/);
  });
  await t.test('every piece in place: ready', () => {
    assert.equal(last({ ready: true, ran: true, pieces: [{ ...linger, state: 'met' }] }), 'ready');
  });
});
