/**
 * A run a person holds (`nemia hold <run> --until <run>`), as the board reads it: `heldUntil` and `holding` — the hold in the package's
 * words — on the list and the detail, a decision that is the hold and offers nothing, no step waiting on you and no raise, and every verb
 * the board sends refused in the package's words (`heldRefusal`). Each held to what `nemia ls` and `nemia decide` say of the same run.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, with git for real where a run held on ships by its branch being
 * merged, in the harness's scratch store (`root`), and the harness's fake `claude` (test/harness.ts) first on PATH.
 *
 * The runs held on: `p-live`, still working, its branch not merged, which may ship yet; `p-shipped`, signed off and its branch merged into
 * main; `p-cancelled`, called off before anything of it was filed; `p-gone`, signed off on a branch deleted unmerged before any tick
 * recorded its tip. A pass has read where their branches stand (`passStanding`), which the list reads off `standing.json`.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { RunDecision } from '../src/decide/decision.ts';
import type { RunDetail } from '../src/detail/detail.ts';
import { app } from '../src/app.ts';
import {
  acceptRun,
  approveRun,
  decideRun,
  engine,
  heldRefusal,
  hold,
  holdAdvice,
  holdWord,
  list,
  passStanding,
  retryRun,
  roundRun,
  runStore,
  runShipped as runWith,
  type RunHolding,
  type RunSummary,
  unhold,
} from 'agent-orchestrator';

type Wait = import('agent-orchestrator').Wait;

delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
const git = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: repo, encoding: 'utf8' },
  );
const repo = fs.mkdtempSync(path.join(root, 'repo-'));
git('init', '-q', '-b', 'main');
fs.writeFileSync(path.join(repo, 'README.md'), '# app\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
const base = git('rev-parse', 'HEAD').trim();

/** A result branch off main with a file of its own committed; merged back into main with `--no-ff` when `merge` says so. */
function branch(name: string, merge: boolean): void {
  git('checkout', '-q', '-b', name);
  fs.writeFileSync(path.join(repo, `${name.replaceAll('/', '-')}.txt`), `${name}\n`);
  git('add', '-A');
  git('commit', '-q', '-m', `the work of ${name}`);
  git('checkout', '-q', 'main');
  if (merge) git('merge', '-q', '--no-ff', '-m', `Merge ${name}`, name);
}

const T0 = Date.parse('2026-09-23T09:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};
const journal = (taskId: string, events: object[]) =>
  write(path.join(root, 'engine', 'tasks', `${taskId}.jsonl`), events.map((event) => `${JSON.stringify(event)}\n`).join(''));
const filed = { kind: 'filed', at: at(0), brief: 'Do it.', cwd: repo, maxAttempts: 1, harness: 'codex' };

/** A step's task that ran once and signed off with `closeout` — its attempt with the usage the engine read of it, when it read one. */
const signedOff = (taskId: string, closeout: object, usage?: object) =>
  journal(taskId, [
    filed,
    { kind: 'starting', at: at(1), attempt: 1 },
    { kind: 'spawned', at: at(1), attempt: 1 },
    {
      kind: 'ended',
      at: at(9),
      attempt: 1,
      sessionId: `ae/${taskId}/1`,
      observed: 'done',
      reason: 'harness',
      closeout,
      ...(usage ? { usage } : {}),
    },
    { kind: 'settled', at: at(9), outcome: 'succeeded' },
  ]);
const working = (taskId: string) =>
  journal(taskId, [filed, { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(1), attempt: 1 }]);

const DONE = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };
const BLOCKED = { outcome: 'blocked', summary: 'Two ways to go.', needs: 'Warm colours, or cool ones?', artifacts: [] };
const AGAIN = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };

/**
 * A run's record, as `nemia start` writes it with its workflow frozen on it; cancelled as `nemia cancel` marks one, with a file of its own.
 */
function writeRun(id: string, workflow: object[], steps: object, more: { after?: string[]; cancelledAt?: string } = {}): void {
  const { cancelledAt, ...rest } = more;
  write(
    path.join(root, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      workspace: repo,
      baseRef: base,
      branch: 'main',
      isolate: true,
      brief: `Run ${id}`,
      createdAt: at(0),
      workflowDir: path.join(root, 'no-such-workflow'),
      workflow,
      steps,
      ...rest,
    }),
  );
  if (cancelledAt) write(path.join(root, 'runs', `${id}.cancelled`), cancelledAt);
}

const holdFile = (id: string) => path.join(root, 'runs', `${id}.hold`);
const HELD_AT = at(30);
/**
 * Held as `nemia hold` writes it: a file of its own beside the record, which the tick lifts — with no `why` and no `by` unless `said` gives
 * them, as code older than `nemia hold --why` wrote it.
 */
const holdOn = (id: string, until: string[], said: { why?: string; by?: string } = {}) =>
  write(holdFile(id), JSON.stringify({ at: HELD_AT, until, ...said }));

