/**
 * How the board folds a step's conversation: `foldTranscript` and its helpers, pure, over the engine's events.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  closeoutOf,
  detailOf,
  foldTranscript,
  mergeEvents,
  sessionToRead,
  summaryLine,
  summaryShown,
  tailStart,
  withSaid,
  type ToolCall,
  type ToolsTurn,
  type Turn,
} from '../src/lib/transcript.ts';
import type { TranscriptEvent } from '../src/lib/api.ts';

let clock = Date.parse('2026-09-13T08:00:00.000Z');
const at = () => new Date((clock += 1000)).toISOString();

const said = (id: string, text: string, role: 'user' | 'assistant' = 'assistant'): TranscriptEvent => ({
  id,
  at: at(),
  role,
  kind: 'text',
  text,
});
const thought = (id: string, text?: string): TranscriptEvent => ({
  id,
  at: at(),
  role: 'assistant',
  kind: 'thinking',
  ...(text === undefined ? {} : { text }),
});
const quiet = (id: string, text: string): TranscriptEvent => ({ id, at: at(), role: 'system', kind: 'system', text });
const use = (id: string, name: string, input: unknown = {}): TranscriptEvent => ({
  id,
  at: at(),
  role: 'assistant',
  kind: 'tool_use',
  tool: { name, input },
});
const result = (id: string, text: string, isError = false): TranscriptEvent => ({
  id,
  at: at(),
  role: 'user',
  kind: 'tool_result',
  result: { text, isError },
});
/** A call and its result, as a transcript has them: one after the other. */
const call = (id: string, name: string, input: unknown = {}, out = `${name} said ok`, isError = false) => [
  use(id, name, input),
  result(id, out, isError),
];

const kinds = (turns: Turn[]) => turns.map((t) => t.kind);
const fold = (turns: Turn[]) => turns.find((t): t is ToolsTurn => t.kind === 'tools')!;

test('the calls between two things said fold into one turn, in the order they came, each with its result', () => {
  const turns = foldTranscript([
    said('u', 'Implement it.', 'user'),
    said('a1', 'Looking first.'),
    ...call('b1', 'Bash', { command: 'git status' }),
    ...call('b2', 'Bash', { command: 'npm test' }),
    ...call('g1', 'Grep', { pattern: 'transcript' }),
    ...call('b3', 'Bash', { command: 'npm run typecheck' }),
    ...call('r1', 'Read', { file_path: '/repo/a.ts' }),
    ...call('r2', 'Read', { file_path: '/repo/b.ts' }),
    ...call('r3', 'Read', { file_path: '/repo/c.ts' }),
    said('a2', 'Done looking.'),
  ]);
  assert.deepEqual(kinds(turns), ['said', 'said', 'tools', 'said']);
  const tools = fold(turns);
  assert.equal(tools.calls, 7);
  assert.deepEqual(
    tools.turns.map((t) => (t.kind === 'tool' ? t.call.id : t.kind)),
    ['b1', 'b2', 'g1', 'b3', 'r1', 'r2', 'r3'],
    'the calls, in order',
  );
  assert.ok(
    tools.turns.every((t) => t.kind === 'tool' && t.call.result?.text === `${t.call.name} said ok`),
    'each call with its result',
  );
});

test('a thought or a quiet line between two calls rides in the fold; before the first call or after the last, it is drawn on its own', () => {
  const turns = foldTranscript([
    thought('t1', 'Where is it?'),
    quiet('s1', 'Compacted'),
    ...call('b1', 'Bash'),
    thought('t2'),
    quiet('s2', 'Hook ran'),
    ...call('b2', 'Bash'),
    thought('t3', 'Now write it up.'),
    said('a', 'Here it is.'),
  ]);
  assert.deepEqual(kinds(turns), ['thinking', 'system', 'tools', 'thinking', 'said']);
  assert.deepEqual(
    fold(turns).turns.map((t) => t.key),
    ['tool:b1', 'thinking:t2', 'system:s2', 'tool:b2'],
  );
  assert.equal(fold(turns).calls, 2, 'a thought is not a call');
});

