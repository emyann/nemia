/**
 * The run as one object (`src/run.ts`): a judged run decodes and encodes back equal, and its JSON is the orchestrator's byte for byte —
 * `fixtures/run.encoded.json` is what the orchestrator's own `Run` encoded `fixtures/run.json` to before the Schemas moved here, so a field
 * reordered, renamed or retyped in the move is seen. A state not among its words, or another kind, is refused at decode.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { API_VERSION, GATE_BUDGETS_FROM, RUN_PHASES, Run, RunList, StepTries, WAIT_ON } from 'objects';

const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const read = (name: string): string => fs.readFileSync(path.join(FIXTURES, name), 'utf8');

/** A run of two steps, `build` over its budget with a raise offered, `review` reading its output and looping back to it. */
const judged: unknown = JSON.parse(read('run.json'));

test('a judged run decodes through `Run` and encodes back equal, its JSON what the orchestrator encoded before the move', () => {
  const run = Schema.decodeUnknownSync(Run)(judged);
  assert.equal(run.apiVersion, API_VERSION);
  const encoded = Schema.encodeSync(Run)(run);
  assert.deepEqual(encoded, judged, 'encoded back equal');
  assert.deepEqual(Schema.decodeUnknownSync(Run)(encoded), run, 'and decodes again to the same run');
  assert.equal(`${JSON.stringify(encoded, null, 2)}\n`, read('run.encoded.json'), 'byte for byte');
});

test('a page of runs decodes as a RunList and encodes back equal, a run with its namespace and one served before it had one', () => {
  const old = judged as Run;
  assert.equal(Object.hasOwn(old.metadata, 'namespace'), false, 'the fixture is a run served before the Run had a namespace');
  const placed = { ...old, metadata: { ...old.metadata, name: 'r-2', namespace: 'foo' } };
  const page = {
    apiVersion: API_VERSION,
    kind: 'RunList',
    metadata: { continue: 'ci0y', remainingItemCount: 1 },
    items: [old, placed],
    unjudged: [{ name: 'r-3', error: 'its journal does not read' }],
  };
  const decoded = Schema.decodeUnknownSync(RunList)(page);
  assert.equal(decoded.items[1]?.metadata.namespace, 'foo');
  assert.deepEqual(Schema.encodeSync(RunList)(decoded), page, 'encoded back equal');
  const { unjudged: _, ...judgedOnly } = page;
  assert.deepEqual(Schema.encodeSync(RunList)(Schema.decodeUnknownSync(RunList)(judgedOnly)), judgedOnly, 'unjudged is optional');
  assert.equal(Schema.decodeUnknownResult(RunList)({ ...page, kind: 'CardList' })._tag, 'Failure', 'the kind is `RunList`');
});

test('REFUSED: a run whose phase or wait is not among its words, or whose kind is not `Run`', () => {
  const run = Schema.decodeUnknownSync(Run)(judged);
  assert.ok(!(RUN_PHASES as readonly string[]).includes('paused'));
  const opened = { ...run, status: { ...run.status, phase: 'paused' } };
  assert.equal(Schema.decodeUnknownResult(Run)(opened)._tag, 'Failure', 'a phase is one of its words');
  assert.ok(!(WAIT_ON as readonly string[]).includes('nowhere'));
  const waiting = { ...run, status: { ...run.status, on: 'nowhere' } };
  assert.equal(Schema.decodeUnknownResult(Run)(waiting)._tag, 'Failure', 'a wait is one of its words');
  assert.equal(Schema.decodeUnknownResult(Run)({ ...run, kind: 'Step' })._tag, 'Failure', 'the kind is `Run`');
});

test("a step's gate decodes with its budgets and without them; REFUSED: budgets from neither a proposal nor an approval", () => {
  const run = Schema.decodeUnknownSync(Run)(judged);
  const step = run.status.steps[0];
  assert.ok(step);
  const gate = { awaiting: true, approval: null };
  const budgets = {
    from: 'proposed',
    steps: [{ step: 'implement', usd: 60, said: '$60.00', why: 'p90 $19', workflow: 40, above: true }],
    said: 'spent $3.00 of at most $63.00 under these caps',
  };
  const withGate = (g: unknown) => ({ ...run, status: { ...run.status, steps: [{ ...step, gate: g }, ...run.status.steps.slice(1)] } });
  assert.equal(Schema.decodeUnknownResult(Run)(withGate(gate))._tag, 'Success', 'a gate with no budgets');
  assert.equal(Schema.decodeUnknownResult(Run)(withGate({ ...gate, budgets }))._tag, 'Success', 'a gate with budgets');
  assert.ok(!(GATE_BUDGETS_FROM as readonly string[]).includes('guessed'));
  const guessed = withGate({ ...gate, budgets: { ...budgets, from: 'guessed' } });
  assert.equal(Schema.decodeUnknownResult(Run)(guessed)._tag, 'Failure', 'budgets come from one of their words');
});

test("a step's tries decode as a sub-resource of their own, the current one last", () => {
  const tries = {
    tries: [
      {
        try: 1,
        round: 1,
        cause: null,
        current: true,
        taskId: 'r-1-build',
        note: null,
        phase: 'running',
        reason: 'Running',
        on: null,
        via: null,
        message: 'running',
        attempts: { count: 1, latest: null },
        check: null,
        closeout: null,
        unreadable: null,
        answer: null,
      },
    ],
  };
  assert.deepEqual(Schema.encodeSync(StepTries)(Schema.decodeUnknownSync(StepTries)(tries)), tries);
});
