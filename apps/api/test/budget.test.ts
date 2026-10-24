/**
 * What a step and a run cost, and a step held on its budget, as the board reads them: the engine's `costUsd`, `apiMs` and `toolMs` on
 * `used`, `cost` on a run and on each of its time's totals, `spent`, `budget` and `raise` on a step, the words `nemia ls` and `nemia
 * decide` say of a step past its cap — and a raise, asked for through POST …/retry and POST …/round with a `budget`, refused in the
 * package's words.
 *
 * One table of the raises the package refuses, then two stories: a run whose steps went over their budgets, read on the detail, the
 * list and the decision, read again once pruned, and raised; and steps past their budget on their own work, answered and rechecked with
 * a raise. Each refusal's words are asserted equal to the package verb's own; a row reads the status and the facts they name.
 *
 * On the stand-ins: the runtime's test engine, each task filed and moved by hand (`engine().settle`), and the test place, under
 * the run records this file seeds. One engine for the file, since its runs are seeded as it loads and its tests read them in turn.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { RunDecision } from '../src/decide/decision.ts';
import type { RunDetail } from '../src/detail/detail.ts';
import { askFile, decideRun, list, retryRun, roundAskFile, roundRun, runStore, type RunSummary, usedLines } from 'agent-orchestrator';
import { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { appOver, beforeEachTest, eachTest, engineFor, runOver } from './placed.ts';
import { story } from './checkpoints.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);
const engine = () => engineFor(standIn());
const runWith = runOver(() => stand().layer);
const app = eachTest(() => appOver(standIn(), stand()));

type RetryHow = import('agent-orchestrator').RetryHow;

const T0 = Date.parse('2026-09-15T06:00:00.000Z');
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const write = (file: string, text: string) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/**
 * A step's task that ran once from `from` seconds, and signed off with `closeout` — its attempt with the usage the engine read of it, when
 * it read one.
 */
const session = (taskId: string, harness: string, from: number, closeout: object, usage?: object) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'Do it.', cwd: '/code/app', harness }));
  standIn().settle(taskId, 'succeeded', {
    startedAt: at(from + 1),
    spawnedAt: at(from + 1),
    endedAt: at(from + 60),
    exitCode: 0,
    closeout,
    ...(usage ? { usage } : {}),
  });
};

/**
 * A check that ran to its end and exited 1: a refusal — on the engine's record, which the api reads and `nemia ls` reads (`exitVerdicts`),
 * so the two agree — and what it printed.
 */
const refusedCheck = (taskId: string, from: number) => {
  Effect.runSync(engine().file({ id: taskId, brief: 'npm test', cwd: '/code/app', harness: 'check' }));
  standIn().settle(taskId, 'failed', {
    startedAt: at(from),
    spawnedAt: at(from),
    endedAt: at(from + 10),
    exitCode: 1,
    printed: { stdout: 'not ok 1 - tokens are colours\n# fail 1\n' },
  });
};

const done = (summary: string, more: object = {}) => ({ outcome: 'done', summary, needs: null, artifacts: [], ...more });

/** What the engine read of each Claude Code session: its cost, and the time it counted waiting on the model and running tools. */
const USAGE = {
  implement1: { responses: 20, toolCalls: 40, inputTokens: 900_000, outputTokens: 20_000, costUsd: 1.2, apiMs: 240_000, toolMs: 15_000 },
  implement2: { responses: 10, toolCalls: 12, inputTokens: 400_000, outputTokens: 8_000, costUsd: 0.9, apiMs: 100_000, toolMs: 4_000 },
  tokens1: { responses: 14, toolCalls: 31, inputTokens: 600_000, outputTokens: 12_000, costUsd: 1.75, apiMs: 300_000, toolMs: 20_000 },
  tokens2: { responses: 16, toolCalls: 29, inputTokens: 700_000, outputTokens: 14_000, costUsd: 2.5, apiMs: 420_000, toolMs: 31_000 },
  /** Codex's stream carries no cost: a session nobody priced. */
  review: { toolCalls: 6, inputTokens: 50_000, outputTokens: 2_000 },
};

/**
 * R: `implement` has `budget: 2`, and its two rounds cost $1.20 and $0.90. `review` loops back to it, on Codex, which prices nothing, and
 * asked for a third round — which would file implement again, past its cap. `tokens` has `budget: 3`, and its two tries cost $1.75 and
 * $2.50, each refused by its check.
 */
