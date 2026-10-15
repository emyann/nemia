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
  summaryOf,
  tailStart,
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

test('the calls between two things said fold into one line, in the words Claude Code web uses, and open to the calls', () => {
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
  assert.equal(tools.summary, 'Ran 3 commands, searched code, read 3 files');
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
  assert.equal(fold(three).summary, 'Ran 2 commands, read a file');
});

const calls = (...named: Array<[string, unknown?]>): ToolCall[] =>
  named.map(([name, input = {}], i) => ({ id: `c${i}`, at: '', name, input, result: null }));

test('a summary counts a file once however often it was read or edited, an MCP tool by its server, and Codex by what it did', () => {
  assert.equal(summaryOf(calls(['Read', { file_path: '/a' }], ['Read', { file_path: '/a', offset: 200 }])), 'Read a file');
  assert.equal(
    summaryOf(calls(['Edit', { file_path: '/a' }], ['Write', { file_path: '/b' }], ['Edit', { file_path: '/a' }])),
    'Edited 2 files',
  );
  assert.equal(summaryOf(calls(['Glob', { pattern: '*.ts' }], ['Grep', { pattern: 'x' }])), 'Searched code 2 times');
  assert.equal(
    summaryOf(calls(['mcp__playwright__browser_navigate'], ['mcp__playwright__browser_click'], ['WebFetch'])),
    'Used playwright 2 times, fetched a page',
  );
  assert.equal(
    summaryOf(
      calls(
        ['CommandExecution', { command: ['/bin/bash', '-lc', 'npm test'] }],
        ['FileChange', { changes: { '/repo/a': {}, '/repo/b': {} } }],
      ),
    ),
    'Ran a command, edited 2 files',
  );
  assert.equal(summaryOf(calls(['Frobnicate'], ['Frobnicate'], ['Task'])), 'Used Frobnicate 2 times, ran an agent');
});

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
