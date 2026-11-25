/**
 * A gate on disk, told as a person's stories: a step's handoff that waits for them, as `nemia start --gate`, a card's `gate:` and a
 * step's `gate: true` freeze it on a run, and as the tick holds it. What a gate means to `assess`, `listing`, `decision` and a brief is
 * pure, and lives in `assess-gates.test.ts` and `src/gate/gate.test.ts`. This is the part that is not: the record `nemia start` writes,
 * the files a person writes beside it, and a tick that reads both on every pass. And what a gate refuses on disk, as one table per verb:
 * `nemia start --gate` and a card's `gate:` before a run is written, and `nemia approve` before an approval is — each row refused by kind
 * (`_tag`) and exit 2, and the facts its words name.
 *
 * The test's store is its own, at `ROOT`, given as `ENV`, with `WF_DEFAULT_FACTORY_STARTS` in it: its runs start
 * in scratch repositories no factory holds.
 */
import { askKeyOf, askNames, dropRecord, keysUnder, listRuns, plantRecord, recordText, runKey, runRecord } from '../testing.ts';
import { beforeAll, describe, test } from 'vitest';
import { teardowns } from 'test-kit/checkpoints';
import assert from 'node:assert/strict';
import { ASKED_PRIORITY } from '../src/status/status.ts';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { Effect } from 'effect';
import type { Engine } from '../src/runtime-client.ts';
import { scratch } from 'test-kit/scratch';
import { unasked } from './unasked.ts';
import type { EnginePhase } from '../src/views/views-words.ts';
import {
  advanceRun,
  approveRun,
  cancelRun,
  forgetRun,
  inboxDir,
  list,
  parentRead,
  retryRun,
  startRun,
  startFromInbox,
  runWith as runEngine,
  standingLiveOf,
} from '../src/runner.ts';
import { markCancelled } from '../src/record/record.store.ts';
import { passStanding } from '../src/standing/standing.verb.ts';
import { engineOf } from '../src/runtime-client.ts';
import { story, staged } from './story.ts';
import { decidedOn } from './screens.ts';
import type { Env } from '../src/config/config.store.ts';
import { handled, listedRow, told, type StartedAnswer } from './typed.ts';
import { RETRY } from '../src/retry/commands.verb.ts';
import { APPROVE } from '../src/gate/commands.verb.ts';
import { onYouWords, type RunsListed } from '../src/list/list.ts';
import { RM } from '../src/runner.ts';

/** What `nemia approve` answers, as the client prints it. */
type Approved = {
  try: number;
  message: string | null;
  next: string;
  file: string;
  caps: { step: string; usd: number; above: boolean; workflow: number | null }[];
};

const ROOT = scratch('wf-gate-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

const ENV: Env = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_CONCURRENT: undefined,
  WF_MAX_RUNS: undefined,
  WF_DEFAULT_FACTORY_STARTS: '1',
};
/** A command line as a person types it: a verb the client holds on its entry's handler, its lines said (`told`); else `main`. */
const stage = staged({ runWith: runEngine, main: told, engineOf, env: ENV });
const { runWith, runPlaced } = stage;
/** A run as one waiting on it reads it, where its branches stand asked now, as a person's verb asks them (`standingLiveOf`). */
const parentNow = (id: string) => standingLiveOf([id]).pipe(Effect.flatMap((git) => parentRead(id, git)));
/** A pass's read of where every run's branches stand, written to `standing.json` as the tick writes it: what `nemia ls` reads. */
const aPass = (e: Engine) => runWith(e, passStanding(listRuns(ROOT)));
/** One pass of the tick over the run `id`. */
const tick = (e: Engine, id: string) => runWith(e, advanceRun(runRecord(ROOT, id)));

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};

