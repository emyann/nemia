/**
 * A step's part (src/lib/stepPart.ts), the one model every size of a step is drawn from: its six slots in one order at every size, a
 * slot that does not apply saying none, a step to come showing its declared fields as dashes, Got's lines in the order of their sources,
 * the packet a step hands named alike in its Gave and its taker's Got, and the files its folders hold that its closeout did not name.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunDetail } from '../src/lib/runView.ts';
import { GOT_ORDER, PART_SLOTS, packetsOfView, slotsOf, stepFilesOf, stepPartOf, type PartSize } from '../src/lib/stepPart.ts';
import { coded, detail, step } from './run-fixtures.ts';

type Step = RunDetail['steps'][number];

const NOW = new Date('2026-09-30T05:20:00.000Z');

/** A file served under the step's files. */
/** A file a step's folder lists, as the api serves it: its path in that folder, the name it is served by, and its link under `route`. */
const served = (name: string, route: 'files' | 'artifacts' = 'artifacts') => ({
  path: route === 'artifacts' ? `/store/runs/r-1/artifacts/design/${name}` : `/work/r-1/design/${name}`,
  name,
  url: `/api/runs/r-1/steps/design/${route}/${name}`,
  kind: 'text' as const,
  size: 1,
});

/** The closeout of `step()`, with `extra` over it. */
const closeout = (extra: Partial<NonNullable<Step['closeout']>> = {}): NonNullable<Step['closeout']> => ({
  ...step().closeout!,
  questions: [],
  ...extra,
});

/** design, done: it declares `verdict` (a string) and `pr` (a link), gave both, named one file and left two in its folders. */
const design = (): Step =>
  step({
    name: 'design',
    ...coded('verified ✓'),
    spec: {
      ...step().spec!,
      after: [],
      fields: [
        { name: 'verdict', shape: null },
        { name: 'pr', shape: 'link' },
      ],
    },
    gate: null,
    denied: null,
    lastLine: null,
    closeout: closeout({
      output: { verdict: 'go', pr: 'https://example.test/pr/1' },
      schema: { verdict: { type: 'string' }, pr: { type: ['string', 'null'] } },
      shapes: { pr: 'link' },
      artifacts: [{ path: 'spec.md' }],
      values: [],
    }),
    files: [served('spec.md', 'files'), served('notes.txt', 'files')],
    artifactsFolder: { files: [served('spec.md'), served('notes.txt'), served('shot.png')], error: null },
  });

/** implement, at work: handed design's output, told by a person, a check and another run, under its agent. */
const implement = (): Step =>
  step({
    name: 'implement',
    ...coded('working'),
    spec: { ...step().spec!, after: ['design'], input: ['design'], agent: 'implementer' },
    gate: null,
    denied: null,
    closeout: null,
    unreadable: null,
    files: [],
    layers: {
      agent: 'You are the implementer.',
      instructions: null,
      custom: null,
      factory: null,
      agentSkills: ['look'],
      policy: 'dontAsk',
      addedSkills: [],
      fence: [],
      folderFiles: false,
      task: null,
      via: 'brief',
    },
    taskParts: [
      { kind: 'text', text: 'The run says build.', source: 'run' },
      { kind: 'from', run: 'r-0', asked: 'what landed', body: 'It landed.', how: 'read' },
      { kind: 'text', text: 'The check refused.', source: 'check', step: 'implement' },
      { kind: 'text', text: 'Design gave this.', source: 'step', step: 'design' },
      { kind: 'text', text: 'Make it so.', source: 'person' },
    ],
  });

/** review, to come: it declares `findings`, a list of objects, and has run no try. */
const review = (): Step =>
  step({
    name: 'review',
    ...coded('waiting'),
    spec: {
      ...step().spec!,
      after: ['implement'],
      fields: [
        { name: 'findings', shape: null },
        { name: 'sha', shape: 'commit' },
      ],
    },
    gate: null,
    denied: null,
    needs: null,
    closeout: null,
    unreadable: null,
    files: [],
    tries: [],
    shown: null,
    check: null,
    timeline: [],
    layers: null,
    taskParts: null,
  });

const run = (): RunDetail =>
  detail({
    holding: null,
    waiting: null,
    graph: {
      roots: ['design'],
      edges: [
        { from: 'design', to: 'implement', kind: 'after' },
        { from: 'implement', to: 'review', kind: 'after' },
      ],
    },
    steps: [design(), implement(), review()],
  });

test('the slots come out in one order at every size, a smaller size leaving some out', () => {
  const part = stepPartOf(run(), 'implement', NOW);
  assert.deepEqual(Object.keys(part), [...PART_SLOTS]);
  const sizes: PartSize[] = ['S', 'M', 'L'];
  for (const size of sizes) {
    const slots = slotsOf(part, size).map((s) => s.slot);
    assert.deepEqual(
      slots,
      PART_SLOTS.filter((slot) => slots.includes(slot)),
      `${size} keeps the order`,
    );
    assert.equal(slots[0], 'head', `${size} starts at the head`);
  }
  assert.deepEqual(
    slotsOf(part, 'L').map((s) => s.slot),
    [...PART_SLOTS],
  );
});

