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
const { cardEdges, stepData, stepEdges } = await import('../src/components/stepGraph.ts');
const { StateEdge } = await import('../src/components/StateEdge.tsx');
const { CanvasLegend } = await import('../src/components/CanvasLegend.tsx');
const { edgeStroke, LOOP_SOURCE, LOOP_TARGET, TRAVEL_SECONDS } = await import('../src/lib/canvas.ts');
const { Chips, DecideSection, DiffFileView, GroupBar, LessonChip, TouchedBranch } = await import('../src/components/Decide.tsx');
const { ReactFlowProvider } = await import('@xyflow/react');
const { stateMeaning } = await import('../src/lib/status.ts');
type RunDetail = import('../src/lib/api.ts').RunDetail;
type GraphEdge = import('../src/lib/api.ts').GraphEdge;
type StateFlowEdge = import('../src/components/StateEdge.tsx').StateFlowEdge;
type EdgeMarker = import('@xyflow/react').EdgeMarker;

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
    graph: { roots: ['review'], edges: [] },
    steps: [{
      name: 'review', spec: null, filed: null, body: 'Review it.', told: null, taskId: 't-1', workspace: null, branch: 'wf/r-1/implement',
      status: 'rounds exhausted', note, closeout: null, check: null,
      attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
      used: { usage: null, used: 'not measured', cost: 'not measured' },
      tries: [{
        try: 1, round: 1, then: null, current: true, taskId: 't-1', note, status: 'rounds exhausted', check: null, closeout: null,
        attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
      }],
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

/**
 * A loop as the api gives it: review loops back to implement, both signed off, with the notes `wf ls` prints. Neither step
 * has a spec — as when the api could not read one — so what is drawn is the api's graph, and nothing a step's spec says.
 */
function loopRun(notes: { implement: string | null; review: string | null }): RunDetail {
  const base = runWith(null);
  const step = { ...base.steps[0]!, status: 'unverified · done', spec: null };
  return {
    ...base, status: 'running', waitingOnYou: [],
    graph: {
      roots: ['implement'],
      edges: [{ from: 'implement', to: 'review', kind: 'after' }, { from: 'review', to: 'implement', kind: 'loop', rounds: 3 }],
    },
    steps: [{ ...step, name: 'implement', note: notes.implement }, { ...step, name: 'review', note: notes.review }],
  };
}

test("the card's edge reaches only the root, and the loop's edge goes back to its target, whatever the steps' specs lack", () => {
  const run = loopRun({ implement: 'round 3 of 3', review: 'round 3 of 3, and it asked again — once more: wf round r-1 review' });

  assert.deepEqual(cardEdges(run, 'r-1', 'r-1/').map(({ id, source, target, type, data }) => ({ id, source, target, type, data })), [
    { id: 'r-1/->implement', source: 'r-1', target: 'r-1/implement', type: 'state', data: { state: 'done', loop: false } },
  ]);

  const edges = stepEdges(run, 'r-1/');
  const shape = ({ id, source, target, type, sourceHandle, targetHandle, label, data }: StateFlowEdge) => ({ id, source, target, type, sourceHandle, targetHandle, label, data });
  assert.deepEqual(edges.map(shape), [
    // An `after` edge takes each node's handle on its side: no handle named.
    { id: 'r-1/implement->review', source: 'r-1/implement', target: 'r-1/review', type: 'state', sourceHandle: undefined, targetHandle: undefined, label: undefined, data: { state: 'done', loop: false } },
    // Out of rounds, nothing is due: the edge back rests.
    { id: 'r-1/loop:review->implement', source: 'r-1/review', target: 'r-1/implement', type: 'state', sourceHandle: LOOP_SOURCE, targetHandle: LOOP_TARGET, label: 'round 3 of 3', data: { state: 'to-come', loop: true } },
  ]);

  const due = stepEdges(loopRun({ implement: null, review: 'round 2 of 3 due — review asked again, and the next tick files implement' }));
  assert.deepEqual([due[1]!.label, due[1]!.data], ['round 2 of 3', { state: 'running', loop: true }]);
  const first = stepEdges(loopRun({ implement: null, review: null }));
  assert.deepEqual([first[1]!.label, first[1]!.data], [undefined, { state: 'to-come', loop: true }]);

  // A run with no loop draws no edge back, and its card still reaches every root it has.
  const chain = { ...run, graph: { roots: ['implement', 'review'], edges: [] } };
  assert.deepEqual(stepEdges(chain), []);
  assert.deepEqual(cardEdges(chain, 'r-1', 'r-1/').map((e) => e.target), ['r-1/implement', 'r-1/review']);
});

/**
 * While `render` runs, a browser whose person has asked for reduced motion, or has not — or, for `undefined`, no browser to
 * ask: `matchMedia`, which is all `useReducedMotion` reads.
 */
function withMotion<T>(reduce: boolean | undefined, render: () => T): T {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  const matchMedia = (media: string) => ({ media, matches: reduce === true && media === '(prefers-reduced-motion: reduce)', addEventListener() {}, removeEventListener() {} });
  if (reduce === undefined) Reflect.deleteProperty(globalThis, 'matchMedia');
  else Object.defineProperty(globalThis, 'matchMedia', { value: matchMedia, configurable: true, writable: true });
  try {
    return render();
  } finally {
    if (before) Object.defineProperty(globalThis, 'matchMedia', before);
    else Reflect.deleteProperty(globalThis, 'matchMedia');
  }
}

/** Where React Flow puts an `after` edge's ends, on the nodes' sides; and a loop's, under the nodes. */
const SIDES = { sourceX: 336, sourceY: 60, targetX: 412, targetY: 60, sourcePosition: 'right', targetPosition: 'left' };
const UNDER = { sourceX: 524, sourceY: 110, targetX: 112, targetY: 110, sourcePosition: 'bottom', targetPosition: 'bottom' };

/** An edge `stepEdges` made, as React Flow hands it to `StateEdge` — its arrow a url by then — drawn inside an svg. */
function edgeMarkup(edge: StateFlowEdge): string {
  const props = { ...edge, ...(edge.data?.loop ? UNDER : SIDES), markerEnd: "url('#arrow')", deletable: false } as unknown as Parameters<typeof StateEdge>[0];
  return renderToStaticMarkup(createElement('svg', null, createElement(StateEdge, props)));
}

/** The travelling dots' `animateMotion`s in some markup, and the edge's own path. */
const travelling = (html: string): string[] => [...html.matchAll(/<animateMotion [^>]*>/g)].map((m) => m[0]);
const pathOf = (html: string): string | undefined => /<path [^>]*\bd="([^"]+)"[^>]*class="react-flow__edge-path"/.exec(html)?.[1];

