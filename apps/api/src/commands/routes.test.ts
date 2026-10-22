/**
 * The routes generated from the package's command table: a command asked on its route writes what the same entry writes asked as `nemia`
 * parses it, every route that writes is guarded, a key another command takes on the api alone is refused, and the table asks the api for
 * nothing it lacks — words for each routed command, and an extension for each key a command takes on the api alone — and serves each route.
 *
 * At shipped defaults: the api's own engine over the harness's scratch store (`root`), which this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { app } from '../app.ts';
import { approvalFile, COMMANDS, engine, parseArgv, routeList, triesDir } from 'agent-orchestrator';
import { runWith } from '../../test/placed.ts';
import { extensionBreaks } from './extend.ts';
import { wordBreaks } from './routes.ts';

const T0 = Date.parse('2026-10-02T09:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const jsonl = (lines: object[]) => lines.map((line) => `${JSON.stringify(line)}\n`).join('');
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** A step's task that ran once on Codex and signed off with `closeout`. */
const signedOff = (taskId: string, closeout: object) =>
  write(
    path.join(root, 'engine', 'tasks', `${taskId}.jsonl`),
    jsonl([
      { kind: 'filed', at: at(0), brief: 'Do it.', cwd: '/code/app', maxAttempts: 1, harness: 'codex' },
      { kind: 'starting', at: at(1), attempt: 1 },
      { kind: 'spawned', at: at(1), attempt: 1 },
      { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout },
      { kind: 'settled', at: at(9), outcome: 'succeeded' },
    ]),
  );

const DONE = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };
const AGAIN = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };

/** A run's record, with what every run here shares. */
const runRecord = (id: string, workflow: object[], steps: object, more: object = {}) =>
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Parse the --flag option',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: at(0),
      workflow,
      steps,
      ...more,
    }),
  );

/** A run of `plan → implement`, started `--gate plan`, whose plan signed off: it waits at its gate. */
const gatedRun = (id: string) => {
  runRecord(
    id,
    [
      { name: 'plan', after: [], body: 'Plan it.' },
      { name: 'implement', after: ['plan'], body: 'Implement it.' },
    ],
    { plan: { taskId: `${id}-plan`, branch: `wf/${id}/plan` }, implement: { taskId: null } },
    { gates: ['plan'] },
  );
  signedOff(`${id}-plan`, DONE);
};

/** A run of `implement ⇄ review`, `rounds: 1`, whose review asked for another round: its loop is out of rounds. */
const loopingRun = (id: string) => {
  runRecord(
    id,
    [
      { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' },
      {
        name: 'review',
        after: ['implement'],
        body: 'Review it.',
        harness: 'codex',
        loop: 'implement',
        rounds: 1,
        output: { file: 'review.json', schema: AGAIN },
      },
    ],
    {
      implement: { taskId: `${id}-implement-1`, branch: `wf/${id}/implement` },
      review: { taskId: `${id}-review-1`, branch: `wf/${id}/implement` },
    },
  );
  signedOff(`${id}-implement-1`, DONE);
  signedOff(`${id}-review-1`, { ...DONE, again: true });
};

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};

const post = (url: string, body: unknown, headers: Record<string, string> = BOARD) =>
  app.request(url, { method: 'POST', headers, body: JSON.stringify(body) });

/** The entry of the table named `name`. */
const entry = (name: string) => COMMANDS.find((c) => c.name === name)!;

/** What the entry `name` answers asked as `nemia` parses `argv`: its check passed, its handler's data. */
async function asTyped(name: string, argv: string[]) {
  const command = entry(name);
  const args = parseArgv(command.spec, argv);
  assert.ok(args, `nemia ${name} ${argv.join(' ')} is given enough`);
  assert.equal(command.check?.(args) ?? null, null, `nemia ${name} ${argv.join(' ')} passes its check`);
  return runWith(engine(), command.handler(args));
}

/** Every file under a run's asks directory, waiting or consumed. */
const asked = (run: string): string[] => {
  const dir = path.join(root, 'runs', `${run}.asks`);
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).sort() : [];
};

/** A file the run wrote, its words but when. */
const written = (file: string): unknown => {
  const { at: _when, ...rest } = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  return rest;
};

