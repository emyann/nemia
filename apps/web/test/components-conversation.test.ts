/**
 * The board's conversation family components (`src/components/conversation/`), rendered to markup as a server renders them: what a
 * person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './tsx.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { Worked, WorkedLine } = await import('../src/components/conversation/Worked.tsx');
const { HARNESS_TOOL, THOUGHT_TOOL } = await import('../src/lib/sessionItems.ts');
const { chatItems } = await import('../src/lib/chatFollowing.ts');
type ConversationLine = import('../src/lib/conversation.ts').ConversationLine;
type ChatEvent = import('../src/lib/api/chat.ts').ChatEvent;

/** One tool call of hers. */
const chatCall = (id: string, state: 'done' | 'running' | 'waits', second: number): Extract<ChatEvent, { kind: 'call' }> => ({
  kind: 'call',
  id,
  at: new Date(Date.UTC(2026, 9, 15, 21, 40, second)).toISOString(),
  tool: 'Read',
  sentence: 'Read the inbox',
  state,
});

/** The family's turn over `calls` of hers, through her adapter onto the one shape it draws. */
const workOf = (calls: Extract<ChatEvent, { kind: 'call' }>[]) => {
  const [item] = chatItems(calls);
  if (item.kind !== 'work') throw new Error('her consecutive calls fold into one turn of the family');
  return item;
};

test('a turn at work draws its lines, the one that waits on a person in yours; a finished turn folds and lays out nothing it holds', () => {
  const live = workOf([chatCall('t:1', 'done', 0), chatCall('t:2', 'waits', 4)]);
  const running = renderToStaticMarkup(createElement(Worked, { work: live, marks: 'chat' }));
  assert.match(running, /data-chat-turn="running"/);
  assert.match(running, /data-status="yours"[^>]*data-chat-step="waits"/, 'a call that waits on a person is the look’s own state');
  assert.match(running, /border-l-2 border-yours/);
  const over = workOf([chatCall('t:1', 'done', 0), chatCall('t:2', 'done', 134)]);
  const folded = renderToStaticMarkup(createElement(Worked, { work: over, marks: 'chat' }));
  assert.match(folded, /data-chat-turn="folded"/);
  assert.match(folded, /Worked for 2m 14s · 2 calls/);
  assert.doesNotMatch(folded, /data-chat-step=/, 'a closed fold lays out none of its calls');
});

test('REFUSED: a family part that writes one conversation’s marks: the prefix its caller names is the one it writes', () => {
  const work = workOf([chatCall('t:1', 'done', 0), chatCall('t:2', 'running', 4)]);
  const session = renderToStaticMarkup(createElement(Worked, { work, marks: 'session' }));
  assert.match(session, /data-session-turn="running"/);
  assert.match(session, /data-session-step="running"/);
  assert.doesNotMatch(session, /data-chat-/, 'and nothing of the other conversation’s names');
  const hers = renderToStaticMarkup(createElement(Worked, { work, marks: 'chat' }));
  assert.match(hers, /data-chat-turn="running"/);
  assert.doesNotMatch(hers, /data-session-/);
});

/** One line of a turn, as a conversation's adapter gives it. */
const line = (over: Partial<ConversationLine> = {}): ConversationLine => ({
  id: 'l:1',
  tool: 'Grep',
  sentence: 'Searched for drainsThis',
  fact: '3 matches',
  state: 'done',
  ...over,
});

test('a line opens to what it asked and what came back where it has either, and a line with neither has nothing to open', () => {
  const plain = renderToStaticMarkup(createElement(WorkedLine, { line: line(), marks: 'chat' }));
  assert.match(plain, /data-slot="trace-line"/);
  assert.doesNotMatch(plain, /<button/, 'a line that carries neither draws no trigger');
  assert.doesNotMatch(plain, /data-slot="trace-collapsible"/, 'and no fold');

  const both = renderToStaticMarkup(
    createElement(WorkedLine, { line: line({ input: 'rg -n drainsThis', result: 'feed.ts:88' }), marks: 'chat', open: true }),
  );
  assert.match(both, /data-slot="trace-collapsible-trigger"/, 'a line that carries either opens');
  assert.match(both, /data-chat-asked[^>]*>rg -n drainsThis</, 'what it asked');
  assert.match(both, /data-chat-came[^>]*>feed\.ts:88</, 'and what came back');
  assert.match(both, /data-kind="body"/, "in the Trace's own body");
  assert.match(both, /data-chat-asked="true"[^>]*max-h-56 overflow-y-auto/, 'each block capped, and scrolling inside itself');
  assert.match(both, /data-chat-came="true"[^>]*max-h-56 overflow-y-auto/);
  assert.doesNotMatch(both, /text-failure/, 'a call that did not fail draws no failure');

  const failed = renderToStaticMarkup(
    createElement(WorkedLine, { line: line({ state: 'error', input: 'npm run lint', result: 'exit 1' }), marks: 'chat', open: true }),
  );
  assert.match(failed, /data-chat-came="true"[^>]*text-failure/, "a result that failed is in the failure's ink");

  const asking = renderToStaticMarkup(
    createElement(WorkedLine, { line: line({ state: 'running', input: 'rg -n drainsThis' }), marks: 'chat', open: true }),
  );
  assert.match(asking, /data-chat-asked/, 'a call still at work has its input before it has a result');
  assert.doesNotMatch(asking, /data-chat-came/);

  const closed = renderToStaticMarkup(
    createElement(WorkedLine, { line: line({ input: 'rg -n drainsThis', result: 'feed.ts:88' }), marks: 'chat' }),
  );
  assert.doesNotMatch(closed, /rg -n drainsThis/, 'a closed fold lays out nothing it holds');
});

test('a line that called nothing is drawn by the name its adapter gives it: a thought thinks, a harness line informs, an unknown tool is plain', () => {
  const glyphOf = (tool: string) =>
    /lucide-([a-z-]+)"/.exec(renderToStaticMarkup(createElement(WorkedLine, { line: line({ tool }), marks: 'session' })))?.[1];
  assert.equal(glyphOf(THOUGHT_TOOL), 'brain', 'the name the step’s adapter writes on a thought is the one the family draws a brain for');
  assert.equal(glyphOf(HARNESS_TOOL), 'info', 'and the one it writes on a line of the harness, the one it draws an info for');
  assert.equal(glyphOf('Bash'), 'terminal', 'a tool the board knows draws its own');
  assert.equal(
    glyphOf('NoSuchToolOfAny'),
    'wrench',
    'and one it does not, the plain one — which is what either name renamed on one side alone would quietly become',
  );
});