/** A workflow folder of `plan → implement → review`, each step with the frontmatter lines it is given. */
const planned = (keys: { plan?: string; implement?: string; review?: string } = {}) => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const write = (name: string, after: string | null, lines = '') => {
    const front = [...(after ? [`after: ${after}`] : []), 'place: git', ...(lines ? [lines] : [])];
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${front.join('\n')}\n---\n${name} it\n`);
  };
  write('plan', null, keys.plan);
  write('implement', 'plan', keys.implement);
  write('review', 'implement', keys.review);
  return dir;
};

/** `planned()`'s workflow under `repo`'s `workflows/`, by the name a card started in `repo` finds it: a card names its workflow so. */
const plannedIn = (repo: string) => {
  const dir = planned();
  fs.cpSync(dir, path.join(repo, 'workflows', path.basename(dir)), { recursive: true });
  return path.basename(dir);
};

const SIGNED = { outcome: 'done', summary: 'the plan: parse the flag, then store it', artifacts: [], needs: null };

/** An approval, written as a person's file beside the retry asks — what `nemia approve` writes. */
const approveByHand = (id: string, step: string, n: number, held: unknown = { step, try: n, at: '2026-09-16T23:10:00.000Z' }) => {
  plantRecord(ROOT, askKeyOf(id, `approve-${step}-${n}`), typeof held === 'string' ? held : `${JSON.stringify(held, null, 2)}\n`);
};
/** The asks of a run, by name: those waiting, or with `dir` `done`, those spent. */
const asksOf = (id: string, dir = '') =>
  askNames(ROOT, id)
    .filter((n) => (dir === 'done' ? n.startsWith('done/') : !n.startsWith('done/')))
    .map((n) => (dir === 'done' ? n.slice('done/'.length) : n))
    .sort();
/** The record as the tick wrote it, unread by `runRecord`. */
const recordOf = (id: string) => recordText(ROOT, runKey(id)) ?? '';

/** `nemia start --gate plan` on `plan → implement → review`, the steps in the checkout, run until plan has signed off and waits there. */
const atItsGate = async (keys: Parameters<typeof planned>[0] = {}) => {
  const run = await runPlaced(
    startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(keys), isolate: false, gates: ['plan'] }),
  );
  const b = stage.board();
  await tick(b.e, run.id);
  b.settle(`${run.id}-plan`, 'succeeded', SIGNED);
  assert.deepEqual((await tick(b.e, run.id)).filed, []);
  return { run, ...b };
};

/** Refused as `tag`, exit 2, its words naming each of `facts`. */
const refusedAs =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    for (const fact of facts) assert.ok(err.message.includes(fact), `${err.message} does not name ${fact}`);
    return true;
  };
const runsWritten = () => keysUnder(ROOT, '/registry/runs/').length;

/** `nemia start --gate plan` on `plan → implement → review`, run until plan has signed off and waits at its gate (or as `phase` says). */
const heldAtGate = async (phase: EnginePhase = 'succeeded') => {
  const run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(), isolate: false, gates: ['plan'] }));
  const b = stage.board();
  await runWith(b.e, advanceRun(runRecord(ROOT, run.id)));
  b.settle(`${run.id}-plan`, phase, phase === 'succeeded' ? SIGNED : undefined);
  return { id: run.id, e: b.e };
};

describe('a gated run, from `nemia start --gate` to its approval', () => {
  let repo!: string;
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  let id = '';
  s.test(
    "start freezes `gates` on the record, and a step's own `gate: true` with its workflow; a run given none has no `gates`",
    async () => {
      const gated = await runPlaced(
        startRun({ brief: 'plan the flag', repo, workflowDir: planned({ review: 'gate: true' }), isolate: false, gates: ['plan'] }),
      );
      assert.deepEqual(runRecord(ROOT, gated.id).gates, ['plan']);
      assert.equal(runRecord(ROOT, gated.id).workflow?.find((w) => w.name === 'review')?.gate, true);
      const bare = await runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false }));
      assert.equal(Object.hasOwn(JSON.parse(recordOf(bare.id)), 'gates'), false);
    },
  );
  s.test(
    "`nemia start --gate plan --gate=implement` freezes both, and says where the run is gated with the folder's own, asking the engine nothing",
    async () => {
      const argv = [
        'start',
        'plan the flag',
        '--workflows',
        planned({ review: 'gate: true' }),
        '--repo',
        repo,
        '--no-worktree',
        '--gate',
        'plan',
        '--gate=implement',
      ];
      const own = testEngine();
      const started = (await stage.main(argv, engineOf(own.layer))) as StartedAnswer;
      unasked(own);
      id = started.id;
      assert.deepEqual(runRecord(ROOT, id).gates, ['plan', 'implement']);
      assert.deepEqual(started.facts.gated, ['plan', 'implement', 'review'], 'the start says each step gated, in order');
    },
  );
  s.test('the tick holds the gated step that signed off, pass after pass, whatever its closeout says', async () => {
    await tick(b.e, id);
    b.settle(`${id}-plan`, 'succeeded', { ...SIGNED, summary: 'Go ahead and implement it: nothing here needs a person.' });
    for (let pass = 1; pass <= 3; pass++) {
      assert.deepEqual((await tick(b.e, id)).filed, [], `pass ${pass}`);
    }
  });
  s.test('`nemia ls` says `waiting on you: approve plan`', async () => {
    const listing = listedRow((await stage.main(['ls', id], b.e)) as RunsListed, id);
    assert.deepEqual(onYouWords(listing), ['approve plan'], JSON.stringify(listing));
    assert.equal(listing.toDecide, undefined, "said as waiting on you, not as the run's ending to decide");
  });
  s.test("the decision is awaiting approval of plan, and plan's gate says the approval and the send-back to give", async () => {
    const atGate = await decidedOn(stage, id);
    assert.ok(atGate.decision.kind === 'awaiting', JSON.stringify(atGate.decision));
    assert.deepEqual(atGate.decision.awaitingApproval, ['plan']);
    assert.ok(atGate.gates.plan?.startsWith('awaiting approval'), atGate.gates.plan);
    assert.ok(atGate.gates.plan.includes(`nemia approve ${id} plan`), atGate.gates.plan);
  });
  s.test("no approval but the try's own opens it: not another try's, not another step's, not a file that is not one", async () => {
    approveByHand(id, 'plan', 2);
    approveByHand(id, 'implement', 1);
    approveByHand(id, 'plan', 3, '{}');
    const others = await tick(b.e, id);
    assert.deepEqual(others.filed, []);
    const note = others.notes.find((n) => n.startsWith(askKeyOf(id, 'approve-plan-3')));
    assert.ok(note?.includes('no time') && note.includes('nemia approve'), others.notes.join('\n'));
    for (const f of ['approve-plan-2', 'approve-implement-1', 'approve-plan-3']) dropRecord(ROOT, askKeyOf(id, f));
  });
  s.test("`nemia approve --message` writes the person's approval beside the retry asks, and no record", async () => {
    const record = recordOf(id);
    const approved = (await stage.main(['approve', id, 'plan', '--message', 'Ship the second reading.'], b.e)) as Approved;
    const file = askKeyOf(id, 'approve-plan-1');
    const held = JSON.parse(recordText(ROOT, file) ?? '');
    assert.deepEqual(held, { step: 'plan', try: 1, at: held.at, message: 'Ship the second reading.' });
    assert.ok(!Number.isNaN(Date.parse(held.at)), 'with the time');
    assert.deepEqual(
      [approved.try, approved.message, approved.next, approved.file],
      [1, 'Ship the second reading.', 'waiting', file],
      'what nemia approve prints of it',
    );
    assert.equal(recordOf(id), record, 'the verb writes no record');
    assert.deepEqual(runRecord(ROOT, id).approvals, [held], 'composed on read');
  });
  s.test(
    'the next tick files implement, once, told the approval under `## Approved`; the approval stays, and no record keeps it',
    async () => {
      assert.deepEqual((await tick(b.e, id)).filed, ['implement']);
      await tick(b.e, id);
      assert.equal(b.filings.filter((f) => f === `${id}-implement`).length, 1);
      assert.deepEqual(asksOf(id), ['approve-plan-1'], 'not consumed: it opens the gate on every pass');
      assert.equal(Object.hasOwn(JSON.parse(recordOf(id)), 'approvals'), false);
      const told = b.tasks.get(`${id}-implement`)!.spec.brief;
      const at = runRecord(ROOT, id).approvals![0].at;
      assert.ok(
        told.includes('\n## Approved\n\n') &&
          told.includes(`plan, try 1, approved at ${at}:\n\n\`\`\`text\nShip the second reading.\n\`\`\``),
        told,
      );
      assert.ok(!b.tasks.get(`${id}-plan`)!.spec.brief.includes('## Approved'), 'not the step before the gate');
    },
  );
  s.test('implement waits at its own gate; approved with no words, the approval has none, and review is told the first', async () => {
    b.settle(`${id}-implement`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(b.e, id)).filed, []);
    const { approval } = await runWith(b.e, approveRun(id, 'implement'));
    assert.deepEqual(Object.keys(approval).sort(), ['at', 'step', 'try']);
    assert.deepEqual((await tick(b.e, id)).filed, ['review']);
    assert.ok(b.tasks.get(`${id}-review`)!.spec.brief.includes('Ship the second reading.'), 'the reviewer after it reads it too');
  });
  s.test("review waits at its folder's own gate; approved, nothing more is held", async () => {
    b.settle(`${id}-review`, 'succeeded', SIGNED);
    const held = await tick(b.e, id);
    assert.deepEqual([held.filed, held.status], [[], 'awaiting approval']);
    await runWith(b.e, approveRun(id, 'review'));
    await tick(b.e, id);
  });
  s.test('the decision of the finished run says the gate `approved <time> — "<words>"`', async () => {
    const decided = await decidedOn(stage, id);
    assert.ok(decided.decision.kind !== 'awaiting' || !decided.decision.awaitingApproval.length, JSON.stringify(decided.decision));
    const line = decided.gates.plan;
    assert.ok(line?.startsWith('approved') && line.includes('Ship the second reading.'), line);
  });
});

