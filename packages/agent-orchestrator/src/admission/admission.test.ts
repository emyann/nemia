/**
 * A call's admission, pure, as two tables of `admissionOf`: what waits on the person and is asked, what passes as hers, and the reason a
 * person reads; then the same calls under her floor (`Scope`) and at `auto` (`Auto`), where a call on a factory left below the floor is
 * denied and an answer the confirmed rules allow is given unasked. Beside them, the table's own invariant: every factory verb names its
 * factory under the key admission reads. The verb that reads a store for them (`nemia admit`) is told in `test/auto-rules.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admissionOf, type Auto, type Scope } from './admission.ts';
import { TABLE } from '../command/commands.verb.ts';
import { DEFAULT_AUTO, listInForce, type AutoRule, type Facts } from '../auto/index.ts';
import type { Level } from '../level/level.ts';
import type { ApproveForm } from '../gate/gate.ts';
import { names } from '../../test/assessed.ts';

/** The state the fixtures read: `r`'s step `gate` awaits approval, `check` failed its check, and no other run is there. */
const waitOf = (runId: string, step: string): string | undefined =>
  runId !== 'r'
    ? `is not there: there is no run ${runId}`
    : step === 'check'
      ? undefined
      : step === 'gate'
        ? 'is awaiting approval'
        : 'is not there';

/** Admission's answer for a shell line, with no floor and no rules. */
const answerOf = (command: string, tool = 'Bash') => admissionOf({ tool, input: { command }, cwd: '/w' }, TABLE, waitOf);

/** Admission's decision for a shell line, or undefined for none. */
const decided = (command: string, tool = 'Bash') => answerOf(command, tool)?.decision;

test('`admissionOf` with no floor and no rules: what answers the person is asked, the rest is hers, and the person reads why', async (t) => {
  for (const line of [
    'nemia approve r gate',
    'nemia approve r check',
    'nemia accept r check',
    'nemia round r',
    'nemia accept r',
    'nemia retry r gate --message "go"',
    'nemia retry r check --budget 5',
    'nemia retry r check --budget=5',
    'nemia retry q check --recheck',
    'nemia retry r',
  ])
    await t.test(`REFUSED to run unasked: ${line}`, () => {
      assert.equal(decided(line), 'ask', line);
    });
  for (const line of ['nemia retry r check --recheck', 'nemia retry r check && nemia tick', 'nemia show r', 'nemia hold r', 'ls'])
    await t.test(`a retry of a step that waits on no one, a read and her own writes get no answer: ${line}`, () => {
      assert.equal(decided(line), undefined, line);
    });
  await t.test('a call of another tool than the shell gets no answer', () => {
    assert.equal(decided('nemia approve r gate', 'Read'), undefined, 'no shell line');
  });
  for (const line of [
    "bash -c 'nemia approve r gate'",
    '/usr/local/bin/nemia approve r gate',
    'wf approve r gate',
    'timeout 30 nemia approve r gate',
    'nemia show r; nemia approve r gate',
    'echo $(nemia round r)',
    'WF_ROOT=/s nemia retry r gate',
  ])
    await t.test(`REFUSED to pass unseen, wrapped, behind a path, an alias or another command: ${line}`, () => {
      assert.equal(decided(line), 'ask', line);
    });
  await t.test('the person reads why: the line, and what it answers', () => {
    names(answerOf('nemia retry r gate')?.reason, 'nemia retry r gate', 'waits on you', 'gate of r is awaiting approval');
    names(answerOf('nemia approve r gate')?.reason, 'nemia approve r gate', 'waits on you', 'yours to give');
    names(answerOf('nemia retry r check --budget 5')?.reason, 'nemia retry r check --budget 5', "a step's cap", 'yours to raise');
  });
  await t.test('the class decides, not the name: a table that classes approve as act lets it through', () => {
    const table = TABLE.map((c) => (c.name === 'approve' ? { ...c, class: 'act' as const } : c));
    assert.equal(admissionOf({ tool: 'Bash', input: { command: 'nemia approve r gate' }, cwd: '/w' }, table, waitOf), undefined);
  });
  for (const line of [
    'nemia policy confirm nemia tries',
    "nemia policy confirm nemia tries --words 'Try again the step implement unasked when its check passed and the run has cost under $20.'",
    'nemia policy confirm nemia tries --words "Try again the step implement unasked."',
    'nemia policy drop nemia default',
    'nemia show r && nemia policy confirm nemia tries',
    'nemia factory apply made --template /t --repo /r',
    'nemia factory upgrade made --to 0.2.0',
    "nemia factory resolve made 'workflows/dev/review.md#rounds' --theirs",
  ])
    await t.test(`REFUSED: asked every time, with no list: ${line}`, () => {
      assert.equal(decided(line), 'ask', line);
    });
  await t.test('a write of the rules says it is asked every time', () => {
    names(answerOf('nemia policy confirm nemia tries')?.reason, 'nemia policy confirm nemia tries is yours', 'asked every time');
  });
});

