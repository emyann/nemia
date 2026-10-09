import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admissionOf, type Auto, type Scope } from './admission.ts';
import { TABLE } from '../command/commands.verb.ts';
import { DEFAULT_AUTO, listInForce, type AutoRule, type Facts } from '../auto/index.ts';
import type { Level } from '../level/level.ts';

/** The state the fixtures read: `r`'s step `gate` awaits approval, `check` failed its check, and no other run is there. */
const waitOf = (runId: string, step: string): string | undefined =>
  runId !== 'r'
    ? `is not there: there is no run ${runId}`
    : step === 'check'
      ? undefined
      : step === 'gate'
        ? 'is awaiting approval'
        : 'is not there';

/** Admission's decision for a shell line, or undefined for none. */
const decided = (command: string, tool = 'Bash') => admissionOf({ tool, input: { command }, cwd: '/w' }, TABLE, waitOf)?.decision;

test('REFUSED to run unasked: an approval, a round and an accept whatever waits, and a retry of what waits on the person or raises a cap, each asked', () => {
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
    assert.equal(decided(line), 'ask', line);
});

test('a retry of a step that waits on no one, a read and her own writes get no answer, and meet her static rules', () => {
  for (const line of ['nemia retry r check --recheck', 'nemia retry r check && nemia tick', 'nemia show r', 'nemia hold r', 'ls'])
    assert.equal(decided(line), undefined, line);
  assert.equal(decided('nemia approve r gate', 'Read'), undefined, 'no shell line');
});

test('REFUSED to pass unseen: an answer wrapped in a shell, behind a path, an alias or another command on the line', () => {
  for (const line of [
    "bash -c 'nemia approve r gate'",
    '/usr/local/bin/nemia approve r gate',
    'wf approve r gate',
    'timeout 30 nemia approve r gate',
    'nemia show r; nemia approve r gate',
    'echo $(nemia round r)',
    'WF_ROOT=/s nemia retry r gate',
  ])
    assert.equal(decided(line), 'ask', line);
});

test('the person reads why: the line, and what it answers', () => {
  const answer = (command: string) => admissionOf({ tool: 'Bash', input: { command }, cwd: '/w' }, TABLE, waitOf)?.reason;
  assert.equal(answer('nemia retry r gate'), 'nemia retry r gate answers what waits on you: gate of r is awaiting approval.');
  assert.equal(answer('nemia approve r gate'), 'nemia approve r gate answers what waits on you: it is yours to give.');
  assert.equal(answer('nemia retry r check --budget 5'), "nemia retry r check --budget 5 raises a step's cap: a budget is yours to raise.");
});

test('the class decides, not the name: a table that classes approve as hers lets it through', () => {
  const table = TABLE.map((c) => (c.name === 'approve' ? { ...c, nemia: 'hers' as const } : c));
  assert.equal(admissionOf({ tool: 'Bash', input: { command: 'nemia approve r gate' }, cwd: '/w' }, table, waitOf), undefined);
});

/** A floor of semi-auto over the store of the fixtures: `r` and `s` in pipao, at manual; `t` in hkb, at semi-auto; `gone` unread. */
const SCOPE: Scope = {
  floor: 'semi-auto',
  runOf: (runId) =>
    runId === 'gone' ? undefined : runId === 't' ? { factory: 'hkb', level: 'semi-auto' } : { factory: 'pipao', level: 'manual' },
  factoryOf: (factory) => (factory === 'hkb' ? 'semi-auto' : 'manual'),
};

/** Admission's answer for a shell line under `scope`. */
const scopedAnswer = (command: string, scope: Scope = SCOPE) =>
  admissionOf({ tool: 'Bash', input: { command }, cwd: '/w' }, TABLE, waitOf, scope);

test('REFUSED: a call that acts on a run or a factory below the floor is denied, whatever its class, on any part of the line', () => {
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
    assert.equal(scopedAnswer(line)?.decision, 'deny', line);
  assert.equal(
    scopedAnswer('nemia hold r')?.reason,
    "nemia hold r acts on r of the factory pipao, at manual: below semi-auto, it is left alone. Raising it is the person's: nemia level semi-auto --factory pipao [--for <duration>].",
  );
});

test('REFUSED to name a factory unscoped: every factory verb but the two that file a new factory takes it under the key admission reads', () => {
  const unscoped = TABLE.filter((e) => e.name.startsWith('factory ') && e.name !== 'factory add' && e.name !== 'factory apply')
    .filter((e) => (e.spec?.positionals.length ?? 0) > 0 && e.spec?.positionals[0].key !== 'factory')
    .map((e) => e.name);
  assert.deepEqual(unscoped, []);
});

test('every factory at the floor or above: the scope answers as no scope does', () => {
  const open: Scope = { floor: 'semi-auto', runOf: () => ({ factory: 'hkb', level: 'semi-auto' }), factoryOf: () => 'semi-auto' };
  for (const line of ['nemia approve r gate', 'nemia show r', 'nemia retry r check --recheck', 'nemia start x.md --factory hkb', 'ls'])
    assert.deepEqual(scopedAnswer(line, open), admissionOf({ tool: 'Bash', input: { command: line }, cwd: '/w' }, TABLE, waitOf), line);
  assert.equal(scopedAnswer('nemia show t'), undefined, 'a run of a factory above the floor is hers to read');
});