const implement = { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' };
const review = { name: 'review', after: ['implement'], body: 'Review it.', harness: 'codex' };

branch('wf/p-live/implement', false);
working('t-p-live');
writeRun('p-live', [implement], { implement: { taskId: 't-p-live', branch: 'wf/p-live/implement' } });
branch('wf/p-shipped/implement', true);
signedOff('t-p-shipped', DONE);
writeRun('p-shipped', [implement], { implement: { taskId: 't-p-shipped', branch: 'wf/p-shipped/implement' } });
const cancelledAt = at(20);
writeRun('p-cancelled', [implement], { implement: { taskId: null } }, { cancelledAt });
signedOff('t-p-gone', DONE);
writeRun('p-gone', [implement], { implement: { taskId: 't-p-gone', branch: 'wf/p-gone/implement' } });

/** `plan → implement`, started `--gate plan`: plan signed off, and waits at its gate. */
const GATE = 'h-gate';
writeRun(
  GATE,
  [
    { name: 'plan', after: [], body: 'Plan it.', harness: 'codex' },
    { ...implement, after: ['plan'] },
  ],
  {
    plan: { taskId: `${GATE}-plan`, branch: `wf/${GATE}/plan` },
    implement: { taskId: null },
  },
);
fs.writeFileSync(
  path.join(root, 'runs', `${GATE}.json`),
  JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(root, 'runs', `${GATE}.json`), 'utf8')), gates: ['plan'] }),
);
signedOff(`${GATE}-plan`, DONE);
holdOn(GATE, ['p-live']);

/** `implement ⇄ review`, `rounds: 2`, on round 2, and review asked for a third: out of rounds. */
const LOOP = 'h-loop';
const replies = [{ finding: 'src/flag.ts — the flag is not stored', answer: 'fixed', why: 'It is stored now.' }];
writeRun(LOOP, [implement, { ...review, loop: 'implement', rounds: 2, output: { file: 'review.json', schema: AGAIN } }], {
  implement: { taskId: `${LOOP}-implement-2`, branch: `wf/${LOOP}/implement`, tries: [{ taskId: `${LOOP}-implement-1`, then: 'round' }] },
  review: { taskId: `${LOOP}-review-2`, branch: `wf/${LOOP}/implement`, tries: [{ taskId: `${LOOP}-review-1`, then: 'round' }] },
});
signedOff(`${LOOP}-implement-2`, { ...DONE, replies });
signedOff(`${LOOP}-review-2`, { ...DONE, again: true });
holdOn(LOOP, ['p-live']);

/** `palette`, `budget: 1`: its one session cost $1.50 and signed off blocked — over its budget, and raised with a try. */
const BUDGET = 'h-budget';
writeRun(BUDGET, [{ name: 'palette', after: [], body: 'Pick a palette.', harness: 'claude', budget: 1 }], {
  palette: { taskId: `${BUDGET}-palette` },
});
signedOff(`${BUDGET}-palette`, BLOCKED, { costUsd: 1.5 });
holdOn(BUDGET, ['p-live']);

/** `implement → review`: implement signed off blocked, and may be tried again. */
const BLOCKS = 'h-blocked';
writeRun(BLOCKS, [implement, review], {
  implement: { taskId: `${BLOCKS}-implement`, branch: `wf/${BLOCKS}/implement` },
  review: { taskId: null },
});
signedOff(`${BLOCKS}-implement`, BLOCKED);
holdOn(BLOCKS, ['p-live']);

/**
 * `implement → review`, implement signed off, review not filed: the next tick files it once the hold lifts. One for each kind of run a hold
 * can name — one that may still ship, one shipped, one cancelled, one whose branch is gone, one the store has none of — and a hold naming
 * none.
 */
