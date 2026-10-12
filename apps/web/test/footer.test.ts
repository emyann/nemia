/**
 * The frame's bottom bar (src/lib/footer.ts): what is at work, the daemon's dot, the feed's word, the quota's short form, the groups a
 * phone keeps; and no page left at the frame's height before the bar. `npm run e2e` looks at the bar itself (`389-bottom-bar.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { QuotaWindow, RunSummary } from '../src/lib/api.ts';
import { listed, waitingRun } from './run-fixtures.ts';
import { atWork, atWorkWords, daemonDot, feedWords, footerParts, quotaShort, staleFrameHeights, versionWords } from '../src/lib/footer.ts';
import { daemon, quota } from './factory-fixtures.ts';

const NOW = new Date('2026-09-30T05:10:00.000Z');

/** A five-hour window, 82% used and marked. */
const win = (extra: Partial<QuotaWindow> = {}): QuotaWindow => ({
  key: 'five_hour',
  label: '5-hour',
  usedPercentage: 82,
  resetsAt: '2026-09-30T08:00:00.000Z',
  reset: false,
  marked: true,
  ...extra,
});

/** A run in flight with one step per status, in `factory`, and `extra` over it. */
const run = (statuses: readonly string[], extra: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r-1',
  repo: '/code/app',
  factory: null,
  place: 'repository',
  work: null,
  brief: 'Do the thing',
  workflowDir: '/code/app/workflows/dev',
  workflowPage: null,
  try: null,
  createdAt: '2026-09-13T00:00:00.000Z',
  startedAt: null,
  cancelledAt: null,
  pruned: null,
  status: 'running',
  stoppedOn: null,
  moving: true,
  cost: null,
  atWork: null,
  tokens: null,
  steps: statuses.map((status, i) => ({
    name: `step-${i}`,
    taskId: `t-${i}`,
    branch: null,
    status,
    note: null,
    roundDue: false,
    needs: null,
    blockedByHarness: false,
    waitingFor: null,
    approve: null,
    denied: null,
    sessionUnread: null,
  })),
  graph: { roots: [], edges: [] },
  waitingOnYou: [],
  onYou: [],
  after: [],
  waiting: null,
  context: [],
  heldUntil: [],
  holding: null,
  toDecide: null,
  unreadable: null,
  ...extra,
});

/** A light answer holding `waiting` and `inFlight`, its counts their lengths. */
const light = (waiting: RunSummary[], inFlight: RunSummary[]) => ({
  counts: { waiting: waiting.length, inFlight: inFlight.length, finished: 0 },
  waiting: waiting.map((row) => waitingRun(row)),
  inFlight: inFlight.map((row) => listed(row)),
});

test('at work: the runs the api counts in flight, and each step working or checking', () => {
  assert.deepEqual(atWork(light([], [run(['running (working)', 'checking', 'verified ✓'])])), { runs: 1, sessions: 2 });
});

test('at work: REFUSED, a step that asks a person (needs-human) is the bell’s, not a session at work', () => {
  assert.deepEqual(atWork(light([run(['needs-human'], { waitingOnYou: ['step-0'] })], [])), { runs: 0, sessions: 0 });
});

test('at work: REFUSED, a cancelled run’s step still saying it works is no session', () => {
  const off = run(['running (working)'], { cancelledAt: '2026-09-30T05:00:00.000Z', status: 'cancelled', moving: false });
  assert.deepEqual(atWork(light([], [off])).sessions, 0);
});

test('at work: REFUSED, the runs in flight are the api’s count, never the rows counted by the board', () => {
  const moving = run(['checking']);
  assert.equal(atWork({ ...light([], [moving]), counts: { waiting: 0, inFlight: 7, finished: 0 } }).runs, 7);
});

test('at work: a session of a run that waits on a person still works, and counts, though the run is not in flight', () => {
  const holding = {
    at: '2026-09-30T05:00:00.000Z',
    runs: [],
    word: 'held until a person lifts it',
    advice: 'wf hold r-1 --off',
    onYou: true,
  };
  assert.deepEqual(atWork(light([run(['running (working)', 'waiting'], { moving: false, holding })], [])), { runs: 0, sessions: 1 });
});

