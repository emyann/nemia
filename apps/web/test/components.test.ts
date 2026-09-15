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
const { afterEdges, cardEdges, stepData, stepEdges } = await import('../src/components/stepGraph.ts');
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
      timeline: [],
    }],
    timeline: { rounds: [], run: { loop: null, round: null, tasks: 0, inFlight: 0, queuedMs: 0, ranMs: 0, wallMs: null, queued: '—', ran: '—', wall: 'not known' } },
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
  harness: null, model: null, effort: null, after: [], resume: null, input: [], permissionMode: null, tools: null, disallow: [],
  deadlineSeconds: null, maxAttempts: null, check: null, retries: null, output: null, loop: null, rounds: null,
};

const unescaped = (text: string) => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

test("a workflow's step is drawn in the spec mode: what it runs on, its check, effort, tools, mode and loop — and no status chip, no attempt", async () => {
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
    ['effort', "harness's own"],
    ['tools', '4'],
    ['mode', 'dontAsk'],
    ['loop', 'implement · 3 rounds'],
  ], html);
  assert.match(html, /<dt[^>]*>tools<\/dt><dd[^>]*title="Read, Grep, Glob, Bash"/, html);

  // Nothing has happened to it: no chip, no attempt, no gate, no spinner — none of what a run's step shows below its head.
  assert.doesNotMatch(html, /data-state=/, html);
  assert.doesNotMatch(html, /no attempt yet|>#\d/, html);
  assert.equal(gateDrawn(html), false, html);
  assert.doesNotMatch(html, /running now/, html);

  // Its handles are a run's step's, in the same order, so an edge meets it where it meets a run's step.
  const handles = [...html.matchAll(/<div (?:data-handleid="([^"]*)" )?data-handlepos="(\w+)"[^>]*class="[^"]*\b(source|target)\b/g)].map((m) => [m[3], m[2], m[1] ?? null]);
  assert.deepEqual(handles, [['target', 'left', null], ['source', 'right', null], ['source', 'bottom', LOOP_SOURCE], ['target', 'bottom', LOOP_TARGET]], html);
});

test("a step that sets nothing is drawn on the defaults: its harness's own effort and tools under its head, and nothing else", async () => {
  const html = await specMarkup(unset);
  assert.match(html, />default harness · default model</);
  const lines = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], unescaped(m[2]!)]);
  assert.deepEqual(lines, [['effort', "harness's own"], ['tools', "harness's own"]], html);
  assert.doesNotMatch(html, /data-state=/, html);

  const { specLines } = await import('../src/components/StepNode.tsx');
  assert.deepEqual(specLines({ ...unset, loop: 'implement', rounds: 1 }).at(-1), ['loop', 'implement · 1 round']);
});

