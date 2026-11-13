/**
 * The run's named actions on their endpoints of `objects`' `Api` (objects/runs.ts), each its body decoded and handed to the orchestrator's
 * typed entry: an action asked on its endpoint writes what the same entry writes asked as `nemia` parses it, and refuses as it refuses;
 * then what an endpoint ignores of its body, and the removals the board will not do.
 *
 * At shipped defaults: the api's own engine over the harness's scratch store (`root`), which this file seeds.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { app } from '../app.ts';
import { approvalFile, COMMANDS, engine, parseArgv, RM, triesDir } from 'agent-orchestrator';
import { forgottenOf } from '../objects/forgotten.ts';
import { runWith } from '../../test/builtin-place.ts';

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

/**
 * What the entry `name` answers asked as `nemia` parses `argv`: its check passed, its parsed arguments decoded through its `input` as the
 * CLI decodes them, its handler's data.
 */
async function asTyped(name: string, argv: string[]) {
  const command = entry(name);
  const args = parseArgv(command.spec, argv);
  assert.ok(args, `nemia ${name} ${argv.join(' ')} is given enough`);
  assert.equal(command.check?.(args) ?? null, null, `nemia ${name} ${argv.join(' ')} passes its check`);
  const given = command.input === undefined ? args : (Schema.decodeUnknownSync(command.input)(args) as typeof args);
  return runWith(engine(process.env), command.handler(given));
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

/** A removal on the board, as its run page sends it. */
const remove = (id: string) => app.request(`/api/namespaces/default/runs/${id}`, { method: 'DELETE', headers: BOARD, body: '{}' });

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
  const args = parseArgv(RM.spec, [id]);
  assert.ok(args && RM.check?.(args) == null, `nemia rm ${id} passes its check`);
  return runWith(engine(process.env), RM.handler({ runId: id }));
}

