/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX. The hooks below hand it the app's `.tsx` compiled
 * by `typescript`, the compiler the app is typechecked with, and resolve an import as vite does — no extension, and
 * `@/` for `src/`. Registered before the components are imported, so every import below is dynamic. `npm run e2e`
 * looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const SRC = path.resolve(import.meta.dirname, '..', 'src');

registerHooks({
  resolve(specifier, context, nextResolve) {
    const named = specifier.startsWith('@/') ? pathToFileURL(path.join(SRC, specifier.slice(2))).href : specifier;
    if ((named.startsWith('.') || named.startsWith('file:')) && !path.extname(named)) {
      for (const extension of ['.ts', '.tsx']) {
        try {
          return nextResolve(named + extension, context);
        } catch {
          // Not this one: the next extension, then the specifier as written, which fails with Node's own message.
        }
      }
    }
    return nextResolve(named, context);
  },
  load(url, context, nextLoad) {
    if (!url.endsWith('.tsx')) return nextLoad(url, context);
    const fileName = fileURLToPath(url);
    const { outputText } = ts.transpileModule(fs.readFileSync(fileName, 'utf8'), {
      fileName,
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
    });
    return { format: 'module', source: outputText, shortCircuit: true };
  },
});

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { StatusChip, StepNote } = await import('../src/components/StatusChip.tsx');
const { StepInspector } = await import('../src/components/StepInspector.tsx');
const { StepNode } = await import('../src/components/StepNode.tsx');
const { stepData } = await import('../src/components/stepGraph.ts');
const { ReactFlowProvider } = await import('@xyflow/react');
const { stateMeaning } = await import('../src/lib/status.ts');
type RunDetail = import('../src/lib/api.ts').RunDetail;

const exhaustedNote = 'round 3 of 3, and it asked again — once more: wf round r-1 review';

/** The one element's `title`, unescaped as a browser reads it. */
const titleOf = (html: string): string | undefined =>
  /title="([^"]*)"/.exec(html)?.[1]?.replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

test("a chip carries the step's note after what its state means, on hover — and only a note it was given", () => {
  const withNote = renderToStaticMarkup(createElement(StatusChip, { status: 'rounds exhausted', runCancelled: false, note: exhaustedNote }));
  assert.match(withNote, /data-state="exhausted"/);
  assert.equal(titleOf(withNote), `${stateMeaning.exhausted}\n${exhaustedNote}`);

  for (const note of [null, undefined, '']) {
    const without = renderToStaticMarkup(createElement(StatusChip, { status: 'rounds exhausted', runCancelled: false, note }));
    assert.equal(titleOf(without), stateMeaning.exhausted, String(note));
  }
});

test('a note under a chip is the note as `wf ls` prints it, and nothing at all for a step without one', () => {
  const html = renderToStaticMarkup(createElement(StepNote, { note: 'try 2, by retries: 1' }));
  assert.match(html, /^<p data-note="true"[^>]*>try 2, by retries: 1<\/p>$/);
  assert.equal(renderToStaticMarkup(createElement(StepNote, { note: null })), '');
});

const at = '2026-09-13T00:00:00.000Z';

/** A run of one looping step out of rounds, as GET /api/runs/:id gives it, with `note` on its step. */
function runWith(note: string | null): RunDetail {
  return {
    id: 'r-1', brief: 'Go round again', repo: '/code/app', workflowDir: '/code/app/workflow', baseRef: 'abc123', branch: 'main',
    isolate: true, createdAt: at, cancelledAt: null, status: 'failed', moving: false, waitingOnYou: ['review'], warning: null,
    steps: [{
      name: 'review', spec: null, body: 'Review it.', told: null, taskId: 't-1', workspace: null, branch: 'wf/r-1/implement',
      status: 'rounds exhausted', note, closeout: null, check: null,
      attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
    }],
  };
}

test("the inspector's Details show a step's note under its chip", () => {
  const run = runWith(exhaustedNote);
  const html = renderToStaticMarkup(createElement(StepInspector, { run, step: run.steps[0]!, onClose: () => {} }));
  const chip = html.indexOf('data-state="exhausted"');
  const note = html.indexOf(`<p data-note="true"`);
  assert.ok(chip >= 0, 'the chip is in the Details');
  assert.ok(note > chip, `the note comes after the chip: ${html}`);
  assert.ok(html.slice(note).startsWith(`<p data-note="true"`) && html.includes(`>${exhaustedNote}</p>`), html);

  const bare = runWith(null);
  assert.doesNotMatch(renderToStaticMarkup(createElement(StepInspector, { run: bare, step: bare.steps[0]!, onClose: () => {} })), /data-note/);
});

