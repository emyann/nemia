/**
 * The session page's prompt box and the words it shows, as rules: whether the box may send to a step (`sayable`), what it holds once its
 * what was said merged with what the page has just said (`mergeSaid`), which of the session's lines is
 * its record of the words arriving (`heardIn`), and where each thing said lies among the conversation's turns (`withSaid`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Said, TranscriptEvent } from '../src/lib/api.ts';
import { mergeSaid, sayable, type Sayable } from '../src/lib/say.ts';
import { foldTranscript, heardIn, tailStart, withSaid } from '../src/lib/transcript.ts';

const step = (status: string, taskId: string | null = 't-1') => ({ name: 'implement', taskId, status });
const live = { cancelledAt: null };

test('the box is open while the step has a session in flight — at work, quiet, starting, between attempts, or blocked by its harness: what the page cannot see coming, the api refuses', () => {
  for (const status of ['running (working)', 'working (quiescent)', 'starting', 'between attempts', 'needs-human', 'running (blocked)']) {
    assert.deepEqual(sayable(live, step(status)), { open: true }, status);
  }
});

test('REFUSED: the box is closed, saying why and where to go instead, for a run called off, a step not filed, a task the engine has no record of, one filed and not started, and every session that has ended', () => {
  const why = (run: { cancelledAt: string | null }, s: ReturnType<typeof step>): string => {
    const said: Sayable = sayable(run, s);
    if (said.open) return assert.fail(`the box is open for ${JSON.stringify(s)}${run.cancelledAt ? ' on a run called off' : ''}`);
    return said.why;
  };
  assert.equal(
    why({ cancelledAt: '2026-09-14T06:00:00.000Z' }, step('running (working)')),
    "The run was called off, so implement's session is being stopped, not steered, and nothing more is filed for it.",
  );
  assert.equal(
    why(live, step('waiting', null)),
    'implement is not filed yet, so it has no session to say anything to. Say it here once it runs.',
  );
  assert.equal(why(live, step('unknown')), "The engine has no record of implement's task, so there is no session to say anything to.");
  assert.equal(
    why(live, step('pending')),
    'implement is filed and its session has not started, so there is nobody to say anything to yet. Say it here once it runs.',
  );
  const ended =
    "implement's session has ended, so there is nobody to say anything to. To tell the step something, answer it or try it again from the run page, and the next try is told what you write.";
  for (const status of [
    'succeeded · BLOCKED',
    'verified ✓',
    'unverified · done',
    'checking',
    'failed ✗ check (exit 1)',
    'unsigned',
    'rounds exhausted',
    'failed',
    'stopped',
    'succeeded',
  ]) {
    assert.equal(why(live, step(status)), ended, status);
  }
});

const said = (at: string, text: string, attempt = 1, after: Said['after'] = null): Said => ({ at, attempt, text, after });
const at = (s: number) => new Date(Date.UTC(2026, 8, 14, 16, 0, s)).toISOString();

test('what the page has just said is shown beside what the api read, once each, in the order said — and once the read has it, once', () => {
  const read = [said(at(1), 'first')];
  const sent = [said(at(2), 'second')];
  assert.deepEqual(mergeSaid(read, sent), [...read, ...sent]);
  assert.deepEqual(mergeSaid([...read, ...sent], sent), [...read, ...sent], 'read back: shown once');
  assert.deepEqual(mergeSaid(sent, read), [...read, ...sent], 'in the order said');
  assert.deepEqual(mergeSaid([], []), []);
});

const event = (id: string, s: number, kind: TranscriptEvent['kind'], more: Partial<TranscriptEvent> = {}): TranscriptEvent => ({
  id,
  at: at(s),
  role: 'assistant',
  kind,
  ...more,
});
/** The prompt, words, two calls with nothing said between them, and words. */
const EVENTS: TranscriptEvent[] = [
  event('u-1', 1, 'text', { role: 'user', text: 'Implement it.' }),
  event('a-1', 10, 'text', { text: 'Reading first.' }),
  event('c-1', 20, 'tool_use', { tool: { name: 'Read', input: { file_path: 'a.ts' } } }),
  event('c-2', 30, 'tool_use', { tool: { name: 'Bash', input: { command: 'npm test' } } }),
  event('a-2', 40, 'text', { text: 'Done reading.' }),
];

test("what a person said is a turn of its own among the conversation's, before the first turn after it — after a fold that began before it — and last when it came after everything; nothing said changes nothing", () => {
  const turns = foldTranscript(EVENTS);
  assert.deepEqual(withSaid(turns, []), turns);
  const laid = withSaid(turns, [said(at(35), 'Mid-fold.'), said(at(5), 'Early.'), said(at(50), 'Late.', 2)]);
  assert.deepEqual(
    laid.map((t) => (t.kind === 'told' ? `told: ${t.text}` : t.kind)),
    ['said', 'told: Early.', 'said', 'tools', 'told: Mid-fold.', 'said', 'told: Late.'],
  );
  assert.deepEqual(laid.at(-1), { kind: 'told', key: `told:2:${at(50)}`, at: at(50), attempt: 2, text: 'Late.', arrived: null });
  assert.deepEqual(
    laid.filter((t) => t.kind !== 'told'),
    turns,
    "the conversation's own turns, as they were",
  );
});

test('words said while calls wait leave them waiting: a told turn does not end the tail, as words the session says do', () => {
  const calls = foldTranscript(EVENTS.slice(0, 4));
  assert.equal(tailStart(withSaid(calls, [said(at(45), 'Also check the api.')])), tailStart(calls));
});