const legendMarkup = (): string => renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasLegend)));

test("a loop's edge is drawn from under its looping step, dashed, into its target with the arrow and the round beside it", () => {
  const [, back] = stepEdges(loopRun({ implement: 'round 3 of 3', review: 'round 3 of 3, and it asked again — once more: wf round r-1 review' }));
  const html = withMotion(false, () => edgeMarkup(back!));
  const d = pathOf(html);
  assert.ok(d?.startsWith('M 524,110 C 524,'), html);
  assert.ok(d?.endsWith(' 112,110'), `it ends at implement, where the arrow is: ${d}`);
  assert.match(html, /marker-end="url\(&#x27;#arrow&#x27;\)"/);
  assert.match(html, /stroke:var\(--edge-loop\);stroke-width:1.5;stroke-dasharray:5 4/);
  assert.match(html, />round 3 of 3<\/text>/);
  // Out of rounds, nothing is due: it rests.
  assert.deepEqual(travelling(html), []);

  // On each node, the handles under it come after the ones on its sides, which an edge naming no handle takes.
  const node = nodeMarkup(runOf('unverified · done', { waitingOnYou: [] }));
  const handles = [...node.matchAll(/<div (?:data-handleid="([^"]*)" )?data-handlepos="(\w+)"[^>]*class="[^"]*\b(source|target)\b/g)].map((m) => [m[3], m[2], m[1] ?? null]);
  assert.deepEqual(handles, [['target', 'left', null], ['source', 'right', null], ['source', 'bottom', LOOP_SOURCE], ['target', 'bottom', LOOP_TARGET]], node);
});

/** A run of steps, each its name, the word `wf ls` gives it, and the step it comes after, if any: the roots are the rest. */
function runOfSteps(steps: Array<[name: string, status: string, after?: string]>): RunDetail {
  const base = runWith(null);
  const edges = steps.flatMap(([name, , from]): GraphEdge[] => (from ? [{ from, to: name, kind: 'after' }] : []));
  return {
    ...base, status: 'running', waitingOnYou: [],
    graph: { roots: steps.filter(([, , from]) => !from).map(([name]) => name), edges },
    steps: steps.map(([name, status]) => ({ ...base.steps[0]!, name, status, note: null })),
  };
}

test('a running edge carries a dot travelling its own path; an edge done, to come, into a human gate or into a refused check does not', () => {
  const run = runOfSteps([
    ['implement', 'verified ✓'],
    ['review', 'running (working)', 'implement'],
    ['respond', 'waiting', 'review'],
    ['tokens', 'unverified · done'],
    ['theme', 'checking', 'tokens'],
    ['docs', 'unverified · done', 'implement'],
    ['gate', 'succeeded · BLOCKED', 'implement'],
    ['lint', 'failed ✗ check (exit 1)', 'tokens'],
    ['ask', 'needs-human', 'tokens'],
    ['draft', 'running (working)'],
  ]);
  const drawn = [...stepEdges(run), ...cardEdges(run, 'r-1', 'r-1/')];
  const html = new Map(drawn.map((edge) => [edge.id, withMotion(false, () => edgeMarkup(edge))]));
  const moving = ['implement->review', 'tokens->theme', 'r-1/->draft'];
  assert.deepEqual([...html].filter(([, markup]) => travelling(markup).length > 0).map(([id]) => id), moving, 'into a step at work or at its check, from a step or a card');

  for (const id of moving) {
    const markup = html.get(id)!;
    const motions = travelling(markup);
    assert.equal(motions.length, 1, `one dot on ${id}: ${markup}`);
    assert.ok(motions[0]!.includes(` path="${pathOf(markup)}"`), `along the edge's own path: ${markup}`);
    assert.ok(motions[0]!.includes(` dur="${TRAVEL_SECONDS}s"`) && motions[0]!.includes(' repeatCount="indefinite"'), motions[0]);
    assert.match(markup, /<circle [^>]*fill="var\(--edge-running\)"/, 'the dot in the running colour');
    assert.match(markup, /stroke:var\(--edge-running\);stroke-width:2"/, 'on a solid line in the running colour');
    assert.match(markup, /data-state="running"/);
  }
  // Done: solid. To come — not filed, a human gate, a refused check, a step asking a person — dashed.
  assert.match(html.get('implement->docs')!, /stroke:var\(--edge-done\);stroke-width:1.5"/);
  for (const id of ['review->respond', 'implement->gate', 'tokens->lint', 'tokens->ask']) {
    assert.match(html.get(id)!, /stroke:var\(--edge-to-come\);stroke-width:1.5;stroke-dasharray:5 4/, id);
  }
  for (const edge of drawn) {
    assert.equal((edge.markerEnd as EdgeMarker).color, edgeStroke(edge.data!.state, edge.data!.loop), `an arrow on ${edge.id}, in its colour`);
    // The travelling dot is the one animation: never React Flow's dash march as well.
    assert.equal(edge.animated, undefined, edge.id);
  }
});

test("a loop's edge back moves as a running edge does while its round is due, along its curve and keeping its round", () => {
  const [, due] = stepEdges(loopRun({ implement: 'round 2 of 3', review: 'round 2 of 3 due — review asked again, and the next tick files implement' }));
  const html = withMotion(false, () => edgeMarkup(due!));
  const d = pathOf(html);
  assert.ok(d?.startsWith('M 524,110 C 524,'), `still from under the looping step: ${d}`);
  assert.equal(travelling(html).length, 1, html);
  assert.ok(travelling(html)[0]!.includes(` path="${d}"`), 'along its curve');
  assert.match(html, /stroke:var\(--edge-running\);stroke-width:2;stroke-dasharray:5 4/);
  assert.match(html, />round 2 of 3<\/text>/);
  assert.ok(html.indexOf('<animateMotion') < html.indexOf('>round 2 of 3</text>'), 'the dot passes under the round, not over it');
});

test('where the person asked for reduced motion nothing travels — on a running edge, a loop whose round is due, or the legend — and colour and arrow still say it', () => {
  const [running] = stepEdges(runOfSteps([['implement', 'verified ✓'], ['review', 'running (working)', 'implement']]));
  const [, due] = stepEdges(loopRun({ implement: 'round 2 of 3', review: 'round 2 of 3 due — review asked again, and the next tick files implement' }));
  assert.equal((running!.markerEnd as EdgeMarker).color, 'var(--edge-running)');

  // Asked for; and a server, with no browser to ask, which sets nothing moving either.
  for (const reduce of [true, undefined]) {
    const edge = withMotion(reduce, () => edgeMarkup(running!));
    assert.deepEqual(travelling(edge), [], `a running edge, reduce: ${reduce}`);
    assert.match(edge, /data-state="running"/);
    assert.match(edge, /stroke:var\(--edge-running\);stroke-width:2"/, 'told apart by its colour');
    assert.match(edge, /marker-end="url\(&#x27;#arrow&#x27;\)"/, 'and its arrow');
    assert.doesNotMatch(edge, /<circle/, 'no shape waiting to travel');
    const loop = withMotion(reduce, () => edgeMarkup(due!));
    assert.deepEqual(travelling(loop), [], `a loop whose round is due, reduce: ${reduce}`);
    assert.match(loop, />round 2 of 3<\/text>/);
    assert.deepEqual(travelling(withMotion(reduce, legendMarkup)), [], `the legend, reduce: ${reduce}`);
  }
  // Where the person has not asked, the same edge and the legend's running sample move.
  assert.equal(travelling(withMotion(false, () => edgeMarkup(running!))).length, 1);
  assert.equal(travelling(withMotion(false, legendMarkup)).length, 1);
});

test('the legend draws an edge in each state as the canvas draws it: dashed and still, moving, solid, and looping back', () => {
  const html = withMotion(false, legendMarkup);
  const items = new Map(
    html.split('<span class="flex items-center gap-1">').slice(1).map((item) => [/([a-z ]+)<\/span>(?:<\/div>)?$/.exec(item)?.[1], item]),
  );
  assert.deepEqual([...items.keys()], ['to come', 'running', 'done', 'loops back', 'human gate']);
  assert.match(items.get('to come')!, /stroke:var\(--edge-to-come\);stroke-width:1.5;stroke-dasharray:5 4/);
  assert.match(items.get('running')!, /stroke:var\(--edge-running\);stroke-width:2"/);
  assert.match(items.get('done')!, /stroke:var\(--edge-done\);stroke-width:1.5"/);
  assert.match(items.get('loops back')!, /stroke:var\(--edge-loop\);stroke-width:1.5;stroke-dasharray:5 4/);
  for (const [label, item] of items) assert.equal(travelling(item).length, label === 'running' ? 1 : 0, `${label} moves only if it is the running sample`);
});

test("the inspector's Details show `loop` and `rounds` beside `after` on a looping step, and not on another", () => {
  const run = runWith(null);
  const spec = { harness: 'codex', model: null, effort: null, after: ['implement'], resume: null, permissionMode: null, tools: null, deadlineSeconds: null, maxAttempts: null, loop: 'implement', rounds: 3 };
  const looping = { ...run.steps[0]!, spec };
  const html = renderToStaticMarkup(createElement(StepInspector, { run, step: looping, onClose: () => {} }));
  const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], m[2]!.replace(/<[^>]+>/g, '')]);
  const at = (label: string) => labels.findIndex(([l]) => l === label);
  assert.deepEqual(labels.slice(at('after'), at('after') + 4), [['after', 'implement'], ['loop', 'implement'], ['rounds', '3'], ['resume', '—']], html);

  const plain = { ...looping, spec: { ...spec, loop: null, rounds: null } };
  const without = renderToStaticMarkup(createElement(StepInspector, { run, step: plain, onClose: () => {} }));
  assert.doesNotMatch(without, />loop<\/dt>|>rounds<\/dt>/);
  assert.match(without, />after<\/dt>/);
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

type WorkflowStepSpec = import('../src/lib/api.ts').WorkflowStepSpec;

/** A step of a workflow no run has started, as the Workflows page draws it: in the step node's spec mode. */
async function specMarkup(spec: WorkflowStepSpec): Promise<string> {
  const { SpecNode } = await import('../src/components/StepNode.tsx');
  const props = {
    id: 'review', type: 'spec' as const, data: { name: 'review', index: 1, spec }, selected: false, dragging: false, zIndex: 0,
    isConnectable: false, positionAbsoluteX: 0, positionAbsoluteY: 0, selectable: false, deletable: false, draggable: false,
  };
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(SpecNode, props)));
}

const unset: WorkflowStepSpec = {
  harness: null, model: null, effort: null, after: [], resume: null, input: [], permissionMode: null, tools: null,
  deadlineSeconds: null, maxAttempts: null, check: null, retries: null, output: null, loop: null, rounds: null,
};

const unescaped = (text: string) => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

test("a workflow's step is drawn in the spec mode: what it runs on, its check, tools, mode and loop — and no status chip, no attempt", async () => {
  const html = await specMarkup({
    ...unset, harness: 'claude', model: 'opus', after: ['implement'], tools: ['Read', 'Grep', 'Glob', 'Bash'], permissionMode: 'dontAsk',
    check: 'npm test && npm run typecheck', output: 'review.schema.json', loop: 'implement', rounds: 3,
  });
  assert.match(html, />step 02</);
  assert.match(html, /title="review">review</);
  assert.match(html, />claude · opus</);
  const lines = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], unescaped(m[2]!)]);
  assert.deepEqual(lines, [
    ['check', 'npm test && npm run typecheck'],
    ['tools', 'Read, Grep, Glob, Bash'],
    ['mode', 'dontAsk'],
    ['loop', 'implement · 3 rounds'],
  ], html);

  // Nothing has happened to it: no chip, no attempt, no gate, no spinner — none of what a run's step shows below its head.
  assert.doesNotMatch(html, /data-state=/, html);
  assert.doesNotMatch(html, /no attempt yet|>#\d/, html);
  assert.equal(gateDrawn(html), false, html);
  assert.doesNotMatch(html, /running now/, html);

  // Its handles are a run's step's, in the same order, so an edge meets it where it meets a run's step.
  const handles = [...html.matchAll(/<div (?:data-handleid="([^"]*)" )?data-handlepos="(\w+)"[^>]*class="[^"]*\b(source|target)\b/g)].map((m) => [m[3], m[2], m[1] ?? null]);
  assert.deepEqual(handles, [['target', 'left', null], ['source', 'right', null], ['source', 'bottom', LOOP_SOURCE], ['target', 'bottom', LOOP_TARGET]], html);
});

test('a step that sets nothing is drawn on the defaults, with no lines under its head', async () => {
  const html = await specMarkup(unset);
  assert.match(html, />default harness · default model</);
  assert.doesNotMatch(html, /<dl/, html);
  assert.doesNotMatch(html, /data-state=/, html);

  const { specLines } = await import('../src/components/StepNode.tsx');
  assert.deepEqual(specLines({ ...unset, loop: 'implement', rounds: 1 }), [['loop', 'implement · 1 round']]);
});
// ─── the decision ────────────────────────────────────────────────────────────

/** Each bar's added and removed widths, in the order the bars are drawn. */
const barsOf = (html: string): Array<[number, number]> =>
  [...html.matchAll(/<span data-added="true"[^>]*style="width:([\d.]+)%"[^>]*><\/span><span data-removed="true"[^>]*style="width:([\d.]+)%"/g)].map((m) => [Number(m[1]), Number(m[2])]);

const group = (name: string, files: number, added: number, removed: number, binary = 0) => ({ name, files, added, removed, binary });

/** A branch that touched a package and a test in it, the root's CLAUDE.md and package.json, and a binary logo. */
function radiusWith(lists: { agentFacing?: string[]; checkAffecting?: string[] } = {}) {
  return {
    changes: [
      { path: 'CLAUDE.md', added: 2, removed: 0 },
      { path: 'logo.png', added: null, removed: null },
      { path: 'packages/x/test/add.test.ts', added: 450, removed: 0 },
    ],
    groups: [group('(root)', 2, 2, 0, 1), group('assets', 1, 0, 0, 1), group('packages/x', 2, 453, 1)],
    agentFacing: lists.agentFacing ?? [],
    checkAffecting: lists.checkAffecting ?? [],
    lessons: [],
  };
}

test("each group's bar is its share of the most lines a group changed: the largest fills the track, a binary-only group draws none", () => {
  assert.deepEqual(barsOf(renderToStaticMarkup(createElement(GroupBar, { group: { added: 30, removed: 10 }, most: 80 }))), [[37.5, 12.5]]);

  const html = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/r-1/implement', radius: radiusWith() } }));
  // (root) +2 −0, assets binary only, packages/x +453 −1 — which is the most, and fills the track.
  assert.deepEqual(barsOf(html), [[0.44, 0], [0, 0], [99.78, 0.22]]);
  assert.match(html, /data-group="packages\/x"[\s\S]*?>2 files<[\s\S]*?>\+453<\/span> <span[^>]*>−1<\/span>/);
  assert.match(html, /data-group="assets"[\s\S]*?>binary<\/span>/);
  assert.match(html, /data-group="\(root\)"[\s\S]*?>−0<\/span><span[^>]*> · 1 binary<\/span>/);
});

test('the agent-facing chips are amber and the check-affecting ones outlined red, each titled with why — and neither is drawn when there are none', () => {
  const both = renderToStaticMarkup(createElement(Chips, { agentFacing: ['CLAUDE.md'], checkAffecting: ['package.json', 'packages/x/test/add.test.ts'] }));
  const chips = [...both.matchAll(/<span data-chip="([^"]+)" title="([^"]+)" class="([^"]+)">([^<]+)<\/span>/g)].map((m) => ({ kind: m[1], title: m[2], cls: m[3], file: m[4] }));
  assert.deepEqual(chips.map(({ kind, title, file }) => [kind, title, file]), [
    ['agent-facing', 'the next agent reads this', 'CLAUDE.md'],
    ['check-affecting', 'could make its check pass', 'package.json'],
    ['check-affecting', 'could make its check pass', 'packages/x/test/add.test.ts'],
  ]);
  assert.match(chips[0]!.cls, /\bbg-amber-100\b/);
  for (const chip of chips.slice(1)) {
    assert.match(chip.cls, /\bring-red-400\b/);
    assert.doesNotMatch(chip.cls, /\bbg-/, 'an outline, not a fill');
  }

  assert.equal(renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: [] })), '');
  const onlyCheck = renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: ['package.json'] }));
  assert.doesNotMatch(onlyCheck, /agent-facing/);
  assert.match(onlyCheck, /data-chip="check-affecting"/);
  // On a branch with neither, the branch's rows are drawn and no chip is.
  const plain = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/r-1/implement', radius: radiusWith() } }));
  assert.doesNotMatch(plain, /data-chip|agent-facing|check-affecting/);
  // A branch git could not read says so, and draws no row.
  const unread = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/gone', radius: { error: 'git could not diff abc...wf/gone' } } }));
  assert.match(unread, />not read: git could not diff abc\.\.\.wf\/gone</);
  assert.doesNotMatch(unread, /data-bar|data-group/);
});