const ON = {
  live: ['p-live'],
  shipped: ['p-shipped'],
  cancelled: ['p-cancelled'],
  gone: ['p-gone'],
  missing: ['no-such-run'],
  none: [],
} as const;
for (const [kind, until] of Object.entries(ON)) {
  const id = `h-on-${kind}`;
  writeRun(id, [implement, review], { implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` }, review: { taskId: null } });
  signedOff(`${id}-implement`, DONE);
  holdOn(id, [...until]);
}

/** As `h-on-live`, and called off since. */
const CANCELLED = 'h-cancelled';
writeRun(
  CANCELLED,
  [implement, review],
  { implement: { taskId: `${CANCELLED}-implement`, branch: `wf/${CANCELLED}/implement` }, review: { taskId: null } },
  { cancelledAt: at(40) },
);
signedOff(`${CANCELLED}-implement`, DONE);
holdOn(CANCELLED, ['p-live']);

/** Started `--after p-live`, nothing of it filed, and held until p-shipped as well. */
const AFTER = 'h-after';
writeRun(AFTER, [implement], { implement: { taskId: null } }, { after: ['p-live'] });
holdOn(AFTER, ['p-shipped', 'p-live']);
await runWith(engine(), passStanding(runStore.runs.list()));

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};
const post = (route: string, body: unknown) => app.request(route, { method: 'POST', headers: BOARD, body: JSON.stringify(body) });

const listed = async (): Promise<Map<string, RunSummary>> => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200);
  return new Map(((await res.json()) as RunSummary[]).map((r) => [r.id, r]));
};
const detail = async (id: string): Promise<RunDetail> => {
  const res = await app.request(`/api/runs/${id}`);
  assert.equal(res.status, 200);
  return (await res.json()) as RunDetail;
};
const decisionOf = async (id: string) => {
  const res = await app.request(`/api/runs/${id}/decision`);
  assert.equal(res.status, 200);
  return (await res.json()) as RunDecision;
};

/** The holds as the api gives them, back in the package's shape. */
const asWaits = (holding: RunHolding | null | undefined): Wait[] =>
  (holding?.runs ?? []).map((w) => ({
    run: w.run,
    ...(w.missing ? { missing: true as const } : {}),
    ...(w.cancelledAt ? { cancelledAt: w.cancelledAt } : {}),
    ...(w.gone.length ? { gone: w.gone } : {}),
    ...(w.shipped ? { shipped: true as const } : {}),
  }));

/** A `nemia` verb that would release work, anywhere in what a surface says. */
const VERBS = /nemia (approve|retry|round|accept) /;
const HELD = [GATE, LOOP, BUDGET, BLOCKS, ...Object.keys(ON).map((kind) => `h-on-${kind}`), AFTER];

/** What the package refuses, word for word: what the verb prints at the command line. */
const refusal = async (act: () => Promise<unknown>): Promise<string> => {
  try {
    await act();
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail('the verb was not refused on a held run');
};

/** Every file under a run's asks directory, waiting or consumed. */
const asked = (id: string): string[] => {
  const dir = path.join(root, 'runs', `${id}.asks`);
  return fs.existsSync(dir) ? (fs.readdirSync(dir, { recursive: true }) as string[]).sort() : [];
};

test("the list carries each held run's `heldUntil` and `holding` in `nemia ls`'s words — the runs it waits on as `list` reads them, `word` its `holdWord`, `advice` its `holdAdvice` — and the detail the same", async () => {
  const runs = await listed();
  const e = engine();
  for (const id of HELD) {
    const api = runs.get(id)!;
    const run = runStore.runs.read(id);
    const cli = await runWith(e, list(e, run));
    assert.deepEqual(api.heldUntil, run.hold!.until, id);
    assert.ok(api.holding, id);
    assert.equal(api.holding.at, HELD_AT, id);
    assert.deepEqual(asWaits(api.holding), cli.holding, id);
    assert.equal(api.holding.word, holdWord(cli.holding!), id);
    assert.equal(api.holding.advice, holdAdvice(run, cli.holding!), id);
    assert.deepEqual(asWaits(api.holding), (await runWith(e, decideRun(id))).holding, `${id}: nemia decide's reading, which is list's`);
    assert.deepEqual(
      api.steps.map((s) => [s.name, s.status, s.note]),
      cli.steps.map((s) => [s.name, s.status, s.note ?? null]),
      `${id}: each step as nemia ls words it`,
    );
    const page = await detail(id);
    assert.deepEqual(
      { heldUntil: page.heldUntil, holding: page.holding, moving: page.moving },
      { heldUntil: api.heldUntil, holding: api.holding, moving: api.moving },
      id,
    );
  }
  assert.deepEqual(runs.get(GATE)!.holding, {
    at: HELD_AT,
    runs: [{ run: 'p-live', missing: false, cancelledAt: null, gone: [], shipped: false }],
    word: 'held until p-live ships',
    advice: `nothing of ${GATE} is filed, and nothing is asked of you, until nemia decide says p-live has shipped; to go on before then: nemia hold ${GATE} --off`,
    onYou: false,
  });
  assert.deepEqual(
    [runs.get('p-live')!.heldUntil, runs.get('p-live')!.holding],
    [[], null],
    'a run nobody holds says so with an empty list and a null, not a missing field',
  );
  assert.deepEqual([(await detail('p-live')).heldUntil, (await detail('p-live')).holding], [[], null]);
});

test('REFUSED while held: no step of a held run waits on you, none is offered an approval or a raise, and nothing is left to decide — where the same run unheld waits on you for each', async () => {
  const runs = await listed();
  for (const id of HELD) {
    const api = runs.get(id)!;
    assert.deepEqual([api.waitingOnYou, api.onYou, api.toDecide], [[], [], null], id);
    const page = await detail(id);
    assert.deepEqual(
      page.steps.map((s) => [s.approve, s.raise, s.asked]),
      page.steps.map(() => [null, null, null]),
      id,
    );
    assert.doesNotMatch(JSON.stringify(api.steps.map((s) => s.note)), VERBS, id);
  }
  const unheld: Record<string, string[]> = { [GATE]: ['approve plan'], [LOOP]: ['review'], [BUDGET]: ['palette'], [BLOCKS]: ['implement'] };
  for (const [id, onYou] of Object.entries(unheld)) {
    const hold = fs.readFileSync(holdFile(id), 'utf8');
    fs.rmSync(holdFile(id));
    try {
      const run = (await listed()).get(id)!;
      assert.deepEqual(
        [run.heldUntil, run.holding, run.onYou],
        [[], null, onYou],
        `${id}: the rule, not the fixture: it waits on you once the hold is lifted`,
      );
    } finally {
      write(holdFile(id), hold);
    }
  }
  const page = await detail(BUDGET);
  assert.equal(page.steps[0].status, 'over budget $1.50 of $1');
});

test("a held run's decision is `holding`, and nothing else: what `nemia decide` prints for it, with no command — where the same run unheld is offered one", async () => {
  const runs = await listed();
  const e = engine();
  for (const id of [GATE, LOOP, BUDGET, BLOCKS, 'h-on-live', 'h-on-missing']) {
    const body = await decisionOf(id);
    assert.deepEqual(body, { holding: runs.get(id)!.holding }, id);
    const said = await runWith(e, decideRun(id));
    assert.deepEqual(said.offers, [], id);
    assert.deepEqual(said.answering, {}, id);
    assert.doesNotMatch(JSON.stringify(said.gates), VERBS, id);
  }
  const offered: Record<string, RegExp> = {
    [GATE]: /^nemia approve h-gate plan$/,
    [LOOP]: /^nemia (round|accept) h-loop review/,
    [BUDGET]: /^nemia retry h-budget palette --budget/,
    [BLOCKS]: /^nemia retry h-blocked implement$/,
  };
  for (const [id, command] of Object.entries(offered)) {
    const hold = fs.readFileSync(holdFile(id), 'utf8');
    fs.rmSync(holdFile(id));
    try {
      const decided = await decisionOf(id);
      assert.ok('commands' in decided, `${id}: ${JSON.stringify(decided)}`);
      const { commands } = decided;
      assert.ok(
        commands.some((c) => command.test(c.command)),
        `${id}, lifted, is offered the verb the hold refused: the decision reads the hold, not the run's steps: ${JSON.stringify(commands)}`,
      );
    } finally {
      write(holdFile(id), hold);
    }
  }
  const back = await decisionOf(GATE);
  assert.ok('holding' in back && back.holding, 'the hold is back');
});

