/**
 * Auto rules deciding an approval, told as a person's stories on the stage (`story.ts`) over a scratch store: her floor, `nemia admit
 * --at-least`, reading each run a call names off its record for its factory, and each factory for its level, at the moment of the call —
 * a call acting on a factory below the floor denied, one above it answered as with no floor, a run that does not read asked; then an
 * agent's rules for `auto` on disk — a proposal touching the proposal's file alone, the first confirm seeding the person's list with
 * the rule that ships beside the one confirmed — and `nemia admit --auto` giving an approval unasked for a run of a factory at auto
 * where all agree, and asking where a fact fails, at semi-auto, for a cap raised, once the person dropped the rule, and once their list
 * does not read; a proposal stale once the custom instruction it was read from changes. And the tables of what `nemia admit` and the
 * rules' store refuse, each writing nothing.
 *
 * What admission decides off a state it is handed is the table of `src/admission/admission.test.ts`; what a rule allows,
 * `src/auto/auto.test.ts`; the facts it reads, `src/auto/facts.test.ts`. `WF_ROOT` is set before `src` is imported, which reads it as
 * it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from './scratch.ts';
import { staged, story } from './story.ts';
import { names } from './assessed.ts';

const ROOT = scratch('wf-auto-rules-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { ADMIT, admitted } = await import('../src/admission/admit.verb.ts');
const { TABLE } = await import('../src/command/commands.verb.ts');
const { addFactory } = await import('../src/factory/factory.store.ts');
const { writeFactoryLevel } = await import('../src/level/level.store.ts');
const { writeLevel } = await import('../src/nemia/level.store.ts');
const { customInstructionsFile } = await import('../src/agents/read.store.ts');
const { DEFAULT_AUTO, ruleWords } = await import('../src/auto/auto.ts');
const { confirmedFile, confirmRule, digestOf, dropRule, proposedFile, readConfirmed, writeProposed } =
  await import('../src/auto/auto.store.ts');
const { autoListOf, proposalOf } = await import('../src/auto/auto.verb.ts');
const { engineOf, runWith } = await import('../src/runtime-client.ts');
/** The CLI's `main`, loaded only if a checkpoint types a command: these stories call the verbs, and its import is the slowest. */
const main: Parameters<typeof staged>[0]['main'] = async (...argv) => (await import('../src/cli/main.ts')).main(...argv);
const stage = staged({ runWith, main, engineOf });

const NOW = new Date('2026-10-06T12:00:00.000Z');

/** A proposal of one rule, `tries`, and one word of guidance. */
const PROPOSAL = JSON.stringify({
  rules: [{ id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'], under: 20 }],
  guidance: ['be kind to the reviewer'],
});

/** The words the person reads of `tries`, as proposed, and of the default. */
const TRIES = ruleWords(proposalOf(PROPOSAL).rules[0]);
const DEFAULT = ruleWords(DEFAULT_AUTO);

/** A scratch store where nemia proposed `PROPOSAL` from no custom instruction. */
function proposed(): string {
  const home = scratch('auto-store-');
  writeProposed(home, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL), digest: null });
  return home;
}

/** The kind of what `fn` throws, and its message. */
function refusal(fn: () => unknown): { kind: string; message: string } {
  try {
    fn();
  } catch (err) {
    return { kind: (err as { _tag: string })._tag, message: (err as Error).message };
  }
  return assert.fail('no refusal');
}

/** Writes the run `id`'s record, started in `factory`, or in none, its steps `workflow` filed as `steps` say. */
function writeRun(
  id: string,
  factory?: string,
  workflow: object[] = [{ name: 'build', after: [], body: 'Build it.', harness: 'codex' }],
  steps = {},
) {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  const record = {
    id,
    workspace: ROOT,
    brief: `The brief of ${id}`,
    createdAt: '2026-10-06T08:00:00.000Z',
    workflowDir: path.join(ROOT, 'no-such-workflow'),
    place: { kind: 'folder' },
    workflow,
    steps,
    ...(factory === undefined ? {} : { factory }),
  };
  fs.writeFileSync(path.join(ROOT, 'runs', `${id}.json`), JSON.stringify(record));
}