test('a step with more than three tools counts them on its node, named in the title; three or fewer are written out', async () => {
  const { specLines } = await import('../src/components/StepNode.tsx');
  const four = ['Read', 'Grep', 'Glob', 'Bash'];
  const toolsOf = (tools: string[] | null) => specLines({ ...unset, tools }).filter(([label]) => label === 'tools');
  assert.deepEqual(toolsOf(four), [['tools', '4', 'Read, Grep, Glob, Bash']]);
  assert.deepEqual(toolsOf(four.slice(0, 3)), [['tools', 'Read, Grep, Glob']]);
  assert.deepEqual(toolsOf(['Read']), [['tools', 'Read']]);
  // Unset is the harness's own set, and an empty list is none: never a line with nothing on it.
  assert.deepEqual(toolsOf(null), [['tools', "harness's own"]]);
  assert.deepEqual(toolsOf([]), [['tools', 'none']]);
  // The effort a step sets, and the harness's own where it sets none.
  assert.deepEqual(specLines({ ...unset, effort: 'high' }).find(([label]) => label === 'effort'), ['effort', 'high']);
  assert.deepEqual(specLines(unset).find(([label]) => label === 'effort'), ['effort', "harness's own"]);

  /** The tools line as drawn: what it shows, and its title. */
  const toolsLine = (html: string) => {
    const m = /<dt[^>]*>tools<\/dt><dd[^>]*title="([^"]*)"[^>]*>([^<]*)<\/dd>/.exec(html);
    return m && { shows: m[2], title: m[1] };
  };
  assert.deepEqual(toolsLine(await specMarkup({ ...unset, tools: [...four, 'Edit'] })), { shows: '5', title: 'Read, Grep, Glob, Bash, Edit' });
  assert.deepEqual(toolsLine(await specMarkup({ ...unset, tools: four.slice(0, 3) })), { shows: 'Read, Grep, Glob', title: 'Read, Grep, Glob' });
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

  // Filed as a step that sets none of them is, on a harness the api could not ask: one attempt, the engine's default, and nothing else said.
  const bare: StepFiled = { model: null, askedModel: null, effort: null, permissionMode: null, runsIn: null, tools: null, deadlineSeconds: null, maxAttempts: 1 };
  assert.deepEqual(ranWith(rowsOf(unset, bare)), ["harness's own · default", "harness's own · default", "harness's own · default", "harness's own · default", 'no limit · default', '1 · default']);
  const given: StepFiled = {
    model: 'opus', askedModel: null, effort: 'high', permissionMode: 'auto', runsIn: { mode: 'auto', by: 'filed' }, tools: ['Read', 'Grep'], deadlineSeconds: 3600, maxAttempts: 3,
  };
  assert.deepEqual(ranWith(rowsOf(unset, given)), ['opus · default', 'high · default', 'auto · default', 'Read, Grep · default', '3600 s · default', '3 · default']);

  // The mode the session runs in, as its harness decides it: Claude Code's `auto` for a task filed with none — never "the harness's own",
  // which reads as Claude Code's prompting default — Codex's `workspace-write`, and a Codex sandbox its tools narrowed, whatever was named.
  assert.equal(rowsOf(unset, { ...bare, runsIn: { mode: 'auto', by: 'default' } })['permission mode'], 'auto · default');
  assert.equal(rowsOf(unset, { ...bare, runsIn: { mode: 'workspace-write', by: 'default' } })['permission mode'], 'workspace-write · default');
  const reviewer: StepSpec = { ...unset, harness: 'codex', permissionMode: 'workspace-write', tools: ['Read', 'Grep'] };
  const narrowed: StepFiled = { ...bare, permissionMode: 'workspace-write', tools: ['Read', 'Grep'], runsIn: { mode: 'read-only', by: 'tools' } };
  assert.equal(rowsOf(reviewer, narrowed)['permission mode'], 'read-only · by tools');
  assert.equal(rowsOf({ ...reviewer, permissionMode: null }, { ...narrowed, permissionMode: null })['permission mode'], 'read-only · by tools');

  // A model a person's `wf retry --model` asked for is this try's, and not a default, where the workflow names none.
  assert.equal(rowsOf(unset, { ...bare, model: 'sonnet', askedModel: 'sonnet' }).model, 'sonnet · this try');

  // The workflow's words, unmarked; and a try filed on another model than the workflow's says so.
  const set: StepSpec = { ...unset, model: 'opus', effort: 'high', permissionMode: 'dontAsk', tools: [], deadlineSeconds: 600, maxAttempts: 2 };
  const asSet: StepFiled = {
    model: 'opus', askedModel: null, effort: 'high', permissionMode: 'dontAsk', runsIn: { mode: 'dontAsk', by: 'filed' }, tools: [], deadlineSeconds: 600, maxAttempts: 2,
  };
  assert.deepEqual(ranWith(rowsOf(set, asSet)), ['opus', 'high', 'dontAsk', 'none', '600 s', '2']);
  assert.doesNotMatch(renderToStaticMarkup(createElement(Facts, { rows: specRows(set, asSet) })), /data-mark/);
  assert.equal(rowsOf(set, { ...asSet, model: 'sonnet' }).model, 'sonnet · this try');
  assert.equal(rowsOf(set, { ...asSet, model: 'sonnet', askedModel: 'sonnet' }).model, 'sonnet · this try');

  // Not filed: the workflow's words, or a dash.
  assert.deepEqual(ranWith(rowsOf(unset, null)), ['—', '—', '—', '—', '—', '—']);
  assert.deepEqual(ranWith(rowsOf(set, null)), ['opus', 'high', 'dontAsk', 'none', '600 s', '2']);
});


// ─── what a step needs, and the answer ──────────────────────────────────────

const Answering = await import('../src/components/Decide.tsx');
const { NeedsBanner } = await import('../src/components/Needs.tsx');
const Closeouts = await import('../src/components/Closeout.tsx');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
type Offer = import('../src/lib/asks.ts').Offer;

const LOGIN = 'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute';

/** The run of one step, `review`, in `status`, with what the api says it needs and who it says is waited on. */
function needing(status: string, needs: Partial<Pick<RunDetail['steps'][number], 'needs' | 'blockedByHarness' | 'lastLine'>>, over: { waitingOnYou: string[]; cancelledAt?: string | null }): RunDetail {
  const run = runOf(status, over);
  return { ...run, steps: [{ ...run.steps[0]!, needs: null, blockedByHarness: false, lastLine: null, asked: null, ...needs }] };
}

test("a step's node says what it needs: a gate's question after `waiting on you`, and a session the harness blocked, with what it said last — whole on hover", () => {
  const question = 'Should a finished run keep its card on the Factory?';
  const gate = nodeMarkup(needing('succeeded · BLOCKED', { needs: question }, { waitingOnYou: ['review'] }));
  // One line, as the node's others: a second would make it taller than the layering's row.
  const footer = /<p title="([^"]*)" class="truncate [^"]*">([\s\S]*?)<\/p>/.exec(gate);
  assert.ok(footer, gate);
  assert.equal(footer[1], `asks: ${question}`);
  assert.equal(footer[2], `<span class="font-semibold">waiting on you</span><span data-need="asks"> · asks: ${question}</span>`);
  // Asked already, the api waits on nobody for it: no gate, and no question. Nor on a run called off.
  assert.doesNotMatch(nodeMarkup(needing('succeeded · BLOCKED', { needs: question }, { waitingOnYou: [] })), /data-need/);
  assert.doesNotMatch(nodeMarkup(needing('succeeded · BLOCKED', { needs: question }, { waitingOnYou: [], cancelledAt: at })), /data-need/);

  const held = nodeMarkup(needing('needs-human', { blockedByHarness: true, lastLine: LOGIN }, { waitingOnYou: [] }));
  assert.equal(gateDrawn(held), false, 'blocked by the harness is no gate: the step asked nothing');
  assert.ok(held.includes(`<p data-need="harness" title="blocked by the harness: ${LOGIN}" class="truncate `), held);
  assert.ok(held.includes(`>blocked by the harness: ${LOGIN}</p>`), held);
  assert.ok(nodeMarkup(needing('needs-human', { blockedByHarness: true }, { waitingOnYou: [] })).includes('>blocked by the harness</p>'));
  assert.doesNotMatch(nodeMarkup(needing('running (working)', {}, { waitingOnYou: [] })), /data-need/);
});