const R = 'r-cost';
const again = { type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false };
const recordFile = path.join(root, 'runs', `${R}.json`);
write(
  recordFile,
  JSON.stringify({
    id: R,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'What it cost',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [
      { name: 'implement', after: [], body: 'Implement it.', harness: 'claude', budget: 2 },
      {
        name: 'review',
        after: ['implement'],
        body: 'Review it.',
        harness: 'codex',
        loop: 'implement',
        rounds: 3,
        output: { file: 'review.json', schema: again },
      },
      { name: 'tokens', after: [], body: 'Pick the tokens.', harness: 'claude', budget: 3, check: 'npm test' },
    ],
    steps: {
      implement: { taskId: 't-implement-2', tries: [{ taskId: 't-implement-1', cause: 'round' }] },
      review: { taskId: 't-review-2', tries: [{ taskId: 't-review-1', cause: 'round' }] },
      tokens: {
        taskId: 't-tokens-2',
        check: { taskId: 't-tokens-2-check' },
        tries: [{ taskId: 't-tokens-1', check: { taskId: 't-tokens-1-check' }, cause: 'nudge' }],
      },
    },
  }),
);
beforeEachTest(() => {
  session('t-implement-1', 'claude', 0, done('Implemented it.'), USAGE.implement1);
  session('t-review-1', 'codex', 100, done('Two findings.', { again: true }), USAGE.review);
  session(
    't-implement-2',
    'claude',
    200,
    done('Answered the review.', {
      /**
       * A loop's target owes its answers to the findings of the review before it: without them it reads unsigned, and a try would take
       * it on.
       */
      replies: [{ finding: 'src/cache.ts — never expires', answer: 'fixed', why: 'It expires now.' }],
    }),
    USAGE.implement2,
  );
  session('t-review-2', 'codex', 300, done('One finding is still open.', { again: true }), USAGE.review);
  session('t-tokens-1', 'claude', 0, done('Picked them.'), USAGE.tokens1);
  refusedCheck('t-tokens-1-check', 70);
  session('t-tokens-2', 'claude', 100, done('Picked them again.'), USAGE.tokens2);
  refusedCheck('t-tokens-2-check', 170);
});

/** A run nobody priced: one Codex step, done. */
const FREE = 'r-free';
write(
  path.join(root, 'runs', `${FREE}.json`),
  JSON.stringify({
    id: FREE,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Nobody priced it',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [{ name: 'plan', after: [], body: 'Plan it.', harness: 'codex', budget: 5 }],
    steps: { plan: { taskId: 't-plan' } },
  }),
);
beforeEachTest(() => {
  session('t-plan', 'codex', 0, done('Planned it.'), USAGE.review);
});

/**
 * R2: past a budget on its own work. `palette` has `budget: 1`, and its one session cost $1.50 and signed off blocked with a question;
 * `lint` has `budget: 1`, and its one session cost $1.20 and was refused by its check. Each reads `over budget`, however it ended.
 */
const R2 = 'r-cost-own';
const PALETTE_NEEDS = 'Warm colours, or cool ones?';
write(
  path.join(root, 'runs', `${R2}.json`),
  JSON.stringify({
    id: R2,
    repo: '/code/app',
    workspace: '/code/app',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    brief: 'Past a budget on its own work',
    workflowDir: path.join(root, 'no-such-workflow'),
    createdAt: at(0),
    workflow: [
      { name: 'palette', after: [], body: 'Pick a palette.', harness: 'claude', budget: 1 },
      { name: 'lint', after: [], body: 'Lint it.', harness: 'claude', budget: 1, check: 'npm test' },
    ],
    steps: { palette: { taskId: 't-palette' }, lint: { taskId: 't-lint', check: { taskId: 't-lint-check' } } },
  }),
);
beforeEachTest(() => {
  session(
    't-palette',
    'claude',
    0,
    { outcome: 'blocked', summary: 'Two palettes drafted.', needs: PALETTE_NEEDS, artifacts: [] },
    { costUsd: 1.5 },
  );
  session('t-lint', 'claude', 0, done('Linted it.'), { costUsd: 1.2 });
  refusedCheck('t-lint-check', 70);
});

const record = fs.readFileSync(recordFile, 'utf8');

