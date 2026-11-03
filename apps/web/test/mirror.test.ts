/**
 * The board's run mirror, `src/lib/api/run.gen.ts`, is what Effect generates from the document the api serves (`mirror.ts`): the
 * checked-in file is that text byte for byte, so a change to the run object shows in the mirror's diff, and the mirror's `Run` decodes a
 * run object and refuses another kind.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Schema } from 'effect';
import { scratch } from './scratch.ts';
import { documentNow, MIRROR, mirrorOf } from './mirror.ts';

test('the checked-in mirror is what the served document generates', () => {
  const generated = mirrorOf(documentNow(scratch('mirror-')));
  const checkedIn = fs.existsSync(MIRROR) ? fs.readFileSync(MIRROR, 'utf8') : null;
  assert.ok(checkedIn === generated, 'run `npm run mirror` in apps/web to write src/lib/api/run.gen.ts from the served document');
});

/** The time of no task yet, as a run's timeline totals it. */
const total = {
  loop: null,
  round: null,
  tasks: 0,
  inFlight: 0,
  queuedMs: 0,
  ranMs: 0,
  wallMs: null,
  queued: '0s',
  ran: '0s',
  wall: '0s',
  cost: null,
};

/** A step as the run froze it, waiting on `after`, with none of the rest of its frontmatter set. */
const frozen = (name: string, after: string[]) => ({
  name,
  after,
  input: after,
  loop: null,
  rounds: null,
  harness: 'claude',
  model: null,
  effort: null,
  context: null,
  workspace: null,
  place: null,
  resume: null,
  fence: null,
  sandbox: null,
  tools: null,
  deadlineSeconds: null,
});

/** A step not filed yet, as the object's status says one. */
const pending = (name: string) => ({
  name,
  phase: 'pending',
  reason: 'Pending',
  status: 'pending',
  on: null,
  via: null,
  message: 'pending',
  verdict: null,
  raise: null,
  timeline: [],
  current: null,
  filed: null,
  taskId: null,
  workspace: null,
  branch: null,
  files: [],
  filesError: null,
  note: null,
  roundDue: false,
  needs: null,
  waitingFor: null,
  approve: null,
  denied: null,
  sessionUnread: null,
  lastLine: null,
  gate: null,
  accepted: null,
  said: [],
  asked: null,
  check: null,
  attempts: { count: 0, latest: null },
  used: null,
  spent: null,
  budget: null,
});

/** What the run is judged as now: running, nothing measured, both steps pending. */
const status = () => ({
  status: 'running',
  phase: 'running',
  reason: 'Running',
  on: null,
  via: null,
  moving: true,
  cost: null,
  atWork: null,
  tokens: null,
  waiting: null,
  holding: null,
  toDecide: null,
  graph: {
    roots: ['implement'],
    edges: [
      { from: 'implement', to: 'review', kind: 'after' },
      { from: 'implement', to: 'review', kind: 'input' },
    ],
  },
  timeline: { rounds: [], run: total, slot: null },
  steps: [pending('implement'), pending('review')],
  startedAt: null,
  cancelledAt: null,
  pruned: null,
  onDisk: { worktrees: false, files: false },
  holdUntil: [],
  read: null,
  waitingOnYou: [],
  waitingOnYouWords: [],
  gates: [],
  warning: null,
  kinds: [],
});

/** A run object as the served `Run` says one: two steps, the second waiting on the first and handed its output, nothing filed yet. */
const sample = () => ({
  apiVersion: 'nemia/v1',
  kind: 'Run',
  metadata: { name: 'r-1', creationTimestamp: '2026-11-02T10:00:00.000Z', labels: { workflow: 'quick' } },
  spec: {
    steps: [frozen('implement', []), frozen('review', ['implement'])],
    brief: 'a brief',
    place: 'git',
    repo: '/repo',
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    work: null,
    workflowDir: '/team/quick',
    try: null,
    after: [],
    context: [],
    from: null,
  },
  status: status(),
});

test("the mirror's Run decodes a run object and refuses another kind", async () => {
  const { Run } = await import('../src/lib/api/run.gen.ts');
  const decode = Schema.decodeUnknownExit(Run);
  const decoded = decode(sample());
  assert.equal(decoded._tag, 'Success');
  assert.deepEqual(Schema.decodeUnknownSync(Run)(sample()), sample(), 'the sample decodes whole, no field outside the mirror');
  assert.equal(decode({ ...sample(), kind: 'Step' })._tag, 'Failure');
});