/** The Decide section's answers for `offers`, rendered inside the query client their asks are made with. */
const offersMarkup = (offers: Offer[]) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Answering.Offers, { runId: 'r-1', offers })));

test("the answers: a box for a step that asks, Try again for a refused check with a recheck, its box closed while a recheck is chosen — and a try asked, `wf ls`'s note", () => {
  const html = offersMarkup([
    { step: 'implement', kind: 'answer', needs: 'Which database?' },
    { step: 'theme', kind: 'try-again', recheck: true, unfinished: false },
    { step: 'lint', kind: 'try-again', recheck: true, unfinished: true },
    { step: 'docs', kind: 'try-again', recheck: false, unfinished: false },
    { step: 'plan', kind: 'asked', try: 2, note: 'try 2 asked (--nudge, with your answer) — the next tick files it' },
  ]);
  assert.match(html, /^<section aria-label="Answer"/);
  const rows = new Map([...html.matchAll(/<li data-offer="([^"]+)" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[2]!, { kind: m[1]!, html: m[3]! }]));
  assert.deepEqual([...rows].map(([name, { kind }]) => [name, kind]), [
    ['implement', 'answer'], ['theme', 'try-again'], ['lint', 'try-again'], ['docs', 'try-again'], ['plan', 'asked'],
  ]);
  const said = (name: string) => textsOf(/<p [^>]*>([\s\S]*?)<\/p>/.exec(rows.get(name)!.html)![1]!).join(' ');
  const buttons = (name: string) => [...rows.get(name)!.html.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]);
  // A server render writes `checked` before `value`.
  const radios = (name: string) => [...rows.get(name)!.html.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])]);
  const boxes = (name: string) => [...rows.get(name)!.html.matchAll(/<textarea /g)].length;
  const closed = (name: string) => /<textarea [^>]*\bdisabled=""/.test(rows.get(name)!.html);

  // An answer: what it asks, a box, and a button that waits for an answer; a nudge unless a new session is chosen.
  assert.equal(said('implement'), 'implement asks: Which database?');
  assert.equal(boxes('implement'), 1);
  assert.deepEqual(buttons('implement'), [['submit', true, 'Answer and continue']]);
  assert.deepEqual(radios('implement'), [['nudge', true], ['fresh', false]]);
  assert.match(rows.get('implement')!.html, /<label for="[^"]+" class="sr-only">Your answer to implement<\/label>/);

  // A refused check: something to tell it if you like, and its check again; the check first where it did not finish.
  assert.equal(said('theme'), 'theme was refused by its check');
  assert.equal(boxes('theme'), 1);
  assert.deepEqual(buttons('theme'), [['submit', false, 'Try again']]);
  assert.deepEqual(radios('theme'), [['nudge', true], ['fresh', false], ['recheck', false]]);
  assert.deepEqual(radios('lint'), [['nudge', false], ['fresh', false], ['recheck', true]]);
  // A recheck files no session, so a message on it is refused (`messageRefusal`): its box is closed while it is chosen, and says why.
  assert.equal(closed('lint'), true, rows.get('lint')!.html);
  assert.match(rows.get('lint')!.html, /placeholder="A recheck runs the check again and files no session: there is nobody to tell\."/);
  assert.deepEqual([closed('implement'), closed('theme'), closed('docs')], [false, false, false]);
  assert.equal(said('docs'), 'docs ended without the closeout it was asked for');
  assert.deepEqual(radios('docs'), [['nudge', true], ['fresh', false]]);

  // Asked: what `wf ls` says of it, and nothing to press.
  assert.deepEqual(textsOf(rows.get('plan')!.html), ['plan', 'try 2 asked (--nudge, with your answer) — the next tick files it']);
  assert.deepEqual(buttons('plan'), []);
  assert.equal(boxes('plan'), 0);
  assert.doesNotMatch(html, /data-refused/);
});

test('the Decide section puts the answers first, before what there is to decide, and its commands still only copy', () => {
  const decision = {
    touched: [], lesson: { said: 'nothing written where the next agent reads', state: 'nothing' as const }, sensitive: [], used: {},
    total: { usage: null, used: 'not measured', cost: 'not measured' },
    commands: [{ label: 'ship it' as const, command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null }],
  };
  const offers = createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Answering.Offers, { runId: 'r-1', offers: [{ step: 'implement', kind: 'answer', needs: 'Which database?' }] }));
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision, offers }));
  assert.ok(html.indexOf('aria-label="Answer"') < html.indexOf('data-lesson'), html);
  const commands = /<section aria-label="Commands"[\s\S]*?<\/section>/.exec(html)![0];
  assert.deepEqual([...commands.matchAll(/<button [^>]*>/g)].map((m) => /data-copy="true"/.test(m[0])), [true]);
  assert.match(html, />implement<\/strong> asks: Which database\?</);
});