test('at work: runs in every factory count', () => {
  const runs = [run(['running (working)']), run(['checking'], { id: 'r-2', factory: 'other' })];
  assert.deepEqual(atWork(light([], runs)), { runs: 2, sessions: 2 });
});

test('at work, in words: one and many, short enough for the bar, and the whole sentence in the title', () => {
  assert.equal(atWorkWords({ runs: 1, sessions: 1 }).text, '1 run · 1 session');
  assert.equal(atWorkWords({ runs: 0, sessions: 3 }).text, '0 runs · 3 sessions');
  assert.match(atWorkWords({ runs: 2, sessions: 3 }).title, /2 runs in flight, and 3 sessions working or checking, across every factory/);
});

test('the daemon’s dot: ticking is ok, stalled and unreadable warn, none, stopped and gone are down', () => {
  assert.equal(daemonDot(daemon(), null, NOW).tone, 'ok');
  assert.equal(daemonDot(daemon({ kind: 'stalled', ticking: false }), null, NOW).tone, 'warn');
  assert.equal(daemonDot(daemon({ kind: 'unreadable', ticking: false }), null, NOW).tone, 'warn');
  for (const kind of ['none', 'stopped', 'gone'] as const) {
    assert.equal(daemonDot(daemon({ kind, ticking: false }), null, NOW).tone, 'down', kind);
  }
});

test('the daemon’s dot: REFUSED, a read that failed is down and says so, never a daemon that ticks', () => {
  const dot = daemonDot(undefined, new Error('the api answered 500'), NOW);
  assert.deepEqual(dot, {
    kind: 'error',
    tone: 'down',
    word: 'unread',
    title: 'Whether a daemon ticks this store could not be read: the api answered 500',
  });
});

test('the daemon’s dot: nothing read yet is neither ok nor down', () => {
  assert.equal(daemonDot(undefined, null, NOW).tone, 'reading');
});

test('the daemon’s dot: a stalled holder’s title is the floor’s whole sentence, how to start one included', () => {
  const dot = daemonDot(daemon({ kind: 'stalled', ticking: false, lastHeardAt: '2026-09-30T04:40:00.000Z' }), null, NOW);
  assert.equal(dot.word, 'stalled');
  assert.match(
    dot.title,
    /^Nothing ticks this store, so no run moves: the api of pid 4242 is alive but silent, last heard from 30 min ago\./,
  );
  assert.match(dot.title, /npm start in apps\/api — it takes the store over\.$/);
});

test('the daemon’s dot: a ticking daemon’s title is the api’s own line', () => {
  assert.equal(daemonDot(daemon(), null, NOW).title, daemon().line);
});

test('the daemon’s dot: a ticking daemon whose last pass could not read a harness warns, each reason on its own line of the title', () => {
  const unobserved = ['harness `claude`: claude agents: timed out', 'harness `codex`: its transcripts folder cannot be listed'];
  assert.deepEqual(daemonDot(daemon({ unobserved }), null, NOW), {
    kind: 'ticking',
    tone: 'warn',
    word: 'ticking, harness unread',
    title: [daemon().line, ...unobserved].join(String.fromCharCode(10)),
  });
  const stalled = daemonDot(daemon({ kind: 'stalled', ticking: false, unobserved }), null, NOW);
  assert.equal(stalled.word, 'stalled', 'REFUSED: a daemon that does not tick says why it does not, not what its pass read');
  assert.doesNotMatch(stalled.title, /harness/);
});

test('the feed’s word: live while followed, polling while not', () => {
  assert.equal(feedWords('open').word, 'live');
  assert.equal(feedWords('connecting').word, 'connecting');
  assert.equal(feedWords('down').word, 'polling');
});

test('the quota, short: each window’s label and percentage, marked when one is', () => {
  const short = quotaShort(quota(), null, NOW);
  assert.equal(short.text, '5-hour 82% · week 82%');
  assert.equal(short.marked, true);
  assert.equal(short.stale, false);
  assert.match(short.title, /^Asked of Claude Code \(get_usage, max plan\)/);
});

test('the quota, short: REFUSED, a window reset since the reading is not marked', () => {
  const short = quotaShort(quota({ windows: [win({ reset: true })] }), null, NOW);
  assert.equal(short.marked, false);
});