test('a lone call is drawn as itself, not as a fold of one', () => {
  const turns = foldTranscript([
    said('a', 'One look.'),
    thought('t'),
    ...call('r', 'Read', { file_path: '/repo/a.ts' }),
    said('b', 'Seen.'),
  ]);
  assert.deepEqual(kinds(turns), ['said', 'thinking', 'tool', 'said']);
});

test('the closeout is its own turn, named, with its result — never folded, and it ends a fold as words do', () => {
  const turns = foldTranscript([
    ...call('b1', 'Bash'),
    ...call('b2', 'Bash'),
    use('c', 'StructuredOutput', { outcome: 'done', summary: 'Shipped.', needs: null, artifacts: ['RESPONSE.md'] }),
    ...call('b3', 'Bash'),
    result('c', 'Structured output provided successfully'),
  ]);
  assert.deepEqual(kinds(turns), ['tools', 'closeout', 'tool']);
  const closeout = turns[1];
  assert.ok(closeout.kind === 'closeout');
  assert.deepEqual(
    closeout.call.result,
    { text: 'Structured output provided successfully', isError: false },
    'paired by id, whatever came between',
  );
  assert.deepEqual(closeoutOf(closeout.call), {
    outcome: 'done',
    summary: 'Shipped.',
    body: null,
    needs: null,
    artifacts: ['RESPONSE.md'],
    values: [],
  });
  assert.equal(closeoutOf({ ...closeout.call, input: { verdict: 'yes' } }), null, 'a statement in another shape is not read as a closeout');
});

test('a fold counts the calls that failed and the calls still waiting on a result; a result with no call is still shown', () => {
  const turns = foldTranscript([
    result('orphan', 'from before the transcript was read'),
    ...call('b1', 'Bash', { command: 'false' }, 'exit 1', true),
    use('b2', 'Bash', { command: 'sleep 60' }),
  ]);
  const tools = fold(turns);
  assert.equal(tools.failed, 1);
  assert.equal(tools.waiting, 1);
  const orphan = tools.turns[0];
  assert.ok(orphan.kind === 'tool');
  assert.deepEqual([orphan.call.name, orphan.call.result?.text], ['unknown tool', 'from before the transcript was read']);
});

test('words: nothing said breaks no fold; a person is said by the user; a thought keeps its text, or has none', () => {
  const turns = foldTranscript([
    said('u', 'Go.', 'user'),
    ...call('b1', 'Bash'),
    said('empty', '  '),
    ...call('b2', 'Bash'),
    thought('t1', 'Hm.'),
    thought('t2', ''),
    said('a', 'Went.'),
  ]);
  assert.deepEqual(kinds(turns), ['said', 'tools', 'thinking', 'thinking', 'said']);
  assert.deepEqual(turns[0], { kind: 'said', key: 'said:u', at: turns[0].kind === 'said' ? turns[0].at : '', role: 'user', text: 'Go.' });
  assert.deepEqual(
    turns.slice(2, 4).map((t) => (t.kind === 'thinking' ? t.text : undefined)),
    ['Hm.', null],
  );
});

test('a fold keeps its key while calls are added to it, so a reader who opened it keeps it open', () => {
  const two = foldTranscript([...call('b1', 'Bash'), ...call('b2', 'Bash')]);
  const three = foldTranscript([...call('b1', 'Bash'), ...call('b2', 'Bash'), ...call('b3', 'Read')]);
  assert.equal(fold(two).key, fold(three).key);
  assert.deepEqual(
    fold(three).turns.map((t) => t.key),
    ['tool:b1', 'tool:b2', 'tool:b3'],
    'the call added rides in the same fold',
  );
});

const calls = (...named: Array<[string, unknown?]>): ToolCall[] =>
  named.map(([name, input = {}], i) => ({ id: `c${i}`, at: '', name, input, result: null }));

