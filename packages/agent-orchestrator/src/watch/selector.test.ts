/**
 * The selector grammar of the feed: every malformed form refused by name, the reserved keys a label may not take, what a line offers a
 * selector, and the selections a person types — by factory, by workflow in a factory, by step, by agent, by agent on a step, and by an
 * agent across a factory — each failing when one clause of it is dropped.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startedLine, upgraded, type FeedLabels, type FeedLine } from '../feed/index.ts';
import {
  labelKeysRefusal,
  LABEL_KEYS,
  parseSelectors,
  RESERVED_KEYS,
  selectableOf,
  SELECTABLE_KEYS,
  selectorsRefusal,
  selects,
} from './selector.ts';

const AT = '2026-10-16T12:00:00.000Z';

/** A step's line of the feed as the tick signs one, its labels built field by field, never spread from another line. */
const step = (
  { run, factory, workflow, name, agent }: { run: string; factory: string; workflow: string; name: string; agent: string },
  word = 'running',
  note?: string,
): FeedLine =>
  upgraded({
    at: AT,
    run,
    step: name,
    word,
    ...(note !== undefined ? { note } : {}),
    involved: { kind: 'Step', name: `${run}/${name}` },
    labels: { run, factory, workflow, step: name, agent },
  });

/** A run's own line, which carries no step and no agent. */
const runLine = (run: string, factory: string, workflow: string, word = 'running'): FeedLine =>
  upgraded({ at: AT, run, word, involved: { kind: 'Run', name: run }, labels: { run, factory, workflow } });

const ADA_IMPLEMENT = step({ run: 'r-1', factory: 'nemia', workflow: 'build', name: 'implement', agent: 'ada' });
const ADA_DESIGN = step({ run: 'r-2', factory: 'nemia', workflow: 'quick', name: 'design', agent: 'ada' });
const ADA_QUICK = step({ run: 'r-5', factory: 'nemia', workflow: 'quick', name: 'implement', agent: 'ada' });
const AGORA_IMPLEMENT = step({ run: 'r-3', factory: 'pipao', workflow: 'build', name: 'implement', agent: 'agora' });
const AGORA_REVIEW = step({ run: 'r-7', factory: 'nemia', workflow: 'build', name: 'review', agent: 'agora' });
const SELDON_DESIGN = step({ run: 'r-6', factory: 'pipao', workflow: 'build', name: 'design', agent: 'seldon' });
const IRIS_INTAKE = step({ run: 'r-4', factory: 'pipao', workflow: 'intake', name: 'interview', agent: 'iris' });
const RUN_LINE = runLine('r-1', 'nemia', 'build');
const DAEMON = startedLine(4242, { kind: 'none' }, AT, Date.parse(AT));
const EVERY: readonly FeedLine[] = [
  ADA_IMPLEMENT,
  ADA_DESIGN,
  ADA_QUICK,
  AGORA_IMPLEMENT,
  AGORA_REVIEW,
  SELDON_DESIGN,
  IRIS_INTAKE,
  RUN_LINE,
  DAEMON,
];

/** The lines of `EVERY` the selectors `values` spell select, by what each line is about. */
const selected = (values: readonly string[]): string[] => {
  assert.equal(selectorsRefusal(values), undefined, values.join(' | '));
  const sel = parseSelectors(values);
  return EVERY.filter((l) => selects(sel, l)).map((l) => ('daemon' in l ? `pid ${l.daemon}` : `${l.run}/${l.step ?? '—'}`));
};

test('a selector names one of the ten keys of a feed line, and the message is none of them', () => {
  assert.deepEqual([...SELECTABLE_KEYS], [...LABEL_KEYS, ...RESERVED_KEYS]);
  const refused = selectorsRefusal(['message=hi']);
  assert.match(refused ?? '', /^"message" is no key of a feed line: a selector names one of run, factory, workflow, step, agent, kind/);
  assert.equal(ADA_IMPLEMENT.message !== undefined, true, 'the line does carry a message');
  assert.equal(selectableOf(ADA_IMPLEMENT).message, undefined, 'and no selector reads it');
});

