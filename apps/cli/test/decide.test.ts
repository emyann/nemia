/**
 * `nemia decide`, a verb of the client's own, on a stub server that answers `GET /api/health` and `GET /api/runs/:runId/decision` as the
 * api does (`objects`' `RunDecision`): the screen printed off the read, the commands numbered; at a terminal the one picked run as the
 * client runs that verb, its placeholder asked first, a `git` one printed and never run; off a terminal nothing run. `--local` and
 * `--sensitive <globs>` sent as the read's `?sensitive=`, and refused with no glob or given twice, exit 2, before any read.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { scratch } from 'test-kit/scratch';
import { decide, type DecideIo } from '../src/objects/decide.ts';
import { Refused } from '../src/refused.ts';

const used = {
  usage: null,
  used: '12 responses',
  cost: '$0.40',
  costUsd: 0.4,
  apiMs: null,
  toolMs: null,
  read: null,
  peak: null,
  rebuilt: 0,
};

/** What the stub answers for each run: one with something to decide, one waiting on another. */
const DECISIONS: Record<string, unknown> = {
  'r-1': {
    standings: [
      { branch: 'wf/r-1/plan', where: 'ahead', commits: 2, said: 'ahead of main by 2 commits', stat: '3 files: +14 −1', merge: null },
    ],
    touched: [
      {
        branch: 'wf/r-1/plan',
        radius: {
          changes: [{ path: 'src/a.ts', added: 14, removed: 1 }],
          groups: [{ name: 'src', files: 1, added: 14, removed: 1, binary: 0 }],
          agentFacing: [],
          checkAffecting: ['package.json'],
          lessons: [],
        },
      },
    ],
    lesson: { said: 'the run wrote nothing where the next agent reads', state: 'nothing' },
    sensitive: [{ branch: 'wf/r-1/plan', files: [{ path: 'package.json', lines: ['+  "x": 1'], cut: 0 }], error: null }],
    used: { plan: used },
    total: used,
    cost: '$0.40',
    overBudget: null,
    commands: [
      { label: 'approve', command: 'nemia approve r-1 plan', said: 'lets what follows be filed', step: 'plan' },
      { label: 'send back', command: 'nemia retry r-1 plan --message "<objection>"', said: null, step: 'plan' },
      { label: 'land it', command: 'git -C /repo merge --no-ff wf/r-1/plan', said: null, step: null },
    ],
    awaiting: { branches: ['wf/r-1/plan'], direct: false },
    collisions: null,
  },
  'r-2': {
    waiting: {
      runs: [{ run: 'r-1', missing: false, cancelledAt: null, gone: [] }],
      word: 'waiting on r-1',
      advice: 'nothing to decide yet',
      waitingOnYou: false,
    },
  },
};

/** The paths the stub was asked, in order. */
const asked: string[] = [];
const stub = http.createServer((req, res) => {
  asked.push(req.url ?? '');
  const id = /^\/api\/runs\/([^/?]+)\/decision(?:\?.*)?$/.exec(req.url ?? '')?.[1];
  const body = req.url === '/api/health' ? { ok: true } : id !== undefined ? DECISIONS[id] : undefined;
  res.writeHead(body === undefined ? 404 : 200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body ?? { error: `no run ${id}: list the runs with nemia ls` }));
});
await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
after(() => {
  stub.closeAllConnections();
  stub.close();
});

const root = path.join(scratch('nemia-decide-'), 'store');
fs.mkdirSync(root, { recursive: true });
fs.writeFileSync(path.join(root, 'daemon.json'), JSON.stringify({ url: `http://127.0.0.1:${(stub.address() as AddressInfo).port}` }));
process.env.WF_ROOT = root;
process.env.NEMIA_DAEMON_START = 'off';
delete process.env.WF_SESSION_TOKEN;