/**
 * `plan → implement → review`, plan gated with `budget: 12` and an output that declares `budgets` (`"x-shape": "budgets"`), implement
 * `budget: 40`, review `budget: 10`.
 */
const budgeted = () => {
  const dir = planned({ plan: 'gate: true\nbudget: 12\noutput: plan.schema.json', implement: 'budget: 40', review: 'budget: 10' });
  const schema = { type: 'object', properties: { budgets: { 'x-shape': 'budgets', description: 'd' } }, required: ['budgets'] };
  fs.writeFileSync(path.join(dir, 'plan.schema.json'), JSON.stringify({ ...schema, additionalProperties: false }));
  return dir;
};
/** Plan's closeout proposing `budgets`, flat as a harness gives it. */
const proposing = (...budgets: Array<[string, number]>) => ({
  ...SIGNED,
  budgets: budgets.map(([step, usd]) => ({ step, usd, why: `the p90 of ${step}` })),
});

describe("a gate's step proposes the caps of the steps after it, and its approval makes them theirs", () => {
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  let id = '';
  s.test('plan signs off proposing implement $7 and review $3, and waits at its gate', async () => {
    const run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: budgeted(), isolate: false }));
    id = run.id;
    await tick(b.e, id);
    b.settle(`${id}-plan`, 'succeeded', proposing(['implement', 7], ['review', 3]));
    assert.deepEqual([(await tick(b.e, id)).status], ['awaiting approval']);
  });
  s.test("the decision says both caps at plan's gate, none above its step's own budget, and the approval's `--budget`", async () => {
    const decided = await decidedOn(stage, id);
    const budgets = decided.budgets.plan;
    assert.deepEqual(
      budgets?.steps.map((g) => [g.step, g.usd, g.why, g.above]),
      [
        ['implement', 7, 'the p90 of implement', false],
        ['review', 3, 'the p90 of review', false],
      ],
    );
    assert.ok(budgets.said.includes('the run has spent'), budgets.said);
    const approve = decided.gates.plan;
    assert.ok(approve?.includes(`nemia approve ${id} plan [--message "<words>"] [--budget <step>=<amount>]...  — `), approve);
  });
  s.test('`nemia approve --budget review=4` writes the caps into the approval, the proposal with the amount given over it', async () => {
    const approved = (await stage.main(['approve', id, 'plan', '--budget', 'review=4'], b.e)) as Approved;
    const held = JSON.parse(recordText(ROOT, askKeyOf(id, 'approve-plan-1')) ?? '');
    assert.deepEqual(held.budgets, { review: 4, implement: 7 });
    assert.deepEqual(
      approved.caps.map((c) => [c.step, c.usd]).sort(([a], [b]) => String(a).localeCompare(String(b))),
      [
        ['implement', 7],
        ['review', 4],
      ],
      'each cap nemia approve says',
    );
  });
  s.test('the next tick files implement under its approved cap, $7, not its own $40', async () => {
    assert.deepEqual((await tick(b.e, id)).filed, ['implement']);
    assert.equal(b.tasks.get(`${id}-implement`)!.spec.config?.budgetUsd, 7);
  });
  s.test('its tries past $7 are judged over budget at $7; a second pass on fresh reads says the same', async () => {
    b.end(`${id}-implement`, 'failed', { usage: { costUsd: 7.25 } });
    for (const pass of [1, 2]) {
      const after = await tick(b.e, id);
      assert.deepEqual(after.tried, [], `pass ${pass}: nothing left of $7`);
      const l = await runWith(b.e, list(b.e, runRecord(ROOT, id)));
      assert.equal(l.steps[1].message, 'over budget $7.25 of $7', `pass ${pass}`);
    }
  });
  s.test('`nemia retry --budget 9`: a raise of its own wins over the approved cap', async () => {
    await runWith(b.e, retryRun(id, 'implement', { mode: 'fresh', budget: 9 }));
    assert.deepEqual((await tick(b.e, id)).tried, ['implement']);
    assert.equal(b.tasks.get(`${id}-implement-try2`)!.spec.config?.budgetUsd, 1.75, 'what is left of $9 after $7.25');
  });
});

