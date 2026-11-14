/**
 * The commands `nemia decide` offers (`choicesOf`): each offer's bare command beside its sentence, a gate's approval and send-backs, and
 * land it and drop it, read it or forget it by the run's place — none on a run that awaits nobody. And who gave a person's word, said
 * after its line (`saidBy`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choicesOf, type Decision, type Offer } from './decide.ts';
import { saidBy } from './decide.verb.ts';
import type { Run } from '../record/record.ts';
import type { StepSpec } from '../step/step.ts';

const STEPS: StepSpec[] = [
  { name: 'plan', after: [], body: 'Plan it.' },
  { name: 'implement', after: ['plan'], body: 'Build it.' },
];

const RUN = {
  id: 'r-1',
  workspace: '/code/app',
  brief: 'b',
  workflowDir: '/wf',
  createdAt: '2026-10-02T00:00:00.000Z',
  repo: '/code/app',
  baseRef: 'abc',
  branch: 'main',
  isolate: true,
  steps: { plan: { taskId: 't-plan', branch: 'wf/r-1/plan' }, implement: { taskId: 't-impl', branch: 'wf/r-1/implement' } },
} as unknown as Run;

/** A run awaiting a person on `branches`, with `more` of what it awaits. */
const awaiting = (more: Partial<Extract<Decision, { kind: 'awaiting' }>> = {}): Decision => ({
  kind: 'awaiting',
  outcome: 'waiting',
  branches: ['wf/r-1/implement'],
  failed: [],
  awaitingAnswer: [],
  failedCheck: [],
  unfinishedCheck: [],
  unsigned: [],
  unverified: [],
  exhausted: [],
  overBudget: [],
  budgetExhausted: [],
  denied: [],
  awaitingApproval: [],
  direct: false,
  ...more,
});

const offer = (command: string): Offer => ({ step: 'implement', command, said: `implement: it says so:  ${command}  (--fresh)` });

test('choicesOf', async (t) => {
  await t.test('each offer is its own bare command, labelled by its verb, with the sentence it ends on', () => {
    const offers = [
      'nemia retry r-1 implement',
      'nemia retry r-1 implement --recheck',
      'nemia retry r-1 implement --budget <amount>',
      'nemia retry r-1 implement --round --budget <amount>',
      'nemia approve r-1 implement --message "<why>"',
      'nemia refresh r-1 implement --base',
      'nemia retry r-1 implement --message "<objection>"',
    ].map(offer);
    const labels = ['once more', 'once more', 'once more', 'once more', 'approve', 'refresh', 'send back'];
    assert.deepEqual(
      choicesOf(STEPS, RUN, awaiting(), offers).map((c) => [c.label, c.command, c.said, c.step]),
      [
        ...offers.map((o, i) => [labels[i], o.command, o.said, o.step]),
        ['land it', 'git -C /code/app merge --no-ff wf/r-1/implement', null, null],
        ['drop it', 'git -C /code/app branch -D wf/r-1/implement', null, null],
      ],
    );
  });

  await t.test(
    'a step waiting at its gate is offered its approval and a send-back, in the order of the steps; an unrun one sends back to what it waits on',
    () => {
      const unrun = { ...RUN, steps: { ...RUN.steps, implement: { taskId: null } } } as unknown as Run;
      assert.deepEqual(choicesOf(STEPS, unrun, awaiting({ awaitingApproval: ['implement', 'plan'] }), []).slice(0, 4), [
        {
          label: 'approve',
          command: 'nemia approve r-1 plan',
          said: 'plan waits at its gate — with words: nemia approve r-1 plan --message "<words>"',
          step: 'plan',
        },
        { label: 'send back', command: 'nemia retry r-1 plan --message "<objection>"', said: null, step: 'plan' },
        {
          label: 'approve',
          command: 'nemia approve r-1 implement',
          said: 'implement waits at its gate — with words: nemia approve r-1 implement --message "<words>"',
          step: 'implement',
        },
        { label: 'send back', command: 'nemia retry r-1 plan --message "<objection>"', said: null, step: 'plan' },
      ]);
    },
  );

  await t.test('a workflow whose step merges is offered no land it nor drop it', () => {
    const merging = [...STEPS, { name: 'ship', after: ['implement'], body: 'Land it.', workspace: 'base' }] as StepSpec[];
    assert.deepEqual(choicesOf(merging, RUN, awaiting(), []), []);
  });

  await t.test('a direct run is offered to read it', () => {
    assert.deepEqual(choicesOf(STEPS, RUN, awaiting({ direct: true }), []), [
      {
        label: 'read it',
        command: 'git -C /code/app diff abc...main',
        said: 'worked directly on main; nothing to merge; the base was abc',
        step: null,
      },
    ]);
  });

  await t.test('a folder run is offered to forget it', () => {
    const folder = { ...RUN, place: { kind: 'folder' }, repo: undefined, baseRef: undefined, branch: undefined } as unknown as Run;
    assert.deepEqual(choicesOf(STEPS, folder, awaiting(), []), [
      { label: 'forget it', command: 'nemia rm r-1', said: 'forgets the run with its folders and files', step: null },
    ]);
  });

  for (const [row, decided] of [
    ['a running run is offered nothing', { kind: 'running', waiting: ['implement'] }],
    ['a landed run is offered nothing', { kind: 'landed', branches: ['wf/r-1/implement'] }],
  ] as Array<[string, Decision]>) {
    await t.test(row, () => {
      assert.deepEqual(choicesOf(STEPS, RUN, decided, [offer('nemia retry r-1 implement')]), []);
    });
  }
});

test("a person's word at a gate or a loop is followed by who gave it, in the actor's words; a step whose word names no one is kept as it is", () => {
  const lines = {
    plan: 'approved 10:04Z — "go"',
    review: 'accepted as it stands 10:05Z, its findings open — "fine"',
    ship: 'awaiting approval',
  };
  const actors = { plan: { kind: 'person', token: 'laptop' }, review: { kind: 'agent', agent: 'operator', token: 'ops' } } as const;
  const said = saidBy(lines, (step) => (step === 'plan' || step === 'review' ? actors[step] : undefined));
  assert.equal(said.plan, 'approved 10:04Z — "go" · by the person, on laptop');
  assert.ok(
    said.review?.startsWith(`${lines.review} · by `) && said.review.includes('operator') && said.review.includes('ops'),
    said.review,
  );
  assert.equal(said.ship, 'awaiting approval');
});