test('a step over its budget on a held run is offered no raise, and `nemia decide` says nothing waits on you for it — the run is held, not over budget on you', async () => {
  const said = await runWith(engine(), decideRun(BUDGET));
  assert.deepEqual(said.decision, { kind: 'running', waiting: [] });
  assert.doesNotMatch(said.overBudgetLine ?? '', /waiting on you/);
  assert.doesNotMatch(said.overBudgetLine ?? '', VERBS);
  const page = await detail(BUDGET);
  assert.equal(page.steps[0].raise, null);
  assert.deepEqual(page.waitingOnYou, []);
});

test("REFUSED at shipped defaults: every verb the board sends for a held run — approve, send back, try, raise, round, accept — is a 409 in `heldRefusal`'s words, the verb's own, and nothing is written", async () => {
  const e = engine();
  const cases: Array<[string, string, unknown, () => Promise<unknown>]> = [
    [GATE, `/api/runs/${GATE}/steps/plan/approve`, { message: 'Ship it.' }, () => runWith(e, approveRun(GATE, 'plan', 'Ship it.'))],
    [
      GATE,
      `/api/runs/${GATE}/steps/plan/retry`,
      { mode: 'nudge', message: 'Store it first.' },
      () => runWith(e, retryRun(GATE, 'plan', { mode: 'nudge', message: 'Store it first.' }, { stopBlocked: true })),
    ],
    [
      BLOCKS,
      `/api/runs/${BLOCKS}/steps/implement/retry`,
      { mode: 'nudge', message: 'Warm ones.' },
      () => runWith(e, retryRun(BLOCKS, 'implement', { mode: 'nudge', message: 'Warm ones.' }, { stopBlocked: true })),
    ],
    [
      BUDGET,
      `/api/runs/${BUDGET}/steps/palette/retry`,
      { mode: 'nudge', message: 'Warm ones.', budget: 5 },
      () => runWith(e, retryRun(BUDGET, 'palette', { mode: 'nudge', message: 'Warm ones.', budget: 5 }, { stopBlocked: true })),
    ],
    [LOOP, `/api/runs/${LOOP}/round`, { step: 'review' }, () => runWith(e, roundRun(LOOP, 'review', undefined))],
    [
      LOOP,
      `/api/runs/${LOOP}/steps/review/accept`,
      { message: 'The findings are follow-up work.' },
      () => runWith(e, acceptRun(LOOP, 'review', 'The findings are follow-up work.')),
    ],
  ];
  for (const [id, route, body, verb] of cases) {
    const res = await post(route, body);
    assert.equal(res.status, 409, route);
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, await refusal(verb), route);
    const what = route.endsWith('approve')
      ? 'an approval'
      : route.endsWith('retry')
        ? 'a retry'
        : route.endsWith('round')
          ? 'a round'
          : 'an acceptance';
    assert.equal(error, heldRefusal(runStore.runs.read(id), what), route);
    assert.deepEqual(asked(id), [], `nothing written: ${route}`);
  }
});