describe("a cap proposed above a step's own budget is said at the gate and when approved, never applied silently", () => {
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  let id = '';
  s.test("plan proposes implement $60 against its `budget: 40`: the decision says it is above the workflow's", async () => {
    const run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: budgeted(), isolate: false }));
    id = run.id;
    await tick(b.e, id);
    b.settle(`${id}-plan`, 'succeeded', proposing(['implement', 60]));
    await tick(b.e, id);
    const budgets = (await decidedOn(stage, id)).budgets.plan;
    assert.deepEqual(
      budgets?.steps.map((g) => [g.step, g.usd, g.workflow, g.above]),
      [['implement', 60, 40, true]],
    );
  });
  s.test('`nemia approve` says so of the cap it sets', async () => {
    const approved = (await stage.main(['approve', id, 'plan'], b.e)) as Approved;
    assert.deepEqual(approved.caps, [{ step: 'implement', usd: 60, above: true, workflow: 40 }]);
  });
});

describe("a gate whose caps pass the run's cost line says so in the decision; one whose caps stay under it says nothing of it", () => {
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  const atTheGate = async (costLine: number) => {
    const run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: budgeted(), isolate: false }));
    const file = runKey(run.id);
    plantRecord(ROOT, file, JSON.stringify({ ...JSON.parse(recordText(ROOT, file) ?? ''), costLine }));
    await tick(b.e, run.id);
    b.settle(`${run.id}-plan`, 'succeeded', proposing(['implement', 60]));
    await tick(b.e, run.id);
    return (await decidedOn(stage, run.id)).budgets.plan;
  };
  s.test('implement $60 proposed, at most $82.00 in all, and a line of $80: the gate says the most passes it', async () => {
    const budgets = await atTheGate(80);
    assert.deepEqual([budgets?.line?.usd, budgets?.line?.said.includes('$82.00')], [80, true], budgets?.line?.said);
  });
  s.test('a line of $90: nothing said of it', async () => {
    const budgets = await atTheGate(90);
    assert.equal(budgets?.line, undefined);
  });
});