test('the quota, short: a state with no windows gives the last reading, said to be stale, the api’s sentence first in the title', () => {
  const last = { askedAt: '2026-09-30T04:00:00.000Z', windows: [win({ usedPercentage: 40, marked: false })] };
  const short = quotaShort(quota({ state: 'unanswered', windows: [], last, said: 'The usage service gave nothing.' }), null, NOW);
  assert.equal(short.text, '5-hour 40%');
  assert.equal(short.stale, true);
  assert.match(short.title, /^The usage service gave nothing\. Asked of Claude Code/);
});

test('the quota, short: the last reading keeps its mark, and a window reset since loses it', () => {
  const last = { askedAt: '2026-09-30T04:00:00.000Z', windows: [win({ key: 'seven_day', label: 'week', usedPercentage: 86 })] };
  const short = quotaShort(quota({ state: 'unanswered', windows: [], last }), null, NOW);
  assert.equal(short.text, 'week 86%');
  assert.equal(short.marked, true);
  const reset = { ...last, windows: [win({ key: 'seven_day', label: 'week', usedPercentage: 86, reset: true })] };
  assert.equal(quotaShort(quota({ state: 'unanswered', windows: [], last: reset }), null, NOW).marked, false);
});

test('the quota, short: a state with nothing to show says its word', () => {
  const short = quotaShort(quota({ state: 'no-plan', windows: [], said: 'No Claude plan is signed in.' }), null, NOW);
  assert.equal(short.text, 'no plan');
  assert.match(short.title, /^No Claude plan is signed in\./);
});

test('the quota, short: a read that failed is a word, not a throw', () => {
  const short = quotaShort(undefined, new Error('the api answered 500'), NOW);
  assert.equal(short.text, 'unread');
  assert.equal(short.title, 'The quota could not be read: the api answered 500');
});

test('the groups: a phone keeps exactly the daemon, the pause and the quota; a wide screen all six, the pause after the daemon', () => {
  assert.deepEqual(footerParts(true), ['daemon', 'pause', 'quota']);
  assert.deepEqual(footerParts(false), ['daemon', 'pause', 'feed', 'work', 'quota', 'version']);
});

/** Every `.tsx` under `src`, by its path from the app. */
const sources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(at);
    return entry.name.endsWith('.tsx') ? [at] : [];
  });

test('the frame height: REFUSED, a page still at the screen less the header alone, a line break inside or not', () => {
  assert.deepEqual(staleFrameHeights('<div className="flex h-[calc(100svh-3rem)] min-h-96">'), ['h-[calc(100svh-3rem)]']);
  assert.deepEqual(staleFrameHeights('h-[calc(100svh-\n  3rem)]!'), ['h-[calc(100svh-\n  3rem)]']);
  assert.equal(staleFrameHeights('h-[calc(100svh-5rem)]').length, 0);
});

test('the frame height: no page under the bottom bar is the screen less the header alone', () => {
  const app = path.join(import.meta.dirname, '..');
  const stale = sources(path.join(app, 'src')).filter((file) => staleFrameHeights(fs.readFileSync(file, 'utf8')).length > 0);
  assert.equal(stale.length, 0, `less the header and the bottom bar, 100svh-5rem: ${stale.map((f) => path.relative(app, f)).join(', ')}`);
});

test("the version says the code serving the board: an install's tag, or checkout, and the folder in its hover; the version alone without", () => {
  const install = { kind: 'install', root: '/home/me/.nemia/v1.2.0', tag: 'v1.2.0', commit: 'abcdef1234567890' } as const;
  assert.deepEqual(versionWords({ version: '1.0.0', release: install }), {
    text: 'v1.0.0 · v1.2.0',
    title: "Nemia's orchestrator, version 1.0.0, the installed release v1.2.0 (abcdef1) at /home/me/.nemia/v1.2.0",
  });
  assert.deepEqual(versionWords({ version: '1.0.0', release: { kind: 'checkout', root: '/home/me/nemia' } }), {
    text: 'v1.0.0 · checkout',
    title: "Nemia's orchestrator, version 1.0.0, run from the checkout at /home/me/nemia",
  });
  assert.deepEqual(versionWords({ version: '1.0.0' }), { text: 'v1.0.0', title: "Nemia's orchestrator, version 1.0.0" });
});