test("a hold that lifts only by a person's hand says so (`onYou`) — one naming no run, a run the store has none of, a cancelled run, a run whose branch is gone — and one on a run that may still ship, or has, does not", async () => {
  const runs = await listed();
  const onYou = Object.fromEntries(Object.keys(ON).map((kind) => [kind, runs.get(`h-on-${kind}`)!.holding!.onYou]));
  assert.deepEqual(onYou, { live: false, shipped: false, cancelled: true, gone: true, missing: true, none: true });
  for (const kind of Object.keys(ON)) {
    const holding = runs.get(`h-on-${kind}`)!.holding!;
    assert.equal(
      holding.onYou,
      holding.advice.includes('yours to'),
      `${kind}: held to nemia decide's own words rather than a copy of its rule: its advice names the way out exactly when a person has to act`,
    );
  }
  assert.deepEqual(runs.get('h-on-shipped')!.holding!.runs, [
    { run: 'p-shipped', missing: false, cancelledAt: null, gone: [], shipped: true },
  ]);
  assert.equal(runs.get('h-on-shipped')!.holding!.word, 'held until p-shipped ships — it has shipped, and the next tick lifts the hold');
  assert.deepEqual(runs.get('h-on-cancelled')!.holding!.runs, [
    { run: 'p-cancelled', missing: false, cancelledAt, gone: [], shipped: false },
  ]);
  assert.deepEqual(runs.get('h-on-gone')!.holding!.runs, [
    { run: 'p-gone', missing: false, cancelledAt: null, gone: ['wf/p-gone/implement'], shipped: false },
  ]);
  assert.deepEqual(runs.get('h-on-missing')!.holding!.runs, [
    { run: 'no-such-run', missing: true, cancelledAt: null, gone: [], shipped: false },
  ]);
  assert.equal(runs.get('h-on-none')!.holding!.word, 'held, on a hold that names no run');
});

test('a held run moves as it would unheld while its hold may lift on its own — the tick files what is due once it does — and not once only a person lifts it; nothing is due while it stands', async () => {
  const runs = await listed();
  const moving = Object.fromEntries(Object.keys(ON).map((kind) => [kind, runs.get(`h-on-${kind}`)!.moving]));
  assert.deepEqual(moving, { live: true, shipped: true, cancelled: false, gone: false, missing: false, none: false });
  for (const kind of Object.keys(ON)) assert.equal(runs.get(`h-on-${kind}`)!.status, 'running', kind);
  for (const id of [GATE, LOOP, BUDGET, BLOCKS])
    assert.equal(runs.get(id)!.moving, false, `${id}: a run that would wait on you unheld moves no more for being held`);

  const ask = path.join(root, 'runs', `${BLOCKS}.asks`, 'retry-implement-2');
  write(ask, JSON.stringify({ mode: 'nudge' }));
  try {
    const page = await detail(BLOCKS);
    assert.equal(
      page.steps.find((s) => s.name === 'implement')!.asked,
      null,
      'a try asked by hand beside the verb that refuses it is not asked yet',
    );
    assert.deepEqual(page.waitingOnYou, []);
    assert.equal(page.moving, true, 'it is filed once the hold lifts, so the run moves while it may');
    assert.deepEqual(await decisionOf(BLOCKS), { holding: page.holding });
    holdOn(BLOCKS, ['no-such-run']);
    assert.equal((await detail(BLOCKS)).moving, false, 'on a hold only a person lifts, it does not');
  } finally {
    fs.rmSync(path.dirname(ask), { recursive: true });
    holdOn(BLOCKS, ['p-live']);
  }
});

test('a held run called off reads as called off: no hold, nothing waiting on you, and nothing to decide', async () => {
  const run = (await listed()).get(CANCELLED)!;
  assert.deepEqual([run.status, run.heldUntil, run.holding, run.waitingOnYou, run.moving], ['cancelled', [], null, [], false]);
  const page = await detail(CANCELLED);
  assert.deepEqual([page.heldUntil, page.holding], [[], null]);
  assert.deepEqual(await decisionOf(CANCELLED), { nothing: `cancelled at ${at(40)} — nothing to decide` });
  assert.equal((await runWith(engine(), list(engine(), runStore.runs.read(CANCELLED)))).holding, undefined);
});

test('a run waiting on runs and held as well is both, as `nemia decide` says both: its decision carries the wait and the hold', async () => {
  const run = (await listed()).get(AFTER)!;
  assert.ok(run.holding);
  assert.deepEqual(
    run.holding.runs.map((w) => [w.run, w.shipped]),
    [['p-live', false]],
    'a hold names what has not shipped',
  );
  assert.equal(run.holding.word, 'held until p-live ships');
  const body = await decisionOf(AFTER);
  assert.deepEqual(Object.keys(body).sort(), ['holding', 'waiting']);
  assert.ok('waiting' in body);
  assert.deepEqual(body.holding, run.holding);
  assert.equal(body.waiting.word, 'waiting on p-live');
  const said = await runWith(engine(), decideRun(AFTER));
  assert.deepEqual(asWaits(body.holding), said.holding);
});

/** A lift as the board sends it: a DELETE with an empty JSON body, through the same guard as every write. */
const lift = (id: string, headers: Record<string, string> = BOARD) =>
  app.request(`/api/runs/${id}/hold`, { method: 'DELETE', headers, body: '{}' });

/** Every file of a run in the store's `runs/`, and what each holds: what a refusal must leave as it was. */
const filesOf = (id: string): Record<string, string> =>
  Object.fromEntries(
    fs
      .readdirSync(path.join(root, 'runs'))
      .filter((name) => name.startsWith(`${id}.`) && fs.statSync(path.join(root, 'runs', name)).isFile())
      .map((name) => [name, fs.readFileSync(path.join(root, 'runs', name), 'utf8')]),
  );

