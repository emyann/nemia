/**
 * A step's tries, on disk and at the terminal: the check the run files on a signed step and what it hands the step after it, the tries
 * `retries:` files when it refuses, and a person's — `nemia retry` nudged, fresh, on another model, rechecked, with an answer, over an
 * ask `nemia pause --now` wrote, on a session its harness blocked, past a budget with `--budget`, and with the answers to the questions
 * a step asks (`--answer`, as `nemia approve --answer` at a gate). And `nemia say` to a running step, a step denied a call, and what the
 * run files held open. Each story is one test on the stage (`story.ts`); each verb's refusals are a table. What `retryRefusal` and
 * `assess` decide is pure, in `src/retry/retry.test.ts` and `assess-*.test.ts`; a pass that died and a race with the engine are
 * `store.test.ts`'s, a task held open answered or closed `held.test.ts`'s.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in repositories no factory holds.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { TaskView } from 'agent-runtime';
import type { TestEnd } from 'agent-runtime/testing';
import type { Engine } from '../src/runtime-client.ts';
import type { RepositoryRun, Run, StepRecord } from '../src/run.ts';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';
import { answerText, approvedAnswerText, type Question } from '../src/question/question.ts';

const ROOT = scratch('wf-retry-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.WF_VERIFY_REST = '1';
const {
  advanceRun,
  cancelRun,
  closeoutAsked,
  decideRun,
  exitVerdicts,
  list,
  Missing,
  phaseOfView,
  retryRun,
  sayRun,
  startRun,
  stepsOf,
  runWith,
} = await import('../src/runner.ts');
const { askFile, asksDir, markCancelled, readAnswers, readRun } = await import('../src/record/record.store.ts');
const { isRepositoryRun, LINE_NAME, shownNote } = await import('../src/run.ts');
const { verdictWord } = await import('../src/check/check.ts');
const { runStore } = await import('../src/record/files.store.ts');
const { configRefusal, engineOf } = await import('../src/runtime-client.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};

/** A workflow folder of one step `implement`, with the frontmatter lines it is given. */
const implementOnly = (lines: string[] = []): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\n${['place: git', ...lines].join('\n')}\n---\nimplement it\n`);
  return dir;
};

/** A run of `workflowDir` started and ticked once on the stage's engine: its first step filed. */
const startedOn = async (workflowDir: string, brief: string) => {
  const run = await stage.runPlaced(startRun({ brief, repo: aRepo(), workflowDir, isolate: false }));
  await stage.runWith(stage.board().e, advanceRun(readRun(run.id)));
  return run.id;
};

/** That `err` is a refusal of kind `tag` with exit 2, naming each of `facts`. */
const refusedAs =
  (tag: string, ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.equal(err._tag, tag, err.message);
    assert.equal(err.exitCode, 2, err.message);
    names(err.message, ...facts);
    return true;
  };

test('a person tries a failed step again, fresh, on another model', async (t) => {
  const s = story(t);
  let id = '';
  await s.test('implement, on Claude Code at the model opus, is filed and fails', async () => {
    id = await startedOn(implementOnly(['model: opus']), 'the flag');
    stage.board().settle(`${id}-implement`, 'failed');
  });
  await s.test('REFUSED: a fresh try on a model its harness refuses, named by the flag as typed, and no ask written', async () => {
    const harnessSaid = configRefusal('claude', { model: '' });
    assert.equal(typeof harnessSaid, 'string', 'the fixture: the harness refuses an empty model');
    await assert.rejects(
      stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh', model: '' })),
      refusedAs('Invalid', 'implement:', "`--model ''`", '(filed as `model`)', harnessSaid!),
    );
    assert.deepEqual(runStore.asks.read(id).asks, [], 'nothing written');
  });
  await s.test('a fresh try on a model its harness takes is asked for', async () => {
    const { ask } = await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh', model: 'sonnet' }));
    assert.deepEqual([ask.try, ask.mode, ask.model], [2, 'fresh', 'sonnet']);
  });
  await s.test('the next tick files try 2, fresh on that model, the first behind it', async () => {
    await stage.runWith(stage.board().e, advanceRun(readRun(id)));
    const record = readRun(id).steps.implement;
    assert.equal(record.taskId, `${id}-implement-try2`);
    assert.deepEqual(
      record.tries?.map((x) => [x.taskId, x.then, x.model]),
      [[`${id}-implement`, 'fresh', 'sonnet']],
    );
  });
});

/** The ask `nemia pause --now` wrote for try 2 of a run's implement, which it stopped, written on disk where a pause writes it. */
const pauseAskOf = (id: string) => {
  const ask = { step: 'implement', try: 2, mode: 'nudge', interrupted: `${id}-implement`, at: '2026-10-04T12:00:00.000Z' };
  fs.mkdirSync(asksDir(id), { recursive: true });
  fs.writeFileSync(askFile(id, 'implement', 2), JSON.stringify(ask));
  return ask;
};
const onDisk = (file: string): unknown => JSON.parse(fs.readFileSync(file, 'utf8'));

test("a retry over a void pause ask waits for the pass that sets it aside, then is written at the ask's name", async (t) => {
  const s = story(t);
  let id = '';
  let pauseAsk: unknown;
  await s.test('implement is filed and fails on its own, with the ask a pause at once wrote for its next try on disk', async () => {
    id = await startedOn(implementOnly(), 'the pause');
    stage.board().settle(`${id}-implement`, 'failed');
    pauseAsk = pauseAskOf(id);
  });
  await s.test('REFUSED: the retry, held by the void ask, which the verb leaves for the tick', async () => {
    await assert.rejects(
      stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh', message: 'start over' })),
      refusedAs('Conflict', 'try 2 of implement is held by the ask ', 'nemia pause --now', `nemia retry ${id} implement`),
    );
    assert.deepEqual(onDisk(askFile(id, 'implement', 2)), pauseAsk);
    assert.equal(fs.existsSync(path.join(asksDir(id), 'done')), false, 'the verb moves no file the tick reads');
  });
  await s.test('a pass sets the void ask aside into done/', async () => {
    await stage.runWith(stage.board().e, advanceRun(readRun(id)));
    assert.deepEqual(onDisk(path.join(asksDir(id), 'done', 'retry-implement-2')), pauseAsk);
  });
  await s.test("the retry is then written at the ask's name", async () => {
    const { ask } = await stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh', message: 'start over' }));
    assert.deepEqual(onDisk(askFile(id, 'implement', 2)), ask);
  });
});

test('a pause ask still due holds a retry of its try, and is left as it is', async (t) => {
  const s = story(t);
  let id = '';
  let pauseAsk: unknown;
  await s.test('implement is filed and stopped by the pause, which wrote the ask of its next try', async () => {
    id = await startedOn(implementOnly(), 'the pause');
    stage.board().settle(`${id}-implement`, 'stopped');
    pauseAsk = pauseAskOf(id);
  });
  await s.test('REFUSED: the retry, the try asked by nemia pause --now; the ask left, nothing set aside', async () => {
    await assert.rejects(
      stage.runWith(stage.board().e, retryRun(id, 'implement', { mode: 'fresh' })),
      refusedAs('Conflict', 'try 2 of implement is asked by nemia pause --now'),
    );
    assert.deepEqual(onDisk(askFile(id, 'implement', 2)), pauseAsk);
    assert.equal(fs.existsSync(path.join(asksDir(id), 'done')), false);
  });
});

const cut: Question = {
  title: 'How is the card cut?',
  body: 'It is big.',
  options: [
    { label: 'one card', meaning: 'All at once.' },
    { label: 'two cards', meaning: 'The shape first.' },
    { label: 'three', meaning: 'Thin.' },
  ],
  recommended: 'two cards',
  multiple: false,
};
const where: Question = {
  title: 'Where do the answers go?',
  body: 'Either or both.',
  options: [
    { label: 'retry', meaning: 'Into the next try.' },
    { label: 'gate', meaning: 'With the approval.' },
  ],
  recommended: null,
  multiple: true,
};

/** A workflow folder of `plan → implement`, plan declaring `open`, a field of questions, gated where `gate` says so. */
const planned = (gate: boolean): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  const plan = ['place: git', 'output: plan.schema.json', ...(gate ? ['gate: true'] : [])];
  fs.writeFileSync(path.join(dir, 'plan.md'), `---\n${plan.join('\n')}\n---\nplan it\n`);
  fs.writeFileSync(
    path.join(dir, 'plan.schema.json'),
    JSON.stringify({
      type: 'object',
      properties: { open: { 'x-shape': 'questions', description: 'What is undecided.' } },
      required: ['open'],
      additionalProperties: false,
    }),
  );
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\nafter: plan\nplace: git\n---\nimplement it\n');
  return dir;
};

/** A run whose plan signed off — blocked, or done at its gate — asking `open`, on the stage's engine. */
const asking = async ({ gate = false, open = [cut, where] as unknown[] } = {}): Promise<string> => {
  const id = await startedOn(planned(gate), 'plan the flag');
  const outcome = gate ? 'done' : 'blocked';
  stage
    .board()
    .settle(`${id}-plan`, 'succeeded', { outcome, summary: 'Half.', artifacts: [], needs: gate ? null : 'Two questions.', open });
  await stage.runWith(stage.board().e, advanceRun(readRun(id)));
  return id;
};

/** What `nemia` printed, line by line, over the stage's engine. */
const printedBy = async (t: TestContext, argv: string[], e?: Engine) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => void printed.push(args.join(' ')));
  try {
    await stage.main(argv, e);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

const asksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f !== 'done') : []);
const askRead = (id: string, name: string) => JSON.parse(fs.readFileSync(path.join(asksDir(id), name), 'utf8'));
/** The line of `listed` for the step `plan` of the run `id`. */
const planOf = (listed: string[], id: string) =>
  listed.slice(listed.findIndex((l) => l.startsWith(`${id}  `))).find((l) => l.startsWith('   plan '));

test('a planner blocked on two questions is answered at the terminal', async (t) => {
  const s = story(t);
  let id = '';
  await s.test('plan signs off blocked, asking two questions', async () => {
    id = await asking();
  });
  await s.test(
    '`nemia decide` prints them numbered, each option lettered, the recommended marked, and the `--answer` to give',
    async (sub) => {
      const screen = await printedBy(sub, ['decide', id]);
      const at = screen.indexOf('    open:');
      assert.ok(at > 0, screen.join('\n'));
      assert.deepEqual(screen.slice(at, at + 12), [
        '    open:',
        '      1. How is the card cut?',
        '         It is big.',
        '         a  one card — All at once.',
        '         b  two cards — The shape first.  (recommended)',
        '         c  three — Thin.',
        '         choose one, or answer in your own words',
        '      2. Where do the answers go?',
        '         Either or both.',
        '         a  retry — Into the next try.',
        '         b  gate — With the approval.',
        '         choose one or more, or answer in your own words',
      ]);
      assert.ok(!screen.some((l) => l.includes('title: How is the card cut?')), 'the field is not dumped as well');
      assert.ok(
        screen.includes(`    to answer it:  nemia retry ${id} plan --answer 1=<letter> --answer 2=<letter> [--message "<note>"]`),
        screen.join('\n'),
      );
    },
  );
  await s.test('`nemia ls` counts the questions in the note of the step waiting on you', async (sub) => {
    const listed = await printedBy(sub, ['ls']);
    assert.match(planOf(listed, id) ?? '', /^ {3}plan +succeeded · BLOCKED +main +· asks 2 questions$/, listed.join('\n'));
  });
  await s.test(
    "`nemia retry --answer` files a try whose message is the board's words for the answers, given at the terminal",
    async (sub) => {
      const printed = await printedBy(sub, ['retry', id, 'plan', '--answer', '1=b', '--answer', '2=A,b: both']);
      const [ask] = asksOf(id);
      const expected = answerText(
        [cut, where],
        [
          { question: cut.title, chose: ['two cards'] },
          { question: where.title, chose: ['retry', 'gate'], own: 'both' },
        ],
        undefined,
        'at the terminal',
      );
      assert.equal(askRead(id, ask).message, expected);
      assert.match(printed[0], new RegExp(`^${id}  asked: try 2 of plan \\(--nudge\\), with your answers — `));
    },
  );
  await s.test('another run answered in its own words, `--message` the note', async (sub) => {
    const noted = await asking();
    await printedBy(sub, ['retry', noted, 'plan', '--answer', '1: neither', '--answer', '2=a', '--message', 'thanks']);
    const message = askRead(noted, asksOf(noted)[0]).message as string;
    assert.ok(message.endsWith('\n\nNote: thanks\n\nAnswered by: person, at the terminal'), message);
    assert.ok(message.includes('1. How is the card cut?\n   In my own words: neither'), message);
  });
});

test("a gated planner's questions are answered with its approval", async (t) => {
  const s = story(t);
  let id = '';
  await s.test('plan signs off done at its gate, asking two questions', async () => {
    id = await asking({ gate: true });
  });
  await s.test("`nemia decide` says its gate's approval with an `--answer` for each", async (sub) => {
    const screen = await printedBy(sub, ['decide', id]);
    const form = '--answer 1=<letter> --answer 2=<letter> [--message "<note>"]';
    assert.ok(
      screen.some((l) => l.startsWith(`    gate  awaiting approval:  nemia approve ${id} plan ${form}  — or send it back:`)),
      screen.join('\n'),
    );
  });
  await s.test('`nemia ls` counts the questions asked at the gate', async (sub) => {
    const listed = await printedBy(sub, ['ls']);
    assert.ok(planOf(listed, id)?.includes(' · asks 2 questions'), listed.join('\n'));
  });
  await s.test("`nemia approve --answer` approves with the board's words for the answers, given at the terminal", async (sub) => {
    const printed = await printedBy(sub, ['approve', id, 'plan', '--answer', '1=a', '--answer', '2=b', '--message', 'go']);
    const expected = approvedAnswerText(
      'plan',
      [cut, where],
      [
        { question: cut.title, chose: ['one card'] },
        { question: where.title, chose: ['gate'] },
      ],
      'go',
      'at the terminal',
    );
    assert.equal(askRead(id, 'approve-plan-1').message, expected);
    assert.match(printed[0], new RegExp(`^${id}  approved: try 1 of plan, with your answers — `));
  });
  await s.test('approved, it waits on no one: `nemia ls` says nothing of its questions', async (sub) => {
    const listed = await printedBy(sub, ['ls']);
    const line = planOf(listed, id);
    assert.ok(line !== undefined && !line.includes('asks'), listed.join('\n'));
  });
});

test('what `nemia decide` and `nemia ls` print of a step asking no question, or one that does not decode', async (t) => {
  await t.test('`nemia ls` says nothing of questions for a blocked step that asks none', async (sub) => {
    const bare = await asking({ open: [] });
    const listed = await printedBy(sub, ['ls']);
    assert.match(planOf(listed, bare) ?? '', /^ {3}plan +succeeded · BLOCKED +main$/, listed.join('\n'));
  });
  await t.test('a gate whose step asks none is approved with `--message`', async (sub) => {
    const bare = await asking({ gate: true, open: [] });
    const plain = await printedBy(sub, ['decide', bare]);
    const offer = `    gate  awaiting approval:  nemia approve ${bare} plan [--message "<words>"]  — or send it back:`;
    assert.ok(
      plain.some((l) => l.startsWith(offer)),
      plain.join('\n'),
    );
  });
  await t.test('a question field that does not decode is printed as a field, and offered `--message`', async (sub) => {
    const half = await asking({ open: [{ title: 'Half a question' }] });
    const screen = await printedBy(sub, ['decide', half]);
    assert.ok(screen.includes('    open:'), screen.join('\n'));
    assert.ok(!screen.some((l) => /^ {6}1\. /.test(l)), screen.join('\n'));
    assert.ok(screen.includes(`    to answer it:  nemia retry ${half} plan --message "<answer>"`), screen.join('\n'));
  });
});

test('REFUSED: `nemia retry --answer` that does not fit the questions the step asks now — exit 2, by name, nothing written', async (t) => {
  const id = await asking();
  const none = await asking({ open: [] });
  const retry = (run: string, ...answers: string[]) => stage.main(['retry', run, 'plan', ...answers.flatMap((a) => ['--answer', a])]);
  const rows: Array<[string, () => Promise<unknown>, string[]]> = [
    ['a number past them', () => retry(id, '1=a', '3=a'), ['--answer 3=a', 'question 3', '2', `nemia decide ${id}`]],
    ['a letter not offered', () => retry(id, '1=d', '2=a'), ['--answer 1=d', 'How is the card cut?', 'a (one card)']],
    ['a question answered twice', () => retry(id, '1=a', '1=b', '2=a'), ['"How is the card cut?"', 'twice']],
    ['a question left out', () => retry(id, '1=a'), ['"Where do the answers go?"', 'not answered']],
    ['two options where one is taken', () => retry(id, '1=a,b', '2=a'), ['"How is the card cut?"', 'one option']],
    ['no answer at all', () => retry(id, 'one=a'), ['--answer one=a']],
    [
      'a step that asks no questions, naming --message instead',
      () => retry(none, '1=a'),
      ['asks no questions', '--message "<words>", without --answer'],
    ],
    [
      '--answer with --recheck, before a run is read',
      () => stage.main(['retry', 'no-such-run-zz9z', 'plan', '--recheck', '--answer', '1=a']),
      ['--answer', '--recheck', '--answer <n>=<letter>'],
    ],
  ];
  for (const [name, typed, facts] of rows) await t.test(name, () => assert.rejects(typed(), refusedAs('Invalid', ...facts)));
  await t.test('nothing written', () => {
    assert.deepEqual(asksOf(id), []);
    assert.deepEqual(asksOf(none), []);
  });
});

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** A workflow folder: `implement`, with the frontmatter lines it is given, and `review` after it. */
const implementThenReview = (lines: string[] = []): string => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  fs.writeFileSync(path.join(dir, 'implement.md'), `---\n${['place: git', ...lines].join('\n')}\n---\nimplement it\n`);
  fs.writeFileSync(path.join(dir, 'review.md'), '---\nafter: implement\nplace: git\n---\nreview it\n');
  return dir;
};

/** `nemia start` of `workflowDir` over a fresh repository, the steps in its checkout: a repository run, unticked. */
const startedRun = async (workflowDir: string): Promise<RepositoryRun> => {
  const run = await stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir, isolate: false }));
  assert.ok(isRepositoryRun(run), `${run.id} works on a repository`);
  return run;
};

/** One pass of the tick over the run `id`, on the stage's engine. */
const tick = (id: string) => stage.runWith(stage.board().e, advanceRun(readRun(id)));

/** The attempt of `id` ended in `phase` with what `end` says — its closeout, exit code, reason, cost, denials, what it printed. */
const ended = (id: string, phase: string, end: TestEnd = {}): void => {
  stage.board().end(id, phase, end);
};

/** `nemia start` over `implement` (with `lines`) → `review`, run until implement, signed as `signed` says, has its check settled. */
const throughCheck = async (lines: string[], phase: string, end: TestEnd = {}, signed: TestEnd = { closeout: SIGNED }) => {
  const run = await startedRun(implementThenReview(lines));
  await tick(run.id);
  ended(`${run.id}-implement`, 'succeeded', signed);
  await tick(run.id);
  ended(`${run.id}-implement-check`, phase, end);
  return run;
};

/** The retry asks waiting in a run's directory, by name. */
const retryAsks = (id: string) => asksOf(id).filter((f) => f.startsWith('retry-'));
/** The record of `id` as the tick wrote it, unread by `readRun`. */
const recordText = (id: string) => fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8');

/**
 * A step's record without what every filing writes of the revisions it took — the agent and skill pins and the digest of its closeout
 * schema, whose subject is `revisions.test.ts`.
 */
const filedAs = (record: StepRecord | undefined): Partial<StepRecord> => {
  const { pinned: _, closeoutHash: __, ...rest } = record ?? { taskId: null };
  return rest;
};

/** The JSON under a brief's `heading`. */
const dataUnder = (brief: string, heading: string) =>
  JSON.parse(new RegExp(`${heading}\\n[\\s\\S]*?\\n\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``).exec(brief)![1]);

