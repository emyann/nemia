/**
 * The session page's prompt box and the words it shows, as rules: whether the box may send to a step (`sayable`), what was said merged with
 * what the page has just said (`mergeSaid`), and where each thing said lies among the conversation's turns (`withSaid`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Said, TranscriptEvent } from '../src/lib/api.ts';
import { mergeSaid, sayable, type Sayable } from '../src/lib/say.ts';
import { foldTranscript, tailStart, withSaid } from '../src/lib/transcript.ts';

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
  assert.equal(why({ cancelledAt: '2026-09-14T06:00:00.000Z' }, step('running (working)')), "The run was called off, so implement's session is being stopped, not steered, and nothing more is filed for it.");
  assert.equal(why(live, step('waiting', null)), 'implement is not filed yet, so it has no session to say anything to. Say it here once it runs.');
  assert.equal(why(live, step('unknown')), "The engine has no record of implement's task, so there is no session to say anything to.");
  assert.equal(why(live, step('pending')), 'implement is filed and its session has not started, so there is nobody to say anything to yet. Say it here once it runs.');
  const ended = "implement's session has ended, so there is nobody to say anything to. To tell the step something, answer it or try it again from the run page, and the next try is told what you write.";
  for (const status of ['succeeded · BLOCKED', 'verified ✓', 'unverified · done', 'checking', 'failed ✗ check (exit 1)', 'unsigned', 'rounds exhausted', 'failed', 'stopped', 'succeeded']) {
    assert.equal(why(live, step(status)), ended, status);
  }
});

const said = (at: string, text: string, attempt = 1): Said => ({ at, attempt, text });
const at = (s: number) => new Date(Date.UTC(2026, 8, 14, 16, 0, s)).toISOString();

test('what the page has just said is shown beside what the api read, once each, in the order said — and once the read has it, once', () => {
  const read = [said(at(1), 'first')];
  const sent = [said(at(2), 'second')];
  assert.deepEqual(mergeSaid(read, sent), [...read, ...sent]);
  assert.deepEqual(mergeSaid([...read, ...sent], sent), [...read, ...sent], 'read back: shown once');
  assert.deepEqual(mergeSaid(sent, read), [...read, ...sent], 'in the order said');
  assert.deepEqual(mergeSaid([], []), []);
});

const event = (id: string, s: number, kind: TranscriptEvent['kind'], more: Partial<TranscriptEvent> = {}): TranscriptEvent =>
  ({ id, at: at(s), role: 'assistant', kind, ...more });
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
  assert.deepEqual(laid.map((t) => (t.kind === 'told' ? `told: ${t.text}` : t.kind)), ['said', 'told: Early.', 'said', 'tools', 'told: Mid-fold.', 'said', 'told: Late.']);
  assert.deepEqual(laid.at(-1), { kind: 'told', key: `told:2:${at(50)}`, at: at(50), attempt: 2, text: 'Late.' });
  assert.deepEqual(laid.filter((t) => t.kind !== 'told'), turns, "the conversation's own turns, as they were");
});

test('words said while calls wait leave them waiting: a told turn does not end the tail, as words the session says do', () => {
  const calls = foldTranscript(EVENTS.slice(0, 4));
  assert.equal(tailStart(withSaid(calls, [said(at(45), 'Also check the api.')])), tailStart(calls));
});