/** As `h-gate`, held until p-live: lifted by the tests below, so none of the others reads it. */
const LIFT = 'h-lift';
writeRun(
  LIFT,
  [
    { name: 'plan', after: [], body: 'Plan it.', harness: 'codex' },
    { ...implement, after: ['plan'] },
  ],
  {
    plan: { taskId: `${LIFT}-plan`, branch: `wf/${LIFT}/plan` },
    implement: { taskId: null },
  },
);
fs.writeFileSync(
  path.join(root, 'runs', `${LIFT}.json`),
  JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(root, 'runs', `${LIFT}.json`), 'utf8')), gates: ['plan'] }),
);
signedOff(`${LIFT}-plan`, DONE);

/**
 * Pruned, as `nemia prune` marks a run: `h-pruned-held` with a hold written by hand, since no verb holds a pruned run, and `h-pruned` with
 * none.
 */
const PRUNED = { at: at(50), worktrees: [] };
for (const id of ['h-pruned-held', 'h-pruned']) {
  writeRun(id, [implement, review], { implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` }, review: { taskId: null } });
  signedOff(`${id}-implement`, DONE);
  write(path.join(root, 'runs', `${id}.pruned`), JSON.stringify(PRUNED));
}

test('a hold lifted on the board is lifted as `nemia hold --off` lifts it: its file gone, the list and the page say no hold, and the gate it hid is offered again', async () => {
  holdOn(LIFT, ['p-live']);
  assert.equal((await listed()).get(LIFT)!.holding?.word, 'held until p-live ships');
  const res = await lift(LIFT);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: LIFT, lifted: true, hold: { at: HELD_AT, until: ['p-live'] } });
  assert.equal(fs.existsSync(holdFile(LIFT)), false);
  const run = (await listed()).get(LIFT)!;
  assert.deepEqual([run.heldUntil, run.holding, run.onYou], [[], null, ['approve plan']]);
  const page = await detail(LIFT);
  assert.deepEqual([page.heldUntil, page.holding], [[], null]);
  assert.equal(page.steps.find((s) => s.name === 'plan')!.approve !== null, true);
  const decided = await decisionOf(LIFT);
  assert.ok('commands' in decided, JSON.stringify(decided));
  assert.ok(decided.commands.some((c) => c.command === `nemia approve ${LIFT} plan`));
  const again = await lift(LIFT);
  assert.equal(again.status, 409, "lifted, it is held no more: a second lift is the package's refusal");
  assert.equal(((await again.json()) as { error: string }).error, await refusal(() => runWith(engine(), unhold(LIFT))));
});

test('a hold written by hand on a pruned run is lifted, as `nemia hold --off` lifts it: nothing of the run is filed again either way', async () => {
  holdOn('h-pruned-held', ['p-live']);
  assert.ok((await listed()).get('h-pruned-held')!.holding, 'the board says the hold, so it offers the lift');
  const res = await lift('h-pruned-held');
  assert.equal(res.status, 200);
  assert.equal(fs.existsSync(holdFile('h-pruned-held')), false);
  assert.ok(fs.existsSync(path.join(root, 'runs', 'h-pruned-held.pruned')), 'still pruned');
});

test('REFUSED at shipped defaults: a lift of a run nobody holds — one never held, a pruned one — is a 409 in the words of `nemia hold --off`, and nothing is written', async () => {
  for (const id of ['p-live', 'h-pruned']) {
    const before = filesOf(id);
    const res = await lift(id);
    assert.equal(res.status, 409, id);
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, await refusal(() => runWith(engine(), unhold(id))), id);
    assert.match(error, new RegExp(`^${id} is not held, so there is no hold to lift`), id);
    assert.deepEqual(filesOf(id), before, id);
  }
});

test('REFUSED at shipped defaults: a lift of a run the store has not — none by that id, one removed with its hold file left behind, an id no run can have — is a 404, and nothing is written', async () => {
  write(holdFile('h-removed'), JSON.stringify({ at: HELD_AT, until: ['p-live'] }));
  for (const id of ['no-such-run', 'h-removed', 'Not_A_Run']) {
    const before = fs.readdirSync(path.join(root, 'runs')).sort();
    const res = await lift(id);
    assert.equal(res.status, 404, id);
    assert.match(((await res.json()) as { error: string }).error, new RegExp(`^No run '${id}' in this store`), id);
    assert.deepEqual(fs.readdirSync(path.join(root, 'runs')).sort(), before, id);
  }
  assert.ok(
    fs.existsSync(holdFile('h-removed')),
    'the stray hold file, standing where nemia rm took the record, is left for `nemia hold --off` or a person',
  );
});

test('REFUSED at shipped defaults: a lift from a page on another site, addressed to another name, or not sent as JSON, before anything is read, and the hold stands', async () => {
  const held = fs.readFileSync(holdFile(GATE), 'utf8');
  const cases: Array<[Record<string, string>, number, RegExp]> = [
    [{ ...BOARD, 'sec-fetch-site': 'cross-site' }, 403, /refuses a request made by a page on another site/],
    [{ ...BOARD, 'sec-fetch-site': 'same-site' }, 403, /refuses a request made by a page on another site/],
    [{ ...BOARD, host: 'evil.example:8787' }, 403, /refuses a request addressed to evil\.example:8787/],
    [{ ...BOARD, 'content-type': 'text/plain' }, 415, /takes its body as `content-type: application\/json`/],
  ];
  for (const [headers, status, words] of cases) {
    const res = await lift(GATE, headers);
    assert.equal(res.status, status, JSON.stringify(headers));
    const { error } = (await res.json()) as { error: string };
    assert.match(error, words);
    assert.match(error, new RegExp(`^DELETE /api/runs/${GATE}/hold `));
    assert.equal(fs.readFileSync(holdFile(GATE), 'utf8'), held);
  }
});

/** `plan → implement`, started `--gate plan`: plan signed off and waiting at its gate, held with a person's words and name. */
const SAID = 'h-said';
writeRun(
  SAID,
  [
    { name: 'plan', after: [], body: 'Plan it.', harness: 'codex' },
    { ...implement, after: ['plan'] },
  ],
  { plan: { taskId: `${SAID}-plan`, branch: `wf/${SAID}/plan` }, implement: { taskId: null } },
);
fs.writeFileSync(
  path.join(root, 'runs', `${SAID}.json`),
  JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(root, 'runs', `${SAID}.json`), 'utf8')), gates: ['plan'] }),
);
signedOff(`${SAID}-plan`, DONE);

test("a hold's why and who put it are in `holding.word` on the list and the detail, and in the note of the gate it holds back — the package's words, never the api's — and a lift answers them", async () => {
  holdOn(SAID, ['p-live'], { why: 'merge conflicts in five files', by: 'operator' });
  const words = 'held until p-live ships (why: merge conflicts in five files; by operator)';
  const run = runStore.runs.read(SAID);
  const cli = await runWith(engine(), list(engine(), run));
  const api = (await listed()).get(SAID)!;
  assert.equal(api.holding?.word, words);
  assert.equal(api.holding.word, holdWord(cli.holding!, run.hold));
  assert.equal((await detail(SAID)).holding?.word, words);
  const note = `${words}; its approval is asked once the hold lifts`;
  assert.equal(api.steps.find((s) => s.name === 'plan')!.note, note, "the list's gate note");
  assert.equal((await detail(SAID)).steps.find((s) => s.name === 'plan')!.note, note, "the page's gate note");
  assert.equal((await listed()).get(GATE)!.holding?.word, 'held until p-live ships', 'a hold older code wrote says the plain line');
  const res = await lift(SAID);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), {
    id: SAID,
    lifted: true,
    hold: { at: HELD_AT, until: ['p-live'], why: 'merge conflicts in five files', by: 'operator' },
  });
});

/**
 * `implement → review`, implement signed off on a branch of its own, review not filed, and held by nobody: what the board holds with a
 * POST. `h-circle-a` is held until `h-circle-b`, so a hold of `h-circle-b` until `h-circle-a` would wait for ever.
 */
const PUT = 'h-put';
for (const id of [PUT, 'h-circle-a', 'h-circle-b']) {
  branch(`wf/${id}/implement`, false);
  writeRun(id, [implement, review], { implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` }, review: { taskId: null } });
  signedOff(`${id}-implement`, DONE);
}
holdOn('h-circle-a', ['h-circle-b']);

