/**
 * A person's tries of a step, on disk and at the terminal: `nemia retry` on another model, over an ask `nemia pause --now` wrote, and
 * with the answers to the questions a step asks (`--answer`, as `nemia approve --answer` at a gate), resolved by the numbering
 * `nemia decide` prints and written in the words the board's answers become. Each story is one test on the stage (`story.ts`); the
 * refusals of `--answer` are one table. What `retryRefusal` and `assess` decide is pure, in `src/retry/retry.test.ts` and
 * `assess-*.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in repositories no factory holds.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from '../src/runtime-client.ts';
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
const { advanceRun, retryRun, startRun, runWith } = await import('../src/runner.ts');
const { askFile, asksDir, readRun } = await import('../src/record/record.store.ts');
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