test('every label a line can carry is a key a selector may name', () => {
  const every: Required<FeedLabels> = { run: 'r-1', factory: 'nemia', workflow: 'build', step: 'implement', agent: 'ada' };
  assert.deepEqual([...LABEL_KEYS], Object.keys(every), 'a label the list forgets is no key of a selector, and selects nothing live');
  const carries = upgraded({
    at: AT,
    run: 'r-1',
    step: 'implement',
    word: 'running',
    involved: { kind: 'Step', name: 'r-1/implement' },
    labels: every,
  });
  const on = selectableOf(carries);
  for (const key of Object.keys(every)) assert.equal(on[key], every[key as keyof FeedLabels], key);
  for (const key of Object.keys(every)) assert.equal(selectorsRefusal([`${key}=${every[key as keyof FeedLabels]}`]), undefined, key);
});

test('a label may not take a reserved name of a line, and the refusal names it', () => {
  assert.equal(labelKeysRefusal(LABEL_KEYS), undefined, 'the labels the feed ships with take none');
  assert.equal(LABEL_KEYS.length, 5, 'and the list it is asked of is every label there is, held above');
  assert.equal(
    labelKeysRefusal(['run', 'reason', 'agent']),
    'reason is a reserved key of a feed line (kind, reason, type, waits, source) and cannot be a label: name the label something else',
  );
  for (const key of RESERVED_KEYS) assert.match(labelKeysRefusal(['run', key]) ?? '', new RegExp(`^${key} is a reserved key`));
});