/** An io whose output is kept, its input the lines given, and every command run recorded. */
function ioOf(interactive: boolean, lines: readonly string[] = []) {
  const input = new PassThrough();
  input.end(lines.map((line) => `${line}\n`).join(''));
  const output = new PassThrough();
  let said = '';
  output.on('data', (chunk) => (said += chunk));
  const ran: (readonly string[])[] = [];
  const io: DecideIo = {
    input,
    output,
    interactive,
    run: async (argv) => {
      ran.push(argv);
      return 0;
    },
  };
  return { io, ran, said: () => said };
}

test('off a terminal, the screen of the decision is printed off the api read, its commands numbered, and nothing is run', async () => {
  const { io, ran, said } = ioOf(false);
  assert.equal(await decide(['r-1'], io.run, io), 0);
  assert.ok(asked.includes('/api/runs/r-1/decision'), 'it read the decision of the api');
  const out = said();
  assert.match(out, /^r-1$/m);
  assert.match(out, /touched {2}wf\/r-1\/plan: 1 file/);
  assert.match(out, /check-affecting: package\.json/);
  assert.match(out, /lesson {2}the run wrote nothing where the next agent reads/);
  assert.match(out, /in full {2}wf\/r-1\/plan: package\.json/);
  assert.match(out, /wf\/r-1\/plan {2}ahead of main by 2 commits {2}3 files: \+14 −1/);
  assert.match(out, /^ {2}1\. approve: nemia approve r-1 plan/m);
  assert.match(out, /^ {2}3\. land it: git -C \/repo merge --no-ff wf\/r-1\/plan/m);
  assert.deepEqual(ran, []);
});

test('at a terminal, the command picked runs as the client runs that verb, its placeholder asked first', async () => {
  const { io, ran } = ioOf(true, ['2', 'too broad']);
  assert.equal(await decide(['r-1'], io.run, io), 0);
  assert.deepEqual(ran, [['retry', 'r-1', 'plan', '--message', 'too broad']]);
});

test('at a terminal, a git command picked is printed for the person and never run; Enter runs none', async () => {
  const git = ioOf(true, ['3']);
  assert.equal(await decide(['r-1'], git.io.run, git.io), 0);
  assert.deepEqual(git.ran, []);
  assert.match(git.said(), /yours to type: git -C \/repo merge/);
  const none = ioOf(true, ['']);
  assert.equal(await decide(['r-1'], none.io.run, none.io), 0);
  assert.deepEqual(none.ran, []);
});

test('a run waiting on another says what it waits on, and offers nothing', async () => {
  const { io, ran, said } = ioOf(true, ['1']);
  assert.equal(await decide(['r-2'], io.run, io), 0);
  assert.match(said(), /waiting on r-1/);
  assert.match(said(), /nothing to decide yet/);
  assert.deepEqual(ran, []);
});

test("--sensitive <globs> is sent as the read's ?sensitive=, as typed", async () => {
  const { io } = ioOf(false);
  assert.equal(await decide(['r-1', '--sensitive', 'src/**,*.json'], io.run, io), 0);
  const read = [...asked].reverse().find((url) => url.startsWith('/api/runs/r-1/decision'));
  assert.equal(new URL(read ?? '', 'http://x').searchParams.get('sensitive'), 'src/**,*.json');
});

test('REFUSED: --local, --sensitive with no glob or twice, no run and an unknown run, each exit 2; all but the last before any read', async () => {
  const before = asked.length;
  for (const args of [['r-1', '--local'], ['r-1', '--sensitive'], ['r-1', '--sensitive', 'a', '--sensitive=b'], []]) {
    const { io } = ioOf(false);
    await assert.rejects(decide(args, io.run, io), (err: unknown) => err instanceof Refused && err.code === 2, args.join(' '));
  }
  assert.equal(asked.length, before, 'refused before any read');
  const { io } = ioOf(false);
  await assert.rejects(decide(['r-9'], io.run, io), (err: unknown) => {
    assert.ok(err instanceof Refused, String(err));
    assert.equal(err.code, 2);
    assert.match(err.message, /nemia ls/, "the api's words, naming the command");
    return true;
  });
});
