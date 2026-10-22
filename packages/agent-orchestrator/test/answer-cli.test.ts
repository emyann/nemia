/**
 * A step's questions answered at the terminal: `nemia retry --answer` for a step that signed off blocked, `nemia approve --answer` at a
 * gate, each resolved by the numbering `nemia decide` prints (`numberedAnswers`) and written in the words the board's answers become
 * (`answerText`, `approvedAnswerText`), said to be given at the terminal; refused, by name and with nothing written, where they do not fit.
 * And what `nemia decide` and `nemia ls` print of the questions: the numbered block, the `--answer` to give, and a count.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from '../src/runtime-client.ts';
import { testEngine } from 'agent-runtime/testing';
import { scratch } from './scratch.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import { answerText, approvedAnswerText, type Question } from '../src/question/question.ts';

const ROOT = scratch('wf-answer-cli-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.WF_VERIFY_REST = '1';
const { advanceRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { readRun } = await import('../src/record/record.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);

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

/** A run whose plan signed off — blocked, or done at its gate — asking `open`, and the engine it ran on. */
const asking = async ({ gate = false, open = [cut, where] as unknown[] } = {}) => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stand().world.repository(repo, {});
  const run = await runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: planned(gate), isolate: false }));
  const b = engine();
  const e = engineOf(b.layer);
  await runWith(e, advanceRun(readRun(run.id)));
  const outcome = gate ? 'done' : 'blocked';
  b.settle(`${run.id}-plan`, 'succeeded', {
    closeout: { outcome, summary: 'Half.', artifacts: [], needs: gate ? null : 'Two questions.', open },
  });
  await runWith(e, advanceRun(readRun(run.id)));
  return { run, e };
};

/** What `nemia` printed, line by line, its commands given this test's place and `e`. */
const printedBy = async (t: { mock: { method: typeof import('node:test').mock.method } }, argv: string[], e: Engine) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => void printed.push(args.join(' ')));
  try {
    await cli(argv, e, undefined, stand().place);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

/** The refusal `nemia` gives `argv`: exit 2, and its message. */
const refusal = async (argv: string[], e: Engine): Promise<string> => {
  const err = await cli(argv, e, undefined, stand().place).then(
    () => assert.fail(`${argv.join(' ')} was let through`),
    (thrown: Error & { exitCode?: number }) => thrown,
  );
  assert.equal(err.exitCode, 2, err.message);
  return err.message;
};

const asksDir = (id: string) => path.join(ROOT, 'runs', `${id}.asks`);
const asksOf = (id: string) => (fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => f !== 'done') : []);
const askRead = (id: string, name: string) => JSON.parse(fs.readFileSync(path.join(asksDir(id), name), 'utf8'));

test('`nemia retry --answer` on a blocked step files a try whose message is the board’s words for the answers, given at the terminal, `--message` their note', async (t) => {
  const { run, e } = await asking();
  const printed = await printedBy(t, ['retry', run.id, 'plan', '--answer', '1=b', '--answer', '2=A,b: both'], e);
  const [ask] = asksOf(run.id);
  const expected = answerText(
    [cut, where],
    [
      { question: cut.title, chose: ['two cards'] },
      { question: where.title, chose: ['retry', 'gate'], own: 'both' },
    ],
    undefined,
    'at the terminal',
  );
  assert.equal(askRead(run.id, ask).message, expected);
  assert.match(printed[0], new RegExp(`^${run.id}  asked: try 2 of plan \\(--nudge\\), with your answers — `));

  const noted = await asking();
  await printedBy(t, ['retry', noted.run.id, 'plan', '--answer', '1: neither', '--answer', '2=a', '--message', 'thanks'], noted.e);
  const message = askRead(noted.run.id, asksOf(noted.run.id)[0]).message as string;
  assert.ok(message.endsWith('\n\nNote: thanks\n\nAnswered by: person, at the terminal'), message);
  assert.ok(message.includes('1. How is the card cut?\n   In my own words: neither'), message);
});

test('`nemia approve --answer` at a gate approves with the board’s words for the answers, given at the terminal', async (t) => {
  const { run, e } = await asking({ gate: true });
  const printed = await printedBy(t, ['approve', run.id, 'plan', '--answer', '1=a', '--answer', '2=b', '--message', 'go'], e);
  const approval = askRead(run.id, 'approve-plan-1');
  assert.equal(
    approval.message,
    approvedAnswerText(
      'plan',
      [cut, where],
      [
        { question: cut.title, chose: ['one card'] },
        { question: where.title, chose: ['gate'] },
      ],
      'go',
      'at the terminal',
    ),
  );
  assert.match(printed[0], new RegExp(`^${run.id}  approved: try 1 of plan, with your answers — `));
});