/** A factory of the store, named `name`, holding a scratch repository. */
const factory = (name: string) => addFactory({ name, repos: [fs.mkdtempSync(path.join(ROOT, `${name}-`))] });

/** Puts on the board a task settled as it succeeded, with `closeout` and its exit code. */
const settled = (id: string, closeout?: unknown, exitCode = 0) => {
  Effect.runSync(stage.board().e.file({ id, brief: `the task ${id}`, cwd: ROOT }));
  stage.board().settle(id, 'succeeded', closeout, exitCode);
};

/** Admission's decision for the shell line `command` at the floor `semi-auto`, or none. */
const decided = async (command: string, floor: 'semi-auto' | 'none' = 'semi-auto') =>
  (
    await stage.runWith(
      stage.board().e,
      admitted(JSON.stringify({ tool: 'Bash', input: { command }, cwd: '/w' }), TABLE, floor === 'none' ? undefined : floor),
    )
  )?.decision;

/** Admission's decision for the shell line `command` with nemia's rules at auto, or none. */
const decidedAtAuto = async (command: string) =>
  (
    await stage.runWith(
      stage.board().e,
      admitted(JSON.stringify({ tool: 'Bash', input: { command }, cwd: '/w' }), TABLE, undefined, 'nemia', ROOT),
    )
  )?.decision;

test('Her floor: a call on a run or a factory left at manual is denied, one raised is hers, an unread run asked; the store raised raises every factory', async (t) => {
  const s = story(t);
  await s.test(
    'REFUSED: a call on a run of a factory at manual, or on the factory, is denied; one raised is hers; an unread run is asked',
    async () => {
      for (const name of ['pipao', 'hkb']) factory(name);
      writeRun('r-pipao', 'pipao');
      writeRun('r-hkb', 'hkb');
      writeRun('r-default');
      writeFactoryLevel('hkb', { since: '2026-10-06T08:00:00.000Z', raise: { level: 'semi-auto', until: '2099-01-01T00:00:00.000Z' } });
      assert.equal(await decided('nemia show r-pipao'), 'deny');
      assert.equal(await decided('nemia start ./brief.md --factory pipao'), 'deny');
      assert.equal(await decided('nemia show r-default'), 'deny', "the default factory follows the store's level, manual where unset");
      assert.equal(await decided('nemia show r-hkb'), undefined, 'a factory raised above manual is hers');
      assert.equal(await decided('nemia show r-gone'), 'ask');
      assert.equal(await decided('nemia show r-pipao', 'none'), undefined, 'no floor, no scope');
    },
  );
  await s.test("the store's level raised raises the default factory, and every factory without its own", async () => {
    writeLevel({ level: 'semi-auto', since: '2026-10-06T08:00:00.000Z' });
    assert.equal(await decided('nemia show r-default'), undefined, "the store's level raises the default factory");
    assert.equal(await decided('nemia show r-pipao'), undefined, 'and every factory without its own');
  });
});