test('every malformed selector is refused by name, and says what the grammar takes', () => {
  const refusal = (value: string) => selectorsRefusal([value]) ?? '(taken)';
  assert.match(refusal(''), /^"" is no selector: it holds no clause/);
  assert.match(refusal(','), /^"," is no selector: it holds no clause/);
  assert.match(refusal('factory=nemia,'), /^a selector holds an empty clause/);
  assert.match(refusal('factory==nemia'), /^"factory==nemia" compares with ==, and a selector compares with one =/);
  assert.match(refusal('factory nemia'), /^"factory nemia" is no clause of a selector: it names no operator/);
  assert.match(refusal('factory in nemia'), /^"factory in nemia" names a list and spells it with no \(values\) after in/);
  assert.match(refusal('factory notin nemia'), /names a list and spells it with no \(values\) after notin/);
  assert.match(refusal('factory in (nemia'), /^"factory in \(nemia" leaves a \( open/);
  assert.match(refusal('factory in ()'), /^factory in \(\) takes a value at least/);
  assert.match(refusal('factory in (nemia,)'), /^factory in \(nemia,\) holds an empty value/);
  assert.match(refusal('factory='), /^factory= takes a value/);
  assert.match(refusal('factory!='), /^factory!= takes a value/);
  assert.match(refusal('factory=(x)'), /^"\(x\)" is no value of a selector, which reads \( \) and , itself/);
  assert.match(refusal('nope=1'), /^"nope" is no key of a feed line/);
  assert.match(refusal('nope'), /^"nope" is no key of a feed line/);
  assert.match(refusal('nope in (a)'), /^"nope" is no key of a feed line/);
  for (const value of ['factory=nemia', 'factory!=nemia', 'factory in (nemia,pipao)', 'reason notin (Running)', 'agent', 'kind=Step'])
    assert.equal(selectorsRefusal([value]), undefined, value);
  assert.match(selectorsRefusal(['factory=nemia', 'bad==x']) ?? '', /compares with ==/, 'every selector given is checked');
});

test('a selector reads the keys a signed line carries, and nothing it does not', () => {
  assert.deepEqual(selectableOf(ADA_IMPLEMENT), {
    run: 'r-1',
    factory: 'nemia',
    workflow: 'build',
    step: 'implement',
    agent: 'ada',
    kind: 'Step',
    reason: 'Running',
    type: 'Normal',
    source: 'tick',
  });
  assert.deepEqual(selectableOf(DAEMON), { kind: 'Daemon', reason: 'DaemonStarted', type: 'Normal', source: 'daemon' });
  const gate = step({ run: 'r-9', factory: 'nemia', workflow: 'build', name: 'design', agent: 'seldon' }, 'awaiting approval');
  assert.equal(selectableOf(gate).waits, 'person', 'a line that waits on a person says so under waits');
});

test('`=` and `in` never match a key the line does not carry, and `!=`, `notin` and a bare key tell it from a value', () => {
  assert.deepEqual(selected(['factory=nemia']), ['r-1/implement', 'r-2/design', 'r-5/implement', 'r-7/review', 'r-1/—']);
  assert.deepEqual(
    selected(['factory!=nemia']),
    ['r-3/implement', 'r-6/design', 'r-4/interview', 'pid 4242'],
    "a daemon's line carries no factory",
  );
  assert.deepEqual(selected(['agent']), [
    'r-1/implement',
    'r-2/design',
    'r-5/implement',
    'r-3/implement',
    'r-7/review',
    'r-6/design',
    'r-4/interview',
  ]);
  assert.deepEqual(selected(['waits']), [], 'and no line of these waits on a person');
  assert.deepEqual(selected(['reason notin (Running)']), ['pid 4242'], 'a line with another reason, and one with none, are selected');
});

test('AND within one selector, OR across two', () => {
  assert.deepEqual(selected(['factory=nemia,workflow=build,agent=ada,step=implement']), ['r-1/implement']);
  assert.deepEqual(selected(['factory=nemia,agent=iris']), [], 'a clause that holds of no line selects none');
  assert.deepEqual(selected(['agent=iris', 'agent=agora']), ['r-3/implement', 'r-7/review', 'r-4/interview']);
});

test('the selections a person types, each failing when one clause of it is dropped', () => {
  const cases: Array<{ typed: string; selects: string[]; drop: string; then: string[] }> = [
    {
      typed: 'factory=nemia',
      selects: ['r-1/implement', 'r-2/design', 'r-5/implement', 'r-7/review', 'r-1/—'],
      drop: 'factory=nemia',
      then: [],
    },
    {
      typed: 'factory=nemia,workflow=build',
      selects: ['r-1/implement', 'r-7/review', 'r-1/—'],
      drop: 'factory=nemia',
      then: ['r-1/implement', 'r-3/implement', 'r-7/review', 'r-6/design', 'r-1/—'],
    },
    {
      typed: 'workflow=build,step=implement',
      selects: ['r-1/implement', 'r-3/implement'],
      drop: 'workflow=build',
      then: ['r-1/implement', 'r-5/implement', 'r-3/implement'],
    },
    { typed: 'agent=ada', selects: ['r-1/implement', 'r-2/design', 'r-5/implement'], drop: 'agent=ada', then: [] },
    { typed: 'agent=ada,step=design', selects: ['r-2/design'], drop: 'agent=ada', then: ['r-2/design', 'r-6/design'] },
    { typed: 'factory=pipao,agent=agora', selects: ['r-3/implement'], drop: 'factory=pipao', then: ['r-3/implement', 'r-7/review'] },
  ];
  const whole: string[] = EVERY.map((l) => ('daemon' in l ? `pid ${l.daemon}` : `${l.run}/${l.step ?? '—'}`));
  for (const c of cases) {
    assert.deepEqual(selected([c.typed]), c.selects, c.typed);
    const left = c.typed
      .split(',')
      .filter((clause) => clause !== c.drop)
      .join(',');
    const after = left ? selected([left]) : whole;
    assert.notDeepEqual(after, c.selects, `${c.typed} without ${c.drop || 'its one clause'} must not select the same lines`);
    if (left) assert.deepEqual(after, c.then, left);
  }
});

test('no selector at all selects every line', () => {
  assert.deepEqual(parseSelectors([]), []);
  assert.equal(
    EVERY.every((l) => selects([], l)),
    true,
  );
});