/** The run of one step, `review`, with the word and note `wf ls` gives it, and who the api says is waited on. */
function runOf(status: string, { note = null, waitingOnYou, cancelledAt = null }: { note?: string | null; waitingOnYou: string[]; cancelledAt?: string | null }): RunDetail {
  const run = runWith(note);
  return { ...run, cancelledAt, waitingOnYou, steps: [{ ...run.steps[0]!, status }] };
}

/**
 * The run's step as a canvas draws it — its node's data read off the run by `stepData`, as the run's page and the Factory
 * both read it — inside the provider its handles read. A server render of the whole canvas draws no node: React Flow puts
 * its nodes in its store in an effect.
 */
function nodeMarkup(run: RunDetail): string {
  const props = {
    id: 'review', type: 'step' as const, data: stepData(run, 0), selected: false, dragging: false, zIndex: 0,
    isConnectable: false, positionAbsoluteX: 0, positionAbsoluteY: 0, selectable: false, deletable: false, draggable: false,
  };
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(StepNode, props)));
}

const gateDrawn = (html: string) => />human gate</.test(html) || />waiting on you</.test(html) || /border-amber-500/.test(html);

test('a loop out of rounds is drawn as a human gate on the canvas, as a blocked step is — and on a cancelled run, not', () => {
  for (const status of ['rounds exhausted', 'succeeded · BLOCKED']) {
    const gate = nodeMarkup(runOf(status, { waitingOnYou: ['review'] }));
    assert.match(gate, />human gate</, status);
    assert.match(gate, />waiting on you</, status);
    assert.match(gate, /border-amber-500/, status);

    // As the api gives a cancelled run, nobody waited on; and with the step still named, which the cancellation refuses all the same.
    for (const waitingOnYou of [[], ['review']]) {
      const cancelled = nodeMarkup(runOf(status, { waitingOnYou, cancelledAt: at }));
      assert.equal(gateDrawn(cancelled), false, `${status}, on a cancelled run, waiting on [${waitingOnYou}]: ${cancelled}`);
      assert.match(cancelled, />step 01</, `${status}, on a cancelled run`);
    }
  }
  // Waiting on you too, but work to try again rather than a decision: not a gate.
  for (const status of ['unsigned', 'failed ✗ check (exit 1)']) assert.equal(gateDrawn(nodeMarkup(runOf(status, { waitingOnYou: ['review'] }))), false, status);
});

test('a step a person has sent round or asked to retry is no gate from the moment they ask: the canvas draws what the api says', () => {
  // As the api gives the two while the ask waits for a tick: the step keeps its word, with a note, and nobody is waited on.
  const asked: Array<[status: string, note: string]> = [
    ['rounds exhausted', 'round 4 asked (wf round) — the next tick files implement'],
    ['succeeded · BLOCKED', 'try 2 asked (--nudge) — the next tick files it'],
  ];
  for (const [status, note] of asked) {
    const pending = nodeMarkup(runOf(status, { note, waitingOnYou: [] }));
    assert.equal(gateDrawn(pending), false, `${status}, an ask pending: ${pending}`);
    assert.match(pending, />step 01</, `${status}, an ask pending`);
    // The same step with nothing asked yet is the gate: the one fact that differs is the api's.
    assert.equal(gateDrawn(nodeMarkup(runOf(status, { note, waitingOnYou: ['review'] }))), true, `${status}, nothing asked`);
  }
});
const { ToolCallView, ToolRun, TurnView } = await import('../src/components/conversation/Turns.tsx');
const { foldTranscript, tailStart } = await import('../src/lib/transcript.ts');
type TranscriptEvent = import('../src/lib/api.ts').TranscriptEvent;