test('Auto rules decide an approval: proposed, confirmed beside the default, given unasked at auto, asked otherwise, dropped, and a proposal gone stale', async (t) => {
  const s = story(t);
  await s.test("a proposal writes the agent's file alone; the person's list is none, and the default stays in force", () => {
    writeProposed(ROOT, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL), digest: null });
    assert.equal(fs.existsSync(confirmedFile(ROOT, 'nemia')), false);
    assert.equal(path.dirname(proposedFile(ROOT, 'nemia')), path.dirname(confirmedFile(ROOT, 'nemia')));
    const list = autoListOf(ROOT, 'nemia');
    assert.equal(list.isDefault, true);
    assert.equal(list.builtin.id, 'default', 'the builtin rule is offered to be confirmed again');
    assert.deepEqual(
      list.rules.map((r) => r.id),
      ['default'],
    );
    assert.deepEqual(
      list.proposed?.rules.map((r) => [r.id, r.confirmed]),
      [['tries', false]],
      'a proposed rule is no confirmed one',
    );
    assert.deepEqual(list.proposed?.guidance, ['be kind to the reviewer']);
  });
  await s.test('the first confirm seeds the list with the default beside the rule confirmed, marked by where each came from', () => {
    confirmRule(ROOT, 'nemia', 'tries', TRIES, NOW);
    assert.deepEqual(readConfirmed(ROOT, 'nemia'), {
      since: NOW.toISOString(),
      rules: [DEFAULT_AUTO, { id: 'tries', answer: 'retry', steps: ['implement'], when: ['checked'], under: 20, from: 'proposed' }],
    });
    const list = autoListOf(ROOT, 'nemia');
    assert.equal(list.isDefault, false);
    const words = list.rules[1]?.words ?? '';
    for (const fact of ['Try again', 'implement', 'its check passed', 'under $20']) assert.ok(words.includes(fact), words);
  });
  await s.test("a proposal written again leaves the person's list as it was: it is no proposal's to write", () => {
    const before = fs.readFileSync(confirmedFile(ROOT, 'nemia'));
    writeProposed(ROOT, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL.replace('20', '30')), digest: null });
    assert.deepEqual(fs.readFileSync(confirmedFile(ROOT, 'nemia')), before, "the person's list is no proposal's to write");
  });
  await s.test(
    'at auto, an approval the default allows is given unasked; at semi-auto, on a refused check, an unread run, or a cap raised, asked',
    async () => {
      for (const name of ['auto', 'semi']) factory(name);
      writeFactoryLevel('auto', { since: '2026-10-06T08:00:00.000Z', raise: { level: 'auto', until: '2099-01-01T00:00:00.000Z' } });
      writeFactoryLevel('semi', { since: '2026-10-06T08:00:00.000Z', raise: { level: 'semi-auto', until: '2099-01-01T00:00:00.000Z' } });
      const GATED = [{ name: 'build', after: [], body: 'Build it.', harness: 'codex', gate: true, check: 'npm test' }];
      for (const [id, at] of [
        ['g-auto', 'auto'],
        ['g-semi', 'semi'],
        ['g-refused', 'auto'],
      ] as const)
        writeRun(id, at, GATED, { build: { taskId: `${id}-build`, check: { taskId: `${id}-check` } } });
      for (const id of ['g-auto', 'g-semi', 'g-refused']) settled(`${id}-build`, { outcome: 'done', summary: 'Built.', artifacts: [] });
      settled('g-auto-check', undefined, 0);
      settled('g-semi-check', undefined, 0);
      settled('g-refused-check', undefined, 1);
      assert.equal(await decided('nemia approve g-auto build', 'none'), 'ask', 'no rules handed, the approval is asked');
      assert.equal(await decidedAtAuto('nemia approve g-auto build'), undefined);
      assert.equal(await decidedAtAuto('nemia approve g-semi build'), 'ask', 'the same state at semi-auto');
      assert.equal(await decidedAtAuto('nemia approve g-refused build'), 'ask', 'its check refused');
      assert.equal(await decidedAtAuto('nemia approve g-gone build'), 'ask', 'a run that does not read');
      const IMPLEMENT = { name: 'implement', after: [], body: 'Build it.', harness: 'codex', check: 'npm test' };
      writeRun('g-tries', 'auto', [{ ...IMPLEMENT, gate: true }], {
        implement: { taskId: 'g-tries-implement', check: { taskId: 'g-tries-check' } },
      });
      settled('g-tries-implement', { outcome: 'done', summary: 'Built.', artifacts: [] });
      settled('g-tries-check', undefined, 0);
      assert.equal(await decidedAtAuto('nemia retry g-tries implement'), undefined, '`tries` allows a try of implement, its check passed');
      assert.equal(
        await decidedAtAuto('nemia retry g-tries implement --budget 5'),
        'ask',
        "the same try raising the step's cap, whatever the rules allow",
      );
      writeRun('g-free', 'auto', [IMPLEMENT], {
        implement: { taskId: 'g-free-implement', check: { taskId: 'g-free-check' } },
      });
      settled('g-free-implement', { outcome: 'done', summary: 'Built.', artifacts: [] });
      settled('g-free-check', undefined, 0);
      assert.equal(await decidedAtAuto('nemia retry g-free implement'), undefined, 'a try of a step that waits on no one');
      assert.equal(await decidedAtAuto('nemia retry g-free implement --budget 5'), 'ask', 'is asked once it raises the cap');
    },
  );
  await s.test('REFUSED: a confirm of a rule is asked every time, at auto', async () => {
    assert.equal(await decidedAtAuto('nemia auto confirm nemia default'), 'ask');
  });
  await s.test('a proposal read from a custom instruction is stale once its words change, and one proposed from none is stale', () => {
    const file = customInstructionsFile(ROOT, 'nemia');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'approve when all agree\n');
    writeProposed(ROOT, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL), digest: digestOf('approve when all agree') });
    assert.equal(autoListOf(ROOT, 'nemia').proposed?.stale, false);
    assert.equal(autoListOf(ROOT, 'nemia').instruction, 'approve when all agree');
    fs.writeFileSync(file, 'approve when all agree, and retry a check once\n');
    assert.equal(autoListOf(ROOT, 'nemia').proposed?.stale, true);
    writeProposed(ROOT, 'nemia', { at: NOW.toISOString(), ...proposalOf(PROPOSAL), digest: null });
    assert.equal(autoListOf(ROOT, 'nemia').proposed?.stale, true, 'proposed from no instruction');
  });
  await s.test('the person drops the default: an approval is asked, and a list that does not read lets nothing through', async () => {
    dropRule(ROOT, 'nemia', 'default', new Date('2026-10-06T09:00:00.000Z'));
    assert.deepEqual(
      readConfirmed(ROOT, 'nemia')?.rules.map((r) => r.id),
      ['tries'],
    );
    assert.equal(await decidedAtAuto('nemia approve g-auto build'), 'ask', 'no approval in force');
    fs.writeFileSync(confirmedFile(ROOT, 'nemia'), '{');
    assert.equal(await decidedAtAuto('nemia approve g-auto build'), 'ask', 'a list that does not read lets nothing through');
  });
  await s.test('a drop before any confirm takes the default out of force, and the default is confirmed again by its id', () => {
    const home = proposed();
    dropRule(home, 'nemia', 'default', NOW);
    assert.deepEqual(readConfirmed(home, 'nemia')?.rules, [], 'nothing in force: every answer is asked');
    assert.equal(autoListOf(home, 'nemia').isDefault, false);
    confirmRule(home, 'nemia', 'default', DEFAULT, NOW);
    assert.deepEqual(readConfirmed(home, 'nemia')?.rules, [DEFAULT_AUTO]);
  });
});