describe('a send-back from a gate spends the approval given before it', () => {
  let gate!: Awaited<ReturnType<typeof atItsGate>>;
  const s = story(test);
  let id = '';
  const try2 = () => `${id}-plan-try2`;
  s.test('approved with words, a second approval is refused, and the first stands', async () => {
    gate = await atItsGate();
    id = gate.run.id;
    await runWith(gate.e, approveRun(id, 'plan', 'go ahead'));
    await assert.rejects(runWith(gate.e, approveRun(id, 'plan', 'yes, again')), (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Conflict', 2]);
      assert.ok(err.message.startsWith('try 1 of plan is already approved') && err.message.includes('on the next tick'), err.message);
      return true;
    });
    assert.equal(JSON.parse(recordText(ROOT, askKeyOf(id, 'approve-plan-1')) ?? '').message, 'go ahead');
  });
  s.test('`nemia retry --message` before the tick: the session continues with the objection, nothing after it filed', async () => {
    await runWith(gate.e, retryRun(id, 'plan', { mode: 'continue', message: 'Store the flag before you parse it.' }));
    const back = await tick(gate.e, id);
    assert.deepEqual([back.tried, back.filed], [['plan'], []]);
    const brief = gate.tasks.get(try2())!.spec.brief;
    assert.match(brief, /^## Try 2\n\nThe last try signed off, and its handoff waited at this step's gate for a person, who sent it back/);
    assert.ok(brief.includes('## Your answer\n\n```text\nStore the flag before you parse it.\n```'), brief);
    assert.equal(gate.tasks.get(try2())!.spec.resumeFrom, `native-${id}-plan`, 'its session continued');
    assert.equal(gate.tasks.get(try2())!.spec.priority, ASKED_PRIORITY, "a person's try: the turn they wait on goes first");
  });
  s.test('the approval is spent with the ask, into done/', () => {
    assert.deepEqual([asksOf(id), asksOf(id, 'done')], [[], ['approve-plan-1', 'retry-plan-2']]);
  });
  s.test('it signs off anew and its gate holds again, pass after pass; `nemia ls` says so', async () => {
    gate.settle(try2(), 'succeeded', { ...SIGNED, summary: 'stored, then parsed' });
    for (let pass = 1; pass <= 3; pass++) assert.deepEqual((await tick(gate.e, id)).filed, [], `pass ${pass}`);
    const l = await runWith(gate.e, list(gate.e, runRecord(ROOT, id)));
    assert.deepEqual([l.steps[0].message, l.waitingOnYou], ['awaiting approval', ['plan']]);
    assert.ok(l.steps[0].note?.startsWith('try 2, continued on your word, answered · approve it: nemia approve '), l.steps[0].note);
  });
  s.test('the spent approval, put back by hand, opens nothing: it names try 1', async () => {
    plantRecord(ROOT, askKeyOf(id, 'approve-plan-1'), recordText(ROOT, askKeyOf(id, 'done/approve-plan-1')) ?? '');
    assert.deepEqual((await tick(gate.e, id)).filed, []);
  });
  s.test('approved anew, the next tick files implement, once', async () => {
    const { approval } = await runWith(gate.e, approveRun(id, 'plan'));
    assert.equal(approval.try, 2);
    assert.deepEqual((await tick(gate.e, id)).filed, ['implement']);
    assert.equal(gate.filings.filter((f) => f === `${id}-implement`).length, 1);
  });
  s.test("implement, after plan, is handed plan's answer under `## Answered`, read off the ask consumed into done/", () => {
    const told = gate.tasks.get(`${id}-implement`)!.spec.brief;
    const at = JSON.parse(recordText(ROOT, askKeyOf(id, 'done/retry-plan-2')) ?? '').at;
    assert.ok(
      told.includes('\n## Answered\n\n') &&
        told.includes(`plan, try 2, answered at ${at}:\n\n\`\`\`text\nStore the flag before you parse it.\n\`\`\``),
      told,
    );
    assert.ok(!gate.tasks.get(try2())!.spec.brief.includes('## Answered'), "not the answered step: its answer is its try's own");
  });
});

describe('`nemia cancel` and `nemia rm` at a gate', () => {
  let gate!: Awaited<ReturnType<typeof atItsGate>>;
  const s = story(test);
  s.test('`nemia rm` refuses a run at its gate, naming the approval it waits for, and removes nothing', async () => {
    gate = await atItsGate();
    const id = gate.run.id;
    const refusal = await runWith(gate.e, forgetRun(id));
    assert.equal(refusal.kind, 'refused');
    const said = refusal.kind === 'refused' ? (refusal.refusal ?? '') : '';
    for (const fact of ['plan waits at its gate', `nemia approve ${id} plan`, `nemia cancel ${id}`, `nemia rm ${id}`])
      assert.ok(said.includes(fact), said);
    assert.ok(recordText(ROOT, runKey(id)) !== undefined, 'nothing of it removed');
    const typedRm = await runWith(gate.e, RM.handler({ runId: id }));
    assert.equal(typedRm.removed, false, 'nemia rm left it, its line naming why');
  });
  s.test('`nemia cancel` calls it off as any run — marked, not `already failed`', async () => {
    const { plan } = (await stage.main(['cancel', gate.run.id], gate.e)) as { plan: { kind: string; stop: unknown[] } };
    assert.deepEqual([plan.kind, plan.stop], ['cancel', []], 'cancelled, nothing in flight');
    assert.ok(runRecord(ROOT, gate.run.id).cancelledAt);
  });
  s.test('an approval on a cancelled run files nothing; cancelled again, it says so', async () => {
    approveByHand(gate.run.id, 'plan', 1);
    assert.deepEqual((await tick(gate.e, gate.run.id)).filed, []);
    assert.equal((await runWith(gate.e, cancelRun(gate.run.id))).plan.kind, 'already-cancelled');
  });
  s.test('called off, `nemia rm` forgets it', async () => {
    assert.equal((await runWith(gate.e, forgetRun(gate.run.id))).kind, 'forgotten');
  });
});

describe('a gated step with `check:` is checked before it is held', () => {
  let run!: import('../src/start/start.verb.ts').StartedRun;
  let b!: import('./story.ts').Board;
  beforeAll(async () => {
    const t = teardowns();
    run = await runPlaced(
      startRun({
        brief: 'plan the flag',
        repo: aRepo(),
        workflowDir: planned({ plan: 'check: test -f PLAN.md\ngate: true' }),
        isolate: false,
      }),
    );
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  s.test('its check is filed on the pass after it signs off', async () => {
    await tick(b.e, run.id);
    b.settle(`${run.id}-plan`, 'succeeded', SIGNED);
    assert.deepEqual((await tick(b.e, run.id)).checked, ['plan']);
  });
  s.test("every filing goes out with its brief cut where its sections open, the parts joining into it: the step's and its check's", () => {
    const [step, check] = b.specs;
    assert.ok(step.briefParts!.length > 1, JSON.stringify(step.brief.slice(0, 200)));
    assert.equal(step.briefParts!.join(''), step.brief);
    assert.deepEqual(check.briefParts, ['test -f PLAN.md']);
  });
  s.test('held once its check passes, nothing filed', async () => {
    b.settle(`${run.id}-plan-check`, 'succeeded', undefined, 0);
    assert.deepEqual((await tick(b.e, run.id)).filed, []);
  });
  s.test('every filing went out queued, for the tick to admit', () => {
    assert.deepEqual(b.filings, [`${run.id}-plan`, `${run.id}-plan-check`]);
    assert.deepEqual(
      b.specs.map((x) => x.queued),
      [true, true],
    );
  });
});

describe('a parent whose last step waits at its gate has not landed, though a person merged its branch, until it is approved', () => {
  let repo!: string;
  let b!: import('./story.ts').Board;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    b = stage.board();
    return t.end;
  });
  const s = story(test);
  let parent = '';
  let child = '';
  s.test('the parent signs off at its gate, and a person merges its branch', async () => {
    const oneStep = fs.mkdtempSync(path.join(ROOT, 'one-'));
    fs.writeFileSync(path.join(oneStep, 'implement.md'), '---\nplace: git\n---\nimplement it\n');
    parent = (await runPlaced(startRun({ brief: 'the parent', repo, workflowDir: oneStep, gates: ['implement'] }))).id;
    await tick(b.e, parent);
    const wt = runRecord(ROOT, parent).steps.implement.workspace!;
    fs.writeFileSync(path.join(wt, 'parent.txt'), 'parent\n');
    stage.place().world.commit(wt, 'add parent.txt');
    b.settle(`${parent}-implement`, 'succeeded', SIGNED);
    await tick(b.e, parent);
    stage.place().world.stage(repo, runRecord(ROOT, parent).steps.implement.branch!);
    stage.place().world.commit(repo, 'merge the parent');
  });
  s.test('REFUSED: merged, and at its gate, it has not landed; a run `--after` it files nothing, pass after pass', async () => {
    child = (await runPlaced(startRun({ brief: 'the child', repo, workflowDir: planned(), isolate: false, after: [parent] }))).id;
    assert.equal((await runWith(b.e, parentNow(parent))).landed, false);
    for (let pass = 1; pass <= 2; pass++) assert.deepEqual((await tick(b.e, child)).filed, [], `pass ${pass}`);
  });
  s.test('`nemia ls` of the child says it is waiting on the parent', async () => {
    await aPass(b.e);
    assert.deepEqual((await runWith(b.e, list(b.e, runRecord(ROOT, child)))).steps[0].message, `waiting on ${parent}`);
  });
  s.test(
    "approved by a person's file, with words, composed on read: it has landed, and the child's next tick files its roots",
    async () => {
      approveByHand(parent, 'implement', 1, { at: '2026-09-16T23:10:00.000Z', message: 'the second reading' });
      assert.deepEqual(
        runRecord(ROOT, parent).approvals?.find((a) => a.step === 'implement' && a.try === 1),
        {
          step: 'implement',
          try: 1,
          at: '2026-09-16T23:10:00.000Z',
          message: 'the second reading',
        },
      );
      assert.equal((await runWith(b.e, parentNow(parent))).landed, true);
      assert.deepEqual((await tick(b.e, child)).filed, ['plan']);
    },
  );
  s.test('REFUSED: approved, its one step has handed on, so a send-back is refused and nothing is written or filed', async () => {
    await assert.rejects(
      runWith(b.e, retryRun(parent, 'implement', { mode: 'continue', message: 'one more thing' })),
      (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], ['Conflict', 2]);
        assert.ok(err.message.startsWith('implement signed off done') && err.message.includes('nothing to try again'), err.message);
        return true;
      },
    );
    assert.ok(recordText(ROOT, askKeyOf(parent, 'retry-implement-2')) === undefined, 'no ask written');
    const [first, second] = [await tick(b.e, parent), await tick(b.e, parent)];
    assert.deepEqual(first.filed.concat(second.tried), []);
    assert.equal((await runWith(b.e, parentNow(parent))).landed, true, 'still landed');
  });
});