/** What `nemia` printed, joined, over the stage's engine. */
const printedAll = async (t: TestContext, argv: string[]) => (await printedBy(t, argv)).join('\n');

/** A declared closeout field set beside the four, as a step's `output:` schema says. */
const DECLARED = {
  type: 'object',
  properties: { notes: { type: 'array', items: { type: 'string' } }, noNotes: { type: ['string', 'null'] } },
  required: ['notes', 'noNotes'],
  additionalProperties: false,
};

test("a checked step, from its check's filing to `retries:` spent and the run waiting on you", async (t) => {
  const s = story(t);
  const b = stage.board();
  const dir = implementThenReview(['output: implement.schema.json', 'check: npm test && npm run typecheck', 'retries: 1']);
  fs.writeFileSync(path.join(dir, 'implement.schema.json'), JSON.stringify(DECLARED));
  let run: RepositoryRun;
  const id = () => run.id;
  const check1 = () => `${id()}-implement-check`;
  const try2 = () => `${id()}-implement-try2`;
  const check2 = () => `${id()}-implement-try2-check`;
  await s.test('implement is filed, and a `check:` planted in the folder afterwards is planted after the run froze it', async () => {
    run = await startedRun(dir);
    await tick(id());
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\ncheck: true\n---\nimplement it\n');
  });
  await s.test(
    'implement signs off, and the run files its check itself: the frozen command, in its workspace, on the check harness, the follower unfiled',
    async () => {
      ended(`${id()}-implement`, 'succeeded', { closeout: { ...SIGNED, notes: [], noNotes: 'a doc only' } });
      const pass = await tick(id());
      assert.deepEqual([pass.checked, pass.filed], [['implement'], []], 'the follower waits for the check, not for the agent');
      assert.deepEqual(
        filedAs(readRun(id()).steps.implement),
        {
          taskId: `${id()}-implement`,
          workspace: run.repo,
          branch: run.branch,
          check: { taskId: check1() },
          handedOff: `${id()}-implement`,
        },
        "`taskId` is still the step's own task, which apps/api reads; it is handed off in the pass that filed its check",
      );
      const spec = b.tasks.get(check1())!.spec;
      assert.deepEqual(
        { harness: spec.harness, cwd: spec.cwd, deadlineSeconds: spec.deadlineSeconds, closeoutSchema: spec.closeoutSchema },
        { harness: 'check', cwd: run.repo, deadlineSeconds: 3300, closeoutSchema: undefined },
        "a step's check that does not land the run keeps a round's bound on a hang (`CHECK_DEADLINE_SECONDS`), not a landing's",
      );
      assert.equal(
        'maxAttempts' in spec || 'resume' in spec,
        false,
        'one attempt, as every task is: the runtime refuses a count or a policy',
      );
      assert.equal(spec.brief, 'npm test && npm run typecheck', 'the brief is the frozen check line, not the one planted since');
      assert.deepEqual(spec.config, {
        command: ['sh', '-c', 'npm test && npm run typecheck'],
        env: {
          WF_RUN: id(),
          WF_STEP: 'implement',
          WF_BASE_REF: run.baseRef,
          WF_WORKSPACE: run.repo,
          WF_ARTIFACTS: path.join(ROOT, 'runs', id(), 'artifacts', 'implement'),
          WF_CLOSEOUT: path.join(ROOT, 'checks', `${check1()}.closeout.json`),
        },
        niceness: 10,
      });
      assert.ok(fs.statSync(path.join(ROOT, 'runs', id(), 'artifacts', 'implement')).isDirectory(), 'its files have somewhere to go');
    },
  );
  await s.test("the check is handed the step's closeout as a file, flat, a declared field at the top level beside the four", () => {
    const file = b.tasks.get(check1())!.spec.config?.env?.WF_CLOSEOUT ?? '';
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
      outcome: 'done',
      summary: 'did it',
      artifacts: [],
      notes: [],
      noNotes: 'a doc only',
    });
  });
  await s.test('the check is filed once, however many passes', async () => {
    await tick(id());
    assert.equal(b.filings.filter((f) => f === check1()).length, 1);
  });
  await s.test(
    '`retries: 1` re-files implement its check refused, continuing its session, told the command, the exit and both tails',
    async () => {
      ended(check1(), 'failed', {
        exitCode: 1,
        printed: { stdout: 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1\n', stderr: 'npm error Test failed.\n' },
      });
      const pass = await tick(id());
      assert.deepEqual([pass.tried, pass.filed, pass.blocked, pass.status], [['implement'], [], [], 'running']);
      const spec = b.tasks.get(try2())!.spec;
      assert.deepEqual(
        { cwd: spec.cwd, resumeFrom: spec.resumeFrom, harness: spec.harness },
        { cwd: run.repo, resumeFrom: `native-${id()}-implement`, harness: undefined },
      );
      assert.deepEqual(filedAs(readRun(id()).steps.implement), {
        taskId: try2(),
        workspace: run.repo,
        branch: run.branch,
        tries: [{ taskId: `${id()}-implement`, check: { taskId: check1() }, then: 'retries' }],
      });
      assert.match(spec.brief, /^## Try 2\n/);
      assert.deepEqual(JSON.parse(/\n```json\n([\s\S]*?)\n```/.exec(spec.brief)![1]), {
        command: 'npm test && npm run typecheck',
        exit: 1,
        stdout: 'ok 1 - builds\nnot ok 2 - parses a trailing comma\n# fail 1',
        stderr: 'npm error Test failed.',
      });
      assert.match(spec.brief, /Do not weaken the check to pass it/, 'and not to weaken the check');
    },
  );
  await s.test('try 2 is filed once, however many passes', async () => {
    await tick(id());
    assert.equal(b.filings.filter((f) => f === try2()).length, 1);
  });
  await s.test(
    'try 2 signs off and is checked under an id of its own; refused too, past `retries: 1` nothing is filed, pass after pass, and the run failed',
    async () => {
      ended(try2(), 'succeeded', { closeout: { ...SIGNED, notes: [], noNotes: null } });
      assert.deepEqual((await tick(id())).checked, ['implement']);
      ended(check2(), 'failed', {
        exitCode: 1,
        printed: { stdout: 'not ok 3 - parses a trailing comma\n# fail 1\n', stderr: 'npm error Test failed.\n' },
      });
      for (let pass = 1; pass <= 3; pass++) {
        const after = await tick(id());
        assert.deepEqual(
          [after.tried, after.filed, after.checked, after.blocked, after.status],
          [[], [], [], ['review'], 'failed'],
          `pass ${pass}`,
        );
      }
      assert.deepEqual(b.filings, [`${id()}-implement`, check1(), try2(), check2()], 'past `retries: 1`, nothing more');
    },
  );
  await s.test('`nemia ls` and `nemia decide` read the refused check from the streams the runtime kept, and it waits on you', async () => {
    const l = await stage.runWith(b.e, list(b.e, readRun(id())));
    assert.deepEqual(
      l.steps.map((x) => x.status),
      ['failed ✗ check (exit 1)', 'waiting'],
    );
    assert.deepEqual([l.waitingOnYou, l.steps[0].note], [['implement'], 'try 2, by retries: 1']);
    const { decision: d, checks } = await stage.runWith(b.e, decideRun(id()));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failedCheck], ['failed', ['implement']]);
    assert.deepEqual(checks.implement, {
      command: 'npm test && npm run typecheck',
      passed: false,
      verdict: 1,
      stdout: 'not ok 3 - parses a trailing comma\n# fail 1',
      stderr: 'npm error Test failed.',
    });
  });
});