test('the lesson chip is green with what was written, amber when nothing was, and dashed when a branch could not be read', () => {
  const chip = (lesson: { said: string; state: 'written' | 'nothing' | 'unknown' }) => {
    const m = /<span data-lesson="(\w+)" title="[^"]*" class="([^"]+)">([^<]+)<\/span>/.exec(renderToStaticMarkup(createElement(LessonChip, { lesson })));
    assert.ok(m, lesson.state);
    return { state: m[1], cls: m[2]!, text: m[3] };
  };
  const written = chip({ said: 'CLAUDE.md +2 −0', state: 'written' });
  assert.deepEqual([written.state, written.text], ['written', 'lesson · CLAUDE.md +2 −0']);
  assert.match(written.cls, /\bbg-emerald-100\b/);
  assert.doesNotMatch(written.cls, /amber/);

  const nothing = chip({ said: 'nothing written where the next agent reads', state: 'nothing' });
  assert.deepEqual([nothing.state, nothing.text], ['nothing', 'nothing written where the next agent reads']);
  assert.match(nothing.cls, /\bbg-amber-100\b/);
  assert.doesNotMatch(nothing.cls, /emerald/);

  const unknown = chip({ said: 'not known — wf/gone could not be read', state: 'unknown' });
  assert.equal(unknown.text, 'lesson not known — wf/gone could not be read');
  assert.match(unknown.cls, /\bborder-dashed\b/);
  assert.doesNotMatch(unknown.cls, /emerald|amber/);
});

test('a diff is folded under its file, coloured by line, and a capped one says how many more lines `wf decide` prints', () => {
  const lines = ['diff --git a/package.json b/package.json', '--- a/package.json', '+++ b/package.json', '@@ -1 +1 @@', '-{"a":1}', '+{"a":2}', ' }'];
  const capped = renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 26 }, counts: { added: 1, removed: 1 } }));
  assert.match(capped, /^<details data-diff="package\.json"/, 'collapsed: a details element with no open attribute');
  assert.doesNotMatch(capped, /<details[^>]*\bopen\b/);
  assert.match(capped, /<summary[^>]*>.*package\.json.*\+1<\/span> <span[^>]*>−1<\/span>/);
  assert.deepEqual([...capped.matchAll(/data-line="(\w+)"/g)].map((m) => m[1]), ['meta', 'meta', 'meta', 'hunk', 'removed', 'added', 'context']);
  assert.match(capped, /<p data-cut="26"[^>]*>26 more lines — <code>wf decide<\/code> prints all<\/p>/);

  const whole = renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 0 } }));
  assert.doesNotMatch(whole, /data-cut|more line/);
  assert.match(renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 1 } })), />1 more line — <code>/);
});