test("a call's detail is the one thing it was about, on one line", () => {
  const [bash, codexBash, read, fetch, change, bare] = calls(
    ['Bash', { command: 'npm test\nnpm run e2e' }],
    ['CommandExecution', { command: ['/bin/bash', '-lc', 'git diff'] }],
    ['Read', { file_path: '/repo/a.ts' }],
    ['WebFetch', { url: 'https://example.com' }],
    ['FileChange', { changes: { '/repo/a': {} } }],
    ['TodoWrite', { todos: [] }],
  );
  assert.deepEqual(
    [bash, codexBash, read, fetch, change, bare].map((c) => detailOf(c)),
    ['npm test', 'git diff', '/repo/a.ts', 'https://example.com', '/repo/a', null],
  );
});

test('merged, an event sent again is kept once where it stood — a call and its result, which share an id, are two', () => {
  const [u, c, r] = [said('u', 'Go.', 'user'), use('x', 'Bash'), result('x', 'ok')];
  const merged = mergeEvents([u, c], [c, r]);
  assert.deepEqual(
    merged.map((e) => `${e.kind} ${e.id}`),
    ['text u', 'tool_use x', 'tool_result x'],
  );
  const edited = { ...u, text: 'Go on.' };
  assert.deepEqual(
    mergeEvents(merged, [edited]).map((e) => (e.kind === 'text' ? e.text : e.kind)),
    ['Go on.', 'tool_use', 'tool_result'],
    'replaced in place',
  );
  const known = [u];
  assert.notEqual(mergeEvents(known, []), known, 'a new list each time, so React sees a change only when there is one to see');
});

test('the tail begins after the last thing said: a call in it may still be answered, one before it had its chance', () => {
  const turns = foldTranscript([
    said('u', 'Go.', 'user'),
    ...call('b1', 'Bash'),
    said('a', 'Ran it.'),
    use('b2', 'Bash'),
    use('b3', 'Bash'),
    quiet('s', 'Hook ran'),
  ]);
  assert.deepEqual(kinds(turns), ['said', 'tool', 'said', 'tools', 'system']);
  assert.equal(tailStart(turns), 3, 'the batch after the words, and the quiet line after it');
  assert.equal(tailStart(foldTranscript([use('x', 'Bash'), use('y', 'Read')])), 0, 'nothing said yet: all of it is the tail');
  assert.equal(tailStart(foldTranscript([use('b', 'Bash'), use('c', 'StructuredOutput', {})])), 2, 'after the closeout, nothing waits');
});

test('a step has a conversation to read once a session of its current task has started, on its turn or one before, and none before it or before it is filed', () => {
  const latest = { startedAt: at(), ended: null, endedAt: null, reason: null };
  const none = { count: 0, latest: null };
  assert.equal(sessionToRead({ taskId: 'run-review', attempts: { count: 1, latest }, tries: [] }), 'run-review');
  assert.equal(sessionToRead({ taskId: 'run-review', attempts: { count: 3, latest }, tries: [] }), 'run-review');
  assert.equal(sessionToRead({ taskId: 'run-review', attempts: none, tries: [{ taskId: 'run-review', attempts: none }] }), null);
  assert.equal(sessionToRead({ taskId: null, attempts: none, tries: [] }), null);
  const answered = [
    { taskId: 'run-review', attempts: { count: 1, latest } },
    { taskId: 'run-review', attempts: none },
  ];
  assert.equal(sessionToRead({ taskId: 'run-review', attempts: none, tries: answered }), 'run-review');
  const fresh = [
    { taskId: 'run-review-1', attempts: { count: 1, latest } },
    { taskId: 'run-review-2', attempts: none },
  ];
  assert.equal(sessionToRead({ taskId: 'run-review-2', attempts: none, tries: fresh }), null);
});

/** The cases every copy of the cut answers alike: the orchestrator's `closeout/envelope.test.ts` asks the same. */
const CUTS: Array<[string, string]> = [
  ['a'.repeat(119), 'a'.repeat(119)],
  ['a'.repeat(120), 'a'.repeat(120)],
  [`${'word '.repeat(24)}x`, `${'word '.repeat(22)}word…`],
  ['a'.repeat(200), `${'a'.repeat(119)}…`],
  ['\n\n  First line.  \nSecond line.', 'First line.'],
  ['', ''],
];

