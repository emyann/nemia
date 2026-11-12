/**
 * `nemia server upgrade [<tag> | --back]`, against a stand-in of the api's upgrade routes under a remote context: the release asked for
 * is posted (`POST /api/upgrades`), its output followed to its end and printed once, through a stream that closes while the daemon
 * restarts and resends from its first byte when opened again; the exit is the upgrade's phase's, the api's refusals keep their codes, a
 * server that serves no upgrade is refused naming the command on its own machine, and a client of another release than the server is let
 * through and told after a success to bring this machine level. Its words are nobody's to check: a test asserts the code and the
 * command named.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import type { Said } from './served.ts';
import { configWritten } from '../src/context.ts';
import { server as serverVerb } from '../src/server/upgrade.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');

/** An SSE block. */
const sse = (event: string, data: string): string =>
  `event: ${event}\n${data
    .split('\n')
    .map((l) => `data: ${l}`)
    .join('\n')}\n\n`;

/**
 * A stand-in's state: the release its health says, its newest read, the previous release, what was posted, how often each stream
 * opened.
 */
type Stand = {
  release: string;
  latest: { version: string; newer: boolean; tag?: string } | undefined;
  previous: { tag: string; refused?: string } | null;
  posted: string[];
  opens: Map<string, number>;
};

/** The upgrade of `tag`, at `phase`. */
const upgradeOf = (tag: string, phase: string, exitCode?: number) => ({
  id: `up-${tag}`,
  tag,
  from: 'v1.0.0',
  phase,
  output: '',
  startedAt: '2026-11-12T00:00:00.000Z',
  ...(exitCode === undefined ? {} : { exitCode }),
});

/** The chunks a succeeding upgrade to `tag` prints: the daemon stopped, then the new release's own lines, its readiness among them. */
const chunksOf = (tag: string): readonly string[] => ['stopping the daemon\n', `now ${tag}\nreadiness: claude-token met\n`];

/** The output stream of `tag`'s upgrade, opened for the `open`th time: what each tag's stream does. */
function streamOf(stand: Stand, tag: string, open: number, res: http.ServerResponse): void {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  if (tag === 'v4.0.0') return void res.end();
  const [first = '', rest = ''] = chunksOf(tag);
  res.write(sse('output', first));
  if (tag === 'v2.1.0' && open === 1) return void res.end();
  if (tag === 'v3.0.0') {
    res.write(sse('output', 'refused: see /srv/nemia/upgrade.log\n'));
    return void res.end(sse('ended', JSON.stringify(upgradeOf(tag, 'failed', 3))));
  }
  stand.release = tag;
  res.write(sse('output', rest));
  res.end(sse('ended', JSON.stringify(upgradeOf(tag, 'succeeded', 0))));
}

/** A stand-in of the api's upgrade routes, its routes answering from `stand`; where `upgrades` is false it serves no `/api/upgrades`. */
function standIn(stand: Stand, upgrades = true): http.Server {
  return http.createServer((req, res) => {
    let text = '';
    req.on('data', (chunk) => (text += chunk));
    req.on('end', () => {
      const url = new URL(req.url ?? '/', 'http://stand').pathname;
      const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (url === '/api/health') return json(200, { ok: true, release: stand.release });
      if (url === '/api/version')
        return json(200, {
          version: stand.release.slice(1),
          release: { kind: 'install', root: '/srv/nemia', tag: stand.release },
          ...(stand.latest === undefined ? {} : { latest: stand.latest }),
        });
      if (!upgrades) return json(404, {});
      if (url === '/api/upgrades' && req.method === 'POST') {
        const { tag } = JSON.parse(text) as { tag: string };
        stand.posted.push(tag);
        if (tag === 'v-conflict') return json(409, { error: 'an upgrade is already running' });
        if (tag === 'v-forbidden') return json(403, { error: 'a session may not upgrade the server' });
        return json(200, upgradeOf(tag, 'pending'));
      }
      if (url === '/api/upgrades') return json(200, { previous: stand.previous, last: null });
      const output = /^\/api\/upgrades\/up-([^/]+)\/output$/.exec(url);
      if (output?.[1] !== undefined) {
        const open = (stand.opens.get(output[1]) ?? 0) + 1;
        stand.opens.set(output[1], open);
        return streamOf(stand, output[1], open, res);
      }
      const one = /^\/api\/upgrades\/up-([^/]+)$/.exec(url);
      if (one?.[1] !== undefined) return json(200, upgradeOf(one[1], 'running'));
      return json(404, {});
    });
  });
}