test('the Decide section copies its commands and runs none: a button per command, and each only copies', () => {
  const commands = [
    { label: 'once more', command: 'wf retry r-1 implement', said: 'implement: succeeded · BLOCKED. Continue its session, told what happened:  wf retry r-1 implement  (--fresh, or --model <m>, for a new session)' },
    { label: 'ship it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null },
    { label: 'drop it', command: 'git -C /code/app branch -D wf/r-1/implement', said: null },
  ] as const;
  const decision = {
    touched: [{ branch: 'wf/r-1/implement', radius: radiusWith({ agentFacing: ['CLAUDE.md'] }) }],
    lesson: { said: 'CLAUDE.md +2 −0', state: 'written' as const },
    sensitive: [{ branch: 'wf/r-1/implement', files: [{ path: 'packages/x/test/add.test.ts', lines: ['@@ -1 +1,451 @@'], cut: 3 }], error: null }],
    used: {},
    total: { usage: { toolCalls: 34 }, used: 'turns not measured · 34 tool calls · tokens in not measured · tokens out not measured', cost: 'not measured' },
    commands: [...commands],
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(html, /^<section aria-label="Decide"/);
  const buttons = [...html.matchAll(/<button [^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, commands.length, html);
  for (const [i, button] of buttons.entries()) {
    assert.match(button, /\bdata-copy="true"/);
    assert.ok(button.includes(`aria-label="Copy: ${commands[i]!.command}"`), button);
  }
  for (const { command } of commands) assert.ok(html.includes(`>${command}</code>`), command);
  // The once-more line's words, without the command it is followed by on the line below.
  assert.match(html, />implement: succeeded · BLOCKED\. Continue its session, told what happened {2}\(--fresh, or --model &lt;m&gt;, for a new session\)</);
  // The run's total, in `wf decide`'s words: never a 0 for what nobody measured.
  assert.match(html, /<dt[^>]*>used<\/dt><dd[^>]*>turns not measured · 34 tool calls/);
  assert.match(html, /<dt[^>]*>cost<\/dt><dd[^>]*>not measured<\/dd>/);
  // The capped file, and the file's lines off the branch's radius in its summary.
  assert.match(html, /data-diff="packages\/x\/test\/add\.test\.ts"[\s\S]*?\+450<\/span> <span[^>]*>−0<\/span>[\s\S]*?3 more lines/);
});

test("the inspector's Details say what a step used and what it cost beside its attempts — `not measured`, never 0", () => {
  const run = runWith(null);
  const rows = (step: RunDetail['steps'][number]) =>
    [...renderToStaticMarkup(createElement(StepInspector, { run, step, onClose: () => {} })).matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)]
      .map((m) => [m[1], m[2]!.replace(/<[^>]+>/g, '')]);
  const labels = rows(run.steps[0]!);
  const at = (label: string) => labels.findIndex(([l]) => l === label);
  assert.deepEqual(labels.slice(at('latest took'), at('latest took') + 3).map(([l, v]) => [l, l === 'latest took' ? '…' : v]), [['latest took', '…'], ['used', 'not measured'], ['cost', 'not measured']]);

  const measured = { ...run.steps[0]!, used: { usage: { turns: 12, costUsd: 0.004 }, used: '12 turns · tool calls not measured · tokens in not measured · tokens out not measured', cost: '$0.004' } };
  const said = Object.fromEntries(rows(measured));
  assert.deepEqual([said.used, said.cost], ['12 turns · tool calls not measured · tokens in not measured · tokens out not measured', '$0.004']);
  // A step not filed consumed nothing: a dash, not a count.
  const unfiled = Object.fromEntries(rows({ ...run.steps[0]!, taskId: null, used: null }));
  assert.deepEqual([unfiled.used, unfiled.cost], ['—', '—']);
});

// ─── what each round did, what a step runs with, and its files ──────────────

const { Artifacts, TryCloseouts } = await import('../src/components/Closeout.tsx');
const { Facts, specRows } = await import('../src/components/Facts.tsx');
type StepTry = import('../src/lib/api.ts').StepTry;
type StepCloseout = import('../src/lib/api.ts').StepCloseout;
type StepSpec = import('../src/lib/api.ts').StepSpec;
type StepFiled = import('../src/lib/api.ts').StepFiled;

/** A markup's text, tags taken for separators: each run of text between two tags, trimmed, and none of the empty ones. */
const textsOf = (html: string): string[] => html.split(/<[^>]+>/).map((text) => unescaped(text).trim()).filter(Boolean);

const tookAt = '2026-09-13T00:12:30.000Z';
const ranOnce = { count: 1, latest: { startedAt: at, ended: 'done', endedAt: tookAt, reason: 'harness' } };
const closeoutSaying = (summary: string, more: Partial<StepCloseout> = {}): StepCloseout => ({
  outcome: 'done', summary, needs: null, artifacts: [], output: {}, missing: [], replies: null, ...more,
});

/** implement on its third try, as the api gives it: refused by its check on the first, tried again by `retries:`, then sent round by review's loop. */
const threeTries: StepTry[] = [
  {
    try: 1, round: 1, then: 'retries', current: false, taskId: 'r-1-implement', note: null, status: 'succeeded', attempts: ranOnce,
    check: { command: 'npm test', taskId: 'r-1-implement-check', verdict: 'exit 1', refused: { exit: 'exit 1', stdout: null, stderr: { lines: [], truncated: false }, unreadable: null } },
    closeout: closeoutSaying('Added the cache.'),
  },
  {
    try: 2, round: 1, then: 'round', current: false, taskId: 'r-1-implement-try2', note: 'try 2, by retries: 1', status: 'succeeded', attempts: ranOnce,
    check: { command: 'npm test', taskId: 'r-1-implement-try2-check', verdict: 'passed', refused: null },
    closeout: closeoutSaying('Fixed the failing test.'),
  },
  {
    try: 3, round: 2, then: null, current: true, taskId: 'r-1-implement-try3', note: 'round 2 of 3', status: 'running (working)',
    attempts: { count: 2, latest: { startedAt: tookAt, ended: null, endedAt: null, reason: null } },
    check: { command: 'npm test', taskId: null, verdict: null, refused: null },
    closeout: null,
  },
];

test("the inspector's Details list a step's rounds, a row a try: its round and how it was reached, its task, attempts and verdict, and a link that selects it", () => {
  const run = runWith('round 2 of 3');
  const step = { ...run.steps[0]!, name: 'implement', status: 'running (working)', attempts: threeTries[2]!.attempts, tries: threeTries };
  const html = renderToStaticMarkup(createElement(StepInspector, { run, step, onClose: () => {} }));
  const section = /<section aria-label="Rounds"[\s\S]*?<\/section>/.exec(html)?.[0];
  assert.ok(section, `a Rounds section: ${html}`);
  const rows = [...section.matchAll(/<li data-try="(\d+)"([^>]*)>([\s\S]*?)<\/li>/g)].map((m) => [m[1], /aria-current="true"/.test(m[2]!), textsOf(m[3]!)]);
  assert.deepEqual(rows, [
    ['1', false, ['round 1 · try 1', 'closeout', 'r-1-implement', '#1 · 12m 30s', 'check', 'exit 1']],
    ['2', false, ['round 1 · try 2 (retries)', 'closeout', 'r-1-implement-try2', '#1 · 12m 30s', 'check', 'passed']],
    // The current try, selected until another is: filed, its attempt still running, its check not filed yet.
    ['3', true, ['round 2 · try 3 (round)', '· current', 'closeout', 'r-1-implement-try3', '#2 · running', 'check', 'not filed']],
  ]);
  assert.deepEqual(
    [...section.matchAll(/<button type="button" aria-label="([^"]+)"/g)].map((m) => m[1]),
    ['Show the closeout of round 1 · try 1', 'Show the closeout of round 1 · try 2 (retries)', 'Show the closeout of round 2 · try 3 (round)'],
  );
  // The attempts above it are the current try's, and say which try that is.
  const facts = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], textsOf(m[2]!).join(' ')]);
  assert.deepEqual(facts.slice(0, 2), [['try', 'round 2 · try 3 (round)'], ['attempts', '2']]);

  // One try: no Rounds, and no `try` above the attempts.
  const once = renderToStaticMarkup(createElement(StepInspector, { run, step: run.steps[0]!, onClose: () => {} }));
  assert.doesNotMatch(once, /aria-label="Rounds"|>try<\/dt>/);
  assert.match(once, />attempts<\/dt>/);
});