/** A hold put as the board sends it: a POST of `body` as JSON, through the same guard as every write. */
const put = (id: string, body: unknown, headers: Record<string, string> = BOARD) =>
  app.request(`/api/runs/${id}/hold`, { method: 'POST', headers, body: JSON.stringify(body) });

/** What the package refuses of `nemia hold <id> --until …`, word for word: `hold`'s own message. */
const holdRefused = (id: string, until: string[]) => refusal(() => runWith(engine(), hold(id, until)));

test("a hold put on the board is put as `nemia hold --until --why` puts it: its file written with the why and the api's user as `by`, the list and the page say it in `nemia ls`'s words, and the lift takes it back", async () => {
  const res = await put(PUT, { until: ['p-live'], why: 'merge conflicts' });
  assert.equal(res.status, 200);
  const answer = (await res.json()) as { id: string; lifted: boolean; hold: { at: string; until: string[]; why?: string; by?: string } };
  const by = os.userInfo().username;
  assert.deepEqual(answer, { id: PUT, lifted: false, hold: { at: answer.hold.at, until: ['p-live'], why: 'merge conflicts', by } });
  assert.deepEqual(JSON.parse(fs.readFileSync(holdFile(PUT), 'utf8')), answer.hold, 'the file is the hold the answer says');
  const words = `held until p-live ships (why: merge conflicts; by ${by})`;
  const run = runStore.runs.read(PUT);
  assert.equal(holdWord((await runWith(engine(), list(engine(), run))).holding!, run.hold), words, "nemia ls's line");
  assert.equal((await listed()).get(PUT)!.holding?.word, words);
  assert.equal((await detail(PUT)).holding?.word, words);
  assert.equal((await lift(PUT)).status, 200);
  assert.equal(fs.existsSync(holdFile(PUT)), false);
});

test('a hold put on the board takes its `by` where the body gives one, as `nemia hold --by` does', async () => {
  const res = await put(PUT, { until: ['p-live'], by: 'operator' });
  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { hold: { by?: string } }).hold.by, 'operator');
  assert.equal((await listed()).get(PUT)!.holding?.word, 'held until p-live ships (by operator)');
  assert.equal((await lift(PUT)).status, 200);
});