describe("a wordless `nemia retry` asked while a gated step's harness blocked its session, which then signs off: the gate holds it", () => {
  let run!: import('../src/start/start.verb.ts').StartedRun;
  let id!: string;
  let b!: import('./story.ts').Board;
  let file!: string;
  beforeAll(async () => {
    const t = teardowns();
    run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(), isolate: false, gates: ['plan'] }));
    id = run.id;
    b = stage.board();
    file = askKeyOf(id, 'retry-plan-2');
    return t.end;
  });
  const s = story(test);
  s.test('a wordless try of a blocked session is allowed, stopping it first', async () => {
    await tick(b.e, id);
    b.settle(`${id}-plan`, 'needs-human');
    const { ask, stopFirst } = await runWith(b.e, retryRun(id, 'plan', { mode: 'continue' }, { stopBlocked: true }));
    assert.deepEqual([ask.try, ask.message, stopFirst], [2, undefined, true]);
  });
  s.test('REFUSED: it signs off before any tick, and pass after pass nothing is tried, filed or stopped', async () => {
    b.settle(`${id}-plan`, 'succeeded', SIGNED);
    for (let pass = 1; pass <= 3; pass++) {
      const after = await tick(b.e, id);
      assert.deepEqual([after.tried, after.filed], [[], []], `pass ${pass}`);
    }
    assert.deepEqual([b.filings, b.stopped], [[`${id}-plan`], []]);
    assert.equal(b.tasks.has(`${id}-plan-try2`), false);
  });
  s.test('`nemia ls` says awaiting approval and waiting on you, no try said to be due', async () => {
    const l = await runWith(b.e, list(b.e, runRecord(ROOT, id)));
    assert.deepEqual([l.steps[0].message, l.waitingOnYou], ['awaiting approval', ['plan']]);
    assert.ok(l.steps[0].note?.startsWith('approve it: '), l.steps[0].note);
  });
  s.test('REFUSED: `nemia approve` and `nemia retry --message` name the take-back of the ask, and leave it where it is', async () => {
    const naming =
      (...facts: string[]) =>
      (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], ['Conflict', 2]);
        for (const fact of ['try 2 of plan is asked for', '(--continue, at ', 'with no words', ...facts])
          assert.ok(err.message.includes(fact), err.message);
        return true;
      };
    await assert.rejects(runWith(b.e, approveRun(id, 'plan')), naming('at its gate', `nemia retry ${id} plan --off`, 'then approve it'));
    await assert.rejects(runWith(b.e, retryRun(id, 'plan', { mode: 'continue', message: 'store it first' })), naming('awaiting approval'));
    assert.ok(recordText(ROOT, file) !== undefined, 'left where it is, for a person to take back');
  });
  s.test('`nemia retry --off` takes the ask back, set aside with who and when, and the approval files what follows', async () => {
    const back = await handled(
      RETRY,
      { runId: id, step: 'plan', off: true, actor: { kind: 'person', token: 'laptop' } },
      { e: b.e, env: ENV },
    );
    assert.deepEqual([back.try, back.takenBack?.actor?.token, back.stray], [2, 'laptop', undefined]);
    assert.equal(recordText(ROOT, file), undefined, 'nothing waits at its key');
    const kept = JSON.parse(recordText(ROOT, back.file) ?? '{}') as { mode?: string; takenBack?: { at?: string } };
    assert.deepEqual([kept.mode, typeof kept.takenBack?.at], ['continue', 'string'], 'never deleted: what it said is kept beside when');
    await assert.rejects(
      handled(RETRY, { runId: id, step: 'plan', off: true }, { e: b.e, env: ENV }),
      (err: Error & { exitCode?: number; _tag?: string }) => {
        assert.deepEqual([err._tag, err.exitCode], ['Conflict', 2]);
        assert.ok(err.message.includes(`nemia retry ${id} plan`), err.message);
        return true;
      },
      'a second take-back finds nothing asked',
    );
    await runWith(b.e, approveRun(id, 'plan'));
    assert.deepEqual((await tick(b.e, id)).filed, ['implement']);
  });
  s.test('REFUSED: handed on, a second approval says so, and offers no send-back that would be refused', async () => {
    await assert.rejects(runWith(b.e, approveRun(id, 'plan')), (err: Error & { exitCode?: number; _tag?: string }) => {
      assert.deepEqual([err._tag, err.exitCode], ['Conflict', 2]);
      for (const fact of ['try 1 of plan is already approved', 'has handed on', `nemia ls ${id}`])
        assert.ok(err.message.includes(fact), err.message);
      assert.ok(!err.message.includes('nemia retry'), err.message);
      return true;
    });
  });
});