test('an action on its endpoint answers what its `nemia` entry answers: the same file and words written, the same refusal, the same removal', async (t) => {
  await t.test(
    'an approval on its route writes what `nemia approve` writes: the same try, file and words, and answers what the board reads',
    async () => {
      gatedRun('r-cli-gate');
      gatedRun('r-api-gate');
      const typed = await asTyped('approve', ['r-cli-gate', 'plan', '--message', 'Go.']);
      const res = await post('/api/namespaces/default/runs/r-api-gate/steps/plan/approve', { message: 'Go.' });
      assert.equal(res.status, 202);
      const answered = (await res.json()) as { try: number; at: string; message: string; file: string; loop: boolean; next: string };
      assert.deepEqual(Object.keys(answered).sort(), ['at', 'caps', 'file', 'loop', 'message', 'next', 'step', 'try']);
      assert.equal(answered.try, typed.try);
      assert.deepEqual([answered.loop, answered.next], [typed.loop, typed.next], 'what `nemia approve` prints of what is filed next');
      assert.equal(answered.file, approvalFile(root, 'r-api-gate', 'plan', 1));
      assert.equal(typed.file, approvalFile(root, 'r-cli-gate', 'plan', 1));
      assert.deepEqual(written(answered.file), written(String(typed.file)));
      assert.deepEqual(asked('r-api-gate'), asked('r-cli-gate'));
    },
  );

  await t.test(
    'a round, `POST …/steps/:step/retry` with `"round": true`, writes what `nemia retry --round` writes: the same step, round and file',
    async () => {
      loopingRun('r-cli-loop');
      loopingRun('r-api-loop');
      const typed = await asTyped('retry', ['r-cli-loop', '--round']);
      const res = await post('/api/namespaces/default/runs/r-api-loop/steps/review/retry', { mode: 'continue', round: true });
      assert.equal(res.status, 202);
      const answered = (await res.json()) as { step: string; round: number; file: string };
      assert.deepEqual(Object.keys(answered).sort(), ['file', 'round', 'step']);
      assert.deepEqual([answered.step, answered.round], [typed.step, typed.round]);
      assert.equal(answered.file, String(typed.file).replace('r-cli-loop', 'r-api-loop'));
      assert.deepEqual(written(answered.file), written(String(typed.file)));
      assert.deepEqual(asked('r-api-loop'), asked('r-cli-loop'));
    },
  );

  await t.test(
    'an acceptance, `POST …/steps/:step/approve` of a loop out of rounds, writes what `nemia approve` of a loop writes: the same step, try, words and file',
    async () => {
      loopingRun('r-cli-enough');
      loopingRun('r-api-enough');
      const typed = await asTyped('approve', ['r-cli-enough', 'review', '--message', 'Good enough.']);
      const res = await post('/api/namespaces/default/runs/r-api-enough/steps/review/approve', { message: 'Good enough.' });
      assert.equal(res.status, 202);
      const answered = (await res.json()) as { step: string; try: number; message: string; file: string };
      assert.deepEqual([answered.step, answered.try, answered.message], [typed.step, typed.try, typed.message]);
      assert.equal(answered.file, String(typed.file).replace('r-cli-enough', 'r-api-enough'));
      assert.deepEqual(written(answered.file), written(String(typed.file)));
      assert.deepEqual(asked('r-api-enough'), asked('r-cli-enough'));
    },
  );

  await t.test(
    'a merge, `POST …/refresh` with `"base": true`, writes what `nemia refresh --base` writes: the same step, target, base commit and file',
    async () => {
      const repo = fs.mkdtempSync(path.join(root, 'repo-'));
      const git = aGitRepo(repo);
      const base = git('rev-parse', 'HEAD');
      for (const id of ['r-cli-base', 'r-api-base']) {
        git('checkout', '-q', '-b', `wf/${id}/implement`, base);
        fs.writeFileSync(path.join(repo, 'README.md'), `# app, as ${id} has it\n`);
        git('commit', '-q', '-am', id);
      }
      git('checkout', '-q', 'main');
      fs.writeFileSync(path.join(repo, 'README.md'), '# app, as main has it\n');
      git('commit', '-q', '-am', 'main moved');
      for (const id of ['r-cli-base', 'r-api-base']) {
        loopingRun(id);
        signedOff(`${id}-review-1`, { ...DONE, again: false });
        const record = JSON.parse(fs.readFileSync(path.join(root, 'runs', `${id}.json`), 'utf8')) as object;
        write(path.join(root, 'runs', `${id}.json`), JSON.stringify({ ...record, repo, workspace: repo, baseRef: base }));
      }
      const typed = await asTyped('refresh', ['r-cli-base', '--base']);
      const res = await post('/api/namespaces/default/runs/r-api-base/refresh', { base: true });
      assert.equal(res.status, 202, JSON.stringify(await res.clone().json()));
      const answered = (await res.json()) as Record<string, unknown>;
      for (const key of ['step', 'target', 'onto', 'sha', 'round']) assert.deepEqual(answered[key], typed[key], key);
      assert.equal(answered.file, String(typed.file).replace('r-cli-base', 'r-api-base'));
      assert.deepEqual([answered.target, answered.onto, answered.sha], ['implement', 'main', git('rev-parse', 'main')]);
      assert.deepEqual(written(String(answered.file)), written(String(typed.file)));
      assert.deepEqual(asked('r-api-base'), asked('r-cli-base'));
    },
  );

  await t.test(
    'REFUSED on its route: a merge of a run whose result step closes no loop — a 409 naming `nemia retry`, as `nemia refresh --base` says it, and no ask',
    async () => {
      gatedRun('r-cli-noloop');
      gatedRun('r-api-noloop');
      const typed = await asTyped('refresh', ['r-cli-noloop', '--base']).then(
        () => assert.fail('nemia refresh --base is refused'),
        (err: Error) => err.message,
      );
      const res = await post('/api/namespaces/default/runs/r-api-noloop/refresh', { base: true });
      assert.equal(res.status, 409);
      const said = ((await res.json()) as { error: string }).error;
      assert.equal(said, typed.replaceAll('r-cli-noloop', 'r-api-noloop'));
      assert.match(said, /implement closes no loop[^]*nemia retry r-api-noloop implement --message/);
      assert.deepEqual([asked('r-api-noloop'), asked('r-cli-noloop')], [[], []]);
    },
  );

  await t.test(
    'a try removed on its route answers what `nemia rm` answers: removed, its worktree gone through its place, its branch kept, and what the engine forgot',
    async () => {
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
        JSON.parse(
          JSON.stringify({ id: typed.id, removed: typed.removed, engine: typed.engine, ...forgottenOf(typed.forgot) }).replaceAll(
            'r-cli-rm',
            'r-api-rm',
          ),
        ),
      );
      assert.equal(answered.removed, true);
      assert.ok(!fs.existsSync(cli) && !fs.existsSync(api), 'both worktrees are gone');
      assert.equal(
        git('branch', '--list', 'wf/r-*-rm/implement', '--format=%(refname:short)'),
        'wf/r-api-rm/implement\nwf/r-cli-rm/implement',
      );
      assert.ok(!fs.existsSync(path.join(root, 'runs', 'r-api-rm.json')) && !fs.existsSync(path.join(root, 'runs', 'r-cli-rm.json')));
    },
  );

  await t.test(
    "REFUSED at shipped defaults: a try whose repository its place cannot read — no git repository — is a 409 in `nemia rm`'s words, never removed as one with nothing left, and its record kept",
    async () => {
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
      assert.ok(
        said.endsWith('nothing was touched, as nothing says what is there: nemia rm r-api-unread again once the place reads it'),
        said,
      );
      assert.ok(fs.existsSync(path.join(root, 'runs', 'r-api-unread.json')) && fs.existsSync(path.join(root, 'runs', 'r-cli-unread.json')));
    },
  );
});