const CHECK_SAID = "## What implement's check said";
/** The line a check that touched no page prints last. */
const NO_PAGES = 'wf check: nothing under apps/web/ or apps/api/ was touched: no build, no e2e';
const NAMED_1 = '#1 run-dark.png, for apps/web/src/routes/run.tsx (0.4 s)';
const NAMED_2 = '#2 factory-light.png, for apps/web/src/routes/factory.tsx (0.3 s)';
/** A check's stdout as `workflows/build`'s prints it: turbo's prefixed lines, the pictures' `wf pictures:` lines, then a long tail. */
const PICTURES = [
  'agent-orchestrator:test: ✔ files a step (12 ms)',
  'agent-orchestrator:test: wf pictures: a line a test printed, prefixed by turbo',
  'wf pictures: the pages this change touched: run, factory',
  `wf pictures: named ${NAMED_1}`,
  `wf pictures: named ${NAMED_2}`,
  'wf pictures: 2 picture(s) named, 0 missing, in 3.1 s',
  ...Array.from({ length: 24 }, (_, i) => `web:build: chunk ${i} built`),
  NO_PAGES,
  '',
].join('\n');

test('the step after a checked step is handed what the check said, and one after a step with no `check:` none', async (t) => {
  const s = story(t);
  const b = stage.board();
  let id = '';
  await s.test("review is handed its exit, the tails, and every `wf <name>:` line of the check's whole stdout, in its brief", async () => {
    id = (
      await throughCheck(['check: npm test'], 'succeeded', {
        exitCode: 0,
        printed: { stdout: PICTURES, stderr: 'npm warn deprecated glob@7\n' },
      })
    ).id;
    assert.doesNotMatch(await Effect.runPromise(b.e.logs(`${id}-implement-check`)), /wf pictures:/, "the engine's log holds none of them");
    assert.deepEqual((await tick(id)).filed, ['review']);
    const brief = b.tasks.get(`${id}-review`)!.spec.brief;
    assert.match(brief, /\n## What implement's check said\n\nIt passed: exited 0\./);
    const said = dataUnder(brief, CHECK_SAID) as { stdout: string; reported: string[] };
    assert.deepEqual(said.reported, [
      'wf pictures: the pages this change touched: run, factory',
      `wf pictures: named ${NAMED_1}`,
      `wf pictures: named ${NAMED_2}`,
      'wf pictures: 2 picture(s) named, 0 missing, in 3.1 s',
      NO_PAGES,
    ]);
    assert.doesNotMatch(said.stdout, /named #/, 'the marked lines are above the tail, so only the whole stdout hands them');
    assert.match(brief, /from all of it and not only the tail\./);
    assert.deepEqual(dataUnder(brief, CHECK_SAID), {
      command: 'npm test',
      exit: 0,
      stdout: [...Array.from({ length: 19 }, (_, i) => `web:build: chunk ${i + 5} built`), NO_PAGES].join('\n'),
      stderr: 'npm warn deprecated glob@7',
      reported: said.reported,
    });
  });
  await s.test("review, failed and tried afresh, is handed that check in its try's brief too", async () => {
    ended(`${id}-review`, 'failed', { exitCode: 1 });
    await stage.runWith(b.e, retryRun(id, 'review', { mode: 'fresh' }));
    assert.deepEqual((await tick(id)).tried, ['review']);
    const said = dataUnder(b.tasks.get(`${id}-review-try2`)!.spec.brief, CHECK_SAID) as { reported: string[] };
    assert.ok(said.reported.includes(`wf pictures: named ${NAMED_1}`), said.reported.join('\n'));
  });
  await s.test(
    "another run's implement, with no `check:`, signs off: review is filed, and no check, and is handed no check's word",
    async () => {
      const plain = await startedRun(implementThenReview());
      await tick(plain.id);
      ended(`${plain.id}-implement`, 'succeeded', { closeout: SIGNED });
      assert.deepEqual((await tick(plain.id)).filed, ['review']);
      assert.ok(!b.tasks.get(`${plain.id}-review`)!.spec.brief.includes(CHECK_SAID));
      ended(`${plain.id}-review`, 'succeeded', { closeout: SIGNED });
      const last = await tick(plain.id);
      assert.deepEqual(
        b.filings.filter((f) => f.startsWith(plain.id)),
        [`${plain.id}-implement`, `${plain.id}-review`],
        'never a check task, from the first pass to the last',
      );
      assert.equal(last.status, 'succeeded');
      assert.equal(readRun(plain.id).steps.implement?.check, undefined);
    },
  );
});

test('a check that ended stopped spends no retry, and `nemia retry --recheck` runs it again, and nothing else', async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  const check1 = () => `${run.id}-implement-check`;
  const check2 = () => `${run.id}-implement-try2-check`;
  await s.test('implement, with `retries: 2`, signs off and its check is stopped: pass after pass, no try is spent', async () => {
    run = await throughCheck(['check: npm test', 'retries: 2'], 'stopped');
    for (let pass = 1; pass <= 2; pass++) {
      const after = await tick(run.id);
      assert.deepEqual([after.tried, after.filed, after.blocked, after.status], [[], [], ['review'], 'failed'], `pass ${pass}`);
    }
    assert.equal(readRun(run.id).steps.implement?.tries, undefined, 'no try spent');
  });
  await s.test('it waits on you, and `nemia decide` says its check did not finish and offers --recheck', async () => {
    assert.deepEqual((await stage.runWith(b.e, list(b.e, readRun(run.id)))).waitingOnYou, ['implement']);
    const { decision: d, offers } = await stage.runWith(b.e, decideRun(run.id));
    assert.deepEqual(d.kind === 'awaiting' && [d.failedCheck, d.unfinishedCheck], [[], ['implement']]);
    assert.deepEqual(offers, [
      `implement: its check did not finish, so no retry was spent on it. Run the check again, and nothing else:  nemia retry ${run.id} implement --recheck`,
    ]);
  });
  await s.test('`--recheck` files a check, and no step', async () => {
    await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'recheck' }));
    const pass = await tick(run.id);
    assert.deepEqual([pass.tried, pass.checked, pass.filed], [['implement'], ['implement'], []]);
    assert.deepEqual(b.filings, [`${run.id}-implement`, check1(), check2()], 'a check, and no step');
    assert.equal(b.tasks.get(check2())!.spec.harness, 'check');
    assert.deepEqual(filedAs(readRun(run.id).steps.implement), {
      taskId: `${run.id}-implement`,
      workspace: run.repo,
      branch: run.branch,
      check: { taskId: check2() },
      tries: [{ taskId: `${run.id}-implement`, check: { taskId: check1() }, then: 'recheck' }],
    });
  });
  await s.test('the check exits 0: the work passed as it stood, and the follower is filed', async () => {
    ended(check2(), 'succeeded', { exitCode: 0 });
    assert.deepEqual((await tick(run.id)).filed, ['review']);
  });
});