/** A floor of semi-auto over the store of the fixtures: `r` and `s` in pipao, at manual; `t` in hkb, at semi-auto; `gone` unread. */
const SCOPE: Scope = {
  atLeast: 'semi-auto',
  runOf: (runId) =>
    runId === 'gone' ? undefined : runId === 't' ? { factory: 'hkb', level: 'semi-auto' } : { factory: 'pipao', level: 'manual' },
  factoryOf: (factory) => (factory === 'hkb' ? 'semi-auto' : 'manual'),
};

/** Admission's answer for a shell line under `scope`. */
const scopedAnswer = (command: string, scope: Scope = SCOPE) =>
  admissionOf({ tool: 'Bash', input: { command }, cwd: '/w' }, TABLE, waitOf, scope);

/** A run where all agree: every condition holds, and it has cost $3. */
const ALL_AGREE: Facts = { recommends: true, checked: true, accepted: true, withinBudget: true, nothingOpen: true, spend: 3 };

/**
 * What admission reads at auto: `list` in force, `r`'s factory at `level`, its facts `facts` or none (`unread`), the yes an approval of
 * its step gives (`form`, or none: `unread`), and no other run.
 */
const atAuto = (
  list: readonly AutoRule[],
  level: Level = 'auto',
  facts: Facts | 'unread' = ALL_AGREE,
  form: ApproveForm | 'unread' = 'gate',
): Auto => ({
  list,
  levelOf: (runId) => (runId === 'r' ? level : undefined),
  factsOf: (runId) => (runId === 'r' && facts !== 'unread' ? facts : undefined),
  formOf: (runId) => (runId === 'r' && form !== 'unread' ? form : undefined),
});

/** Admission's decision for a shell line at auto, or undefined for none. */
const decidedAt = (command: string, auto: Auto | undefined) =>
  admissionOf({ tool: 'Bash', input: { command }, cwd: '/w' }, TABLE, waitOf, undefined, auto)?.decision;