test('REFUSED at shipped defaults: a hold whose arguments `nemia hold` refuses — no run to wait on, a why over 200 characters, a blank by — is a 422 in its words, before the run is read, and nothing is written', async () => {
  const cases: Array<[unknown, string]> = [
    [{ until: [] }, 'nemia hold needs the runs to wait on, or --off to lift a hold'],
    [{}, 'nemia hold needs the runs to wait on, or --off to lift a hold'],
    [{ until: ['p-live'], why: 'x'.repeat(201) }, '--why'],
    [{ until: ['p-live'], by: '  ' }, '--by'],
  ];
  for (const [body, words] of cases) {
    const before = filesOf(PUT);
    const res = await put(PUT, body);
    assert.equal(res.status, 422, JSON.stringify(body));
    const { error } = (await res.json()) as { error: string };
    assert.ok(error.includes(words), error);
    assert.ok(error.startsWith('nemia hold') || error.startsWith('--'), `the package's words, not the api's: ${error}`);
    assert.deepEqual(filesOf(PUT), before, JSON.stringify(body));
  }
});

test('REFUSED at shipped defaults: a hold whose body says `off`, or a key `nemia hold` does not take, is a 400 naming each and pointing `off` at the lift, and nothing is written', async () => {
  const cases: Array<[unknown, RegExp]> = [
    [{ until: ['p-live'], off: true }, /does not take `off`: .* A hold is lifted with `DELETE \/api\/runs\/h-put\/hold`/],
    [{ until: ['p-live'], off: false, step: 'review' }, /does not take `off`, `step`: /],
    [{ until: 'p-live' }, /takes `until` as a list of run ids/],
    [{ until: ['p-live'], why: 3 }, /takes `why` as text/],
  ];
  for (const [body, words] of cases) {
    const before = filesOf(PUT);
    const res = await put(PUT, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    const { error } = (await res.json()) as { error: string };
    assert.match(error, words);
    assert.match(error, /^POST \/api\/runs\/h-put\/hold /);
    assert.deepEqual(filesOf(PUT), before, JSON.stringify(body));
  }
});

test('REFUSED at shipped defaults: a hold of a run the store does not have is a 404, and nothing is written', async () => {
  const before = fs.readdirSync(path.join(root, 'runs')).sort();
  const res = await put('h-nope', { until: ['p-live'] });
  assert.equal(res.status, 404);
  assert.match(((await res.json()) as { error: string }).error, /^No run 'h-nope' in this store/);
  assert.deepEqual(fs.readdirSync(path.join(root, 'runs')).sort(), before);
});

test("REFUSED at shipped defaults: a hold `hold` refuses — a run already held, a cancelled run, a run to wait on the store does not have, the run itself, a run that waits on this one — is a 409 in `nemia hold`'s words, and nothing is written", async () => {
  const cases: Array<[string, string[], string]> = [
    [GATE, ['p-shipped'], 'is already held until p-live ships'],
    [CANCELLED, ['p-live'], 'was cancelled at'],
    [PUT, ['p-nope'], 'the store has no run p-nope'],
    [PUT, [PUT], 'that is h-put itself'],
    ['h-circle-b', ['h-circle-a'], 'h-circle-a'],
  ];
  for (const [id, until, words] of cases) {
    const before = filesOf(id);
    const res = await put(id, { until });
    assert.equal(res.status, 409, `${id} until ${until}`);
    const { error } = (await res.json()) as { error: string };
    assert.equal(error, await holdRefused(id, until), `${id}: nemia hold's words, unchanged`);
    assert.ok(error.includes(words), error);
    assert.deepEqual(filesOf(id), before, id);
  }
});

test('REFUSED at shipped defaults: a hold from a page on another site, addressed to another name, or not sent as JSON, before anything is read, and nothing is written', async () => {
  const cases: Array<[Record<string, string>, number, RegExp]> = [
    [{ ...BOARD, 'sec-fetch-site': 'cross-site' }, 403, /refuses a request made by a page on another site/],
    [{ ...BOARD, host: 'evil.example:8787' }, 403, /refuses a request addressed to evil\.example:8787/],
    [{ ...BOARD, 'content-type': 'text/plain' }, 415, /takes its body as `content-type: application\/json`/],
  ];
  for (const [headers, status, words] of cases) {
    const res = await put(PUT, { until: ['p-live'] }, headers);
    assert.equal(res.status, status, JSON.stringify(headers));
    const { error } = (await res.json()) as { error: string };
    assert.match(error, words);
    assert.match(error, new RegExp(`^POST /api/runs/${PUT}/hold `));
    assert.equal(fs.existsSync(holdFile(PUT)), false);
  }
  const res = await put('h-nope', { until: ['p-live'] }, { ...BOARD, 'sec-fetch-site': 'cross-site' });
  assert.equal(res.status, 403, 'the guard answers before any run is read: a run the store has none of is not a 404 yet');
});

test('a lift sent with `{}`, as the board sends it, is still the DELETE it was: the put reads its body strictly, and the lift reads none', async () => {
  holdOn(PUT, ['p-live']);
  const res = await lift(PUT);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { id: PUT, lifted: true, hold: { at: HELD_AT, until: ['p-live'] } });
});