test("a thought is drawn folded: a line that says it thought, and its text only once it is opened", () => {
  const thoughts: TranscriptEvent[] = [
    { id: 'a-1:0', at, role: 'assistant', kind: 'thinking', text: 'The word goes in a file.' },
    { id: 'a-2:0', at, role: 'assistant', kind: 'thinking' },
    { id: 'a-3:0', at, role: 'assistant', kind: 'text', text: 'Writing it.' },
  ];
  const [withText, without] = foldTranscript(thoughts).map((turn) => renderToStaticMarkup(createElement(TurnView, { turn, live: false, last: false, tail: false })));
  assert.match(withText!, /data-turn="thinking"/);
  assert.match(withText!, /aria-expanded="false"/);
  assert.match(withText!, /data-state="closed"/);
  assert.match(withText!, /<p>Thought<\/p>/);
  assert.doesNotMatch(withText!, /The word goes in a file/, 'folded: its text is not drawn until it is opened');
  assert.match(without!, /<p>Thought, with no text kept<\/p>/, 'a thought the harness kept no text for says so');
});

test('a tool call is drawn with its result: folded, how its result says it went; opened, what it was given and what came back', () => {
  const [turn] = foldTranscript([
    { id: 'toolu_bash', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'echo word > WORD.txt' } } },
    { id: 'toolu_bash', at, role: 'user', kind: 'tool_result', result: { text: 'WORD.txt: Permission denied', isError: true } },
  ]);
  assert.ok(turn?.kind === 'tool');
  // Live, and in the tail, as a call still running would be: its result says how it went, not the session.
  const folded = renderToStaticMarkup(createElement(TurnView, { turn, live: true, last: true, tail: true }));
  assert.match(folded, /data-tool-state="error"/);
  assert.match(folded, /data-tool="Bash"/);
  assert.match(folded, /echo word &gt; WORD\.txt/, 'what it ran, on its line');
  assert.doesNotMatch(folded, /Permission denied/, 'folded: the result is behind its line');

  const opened = renderToStaticMarkup(createElement(ToolCallView, { call: turn.call, running: false, defaultOpen: true }));
  assert.match(opened, /data-state="open"/);
  assert.match(opened, /command.{1,16}echo word &gt; WORD\.txt/, 'its input');
  assert.match(opened, />Error<\/h4>/);
  assert.match(opened, /WORD\.txt: Permission denied/, 'its result');

  // With no result yet: running while the session may answer it, and unanswered once it cannot.
  const call = { ...turn.call, result: null };
  assert.match(renderToStaticMarkup(createElement(ToolCallView, { call, running: true })), /data-tool-state="running"/);
  assert.match(renderToStaticMarkup(createElement(ToolCallView, { call, running: false })), /data-tool-state="no-result"/);
});

test('a StructuredOutput call is drawn as the closeout, named, with its outcome — not as a tool call', () => {
  const [turn] = foldTranscript([
    { id: 'toolu_closeout', at, role: 'assistant', kind: 'tool_use', tool: { name: 'StructuredOutput', input: { outcome: 'blocked', summary: 'WORD.txt is not writable', needs: 'A writable WORD.txt', artifacts: [] } } },
  ]);
  const html = renderToStaticMarkup(createElement(TurnView, { turn: turn!, live: false, last: true, tail: true }));
  assert.match(html, /aria-label="Closeout"/);
  assert.match(html, />Closeout<\/h3>/);
  assert.match(html, /data-outcome="blocked"/);
  assert.match(html, /A writable WORD\.txt/);
  assert.doesNotMatch(html, /data-turn="tool"/);
});

test('in a live fold with nothing said after it, every call still waiting is running — a batch is answered after all of it', () => {
  const pending: TranscriptEvent[] = [
    { id: 'u-1:0', at, role: 'user', kind: 'text', text: 'Run the checks.' },
    { id: 'toolu_test', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'npm test' } } },
    { id: 'toolu_types', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'npm run typecheck' } } },
  ];
  const turns = foldTranscript(pending);
  const fold = turns[1]!;
  assert.ok(fold.kind === 'tools');
  assert.equal(tailStart(turns), 1, 'the fold is in the tail');
  const states = (live: boolean, tail: boolean) =>
    [...renderToStaticMarkup(createElement(ToolRun, { turn: fold, live, tail, defaultOpen: true })).matchAll(/data-tool-state="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(states(true, true), ['running', 'running']);
  // And refused: once the session is not live, or has said something since, a call with no result had none.
  assert.deepEqual(states(false, true), ['no-result', 'no-result']);
  assert.deepEqual(states(true, false), ['no-result', 'no-result']);
});