const servers: http.Server[] = [];
after(() => {
  for (const s of servers) {
    s.closeAllConnections();
    s.close();
  }
});

/** A stand-in started on a free port, `stand` its state; answers its url. */
async function started(stand: Stand, upgrades = true): Promise<string> {
  const s = standIn(stand, upgrades);
  servers.push(s);
  await new Promise<void>((resolve) => s.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

/** A stand-in's fresh state: v1.0.0, v2.0.0 newer, v0.9.0 to go back to. */
const freshStand = (more: Partial<Stand> = {}): Stand => ({
  release: 'v1.0.0',
  latest: { version: '2.0.0', newer: true, tag: 'v2.0.0' },
  previous: { tag: 'v0.9.0' },
  posted: [],
  opens: new Map(),
  ...more,
});

/** A laptop whose context in use is the server at `at`. */
function aLaptop(prefix: string, at: string): NodeJS.ProcessEnv {
  const folder = scratch(prefix);
  const env = {
    ...ambient(),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    WF_ROOT: path.join(folder, 'store'),
    NEMIA_DAEMON_START: 'off',
  };
  configWritten({ contexts: [{ name: 'vps', server: at, token: 'tok' }], current: 'vps' }, env);
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

/** `nemia server <args>` run in this process as a client of release `client`, its follow bounded by `backWithinMs`. */
async function inProcess(args: readonly string[], env: NodeJS.ProcessEnv, client: string | null, backWithinMs = 5_000) {
  let out = '';
  let err = '';
  const code = await serverVerb(args, env, { client, speak: { out: (t) => void (out += t), err: (t) => void (err += t) }, backWithinMs });
  return { code, out, err };
}

test('`nemia server upgrade v2.0.0` posts the tag, prints every chunk of its output once, exits 0 and says the release the server now runs', async () => {
  const stand = freshStand();
  const said = await nemia(['server', 'upgrade', 'v2.0.0'], aLaptop('nemia-su-ok-', await started(stand)));
  assert.equal(said.code, 0, said.err);
  assert.deepEqual(stand.posted, ['v2.0.0']);
  assert.equal(said.out, chunksOf('v2.0.0').join(''), 'the output, with the readiness lines it holds, each chunk once');
  assert.match(said.err, /v2\.0\.0/, 'the release the health says');
});

test('a stream that closes while the daemon restarts is opened again, the output it resends printed once', async () => {
  const stand = freshStand();
  const said = await nemia(['server', 'upgrade', 'v2.1.0'], aLaptop('nemia-su-restart-', await started(stand)));
  assert.equal(said.code, 0, said.err);
  assert.equal(stand.opens.get('v2.1.0'), 2, 'opened again once it closed');
  assert.equal(said.out, chunksOf('v2.1.0').join(''), 'the first chunk printed once');
});

test('an upgrade that failed exits 1, its output, naming its log, on stdout', async () => {
  const said = await nemia(['server', 'upgrade', 'v3.0.0'], aLaptop('nemia-su-failed-', await started(freshStand())));
  assert.equal(said.code, 1, said.err);
  assert.match(said.out, /\/srv\/nemia\/upgrade\.log/);
});

test("REFUSED: the api's refusals keep their codes: a conflict exits 1, a forbidden start 2", async () => {
  const env = aLaptop('nemia-su-refused-', await started(freshStand()));
  assert.equal((await nemia(['server', 'upgrade', 'v-conflict'], env)).code, 1);
  assert.equal((await nemia(['server', 'upgrade', 'v-forbidden'], env)).code, 2);
});

test('`--back` posts the release the server names as previous; refused, exit 2 naming a command, with none older, past the floor, or with a tag', async () => {
  const stand = freshStand({ previous: { tag: 'v0.9.0' } });
  const env = aLaptop('nemia-su-back-', await started(stand));
  const back = await nemia(['server', 'upgrade', '--back'], env);
  assert.equal(back.code, 0, back.err);
  assert.deepEqual(stand.posted, ['v0.9.0']);
  for (const [previous, argv] of [
    [null, ['--back']],
    [{ tag: 'v0.9.0', refused: 'the store was run by v1.0.0' }, ['--back']],
    [{ tag: 'v0.9.0' }, ['--back', 'v1']],
  ] as const) {
    stand.previous = previous;
    const said = await nemia(['server', 'upgrade', ...argv], env);
    assert.equal(said.code, 2, `${JSON.stringify(previous)} ${argv.join(' ')}: ${said.err}`);
    assert.match(said.err, /`nemia server upgrade/, 'a command named');
  }
  assert.deepEqual(stand.posted, ['v0.9.0'], 'nothing more posted');
});

test('a bare `nemia server upgrade` asks for the newer release; on the newest exits 0 posting nothing; with none read, refused naming a command', async () => {
  const stand = freshStand({ latest: { version: '1.0.0', newer: false, tag: 'v1.0.0' } });
  const env = aLaptop('nemia-su-bare-', await started(stand));
  assert.equal((await nemia(['server', 'upgrade'], env)).code, 0);
  assert.deepEqual(stand.posted, [], 'nothing to do');
  stand.latest = undefined;
  const unknown = await nemia(['server', 'upgrade'], env);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /`nemia server upgrade <tag>`/);
  stand.latest = { version: '2.0.0', newer: true, tag: 'v2.0.0' };
  assert.equal((await nemia(['server', 'upgrade'], env)).code, 0);
  assert.deepEqual(stand.posted, ['v2.0.0']);
});

test('a client of another release than the server is let through, and after a success told to bring this machine level, naming `nemia upgrade <tag>`', async () => {
  const stand = freshStand({ release: 'v1.5.0' });
  const said = await inProcess(['upgrade', 'v2.0.0'], aLaptop('nemia-su-across-', await started(stand)), 'v1.0.0');
  assert.equal(said.code, 0, said.err);
  assert.deepEqual(stand.posted, ['v2.0.0'], 'the start was made across two releases');
  assert.match(said.err, /`nemia upgrade v2\.0\.0`/);
  const level = await inProcess(['upgrade', 'v2.0.0'], aLaptop('nemia-su-level-', await started(freshStand())), 'v2.0.0');
  assert.doesNotMatch(level.err, /`nemia upgrade /, 'a client level with the server is told nothing');
});

test('a server that never says its upgrade ended within the bound: exit 1, naming where to read it', async () => {
  const said = await inProcess(['upgrade', 'v4.0.0'], aLaptop('nemia-su-bound-', await started(freshStand())), null, 300);
  assert.equal(said.code, 1, said.err);
  assert.match(said.err, /`nemia doctor`/);
});

test('REFUSED: a server older than the upgrade through its api, which serves no /api/upgrades, exit 2 naming `nemia upgrade <tag>`', async () => {
  const stand = freshStand();
  const said = await nemia(['server', 'upgrade', 'v2.0.0'], aLaptop('nemia-su-old-', await started(stand, false)));
  assert.equal(said.code, 2, said.err);
  assert.match(said.err, /`nemia upgrade <tag>`/);
  assert.deepEqual(stand.posted, []);
});

test('`nemia server --help` prints the usage, which keeps `nemia service` apart; with no subcommand, or another, a usage refusal', async () => {
  const env = aLaptop('nemia-su-help-', 'http://127.0.0.1:9');
  const help = await nemia(['server', '--help'], env);
  assert.equal(help.code, 0, help.err);
  assert.match(help.out, /nemia server upgrade/);
  assert.match(help.out, /nemia service/);
  for (const argv of [['server'], ['server', 'reboot'], ['server', 'upgrade', '--force']]) {
    const said = await nemia(argv, env);
    assert.equal(said.code, 2, `${argv.join(' ')}: ${said.err}`);
    assert.match(said.err, /nemia server upgrade/, 'the usage named');
  }
});
