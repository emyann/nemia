/**
 * A person's labels: every rule of a key's and a value's spelling refused (a row each), kubectl's edits of a map, what a start copies,
 * and how a printer and a selector read a run's map. When `labelEdits` refuses is proved (`contracts/labels.contract.ts`); what the
 * edited map holds and what `inheritedLabels` copies build a map at keys the code computes, which tsverify does not read, so each of
 * their sentences is a row here.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { names } from '../../test/assessed.ts';
import {
  inheritedLabels,
  labelEdits,
  labelRefusal,
  labelsRefusal,
  labelsText,
  labelValuesOf,
  metadataLabels,
  parseLabelEdits,
  type LabelChange,
  type ParentLabels,
} from './labels.ts';

/** The edits `texts` spell, which the test means to be taken. */
const edits = (...texts: string[]) => {
  const parsed = parseLabelEdits(texts);
  assert.ok('edits' in parsed, `${texts.join(' ')} is taken`);
  return parsed.edits;
};

describe('labelRefusal: a label is spelled as Kubernetes spells one, an optional prefix and a name, and takes no key Nemia or the feed reads itself', () => {
  const refused: ReadonlyArray<{ rule: string; key: string; value?: string; named: string }> = [
    { rule: 'a prefix in capitals, no DNS subdomain', key: 'Team.example/stage', named: '"Team.example/stage"' },
    { rule: 'a prefix with an underscore, no DNS subdomain', key: 'team_x/stage', named: '"team_x/stage"' },
    { rule: 'a prefix that opens on a dash', key: '-a/x', named: '"-a/x"' },
    { rule: 'a prefix longer than 253', key: `${'p'.repeat(254)}/x`, named: '253' },
    { rule: 'two slashes', key: 'a/b/c', named: '"a/b/c"' },
    { rule: 'a prefix written empty', key: '/stage', named: '"/stage"' },
    { rule: 'no name after the slash', key: 'team.example/', named: '"team.example/"' },
    { rule: 'a prefixed name longer than 63', key: `team.example/${'k'.repeat(64)}`, named: '63' },
    { rule: 'longer than 63', key: 'k'.repeat(64), named: '64' },
    { rule: 'a dash first', key: '-x', named: '"-x"' },
    { rule: 'a dash last', key: 'x-', named: '"x-"' },
    { rule: 'a closed key: factory', key: 'factory', named: 'factory' },
    { rule: 'a closed key: workflow', key: 'workflow', named: 'workflow' },
    { rule: 'a reserved key of a signed line', key: 'reason', named: 'reason' },
    { rule: 'the message, prose', key: 'message', named: 'message' },
    { rule: 'a value longer than 63', key: 'team', value: 'v'.repeat(64), named: 'team' },
    { rule: 'a value spelled as no name', key: 'team', value: '-core', named: '"-core"' },
  ];
  for (const row of refused)
    test(`refused: ${row.rule}`, () => {
      names(labelRefusal(row.key, row.value ?? 'x'), row.named);
      names(labelsRefusal({ ok: 'yes', [row.key]: row.value ?? 'x' }), row.named);
    });
  for (const [key, value] of [
    ['team', 'core'],
    ['my.key_2', 'a-b.c_d'],
    ['team', ''],
    ['constructor', 'x'],
    ['team.example/stage', 'sprint'],
    ['example.com/team', 'core'],
    ['team.example/workflow', 'x'],
  ] as const)
    test(`taken: ${key}=${value}`, () => assert.equal(labelRefusal(key, value), undefined));
  test('a map with no wrong pair is taken', () => assert.equal(labelsRefusal({ team: 'core', tier: '' }), undefined));
});

