/**
 * A run a person holds (`wf hold <run> --until <run>`), as the board reads it: `heldUntil` and `holding` — the hold in the package's words —
 * on the list and the detail, a decision that is the hold and offers nothing, no step waiting on you and no raise, and every verb the board
 * sends refused in the package's words (`heldRefusal`). Each held to what `wf ls` and `wf decide` say of the same run.
 *
 * At shipped defaults: the api's own engine over a store this file seeds, with git for real where a run held on ships by its branch being
 * merged, and the harness's fake `claude` (test/harness.ts) first on PATH.
 */
import './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

// agent-orchestrator locates its store as its modules load: set first.
const root = scratch('hkb-api-hold-');
process.env.WF_ROOT = root;

const { app } = await import('../src/app.ts');
const { accept, approve, decide, engine, heldRefusal, holdAdvice, holdWord, list, readRun, retry, round } = await import('agent-orchestrator');
type Wait = import('agent-orchestrator').Wait;

const git = (...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf8' });
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
const signedOff = (taskId: string, closeout: object, usage?: object) => journal(taskId, [
  filed,
  { kind: 'starting', at: at(1), attempt: 1 },
  { kind: 'spawned', at: at(1), attempt: 1 },
  { kind: 'ended', at: at(9), attempt: 1, sessionId: `ae/${taskId}/1`, observed: 'done', reason: 'harness', closeout, ...(usage ? { usage } : {}) },
  { kind: 'settled', at: at(9), outcome: 'succeeded' },
]);
const working = (taskId: string) => journal(taskId, [filed, { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(1), attempt: 1 }]);

const DONE = { outcome: 'done', summary: 'Done.', needs: null, artifacts: [] };
const BLOCKED = { outcome: 'blocked', summary: 'Two ways to go.', needs: 'Warm colours, or cool ones?', artifacts: [] };
const AGAIN = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };

/** A run's record, as `wf start` writes it with its workflow frozen on it; cancelled as `wf cancel` marks one, with a file of its own. */
function writeRun(id: string, workflow: object[], steps: object, more: { after?: string[]; cancelledAt?: string } = {}): void {
  const { cancelledAt, ...rest } = more;
  write(path.join(root, 'runs', `${id}.json`), JSON.stringify({
    id, repo, workspace: repo, baseRef: base, branch: 'main', isolate: true, brief: `Run ${id}`, createdAt: at(0),
    workflowDir: path.join(root, 'no-such-workflow'), workflow, steps, ...rest,
  }));
  if (cancelledAt) write(path.join(root, 'runs', `${id}.cancelled`), cancelledAt);
}

const holdFile = (id: string) => path.join(root, 'runs', `${id}.hold`);
const HELD_AT = at(30);
/** Held as `wf hold` writes it: a file of its own beside the record, which the tick lifts. */
const holdOn = (id: string, until: string[]) => write(holdFile(id), JSON.stringify({ at: HELD_AT, until }));

const implement = { name: 'implement', after: [], body: 'Implement it.', harness: 'codex' };
const review = { name: 'review', after: ['implement'], body: 'Review it.', harness: 'codex' };

// The runs held on. Still working, its branch not merged: it may ship yet.
branch('wf/p-live/implement', false);
working('t-p-live');
writeRun('p-live', [implement], { implement: { taskId: 't-p-live', branch: 'wf/p-live/implement' } });
// Signed off, and its branch merged into main: shipped.
branch('wf/p-shipped/implement', true);
signedOff('t-p-shipped', DONE);
writeRun('p-shipped', [implement], { implement: { taskId: 't-p-shipped', branch: 'wf/p-shipped/implement' } });
// Called off before anything of it was filed.
const cancelledAt = at(20);
writeRun('p-cancelled', [implement], { implement: { taskId: null } }, { cancelledAt });
// Signed off on a branch somebody deleted unmerged, before any tick recorded its tip.
signedOff('t-p-gone', DONE);
writeRun('p-gone', [implement], { implement: { taskId: 't-p-gone', branch: 'wf/p-gone/implement' } });