test('an approval on its route writes what `nemia approve` writes: the same try, file and words, and answers what the board reads', async () => {
  gatedRun('r-cli-gate');
  gatedRun('r-api-gate');
  const typed = await asTyped('approve', ['r-cli-gate', 'plan', '--message', 'Go.']);
  const res = await post('/api/runs/r-api-gate/steps/plan/approve', { message: 'Go.' });
  assert.equal(res.status, 202);
  const answered = (await res.json()) as { try: number; at: string; message: string; file: string };
  assert.deepEqual(Object.keys(answered).sort(), ['at', 'file', 'message', 'try']);
  assert.equal(answered.try, typed.try);
  assert.equal(answered.file, approvalFile('r-api-gate', 'plan', 1));
  assert.equal(typed.file, approvalFile('r-cli-gate', 'plan', 1));
  assert.deepEqual(written(answered.file), written(String(typed.file)));
  assert.deepEqual(asked('r-api-gate'), asked('r-cli-gate'));
});

test('a round on its route writes what `nemia round` writes: the same step, round and file', async () => {
  loopingRun('r-cli-loop');
  loopingRun('r-api-loop');
  const typed = await asTyped('round', ['r-cli-loop']);
  const res = await post('/api/runs/r-api-loop/round', {});
  assert.equal(res.status, 202);
  const answered = (await res.json()) as { step: string; round: number; file: string };
  assert.deepEqual(Object.keys(answered).sort(), ['file', 'round', 'step']);
  assert.deepEqual([answered.step, answered.round], [typed.step, typed.round]);
  assert.equal(answered.file, String(typed.file).replace('r-cli-loop', 'r-api-loop'));
  assert.deepEqual(written(answered.file), written(String(typed.file)));
  assert.deepEqual(asked('r-api-loop'), asked('r-cli-loop'));
});

test('REFUSED on its route: a merge of a run whose result step closes no loop — a 409 naming `nemia retry`, as `nemia merge` says it, and no ask', async () => {
  gatedRun('r-cli-noloop');
  gatedRun('r-api-noloop');
  const typed = await asTyped('merge', ['r-cli-noloop']).then(
    () => assert.fail('nemia merge is refused'),
    (err: Error) => err.message,
  );
  const res = await post('/api/runs/r-api-noloop/merge', {});
  assert.equal(res.status, 409);
  const said = ((await res.json()) as { error: string }).error;
  assert.equal(said, typed.replaceAll('r-cli-noloop', 'r-api-noloop'));
  assert.match(said, /implement closes no loop[^]*nemia retry r-api-noloop implement --message/);
  assert.deepEqual([asked('r-api-noloop'), asked('r-cli-noloop')], [[], []]);
});

/**
 * The three branches `refusedBeforeReading` (src/guard.ts) refuses a write on, each a header the board would never send: the words of
 * each route's own refusal are the package's and nobody's to check (root CLAUDE.md), so the walk reads the status and that the route
 * names itself. `src/guard.test.ts` reads the near misses of each header.
 */
const GUARD_LEGS = [
  ['a page on another site', { 'sec-fetch-site': 'cross-site' }, 403],
  ['a name that is not this machine', { host: 'evil.example:8787' }, 403],
  ['a body not sent as JSON', { 'content-type': 'text/plain' }, 415],
] as const;