test('the tries say `your answer` beside a try a person answered, and above its closeout in the Output tab, selected or folded', () => {
  const answer = 'Postgres, the one in docker-compose.yml.';
  const answered = threeTries.map((t) => ({ ...t, answer: t.try === 2 ? answer : null }));
  const rounds = renderToStaticMarkup(createElement(Closeouts.Rounds, { tries: answered, selected: 3, onSelect: () => {} }));
  assert.deepEqual([...rounds.matchAll(/<li data-try="(\d+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], /data-your-answer/.test(m[2]!)]), [['1', false], ['2', true], ['3', false]]);
  assert.ok(rounds.includes(`<p data-your-answer="true" title="${answer}" class="line-clamp-2 break-words"><span class="text-neutral-500">your answer </span>${answer}</p>`), rounds);

  const selected = renderToStaticMarkup(createElement(Closeouts.TryCloseouts, { tries: answered, selected: answered[1]!, none: 'No closeout yet.' }));
  assert.ok(selected.indexOf('your answer:') >= 0 && selected.indexOf('your answer:') < selected.indexOf('Fixed the failing test.'), selected);
  const folded = renderToStaticMarkup(createElement(Closeouts.TryCloseouts, { tries: answered, selected: answered[2]!, none: 'No closeout yet.' }));
  const fold = /<details data-try="2"[\s\S]*?<\/details>/.exec(folded)![0];
  assert.ok(fold.indexOf('your answer:') >= 0 && fold.indexOf('your answer:') < fold.indexOf('Fixed the failing test.'), fold);
  assert.doesNotMatch(/<details data-try="1"[\s\S]*?<\/details>/.exec(folded)![0], /your answer/);
});

/** The banner, rendered inside the query client its Continue asks with. */
const bannerMarkup = (run: RunDetail) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NeedsBanner, { run })));

test("the banner continues a session the harness blocked: Continue, and a box for anything to tell it, where the commands to copy were — and once asked, the step's note in `wf ls`'s words", () => {
  const base = needing('needs-human', { blockedByHarness: true, lastLine: LOGIN }, { waitingOnYou: [] });
  const asks = { ...base.steps[0]!, name: 'implement', taskId: 't-2', status: 'succeeded · BLOCKED', needs: 'Which database?', blockedByHarness: false, lastLine: null };
  const run: RunDetail = { ...base, waitingOnYou: ['implement'], steps: [asks, base.steps[0]!] };
  const html = bannerMarkup(run);

  assert.match(html, /^<section aria-label="Waiting on you"/);
  const texts = textsOf(html);
  assert.ok(texts.includes('asks: Which database?'), html);
  // After the step's name, which is a tag of its own.
  assert.ok(texts.includes(`is blocked by the harness: ${LOGIN}`), html);
  const items = new Map([...html.matchAll(/<li data-need="(\w+)" data-step="(\w+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[2]!, m[3]!]));
  assert.doesNotMatch(items.get('implement')!, /<form|<button|<textarea/, 'a question is answered from the Decide section, not the banner');
  // For the session the harness blocked, after what it said last: a form that asks, its box optional, and one button, enabled with nothing written.
  const review = items.get('review')!;
  assert.match(review, /^<p [^>]*>[\s\S]*?<\/p><div data-continue="true"[^>]*><form aria-label="Continue review"/);
  assert.deepEqual([...review.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]), [['submit', false, 'Continue']]);
  assert.match(review, /<label for="[^"]+" class="sr-only">What to tell review, if anything<\/label>/);
  assert.match(review, /<textarea [^>]*placeholder="Anything to tell it \(optional\): the next try is told it\."/);
  assert.ok(textsOf(review).includes('wf retry r-1 review'), review);
  // The commands are gone, and so is the sentence that said the board could not continue it.
  assert.doesNotMatch(html, /data-copy|data-unblock|ae stop|cannot continue/);

  // Asked: what the tick does with it, in `wf ls`'s words, and nothing to press.
  const note = 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it';
  const held = { ...base.steps[0]!, note, asked: { try: 2, mode: 'nudge' as const, model: null, message: null, stopFirst: true } };
  const asked = bannerMarkup({ ...run, steps: [asks, held] });
  assert.ok(asked.includes(`<p data-note="true" class="font-mono text-xs">${note}</p></li>`), asked);
  assert.doesNotMatch(/<li data-need="harness"[\s\S]*?<\/li>/.exec(asked)![0], /<form|<button|<textarea/);
});

test('REFUSED: the banner offers no Continue for a session still at work, which the harness did not block, nor on a run called off', () => {
  assert.equal(bannerMarkup(needing('running (working)', {}, { waitingOnYou: [] })), '', 'nothing needed: no banner');
  const held = needing('needs-human', { blockedByHarness: true, lastLine: LOGIN }, { waitingOnYou: [] });
  assert.match(bannerMarkup(held), /<form aria-label="Continue review"/);
  assert.equal(bannerMarkup({ ...held, cancelledAt: at }), '', 'called off: nobody waits for the session');
});

test("the Factory's legend adds the edge between two cards, dashed and still as it is while a run waits on a run — and a run's page's legend does not", () => {
  const legendOf = (cards: boolean) => withMotion(false, () => renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasLegend, { cards }))));
  const itemsOf = (html: string) =>
    new Map(html.split('<span class="flex items-center gap-1">').slice(1).map((item) => [/([a-z ]+)<\/span>(?:<\/div>)?$/.exec(item)?.[1], item]));
  assert.deepEqual([...itemsOf(legendOf(false)).keys()], ['to come', 'running', 'done', 'loops back', 'human gate']);
  const items = itemsOf(legendOf(true));
  assert.deepEqual([...items.keys()], ['to come', 'running', 'done', 'loops back', 'waits on a run', 'human gate']);
  const cards = items.get('waits on a run')!;
  assert.match(cards, /data-sample="cards"/);
  assert.equal((cards.match(/<rect /g) ?? []).length, 2, 'a card at each end');
  assert.match(cards, /stroke:var\(--edge-to-come\);stroke-width:1.5;stroke-dasharray:5 4/);
  assert.equal(travelling(cards).length, 0);
});