test("the Output tab shows the selected try's closeout — its declared output, and its replies as `finding → answer (why)` — and every other try's folded beneath it", () => {
  const replies = [
    { finding: 'src/cache.ts:12 — the cache never expires', answer: 'fixed', why: 'Entries expire after the TTL now.' },
    { finding: 'src/cache.ts:40 — a miss is counted twice', answer: "won't fix", why: 'Once per layer, on purpose.' },
  ];
  const tries = threeTries.map((t) => (t.current ? { ...t, closeout: closeoutSaying('Answered the review.', { replies, output: { again: false, risk: 'low' }, missing: ['notes'] }) } : t));
  const html = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[2]!, none: 'No closeout yet.' }));
  assert.deepEqual(textsOf(/<p data-shown-try="3"[^>]*>[\s\S]*?<\/p>/.exec(html)![0]), ['round 2 · try 3 (round) · current']);
  assert.deepEqual([...html.matchAll(/<li data-answer="[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textsOf(m[1]!).join(' ')), [
    'src/cache.ts:12 — the cache never expires → fixed (Entries expire after the TTL now.)',
    "src/cache.ts:40 — a miss is counted twice → won't fix (Once per layer, on purpose.)",
  ]);
  const declared = /<section aria-label="Declared output"[\s\S]*?<\/section>/.exec(html)![0];
  assert.deepEqual([...declared.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], textsOf(m[2]!).join(' ')]), [['again', 'false'], ['risk', 'low']]);
  assert.match(declared, />declared and not given: notes</);

  // The others, latest first, each folded: its summary is inside its fold, and the fold is closed.
  const folds = (markup: string) => [...markup.matchAll(/<details data-try="(\d+)"([^>]*)><summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => [m[1], /\bopen\b/.test(m[2]!), textsOf(m[3]!).join('')]);
  assert.deepEqual(folds(html), [['2', false, 'round 1 · try 2 (retries) — done'], ['1', false, 'round 1 · try 1 — done']]);
  assert.ok(html.indexOf('Fixed the failing test.') > html.indexOf('<details data-try="2"'), 'an earlier summary is in its fold');
  assert.ok(html.indexOf('Answered the review.') < html.indexOf('<details'), "the selected try's summary is above the folds");

  // An earlier try selected: its closeout on top, and the current one folded with the rest.
  const earlier = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[0]!, none: 'No closeout yet.' }));
  assert.deepEqual(textsOf(/<p data-shown-try="1"[^>]*>[\s\S]*?<\/p>/.exec(earlier)![0]), ['round 1 · try 1']);
  assert.deepEqual(folds(earlier), [['3', false, 'round 2 · try 3 (round) · current — done'], ['2', false, 'round 1 · try 2 (retries) — done']]);
  assert.ok(earlier.indexOf('Added the cache.') < earlier.indexOf('<details'), earlier);

  // A try that gave none says what it was told to, and a step on its first try has no folds and no label.
  const none = renderToStaticMarkup(createElement(TryCloseouts, { tries: threeTries, selected: threeTries[2]!, none: 'No closeout yet.' }));
  assert.match(none, /<p class="text-neutral-500">No closeout yet\.<\/p>/);
  const first = renderToStaticMarkup(createElement(TryCloseouts, { tries: [tries[2]!], selected: tries[2]!, none: 'No closeout yet.' }));
  assert.doesNotMatch(first, /<details|data-shown-try/);
});