describe('parseLabelEdits: key=value sets, key- removes, and anything else, or one key twice, is refused', () => {
  test('the two forms', () =>
    assert.deepEqual(parseLabelEdits(['team=core', 'tier-', 'note=']), {
      edits: [
        { key: 'team', op: 'set', value: 'core' },
        { key: 'tier', op: 'remove' },
        { key: 'note', op: 'set', value: '' },
      ],
    }));
  test('a prefixed key is edited as any other', () =>
    assert.deepEqual(parseLabelEdits(['team.example/stage=backlog', 'team.example/state-']), {
      edits: [
        { key: 'team.example/stage', op: 'set', value: 'backlog' },
        { key: 'team.example/state', op: 'remove' },
      ],
    }));
  for (const row of [
    { rule: 'one key twice', texts: ['a=1', 'a-'], named: 'a' },
    { rule: 'no key before =', texts: ['=x'], named: '"=x"' },
    { rule: 'no key before -', texts: ['-'], named: '"-"' },
    { rule: 'neither form', texts: ['team'], named: '"team"' },
    { rule: 'a key a label cannot take', texts: ['factory=x'], named: 'factory' },
    { rule: 'a value a label cannot take', texts: ['eq=a=b'], named: '"a=b"' },
    { rule: 'a removed key a label cannot take', texts: ['a/b/c-'], named: 'a/b/c' },
  ])
    test(`refused: ${row.rule}`, () => {
      const parsed = parseLabelEdits(row.texts);
      assert.ok('refused' in parsed, row.texts.join(' '));
      names(parsed.refused, row.named);
    });
});

describe('labelValuesOf: a factory states the values each key takes as key=value words apart by whitespace', () => {
  test('each key its values, in the order first written', () =>
    assert.deepEqual(labelValuesOf('work=feature work=fix\n  area=cli'), { values: { work: ['feature', 'fix'], area: ['cli'] } }));
  test('a word written twice is kept once', () => assert.deepEqual(labelValuesOf('work=fix work=fix'), { values: { work: ['fix'] } }));
  for (const text of ['', '   ', '\n']) test(`none: ${JSON.stringify(text)}`, () => assert.deepEqual(labelValuesOf(text), { values: {} }));
  for (const row of [
    { rule: 'no =', text: 'work', named: '"work"' },
    { rule: 'a value no label takes', text: 'work=a:b', named: '"a:b"' },
    { rule: 'an empty value', text: 'work=', named: '"work="' },
    { rule: 'a key Nemia sets itself', text: 'factory=x', named: 'factory' },
  ])
    test(`refused: ${row.rule}`, () => {
      const parsed = labelValuesOf(row.text);
      assert.ok('refused' in parsed, row.text);
      names(parsed.refused, row.named);
    });
});

describe('labelEdits: the map after the edits, every key no edit names kept', () => {
  const current = { team: 'core', tier: 'one', constructor: 'c' };
  const cases: ReadonlyArray<{ law: string; edits: readonly LabelChange[]; overwrite: boolean; labels: Record<string, string> }> = [
    { law: 'setHolds: a new key is set', edits: edits('owner=kim'), overwrite: false, labels: { ...current, owner: 'kim' } },
    { law: 'setHolds: the same value is no change', edits: edits('team=core'), overwrite: false, labels: current },
    { law: 'setHolds: --overwrite changes a value', edits: edits('team=web'), overwrite: true, labels: { ...current, team: 'web' } },
    { law: 'removedIsGone: a key- removes it', edits: edits('tier-'), overwrite: false, labels: { team: 'core', constructor: 'c' } },
    { law: 'removedIsGone: a key- of an absent key is no change', edits: edits('owner-'), overwrite: false, labels: current },
    {
      law: 'untouchedKept: only the keys the edits name change',
      edits: edits('owner=kim', 'tier-'),
      overwrite: false,
      labels: { team: 'core', constructor: 'c', owner: 'kim' },
    },
  ];
  for (const c of cases) test(c.law, () => assert.deepEqual(labelEdits(current, c.edits, c.overwrite), { labels: c.labels }));
  test('noSilentOverwrite: a change without --overwrite is refused, naming the key, its value and the flag', () => {
    const out = labelEdits(current, edits('team=web'), false);
    assert.ok('refused' in out);
    names(out.refused, 'team=core', '--overwrite', 'web');
  });
  test("a key Object's prototype names is a label like any other", () => {
    assert.deepEqual(labelEdits({}, edits('constructor=x'), false), { labels: { constructor: 'x' } });
    assert.deepEqual(labelEdits({}, edits('toString=x'), false), { labels: { toString: 'x' } });
  });
  test('current is not changed', () => {
    labelEdits(current, edits('team=web', 'tier-'), true);
    assert.deepEqual(current, { team: 'core', tier: 'one', constructor: 'c' });
  });
});

