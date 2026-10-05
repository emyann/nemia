/**
 * The commands `nemia decide` offers (`choicesOf`): each offer's bare command beside its sentence, a gate's approval and send-backs, and
 * ship it and drop it, read it or forget it by the run's place — none on a run that awaits nobody.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choicesOf, type Decision, type Offer } from './decide.ts';
import type { Run } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';

const STEPS: Workflow[] = [
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
  outcome: 'blocked',
  branches: ['wf/r-1/implement'],
  failed: [],
  stuck: [],
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

test('each offer is its own bare command, labelled by its verb, with the sentence it ends on', () => {
  const offers = [
    'nemia retry r-1 implement',
    'nemia retry r-1 implement --recheck',
    'nemia retry r-1 implement --budget <amount>',
    'nemia round r-1 implement --budget <amount>',
    'nemia accept r-1 implement --message "<why>"',
    'nemia retry r-1 implement --message "<objection>"',
  ].map(offer);
  const commands = choicesOf(STEPS, RUN, awaiting(), offers);
  assert.deepEqual(
    commands.map((c) => [c.label, c.command, c.said]),
    [
      ...offers.map((o, i) => [['once more', 'once more', 'once more', 'once more', 'accept', 'send back'][i], o.command, o.said]),
      ['ship it', 'git -C /code/app merge --no-ff wf/r-1/implement', null],
      ['drop it', 'git -C /code/app branch -D wf/r-1/implement', null],
    ],
  );
});

test('a step waiting at its gate is offered its approval and a send-back for each step it names, in the order of the steps', () => {
  const unrun = { ...RUN, steps: { ...RUN.steps, implement: { taskId: null } } } as unknown as Run;
  assert.deepEqual(
    choicesOf(STEPS, unrun, awaiting({ awaitingApproval: ['implement', 'plan'] }), []).slice(0, 4),
    [
      {
        label: 'approve',
        command: 'nemia approve r-1 plan',
        said: 'plan waits at its gate — with words: nemia approve r-1 plan --message "<words>"',
      },
      { label: 'send back', command: 'nemia retry r-1 plan --message "<objection>"', said: null },
      {
        label: 'approve',
        command: 'nemia approve r-1 implement',
        said: 'implement waits at its gate — with words: nemia approve r-1 implement --message "<words>"',
      },
      { label: 'send back', command: 'nemia retry r-1 plan --message "<objection>"', said: null },
    ],
    'an unrun step sends back to what it waits on',
  );
});

test('a workflow whose step merges is offered no ship it nor drop it; a direct run reads it; a folder run forgets it', () => {
  const merging = [...STEPS, { name: 'ship', after: ['implement'], body: 'Land it.', workspace: 'main' }] as Workflow[];
  assert.deepEqual(choicesOf(merging, RUN, awaiting(), []), []);
  assert.deepEqual(choicesOf(STEPS, RUN, awaiting({ direct: true }), []), [
    { label: 'read it', command: 'git -C /code/app diff abc...main', said: 'worked directly on main; nothing to merge; the base was abc' },
  ]);
  const folder = { ...RUN, place: { kind: 'folder' }, repo: undefined, baseRef: undefined, branch: undefined } as unknown as Run;
  assert.deepEqual(choicesOf(STEPS, folder, awaiting(), []), [
    { label: 'forget it', command: 'nemia rm r-1', said: 'forgets the run with its folders and files' },
  ]);
});

test('a run that awaits nobody is offered nothing', () => {
  assert.deepEqual(choicesOf(STEPS, RUN, { kind: 'running', waiting: ['implement'] }, [offer('nemia retry r-1 implement')]), []);
  assert.deepEqual(choicesOf(STEPS, RUN, { kind: 'shipped', branches: ['wf/r-1/implement'] }, []), []);
});