/** A rule the person confirmed: a try of any step, unasked, where all agree. */
const TRIES: AutoRule = { id: 'tries', answer: 'retry', when: ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'] };

test('`admissionOf` under her floor and at auto: below the floor denied, unread asked, and an answer the rules allow given unasked', async (t) => {
  for (const line of [
    'nemia approve r gate',
    'nemia show r',
    'nemia rm t r',
    'nemia start ./brief.md --factory pipao',
    'nemia level semi-auto --factory pipao --for 2h',
    'nemia factory rm pipao',
    'nemia factory instruct pipao --clear',
    'nemia factory instruction pipao --store',
    'nemia factory fire pipao --step build/plan',
    'nemia show t && nemia hold s',
    'nemia show r 2>/dev/null',
  ])
    await t.test(`REFUSED: a call on a run or a factory below the floor is denied, whatever its class: ${line}`, () => {
      assert.equal(scopedAnswer(line)?.decision, 'deny', line);
    });
  await t.test('a denial names the run, its factory and level, the floor, and the command that raises it', () => {
    names(scopedAnswer('nemia hold r')?.reason, 'nemia hold r', 'r of the factory pipao', 'at manual', 'below semi-auto');
    names(scopedAnswer('nemia hold r')?.reason, 'nemia level semi-auto --factory pipao [--for <duration>]');
  });
  await t.test('every factory at the floor or above: the scope answers as no scope does', () => {
    const open: Scope = { atLeast: 'semi-auto', runOf: () => ({ factory: 'hkb', level: 'semi-auto' }), factoryOf: () => 'semi-auto' };
    for (const line of ['nemia approve r gate', 'nemia show r', 'nemia retry r check --recheck', 'nemia start x.md --factory hkb', 'ls'])
      assert.deepEqual(scopedAnswer(line, open), answerOf(line), line);
    assert.equal(scopedAnswer('nemia show t'), undefined, 'a run of a factory above the floor is hers to read');
  });
  await t.test('REFUSED to pass unread: a run that does not read, and a scoped command whose words do not parse, are asked', () => {
    names(scopedAnswer('nemia show gone')?.reason, 'names gone', 'does not read');
    assert.equal(scopedAnswer('nemia show gone')?.decision, 'ask');
    assert.equal(scopedAnswer('nemia show t --frob')?.decision, 'ask');
  });
  await t.test("at auto, an answer the confirmed list allows in the run's state is given unasked", () => {
    assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce(undefined))), undefined);
    assert.equal(decidedAt('nemia retry r gate', atAuto([DEFAULT_AUTO, TRIES])), undefined);
    assert.equal(decidedAt('nemia approve r gate && nemia retry r gate', atAuto([DEFAULT_AUTO, TRIES])), undefined, 'each allowed');
  });
  await t.test('REFUSED at semi-auto: the same state asks, and so does a session handed no list, at auto', () => {
    assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce(undefined), 'semi-auto')), 'ask');
    assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce(undefined), 'manual')), 'ask');
    assert.equal(decidedAt('nemia approve r gate', undefined), 'ask');
  });
  await t.test('REFUSED: a rule nobody confirmed allows nothing; a list with the default dropped allows no approval', () => {
    assert.equal(decidedAt('nemia retry r gate', atAuto(listInForce(undefined))), 'ask', 'only the default is in force');
    assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce([TRIES]))), 'ask');
    assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce([]))), 'ask');
  });
  await t.test(
    'REFUSED at auto: a state where one condition fails, a run whose facts or level do not read, and an answer naming no step',
    () => {
      assert.equal(decidedAt('nemia approve r gate', atAuto([DEFAULT_AUTO], 'auto', { ...ALL_AGREE, checked: false })), 'ask');
      assert.equal(decidedAt('nemia approve r gate', atAuto([DEFAULT_AUTO], 'auto', 'unread')), 'ask');
      assert.equal(decidedAt('nemia approve q gate', atAuto([DEFAULT_AUTO])), 'ask');
      assert.equal(decidedAt('nemia round r', atAuto([DEFAULT_AUTO])), 'ask', 'a round is no answer a rule gives');
      assert.equal(decidedAt('nemia accept r review', atAuto([DEFAULT_AUTO], 'auto', ALL_AGREE, 'loop')), 'ask', 'nor a loop ended');
    },
  );
  await t.test(
    "REFUSED at auto: a round, and an approval that ends a loop out of rounds, are the person's whatever the rules allow",
    () => {
      const loose = [DEFAULT_AUTO, TRIES];
      assert.equal(decidedAt('nemia retry r review --round', atAuto(loose)), 'ask');
      assert.equal(decidedAt('nemia round r review', atAuto(loose)), 'ask', 'its former spelling, read as retry --round');
      assert.equal(decidedAt('nemia approve r review --message x', atAuto(loose, 'auto', ALL_AGREE, 'loop')), 'ask');
      assert.equal(decidedAt('nemia accept r review --message x', atAuto(loose, 'auto', ALL_AGREE, 'loop')), 'ask', 'its former spelling');
      assert.equal(decidedAt('nemia approve r review --message x', atAuto(loose, 'auto', ALL_AGREE, 'unread')), 'ask', 'a yes not read');
      assert.equal(decidedAt('nemia approve r review --message x', atAuto(loose)), undefined, 'at its gate, the rule gives it');
    },
  );
  await t.test("REFUSED at auto: a try that raises a step's cap, whatever the rules allow", () => {
    assert.equal(decidedAt('nemia retry r gate --budget 5', atAuto([DEFAULT_AUTO, TRIES])), 'ask');
    assert.equal(decidedAt('nemia retry r gate --budget=5', atAuto([DEFAULT_AUTO, TRIES])), 'ask');
  });
  await t.test("REFUSED at auto: a confirm or a drop of a rule, and a factory's apply, upgrade and resolve, are asked every time", () => {
    for (const line of [
      'nemia policy confirm nemia tries',
      "nemia policy confirm nemia tries --words 'Try again the step implement unasked when its check passed and the run has cost under $20.'",
      'nemia policy confirm nemia tries --words "Try again the step implement unasked."',
      'nemia policy drop nemia default',
      'nemia show r && nemia policy confirm nemia tries',
      'nemia auto drop nemia default',
      'nemia factory apply made --template /t --repo /r',
      'nemia factory upgrade made --to 0.2.0',
      "nemia factory resolve made 'workflows/dev/review.md#rounds' --theirs",
    ])
      assert.equal(decidedAt(line, atAuto([DEFAULT_AUTO, TRIES])), 'ask', line);
  });
  await t.test("the rules' read and a factory's plan are no ask, at auto", () => {
    assert.equal(decidedAt('nemia policy nemia', atAuto([DEFAULT_AUTO])), undefined, 'the read is no ask');
    assert.equal(decidedAt('nemia factory plan made --to 0.2.0', atAuto([DEFAULT_AUTO])), undefined, 'the plan is no ask');
  });
});

test('REFUSED to name a factory unscoped: every factory verb but the two that file a new factory takes it under the key admission reads', () => {
  const unscoped = TABLE.filter((e) => e.name.startsWith('factory ') && e.name !== 'factory add' && e.name !== 'factory apply')
    .filter((e) => (e.spec?.positionals.length ?? 0) > 0 && e.spec?.positionals[0].key !== 'factory')
    .map((e) => e.name);
  assert.deepEqual(unscoped, []);
});