test('the edges between cards are drawn as every edge is: from a run into each card that waits on it, dashed until its run starts, solid once it has, and moving never', () => {
  const card = (id: string, after: string[], filed: boolean) => ({
    id, after, steps: [{ name: 'implement', taskId: filed ? `t-${id}` : null, branch: null, status: filed ? 'running (working)' : 'waiting', note: null, needs: null, blockedByHarness: false }],
  });
  const edges = afterEdges([card('a', [], true), card('b', ['a'], true), card('d', ['a', 'b'], false)]);
  const shape = ({ id, source, target, type, sourceHandle, targetHandle, data }: StateFlowEdge) => ({ id, source, target, type, sourceHandle, targetHandle, data });
  assert.deepEqual(edges.map(shape), [
    // Out of a card's one source handle, on its right, and into its one target handle, on the left: no handle named.
    { id: 'after:a->b', source: 'a', target: 'b', type: 'state', sourceHandle: undefined, targetHandle: undefined, data: { state: 'done', loop: false } },
    { id: 'after:a->d', source: 'a', target: 'd', type: 'state', sourceHandle: undefined, targetHandle: undefined, data: { state: 'to-come', loop: false } },
    { id: 'after:b->d', source: 'b', target: 'd', type: 'state', sourceHandle: undefined, targetHandle: undefined, data: { state: 'to-come', loop: false } },
  ]);
  const [done, toCome] = [edgeMarkup(edges[0]!), edgeMarkup(edges[1]!)];
  assert.match(toCome, /data-state="to-come"[^>]*stroke-dasharray:5 4|stroke-dasharray:5 4[^>]*data-state="to-come"/);
  assert.match(done, /data-state="done"/);
  assert.doesNotMatch(done, /stroke-dasharray/);
  assert.equal(travelling(done + toCome).length, 0);
});

// ─── the timeline ────────────────────────────────────────────────────────────

