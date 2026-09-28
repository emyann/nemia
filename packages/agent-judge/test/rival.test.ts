/** The plain-code rival's rules, each made to fire and made not to, and the arithmetic `judge runs` prints. Pure: no store, no fetch. */
import './hermetic.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { folderOf, MODEL, type CardAnswers } from '../src/card.ts';
import type { Judgment } from '../src/decide.ts';
import { namesWeb, partsNamed, planningWord, PARTS, PARTS_FOR_PLAN, PLANNING_WORDS, rival, WEB_PATHS } from '../src/rival.ts';
import {
  agreement,
  confusion,
  disagreements,
  distinctBriefs,
  judgeFolder,
  lines,
  sharing,
  shown,
  verdictOf,
  type Row,
} from '../src/score.ts';
import { firstLine, labelOf } from '../src/runs.ts';

const P = (noul: number): Judgment => ({
  status: 'answered',
  answer: { type: 'noul', noul } as never,
  key: 'k',
  at: '2026-09-19T00:00:00Z',
  model: MODEL,
});
const S = (score: number): Judgment => ({
  status: 'answered',
  answer: { type: 'score', score, confidence: 0.9 } as never,
  key: 'k',
  at: '2026-09-19T00:00:00Z',
  model: MODEL,
});
const failed = (kind = 'rate-limited'): Judgment => ({
  status: 'failed',
  kind: kind as never,
  message: 'the service said no',
  key: 'k',
  at: '',
});

const answers = (web: Judgment, plan: Judgment, clear: Judgment = S(3)): CardAnswers => ({ web, plan, clear, size: S(2) }) as CardAnswers;

/** A row with a label, a rival guess and, unless told otherwise, the judge's four answers. */
const row = (id: string, folder: Row['folder'], over: Partial<Row> = {}): Row => ({
  id,
  first: `${id} does a thing`,
  folder,
  web: folder.endsWith('-build'),
  plan: folder.startsWith('dev-planned'),
  rival: { web: false, plan: false, folder: 'dev' },
  card: `${id}'s card`,
  ...over,
});

// ─── the rival ──────────────────────────────────────────────────────────────────────────────────

test('the web rule fires on each path the web question names, and on nothing near it', () => {
  assert.deepEqual([...WEB_PATHS], ['apps/web', 'apps/api']);
  for (const p of WEB_PATHS) assert.equal(namesWeb(`Change ${p}/src/thing.ts.`), true, p);
  for (const near of ['apps/webbing', 'the web app', 'a page on the board', 'the Factory', 'run the e2e', 'packages/agent-web'])
    assert.equal(namesWeb(near), near.startsWith('apps/web'), near);
  // Only the two paths: the phrases a brief uses about the board are not the rule, and the README says so.
  assert.equal(namesWeb('The board shows the Factory, and the e2e takes its picture.'), false);
});

test('the plan rule needs a planning word AND three parts; each half alone does not fire it', () => {
  assert.equal(PARTS_FOR_PLAN, 3);
  const three = `${PARTS[0]} ${PARTS[1]} ${PARTS[2]}`;
  assert.equal(partsNamed(three), 3);
  assert.equal(partsNamed(`${PARTS[0]} and ${PARTS[0]} again`), 1, 'a part named twice is one part');
  assert.equal(rival(`Decide the shape across ${three}.`).plan, true);
  assert.equal(rival(`Move a line in ${three}.`).plan, false, 'three parts alone is not enough');
  assert.equal(rival('Decide the shape of the thing.').plan, false, 'a planning word alone is not enough');
  assert.equal(rival(`Decide it across ${PARTS[0]} and ${PARTS[1]}.`).plan, false, 'two parts is not three');
});