test("`nemia retry` writes a person's ask, and the tick honours it once, consuming it whole", async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  let file = '';
  let written = '';
  const try2 = () => `${run.id}-implement-try2`;
  await s.test(
    'implement is refused by its check; `nemia retry --model opus` writes the ask beside the record, and no record',
    async () => {
      run = await throughCheck(['check: npm test'], 'failed', { exitCode: 1 });
      const asked = await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh', model: 'opus' }));
      file = asked.file;
      assert.equal(file, path.join(asksDir(run.id), 'retry-implement-2'));
      written = fs.readFileSync(file, 'utf8');
      assert.deepEqual(JSON.parse(written), asked.ask);
      assert.equal(readRun(run.id).steps.implement?.tries, undefined, 'the verb writes no record');
      assert.match((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].note ?? '', /^try 2 asked \(--model opus\)/);
    },
  );
  await s.test('the next pass files try 2, a new session on the model asked, told everything a step starting cold is', async () => {
    assert.deepEqual((await tick(run.id)).tried, ['implement']);
    const spec = b.tasks.get(try2())!.spec;
    assert.deepEqual({ model: spec.config?.model, resumeFrom: spec.resumeFrom }, { model: 'opus', resumeFrom: undefined });
    assert.match(spec.brief, /## What was asked for\n\nadd a flag/);
  });
  await s.test('the ask is consumed, moved whole into done/, and a second pass files nothing', async () => {
    assert.deepEqual(retryAsks(run.id), []);
    assert.equal(fs.readFileSync(path.join(asksDir(run.id), 'done', 'retry-implement-2'), 'utf8'), written);
    const second = await tick(run.id);
    assert.deepEqual([second.tried, second.filed, second.checked], [[], [], []]);
  });
  await s.test(
    'the ask put back, as a pass that filed the try and died before consuming it leaves it: spent, it files nothing',
    async () => {
      fs.copyFileSync(path.join(asksDir(run.id), 'done', 'retry-implement-2'), file);
      const third = await tick(run.id);
      assert.deepEqual([third.tried, retryAsks(run.id)], [[], []]);
      assert.equal(b.filings.filter((f) => f === try2()).length, 1);
      assert.deepEqual(
        readRun(run.id).steps.implement?.tries?.map((x) => [x.then, x.model]),
        [['fresh', 'opus']],
      );
    },
  );
});

test('`nemia retry --model` on a Claude Code step in `auto` (F21): a haiku model refused, by name, writing no ask; anything that keeps the step as it asked is asked', async (t) => {
  const refusedModel = async (lines: string[], model: string, ...facts: string[]) => {
    const run = await throughCheck(['check: npm test', ...lines], 'failed', { exitCode: 1 });
    await assert.rejects(
      stage.runWith(stage.board().e, retryRun(run.id, 'implement', { mode: 'fresh', model })),
      (err: Error & { exitCode?: number; _tag?: string }) => {
        refusedAs('Conflict', `\`--model ${model}\``, `nemia retry ${run.id} implement --model sonnet`, ...facts)(err);
        assert.doesNotMatch(err.message, /F21|measured/, 'no finding number, no version');
        return true;
      },
    );
    assert.deepEqual(retryAsks(run.id), [], 'nothing written');
  };
  const askedModel = async (lines: string[], model: string) => {
    const run = await throughCheck(['check: npm test', ...lines], 'failed', { exitCode: 1 });
    assert.equal((await stage.runWith(stage.board().e, retryRun(run.id, 'implement', { mode: 'fresh', model }))).ask.model, model);
  };
  for (const model of ['haiku', 'claude-haiku-4-5-20251001', 'claude-sonnet-4-5'])
    await t.test(`REFUSED ${model} on a step that names no mode, filed in \`auto\` by default`, () =>
      refusedModel([], model, 'implement names no `permissionMode:`', '`auto`', 'a job denies every call `default` would ask about'),
    );
  await t.test('REFUSED haiku on a step that says `permissionMode: auto`', () =>
    refusedModel(['permissionMode: auto'], 'haiku', 'implement says `permissionMode: auto`'),
  );
  await t.test('sonnet, which keeps the mode, is asked', () => askedModel([], 'sonnet'));
  await t.test('haiku on a step in `dontAsk` is asked', () => askedModel(['permissionMode: dontAsk'], 'haiku'));
  await t.test('haiku on a codex step is asked', () => askedModel(['harness: codex'], 'haiku'));
});

test('REFUSED: `nemia retry` on what the run is in — exit 2, by kind and name, and no ask written', async (t) => {
  const b = stage.board();
  const settledAs = async (lines: string[], phase: string, end: TestEnd = {}) => {
    const run = await startedRun(implementThenReview(lines));
    await tick(run.id);
    ended(`${run.id}-implement`, phase, end);
    return run.id;
  };
  const rows: Array<[string, () => Promise<{ id: string; refused: () => Promise<unknown>; facts: string[] }>]> = [
    [
      'a running step, asked through the API',
      async () => {
        const id = await settledAs(['check: npm test'], 'running');
        return {
          id,
          refused: () => stage.runWith(b.e, retryRun(id, 'implement', { mode: 'nudge' })),
          facts: ['implement is still running'],
        };
      },
    ],
    [
      'a running step, as typed, naming how to read it and how to call it off',
      async () => {
        const id = await settledAs([], 'running');
        return {
          id,
          refused: () => stage.main(['retry', id, 'implement']),
          facts: ['implement is still running', `nemia ls ${id}`, `nemia cancel ${id}`],
        };
      },
    ],
    [
      'a running step, typed with --fresh',
      async () => {
        const id = await settledAs([], 'running');
        return { id, refused: () => stage.main(['retry', id, 'implement', '--fresh']), facts: ['implement is still running'] };
      },
    ],
    [
      'a session its harness blocked, asked through the API without stopping it first',
      async () => {
        const id = await settledAs([], 'needs-human');
        return {
          id,
          refused: () => stage.runWith(b.e, retryRun(id, 'implement', { mode: 'nudge' })),
          facts: ['implement is still running'],
        };
      },
    ],
    [
      '--recheck of a session its harness blocked: no check of it failed',
      async () => {
        const id = await settledAs([], 'needs-human');
        return {
          id,
          refused: () => stage.main(['retry', id, 'implement', '--recheck']),
          facts: ['implement is running', 'no check of it failed', `nemia retry ${id} implement`, '--fresh'],
        };
      },
    ],
    [
      'a step that signed off and runs on',
      async () => {
        const id = await settledAs([], 'needs-human', { closeout: SIGNED });
        return { id, refused: () => stage.main(['retry', id, 'implement']), facts: ['implement is still running'] };
      },
    ],
    [
      'a cancelled run',
      async () => {
        const { id } = await throughCheck(['check: npm test'], 'failed', { exitCode: 1 });
        markCancelled(id);
        return {
          id,
          refused: () => stage.runWith(b.e, retryRun(id, 'implement', { mode: 'nudge' })),
          facts: ['was cancelled at ', 'never be honoured'],
        };
      },
    ],
    [
      'a step the run tries again itself',
      async () => {
        const { id } = await throughCheck(['check: npm test', 'retries: 1'], 'failed', { exitCode: 1 });
        return {
          id,
          refused: () => stage.runWith(b.e, retryRun(id, 'implement', { mode: 'nudge' })),
          facts: ['the run tries implement again itself'],
        };
      },
    ],
    [
      'an empty --message',
      async () => {
        const { id } = await throughCheck(['check: npm test'], 'stopped');
        return {
          id,
          refused: () => stage.runWith(b.e, retryRun(id, 'implement', { mode: 'nudge', message: ' \n' })),
          facts: ['--message is empty'],
        };
      },
    ],
    [
      '--message on --recheck, naming the recheck and the answer to give instead',
      async () => {
        const { id } = await throughCheck(['check: npm test'], 'stopped');
        return {
          id,
          refused: () => stage.runWith(b.e, retryRun(id, 'implement', { mode: 'recheck', message: 'the suite is fixed' })),
          facts: [`nemia retry ${id} implement --recheck`, `nemia retry ${id} implement --message "<answer>"`],
        };
      },
    ],
  ];
  for (const [name, made] of rows)
    await t.test(name, async () => {
      const { id, refused, facts } = await made();
      await assert.rejects(refused(), refusedAs('Conflict', ...facts));
      assert.deepEqual([retryAsks(id), b.stopped], [[], []], 'no ask written, nothing stopped');
    });
  await t.test('a second ask for the same try, the first standing', async () => {
    const { id } = await throughCheck(['check: npm test'], 'failed', { exitCode: 1 });
    await stage.runWith(b.e, retryRun(id, 'implement', { mode: 'nudge' }));
    await assert.rejects(
      stage.runWith(b.e, retryRun(id, 'implement', { mode: 'recheck' })),
      refusedAs('Conflict', 'try 2 of implement is already asked for', '(--nudge'),
    );
    assert.deepEqual(retryAsks(id), ['retry-implement-2']);
    assert.equal(JSON.parse(fs.readFileSync(path.join(asksDir(id), 'retry-implement-2'), 'utf8')).mode, 'nudge');
  });
  await t.test('a message to a step whose check did not finish is no refusal: a person may have something to say', async () => {
    const { id } = await throughCheck(['check: npm test'], 'stopped');
    await stage.runWith(b.e, retryRun(id, 'implement', { mode: 'fresh', message: 'main has the fix for the flake' }));
    assert.deepEqual(retryAsks(id), ['retry-implement-2']);
  });
});