const detail = async (id = R) => (await (await app().request(`/api/runs/${id}`)).json()) as RunDetail;
const summary = async (id = R) => {
  const run = ((await (await app().request('/api/runs')).json()) as RunSummary[]).find((r) => r.id === id);
  assert.ok(run, `${id} is on the list`);
  return run;
};
const stepOf = (run: RunDetail, name: string) => {
  const step = run.steps.find((s) => s.name === name);
  assert.ok(step, name);
  return step;
};
const decision = async (id = R) => (await (await app().request(`/api/runs/${id}/decision`)).json()) as RunDecision;
type Refused = { error: string };

/** What the board sends, through vite's proxy: JSON, same-origin, and Host rewritten to the api's. */
const BOARD = {
  'content-type': 'application/json',
  'sec-fetch-site': 'same-origin',
  origin: 'http://localhost:5173',
  host: '127.0.0.1:8787',
};
const post = (route: string, body: unknown, headers: Record<string, string> = BOARD) =>
  app().request(route, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const askTry = (step: string, body: unknown, headers?: Record<string, string>, run = R) =>
  post(`/api/runs/${run}/steps/${step}/retry`, body, headers);
const askRound = (body: unknown, headers?: Record<string, string>) => post(`/api/runs/${R}/round`, body, headers);

const asksDir = path.join(root, 'runs', `${R}.asks`);
/** Nothing was written: no ask, and the run's record as it was. */
const nothingWritten = (why: string) => {
  assert.equal(fs.existsSync(asksDir) ? fs.readdirSync(asksDir, { recursive: true }).length : 0, 0, `no ask file: ${why}`);
  assert.equal(fs.readFileSync(recordFile, 'utf8'), record, `the run's record untouched: ${why}`);
};

/** What the package's `retryRun` refuses `how` for, word for word, given the harness's word as `nemia retry` gives it. */
const retryRefuses = async (step: string, how: RetryHow, run = R): Promise<string> => {
  try {
    await runWith(engine(), retryRun(run, step, how, { stopBlocked: true }));
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`retry() asked for ${step} (${JSON.stringify(how)}), and should have refused`);
};

/** What the package's `roundRun` refuses, word for word: what `nemia round` prints. */
const roundRefuses = async (step: string | undefined, budget: number | undefined): Promise<string> => {
  try {
    await runWith(engine(), roundRun(R, step, budget));
  } catch (err) {
    return (err as Error).message;
  }
  return assert.fail(`round() asked for ${step ?? 'the loop'} (budget ${budget}), and should have refused`);
};

/** `usedLines`' two lines, without their labels: what `nemia decide` prints beside a check. */
const wordsOf = (usage: object) => usedLines(usage).map((line) => line.replace(/^\w+\s+/, ''));

test("a raise the package refuses, by POST …/retry and POST …/round: its status, the facts its words name, the verb's own words — and nothing written", async (t) => {
  await t.test(
    "REFUSED at shipped defaults: a try's budget that is not an amount — 0, below it, a word — is a 400; a budget on a recheck a 422",
    async () => {
      for (const budget of [0, -1]) {
        const how: RetryHow = { mode: 'nudge', budget };
        const res = await askTry('tokens', how);
        assert.equal(res.status, 400, String(budget));
        const { error } = (await res.json()) as Refused;
        assert.ok(error.startsWith(`--budget ${budget} is not an amount.`), error);
      }
      for (const budget of ['five', '5', null]) {
        const res = await askTry('tokens', { mode: 'nudge', budget });
        assert.equal(res.status, 400, JSON.stringify(budget));
        const { error } = (await res.json()) as Refused;
        assert.ok(error.startsWith('`budget` is the cap to raise to'), error);
        assert.ok(error.includes('`nemia retry --budget <amount>`'), error);
        assert.ok(error.includes('a JSON number above zero'), error);
        assert.ok(error.includes(`This request's was ${JSON.stringify(budget)}`), error);
      }

      const recheck: RetryHow = { mode: 'recheck', budget: 5 };
      const rechecked = await askTry('tokens', recheck);
      assert.equal(rechecked.status, 422);
      const { error: noSession } = (await rechecked.json()) as Refused;
      assert.ok(noSession.startsWith("--budget raises a step's cap"), noSession);
      assert.ok(noSession.includes('--recheck files none'), noSession);
      nothingWritten('a budget that is not an amount');
    },
  );

  await t.test(
    "REFUSED at shipped defaults: a try's raise not above what the step has cost, none, or of a step not held on its try, is a 409 in `retryRefusal`'s words, verbatim",
    async () => {
      const refusals: Array<[RetryHow, string[]]> = [
        [{ mode: 'nudge', budget: 4 }, ['--budget 4 is not above $4.25', "what tokens's tries have cost"]],
        [{ mode: 'fresh', budget: 4.25 }, ['--budget 4.25 is not above $4.25', "what tokens's tries have cost"]],
        [{ mode: 'nudge' }, ['tokens is over budget: ', 'its tries have cost $4.25 of its $3 budget', 'until a person raises the cap.']],
      ];
      for (const [how, [start, ...facts]] of refusals) {
        const res = await askTry('tokens', how);
        assert.equal(res.status, 409, JSON.stringify(how));
        const { error } = (await res.json()) as Refused;
        assert.equal(error, await retryRefuses('tokens', how), `${JSON.stringify(how)}: retryRefusal's words, verbatim`);
        assert.ok(error.startsWith(start), error);
        for (const fact of facts) assert.ok(error.includes(fact), `${fact} in ${error}`);
      }
      const implement = await askTry('implement', { mode: 'nudge', budget: 5 });
      assert.equal(implement.status, 409, "a raise of a step that is not held on its try: implement goes again with review's round");
      assert.equal(((await implement.json()) as Refused).error, await retryRefuses('implement', { mode: 'nudge', budget: 5 }));
      nothingWritten('a raise the package refuses');
    },
  );

  await t.test(
    "REFUSED at shipped defaults: a round's budget not above zero, or a word, and a step that is no name, are 400s",
    async () => {
      const zero = await askRound({ budget: 0 });
      assert.equal(zero.status, 400);
      const { error: notAnAmount } = (await zero.json()) as Refused;
      assert.equal(notAnAmount, await roundRefuses(undefined, 0));
      assert.ok(notAnAmount.startsWith('--budget 0 is not an amount.'), notAnAmount);
      const word = await askRound({ step: 'review', budget: 'five' });
      assert.equal(word.status, 400);
      assert.ok(
        ((await word.json()) as Refused).error.startsWith(`\`budget\` is the cap to raise to, as \`nemia round ${R} --budget <amount>\``),
      );
      for (const body of [{ step: 42 }, { step: '' }, ['review']]) {
        const res = await askRound(body);
        assert.equal(res.status, 400, JSON.stringify(body));
      }
      const { error: named } = (await (await askRound({ step: 42 })).json()) as Refused;
      assert.ok(named.startsWith('`step` names the looping step'), named);
      for (const fact of [`\`nemia round ${R} <step>\``, "This request's was 42: `"])
        assert.ok(named.includes(fact), `${fact} in ${named}`);
      nothingWritten('a round body that is not one');
    },
  );

  await t.test(
    "REFUSED at shipped defaults: a round's raise not above what the loop's steps have cost, none, or a step with no loop, is a 409 in `roundAsk`'s words; a run or step not there a 404",
    async () => {
      const refusals: Array<[string | undefined, number | undefined, string[]]> = [
        ['review', 2, ['--budget 2 is not above $2.10', 'what implement has cost']],
        [undefined, undefined, ['review asked for round 3', 'implement has cost $2.10 of its $2 budget']],
        ['tokens', 5, ['tokens has no `loop:`']],
      ];
      for (const [step, budget, [start, ...facts]] of refusals) {
        const res = await askRound({ ...(step ? { step } : {}), ...(budget !== undefined ? { budget } : {}) });
        assert.equal(res.status, 409, `${step} ${budget}`);
        const { error } = (await res.json()) as Refused;
        assert.equal(error, await roundRefuses(step, budget));
        assert.ok(error.startsWith(start), error);
        for (const fact of facts) assert.ok(error.includes(fact), `${fact} in ${error}`);
      }
      const noStep = await askRound({ step: 'deploy', budget: 5 });
      assert.equal(noStep.status, 404);
      assert.match(((await noStep.json()) as Refused).error, new RegExp(`^Run '${R}' has no step 'deploy'`));
      const noRun = await post('/api/runs/r-nope/round', { budget: 5 });
      assert.equal(noRun.status, 404);
      assert.match(((await noRun.json()) as Refused).error, /^No run 'r-nope'/);
      nothingWritten('a round the package refuses');
    },
  );
});

test('a run whose steps went over their budgets: what each try cost, the steps held on their caps on the list, the detail and the decision, nothing offered once pruned — then raised, a try and a round', async (t) => {
  const s = story(t);

  await s.test(
    "a measured try's cost is on the detail — the engine's costUsd, apiMs and toolMs beside `nemia decide`'s words — an unmeasured one is null, never 0, and the run's total is `nemia ls`'s",
    async () => {
      const run = await detail();
      const tokens = stepOf(run, 'tokens');
      const [used, cost] = wordsOf(USAGE.tokens2);
      assert.deepEqual(tokens.used, {
        usage: USAGE.tokens2,
        used,
        cost,
        costUsd: 2.5,
        apiMs: 420_000,
        toolMs: 31_000,
        read: null,
        peak: null,
        rebuilt: 0,
      });
      assert.equal(cost, '$2.50');
      assert.match(used, / · api 7m00s · tools 31s$/);
      assert.deepEqual(
        tokens.timeline.map((t) => [t.used?.costUsd, t.used?.cost]),
        [
          [1.75, '$1.75'],
          [2.5, '$2.50'],
        ],
        "each try's session on the clock, with what it cost: the try before the current one too",
      );

      const review = stepOf(run, 'review');
      assert.deepEqual(
        review.used,
        {
          usage: USAGE.review,
          used: wordsOf(USAGE.review)[0],
          cost: 'not measured',
          costUsd: null,
          apiMs: null,
          toolMs: null,
          read: null,
          peak: null,
          rebuilt: 0,
        },
        'Codex priced nothing: null, and not measured, never 0, nor $0.00',
      );
      assert.deepEqual(
        review.timeline.map((t) => [t.used?.costUsd, t.used?.apiMs, t.used?.toolMs, t.used?.cost]),
        [
          [null, null, null, 'not measured'],
          [null, null, null, 'not measured'],
        ],
      );
      assert.equal(review.spent, null, 'no try of it was measured: nothing spent is not $0');

      assert.deepEqual(
        tokens.spent,
        { usd: 4.25, measured: 2, unmeasured: 0, said: '$4.25' },
        "what every try cost together, each session once, as nemia ls puts it beside the step's word",
      );
      assert.equal(stepOf(run, 'implement').spent?.said, '$2.10');

      const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
      assert.ok(run.cost);
      const { usd, ...total } = run.cost;
      assert.deepEqual(
        total,
        { measured: 4, unmeasured: 2, said: '≥$6.35' },
        "the run's: every step's tries, ≥ since two of review's sessions have no cost on them",
      );
      assert.ok(Math.abs(usd - 6.35) < 1e-9, String(usd));
      assert.equal(run.cost.said, words.cost, "as nemia ls says it on the run's line");
      assert.deepEqual((await summary()).cost, run.cost, 'the list carries it too');
      assert.deepEqual(
        run.timeline.rounds.map((r) => [r.round, r.cost?.said, r.cost?.measured, r.cost?.unmeasured]),
        [
          [1, '≥$1.20', 1, 1],
          [2, '≥$0.90', 1, 1],
        ],
        "on the timeline's totals: each round's sessions",
      );
      assert.deepEqual(run.timeline.run.cost, run.cost, "and the run's");

      const free = await detail(FREE);
      assert.equal(free.cost, null, 'a run nobody priced has no cost on either endpoint, and neither has its step: null, never 0');
      assert.equal((await summary(FREE)).cost, null);
      assert.equal(free.timeline.run.cost, null);
      const plan = stepOf(free, 'plan');
      assert.deepEqual([plan.spent, plan.used?.costUsd, plan.used?.cost], [null, null, 'not measured']);
      assert.deepEqual(
        plan.budget,
        { usd: 5, said: '$5', of: null, over: false },
        'its cap is there, and what it cost of it is not known: no of',
      );
      assert.equal(
        (await runWith(engine(), list(engine(), runStore.runs.read(FREE)))).cost,
        undefined,
        '`nemia ls` prints no cost for it either',
      );
    },
  );

  await s.test(
    "a step over its budget, on the list and on the detail, in `nemia ls`'s words — waiting on you, and moving nothing — with its cap, what it has cost of it, and the raise the package takes",
    async () => {
      const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
      const listed = await summary();
      const statuses = ['over budget $2.10 of $2', 'over budget — implement $2.10 of $2', 'over budget $4.25 of $3'];
      assert.deepEqual(
        listed.steps.map((s) => s.status),
        statuses,
      );
      assert.deepEqual(
        listed.steps.map(({ name, status, note }) => ({ name, status, note })),
        words.steps.map(({ name, status, note }) => ({ name, status, note: note ?? null })),
      );
      assert.deepEqual(listed.waitingOnYou, ['implement', 'review', 'tokens']);
      assert.deepEqual(listed.waitingOnYou, words.waitingOnYou);
      assert.equal(listed.moving, false, 'the run files nothing more for a step past its cap on its own word');

      const run = await detail();
      assert.deepEqual(
        run.steps.map((s) => s.status),
        statuses,
      );
      assert.deepEqual(run.waitingOnYou, listed.waitingOnYou);
      const [implement, review, tokens] = ['implement', 'review', 'tokens'].map((name) => stepOf(run, name));
      assert.deepEqual(tokens.budget, { usd: 3, said: '$3', of: '$4.25 of $3', over: true });
      assert.deepEqual(implement.budget, { usd: 2, said: '$2', of: '$2.10 of $2', over: true });
      assert.equal(review.budget, null, 'review has no `budget:`');
      assert.deepEqual(
        tokens.raise,
        { by: 'retry', above: 4.25, said: '$4.25', modes: ['nudge', 'fresh', 'recheck'], own: 'failed (check)' },
        'tokens is raised with its try, in the ways the package takes it, its check again among them, which needs no raise, and with how it ended on its own work',
      );
      assert.ok(review.raise);
      const { above, ...byRound } = review.raise;
      assert.deepEqual(
        byRound,
        { by: 'round', said: '$2.10', modes: [], own: null },
        "review's loop is raised with its round, above what implement has cost",
      );
      assert.ok(Math.abs(above - 2.1) < 1e-9, String(above));
      assert.equal(implement.raise, null, "implement goes again only with review's round");
    },
  );

  await s.test(
    "the decision says what `nemia decide` says of steps held on their budget — the OVER BUDGET line, the run's cost — and offers the raise, a try's and a round's",
    async () => {
      const said = await runWith(engine(), decideRun(R));
      const res = await app().request(`/api/runs/${R}/decision`);
      assert.equal(res.status, 200);
      const body = (await res.json()) as RunDecision;
      assert.ok('overBudget' in body, JSON.stringify(body));
      assert.ok(body.overBudget);
      assert.equal(body.overBudget, said.overBudgetLine);
      assert.ok(
        body.overBudget.startsWith(
          'OVER BUDGET, waiting on you: implement ($2.10 of $2), review (held: its round would file implement again, which has cost $2.10 of its $2 budget), tokens ($4.25 of $3)',
        ),
        body.overBudget,
      );
      assert.equal(body.cost, said.runCost[0].replace(/^cost\s+/, ''));
      assert.equal(body.cost, 'run $6.35 measured · 2 sessions not measured');
      const once = body.commands.filter((c) => c.label === 'once more');
      assert.deepEqual(
        once.map((c) => c.said),
        said.offers,
      );
      assert.deepEqual(
        once.map((c) => c.command),
        [`nemia round ${R} review --budget <amount>`, `nemia retry ${R} tokens --budget <amount>`],
      );
    },
  );

  await s.test(
    "REFUSED once pruned: steps over their budget are offered no raise — the decision's OVER BUDGET line is `nemia decide`'s, says the run was pruned where it said it waits on you, and no step carries a raise",
    async () => {
      const marker = path.join(root, 'runs', `${R}.pruned`);
      const pruned = { at: '2026-09-15T07:00:00.000Z', worktrees: [] };
      write(marker, JSON.stringify(pruned));
      try {
        const said = await runWith(engine(), decideRun(R));
        const body = await decision();
        assert.ok('overBudget' in body, JSON.stringify(body));
        assert.equal(body.overBudget, said.overBudgetLine, 'one function says it, for `nemia decide` and for the board');
        assert.equal(
          body.overBudget,
          'OVER BUDGET: implement ($2.10 of $2), review (held: its round would file implement again, which has cost $2.10 of its $2 budget), tokens ($4.25 of $3)' +
            '  — nothing more is filed for them, raised or not, since the run was pruned at 2026-09-15T07:00:00.000Z — its worktrees were removed (nemia prune); nothing after them ran',
        );
        assert.deepEqual(said.offers, []);
        assert.deepEqual(
          body.commands.filter((c) => /^nemia (retry|round|accept|approve) /.test(c.command)),
          [],
          JSON.stringify(body.commands),
        );
        assert.match(
          await retryRefuses('tokens', { mode: 'nudge', budget: 10 }),
          /^r-cost was pruned at 2026-09-15T07:00:00\.000Z: /,
          "each raise is refused in the verb's own words, which the decision does not contradict",
        );

        const run = await detail();
        assert.deepEqual(
          run.pruned,
          { ...pruned, artifacts: null },
          'the marker nemia prune --unmerged writes beside the record, which nothing removes: taken back, so what follows reads R as it was',
        );
        assert.deepEqual([run.waitingOnYou, run.steps.map((s) => s.raise)], [[], [null, null, null]]);
        assert.doesNotMatch(JSON.stringify(run.steps.map((s) => s.note)), /nemia (retry|round|accept|approve) /);
      } finally {
        fs.rmSync(marker);
      }
      nothingWritten('reading a pruned run asks for nothing');
    },
  );

  await s.test(
    "a raise as the board sends it is the package's ask: a try's and a round's, 202, the budget on the ask and nothing else written — and the step waits on nobody",
    async () => {
      const res = await askTry('tokens', { mode: 'nudge', budget: 5 });
      assert.equal(res.status, 202, await res.clone().text());
      assert.deepEqual(await res.json(), { try: 3, file: askFile(R, 'tokens', 3), stopFirst: false });
      const { at: when, ...written } = JSON.parse(fs.readFileSync(askFile(R, 'tokens', 3), 'utf8'));
      assert.deepEqual(written, { step: 'tokens', try: 3, mode: 'nudge', budget: 5 });
      assert.ok(!Number.isNaN(Date.parse(when)), when);

      const rounded = await askRound({ step: 'review', budget: 3 });
      assert.equal(rounded.status, 202, await rounded.clone().text());
      assert.deepEqual(await rounded.json(), { step: 'review', round: 3, file: roundAskFile(R, 'review', 3) });
      const { at: roundWhen, ...roundWritten } = JSON.parse(fs.readFileSync(roundAskFile(R, 'review', 3), 'utf8'));
      assert.deepEqual(roundWritten, { step: 'review', round: 3, budget: 3 });
      assert.ok(!Number.isNaN(Date.parse(roundWhen)), roundWhen);
      assert.equal(fs.readFileSync(recordFile, 'utf8'), record, "the api wrote nothing of the run's record");

      const words = await runWith(engine(), list(engine(), runStore.runs.read(R)));
      const run = await detail();
      assert.deepEqual(
        run.steps.map(({ name, note }) => ({ name, note })),
        words.steps.map(({ name, note }) => ({ name, note: note ?? null })),
        'as nemia ls has them: notes beside the steps',
      );
      assert.equal(stepOf(run, 'tokens').note, 'try 3 asked (--nudge, --budget 5) — the next tick files it');
      assert.equal(stepOf(run, 'review').note, 'round 3 asked (nemia round --budget 3) — the next tick files implement');
      assert.deepEqual(run.waitingOnYou, words.waitingOnYou);
      assert.ok(!run.waitingOnYou.includes('tokens') && !run.waitingOnYou.includes('review'), run.waitingOnYou.join(', '));
      fs.rmSync(asksDir, { recursive: true, force: true });
    },
  );
});

test('steps past their budget on their own work: one that signed off blocked is answered with its raise on the same ask — refused without one, or below the spend — and one refused by its check is rechecked with neither, as `nemia decide` offers them', async (t) => {
  const s = story(t);
  const answer = 'Warm ones.';
  const asks = path.join(root, 'runs', `${R2}.asks`);

  await s.test(
    'each reads over budget however it ended, waiting on you, offered the raise in the ways its end takes a try, and `nemia decide` answers the blocked one with the raise and the answer on one ask',
    async () => {
      const run = await detail(R2);
      const [palette, lint] = ['palette', 'lint'].map((name) => stepOf(run, name));
      assert.deepEqual(
        [palette.status, lint.status],
        ['over budget $1.50 of $1', 'over budget $1.20 of $1'],
        'its word is over budget however it ended: how it ended is on the raise',
      );
      assert.deepEqual(run.waitingOnYou, ['palette', 'lint']);
      assert.deepEqual(palette.raise, { by: 'retry', above: 1.5, said: '$1.50', modes: ['nudge', 'fresh'], own: 'blocked' });
      assert.deepEqual(lint.raise, { by: 'retry', above: 1.2, said: '$1.20', modes: ['nudge', 'fresh', 'recheck'], own: 'failed (check)' });
      assert.equal(palette.needs, PALETTE_NEEDS, "its question is still the closeout's");
      assert.equal(
        (await runWith(engine(), decideRun(R2))).answering.palette,
        `to answer it, its cap raised above $1.50:  nemia retry ${R2} palette --budget <amount> --message "<answer>"`,
        'nemia decide: the raise and the answer on one ask',
      );
    },
  );

  await s.test(
    "REFUSED at shipped defaults: its answer without a raise, or with one not above the spend, is a 409 in `retryRefusal`'s words, and nothing is written",
    async () => {
      const refusals: Array<[RetryHow, string[]]> = [
        [
          { mode: 'nudge', message: answer },
          ['palette is over budget: ', 'its tries have cost $1.50 of its $1 budget', 'until a person raises the cap.'],
        ],
        [{ mode: 'fresh', message: answer, budget: 1.5 }, ['--budget 1.5 is not above $1.50', "what palette's tries have cost"]],
      ];
      for (const [how, [start, ...facts]] of refusals) {
        const res = await askTry('palette', how, BOARD, R2);
        assert.equal(res.status, 409, JSON.stringify(how));
        const { error } = (await res.json()) as Refused;
        assert.equal(error, await retryRefuses('palette', how, R2));
        assert.ok(error.startsWith(start), error);
        for (const fact of facts) assert.ok(error.includes(fact), `${fact} in ${error}`);
      }
      assert.equal(fs.existsSync(asks), false, 'nothing is written on a refusal');
    },
  );

  await s.test(
    'the answer and the raise, as the board sends them, are one ask, 202; the refused check is rechecked with no budget',
    async () => {
      const answered = await askTry('palette', { mode: 'nudge', budget: 2, message: answer }, BOARD, R2);
      assert.equal(answered.status, 202, await answered.clone().text());
      assert.deepEqual(await answered.json(), { try: 2, file: askFile(R2, 'palette', 2), stopFirst: false });
      const { at: when, ...written } = JSON.parse(fs.readFileSync(askFile(R2, 'palette', 2), 'utf8'));
      assert.deepEqual(
        written,
        { step: 'palette', try: 2, mode: 'nudge', message: answer, budget: 2 },
        'one ask, the next try filed with it',
      );
      assert.ok(!Number.isNaN(Date.parse(when)), when);

      const rechecked = await askTry('lint', { mode: 'recheck' }, BOARD, R2);
      assert.equal(rechecked.status, 202, await rechecked.clone().text());
      assert.deepEqual(await rechecked.json(), { try: 2, file: askFile(R2, 'lint', 2), stopFirst: false });
      const { at: _, ...recheck } = JSON.parse(fs.readFileSync(askFile(R2, 'lint', 2), 'utf8'));
      assert.deepEqual(recheck, { step: 'lint', try: 2, mode: 'recheck' }, 'no budget: a recheck files no session to spend it');
    },
  );

  await s.test('both read their asks in notes, as `nemia ls` has them until the tick files them, and neither is waited on', async () => {
    const words = await runWith(engine(), list(engine(), runStore.runs.read(R2)));
    const after = await detail(R2);
    assert.deepEqual(
      after.steps.map(({ name, note }) => ({ name, note })),
      words.steps.map(({ name, note }) => ({ name, note: note ?? null })),
      'as nemia ls has them: notes beside the steps',
    );
    assert.deepEqual(after.waitingOnYou, [], 'and neither waited on');
    assert.deepEqual(after.waitingOnYou, words.waitingOnYou);
    fs.rmSync(asks, { recursive: true, force: true });
  });
});