test('a part written as a brief writes it — a path — is one part, and `workflows/` is not its tail', () => {
  // `workflows/` is the end of `packages/agent-orchestrator/src/run.ts`, which briefs write constantly. Counted by
  // substring it made one path two parts, and the plan rule fired on briefs naming two.
  assert.equal(partsNamed('Fix `packages/agent-orchestrator/src/run.ts`.'), 1);
  assert.equal(partsNamed('Fix `packages/agent-orchestrator/src/run.ts` and `apps/web/src/Board.tsx`.'), 2);
  assert.equal(rival('Decide how `packages/agent-orchestrator/src/run.ts` and `apps/web/src/Board.tsx` agree.').plan, false);
  // The repository's own folder still counts, written any of the ways a brief writes it.
  for (const said of ['the workflows/ folder', 'a step under workflows/dev', 'copy workflows/ui']) assert.equal(partsNamed(said), 1, said);
  assert.equal(partsNamed('Read workflows/dev, apps/web/src and packages/agent-runtime/src/domain.ts.'), 3);
  // And a path is still a path where a word runs up to it the other way round.
  assert.equal(partsNamed('agent-orchestrator/src alone'), 0, 'a part named without its `packages/` is not that part');
});

test('a part named by its former folder is still that part, and once with its new name', () => {
  // The briefs already in a store name the folders as they were before the rename.
  const engine = 'packages/agent-engine'; // renamed on 2026-09-23
  const workflows = 'packages/agent-workflows'; // renamed on 2026-09-23
  assert.equal(partsNamed(`Fix \`${workflows}/src/run.ts\`.`), 1);
  assert.equal(partsNamed(`Read ${engine}/src/domain.ts and apps/web/src.`), 2);
  assert.equal(partsNamed(`Read ${engine}/src and packages/agent-runtime/src.`), 1, 'one part under both its names is one part');
  assert.equal(rival(`Decide it across ${engine}, packages/agent-orchestrator and apps/api.`).plan, true);
});

test('every planning word is a word, not a fragment, and case does not matter', () => {
  for (const w of PLANNING_WORDS) assert.equal(planningWord(`We should ${w} it.`), true, w);
  assert.equal(planningWord('PLAN it'), true);
  assert.equal(planningWord('replanning the airplane'), false, 'a word inside a word is not the word');
  assert.equal(planningWord('nothing to say here'), false);
});

test("the rival names its folder through the judge's own function", () => {
  // Three parts that are not `apps/api`, so the plan rule fires and the web one does not.
  const three = [PARTS[0], PARTS[1], PARTS[4]].join(' ');
  for (const [brief, folder] of [
    ['Move a line.', 'dev'],
    ['Move a line in apps/web/src.', 'dev-build'],
    [`Decide the shape across ${three}.`, 'dev-planned'],
    [`Decide the shape across ${three} and apps/web.`, 'dev-planned-build'],
  ] as const) {
    const g = rival(brief);
    assert.equal(g.folder, folder, brief);
    assert.equal(g.folder, folderOf(g.plan, g.web));
  }
});

// ─── the arithmetic ─────────────────────────────────────────────────────────────────────────────

const TABLE: Row[] = [
  row('a', 'dev-build', { answers: answers(P(0.95), P(0.05)) }), // web yes, label yes
  row('b', 'dev', { answers: answers(P(0.9), P(0.05)) }), //        web yes, label no
  row('c', 'dev-build', { answers: answers(P(0.05), P(0.05)) }), // web no,  label yes
  row('d', 'dev', { answers: answers(P(0.1), P(0.05)) }), //        web no,  label no
  row('e', 'dev-build', { answers: answers(P(0.5), P(0.05)) }), //  unsure,  label yes
  row('f', 'dev', { answers: answers(failed(), P(0.05)) }), //      a failure is unsure too
];

test('a confusion table counts each corner, keeps unsure out of both, and reads the same in any order', () => {
  const t = confusion(
    TABLE,
    (r) => verdictOf(r, 'web'),
    (r) => r.web,
  );
  assert.deepEqual(
    { yesYes: t.yesYes, yesNo: t.yesNo, noYes: t.noYes, noNo: t.noNo, unsure: t.unsure },
    { yesYes: 1, yesNo: 1, noYes: 1, noNo: 1, unsure: 2 },
  );
  assert.equal(t.decided, 4);
  assert.equal(t.right, 2);
  assert.equal(t.precision, 0.5);
  assert.equal(t.recall, 0.5);
  // Reversed, and it must not move: nothing here may depend on the order the runs were read in.
  assert.deepEqual(
    confusion(
      [...TABLE].reverse(),
      (r) => verdictOf(r, 'web'),
      (r) => r.web,
    ),
    t,
  );
});