test('REFUSED: `nemia retry` as typed, before a run is read — exit 2, by name', async (t) => {
  const typed = (...flags: string[]) => stage.main(['retry', 'no-such-run', 'implement', ...flags]);
  const rows: Array<[string, string[], string[]]> = [
    ['two ways to try', ['--fresh', '--recheck'], ['pick one of --nudge, --fresh, --model <m>, --recheck']],
    ['--model with no name', ['--model'], ['--model takes the model']],
    ['--model followed by a flag', ['--model', '--fresh'], ['--model takes the model']],
    ['a flag it does not take', ['--harder'], ['does not take --harder']],
    ['--message empty', ['--message', ''], ['--message is empty', 'nemia retry no-such-run implement --message "<answer>"']],
    ['--message= empty', ['--message=', '--fresh'], ['--message is empty', 'nemia retry no-such-run implement --message "<answer>"']],
    [
      '--message on --recheck',
      ['--recheck', '--message', 'the second reading'],
      ['--recheck', 'nemia retry no-such-run implement --recheck', 'nemia retry no-such-run implement --message "<answer>"'],
    ],
    ['--message with no words', ['--message'], ['--message takes what to tell the step', 'quoted']],
    [
      '--message followed by its own flag, naming the = form',
      ['--message', '--fresh'],
      ['--message takes what to tell the step', '--message=--fresh'],
    ],
    ['--message followed by --model', ['--nudge', '--message', '--model', 'opus'], ['--message takes what to tell the step', '--model']],
    ['--message twice', ['--message=a', '--message', 'b'], ['nemia retry takes --message once']],
    ['--budget with no amount', ['--budget'], ['--budget takes', 'nemia retry <runId> <step> --budget <amount>']],
    ['--budget a word', ['--budget', 'five'], [', and five is not one: ']],
    ['--budget 0', ['--budget', '0'], [', and 0 is not one: ']],
    ['--budget with a unit', ['--budget', '$5'], [', and $5 is not one: ']],
    ['--budget twice', ['--budget', '5', '--budget', '6'], ['nemia retry takes --budget once']],
    [
      '--budget on --recheck',
      ['--recheck', '--budget', '5'],
      ['--recheck', 'nemia retry no-such-run implement --recheck', 'nemia retry no-such-run implement --budget <amount>'],
    ],
  ];
  for (const [name, flags, facts] of rows) await t.test(name, () => assert.rejects(typed(...flags), refusedAs('Invalid', ...facts)));
  await t.test('`--budget=<amount>` is read, and the run looked for: Missing', () =>
    assert.rejects(typed('--budget=5'), (err: Error & { exitCode?: number }) => {
      assert.ok(err instanceof Missing, err.message);
      names(err.message, 'no such run: no-such-run', 'nemia ls');
      return true;
    }),
  );
});

test('`nemia retry --message` takes the next argument as the answer whatever it starts with, and `--message=<answer>` too', async (t) => {
  const asked = async (sub: TestContext, ...flags: string[]) => {
    const { id } = await throughCheck(['check: npm test'], 'stopped');
    await printedBy(sub, ['retry', id, 'implement', ...flags]);
    const { step: _, try: __, at: ___, ...how } = JSON.parse(fs.readFileSync(path.join(asksDir(id), 'retry-implement-2'), 'utf8'));
    return how;
  };
  const rows: Array<[string, string[], object]> = [
    [
      'an answer about a flag names it',
      ['--message', '--flag stays; say so in the README'],
      { mode: 'nudge', message: '--flag stays; say so in the README' },
    ],
    ['after --fresh', ['--fresh', '--message', '-n is short for --dry-run'], { mode: 'fresh', message: '-n is short for --dry-run' }],
    ["a flag's name, as the whole answer", ['--message=--fresh'], { mode: 'nudge', message: '--fresh' }],
    ['beside --model', ['--message=keep --flag=on', '--model', 'opus'], { mode: 'fresh', model: 'opus', message: 'keep --flag=on' }],
  ];
  for (const [name, flags, how] of rows) await t.test(name, async (sub) => assert.deepEqual(await asked(sub, ...flags), how));
});

test('a blocked step answered with `nemia retry --message`', async (t) => {
  const s = story(t);
  const b = stage.board();
  const answer = 'Keep it.\nThe flag is public: say so in the README.';
  let run: RepositoryRun;
  let ask: { at: string };
  const try2 = () => `${run.id}-implement-try2`;
  await s.test('implement signs off blocked, asking', async () => {
    run = await startedRun(implementThenReview());
    await tick(run.id);
    ended(`${run.id}-implement`, 'succeeded', {
      closeout: { outcome: 'blocked', summary: 'two readings', artifacts: [], needs: 'Rename --flag, or keep it?' },
    });
    await tick(run.id);
  });
  await s.test("the answer is written on the person's ask and nothing else; `nemia ls` says the try is asked with it", async () => {
    const record = recordText(run.id);
    const asked = await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', message: answer }));
    ask = asked.ask;
    assert.deepEqual(JSON.parse(fs.readFileSync(asked.file, 'utf8')), {
      step: 'implement',
      try: 2,
      mode: 'nudge',
      message: answer,
      at: ask.at,
    });
    assert.equal(recordText(run.id), record, 'the verb writes no record');
    assert.equal(
      (await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].note,
      'try 2 asked (--nudge, with your answer) — the next tick files it',
    );
  });
  await s.test("the tick carries it into the try's brief as `## Your answer`, and the record keeps no message", async () => {
    const pass = await tick(run.id);
    assert.deepEqual(pass.tried, ['implement']);
    assert.ok(pass.notes.includes('implement: try 2 — nemia retry --nudge, with your answer'), pass.notes.join('\n'));
    const brief = b.tasks.get(try2())!.spec.brief;
    assert.match(brief, /^## Try 2\n\nThe last try signed off `blocked`\./, 'its session continued, told why it is back');
    assert.ok(brief.includes(`\n\n## Your answer\n\n\`\`\`text\n${answer}\n\`\`\``), brief);
    assert.equal(readRun(run.id).steps.implement?.tries?.[0]?.then, 'nudge');
    assert.ok(!recordText(run.id).includes('say so in the README'), 'the record keeps no message');
    assert.deepEqual(retryAsks(run.id), [], 'consumed');
  });
  await s.test('`nemia ls` says the try running was answered, read off the consumed ask; it is honoured once', async () => {
    ended(try2(), 'running');
    assert.equal((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].note, 'try 2, nudged on your word, answered');
    assert.deepEqual(readAnswers(run.id), [{ ...ask }]);
    await tick(run.id);
    assert.equal(b.filings.filter((f) => f === try2()).length, 1);
  });
});

test('`nemia retry` on a step whose session its harness blocked: the tick stops the session, files nothing while it stops, and once it has, a nudge that continues it', async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  const taskId = () => `${run.id}-implement`;
  const try2 = () => `${run.id}-implement-try2`;
  await s.test('`nemia retry`, as a person types it, asks for try 2, and says the tick stops the session first', async (sub) => {
    run = await startedRun(implementThenReview());
    await tick(run.id);
    ended(taskId(), 'needs-human');
    const printed = await printedBy(sub, ['retry', run.id, 'implement']);
    assert.deepEqual(retryAsks(run.id), ['retry-implement-2']);
    assert.equal(
      printed[0],
      `${run.id}  asked: try 2 of implement (--nudge) — its harness blocked its session: the next tick stops it, and files the try once it has stopped`,
    );
  });
  await s.test('`nemia ls` says the phase alone, and the try asked', async () => {
    assert.deepEqual((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0], {
      name: 'implement',
      status: 'needs-human',
      branch: run.branch,
      note: 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it',
    });
  });
  await s.test('the next pass asks the engine to stop the session, files nothing, and writes no record', async () => {
    const record = recordText(run.id);
    const first = await tick(run.id);
    assert.deepEqual([b.stopped, first.tried, first.filed, first.status], [[taskId()], [], [], 'running']);
    assert.ok(
      first.notes.some((n) =>
        n.startsWith('implement: try 2 — nemia retry --nudge; its harness blocked its session, so the engine is asked to stop it'),
      ),
      first.notes.join('\n'),
    );
    assert.equal(recordText(run.id), record, 'the record untouched');
    assert.deepEqual(retryAsks(run.id), ['retry-implement-2'], 'the ask waits for its try');
  });
  await s.test('passes while the engine stops it carry nothing: no second stop, nothing filed', async () => {
    for (let pass = 1; pass <= 2; pass++) {
      const again = await tick(run.id);
      assert.deepEqual([b.stopped, again.tried, again.filed, again.notes], [[taskId()], [], [], []], `pass ${pass}`);
    }
  });
  await s.test('settled stopped, the next pass files try 2 as a nudge that continues the blocked session, once', async () => {
    ended(taskId(), 'stopped');
    const filed = await tick(run.id);
    assert.deepEqual([filed.tried, b.filings], [['implement'], [taskId(), try2()]]);
    const spec = b.tasks.get(try2())!.spec;
    assert.equal(spec.resumeFrom, `native-${taskId()}`);
    assert.match(
      spec.brief,
      /^## Try 2\n\nThe last try's session was stopped before it signed off\.\nA person asked for this try: `nemia retry --nudge`\./,
    );
    assert.deepEqual(readRun(run.id).steps.implement?.tries, [{ taskId: taskId(), then: 'nudge' }]);
    assert.deepEqual(retryAsks(run.id), [], 'consumed');
    const after = await tick(run.id);
    assert.deepEqual([after.tried, b.stopped, b.filings.filter((f) => f === try2()).length], [[], [taskId()], 1]);
  });
});

test('`nemia retry` on a blocked session that works again before any tick: stopped once, then its try filed', async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  const taskId = () => `${run.id}-implement`;
  await s.test('asked while its harness blocked it, the session works again: `nemia ls` says it is stopping it', async (sub) => {
    run = await startedRun(implementThenReview());
    await tick(run.id);
    ended(taskId(), 'needs-human');
    await printedBy(sub, ['retry', run.id, 'implement']);
    assert.deepEqual(retryAsks(run.id), ['retry-implement-2']);
    ended(taskId(), 'running');
    assert.deepEqual((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0], {
      name: 'implement',
      status: 'running',
      branch: run.branch,
      note: 'try 2 asked (--nudge) — stopping its session, then the tick files it',
    });
  });
  await s.test('the next pass asks the engine to stop it and files nothing; passes after it stop nothing more', async () => {
    const record = recordText(run.id);
    const first = await tick(run.id);
    assert.deepEqual([b.stopped, first.tried, first.filed, first.status], [[taskId()], [], [], 'running']);
    assert.ok(
      first.notes.includes(
        'implement: try 2 — nemia retry --nudge; its session runs on, asked for while its harness had blocked it, so the engine is asked to stop it, and the try is filed once it has',
      ),
      first.notes.join('\n'),
    );
    assert.equal(recordText(run.id), record);
    for (let pass = 1; pass <= 2; pass++) {
      const again = await tick(run.id);
      assert.deepEqual([b.stopped, again.tried, again.filed, again.notes], [[taskId()], [], [], []], `pass ${pass}`);
    }
  });
  await s.test('settled stopped, try 2 is filed once, continuing the session', async () => {
    ended(taskId(), 'stopped');
    assert.deepEqual((await tick(run.id)).tried, ['implement']);
    assert.equal(b.tasks.get(`${taskId()}-try2`)!.spec.resumeFrom, `native-${taskId()}`);
    assert.deepEqual(retryAsks(run.id), []);
    await tick(run.id);
    assert.deepEqual([b.stopped, b.filings.filter((f) => f === `${taskId()}-try2`).length], [[taskId()], 1]);
  });
});