/** `plan → implement`, started `--gate plan`: plan signed off, and waits at its gate. */
const GATE = 'h-gate';
writeRun(GATE, [{ name: 'plan', after: [], body: 'Plan it.', harness: 'codex' }, { ...implement, after: ['plan'] }], {
  plan: { taskId: `${GATE}-plan`, branch: `wf/${GATE}/plan` }, implement: { taskId: null },
});
fs.writeFileSync(path.join(root, 'runs', `${GATE}.json`), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(root, 'runs', `${GATE}.json`), 'utf8')), gates: ['plan'] }));
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
writeRun(BUDGET, [{ name: 'palette', after: [], body: 'Pick a palette.', harness: 'claude', budget: 1 }], { palette: { taskId: `${BUDGET}-palette` } });
signedOff(`${BUDGET}-palette`, BLOCKED, { costUsd: 1.5 });
holdOn(BUDGET, ['p-live']);

/** `implement → review`: implement signed off blocked, and may be tried again. */
const BLOCKS = 'h-blocked';
writeRun(BLOCKS, [implement, review], { implement: { taskId: `${BLOCKS}-implement`, branch: `wf/${BLOCKS}/implement` }, review: { taskId: null } });
signedOff(`${BLOCKS}-implement`, BLOCKED);
holdOn(BLOCKS, ['p-live']);

/**
 * `implement → review`, implement signed off, review not filed: the next tick files it once the hold lifts. One for each kind of run a hold
 * can name — one that may still ship, one shipped, one cancelled, one whose branch is gone, one the store has none of — and a hold naming none.
 */
const ON = { live: ['p-live'], shipped: ['p-shipped'], cancelled: ['p-cancelled'], gone: ['p-gone'], missing: ['no-such-run'], none: [] } as const;
for (const [kind, until] of Object.entries(ON)) {
  const id = `h-on-${kind}`;
  writeRun(id, [implement, review], { implement: { taskId: `${id}-implement`, branch: `wf/${id}/implement` }, review: { taskId: null } });
  signedOff(`${id}-implement`, DONE);
  holdOn(id, [...until]);
}

/** As `h-on-live`, and called off since. */
const CANCELLED = 'h-cancelled';
writeRun(CANCELLED, [implement, review], { implement: { taskId: `${CANCELLED}-implement`, branch: `wf/${CANCELLED}/implement` }, review: { taskId: null } }, { cancelledAt: at(40) });
signedOff(`${CANCELLED}-implement`, DONE);
holdOn(CANCELLED, ['p-live']);

/** Started `--after p-live`, nothing of it filed, and held until p-shipped as well. */
const AFTER = 'h-after';
writeRun(AFTER, [implement], { implement: { taskId: null } }, { after: ['p-live'] });
holdOn(AFTER, ['p-shipped', 'p-live']);

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'http://localhost:5173', host: '127.0.0.1:8787' };
const post = (route: string, body: unknown) => app.request(route, { method: 'POST', headers: BOARD, body: JSON.stringify(body) });

type Holding = { at: string; runs: Array<{ run: string; missing: boolean; cancelledAt: string | null; gone: string[]; shipped: boolean }>; word: string; advice: string; onYou: boolean };
type Step = { name: string; status: string; note: string | null; approve: string | null; raise: unknown; asked: unknown };
type Run = { id: string; heldUntil: string[]; holding: Holding | null; waitingOnYou: string[]; onYou: string[]; moving: boolean; status: string; toDecide: unknown; steps: Step[] };

const listed = async (): Promise<Map<string, Run>> => {
  const res = await app.request('/api/runs');
  assert.equal(res.status, 200);
  return new Map((await res.json() as Run[]).map((r) => [r.id, r]));
};
const detail = async (id: string): Promise<Run> => {
  const res = await app.request(`/api/runs/${id}`);
  assert.equal(res.status, 200);
  return res.json() as Promise<Run>;
};
const decisionOf = async (id: string) => {
  const res = await app.request(`/api/runs/${id}/decision`);
  assert.equal(res.status, 200);
  return res.json();
};

