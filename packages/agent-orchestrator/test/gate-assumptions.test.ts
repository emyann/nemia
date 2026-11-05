/**
 * What the gate's contract (`contracts/gate.contract.ts`) assumes of code the verifier does not read holds of the real code: the run's
 * words (`runWords`) read a step `awaiting approval` only where it is gated, and only while the try it is on is unapproved — on a gated
 * table condition whose table answered, the same once approved, a filed gated step at its gate, an ending approved before it is filed,
 * and a workflow with no routing. `npm run contracts` proves `approvalRefusal` given these; this file is what makes them more than a claim.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brokenOn } from '@emyann/tsverify';
import { theRunsWords } from '../contracts/gate.contract.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { Run, TaskPhase } from '../src/record/record.ts';
import type { Workflow } from '../src/step/step.ts';
import { phases, run, step } from './assessed.ts';

const TRIAGE: Workflow[] = [
  step('plan'),
  {
    ...step('triage', ['plan']),
    routes: ['web', 'backend'],
    route: { kind: 'table', from: 'plan.surface', table: { web: 'web', backend: 'backend' } },
  },
  { ...step('build-web', ['triage']), when: ['web'] },
  { ...step('build-backend', ['triage']), when: ['backend'] },
];
const PLANNED: Workflow[] = [step('plan'), step('implement', ['plan'])];
const ENDING: Workflow[] = [step('implement'), { ...step('land', ['implement']), workspace: 'base', gate: true }];

const done = (surface?: string): Closeout => ({
  outcome: 'done',
  summary: 's',
  artifacts: [],
  ...(surface === undefined ? {} : { output: { surface } }),
});
const said = (surface: string) => (name: string) => (name === 'plan' ? done(surface) : undefined);
const approval = (name: string) => ({ step: name, try: 1, at: '2026-11-05T17:00:00.000Z' });
const asked = () => true;

type Input = [
  readonly Workflow[],
  Run,
  (taskId: string) => TaskPhase,
  (step: string) => Closeout | undefined,
  () => boolean,
  () => undefined,
  () => undefined,
];
const input = (steps: Workflow[], r: Run, p: (id: string) => TaskPhase, c: (s: string) => Closeout | undefined): Input => [
  steps,
  r,
  p,
  c,
  asked,
  () => undefined,
  () => undefined,
];

test("the run's words read awaiting approval only at a gate, and only while its try is unapproved", () => {
  const triage = (extra: Partial<Run> = {}) =>
    run({ plan: 't1', triage: null, 'build-web': null, 'build-backend': null }, { gates: ['triage'], ...extra });
  const planDone = phases({ t1: 'succeeded' });
  const inputs: Input[] = [
    input(TRIAGE, triage(), planDone, said('web')),
    input(TRIAGE, triage({ approvals: [approval('triage')] }), planDone, said('web')),
    input(TRIAGE, triage({ gates: undefined }), planDone, said('web')),
    input(TRIAGE, triage(), phases({ t1: 'running' }), said('web')),
    input(TRIAGE, triage(), planDone, said('mobile')),
    input(PLANNED, run({ plan: 't1', implement: null }, { gates: ['plan'] }), planDone, () => done()),
    input(PLANNED, run({ plan: 't1', implement: null }, { gates: ['plan'], approvals: [approval('plan')] }), planDone, () => done()),
    input(ENDING, run({ implement: 't1', land: null }), planDone, () => done()),
    input(ENDING, run({ implement: 't1', land: null }, { approvals: [approval('land')] }), planDone, () => done()),
    input(PLANNED, run({ plan: 't1', implement: null }), planDone, () => done()),
  ];
  assert.deepEqual(
    brokenOn(theRunsWords, inputs as never).map((b) => b.law),
    [],
  );
});