test("the run page's timeline: a row per try's session and per check, in the api's words — a recheck, a check still running, a task the engine lost — and the totals", async () => {
  const { Timeline } = await import('../src/components/Timeline.tsx');
  type TaskSpan = import('../src/lib/api.ts').TaskSpan;
  type TimelineTotal = import('../src/lib/api.ts').TimelineTotal;
  const T = (m: number, s = 0) => new Date(Date.UTC(2026, 8, 13, 8, m, s)).toISOString();
  const span = (taskId: string, at: TaskSpan['at'], queued: string, ran: string, times: Partial<TaskSpan> = {}): TaskSpan =>
    ({ taskId, at, filedAt: null, spawnedAt: null, endedAt: null, attempts: 1, queuedMs: null, ranMs: null, queued, ran, ...times });
  const total = (round: number | null, queued: string, ran: string, wall: string, loop: string | null = round === null ? null : 'review'): TimelineTotal =>
    ({ loop, round, tasks: 0, inFlight: 0, queuedMs: 0, ranMs: 0, wallMs: null, queued, ran, wall });
  const base = runWith(null);
  const used = { usage: { turns: 54 }, used: '54 turns · tool calls not measured · tokens in not measured · tokens out not measured', cost: 'not measured' };
  const run: RunDetail = {
    ...base,
    steps: [
      {
        ...base.steps[0]!, name: 'implement',
        timeline: [
          { try: 1, round: 1, sessionOf: null, used, session: span('t-1', 'ended', '12s', '19m42s', { filedAt: T(0), spawnedAt: T(0, 12), endedAt: T(19, 54) }), check: span('c-1', 'ended', '1s', '58s', { filedAt: T(19, 56) }) },
          // Rechecked: no session of its own, and its check still running.
          { try: 2, round: 1, sessionOf: 1, used: null, session: null, check: span('c-2', 'running', '1s', 'still running, no end yet', { filedAt: T(30), spawnedAt: T(30, 1) }) },
        ],
      },
      { ...base.steps[0]!, name: 'review', timeline: [{ try: 1, round: 1, sessionOf: null, used: null, session: span('t-lost', 'unknown', 'not on the record', 'not on the record'), check: null }] },
      { ...base.steps[0]!, name: 'respond', timeline: [] },
    ],
    timeline: { rounds: [total(1, '14s', '20m40s', 'still going')], run: total(null, '14s', '20m40s, 1 still running', 'still going') },
  };
  const html = renderToStaticMarkup(createElement(Timeline, { run }));
  const rows = [...html.matchAll(/<tr data-step="([^"]+)"(?: data-try="\d+")? data-task="(\w+)" data-at="(\w+)"/g)].map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(rows, [['implement', 'session', 'ended'], ['implement', 'check', 'ended'], ['implement', 'session', 'rechecked'], ['implement', 'check', 'running'], ['review', 'session', 'unknown']], html);
  const cell = (name: string) => [...html.matchAll(new RegExp(`data-cell="${name}"[^>]*>([^<]*)<`, 'g'))].map((m) => unescaped(m[1]!));
  assert.deepEqual(cell('queued'), ['12s', '1s', '1s', '14s']);
  assert.deepEqual(cell('ran'), ['19m42s', '58s', 'still running, no end yet', '20m40s, 1 still running']);
  assert.ok(html.includes(`<time dateTime="${T(0, 12)}"`) || html.includes(`datetime="${T(0, 12)}"`), 'each instant as the engine wrote it, on its <time>');
  assert.match(unescaped(html), /try 2<\/td><td colSpan="7"[^>]*>its session is try 1's, checked again/i);
  assert.match(html, /the engine has no record of t-lost/);
  assert.ok(html.includes('>54 turns · tool calls not measured'), 'what the session used, beside it');
  assert.doesNotMatch(html, /data-step="respond"/, 'a step not filed has no row');
  // One round: the run's total alone, its wall in the api's words.
  assert.deepEqual([...html.matchAll(/data-total="([^"]+)"/g)].map((m) => m[1]), ['run']);
  assert.match(html, /data-cell="wall"[^>]*>wall still going</);

  // A loop that went round: each round's total, then the run's.
  const looped = { ...run, timeline: { rounds: [total(1, '30s', '13m30s', '15m00s'), total(2, '1m10s', '6m50s', '9m00s')], run: total(null, '1m40s', '20m20s', '25m00s') } };
  assert.deepEqual([...renderToStaticMarkup(createElement(Timeline, { run: looped })).matchAll(/data-total="([^"]+)"/g)].map((m) => m[1]), ['round-1', 'round-2', 'run']);
  // Two loops that went round, and a third that did not: each round of the two, named by its looping step; none of the third's.
  const twoLoops = {
    ...run,
    timeline: {
      rounds: [
        total(1, '0s', '1m00s', '1m00s'), total(2, '0s', '1m00s', '1m00s'),
        total(1, '0s', '2m00s', '2m00s', 'proofread'), total(2, '0s', '2m00s', '2m00s', 'proofread'), total(1, '0s', '3m00s', '3m00s', 'lint'),
      ],
      run: total(null, '0s', '9m00s', '9m00s'),
    },
  };
  const labels = [...renderToStaticMarkup(createElement(Timeline, { run: twoLoops })).matchAll(/<tr data-total="round-\d+"[^>]*><td[^>]*>([^<]+)</g)].map((m) => m[1]);
  assert.deepEqual(labels, ['review round 1', 'review round 2', 'proofread round 1', 'proofread round 2']);
  // Nothing filed: no timeline at all.
  assert.equal(renderToStaticMarkup(createElement(Timeline, { run: { ...run, steps: run.steps.map((step) => ({ ...step, timeline: [] })) } })), '');
});

// ─── what a step and a run cost ─────────────────────────────────────────────

const { Timeline } = await import('../src/components/Timeline.tsx');

/** A step's cost as the api gives it: what its tries cost, of a cap where it has one, and whether that is the cap or more. */
const priced = (spent: number | null, cap: number | null, over = false) => ({
  spent: spent === null ? null : { usd: spent, measured: 2, unmeasured: 0, said: `$${spent.toFixed(2)}` },
  budget: cap === null ? null : { usd: cap, said: `$${cap}`, of: spent === null ? null : `$${spent.toFixed(2)} of $${cap}`, over },
  raise: null,
});

/** `run`, its one step priced as `cost` says, with the word and who waits on it. */
const pricedRun = (status: string, cost: ReturnType<typeof priced>, waitingOnYou: string[] = [], cancelledAt: string | null = null): RunDetail => {
  const run = runOf(status, { waitingOnYou, cancelledAt });
  return { ...run, steps: [{ ...run.steps[0]!, ...cost }] };
};

test("a step's node says what its tries cost, of its cap where it has one — red once they cost it or more — and a step past its budget is a human gate", () => {
  const over = nodeMarkup(pricedRun('over budget $4.25 of $3', priced(4.25, 3, true), ['review']));
  const costOf = (html: string) => /<p data-cost="(\w+)"[^>]*class="([^"]*)"><span[^>]*>cost <\/span>([^<]*)<\/p>/.exec(html);
  const [, state, className, said] = costOf(over) ?? [];
  assert.deepEqual([state, said], ['over', '$4.25 of $3'], over);
  assert.match(className!, /\btext-red-700\b/);
  assert.equal(gateDrawn(over), true, 'over budget waits on you: a human gate');
  assert.equal(gateDrawn(nodeMarkup(pricedRun('budget exhausted $3.02 of $3', priced(3.02, 3, true), ['review']))), true, 'and so does a session ended at its cap');

  const within = costOf(nodeMarkup(pricedRun('verified ✓', priced(1.2, 3))));
  assert.deepEqual([within?.[1], within?.[3], /\btext-red-700\b/.test(within?.[2] ?? '')], ['within', '$1.20 of $3', false]);
  assert.equal(costOf(nodeMarkup(pricedRun('verified ✓', priced(1.2, null))))?.[3], '$1.20', 'no cap: what its tries cost');
  assert.equal(costOf(nodeMarkup(pricedRun('running (working)', priced(null, 3))))?.[3], 'budget $3', 'a cap, and nothing measured yet: the cap alone, never $0');
  assert.doesNotMatch(nodeMarkup(pricedRun('verified ✓', priced(null, null))), /data-cost/, 'nothing measured and no cap: no cost row');
});

test('REFUSED: a step past its budget is no gate where the api does not say it waits on you, nor on a run called off', () => {
  assert.equal(gateDrawn(nodeMarkup(pricedRun('over budget $4.25 of $3', priced(4.25, 3, true), []))), false);
  assert.equal(gateDrawn(nodeMarkup(pricedRun('over budget $4.25 of $3', priced(4.25, 3, true), ['review'], '2026-09-15T07:00:00.000Z'))), false);
});

test("the inspector's Details say what every try cost of its cap — `spent`, red once past it — and add nothing for a step on its one try with no cap", () => {
  const run = runWith(null);
  const markup = (step: RunDetail['steps'][number]) => renderToStaticMarkup(createElement(StepInspector, { run, step, onClose: () => {} }));
  const rows = (step: RunDetail['steps'][number]) =>
    Object.fromEntries([...markup(step).matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], m[2]!.replace(/<[^>]+>/g, '')]));
  const step = run.steps[0]!;
  const over = { ...step, ...priced(4.25, 3, true) };
  assert.equal(rows(over).spent, '$4.25 of $3');
  assert.match(markup(over), /<span data-spent="over" class="[^"]*\btext-red-700\b[^"]*">\$4\.25 of \$3<\/span>/);
  assert.match(markup({ ...step, ...priced(1.2, 3) }), /<span data-spent="within" class="font-mono text-xs ">\$1\.20 of \$3<\/span>/);
  assert.equal(rows({ ...step, ...priced(null, 3) }).spent, 'budget $3');
  // One try and no cap: its `cost` is all of it, and there is no `spent` row.
  assert.equal(Object.hasOwn(rows({ ...step, ...priced(1.2, null) }), 'spent'), false);
  // Tried twice with no cap: every try's cost together — or, for a filed step nobody priced, `not measured`, never $0.
  const twice = { ...step, tries: [{ ...step.tries[0]!, current: false }, { ...step.tries[0]!, try: 2 }] };
  assert.equal(rows({ ...twice, ...priced(2.95, null) }).spent, '$2.95');
  assert.equal(rows({ ...twice, ...priced(null, null) }).spent, 'not measured');
});

