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
  const spec = { harness: 'codex', model: null, after: ['implement'], resume: null, permissionMode: null, deadlineSeconds: null, maxAttempts: null, loop: 'implement', rounds: 3 };
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