describe('inheritedLabels: what a start copies, once — the runs it names, the card over them, the typed edits over those', () => {
  const parents: readonly ParentLabels[] = [
    { run: 'r-1', labels: { team: 'core', tier: 'one', area: 'web' } },
    { run: 'r-2', labels: { team: 'core', tier: 'two', owner: 'kim' } },
  ];
  test('agreedInherited: a key every run carrying it gives one value has that value', () =>
    assert.deepEqual(inheritedLabels({ parents }).labels, { team: 'core', area: 'web', owner: 'kim' }));
  test('disagreedLeftOut: a key two runs give different values is absent, and named with each run and its value', () => {
    const out = inheritedLabels({ parents });
    assert.equal(out.labels.tier, undefined);
    assert.deepEqual(out.leftOut, [
      {
        key: 'tier',
        values: [
          { run: 'r-1', value: 'one' },
          { run: 'r-2', value: 'two' },
        ],
      },
    ]);
  });
  test('leftOutOnlyDisagreed: nothing is left out where the runs agree', () =>
    assert.deepEqual(
      inheritedLabels({
        parents: [
          { run: 'r-1', labels: { team: 'core', area: 'web' } },
          { run: 'r-3', labels: { team: 'core' } },
        ],
      }).leftOut,
      [],
    ));
  test("cardOverRuns: the card's value is taken over the runs', and settles a key they disagree on", () => {
    const out = inheritedLabels({ parents, card: { team: 'web', tier: 'three' } });
    assert.equal(out.labels.team, 'web');
    assert.equal(out.labels.tier, 'three');
    assert.deepEqual(out.leftOut, []);
  });
  test('typedWins: a key typed key=value at the start has that value, over the card and the runs', () => {
    const out = inheritedLabels({ parents, card: { team: 'web' }, edits: edits('team=cli', 'tier=four', 'new=yes') });
    assert.deepEqual(out.labels, { team: 'cli', tier: 'four', area: 'web', owner: 'kim', new: 'yes' });
    assert.deepEqual(out.leftOut, []);
  });
  test('droppedAtStart: a key typed key- is absent, whatever the card or the runs say', () => {
    const out = inheritedLabels({ parents, card: { area: 'cli' }, edits: edits('area-', 'tier-', 'team-') });
    assert.deepEqual(out.labels, { owner: 'kim' });
    assert.deepEqual(out.leftOut, [], 'a key dropped at the start is no disagreement to report');
  });
  test("a key Object's prototype names is inherited like any other, and a card's own keys alone are the card's", () => {
    const out = inheritedLabels({
      parents: [
        { run: 'r-1', labels: { constructor: 'x' } },
        { run: 'r-2', labels: {} },
      ],
      card: { team: 'core' },
    });
    assert.deepEqual(out, { labels: { constructor: 'x', team: 'core' }, leftOut: [] });
  });
  test('nothing named, nothing copied', () => assert.deepEqual(inheritedLabels({ parents: [] }), { labels: {}, leftOut: [] }));
});

describe('labelsText and metadataLabels: a run’s map as a printer shows it and a selector reads it', () => {
  test('labelsText: key order, commas, an empty value kept, and <none> for none', () => {
    assert.equal(labelsText({ tier: '', team: 'core', area: 'web' }), 'area=web,team=core,tier=');
    assert.equal(labelsText({}), '<none>');
  });
  test('metadataLabels: the person’s keys beside workflow and factory, which the caller always names', () => {
    assert.deepEqual(metadataLabels({ workflow: 'build', factory: 'nemia', labels: { team: 'core' } }), {
      team: 'core',
      workflow: 'build',
      factory: 'nemia',
    });
    assert.deepEqual(metadataLabels({ workflow: 'build', factory: 'default', labels: {} }), { workflow: 'build', factory: 'default' });
  });
});
