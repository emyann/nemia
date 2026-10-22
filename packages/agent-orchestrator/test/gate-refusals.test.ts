/**
 * What a gate refuses on disk, as one table per verb: `nemia start --gate` and a card's `gate:` before a run is written, and
 * `nemia approve` before an approval is — each row refused by kind (`_tag`) and exit 2, and the facts its words name. The stories of a
 * gate are `gate.test.ts`; what the pure functions refuse, `src/gate/gate.test.ts`.
 *
 * `WF_ROOT` is set before the runner is imported, which reads it as it loads, and `WF_DEFAULT_FACTORY_STARTS` beside it: its runs start
 * in scratch repositories no factory holds.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-gate-refusals-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });

process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_CONCURRENT;
delete process.env.WF_MAX_RUNS;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
const { advanceRun, approveRun, inboxDir, retryRun, startRun, startFromInbox, runWith: runEngine } = await import('../src/runner.ts');
const { markCancelled, readRun } = await import('../src/record/record.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
const { staged } = await import('./story.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stage = staged({ runWith: runEngine, main: cli, engineOf });
const { runWith, runPlaced } = stage;

/** Refused as `tag`, exit 2, its words naming each of `facts`. */
const refusedAs =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    for (const fact of facts) assert.ok(err.message.includes(fact), `${err.message} does not name ${fact}`);
    return true;
  };

/** A repository with one commit, so `nemia start` has a base to record. */
const aRepo = (): string => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  stage.place().world.repository(repo, {});
  return repo;
};

/** A workflow folder of `plan → implement → review`. */
const planned = () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'wf-'));
  for (const [name, after] of [
    ['plan', ''],
    ['implement', 'plan'],
    ['review', 'implement'],
  ]) {
    const front = [...(after ? [`after: ${after}`] : []), 'place: git'];
    fs.writeFileSync(path.join(dir, `${name}.md`), `---\n${front.join('\n')}\n---\n${name} it\n`);
  }
  return dir;
};

const SIGNED = { outcome: 'done', summary: 'the plan: parse the flag, then store it', artifacts: [], needs: null };
const asksDir = (id: string) => path.join(ROOT, 'runs', `${id}.asks`);
const asksOf = (id: string) =>
  fs.existsSync(asksDir(id)) ? fs.readdirSync(asksDir(id)).filter((f) => !f.startsWith('.') && f !== 'done') : [];
const runsWritten = () => fs.readdirSync(path.join(ROOT, 'runs')).filter((f) => f.endsWith('.json')).length;