test("a closeout's image is drawn inline, its name its alt, opening full-size in a new tab; a text file is a link, anything else a link with its size, and a bare path the path", () => {
  const url = (name: string) => `/api/runs/r-1/steps/shoot/artifacts/${name}`;
  const dir = '/wf/runs/r-1/artifacts/shoot';
  const html = renderToStaticMarkup(createElement(Artifacts, {
    artifacts: [
      { path: `${dir}/shot.png`, name: 'shot.png', url: url('shot.png'), kind: 'image', size: 48_213 },
      { path: `${dir}/notes.txt`, name: 'notes.txt', url: url('notes.txt'), kind: 'text', size: 13 },
      { path: `${dir}/trace.zip`, name: 'trace.zip', url: url('trace.zip'), kind: 'other', size: 2_400_000 },
      { path: 'RESPONSE.md' },
    ],
  }));
  const [image, text, other, bare] = html.split('<li ').slice(1);
  assert.match(image!, /data-artifact="image"/);
  assert.ok(image!.includes(`<a href="${url('shot.png')}" target="_blank" rel="noreferrer"`), image);
  assert.match(image!, /<a [^>]*><img src="\/api\/runs\/r-1\/steps\/shoot\/artifacts\/shot\.png" alt="shot\.png"/, 'the image inside the link that opens it');
  assert.match(image!, />shot\.png · 47\.1 KB<\/figcaption>/);
  assert.ok(text!.includes(`<a href="${url('notes.txt')}" target="_blank" rel="noreferrer"`), text);
  assert.match(text!, />notes\.txt<\/a><\/span>/, 'a link, and nothing after it');
  assert.match(other!, />trace\.zip<\/a><span[^>]*> · 2\.3 MB<\/span>/);
  assert.match(bare!, /data-artifact="path"[^>]*>RESPONSE\.md<\/span>/);
  assert.doesNotMatch(bare!, /<a /);
  assert.equal(html.match(/<img /g)?.length, 1, 'only the image is drawn');
  assert.match(renderToStaticMarkup(createElement(Artifacts, { artifacts: [] })), />none named</);
});