test('a step that says `denials: fail`, denied a call, is stopped until a fresh try is told what was denied', async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  const taskId = () => `${run.id}-implement`;
  await s.test('implement signs off denied a call: nothing after it is filed, however many passes', async () => {
    run = await startedRun(implementThenReview(['denials: fail']));
    await tick(run.id);
    ended(taskId(), 'succeeded', { closeout: SIGNED, denials: [{ tool: 'Write', what: '/tmp/w/notes.md' }] });
    await tick(run.id);
    await tick(run.id);
    assert.deepEqual(b.filings, [taskId()]);
  });
  await s.test('`nemia ls` reads it denied, with the call, and waiting on you', async () => {
    const listed = await stage.runWith(b.e, list(b.e, readRun(run.id)));
    assert.deepEqual(
      [listed.steps[0].status, shownNote(listed.steps[0]), listed.waitingOnYou],
      ['denied', 'denied: Write(/tmp/w/notes.md)', ['implement']],
    );
  });
  await s.test('`nemia decide` names the rule for `allowedTools:` and offers `--fresh`', async (sub) => {
    const decided = await printedAll(sub, ['decide', run.id]);
    assert.match(decided, /\n {2}DENIED, waiting on you: implement {2}— its harness denied its try a call/);
    assert.match(
      decided,
      new RegExp(
        `add Edit\\(//tmp/w/notes\\.md\\) to the folder's allowedTools:, .* told to do without it: {2}nemia retry ${run.id} implement --fresh {2}\\(`,
      ),
    );
  });
  await s.test('the fresh try is a new task, told what was denied', async (sub) => {
    await printedBy(sub, ['retry', run.id, 'implement', '--fresh']);
    await tick(run.id);
    const again = b.filings.at(-1)!;
    assert.notEqual(again, taskId(), 'a new task for try 2');
    const brief = b.tasks.get(again)!.spec.brief;
    assert.match(brief, /## What your session was denied\n\n```text\nWrite\(\/tmp\/w\/notes\.md\)\n```/);
    assert.match(brief, /the same call will be denied again/);
  });
  await s.test('denied nothing, it hands on', async () => {
    ended(b.filings.at(-1)!, 'succeeded', { closeout: SIGNED });
    await tick(run.id);
    assert.equal(b.filings.at(-1), `${run.id}-review`);
  });
});

test('telling a running step something with `nemia say`, and the try that continues its session handed it', async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  const taskId = () => `${run.id}-implement`;
  const saidTo = () => b.tasks.get(taskId())!.said;
  let record = '';
  let beside: string[] = [];
  await s.test(
    "`nemia say` hands the words to the step's task through the engine's `say`, and prints the line it journalled",
    async (sub) => {
      run = await startedRun(implementThenReview());
      await tick(run.id);
      ended(taskId(), 'running');
      record = recordText(run.id);
      beside = fs.readdirSync(path.join(ROOT, 'runs')).sort();
      const printed = await printedBy(sub, ['say', run.id, 'implement', 'Widen', 'the', 'scope', 'to', 'apps/api', 'too.']);
      const [first] = saidTo();
      assert.deepEqual([first.attempt, first.text], [1, 'Widen the scope to apps/api too.'], 'an unquoted sentence is one message');
      assert.deepEqual(printed, [
        `${run.id}  said to implement, try 1, at ${first.at} — journalled on ${taskId()}: nemia decide ${run.id} prints it under the step`,
        '   ```text',
        '   Widen the scope to apps/api too.',
        '   ```',
      ]);
    },
  );
  await s.test('it writes nothing of its own: the record untouched, no file beside it', () => {
    assert.equal(recordText(run.id), record);
    assert.deepEqual(fs.readdirSync(path.join(ROOT, 'runs')).sort(), beside, 'the engine journal is the record');
  });
  await s.test('`nemia ls` notes the step said to, once and then twice', async () => {
    assert.deepEqual((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0], {
      name: 'implement',
      status: 'running',
      branch: run.branch,
      note: 'said to 1×',
    });
    const told = await stage.runWith(b.e, sayRun(run.id, 'implement', 'Keep:\n```\n--flag\n```'));
    assert.deepEqual([told.taskId, told.try, told.said], [taskId(), 1, saidTo()[1]]);
    assert.equal((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].note, 'said to 2×');
  });
  await s.test('signed off blocked, `nemia decide` prints each thing said under the step, before its closeout, fenced', async (sub) => {
    ended(taskId(), 'succeeded', {
      closeout: { outcome: 'blocked', summary: 'IMPLEMENTER-SUMMARY', artifacts: [], needs: 'Rename --flag?' },
    });
    const printed = await printedBy(sub, ['decide', run.id]);
    const [first, second] = saidTo();
    const under = printed.indexOf(`    said to try 1, at ${first.at}:`);
    const blocked = printed.indexOf('  implement  BLOCKED');
    assert.ok(blocked >= 0 && blocked < under, printed.join('\n'));
    assert.deepEqual(printed.slice(under, under + 8), [
      `    said to try 1, at ${first.at}:`,
      '    ```text',
      '    Widen the scope to apps/api too.',
      '    ```',
      `    said to try 1, at ${second.at}:`,
      '    ````text',
      '    Keep:',
      '    ```',
    ]);
    assert.ok(under < printed.indexOf('    IMPLEMENTER-SUMMARY'), "before the closeout, the step's own account of it");
    assert.equal(recordText(run.id), record, 'and still nothing written');
  });
  await s.test(
    'a nudge with an answer is handed what was said, as `## Said to your session` inside `## Try 2`, each message with its time, fenced',
    async () => {
      await tick(run.id);
      await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', message: 'Keep it.' }));
      assert.deepEqual((await tick(run.id)).tried, ['implement']);
      const brief = b.tasks.get(`${run.id}-implement-try2`)!.spec.brief;
      const [one, two] = saidTo();
      assert.match(brief, /^## Try 2\n\nThe last try signed off `blocked`\./);
      assert.ok(
        brief.includes(`\n\n## Said to your session\n\nA person said these to your session while the last try ran (\`nemia say\`).`),
        brief,
      );
      assert.ok(
        brief.includes(
          `\n\nAt ${one.at}:\n\n\`\`\`text\n${one.text}\n\`\`\`\n\nAt ${two.at}:\n\n\`\`\`\`text\n${two.text}\n\`\`\`\`\n\n## Your answer\n\n\`\`\`text\nKeep it.\n\`\`\``,
        ),
        brief,
      );
    },
  );
  await s.test('a fresh try of another run told the same is handed none of it', async () => {
    const other = await startedRun(implementThenReview());
    await tick(other.id);
    ended(`${other.id}-implement`, 'running');
    await stage.runWith(b.e, sayRun(other.id, 'implement', 'Widen the scope to apps/api too.'));
    ended(`${other.id}-implement`, 'succeeded', { closeout: { outcome: 'blocked', summary: 's', artifacts: [], needs: 'which?' } });
    await tick(other.id);
    await stage.runWith(b.e, retryRun(other.id, 'implement', { mode: 'fresh' }));
    assert.deepEqual((await tick(other.id)).tried, ['implement']);
    assert.doesNotMatch(b.tasks.get(`${other.id}-implement-try2`)!.spec.brief, /Said to your session|Widen the scope/);
  });
  await s.test("`retries:`, the run's own nudge, hands it on too, before what the check said", async () => {
    const checked = await startedRun(implementThenReview(['check: npm test', 'retries: 1']));
    await tick(checked.id);
    ended(`${checked.id}-implement`, 'running');
    await stage.runWith(b.e, sayRun(checked.id, 'implement', 'Run the parser tests too.'));
    ended(`${checked.id}-implement`, 'succeeded', { closeout: SIGNED });
    await tick(checked.id);
    ended(`${checked.id}-implement-check`, 'failed', { exitCode: 1 });
    assert.deepEqual((await tick(checked.id)).tried, ['implement']);
    const retried = b.tasks.get(`${checked.id}-implement-try2`)!.spec.brief;
    const [said] = b.tasks.get(`${checked.id}-implement`)!.said;
    assert.ok(retried.includes('## Said to your session\n\nA person said this to your session'), retried);
    assert.ok(retried.includes(`At ${said.at}:\n\n\`\`\`text\nRun the parser tests too.\n\`\`\``), retried);
    assert.ok(retried.indexOf('## Said to your session') < retried.indexOf('## What the check said'), 'before the evidence');
  });
  await s.test('a session its harness blocked, told something, stopped by `nemia retry` and continued, is handed it', async () => {
    const blocked = await startedRun(implementThenReview());
    const id = `${blocked.id}-implement`;
    await tick(blocked.id);
    ended(id, 'needs-human');
    await stage.runWith(b.e, sayRun(blocked.id, 'implement', 'Approve nothing; widen the scope instead.'));
    await stage.runWith(b.e, retryRun(blocked.id, 'implement', { mode: 'nudge' }, { stopBlocked: true }));
    await tick(blocked.id);
    assert.ok(b.stopped.includes(id));
    ended(id, 'stopped');
    assert.deepEqual((await tick(blocked.id)).tried, ['implement']);
    const continued = b.tasks.get(`${id}-try2`)!.spec;
    assert.equal(continued.resumeFrom, `native-${id}`);
    assert.match(
      continued.brief,
      /^## Try 2\n\nThe last try's session was stopped before it signed off\.[\s\S]*\n\n## Said to your session\n\n[\s\S]*```text\nApprove nothing; widen the scope instead\.\n```/,
    );
  });
});

test('REFUSED: `nemia say` — exit 2, a Conflict, by name; nothing said and nothing written', async (t) => {
  const b = stage.board();
  const run = await startedRun(implementThenReview());
  const taskId = `${run.id}-implement`;
  await tick(run.id);
  const record = recordText(run.id);
  const saying = (step: string, words = 'Widen the scope.') => stage.runWith(b.e, sayRun(run.id, step, words));
  await t.test('by the engine, in its words: a task filed with no attempt started', () =>
    assert.rejects(saying('implement'), refusedAs('Conflict', taskId, 'has not started an attempt')),
  );
  for (const words of [[''], [' \n '], []])
    await t.test(`by the engine, in its words: empty words, typed ${JSON.stringify(words)}`, async () => {
      ended(taskId, 'running');
      await assert.rejects(stage.main(['say', run.id, 'implement', ...words]), refusedAs('Conflict', '`text` is empty', 'Give the words'));
    });
  await t.test('by the package, before the engine is asked: a step the run does not have', () =>
    assert.rejects(saying('deploy'), refusedAs('Conflict', `${run.id} has no step "deploy"`, 'implement, review')),
  );
  await t.test('by the package: a step not filed yet', () =>
    assert.rejects(
      stage.main(['say', run.id, 'review', 'Look at the parser first.']),
      refusedAs('Conflict', 'review has not been filed yet', `nemia ls ${run.id}`),
    ),
  );
  for (const phase of ['succeeded', 'failed', 'stopped'])
    await t.test(`by the package: a task settled \`${phase}\`, offering the retry with words`, async () => {
      ended(taskId, phase);
      await assert.rejects(
        saying('implement'),
        refusedAs('Conflict', 'implement is not running', `settled \`${phase}\``, `nemia retry ${run.id} implement --message "<words>"`),
      );
    });
  await t.test('by the package: a cancelled run, its task still running', async () => {
    ended(taskId, 'running');
    markCancelled(run.id);
    await assert.rejects(
      stage.main(['say', run.id, 'implement', 'Widen the scope.']),
      refusedAs('Conflict', `${run.id} was cancelled at `, 'not steered'),
    );
  });
  await t.test('nothing said, nothing written', () => {
    assert.deepEqual(b.said, []);
    assert.equal(recordText(run.id), record);
  });
});