test('what an action ignores of its body, and the removals the board will not do — each refusal its status and the facts it names, nothing written', async (t) => {
  await t.test(
    'a lift on its route reads no body: what its route fixes lifts the hold, whatever the body says, and the hold file is gone',
    async () => {
      for (const [id, body] of [
        ['r-lift-off', JSON.stringify({ off: false, until: ['r-other'] })],
        ['r-lift-bare', 'not json'],
      ]) {
        gatedRun(id);
        const held = path.join(root, 'runs', `${id}.hold`);
        write(held, JSON.stringify({ at: at(0), until: ['r-other'] }));
        const res = await app.request(`/api/namespaces/default/runs/${id}/hold`, { method: 'DELETE', headers: BOARD, body });
        assert.equal(res.status, 200, `${id}: ${await res.clone().text()}`);
        assert.deepEqual(await res.json(), { id, lifted: true, hold: { at: at(0), until: ['r-other'] } });
        assert.equal(fs.existsSync(held), false, id);
      }
    },
  );

  await t.test(
    'REFUSED: the retired paths `POST …/round`, `POST …/steps/:step/accept` and `POST …/merge` are served no more — 404, nothing written',
    async () => {
      loopingRun('r-retired');
      for (const [route, body] of [
        ['/api/runs/r-retired/round', {}],
        ['/api/runs/r-retired/steps/review/accept', { message: 'Good enough.' }],
        ['/api/runs/r-retired/merge', {}],
      ] as const)
        assert.equal((await post(route, body)).status, 404, route);
      assert.deepEqual(asked('r-retired'), [], 'nothing written');
    },
  );

  await t.test(
    'REFUSED at shipped defaults: a run that is no try, removed on the board — a 409 naming `nemia rm`, and the record kept',
    async () => {
      gatedRun('r-no-try');
      const res = await remove('r-no-try');
      assert.equal(res.status, 409);
      const said = ((await res.json()) as { error: string }).error;
      for (const fact of ['only a try', `a run of ${path.join(root, 'no-such-workflow')}`, '`nemia rm r-no-try`'])
        assert.ok(said.includes(fact), `${fact} in ${said}`);
      assert.ok(fs.existsSync(path.join(root, 'runs', 'r-no-try.json')), 'the record is kept');
    },
  );

  await t.test(
    'REFUSED at shipped defaults: a try whose worktree its place will not remove — held — is a 409 naming the worktree, how to let it go and `nemia rm`, and its record kept',
    async () => {
      const id = 'r-held-try';
      const repo = fs.mkdtempSync(path.join(root, 'repo-'));
      const git = aGitRepo(repo);
      const worktree = aGitTry(id, repo, git);
      git('worktree', 'lock', '--reason', 'a person holds it', worktree);
      const res = await remove(id);
      assert.equal(res.status, 409);
      const said = ((await res.json()) as { error: string }).error;
      assert.ok(said.startsWith(`${id}  not forgotten: ${worktree} is held (a person holds it)`), said);
      for (const fact of [`git -C ${repo} worktree unlock ${worktree}`, `nemia rm ${id} again`])
        assert.ok(said.includes(fact), `${fact} in ${said}`);
      assert.ok(fs.existsSync(path.join(root, 'runs', `${id}.json`)), 'the record is kept');
      assert.ok(fs.existsSync(worktree), 'and the worktree');
    },
  );
});