test("the transcript's cut of a summary answers the orchestrator's cases", () => {
  for (const [given, shown] of CUTS) assert.equal(summaryLine(given), shown, JSON.stringify(given));
});

test("a summary's line is drawn without a heading's marks, and any other line as it is", () => {
  assert.deepEqual(
    ['## What I found', '# The plan', '###### Six', '#hashtag', 'Capped the runs, ## kept', 'C# is a language'].map(summaryShown),
    ['What I found', 'The plan', 'Six', '#hashtag', 'Capped the runs, ## kept', 'C# is a language'],
  );
});

test('closeoutOf reads a v0 and a v1 statement into one shape: one line, its body, files by path and values by name', () => {
  const call = (input: Record<string, unknown>): ToolCall => ({ id: 'c', name: 'StructuredOutput', input, result: null }) as ToolCall;
  assert.deepEqual(closeoutOf(call({ outcome: 'done', summary: 'First.\n\nMore.', artifacts: ['a.md'], needs: null })), {
    outcome: 'done',
    summary: 'First.',
    body: 'First.\n\nMore.',
    needs: null,
    artifacts: ['a.md'],
    values: [],
  });
  assert.deepEqual(
    closeoutOf(
      call({
        apiVersion: 'nemia/v1',
        outcome: 'done',
        summary: 'First.',
        body: 'The rest.',
        artifacts: [{ path: 'a.md' }, { name: 'PR', value: 'https://x.test/1' }],
        needs: null,
      }),
    ),
    {
      outcome: 'done',
      summary: 'First.',
      body: 'The rest.',
      needs: null,
      artifacts: ['a.md'],
      values: [{ name: 'PR', value: 'https://x.test/1' }],
    },
  );
});

const { sessionItems, HARNESS_TOOL, THOUGHT_TOOL } = await import('../src/lib/sessionItems.ts');

type Item = import('../src/lib/conversation.ts').ConversationItem<import('../src/lib/sessionItems.ts').SessionOwn>;

/** What each item of `items` is: its kind, and for an `own` item what the step's own part draws it as. */
const shapes = (items: Item[]) => items.map((item) => (item.kind === 'own' ? `own:${item.own.what}` : item.kind));

/** The one work turn of `items`. */
const work = (items: Item[]) => items.find((item): item is Extract<Item, { kind: 'work' }> => item.kind === 'work')!;

test('the adapter maps a step’s session onto the family’s shape: its brief, its words, its work, what it was told and its closeout', () => {
  const turns = withSaid(
    foldTranscript([
      said('u', 'Implement what was asked.', 'user'),
      thought('t1', 'Where is it?'),
      said('a1', 'Looking first.'),
      ...call('b1', 'Bash', { command: 'npm test' }, 'pass 233'),
      thought('t2'),
      quiet('s1', 'Hook ran'),
      ...call('b2', 'Bash', { command: 'false' }, 'exit 1', true),
      said('a2', 'Done.'),
      quiet('s2', 'Background session idle'),
      use('c', 'StructuredOutput', { outcome: 'blocked', summary: 'Stuck.' }),
    ]),
    [{ at: new Date(clock + 1000).toISOString(), attempt: 1, text: 'Try the other file.', after: null, arrived: null }],
  );
  const items = sessionItems(turns, 'implement', false);
  assert.deepEqual(shapes(items), ['own:brief', 'work', 'said', 'work', 'said', 'note', 'own:closeout', 'own:told']);

  const [brief] = items;
  assert.ok(brief.kind === 'own' && brief.own.what === 'brief');
  assert.equal(brief.own.text, 'Implement what was asked.', 'the brief carries its words, for the line that opens to them');

  const words = items[2];
  assert.ok(words.kind === 'said');
  assert.deepEqual(
    { who: words.who, yours: words.yours, markdown: words.markdown, text: words.text },
    { who: 'implement', yours: false, markdown: true, text: 'Looking first.' },
    'the session’s own words are the agent’s side, drawn from their markdown',
  );

  const note = items[5];
  assert.ok(note.kind === 'note');
  assert.deepEqual([note.what, note.words], ['system', 'Background session idle'], 'a line the harness wrote on its own is a quiet note');

  const closeout = items[6];
  assert.ok(closeout.kind === 'own' && closeout.own.what === 'closeout');
  assert.equal(closeout.own.call.name, 'StructuredOutput');

  const told = items.at(-1)!;
  assert.ok(told.kind === 'own' && told.own.what === 'told');
  assert.deepEqual([told.own.text, told.own.attempt, told.own.arrived], ['Try the other file.', 1, null]);
});