/** `nemia start --gate plan` on `plan → implement → review`, run until plan has signed off and waits at its gate (or as `phase` says). */
const atItsGate = async (phase = 'succeeded') => {
  const run = await runPlaced(startRun({ brief: 'plan the flag', repo: aRepo(), workflowDir: planned(), isolate: false, gates: ['plan'] }));
  const b = stage.board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-plan`, phase, phase === 'succeeded' ? SIGNED : undefined);
  return { id: run.id, e: b.e };
};

test('`--gate` and a card’s `gate:`, REFUSED before a run is written', async (t) => {
  const repo = aRepo();
  const starting = (...gates: string[]) =>
    runPlaced(startRun({ brief: 'plan the flag', repo, workflowDir: planned(), isolate: false, gates }));
  const typed = (...flags: string[]) =>
    stage.main(['start', 'plan the flag', '--workflows', planned(), '--repo', repo, '--no-worktree', ...flags]);
  const card = (name: string, gate: string) => {
    fs.mkdirSync(inboxDir(), { recursive: true });
    fs.writeFileSync(path.join(inboxDir(), `${name}.md`), `---\nworkflow: ${planned()}\ngate: ${gate}\n---\nPlan the flag.\n`);
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
      '`nemia plan --gate`, by name',
      () => stage.main(['plan', ROOT, '--gate', 'plan']),
      'Invalid',
      ['nemia plan does not take --gate', 'gate: true', 'nemia start <card.md> --workflows <dir> --gate <step>'],
    ],
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
    await t.test(`REFUSED ${row}, no run written`, async () => {
      const before = runsWritten();
      await assert.rejects(refusing(), refusedAs(tag, ...facts));
      assert.equal(runsWritten(), before);
    });
  }
  await t.test('the refused cards are where they were, in the inbox', () => {
    for (const name of ['plan-the-flag-e5f6', 'plan-the-flag-g7h8']) assert.ok(fs.existsSync(path.join(inboxDir(), `${name}.md`)), name);
  });
});

test('`nemia approve`, REFUSED with nothing written', async (t) => {
  const gate = await atItsGate();
  for (const [row, step, words, tag, facts] of [
    [
      'a step not gated, naming the gate there is',
      'implement',
      undefined,
      'Conflict',
      ['implement has no gate', `${gate.id} is gated at plan`],
    ],
    [
      'a step the run does not have, naming its steps',
      'desing',
      undefined,
      'Conflict',
      [`${gate.id} has no step "desing"`, 'plan, implement, review'],
    ],
    ['empty words', 'plan', '', 'Conflict', ['--message is empty']],
  ] as Array<[string, string, string | undefined, 'Missing' | 'Conflict' | 'Invalid', string[]]>) {
    await t.test(`REFUSED ${row}`, async () => {
      await assert.rejects(runWith(gate.e, approveRun(gate.id, step, words)), refusedAs(tag, ...facts));
      assert.deepEqual(asksOf(gate.id), []);
    });
  }
  await t.test('REFUSED a run not there', async () => {
    await assert.rejects(
      runWith(gate.e, approveRun('no-such-run-zz9z', 'plan')),
      refusedAs('Missing', 'no such run: no-such-run-zz9z', 'nemia ls'),
    );
  });
  await t.test('REFUSED a step not signed off yet: still running', async () => {
    const running = await atItsGate('running');
    await assert.rejects(
      runWith(running.e, approveRun(running.id, 'plan')),
      refusedAs('Conflict', 'plan has not signed off yet', 'still running', 'approve it then'),
    );
    assert.deepEqual(asksOf(running.id), []);
  });
  await t.test('REFUSED a try already approved, the first approval standing', async () => {
    await runWith(gate.e, approveRun(gate.id, 'plan', 'yes'));
    await assert.rejects(
      runWith(gate.e, approveRun(gate.id, 'plan', 'yes, again')),
      refusedAs('Conflict', 'try 1 of plan is already approved', 'with words', 'on the next tick'),
    );
    assert.equal(JSON.parse(fs.readFileSync(path.join(asksDir(gate.id), 'approve-plan-1'), 'utf8')).message, 'yes');
  });
  await t.test('REFUSED while a send-back is asked for', async () => {
    const sentBack = await atItsGate();
    await runWith(sentBack.e, retryRun(sentBack.id, 'plan', { mode: 'nudge', message: 'store it first' }));
    await assert.rejects(
      runWith(sentBack.e, approveRun(sentBack.id, 'plan')),
      refusedAs('Conflict', 'try 2 of plan is already asked for', '(--nudge, at ', 'an approval of try 1'),
    );
    assert.deepEqual(asksOf(sentBack.id), ['retry-plan-2']);
  });
  await t.test('REFUSED a cancelled run', async () => {
    const called = await atItsGate();
    markCancelled(called.id);
    await assert.rejects(
      runWith(called.e, approveRun(called.id, 'plan')),
      refusedAs('Conflict', 'was cancelled at ', 'a cancelled run files nothing'),
    );
    assert.deepEqual(asksOf(called.id), []);
  });
  await t.test("REFUSED a file at the approval's name that is not one: named, with how to clear it, never read as approved", async () => {
    const stray = await atItsGate();
    fs.mkdirSync(asksDir(stray.id), { recursive: true });
    fs.writeFileSync(path.join(asksDir(stray.id), 'approve-plan-1'), 'yes please');
    await assert.rejects(
      runWith(stray.e, approveRun(stray.id, 'plan')),
      refusedAs('Conflict', 'try 1 of plan cannot be approved', 'approve-plan-1 is already there', '(rm ', 'then approve again'),
    );
  });
});

test('`nemia approve` as typed, REFUSED before it reads a run', async (t) => {
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
    await t.test(`REFUSED ${row}`, async () => {
      await assert.rejects(typed(...flags), refusedAs('Invalid', ...facts));
    });
  }
});