test('REFUSED at shipped defaults: every route that writes, asked by a page on another site (403), addressed to another name (403), or not sent as JSON (415) — nothing written', async () => {
  gatedRun('r-guard');
  const routed = COMMANDS.filter((c) => c.writes).flatMap((c) =>
    routeList(c)
      .filter((r) => r.method !== 'GET')
      .map((r) => ({ command: c, r })),
  );
  assert.deepEqual(
    routed.map(({ command, r }) => `${command.name} ${r.method}`),
    [
      'start POST',
      'inbox add POST',
      'inbox queue POST',
      'inbox queue DELETE',
      'inbox from PUT',
      'inbox from DELETE',
      'inbox rm DELETE',
      'factory hire PUT',
      'factory fire DELETE',
      'factory schedule PUT',
      'factory unschedule DELETE',
      'factory server add PUT',
      'factory server rm DELETE',
      'factory rules PUT',
      'factory rules DELETE',
      'factory instruction PUT',
      'factory instruction DELETE',
      'factory instruct PUT',
      'factory instruct DELETE',
      'retry POST',
      'approve POST',
      'round POST',
      'refresh POST',
      'accept POST',
      'merge POST',
      'say POST',
      'agents custom PUT',
      'agents custom DELETE',
      'agents write POST',
      'agents write PUT',
      'agents copy POST',
      'agents remove DELETE',
      'agents try POST',
      'skills write POST',
      'skills write PUT',
      'hold POST',
      'hold DELETE',
      'rm DELETE',
      'prune POST',
      'pause POST',
      'resume DELETE',
      'subscribe POST',
      'unsubscribe DELETE',
      'level PUT',
      'auto confirm PUT',
      'auto drop DELETE',
      'workflows write POST',
      'workflows write PUT',
      'workflows remove DELETE',
    ],
  );
  for (const { command, r } of routed) {
    const { method, path: route } = r;
    const url = route.replace(':runId', 'r-guard').replace(':step', 'plan').replace(':name', 'g-guard').replace(':from', 'yours');
    const body = JSON.stringify({ mode: 'nudge', message: 'Go.', text: 'Go.' });
    for (const [what, headers, status] of GUARD_LEGS) {
      const said = `${command.name} ${method}: ${what}`;
      const res = await app.request(url, { method, headers: { ...BOARD, ...headers }, body });
      assert.equal(res.status, status, said);
      assert.match(((await res.json()) as { error: string }).error, new RegExp(`^${method} ${url.replaceAll('/', '\\/')} `), said);
    }
  }
  assert.ok(fs.existsSync(path.join(root, 'runs', 'r-guard.json')), 'the run neither removed nor pruned');
  assert.deepEqual(asked('r-guard'), [], 'nothing written');
  assert.equal(fs.existsSync(path.join(root, 'cordon')), false, 'the store not paused');
  assert.equal(fs.existsSync(path.join(root, 'workflows', 'g-guard')), false, 'no workflow written');
  assert.equal(fs.existsSync(path.join(root, 'subscriptions')), false, 'no subscription written');
  assert.equal(fs.existsSync(path.join(root, 'nemia', 'level.json')), false, "no Nemia's level written");
  assert.equal(fs.existsSync(path.join(root, 'workflows', 'agents')), false, 'no agent written');
  assert.equal(fs.existsSync(path.join(root, 'workflows', 'skills')), false, 'no skill written');
  assert.equal(fs.existsSync(path.join(root, 'agent-sources')), false, 'no copy recorded');
  assert.deepEqual(
    fs.readdirSync(path.join(root, 'runs')).filter((f) => !f.startsWith('r-')),
    [],
    'no run started',
  );
});

test('a lift on its route reads no body: what its route fixes lifts the hold, whatever the body says, and the hold file is gone', async () => {
  for (const [id, body] of [
    ['r-lift-off', JSON.stringify({ off: false, until: ['r-other'] })],
    ['r-lift-bare', 'not json'],
  ]) {
    gatedRun(id);
    const held = path.join(root, 'runs', `${id}.hold`);
    write(held, JSON.stringify({ at: at(0), until: ['r-other'] }));
    const res = await app.request(`/api/runs/${id}/hold`, { method: 'DELETE', headers: BOARD, body });
    assert.equal(res.status, 200, `${id}: ${await res.clone().text()}`);
    assert.deepEqual(await res.json(), { id, lifted: true, hold: { at: at(0), until: ['r-other'] } });
    assert.equal(fs.existsSync(held), false, id);
  }
});

test('REFUSED at shipped defaults: `answers` sent to a round, which takes none on the api — 422 naming the key and the routes that take it, nothing written', async () => {
  loopingRun('r-foreign');
  const res = await post('/api/runs/r-foreign/round', {
    budget: 5,
    answers: [{ question: 'Which?', chose: ['A'] }],
  });
  assert.equal(res.status, 422);
  assert.equal(
    ((await res.json()) as { error: string }).error,
    '`answers` is not a key POST …/round takes — POST …/retry, POST …/approve take it — so it would go nowhere: `{ "step"?: "<looping step>", "budget"?: <amount> }`.',
  );
  assert.deepEqual(asked('r-foreign'), [], 'nothing written');
});

test('the table asks the api for nothing it lacks: words for each routed command, an extension for each key taken on the api alone', () => {
  assert.deepEqual(wordBreaks(COMMANDS), []);
  assert.deepEqual(extensionBreaks(COMMANDS), []);
});