/** The holds as the api gives them, back in the package's shape. */
const asWaits = (holding: Holding | null): Wait[] => (holding?.runs ?? []).map((w) => ({
  run: w.run, ...(w.missing ? { missing: true as const } : {}), ...(w.cancelledAt ? { cancelledAt: w.cancelledAt } : {}),
  ...(w.gone.length ? { gone: w.gone } : {}), ...(w.shipped ? { shipped: true as const } : {}),
}));

/** A `wf` verb that would release work, anywhere in what a surface says. */
const VERBS = /wf (approve|retry|round|accept) /;
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

test("the list carries each held run's `heldUntil` and `holding` in `wf ls`'s words — the runs it waits on as `list` reads them, `word` its `holdWord`, `advice` its `holdAdvice` — and the detail the same", async () => {
  const runs = await listed();
  const e = engine();
  for (const id of HELD) {
    const api = runs.get(id)!;
    const run = readRun(id);
    const cli = await list(e, run);
    assert.deepEqual(api.heldUntil, run.hold!.until, id);
    assert.ok(api.holding, id);
    assert.equal(api.holding.at, HELD_AT, id);
    assert.deepEqual(asWaits(api.holding), cli.holding, id);
    assert.equal(api.holding.word, holdWord(cli.holding!), id);
    assert.equal(api.holding.advice, holdAdvice(run, cli.holding!), id);
    // And `wf decide`'s reading, which is `list`'s.
    assert.deepEqual(asWaits(api.holding), (await decide(e, id)).holding, id);
    // Each step as `wf ls` words it.
    assert.deepEqual(api.steps.map((s) => [s.name, s.status, s.note]), cli.steps.map((s) => [s.name, s.status, s.note ?? null]), id);
    const page = await detail(id);
    assert.deepEqual({ heldUntil: page.heldUntil, holding: page.holding, moving: page.moving }, { heldUntil: api.heldUntil, holding: api.holding, moving: api.moving }, id);
  }
  assert.deepEqual(runs.get(GATE)!.holding, {
    at: HELD_AT,
    runs: [{ run: 'p-live', missing: false, cancelledAt: null, gone: [], shipped: false }],
    word: 'held until p-live ships',
    advice: `nothing of ${GATE} is filed, and nothing is asked of you, until wf decide says p-live has shipped; to go on before then: wf hold ${GATE} --off`,
    onYou: false,
  });
  // A run nobody holds says so with an empty list and a null, not a missing field.
  assert.deepEqual([runs.get('p-live')!.heldUntil, runs.get('p-live')!.holding], [[], null]);
  assert.deepEqual([(await detail('p-live')).heldUntil, (await detail('p-live')).holding], [[], null]);
});

test('REFUSED while held: no step of a held run waits on you, none is offered an approval or a raise, and nothing is left to decide — where the same run unheld waits on you for each', async () => {
  const runs = await listed();
  for (const id of HELD) {
    const api = runs.get(id)!;
    assert.deepEqual([api.waitingOnYou, api.onYou, api.toDecide], [[], [], null], id);
    const page = await detail(id);
    assert.deepEqual(page.steps.map((s) => [s.approve, s.raise, s.asked]), page.steps.map(() => [null, null, null]), id);
    assert.doesNotMatch(JSON.stringify(api.steps.map((s) => s.note)), VERBS, id);
  }
  // The rule, not the fixture: each of these waits on you once the hold is lifted.
  const unheld: Record<string, string[]> = { [GATE]: ['approve plan'], [LOOP]: ['review'], [BUDGET]: ['palette'], [BLOCKS]: ['implement'] };
  for (const [id, onYou] of Object.entries(unheld)) {
    const hold = fs.readFileSync(holdFile(id), 'utf8');
    fs.rmSync(holdFile(id));
    try {
      const run = (await listed()).get(id)!;
      assert.deepEqual([run.heldUntil, run.holding, run.onYou], [[], null, onYou], id);
    } finally {
      write(holdFile(id), hold);
    }
  }
  const page = await detail(BUDGET);
  assert.equal(page.steps[0]!.status, 'over budget $1.50 of $1');
});

