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
import { API_VERSION, GATE_BUDGETS_FROM, RUN_PHASES, Run, RunList, RunSaid, RunSay, StepTries, WAIT_ON } from 'objects';

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

test('a page of runs decodes as a RunList and encodes back equal, a run with its namespace and version and one served before it had them', () => {
  const old = judged as Run;
  assert.equal(Object.hasOwn(old.metadata, 'namespace'), false, 'the fixture is a run served before the Run had a namespace');
  assert.equal(Object.hasOwn(old.metadata, 'resourceVersion'), false, 'and before it had a resourceVersion');
  const placed = { ...old, metadata: { ...old.metadata, name: 'r-2', namespace: 'foo', resourceVersion: '0123456789abcdef' } };
  const page = {
    apiVersion: API_VERSION,
    kind: 'RunList',
    metadata: { continue: 'ci0y', remainingItemCount: 1 },
    items: [old, placed],
    unjudged: [{ name: 'r-3', error: 'its journal does not read' }],
  };
  const decoded = Schema.decodeUnknownSync(RunList)(page);
  assert.equal(decoded.items[1]?.metadata.namespace, 'foo');
  assert.equal(decoded.items[1]?.metadata.resourceVersion, '0123456789abcdef');
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
  const past = { ...budgets, line: { usd: 50, said: 'at most $63.00 passes the cost line of $50.00' } };
  assert.deepEqual(Schema.decodeUnknownSync(Run)(withGate({ ...gate, budgets: past })).status.steps[0]?.gate?.budgets?.line, past.line);
  const lineless = withGate({ ...gate, budgets: { ...budgets, line: { said: 'no amount' } } });
  assert.equal(Schema.decodeUnknownResult(Run)(lineless)._tag, 'Failure', 'a line carries its amount');
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

test('a RunList asked by state carries each run state, frame part, its counts and asOf; a page without them still decodes', () => {
  const run = judged as Run;
  const framed = {
    ...run,
    status: {
      ...run.status,
      state: 'finished',
      wallMs: 60_000,
      clock: { wallMs: 60_000, sessionsMs: 30_000, checksMs: 10_000, personMs: 5_000, slotMs: 5_000, restMs: 10_000 },
      stepCosts: [{ step: 'build', cost: null }],
      waitingSince: null,
      finishedAt: '2026-11-05T10:01:00.000Z',
      outcome: 'succeeded',
    },
  };
  const page = {
    apiVersion: API_VERSION,
    kind: 'RunList',
    metadata: { remainingItemCount: 0, counts: { waiting: 1, inFlight: 2, finished: 3 }, asOf: '2026-11-05T10:02:00.000Z' },
    items: [framed],
    unjudged: [{ name: 'r-3', namespace: 'default', error: 'its journal does not read', state: 'inFlight' }],
  };
  const decoded = Schema.decodeUnknownSync(RunList)(page);
  assert.equal(decoded.items[0]?.status.outcome, 'succeeded');
  assert.equal(decoded.metadata.counts?.finished, 3);
  assert.equal(decoded.unjudged?.[0]?.state, 'inFlight');
  assert.deepEqual(Schema.encodeSync(RunList)(decoded), page, 'encoded back equal');
  assert.throws(() => Schema.decodeUnknownSync(RunList)({ ...page, items: [{ ...framed, status: { ...framed.status, state: 'done' } }] }));
  assert.throws(() =>
    Schema.decodeUnknownSync(RunList)({ ...page, items: [{ ...framed, status: { ...framed.status, outcome: 'ended' } }] }),
  );
  const plain = { apiVersion: API_VERSION, kind: 'RunList', metadata: {}, items: [run] };
  assert.deepEqual(Schema.encodeSync(RunList)(Schema.decodeUnknownSync(RunList)(plain)), plain);
});

test("words said to a step's session say who said them where an agent did; REFUSED: an agent with no name", () => {
  const operator = { kind: 'agent', name: 'operator' } as const;
  assert.deepEqual(Schema.decodeUnknownSync(RunSay)({ text: 'Cut it.' }), { text: 'Cut it.' }, 'the person says no `from`');
  assert.deepEqual(Schema.decodeUnknownSync(RunSay)({ text: 'Cut it.', from: operator }).from, operator);
  assert.equal(Schema.decodeUnknownResult(RunSay)({ text: 'Cut it.', from: { kind: 'agent' } })._tag, 'Failure', 'an agent names itself');
  const framed = 'The agent operator writes, not the person: Cut it.';
  const said = { at: '2026-11-11T10:00:00.000Z', attempt: 1, text: framed, after: null, from: operator, words: 'Cut it.' };
  assert.deepEqual(Schema.encodeSync(RunSaid)(Schema.decodeUnknownSync(RunSaid)(said)), said, 'encoded back equal');
  const withSaid = (entry: unknown): unknown => {
    const run = structuredClone(judged) as { status: { steps: { said: unknown[] }[] } };
    const step = run.status.steps[0];
    assert.ok(step);
    step.said = [entry];
    return run;
  };
  const decoded = Schema.decodeUnknownSync(Run)(withSaid(said));
  assert.deepEqual(decoded.status.steps[0]?.said[0]?.from, operator, "the step's status carries who said it");
  assert.equal(decoded.status.steps[0]?.said[0]?.words, 'Cut it.');
  assert.equal(Schema.decodeUnknownResult(Run)(withSaid({ ...said, from: { kind: 'agent' } }))._tag, 'Failure');
});