test('REFUSED: --answer that does not fit the questions the step asks now — a number past them, a letter not offered, a question twice or left out, two options where one is taken — exit 2, by name, nothing written', async () => {
  const { run, e } = await asking();
  const retry = (...answers: string[]) => refusal(['retry', run.id, 'plan', ...answers.flatMap((a) => ['--answer', a])], e);
  assert.equal(
    await retry('1=a', '3=a'),
    `--answer 3=a names question 3, and the step asks 2 now, numbered from 1 as nemia decide ${run.id} prints them.`,
  );
  assert.match(await retry('1=d', '2=a'), /^--answer 1=d: "How is the card cut\?" offers no d: its options are a \(one card\)/);
  assert.match(await retry('1=a', '1=b', '2=a'), /^"How is the card cut\?" is answered twice/);
  assert.match(await retry('1=a'), /^"Where do the answers go\?" is not answered/);
  assert.match(await retry('1=a,b', '2=a'), /^"How is the card cut\?" takes one option/);
  assert.match(await retry('one=a'), /^--answer one=a is not an answer/);
  assert.deepEqual(asksOf(run.id), [], 'nothing written');
});

test('REFUSED: --answer to a step that asks no questions, naming --message instead, and --answer with --recheck before a run is read', async () => {
  const { run, e } = await asking({ open: [] });
  const none = await refusal(['retry', run.id, 'plan', '--answer', '1=a'], e);
  assert.ok(none.startsWith('The step asks no questions now'), none);
  assert.ok(none.includes('--message "<words>", without --answer'), 'and names the flag to use instead');
  const both = await refusal(['retry', 'no-such-run-zz9z', 'plan', '--recheck', '--answer', '1=a'], e);
  assert.ok(both.startsWith('--answer carries your answers'), both);
  assert.ok(both.includes('--recheck), or give them'), 'and names both ways out');
  assert.ok(both.includes('--answer <n>=<letter>'), both);
  assert.deepEqual(asksOf(run.id), [], 'nothing written');
});

test('`nemia decide` prints a blocked step’s questions numbered, each option lettered on its own line, the recommended one marked, and the `--answer` to give — not the field dumped', async (t) => {
  const { run, e } = await asking();
  const screen = await printedBy(t, ['decide', run.id], e);
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
    screen.includes(`    to answer it:  nemia retry ${run.id} plan --answer 1=<letter> --answer 2=<letter> [--message "<note>"]`),
    screen.join('\n'),
  );
});

test('`nemia decide` prints a question field that does not decode as any other field, and offers `--message` for it', async (t) => {
  const { run, e } = await asking({ open: [{ title: 'Half a question' }] });
  const screen = await printedBy(t, ['decide', run.id], e);
  assert.ok(screen.includes('    open:'), screen.join('\n'));
  assert.ok(!screen.some((l) => /^ {6}1\. /.test(l)), screen.join('\n'));
  assert.ok(screen.includes(`    to answer it:  nemia retry ${run.id} plan --message "<answer>"`), screen.join('\n'));
});

test('`nemia decide` at a gate whose step asks questions says its gate’s approval with an `--answer` for each, and one that asks none with `--message`', async (t) => {
  const { run, e } = await asking({ gate: true });
  const screen = await printedBy(t, ['decide', run.id], e);
  const form = '--answer 1=<letter> --answer 2=<letter> [--message "<note>"]';
  assert.ok(
    screen.some((l) => l.startsWith(`    gate  awaiting approval:  nemia approve ${run.id} plan ${form}  — or send it back:`)),
    screen.join('\n'),
  );

  const bare = await asking({ gate: true, open: [] });
  const plain = await printedBy(t, ['decide', bare.run.id], bare.e);
  assert.ok(
    plain.some((l) =>
      l.startsWith(`    gate  awaiting approval:  nemia approve ${bare.run.id} plan [--message "<words>"]  — or send it back:`),
    ),
    plain.join('\n'),
  );
});

test('`nemia ls` counts the questions a step waiting on you asks in its note, and says nothing of them for a step that asks none, nor once it waits on no one', async (t) => {
  const { run, e } = await asking();
  const bare = await asking({ open: [] });
  const listed = await printedBy(t, ['ls'], e);
  const planOf = (id: string) => listed.slice(listed.findIndex((l) => l.startsWith(`${id}  `))).find((l) => l.startsWith('   plan '));
  assert.match(planOf(run.id) ?? '', /^ {3}plan +succeeded · BLOCKED +main +· asks 2 questions$/, listed.join('\n'));
  assert.match(planOf(bare.run.id) ?? '', /^ {3}plan +succeeded · BLOCKED +main$/, listed.join('\n'));

  const gated = await asking({ gate: true });
  const atGate = await printedBy(t, ['ls'], gated.e);
  const gateLine = () => atGate.slice(atGate.findIndex((l) => l.startsWith(`${gated.run.id}  `))).find((l) => l.startsWith('   plan '));
  assert.ok(gateLine()?.includes(' · asks 2 questions'), atGate.join('\n'));
  await printedBy(t, ['approve', gated.run.id, 'plan', '--answer', '1=a', '--answer', '2=a'], gated.e);
  atGate.splice(0, atGate.length, ...(await printedBy(t, ['ls'], gated.e)));
  assert.ok(gateLine() !== undefined && !gateLine()!.includes('asks'), `approved, it waits on no one: ${atGate.join('\n')}`);
});