test('precision and recall are null when nothing was decided that way, and a row with no judge is counted nowhere', () => {
  const none = confusion(
    [row('x', 'dev-build')],
    (r) => verdictOf(r, 'web'),
    (r) => r.web,
  );
  assert.deepEqual([none.decided, none.unsure, none.precision, none.recall], [0, 0, null, null]);
  const noYes = confusion(
    [row('y', 'dev', { answers: answers(P(0.05), P(0.05)) })],
    (r) => verdictOf(r, 'web'),
    (r) => r.web,
  );
  assert.deepEqual([noYes.precision, noYes.recall, noYes.noNo], [null, null, 1]);
});

test('the rival is scored by the same function, and always answers', () => {
  const rows = [
    row('a', 'dev-build', { rival: { web: true, plan: false, folder: 'dev-build' } }),
    row('b', 'dev', { rival: { web: true, plan: false, folder: 'dev-build' } }),
  ];
  const t = confusion(
    rows,
    (r) => (r.rival.web ? 'yes' : 'no'),
    (r) => r.web,
  );
  assert.deepEqual({ yesYes: t.yesYes, yesNo: t.yesNo, unsure: t.unsure }, { yesYes: 1, yesNo: 1, unsure: 0 });
});

test("whole folders: the judge's inbox is counted apart from agreeing and differing", () => {
  const rows = [
    row('same', 'dev-build', { answers: answers(P(0.95), P(0.05)) }),
    row('differ', 'dev', { answers: answers(P(0.95), P(0.05)) }),
    row('inbox', 'dev', { answers: answers(P(0.5), P(0.05)) }),
    row('unclear', 'dev', { answers: answers(P(0.95), P(0.05), S(1)) }),
  ];
  assert.deepEqual(agreement(rows, judgeFolder), { same: 1, differ: 1, inbox: 2, of: 4 });
  assert.deepEqual(
    agreement(rows, (r) => r.rival.folder),
    { same: 3, differ: 1, inbox: 0, of: 4 },
  );
  assert.equal(judgeFolder(rows[2]!), null, 'an unsure property is the inbox, not a folder');
  assert.equal(judgeFolder(row('none', 'dev')), undefined, 'with the judge off there is no folder to compare');
});

test('a disagreement carries the run, both folders and each probability; an inbox is a disagreement too', () => {
  const rows = [
    row('same', 'dev-build', { answers: answers(P(0.95), P(0.05)) }),
    row('differ', 'dev-planned', { answers: answers(P(0.95), P(0.05)) }),
    row('inbox', 'dev', { answers: answers(P(0.5), P(0.05), S(0.5)) }),
  ];
  const d = disagreements(rows);
  assert.deepEqual(
    d.map((x) => x.id),
    ['differ', 'inbox'],
  );
  assert.deepEqual(d[0], {
    id: 'differ',
    first: 'differ does a thing',
    folder: 'dev-planned',
    judge: 'dev-build',
    inbox: false,
    probabilities: { web: 'P 0.95', plan: 'P 0.05', clear: 'score 3.00' },
    also: [],
  });
  assert.equal(d[1]!.inbox, true);
  assert.match(d[1]!.judge, /^the inbox: says too little about what done looks like$/);
  assert.equal(shown(failed('timed-out')), 'timed-out', 'a failure shows its kind, not its message');
});

test('the printed report says what is scored, and with the judge off has no judge in it', () => {
  const base = { store: '/s', record: '/r', model: MODEL, read: 9, skipped: [{ file: 'x', why: 'was run on ui, not one of the four' }] };
  const rows = [row('a', 'dev-build', { answers: answers(P(0.95), P(0.05)), rival: { web: true, plan: false, folder: 'dev-build' } })];
  const on = lines({ ...base, rows, asked: { requests: 1, questions: 4, inputTokens: 10, ms: 5 } }).join('\n');
  assert.match(on, /^judge runs: 1 of 9 records were dispatched to dev, dev-build, dev-planned or dev-planned-build · jev-1\.13\.0$/m);
  assert.match(on, /^ {2}skipped {3}1 {2}was run on ui, not one of the four$/m);
  assert.match(on, /^ {2}judge {5}label yes {2}label no$/m);
  assert.match(on, /^ {4}unsure {10}0 {23}kept out of both$/m);
  assert.match(on, /^ {2}judge {3}1 of 1 agree · 0 differ · 0 stayed in the inbox, counted apart$/m);
  assert.match(on, /^1 requests · 4 questions · 10 input tokens · 5 ms$/m);
  assert.match(on, /^nothing was filed, started or shown to anyone: this command gates nothing\.$/m);
  const off = lines({
    ...base,
    rows: [{ ...rows[0]!, answers: undefined }],
    off: 'the judge is off: no TYPESAFE_API_KEY in the environment',
  }).join('\n');
  assert.match(off, /^ {2}the judge is off: no TYPESAFE_API_KEY in the environment; only the rival is scored\.$/m);
  assert.ok(!/^ {2}judge/m.test(off), 'nothing is claimed for a judge that never answered');
  assert.ok(!off.includes('input tokens'));
  assert.match(off, /^ {2}rival {3}1 of 1 agree/m);
});