test("the timeline has a cost column: what each session cost, `not measured` where nobody priced it, nothing for a check — and each total its sessions', never $0", () => {
  const span = (taskId: string) => ({ taskId, at: 'ended' as const, filedAt: at, spawnedAt: at, endedAt: at, attempts: 1, queuedMs: 0, ranMs: 0, queued: '0s', ran: '0s' });
  const used = (cost: number | null) => ({ usage: null, used: 'not measured', cost: cost === null ? 'not measured' : `$${cost.toFixed(2)}`, costUsd: cost, apiMs: null, toolMs: null });
  const base = runWith(null);
  const total = { ...base.timeline.run, loop: 'review', tasks: 2 };
  const run: RunDetail = {
    ...base,
    steps: [{
      ...base.steps[0]!,
      timeline: [
        { try: 1, round: 1, session: span('t-1'), sessionOf: null, check: span('t-1-check'), used: used(1.75) },
        { try: 2, round: 2, session: span('t-2'), sessionOf: null, check: null, used: used(null) },
      ],
    }],
    timeline: {
      rounds: [{ ...total, round: 1, cost: { usd: 1.75, measured: 1, unmeasured: 0, said: '$1.75' } }, { ...total, round: 2, cost: null }],
      run: { ...base.timeline.run, cost: { usd: 1.75, measured: 1, unmeasured: 1, said: '≥$1.75' } },
    },
  };
  const html = renderToStaticMarkup(createElement(Timeline, { run }));
  // Before `used`, which runs long: in view without scrolling the table.
  assert.match(html, /<th scope="col"[^>]*>ran<\/th><th scope="col"[^>]*>cost<\/th><th scope="col"[^>]*>used<\/th><\/tr><\/thead>/);
  const rows = [...html.matchAll(/<tr ([^>]*)>([\s\S]*?)<\/tr>/g)].map((m) => [
    /data-task="(\w+)"/.exec(m[1]!)?.[1] ?? /data-total="([^"]+)"/.exec(m[1]!)?.[1],
    /<td data-cell="cost"[^>]*>([^<]*)<\/td>/.exec(m[2]!)?.[1],
  ]);
  assert.deepEqual(rows, [['session', '$1.75'], ['check', ''], ['session', 'not measured'], ['round-1', '$1.75'], ['round-2', 'not measured'], ['run', '≥$1.75']]);
  // What a `≥` leaves out, on hover.
  assert.match(html, /<td data-cell="cost" title="What the run&#x27;s tries cost, as its harness priced each session: 1 attempt measured; 1 ended attempt had no cost on it, so it cost at least this"/);
});

test("the Decide section says why a step past its budget is held — `wf decide`'s OVER BUDGET line — and what every try of the run cost", () => {
  const line = 'OVER BUDGET, waiting on you: tokens ($4.25 of $3)  — the run files nothing more for it on its own; nothing after it ran';
  const decision = {
    touched: [], lesson: { said: 'nothing written where the next agent reads', state: 'nothing' as const }, sensitive: [], used: {},
    total: { usage: null, used: 'not measured', cost: 'not measured', costUsd: null, apiMs: null, toolMs: null },
    cost: 'run $6.35 measured · 2 attempts not measured', overBudget: line, commands: [],
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(html, /<p data-over-budget="true" class="[^"]*">OVER BUDGET, waiting on you: tokens \(\$4\.25 of \$3\) {2}— the run files nothing more for it on its own; nothing after it ran<\/p>/);
  assert.match(html, /<dt[^>]*>every try<\/dt><dd[^>]*>run \$6\.35 measured · 2 attempts not measured<\/dd>/);
  const none = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision: { ...decision, overBudget: null, cost: null } }));
  assert.doesNotMatch(none, /data-over-budget/, 'no step held on a budget: no line');
  assert.match(none, /<dt[^>]*>every try<\/dt><dd[^>]*>—<\/dd>/, 'nothing ended yet: a dash, not $0');
});