test('`nemia admit` refuses a floor that is no level and an --auto naming no agent', async (t) => {
  await t.test('REFUSED: a floor that is no level, naming the flags', () => {
    names(ADMIT.check?.({ atLeast: 'on' }), '"on" is no level', 'nemia admit', '--at-least manual|semi-auto|auto', '--auto <agent>');
  });
  await t.test('a floor that is a level', () => {
    assert.equal(ADMIT.check?.({ atLeast: 'semi-auto' }), null);
  });
  await t.test('REFUSED: --auto naming no agent', () => {
    const said = ADMIT.check?.({ auto: '../x' });
    names(said, "`../x` is not an agent's name:");
    assert.ok(said!.startsWith('`../x`'), said!);
  });
  await t.test('--auto naming an agent', () => {
    assert.equal(ADMIT.check?.({ auto: 'nemia' }), null);
  });
});

test('The rules on disk refuse, by their kind, writing nothing', async (t) => {
  await t.test(
    'REFUSED (Missing, Conflict, Invalid): a rule not proposed, one in force already, a drop of one not in force, a name that is no agent',
    () => {
      const home = proposed();
      assert.equal(refusal(() => confirmRule(home, 'nemia', 'ghost', TRIES, NOW)).kind, 'Missing');
      assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
      assert.equal(refusal(() => confirmRule(home, 'nemia', 'default', DEFAULT, NOW)).kind, 'Conflict', 'the default is in force already');
      assert.equal(refusal(() => dropRule(home, 'nemia', 'tries', NOW)).kind, 'Missing');
      assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
      confirmRule(home, 'nemia', 'tries', TRIES, NOW);
      const { kind, message } = refusal(() => confirmRule(home, 'nemia', 'tries', TRIES, NOW));
      assert.equal(kind, 'Conflict');
      names(message, 'nemia auto drop nemia tries');
      assert.equal(refusal(() => confirmedFile(home, '../x')).kind, 'Invalid');
    },
  );
  await t.test('REFUSED (Conflict): a confirm of words the rule under its id no longer reads, proposed again since', () => {
    const home = proposed();
    writeProposed(home, 'nemia', {
      at: NOW.toISOString(),
      ...proposalOf(JSON.stringify({ rules: [{ id: 'tries', answer: 'approve', when: [] }], guidance: [] })),
      digest: null,
    });
    const { kind, message } = refusal(() => confirmRule(home, 'nemia', 'tries', TRIES, NOW));
    assert.equal(kind, 'Conflict');
    assert.ok(message.startsWith("nemia's rule tries"), message);
    names(message, '"Approve any step unasked', 'nemia auto nemia');
    assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
    assert.equal(refusal(() => confirmRule(home, 'nemia', 'default', `${DEFAULT} `, NOW)).kind, 'Conflict', "the default's own words");
    assert.equal(fs.existsSync(confirmedFile(home, 'nemia')), false);
  });
  await t.test("REFUSED (Invalid): a person's list that does not read, naming its file and the fix", () => {
    const home = scratch('auto-store-');
    fs.mkdirSync(path.dirname(confirmedFile(home, 'nemia')), { recursive: true });
    fs.writeFileSync(
      confirmedFile(home, 'nemia'),
      JSON.stringify({ since: NOW.toISOString(), rules: [{ id: 'x', answer: 'merge', when: [] }] }),
    );
    const { kind, message } = refusal(() => readConfirmed(home, 'nemia'));
    assert.equal(kind, 'Invalid');
    names(message, 'nemia.json: its rules.0.answer', 'move it aside');
  });
  const rule = { id: 'r', answer: 'approve', when: ['checked'] };
  for (const [name, words] of [
    ['no JSON', 'not json'],
    ['no rules', '{}'],
    ['a condition that is none', JSON.stringify({ rules: [{ ...rule, when: ['cheap'] }] })],
    ['an answer that is none', JSON.stringify({ rules: [{ ...rule, answer: 'merge' }] })],
    ['a cap that is none', JSON.stringify({ rules: [{ ...rule, under: -1 }] })],
    ['an id twice', JSON.stringify({ rules: [rule, rule] })],
    ['the id of the rule that ships', JSON.stringify({ rules: [{ ...rule, id: 'default' }] })],
    ['a blank word of guidance', JSON.stringify({ rules: [rule], guidance: [''] })],
  ] as const)
    await t.test(`REFUSED (Invalid): a proposal with ${name}`, () => {
      assert.equal(refusal(() => proposalOf(words)).kind, 'Invalid', words);
    });
});