test('two runs sent with one brief are one brief in the count, and each disagreement names the other', () => {
  // A brief dispatched twice is two choices a person made, so both are scored; it is one question to the judge, and one
  // mistake if the judge differs. The count and the list say so rather than reading as two independent runs.
  const rows = [
    row('first', 'dev-build', { card: 'one card', answers: answers(P(0.95), P(0.05)) }),
    row('again', 'dev', { card: 'one card', answers: answers(P(0.95), P(0.05)) }),
    row('other', 'dev-build', { answers: answers(P(0.05), P(0.05)) }),
  ];
  assert.equal(distinctBriefs(rows), 2);
  assert.deepEqual(
    [...sharing(rows)],
    [
      ['first', ['again']],
      ['again', ['first']],
    ],
    'a run that shares nothing is not in it',
  );
  assert.deepEqual(
    disagreements(rows).map((d) => [d.id, d.also]),
    [
      ['again', ['first']],
      ['other', []],
    ],
  );
  // Both are still counted whole: two dispatches, one of them the judge would have sent elsewhere.
  assert.deepEqual(agreement(rows, judgeFolder), { same: 1, differ: 2, inbox: 0, of: 3 });
  const base = { store: '/s', record: '/r', model: MODEL, read: 3, skipped: [] };
  const text = lines({ ...base, rows, asked: { requests: 1, questions: 4, inputTokens: 10, ms: 5 } }).join('\n');
  assert.match(text, /^ {2}2 distinct briefs: 1 of these runs repeat one another sent\.$/m);
  assert.match(text, /^ {2}again \u00b7 the same brief was dispatched as first$/m);
  assert.match(text, /^ {2}other$/m, 'a run that shares no brief is named alone');
  const alone = lines({ ...base, rows: [rows[2]!] }).join('\n');
  assert.ok(!alone.includes('distinct brief'), 'with no repeat there is nothing to say');
});

test('a report with nothing in scope says so rather than dividing by nothing', () => {
  const text = lines({ store: '/s', record: '/r', model: MODEL, read: 3, rows: [], skipped: [] }).join('\n');
  assert.match(text, /^ {2}nothing to score\.$/m);
});

// ─── the label, and the line a person reads ─────────────────────────────────────────────────────

test("the label is the folder's basename, and only the four are labels", () => {
  for (const f of ['dev', 'dev-build', 'dev-planned', 'dev-planned-build']) {
    assert.deepEqual(labelOf(`/home/someone/hkb-v2/workflows/${f}`), { label: f });
    assert.deepEqual(labelOf(`/home/someone/hkb-v2/workflows/${f}/`), { label: f }, 'a trailing slash is not a folder of its own');
  }
  assert.deepEqual(labelOf('/x/workflows/ui'), { other: 'ui' });
  assert.deepEqual(labelOf('/home/yrnd1/projects/agent-orchestrator/workflows'), { other: 'workflows' });
  assert.deepEqual(
    labelOf('/x/workflows/dev-planned-build-2'),
    { other: 'dev-planned-build-2' },
    'a fifth dev* folder falls out of scope, and is not read as one of the four',
  );
  assert.equal(labelOf(undefined), null);
  assert.equal(labelOf(''), null);
});

test("a brief's first line is its first line, without its heading marks and short enough to read", () => {
  assert.equal(firstLine('\n\n## A title here\n\nand a body.'), 'A title here');
  assert.equal(firstLine('x'.repeat(100)), `${'x'.repeat(71)}…`);
  assert.equal(firstLine(''), '');
});