test("the spec says what a step runs with: the workflow's word where it sets one, the engine's marked `default` where it does not, and a dash for a step not filed", () => {
  const rowsOf = (spec: StepSpec, filed: StepFiled | null) => Object.fromEntries(
    [...renderToStaticMarkup(createElement(Facts, { rows: specRows(spec, filed) })).matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)]
      .map((m) => [m[1], textsOf(m[2]!).join(' ')]),
  );
  const ranWith = (rows: Record<string, string>) => [rows.model, rows.effort, rows['permission mode'], rows.tools, rows.deadline, rows['max attempts']];
  const unset: StepSpec = { harness: 'claude', model: null, effort: null, after: [], resume: null, permissionMode: null, tools: null, deadlineSeconds: null, maxAttempts: null, loop: null, rounds: null };

  // Filed as a step that sets none of them is: one attempt, the engine's default, and nothing else said.
  const bare: StepFiled = { model: null, effort: null, permissionMode: null, tools: null, deadlineSeconds: null, maxAttempts: 1 };
  assert.deepEqual(ranWith(rowsOf(unset, bare)), ["harness's own · default", "harness's own · default", "harness's own · default", "harness's own · default", 'no limit · default', '1 · default']);
  const given: StepFiled = { model: 'opus', effort: 'high', permissionMode: 'auto', tools: ['Read', 'Grep'], deadlineSeconds: 3600, maxAttempts: 3 };
  assert.deepEqual(ranWith(rowsOf(unset, given)), ['opus · default', 'high · default', 'auto · default', 'Read, Grep · default', '3600 s · default', '3 · default']);

  // The workflow's words, unmarked; and a try filed on another model than the workflow's says so.
  const set: StepSpec = { ...unset, model: 'opus', effort: 'high', permissionMode: 'dontAsk', tools: [], deadlineSeconds: 600, maxAttempts: 2 };
  const asSet: StepFiled = { model: 'opus', effort: 'high', permissionMode: 'dontAsk', tools: [], deadlineSeconds: 600, maxAttempts: 2 };
  assert.deepEqual(ranWith(rowsOf(set, asSet)), ['opus', 'high', 'dontAsk', 'none', '600 s', '2']);
  assert.doesNotMatch(renderToStaticMarkup(createElement(Facts, { rows: specRows(set, asSet) })), /data-mark/);
  assert.equal(rowsOf(set, { ...asSet, model: 'sonnet' }).model, 'sonnet · this try');

  // Not filed: the workflow's words, or a dash.
  assert.deepEqual(ranWith(rowsOf(unset, null)), ['—', '—', '—', '—', '—', '—']);
  assert.deepEqual(ranWith(rowsOf(set, null)), ['opus', 'high', 'dontAsk', 'none', '600 s', '2']);
});