test('REFUSED to pass unread: a run that does not read, and a scoped command whose words do not parse, are asked', () => {
  assert.match(scopedAnswer('nemia show gone')?.reason ?? '', /names gone, which does not read/);
  assert.equal(scopedAnswer('nemia show gone')?.decision, 'ask');
  assert.equal(scopedAnswer('nemia show t --frob')?.decision, 'ask');
});

/** A run where all agree: every condition holds, and it has cost $3. */
const ALL_AGREE: Facts = { recommends: true, checked: true, accepted: true, withinBudget: true, nothingOpen: true, spend: 3 };

/** What admission reads at auto: `list` in force, `r`'s factory at `level`, its facts `facts` or none (`unread`), and no other run. */
const atAuto = (list: readonly AutoRule[], level: Level = 'auto', facts: Facts | 'unread' = ALL_AGREE): Auto => ({
  list,
  levelOf: (runId) => (runId === 'r' ? level : undefined),
  factsOf: (runId) => (runId === 'r' && facts !== 'unread' ? facts : undefined),
});

/** Admission's decision for a shell line at auto, or undefined for none. */
const decidedAt = (command: string, auto: Auto | undefined) =>
  admissionOf({ tool: 'Bash', input: { command }, cwd: '/w' }, TABLE, waitOf, undefined, auto)?.decision;

/** A rule the person confirmed: a try of any step, unasked, where all agree. */
const TRIES: AutoRule = { id: 'tries', answer: 'retry', when: ['recommends', 'checked', 'accepted', 'withinBudget', 'nothingOpen'] };

test("at auto, an answer the confirmed list allows in the run's state is given unasked", () => {
  assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce(undefined))), undefined);
  assert.equal(decidedAt('nemia retry r gate', atAuto([DEFAULT_AUTO, TRIES])), undefined);
  assert.equal(decidedAt('nemia approve r gate && nemia retry r gate', atAuto([DEFAULT_AUTO, TRIES])), undefined, 'each allowed');
});

test('REFUSED at semi-auto: the same state asks, and so does a session handed no list, at auto', () => {
  assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce(undefined), 'semi-auto')), 'ask');
  assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce(undefined), 'manual')), 'ask');
  assert.equal(decidedAt('nemia approve r gate', undefined), 'ask');
});

test('REFUSED: a rule nobody confirmed allows nothing; a list with the default dropped allows no approval', () => {
  assert.equal(decidedAt('nemia retry r gate', atAuto(listInForce(undefined))), 'ask', 'only the default is in force');
  assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce([TRIES]))), 'ask');
  assert.equal(decidedAt('nemia approve r gate', atAuto(listInForce([]))), 'ask');
});

test('REFUSED at auto: a state where one condition fails, a run whose facts or level do not read, and an answer naming no step', () => {
  assert.equal(decidedAt('nemia approve r gate', atAuto([DEFAULT_AUTO], 'auto', { ...ALL_AGREE, checked: false })), 'ask');
  assert.equal(decidedAt('nemia approve r gate', atAuto([DEFAULT_AUTO], 'auto', 'unread')), 'ask');
  assert.equal(decidedAt('nemia approve q gate', atAuto([DEFAULT_AUTO])), 'ask');
  assert.equal(decidedAt('nemia round r', atAuto([DEFAULT_AUTO])), 'ask', 'a round is no answer a rule gives');
  assert.equal(decidedAt('nemia accept r gate', atAuto([DEFAULT_AUTO])), 'ask', 'nor an accept');
});

test("REFUSED at auto: a try that raises a step's cap, whatever the rules allow", () => {
  assert.equal(decidedAt('nemia retry r gate --budget 5', atAuto([DEFAULT_AUTO, TRIES])), 'ask');
  assert.equal(decidedAt('nemia retry r gate --budget=5', atAuto([DEFAULT_AUTO, TRIES])), 'ask');
});

test('REFUSED: a confirm or a drop of a rule is asked every time, at auto and with no list, alone or behind another command', () => {
  for (const line of [
    'nemia auto confirm nemia tries',
    "nemia auto confirm nemia tries --words 'Try again the step implement unasked when its check passed and the run has cost under $20.'",
    'nemia auto confirm nemia tries --words "Try again the step implement unasked."',
    'nemia auto drop nemia default',
    'nemia show r && nemia auto confirm nemia tries',
  ])
    for (const auto of [undefined, atAuto([DEFAULT_AUTO, TRIES])]) assert.equal(decidedAt(line, auto), 'ask', line);
  assert.equal(decidedAt('nemia auto nemia', atAuto([DEFAULT_AUTO])), undefined, 'the read is no ask');
  assert.match(
    admissionOf({ tool: 'Bash', input: { command: 'nemia auto confirm nemia tries' }, cwd: '/w' }, TABLE, waitOf)?.reason ?? '',
    /^nemia auto confirm nemia tries is yours, asked every time/,
  );
});