/** The session's own line for words it was handed, as the engine reads Claude Code's: a system event. */
const arrival = (id: string, s: number, text: string): TranscriptEvent => event(id, s, 'system', { role: 'system', text });

test("words the session's transcript shows reaching it are drawn once, as what was said, where they reached it — read between calls by a working session, or starting an idle one's turn", () => {
  const words = 'Widen the scope to apps/api too.';
  const told = said(at(12), words, 1, { kind: 'text', id: 'a-1' });
  const drawnWith = (turns: ReturnType<typeof withSaid>) =>
    turns.filter((t) => (t.kind === 'system' || t.kind === 'told') && t.text.includes(words)).length;

  const working = [...EVENTS.slice(0, 2), arrival('att-1', 15, words), ...EVENTS.slice(2)];
  assert.equal(
    drawnWith(withSaid(foldTranscript(working), [told])),
    2,
    "a working session's words, between its words and its calls, folded and laid in as they were: the duplicate, without heardIn",
  );
  const heard = heardIn(working, [told]);
  assert.deepEqual(heard.said, [{ ...told, arrived: at(15) }]);
  assert.deepEqual(heard.events, EVENTS, "the session's line for the words is taken out, and nothing else");
  const once = withSaid(foldTranscript(heard.events), heard.said);
  assert.equal(drawnWith(once), 1);
  assert.deepEqual(
    once.map((t) => t.kind),
    ['said', 'said', 'told', 'tools', 'said'],
    'where the words reached it',
  );

  const late = said(at(44), words, 1, { kind: 'text', id: 'a-2' });
  const idle = [...EVENTS, arrival('idle-1', 45, `Another Claude session sent a message:\n${words}`)];
  assert.equal(
    drawnWith(withSaid(foldTranscript(idle), [late])),
    2,
    "an idle session's words after Claude Code's line for a peer's message, starting a turn: the duplicate, without heardIn",
  );
  const heardIdle = heardIn(idle, [late]);
  assert.deepEqual([heardIdle.said, heardIdle.events], [[{ ...late, arrived: at(45) }], EVENTS]);
  const turns = withSaid(foldTranscript(heardIdle.events), heardIdle.said);
  assert.equal(drawnWith(turns), 1);
  assert.deepEqual(turns.at(-1), { kind: 'told', key: `told:1:${at(44)}`, at: at(44), attempt: 1, text: words, arrived: at(45) });
});

test("words said to a session whose clock runs behind the api's arrive all the same: the line after their mark, stamped before they were said", () => {
  const words = 'Widen the scope to apps/api too.';
  const told = said(at(30), words, 1, { kind: 'text', id: 'a-1' });
  const behind = [...EVENTS.slice(0, 2), arrival('behind', 24, words), ...EVENTS.slice(2)];
  const heard = heardIn(behind, [told]);
  assert.deepEqual(heard.said, [{ ...told, arrived: at(24) }], 'six seconds behind by its stamp, after the mark by its place');
  assert.deepEqual(heard.events, EVENTS, "the session's line for the words is taken out, and nothing else");
});

test("words journalled with no mark are looked for from the transcript's start, and words whose mark the transcript does not hold yet have no arrival", () => {
  const words = 'Widen the scope.';
  const lines = [arrival('first', 1, words), ...EVENTS];
  assert.deepEqual(
    heardIn(lines, [said(at(30), words)]).said.map((s) => s.arrived),
    [at(1)],
    'no mark: its first line, whenever stamped',
  );
  const unseen = heardIn(lines, [said(at(30), words, 1, { kind: 'tool_use', id: 'c-9' })]);
  assert.deepEqual([unseen.said.map((s) => s.arrived), unseen.events], [[null], lines], 'a mark not among the events yet: none, all kept');
});

test("REFUSED as an arrival: a line with other words, one that only mentions them, one before their mark though stamped after they were said, the session's own words, and a second line for words said once — each stays the session's, and words it has not shown have none", () => {
  const words = 'Widen the scope.';
  const told = said(at(30), words, 1, { kind: 'tool_use', id: 'c-2' });
  const before = [...EVENTS.slice(0, 3), arrival('before', 35, words), ...EVENTS.slice(3)];
  const others = [
    arrival('other', 41, 'Background session idle'),
    arrival('mention', 42, `Someone said: ${words} Ignore it.`),
    event('echo', 43, 'text', { text: words }),
  ];
  const kept = heardIn([...before, ...others], [told]);
  assert.deepEqual(kept.said, [{ ...told, arrived: null }]);
  assert.deepEqual(kept.events, [...before, ...others]);

  const lines = [event('a-0', 29, 'text', { text: 'Working.' }), arrival('first', 31, words), arrival('second', 33, words)];
  const first = said(at(30), words, 1, { kind: 'text', id: 'a-0' });
  const one = heardIn(lines, [first]);
  assert.deepEqual([one.said.map((s) => s.arrived), one.events], [[at(31)], [lines[0], lines[2]]], 'said once, one arrival');
  const two = heardIn(lines, [said(at(32), words, 1, { kind: 'system', id: 'first' }), first]);
  assert.deepEqual(
    [two.said.map((s) => s.arrived), two.events],
    [[at(31), at(33)], [lines[0]]],
    'said twice, two arrivals, in the order said',
  );
  assert.deepEqual(heardIn(EVENTS, []), { events: EVENTS, said: [] }, 'nothing said, nothing taken');
});