test("a claude step over its `budget:`, its cap raised by a person's `--budget`", async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  const implement = () => `${run.id}-implement`;
  const try2 = () => `${implement()}-try2`;
  await s.test("the step's `budget:` is frozen on the run: the folder edited afterwards never raises it, nor takes it off", async () => {
    const dir = implementThenReview(['budget: 2.50']);
    const frozen = await startedRun(dir);
    fs.writeFileSync(path.join(dir, 'implement.md'), '---\nplace: git\nbudget: 500\n---\nimplement it\n');
    assert.deepEqual(
      stepsOf(readRun(frozen.id)).map((x) => [x.name, x.budget]),
      [
        ['implement', 2.5],
        ['review', undefined],
      ],
    );
  });
  await s.test(
    'implement, filed with its cap whole, costs $4.25 of $3 and its check refuses: `retries: 2` files nothing past the cap',
    async () => {
      run = await throughCheck(
        ['check: npm test', 'retries: 2', 'budget: 3'],
        'failed',
        { exitCode: 1 },
        { closeout: SIGNED, usage: { costUsd: 4.25 } },
      );
      for (let pass = 1; pass <= 2; pass++) {
        const after = await tick(run.id);
        assert.deepEqual(
          [after.tried, after.filed, after.checked, after.blocked, after.status],
          [[], [], [], ['review'], 'failed'],
          `pass ${pass}`,
        );
      }
      assert.deepEqual(b.filings, [implement(), `${implement()}-check`]);
      assert.equal(
        b.tasks.get(implement())!.spec.config?.budgetUsd,
        3,
        'a claude step runs as a job, which keeps the cap: filed with it whole',
      );
    },
  );
  await s.test('`nemia ls` says over budget with the amounts, waiting on you; `nemia decide` offers `--budget`', async () => {
    const l = await stage.runWith(b.e, list(b.e, readRun(run.id)));
    assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['over budget $4.25 of $3', ['implement']]);
    const { offers, decision: d } = await stage.runWith(b.e, decideRun(run.id));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.overBudget, d.failedCheck], ['failed', ['implement'], ['implement']]);
    assert.match(
      offers[0],
      new RegExp(
        `^implement: over budget \\(check refused\\), \\$4\\.25 of \\$3\\. Raise its cap above \\$4\\.25 and continue its session:  nemia retry ${run.id} implement --budget <amount>`,
      ),
    );
  });
  await s.test('REFUSED: `nemia retry` without `--budget`, or with one not above what it spent; no ask written', async () => {
    await assert.rejects(
      stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' })),
      refusedAs('Conflict', 'implement is over budget', '$4.25 of its $3 budget', `nemia retry ${run.id} implement --budget <amount>`),
    );
    await assert.rejects(
      stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 4 })),
      refusedAs('Conflict', '--budget 4 is not above $4.25', `nemia retry ${run.id} implement --budget <amount>`),
    );
    assert.deepEqual(retryAsks(run.id), []);
  });
  await s.test('`--budget 10` is asked, and files the try continuing the job with what is left of $10, the cap on the record', async () => {
    const { ask } = await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 10 }));
    assert.equal(ask.budget, 10);
    assert.match(
      (await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].note ?? '',
      /^try 2 asked \(--nudge, --budget 10\) — the next tick files it/,
    );
    const pass = await tick(run.id);
    assert.deepEqual(pass.tried, ['implement']);
    assert.ok(pass.notes.includes('implement: try 2 — nemia retry --nudge --budget 10'), pass.notes.join('\n'));
    assert.deepEqual(readRun(run.id).steps.implement?.tries, [
      { taskId: implement(), check: { taskId: `${implement()}-check` }, then: 'nudge', budget: 10 },
    ]);
    const spec = b.tasks.get(try2())!.spec;
    assert.deepEqual([spec.resumeFrom, spec.config?.budgetUsd], [`native-${implement()}`, 5.75], 'a resume is charged its own spend');
    assert.match(spec.brief, /A person asked for this try: `nemia retry --nudge --budget 10`, raising this step's budget to \$10\./);
    assert.match(
      spec.brief,
      /^## Try 2\n\nAfter the last try signed off, the run executed this step's check, and it did not pass\.\nAnd this step's tries had together cost its budget or more, so the run filed nothing more for it until a person raised the cap\.\n/,
    );
  });
  await s.test('try 2 costs $6 more and its check refuses: over again, and `retries:` files nothing on its own', async () => {
    ended(try2(), 'succeeded', { closeout: SIGNED, usage: { costUsd: 6 } });
    assert.deepEqual((await tick(run.id)).checked, ['implement']);
    ended(`${try2()}-check`, 'failed', { exitCode: 1 });
    assert.deepEqual((await tick(run.id)).tried, []);
    const again = await stage.runWith(b.e, list(b.e, readRun(run.id)));
    assert.deepEqual([again.steps[0].status, again.steps[0].note], ['over budget $10.25 of $10', 'try 2, nudged on your word, budget $10']);
  });
  await s.test(
    'a nudge past a budget of a step that ended without its closeout is told why, beside the budget raised, not in its place',
    async () => {
      const unsigned = await startedRun(implementThenReview(['budget: 3']));
      const id = `${unsigned.id}-implement`;
      await tick(unsigned.id);
      ended(id, 'succeeded', { usage: { costUsd: 4.25 } });
      assert.equal((await stage.runWith(b.e, list(b.e, readRun(unsigned.id)))).steps[0].status, 'over budget $4.25 of $3');
      await stage.runWith(b.e, retryRun(unsigned.id, 'implement', { mode: 'nudge', budget: 10 }));
      assert.deepEqual((await tick(unsigned.id)).tried, ['implement']);
      const brief = b.tasks.get(`${id}-try2`)!.spec.brief;
      assert.match(
        brief,
        /^## Try 2\n\nThe last try ended without the closeout the run asked for, or without a field its `output:` declares, so nothing that waits on this step started\.\nAnd this step's tries had together cost its budget or more, so the run filed nothing more for it until a person raised the cap\.\nA person asked for this try: `nemia retry --nudge --budget 10`/,
      );
      assert.doesNotMatch(brief, /The last try ended `over budget`/);
    },
  );
});

test("a claude-detached step's cap, shared by its tries and raised by a person", async (t) => {
  const s = story(t);
  const b = stage.board();
  await s.test(
    'its `budget:` goes to the engine as `budgetUsd`; `retries:` files the next try with what is left of it — at the cap, none',
    async () => {
      const run = await throughCheck(
        ['harness: claude-detached', 'check: npm test', 'retries: 2', 'budget: 3'],
        'failed',
        { exitCode: 1 },
        { closeout: SIGNED, usage: { costUsd: 2.9 } },
      );
      const implement = `${run.id}-implement`;
      assert.deepEqual([b.tasks.get(implement)!.spec.harness, b.tasks.get(implement)!.spec.config?.budgetUsd], ['claude-detached', 3]);
      assert.deepEqual((await tick(run.id)).tried, ['implement'], '$2.90 of $3: `retries:` tries it');
      const try2 = `${implement}-try2`;
      assert.equal(b.tasks.get(try2)!.spec.config?.budgetUsd, 0.1, 'what is left of $3 after $2.90');
      ended(try2, 'succeeded', { closeout: SIGNED, usage: { costUsd: 0.1 } });
      assert.deepEqual((await tick(run.id)).checked, ['implement']);
      ended(`${try2}-check`, 'failed', { exitCode: 1 });
      const pass = await tick(run.id);
      assert.deepEqual(
        [pass.tried, pass.blocked],
        [[], ['review']],
        '$3.00 of $3: nothing left, and `retries: 2` does not spend the try it has',
      );
      assert.equal((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].status, 'over budget $3.00 of $3');
    },
  );
  let id = '';
  const implement = () => `${id}-implement`;
  await s.test('a session its harness ended at the cap reads budget exhausted, and is not tried by `retries:`', async () => {
    const run = await startedRun(implementThenReview(['harness: claude-detached', 'check: npm test', 'retries: 2', 'budget: 3']));
    id = run.id;
    await tick(id);
    ended(implement(), 'failed', { exitCode: 1, reason: 'harness', limit: 'budget', usage: { costUsd: 3.02 } });
    for (let pass = 1; pass <= 2; pass++) {
      const after = await tick(id);
      assert.deepEqual(
        [after.tried, after.filed, after.checked, after.blocked, after.status],
        [[], [], [], ['review'], 'blocked'],
        `pass ${pass}`,
      );
    }
    assert.deepEqual(
      b.filings.filter((f) => f.startsWith(id)),
      [implement()],
    );
    const l = await stage.runWith(b.e, list(b.e, readRun(id)));
    assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['budget exhausted $3.02 of $3', ['implement']]);
  });
  await s.test('`nemia decide` offers `--budget`, and the retry is refused without one above what it spent', async () => {
    const { offers, decision: d } = await stage.runWith(b.e, decideRun(id));
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.budgetExhausted, d.failed], ['blocked', ['implement'], []]);
    assert.deepEqual(offers, [
      `implement: budget exhausted, $3.02 of $3. Raise its cap above $3.02 and continue its session:  nemia retry ${id} implement --budget <amount>  (--fresh, or --model <m>, for a new session; retries: 2, 0 spent)`,
    ]);
    await assert.rejects(
      stage.runWith(b.e, retryRun(id, 'implement', { mode: 'fresh' })),
      refusedAs(
        'Conflict',
        'implement ended at its budget',
        'stopped its session at $3,',
        `nemia retry ${id} implement --budget <amount> --fresh`,
      ),
    );
    await assert.rejects(
      stage.runWith(b.e, retryRun(id, 'implement', { mode: 'fresh', budget: 2 })),
      refusedAs('Conflict', '--budget 2 is not above $3.02', `nemia retry ${id} implement --budget <amount>`),
    );
  });
  await s.test('a try with a larger one carries what is left of it, told why the last ended', async () => {
    await stage.runWith(b.e, retryRun(id, 'implement', { mode: 'fresh', budget: 8 }));
    assert.deepEqual((await tick(id)).tried, ['implement']);
    const spec = b.tasks.get(`${implement()}-try2`)!.spec;
    assert.deepEqual([spec.harness, spec.config?.budgetUsd, spec.resumeFrom], ['claude-detached', 4.98, undefined]);
    assert.match(spec.brief, /The last try's session was ended by its harness at this step's budget, before it signed off\./);
  });
  await s.test('a step blocked under its cap, asking for more, takes a `--budget` above the cap and not one at or under it', async () => {
    const run = await startedRun(implementThenReview(['harness: claude-detached', 'budget: 20']));
    const blocked = `${run.id}-implement`;
    await tick(run.id);
    const asked = { outcome: 'blocked', summary: 'ran out of room', artifacts: [], needs: 'a try with a larger budget, about $15–25' };
    ended(blocked, 'succeeded', { closeout: asked, usage: { costUsd: 19.27 } });
    assert.deepEqual((await tick(run.id)).tried, []);
    const l = await stage.runWith(b.e, list(b.e, readRun(run.id)));
    assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['succeeded · BLOCKED', ['implement']]);
    await assert.rejects(
      stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 15 })),
      refusedAs(
        'Conflict',
        '--budget 15 is not above $20',
        'the $20 cap in force on implement',
        'cost $19.27',
        `nemia retry ${run.id} implement --budget <amount>`,
      ),
    );
    await assert.rejects(
      stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 20 })),
      refusedAs('Conflict', '--budget 20 is not above $20', 'the $20 cap in force on implement'),
    );
    assert.deepEqual(retryAsks(run.id), []);
    await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge', budget: 40 }));
    assert.deepEqual((await tick(run.id)).tried, ['implement']);
    assert.deepEqual(readRun(run.id).steps.implement?.tries, [{ taskId: blocked, then: 'nudge', budget: 40 }]);
    const spec = b.tasks.get(`${blocked}-try2`)!.spec;
    assert.deepEqual([spec.harness, spec.config?.budgetUsd], ['claude-detached', 20.73], 'what is left of $40 after $19.27');
    assert.match(spec.brief, /A person asked for this try: `nemia retry --nudge --budget 40`, raising this step's budget to \$40\./);
    assert.doesNotMatch(spec.brief, /had together cost its budget or more/);
  });
});