test("a held run's decision is `holding`, and nothing else: what `wf decide` prints for it, with no command — where the same run unheld is offered one", async () => {
  const runs = await listed();
  const e = engine();
  for (const id of [GATE, LOOP, BUDGET, BLOCKS, 'h-on-live', 'h-on-missing']) {
    const body = await decisionOf(id);
    assert.deepEqual(body, { holding: runs.get(id)!.holding }, id);
    const said = await decide(e, id);
    assert.deepEqual(said.offers, [], id);
    assert.deepEqual(said.answering, {}, id);
    assert.doesNotMatch(JSON.stringify(said.gates), VERBS, id);
  }
  // Lifted, each is offered the verb the hold refused: the decision reads the hold, not the run's steps.
  const offered: Record<string, RegExp> = { [GATE]: /^wf approve h-gate plan$/, [LOOP]: /^wf (round|accept) h-loop review/, [BUDGET]: /^wf retry h-budget palette --budget/, [BLOCKS]: /^wf retry h-blocked implement$/ };
  for (const [id, command] of Object.entries(offered)) {
    const hold = fs.readFileSync(holdFile(id), 'utf8');
    fs.rmSync(holdFile(id));
    try {
      const { commands } = await decisionOf(id);
      assert.ok(commands.some((c: { command: string }) => command.test(c.command)), `${id}: ${JSON.stringify(commands)}`);
    } finally {
      write(holdFile(id), hold);
    }
  }
  assert.ok((await decisionOf(GATE)).holding, 'the hold is back');
});

test("a step over its budget on a held run is offered no raise, and `wf decide` says nothing waits on you for it — the run is held, not over budget on you", async () => {
  const said = await decide(engine(), BUDGET);
  assert.deepEqual(said.decision, { kind: 'running', waiting: [] });
  assert.doesNotMatch(said.overBudgetLine ?? '', /waiting on you/);
  assert.doesNotMatch(said.overBudgetLine ?? '', VERBS);
  const page = await detail(BUDGET);
  assert.equal(page.steps[0]!.raise, null);
  assert.deepEqual(page.waitingOnYou, []);
});

test('REFUSED at shipped defaults: every verb the board sends for a held run — approve, send back, try, raise, round, accept — is a 409 in `heldRefusal`\'s words, the verb\'s own, and nothing is written', async () => {
  const e = engine();
  const cases: Array<[string, string, unknown, () => Promise<unknown>]> = [
    [GATE, `/api/runs/${GATE}/steps/plan/approve`, { message: 'Ship it.' }, () => approve(e, GATE, 'plan', 'Ship it.')],
    [GATE, `/api/runs/${GATE}/steps/plan/retry`, { mode: 'nudge', message: 'Store it first.' }, () => retry(e, GATE, 'plan', { mode: 'nudge', message: 'Store it first.' }, { stopBlocked: true })],
    [BLOCKS, `/api/runs/${BLOCKS}/steps/implement/retry`, { mode: 'nudge', message: 'Warm ones.' }, () => retry(e, BLOCKS, 'implement', { mode: 'nudge', message: 'Warm ones.' }, { stopBlocked: true })],
    [BUDGET, `/api/runs/${BUDGET}/steps/palette/retry`, { mode: 'nudge', message: 'Warm ones.', budget: 5 }, () => retry(e, BUDGET, 'palette', { mode: 'nudge', message: 'Warm ones.', budget: 5 }, { stopBlocked: true })],
    [LOOP, `/api/runs/${LOOP}/round`, { step: 'review' }, () => round(e, LOOP, 'review', undefined)],
    [LOOP, `/api/runs/${LOOP}/steps/review/accept`, { message: 'The findings are follow-up work.' }, () => accept(e, LOOP, 'review', 'The findings are follow-up work.')],
  ];
  for (const [id, route, body, verb] of cases) {
    const res = await post(route, body);
    assert.equal(res.status, 409, route);
    const { error } = await res.json();
    assert.equal(error, await refusal(verb), route);
    const what = /approve$/.test(route) ? 'an approval' : /retry$/.test(route) ? 'a retry' : /round$/.test(route) ? 'a round' : 'an acceptance';
    assert.equal(error, heldRefusal(readRun(id), what), route);
    assert.deepEqual(asked(id), [], `nothing written: ${route}`);
  }
});