test('every command the table routes is served by the api on its method and path: the posts the table generates, and the reads the api answers', () => {
  const served = new Set(app.routes.map((r) => `${r.method} ${r.path}`));
  assert.deepEqual(
    COMMANDS.flatMap((c) =>
      routeList(c)
        .filter((r) => !served.has(`${r.method} ${r.path}`))
        .map((r) => `${c.name} ${r.method}`),
    ),
    [],
  );
});

test('REFUSED: a routed command the api has no words for, and a key taken on the api alone that no extension folds', () => {
  const route = { method: 'POST', path: '/api/runs/:runId/sing', status: 202 } as const;
  assert.deepEqual(wordBreaks([{ name: 'sing', route }]), [
    'sing is routed on the api, and words.ts has no words for it: give it its guard, its shape and its refusals there',
  ]);
  assert.deepEqual(wordBreaks([{ name: 'hush', route: { method: 'DELETE', path: '/api/runs/:runId/song', status: 200 } }]), [
    'hush is routed on the api, and words.ts has no words for it: give it its guard, its shape and its refusals there',
  ]);
  assert.deepEqual(wordBreaks([{ name: 'sing' }]), [], 'a command served on the command line alone needs no words');
  assert.deepEqual(extensionBreaks([{ name: 'accept', apiTakes: ['answers'] }]), [
    'accept takes `answers` on the api, and extend.ts folds none: give accept an extension that takes it, or drop it',
  ]);
  assert.deepEqual(extensionBreaks([{ name: 'retry', apiTakes: ['notes'] }]), [
    'retry takes `notes` on the api, and extend.ts folds none: give retry an extension that takes it, or drop it',
  ]);
});

/** A removal on the board, as its run page sends it. */
const remove = (id: string) => app.request(`/api/runs/${id}`, { method: 'DELETE', headers: BOARD, body: '{}' });

test('REFUSED at shipped defaults: a run that is no try, removed on the board — a 409 naming `nemia rm`, in its words whole, and the record kept', async () => {
  gatedRun('r-no-try');
  const res = await remove('r-no-try');
  assert.equal(res.status, 409);
  assert.equal(
    ((await res.json()) as { error: string }).error,
    `DELETE /api/runs/r-no-try: the board removes only a try, a run started from an agent's page, and r-no-try is a run of ${path.join(root, 'no-such-workflow')}. Remove it with \`nemia rm r-no-try\`, which says what it hands off and what it leaves.`,
  );
  assert.ok(fs.existsSync(path.join(root, 'runs', 'r-no-try.json')), 'the record is kept');
});

test("REFUSED at shipped defaults: a try whose worktree git will not remove — locked — is a 409 in `nemia rm`'s line whole, and its record kept", async () => {
  const id = 'r-held-try';
  const repo = fs.mkdtempSync(path.join(root, 'repo-'));
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      {
        cwd: repo,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const worktree = path.join(root, 'worktrees', id, 'implement');
  git('worktree', 'add', '-q', '-b', `wf/${id}/implement`, worktree);
  git('worktree', 'lock', '--reason', 'a person holds it', worktree);
  signedOff(`${id}-implement`, DONE);
  runRecord(
    id,
    [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }],
    { implement: { taskId: `${id}-implement`, workspace: worktree, branch: `wf/${id}/implement`, handedOff: `${id}-implement` } },
    { repo, workspace: repo, baseRef: git('rev-parse', 'HEAD').trim(), workflowDir: path.join(triesDir(root), 'scribe') },
  );
  const res = await remove(id);
  assert.equal(res.status, 409);
  assert.equal(
    ((await res.json()) as { error: string }).error,
    `${id}  not forgotten: ${worktree} is locked (a person holds it), and git will not remove it — unlock it if nothing needs it: git -C ${repo} worktree unlock ${worktree}. Its record, files and branches are kept until every worktree is gone: nemia rm ${id} again then.`,
  );
  assert.ok(fs.existsSync(path.join(root, 'runs', `${id}.json`)), 'the record is kept');
  assert.ok(fs.existsSync(worktree), 'and the worktree');
});