/** Every task a run's record names, viewed once, as the tick views them. */
const viewsOf = async (e: Engine, run: Run): Promise<Map<string, TaskView>> => {
  const views = new Map<string, TaskView>();
  for (const { taskId, check } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await Effect.runPromise(e.view(taskId)));
    if (check) views.set(check.taskId, await Effect.runPromise(e.view(check.taskId)));
  }
  return views;
};

test("exitVerdicts: a check's verdict is its attempt's exit code, `unfinished` with none or cut at its deadline — the word `nemia ls` says — and no retry is spent on one unfinished", async (t) => {
  const b = stage.board();
  const rows: Array<[string, TestEnd, ReturnType<ReturnType<typeof exitVerdicts>>, string[]]> = [
    ['refused, exit 1: `retries:` tries it', { exitCode: 1 }, 1, ['implement']],
    ['killed at its deadline, settled `failed` with no exit code: unfinished', {}, 'unfinished', []],
    [
      'cut at its deadline, trapping the signal and exiting 143: the engine ends it `deadline`, unfinished',
      { exitCode: 143, reason: 'deadline' },
      'unfinished',
      [],
    ],
  ];
  for (const [name, end, verdict, tried] of rows)
    await t.test(name, async () => {
      const { id } = await throughCheck(['check: npm test', 'retries: 1'], 'failed', end);
      const run = readRun(id);
      const verdictOf = exitVerdicts(await viewsOf(b.e, run), run);
      assert.equal(verdictOf('implement'), verdict);
      assert.equal(verdictOf('review'), undefined, 'a step with no check filed has no verdict at all');
      assert.equal((await stage.runWith(b.e, list(b.e, run))).steps[0].status, `failed ✗ check (${verdictWord(verdict!)})`);
      assert.deepEqual((await tick(id)).tried, tried);
    });
});

test("UNSIGNED is read off the LAST attempt of a try's task, on `nemia ls`, `nemia decide` and the next try's brief", async (t) => {
  const b = stage.board();
  const rows = [
    {
      reasons: ['unsigned', 'lost'],
      asked: true,
      word: 'failed',
      outcome: 'failed',
      onYou: [] as string[],
      told: "The last try's session ended `failed` before it signed off.",
    },
    {
      reasons: ['lost', 'unsigned'],
      asked: 'unsigned',
      word: 'unsigned',
      outcome: 'blocked',
      onYou: ['implement'],
      told: 'The last try ended without the closeout the run asked for',
    },
  ] as const;
  for (const { reasons, asked, word, outcome, onYou, told } of rows)
    await t.test(`attempt 1 ${reasons[0]}, attempt 2 ${reasons[1]}: reads ${word}`, async () => {
      const run = await startedRun(implementThenReview());
      const taskId = `${run.id}-implement`;
      await tick(run.id);
      ended(taskId, 'failed', { reason: reasons[0] });
      b.restart(taskId);
      ended(taskId, 'failed', { reason: reasons[1] });
      if (reasons[1] === 'unsigned') {
        assert.deepEqual((await tick(run.id)).tried, ['implement'], 'the run nudges it to sign off, itself');
        assert.equal(readRun(run.id).steps.implement?.tries?.at(-1)?.then, 'signoff');
        ended(`${taskId}-try2`, 'failed', { reason: 'unsigned' });
      }
      const views = new Map([[taskId, await Effect.runPromise(b.e.view(taskId))]]);
      assert.deepEqual(
        views.get(taskId)!.state.attempts.map((a) => a.reason),
        reasons,
      );
      assert.deepEqual([phaseOfView(views.get(taskId)), closeoutAsked(views)(taskId)], ['failed', asked]);
      const l = await stage.runWith(b.e, list(b.e, readRun(run.id)));
      assert.deepEqual([l.steps[0].status, l.waitingOnYou], [word, onYou]);
      const { decision: d } = await stage.runWith(b.e, decideRun(run.id));
      assert.deepEqual(d.kind === 'awaiting' && { outcome: d.outcome, unsigned: d.unsigned, failed: d.failed }, {
        outcome,
        unsigned: word === 'unsigned' ? ['implement'] : [],
        failed: word === 'failed' ? ['implement'] : [],
      });
      await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' }));
      assert.deepEqual((await tick(run.id)).tried, ['implement']);
      const now = readRun(run.id).steps.implement.taskId!;
      assert.ok(b.tasks.get(now)!.spec.brief.includes(told), `the try is told ${told}`);
    });
});

test('a run frozen with a step of `maxAttempts: 2`, a key no step has now, still loads, lists and files — with no count, which the runtime would refuse', async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  await s.test('the key is on the frozen step, read as a key the type does not know', async () => {
    run = await startedRun(implementThenReview());
    const file = path.join(ROOT, 'runs', `${run.id}.json`);
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    record.workflow = record.workflow.map((x: { name: string }) => (x.name === 'implement' ? { ...x, maxAttempts: 2 } : x));
    fs.writeFileSync(file, JSON.stringify(record));
    const frozen: Record<string, unknown> = readRun(run.id).workflow!.find((x) => x.name === 'implement')!;
    assert.equal(frozen.maxAttempts, 2);
  });
  await s.test('implement is filed without it, and lists pending, then failed', async () => {
    assert.deepEqual((await tick(run.id)).filed, ['implement']);
    assert.equal('maxAttempts' in b.tasks.get(`${run.id}-implement`)!.spec, false);
    assert.equal((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].status, 'pending');
    ended(`${run.id}-implement`, 'failed');
    assert.equal((await stage.runWith(b.e, list(b.e, readRun(run.id)))).steps[0].status, 'failed');
  });
  await s.test('a try of it is filed as any is, without it', async () => {
    await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
    assert.deepEqual((await tick(run.id)).tried, ['implement']);
    assert.equal('maxAttempts' in b.tasks.get(`${run.id}-implement-try2`)!.spec, false);
  });
});

test("a `--nudge` of a try whose session could not start continues the session that try was filed to continue (open issue 5, the orchestrator's now)", async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  const first = () => `native-${run.id}-implement`;
  await s.test('implement fails; a nudge files try 2 continuing its session', async () => {
    run = await startedRun(implementThenReview());
    await tick(run.id);
    ended(`${run.id}-implement`, 'failed');
    await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' }));
    assert.deepEqual((await tick(run.id)).tried, ['implement']);
    assert.equal(b.tasks.get(`${run.id}-implement-try2`)!.spec.resumeFrom, first());
  });
  await s.test(
    "try 2's resume is refused before a session ran: a nudge files try 3 continuing the chain try 2 was filed to, not a new session",
    async () => {
      ended(`${run.id}-implement-try2`, 'failed', { reason: 'unstartable', nativeId: null, resumeFrom: first() });
      await stage.runWith(b.e, retryRun(run.id, 'implement', { mode: 'nudge' }));
      assert.deepEqual((await tick(run.id)).tried, ['implement']);
      assert.equal(b.tasks.get(`${run.id}-implement-try3`)!.spec.resumeFrom, first());
    },
  );
});

test("REFUSED at `nemia start`: a step named for what a run cuts under a step's name — its check, its try, the run's own line — exit 2, by name, no run written", async (t) => {
  const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;
  const rows: Array<[string, () => string, string[]]> = [
    [
      "a step named for another step's check",
      () => {
        const dir = implementThenReview(['check: npm test']);
        fs.writeFileSync(path.join(dir, 'implement-check.md'), '---\nplace: git\n---\na step of its own\n');
        return dir;
      },
      ['implement-check', 'Rename implement-check.md'],
    ],
    [
      "a step named for another step's try",
      () => {
        const dir = implementThenReview();
        fs.writeFileSync(path.join(dir, 'implement-try2.md'), '---\nafter: implement\nplace: git\n---\na step of its own\n');
        return dir;
      },
      ['implement-try2: a step may not be named', 'Rename implement-try2.md'],
    ],
    [
      "a step named `run`, whose cut would claim the run's own branch",
      () => {
        const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
        fs.writeFileSync(path.join(dir, `${LINE_NAME}.md`), '---\nplace: git\n---\nrun it\n');
        fs.writeFileSync(path.join(dir, 'review.md'), `---\nafter: ${LINE_NAME}\nplace: git\n---\nreview it\n`);
        return dir;
      },
      ['a step may not be named `run`', 'would claim one branch', 'Rename run.md'],
    ],
  ];
  for (const [name, folder, facts] of rows)
    await t.test(name, async () => {
      const before = runsWritten();
      await assert.rejects(
        stage.runPlaced(startRun({ brief: 'add a flag', repo: aRepo(), workflowDir: folder() })),
        refusedAs('Invalid', ...facts),
      );
      assert.equal(runsWritten(), before);
    });
});

test('what the run files held open: a Claude Code job, and never a codex step, a background session or a check', async (t) => {
  const b = stage.board();
  const filedOf = (id: string) => b.specs.find((x) => x.id === id)!;
  await t.test('a Claude Code job is filed held open, and its check is not', async () => {
    const run = await throughCheck(['check: true'], 'running');
    assert.equal(filedOf(`${run.id}-implement`).holdOpen, true);
    assert.equal(Object.hasOwn(filedOf(`${run.id}-implement-check`), 'holdOpen'), false, "a check is the run's own, never held open");
  });
  for (const lines of [['harness: codex'], ['background: true', 'permissionMode: dontAsk']])
    await t.test(`${lines[0]}: not held open`, async () => {
      const run = await startedRun(implementThenReview(lines));
      assert.deepEqual((await tick(run.id)).filed, ['implement']);
      assert.equal(Object.hasOwn(filedOf(`${run.id}-implement`), 'holdOpen'), false);
    });
});

test('a closeout that does not read leaves its step unsigned and on you, so `nemia cancel` calls the run off', async (t) => {
  const s = story(t);
  const b = stage.board();
  let run: RepositoryRun;
  await s.test('implement signs off with a closeout that does not read: unsigned, closeout unreadable, waiting on you', async () => {
    run = await startedRun(implementThenReview());
    await tick(run.id);
    ended(`${run.id}-implement`, 'succeeded', { closeout: ['not a closeout'] });
    const l = await stage.runWith(b.e, list(b.e, readRun(run.id)));
    assert.deepEqual(Object.fromEntries(l.steps.map((x) => [x.name, x.status])), {
      implement: 'unsigned · closeout unreadable',
      review: 'waiting',
    });
    assert.deepEqual(l.waitingOnYou, ['implement']);
  });
  await s.test('`nemia cancel` calls it off, as a run not finished, with nothing to stop', async () => {
    const { plan } = await stage.runWith(b.e, cancelRun(run.id));
    assert.deepEqual(plan, { kind: 'cancel', stop: [] });
    assert.ok(readRun(run.id).cancelledAt);
  });
});