test("a step past its budget is offered a raise: its word with the amounts, a box started above what it cost with no floor of the board's, and Raise the budget and try again — answer, for a step that asks; its check again, where one did not pass; go round again, for its loop", () => {
  type RetryMode = import('../src/lib/api.ts').RetryMode;
  const checkRaise = { by: 'retry' as const, above: 4.25, said: '$4.25', modes: ['nudge', 'fresh', 'recheck'] as RetryMode[], own: 'failed (check)', needs: null, unfinished: false };
  const html = offersMarkup([
    { step: 'tokens', kind: 'raise', status: 'over budget $4.25 of $3', ...checkRaise },
    {
      step: 'palette', kind: 'raise', status: 'over budget $1.50 of $1', by: 'retry', above: 1.5, said: '$1.50', modes: ['nudge', 'fresh'], own: 'blocked',
      needs: 'Warm colours, or cool ones?', unfinished: false,
    },
    { step: 'types', kind: 'raise', status: 'failed ✗ check (unfinished)', ...checkRaise, unfinished: true },
    { step: 'review', kind: 'raise', status: 'over budget — implement $2.10 of $2', by: 'round', above: 2.1, said: '$2.10', modes: [], own: null, needs: null, unfinished: false },
  ]);
  const rows = new Map([...html.matchAll(/<li data-offer="([^"]+)" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[2]!, { kind: m[1]!, html: m[3]! }]));
  assert.deepEqual([...rows].map(([name, { kind }]) => [name, kind]), [['tokens', 'raise'], ['palette', 'raise'], ['types', 'raise'], ['review', 'raise']]);
  const buttons = (name: string) => [...rows.get(name)!.html.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]);
  const radios = (name: string) => [...rows.get(name)!.html.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])]);
  // The number box, and the amount it starts at, whatever order a server render writes its attributes in — and whether it is closed.
  const input = (name: string) => /<input [^>]*type="number"[^>]*>/.exec(rows.get(name)!.html)?.[0] ?? '';
  const box = (name: string) => /\bvalue="([^"]*)"/.exec(input(name))?.[1];
  const boxClosed = (name: string) => /\bdisabled=""/.test(input(name));
  // The box for what to tell the try: its label, and whether it is closed; none on a row that has none.
  const said = (name: string) => {
    const label = /<label for="[^"]+" class="sr-only">([^<]*)<\/label><textarea [^>]*>/.exec(rows.get(name)!.html);
    return label ? [unescaped(label[1]!), /\bdisabled=""/.test(label[0])] : null;
  };

  const tokens = textsOf(rows.get('tokens')!.html);
  assert.ok(tokens.includes('over budget $4.25 of $3') && tokens.includes('wf retry r-1 tokens --budget <amount>') && tokens.includes('$4.25'), tokens.join(' | '));
  assert.equal(box('tokens'), '5');
  assert.deepEqual(buttons('tokens'), [['submit', false, 'Raise the budget and try again']]);
  // Its check refused: its check again is a way on, which needs no raise, and a nudge is first.
  assert.deepEqual(radios('tokens'), [['nudge', true], ['fresh', false], ['recheck', false]]);
  assert.ok(rows.get('tokens')!.html.includes('Its check again costs nothing, and needs no raise.'), rows.get('tokens')!.html);
  assert.deepEqual(said('tokens'), ['What to tell tokens, if anything', false]);
  assert.equal(boxClosed('tokens'), false);
  assert.match(rows.get('tokens')!.html, /<span class="sr-only">The cap to raise tokens to, in dollars<\/span>/);

  // Signed off blocked past its budget: its question, and the answer with the raise — the button waits for the answer, as an answer row's does.
  const palette = textsOf(rows.get('palette')!.html);
  assert.ok(palette.includes('asks: Warm colours, or cool ones?'), palette.join(' | '));
  assert.ok(palette.includes('wf retry r-1 palette --budget <amount> --message "<answer>"'), palette.join(' | '));
  assert.equal(box('palette'), '2');
  assert.deepEqual(said('palette'), ['Your answer to palette', false]);
  assert.deepEqual(buttons('palette'), [['submit', true, 'Raise the budget and answer']]);
  assert.deepEqual(radios('palette'), [['nudge', true], ['fresh', false]]);
  assert.doesNotMatch(rows.get('tokens')!.html, /data-asks/, 'a step that asked nothing has no question on its row');

  // A check that did not finish past its budget: its check again first, which files no session — so no amount, and nobody to tell.
  assert.deepEqual(radios('types'), [['nudge', false], ['fresh', false], ['recheck', true]]);
  assert.deepEqual(buttons('types'), [['submit', false, 'Run its check again']]);
  assert.equal(boxClosed('types'), true);
  assert.deepEqual(said('types'), ['What to tell types, if anything', true]);

  const review = textsOf(rows.get('review')!.html);
  assert.ok(review.includes('wf round r-1 review --budget <amount>'), review.join(' | '));
  assert.equal(box('review'), '3');
  assert.deepEqual(buttons('review'), [['submit', false, 'Raise the budget and go round again']]);
  assert.deepEqual(radios('review'), [], 'a round has no mode');
  assert.equal(said('review'), null, 'and nothing to tell: a round carries no message');
  // The package refuses a cap not above what was spent, in its words: the board sets no floor of its own that would keep that from it.
  assert.doesNotMatch(html, /\bmin="|\brequired=""/);
});