test('a turn’s lines: a call with what it asked and what came back, a thought behind its line, and the harness’s own line', () => {
  const items = sessionItems(
    foldTranscript([
      ...call('b1', 'Bash', { command: 'npm test' }, 'pass 233'),
      thought('t1', 'It passed.'),
      thought('t2'),
      quiet('s1', 'Hook ran'),
      ...call('b2', 'Bash', { command: 'false' }, 'exit 1', true),
    ]),
    'implement',
    false,
  );
  const lines = work(items).lines;
  assert.deepEqual(
    lines.map((line) => [line.tool, line.sentence, line.state]),
    [
      ['Bash', 'Bash', 'done'],
      [THOUGHT_TOOL, 'Thought', 'done'],
      [THOUGHT_TOOL, 'Thought, with no text kept', 'done'],
      [HARNESS_TOOL, 'A line from the harness', 'done'],
      ['Bash', 'Bash', 'error'],
    ],
    'every call, thought and harness line of the fold is a line of the one turn',
  );
  assert.equal(lines[0].fact, 'npm test', 'a call says the one thing it was about beside its name');
  assert.equal(lines[0].input, JSON.stringify({ command: 'npm test' }, null, 2), 'its input indented, so a long one is more than a line');
  assert.equal(lines[0].result, 'pass 233');
  assert.equal(lines[1].result, 'It passed.', 'a thought’s words are behind its line, as a call’s result is');
  assert.equal(lines[2].result, undefined, 'and a thought the harness kept no text for opens on nothing');
  assert.equal(lines[3].result, 'Hook ran');
  assert.equal(work(items).ms > 0, true, 'the turn spans its first line to its last');
});

test('REFUSED: a call with no answer in the tail of a session that is over drawn as running, and a lone call as anything but a turn', () => {
  const turns = foldTranscript([said('a', 'Running them.'), use('b1', 'Bash', { command: 'sleep 60' })]);
  assert.deepEqual(shapes(sessionItems(turns, 'implement', true)), ['said', 'work']);
  const [live, dead] = [sessionItems(turns, 'implement', true), sessionItems(turns, 'implement', false)].map(work);
  assert.deepEqual([live.lines.length, live.lines[0].state, live.running], [1, 'running', true]);
  assert.deepEqual([dead.lines.length, dead.lines[0].state, dead.running], [1, 'pending', false]);

  const answered = sessionItems(foldTranscript([...call('b1', 'Bash'), said('a', 'Done.'), use('b2', 'Bash')]), 'implement', true);
  assert.equal(work(answered).running, false, 'a turn before the tail is folded however live the session is');
});

test('REFUSED: a StructuredOutput call between two things said folded into the work turn', () => {
  const items = sessionItems(
    foldTranscript([
      said('a1', 'Nearly there.'),
      ...call('b1', 'Bash'),
      use('c', 'StructuredOutput', { outcome: 'done', summary: 'Shipped.' }),
      ...call('b2', 'Bash'),
      said('a2', 'Signed off.'),
    ]),
    'implement',
    false,
  );
  assert.deepEqual(shapes(items), ['said', 'work', 'own:closeout', 'work', 'said']);
});