test('a slot that does not apply says none, the head never', () => {
  const part = stepPartOf(run(), 'review', NOW);
  assert.equal(part.asks, 'none');
  assert.equal(part.got, 'none');
  assert.equal(part.said, 'none');
  assert.equal(part.head.check, 'none', 'a step whose try has no check says none in its place');
  assert.equal(part.head.time === 'none', false);
  assert.equal(part.head.step, 'review');
  const gone = stepPartOf(run(), 'nowhere', NOW);
  assert.deepEqual([gone.asks, gone.got, gone.said, gone.gave, gone.detail], ['none', 'none', 'none', 'none', 'none']);
});

test('a step to come shows its declared fields, in order, as dashes drawn by their widgets', () => {
  const gave = stepPartOf(run(), 'review', NOW).gave;
  assert.notEqual(gave, 'none');
  if (gave === 'none') return;
  assert.deepEqual(
    gave.fields.map((f) => [f.name, f.widget, f.given]),
    [
      ['findings', 'json', false],
      ['sha', 'commit', false],
    ],
  );
});

test("Got orders its lines you, steps, checks, other runs, the run, its agent, whatever the task's order", () => {
  const got = stepPartOf(run(), 'implement', NOW).got;
  assert.notEqual(got, 'none');
  if (got === 'none') return;
  assert.deepEqual(
    got.map((line) => line.from),
    ['you', 'step', 'check', 'other-run', 'run', 'agent'],
  );
  assert.deepEqual(
    got.map((line) => GOT_ORDER.indexOf(line.from)),
    [0, 1, 2, 3, 4, 5],
  );
  const handed = got.find((line) => line.from === 'step');
  assert.equal(handed?.from === 'step' && handed.packet?.label, 'design');
  const agent = got.find((line) => line.from === 'agent');
  assert.deepEqual(agent?.from === 'agent' && [agent.agent, agent.skills], ['implementer', ['look']]);
});

test("a step's Gave and its taker's Got name the packet alike; Gave holds its fields by widget, its files and its unnamed count", () => {
  const gave = stepPartOf(run(), 'design', NOW).gave;
  assert.notEqual(gave, 'none');
  if (gave === 'none') return;
  assert.equal(gave.packet, 'design');
  assert.deepEqual(
    gave.fields.map((f) => [f.name, f.widget, f.value]),
    [
      ['verdict', 'prose', 'go'],
      ['pr', 'link', 'https://example.test/pr/1'],
    ],
  );
  assert.deepEqual(
    gave.files.map((f) => f.path),
    ['spec.md'],
  );
  assert.equal(gave.unnamed, 2, 'notes.txt and shot.png, each counted once across its folders, spec.md being named');
  assert.deepEqual(
    packetsOfView(run()),
    [{ from: 'design', to: 'implement', label: 'design', fields: 2, files: 1 }],
    "the graph's packet counts what the giver's shown try gave",
  );
});

test('the asks slot holds what a waiting step asks of a person, and what any step waits for', () => {
  const gated = step({ ...coded('awaiting approval'), gate: { awaiting: true, approval: null }, needs: 'Approve the plan.' });
  const part = stepPartOf(detail({ holding: null, steps: [gated] }), 'implement', NOW);
  assert.notEqual(part.asks, 'none');
  if (part.asks === 'none') return;
  assert.equal(part.asks.gate?.awaiting, true);
  assert.equal(part.asks.needs, 'Approve the plan.');
  const waits = step({ ...coded('waiting'), waitingFor: { words: 'a slot', advice: 'wait' }, gate: null });
  const waiting = stepPartOf(detail({ holding: null, steps: [waits] }), 'implement', NOW).asks;
  assert.equal(waiting !== 'none' && waiting.waitingFor?.words, 'a slot');
});

test('a step the run waits on a person for asks, though none of the five says what: its part offers the answer (a check refused, a loop out of rounds)', () => {
  const refused = step({ ...coded('failed ✗ check (exit 1)'), gate: null });
  const waited = stepPartOf(detail({ holding: null, waitingOnYou: ['implement'], steps: [refused] }), 'implement', NOW).asks;
  assert.notEqual(waited, 'none');
  const out = step({ ...coded('rounds exhausted'), gate: null });
  assert.notEqual(stepPartOf(detail({ holding: null, waitingOnYou: [], steps: [out] }), 'implement', NOW).asks, 'none');
});

test('the detail is of the try shown, and the head offers every try with it', () => {
  const part = stepPartOf(run(), 'implement', NOW);
  assert.deepEqual(part.head.tries, [1, 2]);
  assert.equal(part.head.shown, 2);
  assert.equal(part.detail !== 'none' && part.detail.debug.try, 2);
});

test("a file the closeout named by its workspace path is its folders' served copy, kept under the path it named, and counted once", () => {
  const files = stepFilesOf(design());
  assert.deepEqual(
    files.named.map((f) => [f.path, 'url' in f ? f.url : null]),
    [['spec.md', '/api/runs/r-1/steps/design/artifacts/spec.md']],
    'the relative path resolves to its name in the artifacts folder, and the viewer finds it by the path the closeout gave',
  );
  assert.deepEqual(
    files.unnamed.map((f) => ('name' in f ? f.name : f.path)),
    ['notes.txt', 'shot.png'],
    'each held name once across the two folders, spec.md being named',
  );
  const named = design();
  const absolute = { ...named, closeout: { ...named.closeout!, artifacts: [{ path: '/store/runs/r-1/artifacts/design/shot.png' }] } };
  assert.deepEqual(
    stepFilesOf(absolute).unnamed.map((f) => ('name' in f ? f.name : f.path)),
    ['spec.md', 'notes.txt'],
    'a path in the artifacts folder names its listed file by that path',
  );
});