test("a hold that lifts only by a person's hand says so (`onYou`) — one naming no run, a run the store has none of, a cancelled run, a run whose branch is gone — and one on a run that may still ship, or has, does not", async () => {
  const runs = await listed();
  const onYou = Object.fromEntries(Object.keys(ON).map((kind) => [kind, runs.get(`h-on-${kind}`)!.holding!.onYou]));
  assert.deepEqual(onYou, { live: false, shipped: false, cancelled: true, gone: true, missing: true, none: true });
  // Held to `wf decide`'s own words rather than a copy of its rule: its advice names the way out exactly when a person has to act.
  for (const kind of Object.keys(ON)) {
    const holding = runs.get(`h-on-${kind}`)!.holding!;
    assert.equal(holding.onYou, holding.advice.includes('yours to'), kind);
  }
  assert.deepEqual(runs.get('h-on-shipped')!.holding!.runs, [{ run: 'p-shipped', missing: false, cancelledAt: null, gone: [], shipped: true }]);
  assert.equal(runs.get('h-on-shipped')!.holding!.word, 'held until p-shipped ships — it has shipped, and the next tick lifts the hold');
  assert.deepEqual(runs.get('h-on-cancelled')!.holding!.runs, [{ run: 'p-cancelled', missing: false, cancelledAt, gone: [], shipped: false }]);
  assert.deepEqual(runs.get('h-on-gone')!.holding!.runs, [{ run: 'p-gone', missing: false, cancelledAt: null, gone: ['wf/p-gone/implement'], shipped: false }]);
  assert.deepEqual(runs.get('h-on-missing')!.holding!.runs, [{ run: 'no-such-run', missing: true, cancelledAt: null, gone: [], shipped: false }]);
  assert.equal(runs.get('h-on-none')!.holding!.word, 'held, on a hold that names no run');
});

test("a held run moves as it would unheld while its hold may lift on its own — the tick files what is due once it does — and not once only a person lifts it; nothing is due while it stands", async () => {
  const runs = await listed();
  const moving = Object.fromEntries(Object.keys(ON).map((kind) => [kind, runs.get(`h-on-${kind}`)!.moving]));
  assert.deepEqual(moving, { live: true, shipped: true, cancelled: false, gone: false, missing: false, none: false });
  for (const kind of Object.keys(ON)) assert.equal(runs.get(`h-on-${kind}`)!.status, 'running', kind);
  // A run that would wait on you unheld moves no more for being held.
  for (const id of [GATE, LOOP, BUDGET, BLOCKS]) assert.equal(runs.get(id)!.moving, false, id);

  // A try asked by hand beside the verb that refuses it is not asked yet: it is filed once the hold lifts, so the run moves while it may.
  const ask = path.join(root, 'runs', `${BLOCKS}.asks`, 'retry-implement-2');
  write(ask, JSON.stringify({ mode: 'nudge' }));
  try {
    const page = await detail(BLOCKS);
    assert.equal(page.steps.find((s) => s.name === 'implement')!.asked, null);
    assert.deepEqual(page.waitingOnYou, []);
    assert.equal(page.moving, true);
    assert.deepEqual(await decisionOf(BLOCKS), { holding: page.holding });
    // On a hold only a person lifts, it does not.
    holdOn(BLOCKS, ['no-such-run']);
    assert.equal((await detail(BLOCKS)).moving, false);
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
  assert.equal((await list(engine(), readRun(CANCELLED))).holding, undefined);
});

test("a run waiting on runs and held as well is both, as `wf decide` says both: its decision carries the wait and the hold", async () => {
  const run = (await listed()).get(AFTER)!;
  assert.ok(run.holding);
  assert.deepEqual(run.holding.runs.map((w) => [w.run, w.shipped]), [['p-live', false]], 'a hold names what has not shipped');
  assert.equal(run.holding.word, 'held until p-live ships');
  const body = await decisionOf(AFTER);
  assert.deepEqual(Object.keys(body).sort(), ['holding', 'waiting']);
  assert.deepEqual(body.holding, run.holding);
  assert.equal(body.waiting.word, 'waiting on p-live');
  const said = await decide(engine(), AFTER);
  assert.deepEqual(asWaits(body.holding), said.holding);
});