test('POST …/cancel stops a run as `nemia cancel` does, so a seat that started it from outside can stop it; a run the store has not is a 404', async (t) => {
  await t.test('a run waiting at its gate is cancelled, its plan answered, and a second cancel reads it written', async () => {
    gatedRun('r-cancel');
    const res = await post('/api/namespaces/default/runs/r-cancel/cancel', {});
    assert.equal(res.status, 200, await res.clone().text());
    const answer = (await res.json()) as { id: string; plan: { kind: string } };
    assert.deepEqual([answer.id, answer.plan.kind], ['r-cancel', 'cancel']);
    const again = (await (await post('/api/namespaces/default/runs/r-cancel/cancel', {})).json()) as { plan: { kind: string } };
    assert.equal(again.plan.kind, 'already-cancelled', 'cancelling again reads the cancellation the first one wrote');
  });

  await t.test('REFUSED: a run the store has not is a 404, nothing written', async () => {
    const res = await post('/api/namespaces/default/runs/r-no-such/cancel', {});
    assert.equal(res.status, 404);
    assert.equal(fs.existsSync(path.join(root, 'runs', 'r-no-such.json')), false);
  });
});

/** A run of `plan → triage → build | docs`, `triage` a condition of `routes: [build, docs]` whose route no follower has taken yet. */
const conditionRun = (id: string) => {
  runRecord(
    id,
    [
      { name: 'plan', after: [], body: 'Plan it.' },
      { name: 'triage', after: ['plan'], body: '', routes: ['build', 'docs'], route: { kind: 'judge' } },
      { name: 'build', after: ['triage'], body: 'Build it.', when: ['build'] },
      { name: 'docs', after: ['triage'], body: 'Write the docs.', when: ['docs'] },
    ],
    { plan: { taskId: `${id}-plan`, branch: `wf/${id}/plan` }, triage: { taskId: null }, build: { taskId: null }, docs: { taskId: null } },
  );
  signedOff(`${id}-plan`, DONE);
};

test('POST …/steps/:step/route routes a condition as `nemia route` does, writing what the same entry writes; a route off its list, a step that is no condition and a run the store has not are refused, nothing written', async (t) => {
  await t.test('a condition routed by hand: the route written for its try, as the command line writes it', async () => {
    conditionRun('r-cli-route');
    conditionRun('r-api-route');
    const typed = await asTyped('route', ['r-cli-route', 'triage', 'docs']);
    const res = await post('/api/namespaces/default/runs/r-api-route/steps/triage/route', { route: 'docs' });
    assert.equal(res.status, 200, await res.clone().text());
    const answered = (await res.json()) as { step: string; try: number; route: string; at: string; file: string };
    assert.deepEqual(Object.keys(answered).sort(), ['at', 'file', 'route', 'step', 'try']);
    assert.deepEqual([answered.step, answered.try, answered.route], ['triage', typed.try, 'docs']);
    assert.deepEqual(written(answered.file), written(String(typed.file)));
    assert.deepEqual(asked('r-api-route'), asked('r-cli-route'));
  });

  await t.test('REFUSED: a route not in the condition’s routes: is a 422, nothing written', async () => {
    conditionRun('r-route-off');
    const res = await post('/api/namespaces/default/runs/r-route-off/steps/triage/route', { route: 'nope' });
    assert.equal(res.status, 422);
    assert.deepEqual(asked('r-route-off'), []);
  });

  await t.test('REFUSED: a step that is no condition is a 422, a run of another namespace and one the store has not a 404', async () => {
    conditionRun('r-route-plan');
    assert.equal((await post('/api/namespaces/default/runs/r-route-plan/steps/plan/route', { route: 'build' })).status, 422);
    assert.equal((await post('/api/namespaces/mill/runs/r-route-plan/steps/triage/route', { route: 'build' })).status, 404);
    assert.deepEqual(asked('r-route-plan'), []);
    assert.equal((await post('/api/namespaces/default/runs/r-no-such/steps/triage/route', { route: 'build' })).status, 404);
    assert.equal(fs.existsSync(path.join(root, 'runs', 'r-no-such.asks')), false);
  });

  await t.test('REFUSED: a body with no route is a 400', async () => {
    conditionRun('r-route-none');
    assert.equal((await post('/api/namespaces/default/runs/r-route-none/steps/triage/route', {})).status, 400);
    assert.deepEqual(asked('r-route-none'), []);
  });
});