/** A git repository at `repo` with one commit on `main`; git with a fixed identity and no hook or signing, in it. */
function aGitRepo(repo: string) {
  const git = (...args: string[]) =>
    execFileSync(
      'git',
      ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
      { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  git('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  return git;
}

/** A try of one step, `implement`, signed off and handed off, on `repo`: with its clean worktree on its branch when `repo` is git's. */
function aGitTry(id: string, repo: string, git?: ReturnType<typeof aGitRepo>): string {
  const worktree = path.join(root, 'worktrees', id, 'implement');
  if (git) git('worktree', 'add', '-q', '-b', `wf/${id}/implement`, worktree);
  signedOff(`${id}-implement`, DONE);
  runRecord(
    id,
    [{ name: 'implement', after: [], body: 'Implement it.', harness: 'codex' }],
    { implement: { taskId: `${id}-implement`, workspace: worktree, branch: `wf/${id}/implement`, handedOff: `${id}-implement` } },
    { repo, workspace: repo, baseRef: git ? git('rev-parse', 'HEAD') : 'abc123', workflowDir: path.join(triesDir(root), 'scribe') },
  );
  return worktree;
}

/** What `nemia rm <id>` answers for one run, as the CLI asks the entry once for each run it is given. */
function rmTyped(id: string) {
  const command = entry('rm');
  const args = parseArgv(command.spec, [id]);
  assert.ok(args && command.check?.(args) == null, `nemia rm ${id} passes its check`);
  return runWith(engine(), command.handler({ ...args, runId: id }));
}

test('a try removed on its route answers what `nemia rm` answers: removed, its worktree gone through its place, its branch kept, and what the engine forgot', async () => {
  const repo = fs.mkdtempSync(path.join(root, 'repo-'));
  const git = aGitRepo(repo);
  const cli = aGitTry('r-cli-rm', repo, git);
  const api = aGitTry('r-api-rm', repo, git);
  const typed = await rmTyped('r-cli-rm');
  const res = await remove('r-api-rm');
  assert.equal(res.status, 200, JSON.stringify(await res.clone().json()));
  const answered = (await res.json()) as Record<string, unknown>;
  assert.deepEqual(
    answered,
    JSON.parse(JSON.stringify({ id: typed.id, removed: typed.removed, engine: typed.engine }).replaceAll('r-cli-rm', 'r-api-rm')),
  );
  assert.equal(answered.removed, true);
  assert.ok(!fs.existsSync(cli) && !fs.existsSync(api), 'both worktrees are gone');
  assert.equal(git('branch', '--list', 'wf/r-*-rm/implement', '--format=%(refname:short)'), 'wf/r-api-rm/implement\nwf/r-cli-rm/implement');
  assert.ok(!fs.existsSync(path.join(root, 'runs', 'r-api-rm.json')) && !fs.existsSync(path.join(root, 'runs', 'r-cli-rm.json')));
});

test("REFUSED at shipped defaults: a try whose repository its place cannot read — no git repository — is a 409 in `nemia rm`'s words, never removed as one with nothing left, and its record kept", async () => {
  const plain = fs.mkdtempSync(path.join(root, 'plain-'));
  aGitTry('r-cli-unread', plain);
  aGitTry('r-api-unread', plain);
  const typed = await rmTyped('r-cli-unread');
  const res = await remove('r-api-unread');
  assert.equal(res.status, 409);
  const said = ((await res.json()) as { error: string }).error;
  assert.equal(said, String((typed.forgot as { refusal?: string }).refusal).replaceAll('r-cli-unread', 'r-api-unread'));
  assert.ok(
    said.startsWith(`its place's inventory of what it left in ${plain} was not heard — `) && /not a git repository/.test(said),
    said,
  );
  assert.ok(said.endsWith('nothing was touched, as nothing says what is there: nemia rm r-api-unread again once the place reads it'), said);
  assert.ok(fs.existsSync(path.join(root, 'runs', 'r-api-unread.json')) && fs.existsSync(path.join(root, 'runs', 'r-cli-unread.json')));
});

test("REFUSED at shipped defaults: a key the route fixes is none of the body's — `yes` sent to a prune is a 400 naming it, and nothing is touched", async () => {
  gatedRun('r-prune-yes');
  const before = fs.readdirSync(path.join(root, 'runs')).sort();
  const res = await post('/api/runs/r-prune-yes/prune', { yes: true });
  assert.equal(res.status, 400);
  assert.equal(
    ((await res.json()) as { error: string }).error,
    'POST …/prune does not take `yes`: it takes `{ "artifacts"?: boolean, "unmerged"?: boolean }`, as `nemia prune` takes --artifacts and --unmerged.',
  );
  assert.deepEqual(fs.readdirSync(path.join(root, 'runs')).sort(), before);
});