describe("an inbox card's `gate:` is frozen on the run it starts", () => {
  let repo!: string;
  beforeAll(() => {
    const t = teardowns();
    repo = aRepo();
    return t.end;
  });
  const s = story(test);
  const card = (name: string, gate: string) => {
    fs.mkdirSync(inboxDir(ROOT), { recursive: true });
    fs.writeFileSync(path.join(inboxDir(ROOT), `${name}.md`), `---\nworkflow: ${plannedIn(repo)}\ngate: ${gate}\n---\nPlan the flag.\n`);
  };
  s.test("beside a start's --gate, a step both name once", async () => {
    card('plan-the-flag-a1b2', 'plan');
    const { run } = await runPlaced(
      startFromInbox({ name: 'plan-the-flag-a1b2', callerRepo: repo, isolate: false, gates: ['review', 'plan'] }),
    );
    assert.deepEqual(runRecord(ROOT, run.id).gates, ['review', 'plan']);
  });
  s.test('alone', async () => {
    card('plan-the-flag-c3d4', 'implement');
    const { run } = await runPlaced(startFromInbox({ name: 'plan-the-flag-c3d4', callerRepo: repo, isolate: false }));
    assert.deepEqual(runRecord(ROOT, run.id).gates, ['implement']);
  });
});

describe('`--gate` and a card’s `gate:`, REFUSED before a run is written', () => {
  let repo!: string;
  beforeAll(() => {
    repo = aRepo();
  });
  const starting = (...gates: string[]) =>
    runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false, gates }));
  const typed = (...flags: string[]) =>
    stage.main(['start', 'plan the flag', '--workflows', planned(), '--repo', repo, '--no-worktree', ...flags]);
  const card = (name: string, gate: string) => {
    fs.mkdirSync(inboxDir(ROOT), { recursive: true });
    fs.writeFileSync(path.join(inboxDir(ROOT), `${name}.md`), `---\nworkflow: ${plannedIn(repo)}\ngate: ${gate}\n---\nPlan the flag.\n`);
    return name;
  };
  const fromCard = (name: string, gates?: string[]) =>
    runPlaced(startFromInbox({ name, callerRepo: repo, isolate: false, ...(gates ? { gates } : {}) }));
  for (const [row, refusing, tag, facts] of [
    [
      'a --gate naming a step the workflow does not have, naming its steps',
      () => starting('plan', 'desing'),
      'Invalid',
      ['--gate desing', 'no step "desing"', 'plan, implement, review'],
    ],
    ['a --gate given twice', () => starting('plan', 'plan'), 'Invalid', ['--gate plan', 'twice', 'one --gate']],
    ['the CLI: --gate with no step', () => typed('--gate'), 'Invalid', ['--gate takes the step']],
    ['the CLI: --gate followed by a flag', () => typed('--gate', '--no-worktree'), 'Invalid', ['--gate takes the step']],
    ['the CLI: --gate naming no step', () => typed('--gate', 'reveiw'), 'Invalid', ['--gate reveiw', 'no step "reveiw"']],
    [
      "a card's `gate:` naming no step, in the card's words",
      () => fromCard(card('plan-the-flag-e5f6', 'desing')),
      'Invalid',
      ['plan-the-flag-e5f6.md: `gate: desing`', 'no step "desing"', 'plan, implement, review', 'Correct the line, or delete it'],
    ],
    [
      'a card started with a --gate naming no step',
      () => fromCard(card('plan-the-flag-g7h8', 'plan'), ['desing']),
      'Invalid',
      ['--gate desing', 'no step "desing"'],
    ],
  ] as Array<[string, () => Promise<unknown>, 'Invalid', string[]]>) {
    test(`REFUSED ${row}, no run written`, async () => {
      const before = runsWritten();
      await assert.rejects(refusing(), refusedAs(tag, ...facts));
      assert.equal(runsWritten(), before);
    });
  }
  test('the refused cards are where they were, in the inbox', () => {
    for (const name of ['plan-the-flag-e5f6', 'plan-the-flag-g7h8'])
      assert.ok(fs.existsSync(path.join(inboxDir(ROOT), `${name}.md`)), name);
  });
});

describe('`nemia approve`, REFUSED with nothing written', () => {
  let gate!: { id: string; e: import('agent-runtime').EngineShape };
  beforeAll(async () => {
    gate = await heldAtGate();
  });
  for (const [row, step, words, tag, facts] of [
    [
      'a step not gated, naming the gate there is',
      'implement',
      undefined,
      'Conflict',
      () => ['implement has no gate', `${gate.id} is gated at plan`],
    ],
    [
      'a step the run does not have, naming its steps',
      'desing',
      undefined,
      'Conflict',
      () => [`${gate.id} has no step "desing"`, 'plan, implement, review'],
    ],
    ['empty words', 'plan', '', 'Conflict', () => ['--message is empty']],
  ] as Array<[string, string, string | undefined, 'Missing' | 'Conflict' | 'Invalid', () => string[]]>) {
    test(`REFUSED ${row}`, async () => {
      await assert.rejects(runWith(gate.e, approveRun(gate.id, step, words)), refusedAs(tag, ...facts()));
      assert.deepEqual(asksOf(gate.id), []);
    });
  }
  for (const [row, given, facts] of [
    ['a budget of no dollars', [{ step: 'review', usd: 0 }], ['review', '--budget <step>=<amount>']],
    ['a budget for the gate itself', [{ step: 'plan', usd: 5 }], ['"plan"', 'implement, review']],
    ['a budget for a step the run does not have', [{ step: 'nosuch', usd: 5 }], ['"nosuch"']],
    [
      'two budgets for one step',
      [
        { step: 'implement', usd: 5 },
        { step: 'implement', usd: 6 },
      ],
      ['implement', 'two'],
    ],
  ] as Array<[string, Array<{ step: string; usd: number }>, string[]]>) {
    test(`REFUSED ${row}, Invalid`, async () => {
      await assert.rejects(runWith(gate.e, approveRun(gate.id, 'plan', undefined, given)), refusedAs('Invalid', ...facts));
      assert.deepEqual(asksOf(gate.id), []);
    });
  }
  test('REFUSED `--budget` as typed that is no step and amount, Invalid', async () => {
    for (const typed of ['review=0', 'review', '=5', 'review=five'])
      await assert.rejects(
        stage.main(['approve', gate.id, 'plan', '--budget', typed], gate.e),
        refusedAs('Invalid', '--budget <step>=<amount>'),
      );
    assert.deepEqual(asksOf(gate.id), []);
  });
  test('REFUSED a run not there', async () => {
    await assert.rejects(
      runWith(gate.e, approveRun('no-such-run-zz9z', 'plan')),
      refusedAs('Missing', 'no such run: no-such-run-zz9z', 'nemia ls'),
    );
  });
  test('REFUSED a step not signed off yet: still running', async () => {
    const running = await heldAtGate('working');
    await assert.rejects(
      runWith(running.e, approveRun(running.id, 'plan')),
      refusedAs('Conflict', 'plan has not signed off yet', 'still running', 'approve it then'),
    );
    assert.deepEqual(asksOf(running.id), []);
  });
  test('REFUSED a try already approved, the first approval standing', async () => {
    await runWith(gate.e, approveRun(gate.id, 'plan', 'yes'));
    await assert.rejects(
      runWith(gate.e, approveRun(gate.id, 'plan', 'yes, again')),
      refusedAs('Conflict', 'try 1 of plan is already approved', 'with words', 'on the next tick'),
    );
    assert.equal(JSON.parse(recordText(ROOT, askKeyOf(gate.id, 'approve-plan-1')) ?? '').message, 'yes');
  });
  test('REFUSED while a send-back is asked for', async () => {
    const sentBack = await heldAtGate();
    await runWith(sentBack.e, retryRun(sentBack.id, 'plan', { mode: 'continue', message: 'store it first' }));
    await assert.rejects(
      runWith(sentBack.e, approveRun(sentBack.id, 'plan')),
      refusedAs('Conflict', 'try 2 of plan is already asked for', '(--continue, at ', 'an approval of try 1'),
    );
    assert.deepEqual(asksOf(sentBack.id), ['retry-plan-2']);
  });
  test('REFUSED a cancelled run', async () => {
    const called = await heldAtGate();
    markCancelled(ROOT, called.id);
    await assert.rejects(
      runWith(called.e, approveRun(called.id, 'plan')),
      refusedAs('Conflict', 'was cancelled at ', 'a cancelled run files nothing'),
    );
    assert.deepEqual(asksOf(called.id), []);
  });
  test("REFUSED a file at the approval's name that is not one: named, with how to clear it, never read as approved", async () => {
    const stray = await heldAtGate();
    plantRecord(ROOT, askKeyOf(stray.id, 'approve-plan-1'), 'yes please');
    await assert.rejects(
      runWith(stray.e, approveRun(stray.id, 'plan')),
      refusedAs(
        'Conflict',
        'try 1 of plan cannot be approved',
        'approve-plan-1 is already there',
        `nemia approve ${stray.id} plan --off`,
        'then approve again',
      ),
    );
    const back = await handled(APPROVE, { runId: stray.id, step: 'plan', off: true }, { e: stray.e, env: ENV });
    assert.deepEqual(
      [back.stray, back.loop, typeof back.takenBack?.at],
      [true, false, 'string'],
      '`nemia approve --off` sets the stray aside',
    );
    assert.deepEqual(JSON.parse(recordText(ROOT, back.file) ?? '{}').stray, 'yes please', 'kept as it was, never deleted');
    await runWith(stray.e, approveRun(stray.id, 'plan'));
    assert.deepEqual(asksOf(stray.id), ['approve-plan-1'], 'and the approval is written where the stray stood');
  });
});

describe('`nemia approve` as typed, REFUSED before it reads a run', () => {
  const typed = (...flags: string[]) => stage.main(['approve', 'no-such-run-zz9z', 'plan', ...flags]);
  for (const [row, flags, facts] of [
    [
      'a flag it does not take',
      ['--mesage', 'yes'],
      ['nemia approve does not take --mesage', '--answer <n>=<letter>', '--message "<words>"'],
    ],
    ['--message with no words', ['--message'], ['--message takes the words', 'quoted']],
    [
      '--message= empty',
      ['--message='],
      ['--message is empty', 'nemia approve no-such-run-zz9z plan --message "<words>"', 'or leave --message out'],
    ],
    ['--message twice', ['--message', 'a', '--message', 'b'], ['nemia approve takes --message once']],
    ['a word it does not take', ['yes'], ['nemia approve does not take yes']],
  ] as Array<[string, string[], string[]]>) {
    test(`REFUSED ${row}`, async () => {
      await assert.rejects(typed(...flags), refusedAs('Invalid', ...facts));
    });
  }
});
