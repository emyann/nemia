/**
 * The board's step components (`src/components/step/`), rendered to markup as a server renders them: what a
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
import { coded, type Word } from './run-fixtures.ts';
import './tsx.ts';
import {
  at,
  atGate,
  classesAt,
  closeoutSaying,
  cut,
  endingRun,
  filed,
  LOGIN,
  needing,
  offersMarkup,
  planCloseout,
  ranOnce,
  routedWith,
  runOf,
  runWith,
  SHIP_SAYS,
  textsOf,
  threeTries,
  tookAt,
  toShip,
  unescaped,
  UNMEASURED,
  WAIT,
  where,
  withClient,
} from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { StatusChip, StepNote } = await import('../src/components/step/StatusChip.tsx');
const { StepTabs } = await import('../src/components/step/StepInspector.tsx');
const { StepNode } = await import('../src/components/step/StepNode.tsx');
const { afterEdges, readEdges, stepData, stepEdges } = await import('../src/components/step/stepGraph.ts');
type StepGraphFacts = import('../src/components/step/stepGraph.ts').StepGraphFacts;

/** Of a run, exactly what its graph's edges are drawn from (`StepGraphFacts`): a test of `stepEdges` gives it no more. */
const factsOf = (run: RunDetail): StepGraphFacts => ({
  cancelledAt: run.cancelledAt,
  holding: run.holding,
  graph: run.graph,
  steps: run.steps.map(({ name, phase, reason, on, via, note, roundDue, message }) => ({
    name,
    phase,
    reason,
    on,
    via,
    note,
    roundDue,
    message,
  })),
});
const { StepRail, StepTiles } = await import('../src/components/step/StepRail.tsx');
const { flowSteps, railOf, tilesOf } = await import('../src/lib/flow.ts');
const { StateEdge } = await import('../src/components/step/StateEdge.tsx');
const { CanvasLegend } = await import('../src/components/step/CanvasLegend.tsx');
const { edgeStroke, LOOP_SOURCE, LOOP_TARGET, TRAVEL_SECONDS } = await import('../src/lib/canvas.ts');
const { ReactFlowProvider } = await import('@xyflow/react');
const { AllowedReach } = await import('../src/components/step/Reach.tsx');
const { PERSON } = await import('../src/lib/words.ts');
const { StepBody, StepPolicy, Told } = await import('../src/components/step/Told.tsx');
type RunDetail = import('../src/lib/runView.ts').RunDetail;
type StepReach = import('../src/lib/api/capabilities.ts').StepReach;
type ReadOnlyCommands = import('../src/lib/api/capabilities.ts').ReadOnlyCommands;
type StepAttempts = import('../src/lib/api/tries.ts').StepAttempts;
type GraphEdge = import('../src/lib/api/graph.ts').GraphEdge;
type RunView = import('../src/lib/api/judged.ts').RunView;
type StepLayers = import('../src/lib/api/layers.ts').StepLayers;
type TaskPart = import('../src/lib/api/layers.ts').TaskPart;
type StateFlowEdge = import('../src/components/step/StateEdge.tsx').StateFlowEdge;
type EdgeMarker = import('@xyflow/react').EdgeMarker;
const { SessionOwn } = await import('../src/components/step/session/SessionOwn.tsx');
const { SessionTalk } = await import('../src/components/step/session/SessionTalk.tsx');
const { foldTranscript, tailStart } = await import('../src/lib/transcript.ts');
const { sessionItems } = await import('../src/lib/sessionItems.ts');
type TranscriptEvent = import('../src/lib/api/steps.ts').TranscriptEvent;
type WorkflowStepSpec = import('../src/lib/api/library.ts').WorkflowStepSpec;
const { Artifacts, TryCloseouts } = await import('../src/components/step/Closeout.tsx');
const facts = await import('../src/components/step/Facts.tsx');
type StepCloseout = import('../src/lib/api/tries.ts').StepCloseout;
type StepSpec = import('../src/lib/api/judged.ts').StepSpecView;
type StepFiled = import('../src/lib/api/judged.ts').StepFiledView;
const { answersFrom, chosenDraft, recommendedDraft, unanswered } = await import('../src/components/gate/Questions.tsx');
const Closeouts = await import('../src/components/step/Closeout.tsx');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
const Gates = await import('../src/components/gate/Gate.tsx');
const { HandedOn } = await import('../src/components/step/Closeout.tsx');
const { raiseBody } = await import('../src/components/gate/Raise.tsx');
const { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } =
  await import('../src/components/ui/trace.tsx');

const exhaustedNote = 'round 3 of 3, and it asked again — once more: nemia retry r-1 review --round';

/** The one element's `title`, unescaped as a browser reads it. */
const titleOf = (html: string): string | undefined =>
  /title="([^"]*)"/
    .exec(html)?.[1]
    ?.replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

/** The codes of a loop out of rounds. */
const ROUND = { phase: 'waiting', reason: 'AwaitingRound', on: null, via: null } as const;

test("a chip shows a person's word for the state, never the status; on hover what it means, then the step's note it was given", () => {
  const withNote = renderToStaticMarkup(
    createElement(StatusChip, { codes: ROUND, runCancelled: false, runHeld: false, note: exhaustedNote }),
  );
  assert.match(withNote, /data-state="exhausted"/);
  assert.equal(withNote.replace(/<[^>]*>/g, ''), PERSON.exhausted.rail, 'the rail word is the text');
  assert.doesNotMatch(withNote.replace(/<[^>]*>/g, ''), /rounds exhausted|AwaitingRound/, 'neither the status nor the code is shown');
  assert.equal(titleOf(withNote), `${PERSON.exhausted.meaning}\n${exhaustedNote}`);

  for (const note of [null, undefined, '']) {
    const without = renderToStaticMarkup(createElement(StatusChip, { codes: ROUND, runCancelled: false, runHeld: false, note }));
    assert.equal(titleOf(without), PERSON.exhausted.meaning, String(note));
  }
  const cancelled = renderToStaticMarkup(
    createElement(StatusChip, { codes: { phase: 'stopped', reason: 'Stopped', on: null, via: null }, runCancelled: true, runHeld: false }),
  );
  assert.equal(cancelled.replace(/<[^>]*>/g, ''), 'called off');
  const paused = renderToStaticMarkup(
    createElement(StatusChip, {
      codes: { phase: 'pending', reason: 'Waiting', on: 'pause', via: null },
      runCancelled: false,
      runHeld: false,
    }),
  );
  assert.match(paused, /data-state="waiting"/);
  assert.notEqual(paused.replace(/<[^>]*>/g, ''), PERSON.waiting.rail, 'a check the pause holds is its own wait, not a step to come');
});

test("a step the store's pause parked reads paused, and its hover names the call it stopped after, in the api's words", () => {
  const codes = { phase: 'running', reason: 'Paused', on: null, via: null } as const;
  for (const message of ['paused after its call to Bash', 'paused, its call to Bash cut']) {
    const html = renderToStaticMarkup(
      createElement(StatusChip, { codes: { ...codes, message }, runCancelled: false, runHeld: false, note: 'try 2' }),
    );
    assert.match(html, /data-state="paused"/);
    assert.equal(html.replace(/<[^>]*>/g, ''), PERSON.paused.rail);
    assert.equal(titleOf(html), `${PERSON.paused.meaning}\n${message}\ntry 2`);
  }
  const bare = renderToStaticMarkup(
    createElement(StatusChip, { codes: { ...codes, message: 'paused' }, runCancelled: false, runHeld: false }),
  );
  assert.equal(titleOf(bare), PERSON.paused.meaning, 'a parked step whose call is not known says only what paused means');
  const working = renderToStaticMarkup(
    createElement(StatusChip, {
      codes: { phase: 'running', reason: 'Running', on: null, via: null, message: 'running' },
      runCancelled: false,
      runHeld: false,
    }),
  );
  assert.equal(titleOf(working), PERSON.working.meaning, "any other state's sentence stays off its hover");
});

test('a note under a chip is the note as `wf ls` prints it, and nothing at all for a step without one', () => {
  const html = renderToStaticMarkup(createElement(StepNote, { note: 'try 2, by retries: 1' }));
  assert.match(html, /^<p data-note="true"[^>]*>try 2, by retries: 1<\/p>$/);
  assert.equal(renderToStaticMarkup(createElement(StepNote, { note: null })), '');
});

test("the inspector's Details show a step's note under its chip", () => {
  const run = runWith(exhaustedNote);
  const html = renderToStaticMarkup(createElement(StepTabs, { run, step: run.steps[0] }));
  const chip = html.indexOf('data-state="exhausted"');
  const note = html.indexOf(`<p data-note="true"`);
  assert.ok(chip >= 0, 'the chip is in the Details');
  assert.ok(note > chip, `the note comes after the chip: ${html}`);
  assert.ok(html.slice(note).startsWith(`<p data-note="true"`) && html.includes(`>${exhaustedNote}</p>`), html);

  const bare = runWith(null);
  assert.doesNotMatch(renderToStaticMarkup(createElement(StepTabs, { run: bare, step: bare.steps[0] })), /data-note/);
});

/**
 * The run's step as a canvas draws it — its node's data read off the run by `stepData`, as the run's page and the Factory
 * both read it — inside the provider its handles read. A server render of the whole canvas draws no node: React Flow puts
 * its nodes in its store in an effect.
 */
function nodeMarkup(run: RunDetail): string {
  const props = {
    id: 'review',
    type: 'step' as const,
    data: stepData(run, 0),
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: false,
    deletable: false,
    draggable: false,
  };
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(StepNode, props)));
}

const gateDrawn = (html: string) => />human gate</.test(html) || /data-gate-band/.test(html) || /border-yours/.test(html);

test('a loop out of rounds is drawn as a human gate on the canvas, as a blocked step is — and on a cancelled run, not', () => {
  for (const status of ['rounds exhausted', 'succeeded · BLOCKED'] as const) {
    const gate = nodeMarkup(runOf(status, { waitingOnYou: ['review'] }));
    assert.match(gate, />human gate</, status);
    assert.match(gate, new RegExp(`data-gate-band[^>]*><span[^>]*>${PERSON['awaiting-approval'].rail}</`), status);
    assert.match(gate, /border-yours/, status);

    for (const waitingOnYou of [[], ['review']]) {
      const cancelled = nodeMarkup(runOf(status, { waitingOnYou, cancelledAt: at }));
      assert.equal(
        gateDrawn(cancelled),
        false,
        `${status}, on a cancelled run, waiting on [${waitingOnYou}]: no gate, even with the step still named: ${cancelled}`,
      );
      assert.match(cancelled, />step 01</, `${status}, on a cancelled run`);
    }
  }
  for (const status of ['unsigned', 'failed ✗ check (exit 1)'] as const)
    assert.equal(
      gateDrawn(nodeMarkup(runOf(status, { waitingOnYou: ['review'] }))),
      false,
      `${status}: waiting on you, but work to try again rather than a decision, so not a gate`,
    );
});

test('a step a person has sent round or asked to retry is no gate from the moment they ask: the canvas draws what the api says', () => {
  const asked: Array<[status: Word, note: string]> = [
    ['rounds exhausted', 'round 4 asked (nemia retry --round) — the next tick files implement'],
    ['succeeded · BLOCKED', 'try 2 asked (--continue) — the next tick files it'],
  ];
  for (const [status, note] of asked) {
    const pending = nodeMarkup(runOf(status, { note, waitingOnYou: [] }));
    assert.equal(gateDrawn(pending), false, `${status}, an ask pending: its word kept, with a note, and nobody waited on: ${pending}`);
    assert.match(pending, />step 01</, `${status}, an ask pending`);
    assert.equal(
      gateDrawn(nodeMarkup(runOf(status, { note, waitingOnYou: ['review'] }))),
      true,
      `${status}, nothing asked: the gate, the api's waiting on you the one fact that differs`,
    );
  }
});

/**
 * A loop as the api gives it: review loops back to implement, both signed off, with the notes `wf ls` prints, and review's round due as
 * `reviewDue` says. Neither step has a spec — as when the api could not read one — so what is drawn is the api's graph, and nothing a
 * step's spec says.
 */
function loopRun(notes: { implement: string | null; review: string | null }, reviewDue = false): RunDetail {
  const base = runWith(null);
  const step = { ...base.steps[0], ...coded('unverified · done'), spec: null };
  return {
    ...base,
    status: 'running',
    waitingOnYou: [],
    graph: {
      roots: ['implement'],
      edges: [
        { from: 'implement', to: 'review', kind: 'after' },
        { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
      ],
    },
    steps: [
      { ...step, name: 'implement', note: notes.implement },
      { ...step, name: 'review', note: notes.review, roundDue: reviewDue },
    ],
  };
}

test("the loop's edge goes back to its target, whatever the steps' specs lack", () => {
  const run = loopRun({
    implement: 'round 3 of 3',
    review: 'round 3 of 3, and it asked again — once more: nemia retry r-1 review --round',
  });

  const edges = stepEdges(factsOf(run));
  const shape = ({ id, source, target, type, sourceHandle, targetHandle, label, data }: StateFlowEdge) => ({
    id,
    source,
    target,
    type,
    sourceHandle,
    targetHandle,
    label,
    data,
  });
  assert.deepEqual(
    edges.map(shape),
    [
      {
        id: 'implement->review',
        source: 'implement',
        target: 'review',
        type: 'state',
        sourceHandle: undefined,
        targetHandle: undefined,
        label: undefined,
        data: { state: 'done', loop: false },
      },
      {
        id: 'loop:review->implement',
        source: 'review',
        target: 'implement',
        type: 'state',
        sourceHandle: LOOP_SOURCE,
        targetHandle: LOOP_TARGET,
        label: 'round 3 of 3',
        data: { state: 'to-come', loop: true },
      },
    ],
    "an `after` edge takes each node's handle on its side, naming none; out of rounds, nothing is due, and the edge back rests",
  );

  const due = stepEdges(
    factsOf(loopRun({ implement: null, review: 'round 2 of 3 due — review asked again, and the next tick files implement' }, true)),
  );
  assert.deepEqual([due[1].label, due[1].data], ['round 2 of 3', { state: 'running', loop: true }]);
  const first = stepEdges(factsOf(loopRun({ implement: null, review: null })));
  assert.deepEqual([first[1].label, first[1].data], [undefined, { state: 'to-come', loop: true }]);

  const chain = { ...run, graph: { roots: ['implement', 'review'], edges: [] } };
  assert.deepEqual(stepEdges(factsOf(chain)), [], 'a run with no loop draws no edge back');
});

/**
 * While `render` runs, a browser whose person has asked for reduced motion, or has not — or, for `undefined`, no browser to
 * ask: `matchMedia`, which is all `useReducedMotion` reads.
 */
function withMotion<T>(reduce: boolean | undefined, render: () => T): T {
  const before = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  const matchMedia = (media: string) => ({
    media,
    matches: reduce === true && media === '(prefers-reduced-motion: reduce)',
    addEventListener() {},
    removeEventListener() {},
  });
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
  const props = { ...edge, ...(edge.data?.loop ? UNDER : SIDES), markerEnd: "url('#arrow')", deletable: false } as unknown as Parameters<
    typeof StateEdge
  >[0];
  return renderToStaticMarkup(createElement('svg', null, createElement(StateEdge, props)));
}

/** The travelling dots' `animateMotion`s in some markup, and the edge's own path. */
const travelling = (html: string): string[] => [...html.matchAll(/<animateMotion [^>]*>/g)].map((m) => m[0]);

const pathOf = (html: string): string | undefined => /<path [^>]*\bd="([^"]+)"[^>]*class="react-flow__edge-path"/.exec(html)?.[1];

const legendMarkup = (): string => renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasLegend)));

test("a loop's edge is drawn from under its looping step, dashed, into its target with the arrow and the round beside it", () => {
  const [, back] = stepEdges(
    factsOf(loopRun({ implement: 'round 3 of 3', review: 'round 3 of 3, and it asked again — once more: nemia retry r-1 review --round' })),
  );
  const html = withMotion(false, () => edgeMarkup(back));
  const d = pathOf(html);
  assert.ok(d?.startsWith('M 524,110 C 524,'), html);
  assert.ok(d?.endsWith(' 112,110'), `it ends at implement, where the arrow is: ${d}`);
  assert.match(html, /marker-end="url\(&#x27;#arrow&#x27;\)"/);
  assert.match(html, /stroke:var\(--edge-loop\);stroke-width:1.5;stroke-dasharray:5 4/);
  assert.match(html, />round 3 of 3<\/text>/);
  assert.deepEqual(travelling(html), [], 'out of rounds, nothing is due: it rests');

  const node = nodeMarkup(runOf('unverified · done', { waitingOnYou: [] }));
  const handles = [...node.matchAll(/<div (?:data-handleid="([^"]*)" )?data-handlepos="(\w+)"[^>]*class="[^"]*\b(source|target)\b/g)].map(
    (m) => [m[3], m[2], m[1] ?? null],
  );
  assert.deepEqual(
    handles,
    [
      ['target', 'left', null],
      ['source', 'right', null],
      ['source', 'bottom', LOOP_SOURCE],
      ['target', 'bottom', LOOP_TARGET],
    ],
    `on each node, the handles under it come after the ones on its sides, which an edge naming no handle takes: ${node}`,
  );
});

/** A run of steps, each its name, the word `wf ls` gives it, and the step it comes after, if any: the roots are the rest. */
function runOfSteps(steps: Array<[name: string, status: Word, after?: string]>): RunDetail {
  const base = runWith(null);
  const edges = steps.flatMap(([name, , from]): GraphEdge[] => (from ? [{ from, to: name, kind: 'after' }] : []));
  return {
    ...base,
    status: 'running',
    waitingOnYou: [],
    graph: { roots: steps.filter(([, , from]) => !from).map(([name]) => name), edges },
    steps: steps.map(([name, status]) => ({ ...base.steps[0], name, ...coded(status), note: null })),
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
  const drawn = stepEdges(factsOf(run));
  const html = new Map(drawn.map((edge) => [edge.id, withMotion(false, () => edgeMarkup(edge))]));
  const moving = ['implement->review', 'tokens->theme'];
  assert.deepEqual(
    [...html].filter(([, markup]) => travelling(markup).length > 0).map(([id]) => id),
    moving,
    'into a step at work or at its check',
  );

  for (const id of moving) {
    const markup = html.get(id)!;
    const motions = travelling(markup);
    assert.equal(motions.length, 1, `one dot on ${id}: ${markup}`);
    assert.ok(motions[0].includes(` path="${pathOf(markup)}"`), `along the edge's own path: ${markup}`);
    assert.ok(motions[0].includes(` dur="${TRAVEL_SECONDS}s"`) && motions[0].includes(' repeatCount="indefinite"'), motions[0]);
    assert.match(markup, /<circle [^>]*fill="var\(--edge-running\)"/, 'the dot in the running colour');
    assert.match(markup, /stroke:var\(--edge-running\);stroke-width:2"/, 'on a solid line in the running colour');
    assert.match(markup, /data-state="running"/);
  }
  assert.match(html.get('implement->docs')!, /stroke:var\(--edge-done\);stroke-width:1.5"/, 'a done edge is solid');
  for (const id of ['review->respond', 'implement->gate', 'tokens->lint', 'tokens->ask']) {
    assert.match(
      html.get(id)!,
      /stroke:var\(--edge-to-come\);stroke-width:1.5;stroke-dasharray:5 4/,
      `${id}: an edge to come — not filed, a human gate, a refused check, a step asking a person — is dashed`,
    );
  }
  for (const edge of drawn) {
    assert.equal(
      (edge.markerEnd as EdgeMarker).color,
      edgeStroke(edge.data!.state, edge.data!.loop),
      `an arrow on ${edge.id}, in its colour`,
    );
    assert.equal(edge.animated, undefined, `${edge.id}: the travelling dot is the one animation, never React Flow's dash march as well`);
  }
});

/**
 * The Factory's fake run as `GET /api/runs` lists it: implement → review → respond, implement → respond, tokens → theme; review at work,
 * theme waiting at its gate, an ending, on you.
 */
function summaryRun(): RunView {
  const none = { needs: null, waitingFor: null, approve: null, denied: null, sessionUnread: null };
  const step = (name: string, status: Word, extra = {}) => ({
    name,
    taskId: `t-${name}`,
    branch: null,
    ...coded(status),
    note: null,
    ...none,
    ...extra,
  });
  const after = (from: string, to: string): GraphEdge => ({ from, to, kind: 'after' });
  return {
    id: 'r-1',
    repo: '/code/app',
    place: 'git',
    work: null,
    brief: 'Tile it',
    workflowDir: '/code/app/workflow',
    workflowPage: null,
    createdAt: at,
    startedAt: at,
    cancelledAt: null,
    after: [],
    waiting: null,
    status: 'running',
    moving: true,
    cost: null,
    atWork: null,
    tokens: null,
    steps: [
      step('implement', 'verified ✓'),
      step('review', 'running (working)'),
      step('respond', 'waiting', { taskId: null }),
      step('tokens', 'unverified · done'),
      step('theme', 'awaiting approval', { approve: 'approve theme' }),
    ],
    graph: {
      roots: ['implement', 'tokens'],
      edges: [after('implement', 'review'), after('review', 'respond'), after('implement', 'respond'), after('tokens', 'theme')],
    },
    waitingOnYou: ['theme'],
    waitingOnYouWords: ['approve theme'],
    toDecide: { kind: 'approve', step: 'theme', back: [] },
  } as unknown as RunView;
}

const railMarkup = (run: RunView, reduce = false): string =>
  withMotion(reduce, () =>
    renderToStaticMarkup(
      createElement(StepRail, {
        run,
        flow: railOf(
          run.steps.map((s) => s.name),
          run.graph,
          flowSteps(run),
          false,
        ),
      }),
    ),
  );

const tilesMarkup = (run: RunView, selected: string | null = null, reduce = false): string =>
  withMotion(reduce, () =>
    renderToStaticMarkup(
      createElement(StepTiles, {
        run,
        detail: null,
        selected,
        onStep: () => {},
        flow: tilesOf(
          run.steps.map((s) => s.name),
          run.graph,
          flowSteps(run),
          false,
        ),
      }),
    ),
  );

test("a card at rest draws its run's steps as a rail: a pill each in its state, the ones at work or waiting on you ringed, and an arrow between each, the one into work moving", () => {
  const html = railMarkup(summaryRun());
  const pills = [...html.matchAll(/<li data-step="([^"]+)" data-state="([^"]+)"( data-live="true")?/g)].map((m) => [
    m[1],
    m[2],
    Boolean(m[3]),
  ]);
  assert.deepEqual(
    pills,
    [
      ['implement', 'verified', false],
      ['tokens', 'unverified', false],
      ['review', 'working', true],
      ['theme', 'awaiting-approval', true],
      ['respond', 'waiting', false],
    ],
    html,
  );
  const arrows = Object.fromEntries(
    [...html.matchAll(/<g data-arrow="([^"]+)" data-state="([^"]+)"/g)].map((m) => [m[1].replaceAll('&gt;', '>'), m[2]]),
  );
  assert.deepEqual(arrows, {
    'step:implement->step:review': 'running',
    'step:review->step:respond': 'to-come',
    'step:implement->step:respond': 'to-come',
    'step:tokens->step:theme': 'to-come',
  });
  assert.equal(travelling(html).length, 1, `one dot, on the arrow into the step at work: ${html}`);
  assert.equal(
    travelling(railMarkup(summaryRun(), true)).length,
    0,
    'none where the person asked for reduced motion, where the colour says it alone',
  );
  assert.match(html, /<ul aria-label="Steps">/);
  assert.match(
    html,
    /title="review: at work — /,
    "a pill's name is cut to its width; hovering says it whole, with a person's word for its state and what that means",
  );
});

test("an opened card's tiles each name the step, its chip and what it waits on a person for, and press to inspect it", () => {
  const html = tilesMarkup(summaryRun(), 'review');
  assert.match(html, /<section aria-label="The run&#x27;s steps"/);
  const tiles = [...html.matchAll(/data-tile="([^"]+)" data-state="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(tiles, [
    ['implement', 'verified'],
    ['tokens', 'unverified'],
    ['review', 'working'],
    ['theme', 'awaiting-approval'],
    ['respond', 'waiting'],
  ]);
  assert.match(html, /aria-label="Inspect step theme"/);
  assert.match(
    html,
    /<span data-need="approve" title="[^"]*" class="[^"]*">approve theme to run it<\/span>/,
    `the gate that ends the run says what approving it does, in the node's words: ${html}`,
  );
  assert.deepEqual(
    [...html.matchAll(/aria-pressed="true"[^>]*data-tile="([^"]+)"|data-tile="([^"]+)"[^>]*aria-pressed="true"/g)].map((m) => m[1] ?? m[2]),
    ['review'],
    'the step being inspected is pressed, and only it',
  );
  assert.equal(
    [...html.matchAll(/<span class="truncate">…<\/span>/g)].length,
    5,
    "before the run's detail is read, a tile's attempt line waits for it",
  );
  assert.equal(travelling(html).length, 1);
  assert.equal(travelling(tilesMarkup(summaryRun(), null, true)).length, 0);
});

test("a loop's edge back moves as a running edge does while its round is due, along its curve and keeping its round", () => {
  const [, due] = stepEdges(
    factsOf(
      loopRun({ implement: 'round 2 of 3', review: 'round 2 of 3 due — review asked again, and the next tick files implement' }, true),
    ),
  );
  const html = withMotion(false, () => edgeMarkup(due));
  const d = pathOf(html);
  assert.ok(d?.startsWith('M 524,110 C 524,'), `still from under the looping step: ${d}`);
  assert.equal(travelling(html).length, 1, html);
  assert.ok(travelling(html)[0].includes(` path="${d}"`), 'along its curve');
  assert.match(html, /stroke:var\(--edge-running\);stroke-width:2;stroke-dasharray:5 4/);
  assert.match(html, />round 2 of 3<\/text>/);
  assert.ok(html.indexOf('<animateMotion') < html.indexOf('>round 2 of 3</text>'), 'the dot passes under the round, not over it');
});

test('where the person asked for reduced motion nothing travels — on a running edge, a loop whose round is due, or the legend — and colour and arrow still say it', () => {
  const [running] = stepEdges(
    factsOf(
      runOfSteps([
        ['implement', 'verified ✓'],
        ['review', 'running (working)', 'implement'],
      ]),
    ),
  );
  const [, due] = stepEdges(
    factsOf(
      loopRun({ implement: 'round 2 of 3', review: 'round 2 of 3 due — review asked again, and the next tick files implement' }, true),
    ),
  );
  assert.equal((running.markerEnd as EdgeMarker).color, 'var(--edge-running)');

  for (const reduce of [true, undefined]) {
    const edge = withMotion(reduce, () => edgeMarkup(running));
    assert.deepEqual(
      travelling(edge),
      [],
      `a running edge, reduce: ${reduce} (asked for, or a server with no browser to ask, which sets nothing moving either)`,
    );
    assert.match(edge, /data-state="running"/);
    assert.match(edge, /stroke:var\(--edge-running\);stroke-width:2"/, 'told apart by its colour');
    assert.match(edge, /marker-end="url\(&#x27;#arrow&#x27;\)"/, 'and its arrow');
    assert.doesNotMatch(edge, /<circle/, 'no shape waiting to travel');
    const loop = withMotion(reduce, () => edgeMarkup(due));
    assert.deepEqual(travelling(loop), [], `a loop whose round is due, reduce: ${reduce}`);
    assert.match(loop, />round 2 of 3<\/text>/);
    assert.deepEqual(travelling(withMotion(reduce, legendMarkup)), [], `the legend, reduce: ${reduce}`);
  }
  assert.equal(travelling(withMotion(false, () => edgeMarkup(running))).length, 1, 'where the person has not asked, the same edge moves');
  assert.equal(travelling(withMotion(false, legendMarkup)).length, 1, "and so does the legend's running sample");
});

test('the legend draws an edge in each state as the canvas draws it: dashed and still, moving, solid, and looping back', () => {
  const html = withMotion(false, legendMarkup);
  const items = new Map(
    html
      .split('<span class="flex items-center gap-1">')
      .slice(1)
      .map((item) => [/([a-z ]+)<\/span>(?:<\/div>)?$/.exec(item)?.[1], item]),
  );
  assert.deepEqual([...items.keys()], ['to come', 'running', 'done', 'loops back', 'human gate']);
  assert.match(items.get('to come')!, /stroke:var\(--edge-to-come\);stroke-width:1.5;stroke-dasharray:5 4/);
  assert.match(items.get('running')!, /stroke:var\(--edge-running\);stroke-width:2"/);
  assert.match(items.get('done')!, /stroke:var\(--edge-done\);stroke-width:1.5"/);
  assert.match(items.get('loops back')!, /stroke:var\(--edge-loop\);stroke-width:1.5;stroke-dasharray:5 4/);
  for (const [label, item] of items)
    assert.equal(travelling(item).length, label === 'running' ? 1 : 0, `${label} moves only if it is the running sample`);
});

test("the inspector's Details show `loop` and `rounds` beside `after` on a looping step, and not on another", () => {
  const run = runWith(null);
  const spec: StepSpec = {
    harness: 'codex',
    model: null,
    effort: null,
    context: null,
    after: ['implement'],
    workspace: null,
    place: null,
    resume: null,
    fence: null,
    sandbox: null,
    tools: null,
    deadlineSeconds: null,
    loop: 'implement',
    rounds: 3,
  };
  const looping = { ...run.steps[0], spec };
  const html = renderToStaticMarkup(createElement(StepTabs, { run, step: looping }));
  const labels = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')]);
  const at = (label: string) => labels.findIndex(([l]) => l === label);
  assert.deepEqual(
    labels.slice(at('after'), at('after') + 4),
    [
      ['after', 'implement'],
      ['loop', 'implement'],
      ['rounds', '3'],
      ['resume', '—'],
    ],
    html,
  );

  const plain = { ...looping, spec: { ...spec, loop: null, rounds: null } };
  const without = renderToStaticMarkup(createElement(StepTabs, { run, step: plain }));
  assert.doesNotMatch(without, />loop<\/dt>|>rounds<\/dt>/);
  assert.match(without, />after<\/dt>/);
});

/** The step's session drawn by the family, as the session page draws it. */
const talk = (events: TranscriptEvent[], live = false) =>
  renderToStaticMarkup(createElement(SessionTalk, { who: 'implement', turns: foldTranscript(events), live }));

/** One of the step's own items drawn on its own, as the family's `drawOwn` hands it over. */
const own = (what: import('../src/lib/sessionItems.ts').SessionOwn) =>
  renderToStaticMarkup(createElement(SessionOwn, { own: what, marks: 'session' }));

test('the brief is drawn folded: a line that opens, and its words nowhere until it is opened', () => {
  const html = talk([{ id: 'u-1:0', at, role: 'user', kind: 'text', text: 'Implement what was asked.' }]);
  assert.match(html, /data-session-brief/, 'the brief is the step\u2019s own item, not a person\u2019s bubble');
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(
    html,
    /Implement what was asked/,
    'folded: React Aria lays out a closed panel\u2019s children, so its words are drawn only while it is open',
  );
  assert.match(html, />What it was told</);
});

test('a thought rides as a line of a turn of work, its words behind the line, and the session\u2019s own words are a bubble', () => {
  const html = talk([
    { id: 'a-1:0', at, role: 'assistant', kind: 'thinking', text: 'The word goes in a file.' },
    { id: 'a-2:0', at, role: 'assistant', kind: 'text', text: 'Writing it.' },
  ]);
  assert.match(html, /data-session-turn="folded"/, 'a turn with nothing still at work folds into one line');
  assert.match(html, /Worked for 0s · 1 step/);
  assert.doesNotMatch(html, /The word goes in a file/, 'folded: the thought is behind the line');
  assert.match(html, /data-session-message="agent"/);
  assert.match(html, /data-session-bubble="agent"[^>]*>(<[^>]+>)*Writing it\./, 'the session\u2019s words, drawn from their markdown');
});

test('a turn still at work is drawn open, each line in the state its call is in', () => {
  const events: TranscriptEvent[] = [
    { id: 'u-1:0', at, role: 'user', kind: 'text', text: 'Run the checks.' },
    { id: 'toolu_test', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'npm test' } } },
    { id: 'toolu_test', at, role: 'user', kind: 'tool_result', result: { text: 'pass 233', isError: true } },
    { id: 'toolu_types', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'npm run typecheck' } } },
  ];
  assert.equal(tailStart(foldTranscript(events)), 1, 'the turn is in the tail');
  const live = talk(events, true);
  assert.match(live, /data-session-turn="running"/, 'a turn with a call still unanswered is drawn open');
  assert.deepEqual(
    [...live.matchAll(/data-session-step="([^"]+)"/g)].map((m) => m[1]),
    ['error', 'running'],
  );
  const over = talk(events, false);
  assert.match(over, /data-session-turn="folded"/, 'and folded once the session cannot answer it');
  assert.deepEqual(
    [...over.matchAll(/data-session-step="([^"]+)"/g)].map((m) => m[1]),
    [],
    'folded: its lines are not drawn, which React Aria would otherwise keep and lay out',
  );
});

test('a StructuredOutput call is drawn as the closeout, named, with its outcome, summary and needs — not as a line of work', () => {
  const html = talk([
    {
      id: 'toolu_closeout',
      at,
      role: 'assistant',
      kind: 'tool_use',
      tool: {
        name: 'StructuredOutput',
        input: { outcome: 'blocked', summary: 'WORD.txt is not writable', needs: 'A writable WORD.txt', artifacts: [] },
      },
    },
  ]);
  assert.match(html, /aria-label="Closeout"/);
  assert.match(html, />Closeout</);
  assert.match(html, /data-session-outcome="blocked"/);
  assert.match(html, /WORD\.txt is not writable/);
  assert.match(html, /A writable WORD\.txt/);
  assert.doesNotMatch(html, /data-session-step=/, 'never a line of work');
});

test('what a person told the session is their own words, once, with when they reached its conversation', () => {
  const html = own({ what: 'told', at, attempt: 1, text: 'Widen the api too.', arrived: '2026-09-13T00:01:00.000Z', by: null });
  assert.match(html, /data-session-message="told"/);
  assert.equal([...html.matchAll(/Widen the api too\./g)].length, 1, 'drawn once: the session\u2019s own line for them is taken out');
  assert.match(html, /data-session-arrived="2026-09-13T00:01:00\.000Z"/);
  assert.match(html, />You said, while it ran ·/, 'marked as yours, said while the session ran');
  assert.doesNotMatch(
    own({ what: 'told', at, attempt: 1, text: 'Widen the api too.', arrived: null, by: null }),
    /data-session-arrived/,
    'and says nothing of its arrival until the transcript shows it',
  );
});

test("what an agent told the session is drawn as that agent's, under its name, never as the person's", () => {
  const html = own({ what: 'told', at, attempt: 1, text: 'Cut it.', arrived: null, by: 'operator' });
  assert.match(html, /data-session-message="told-peer"/);
  assert.match(html, /data-session-bubble="told-peer"/);
  assert.match(html, />operator · agent, while it ran ·/);
  assert.doesNotMatch(html, /You said|data-session-message="told"/, 'never as yours');
});

test('a line the harness wrote on its own is a quiet note; one between two calls is a line of the turn', () => {
  const alone = talk([{ id: 's-1:0', at, role: 'system', kind: 'text', text: 'Background session idle' }]);
  assert.match(alone, /data-session-marker="system"/);
  assert.match(alone, /Background session idle/);

  const between = foldTranscript([
    { id: 'toolu_a', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'npm test' } } },
    { id: 's-2:0', at, role: 'assistant', kind: 'system', text: 'Hook ran' },
    { id: 'toolu_b', at, role: 'assistant', kind: 'tool_use', tool: { name: 'Bash', input: { command: 'npm run lint' } } },
  ]);
  const lines = sessionItems(between, 'implement', false).flatMap((item) => (item.kind === 'work' ? item.lines : []));
  assert.deepEqual(
    lines.map((line) => line.sentence),
    ['Bash', 'A line from the harness', 'Bash'],
  );
});

test('the Activity tab draws the session compact, over the last of its turns, and links to the whole of it', async () => {
  const compact = renderToStaticMarkup(createElement(SessionTalk, { who: 'implement', turns: [], live: false, density: 'compact' }));
  assert.match(compact, /data-session-talk="latest"[^>]*class="[^"]*gap-2"/, 'the tab stands its items closer than the page does');
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(SessionTalk, { who: 'implement', turns: [], live: false })),
    /data-session-talk="latest"[^>]*class="[^"]*gap-2"/,
    'and the page stands them at the room they want',
  );

  const { ActivityTail, ACTIVITY_TURNS } = await import('../src/components/step/StepInspector.tsx');
  const { unread } = await import('../src/lib/following.ts');
  const { prerender } = await import('react-dom/static');
  const { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
  const said = (i: number) => `turn-${String(i).padStart(2, '0')}`;
  const events: TranscriptEvent[] = Array.from({ length: ACTIVITY_TURNS + 5 }, (_, i) => ({
    id: `a-${i}:0`,
    at,
    role: 'assistant',
    kind: 'text',
    text: said(i),
  }));
  const run = runWith(null);
  const step = { ...run.steps[0], taskId: 't-1', attempts: ranOnce };
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
  const tab = createElement(ActivityTail, { run, step, following: { ...unread(false), events } });
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const { prelude } = await prerender(createElement(RouterContextProvider, { router, children: tab }));
  const html = await new Response(prelude).text();

  const shown = [...html.matchAll(/turn-\d\d/g)].map((m) => m[0]);
  assert.deepEqual(
    shown,
    Array.from({ length: ACTIVITY_TURNS }, (_, i) => said(i + 5)),
    'the tab draws the tail of the conversation, in its order, not the whole',
  );
  assert.ok(
    textsOf(html)
      .join(' ')
      .includes(`The last ${ACTIVITY_TURNS} of ${ACTIVITY_TURNS + 5}.`),
    'and says it is the tail',
  );
  assert.ok(classesAt(html, 'data-session-talk="latest"').includes('gap-2'), 'drawn compact');
  assert.ok(textsOf(html).includes('Open the session'), 'and the whole of it is one click away');
});

test('the message being written is drawn after the turns, until the whole of it takes its place', () => {
  const events: TranscriptEvent[] = [{ id: 'u-1:0', at, role: 'user', kind: 'text', text: 'Say how rivers end.' }];
  const writing = renderToStaticMarkup(
    createElement(SessionTalk, { who: 'implement', turns: foldTranscript(events), live: true, writing: 'Rivers run to' }),
  );
  assert.match(writing, /data-session-partial/);
  assert.match(writing, /Rivers run to/);
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(SessionTalk, { who: 'implement', turns: foldTranscript(events), live: true, writing: null })),
    /data-session-partial/,
    'nothing is drawn before the first piece',
  );
});

/** A step of a workflow no run has started, as the Workflows page draws it: in the step node's spec mode — on the builder, with `build`. */
async function specMarkup(
  spec: WorkflowStepSpec,
  build?: { unsaved: boolean; refused: boolean; selected: boolean },
  inspected?: boolean,
): Promise<string> {
  const { SpecNode } = await import('../src/components/step/StepNode.tsx');
  const props = {
    id: 'review',
    type: 'spec' as const,
    data: { name: 'review', index: 1, spec, ...(build ? { build } : {}), ...(inspected === undefined ? {} : { inspected }) },
    selected: false,
    dragging: false,
    zIndex: 0,
    isConnectable: false,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    selectable: false,
    deletable: false,
    draggable: false,
  };
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(SpecNode, props)));
}

const unset: WorkflowStepSpec = {
  harness: null,
  model: null,
  effort: null,
  context: null,
  after: [],
  resume: null,
  input: [],
  workspace: null,
  place: null,
  writable: [],
  reads: [],
  slot: null,
  agent: null,
  skills: [],
  mcp: [],
  permissionMode: null,
  sandbox: null,
  tools: null,
  disallowedTools: [],
  allowedTools: [],
  denials: null,
  remote: null,
  deadlineSeconds: null,
  memory: null,
  budget: null,
  check: null,
  retries: null,
  checkFailurePolicy: null,
  gate: null,
  output: null,
  tally: [],
  loop: null,
  rounds: null,
  routes: null,
  route: null,
  when: null,
  ends: null,
  workflow: null,
};

test("a workflow's step is drawn in the spec mode: what it runs on, its check, effort, tools, mode and loop — and no status chip, no session", async () => {
  const html = await specMarkup({
    ...unset,
    harness: 'claude',
    model: 'opus',
    after: ['implement'],
    tools: ['Read', 'Grep', 'Glob', 'Bash'],
    permissionMode: 'dontAsk',
    check: 'npm test && npm run typecheck',
    output: 'review.schema.json',
    loop: 'implement',
    rounds: 3,
  });
  assert.match(html, />step 02</);
  assert.match(html, /title="review">review</);
  assert.match(html, />claude · opus</);
  const lines = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], unescaped(m[2])]);
  assert.deepEqual(
    lines,
    [
      ['check', 'npm test && npm run typecheck'],
      ['effort', "harness's own"],
      ['tools', '4'],
      ['mode', 'dontAsk'],
      ['loop', 'implement · 3 rounds'],
    ],
    html,
  );
  assert.match(html, /<dt[^>]*>tools<\/dt><dd[^>]*title="Read, Grep, Glob, Bash"/, html);

  assert.doesNotMatch(
    html,
    /data-state=/,
    `nothing has happened to it: no chip, no session, no gate, no spinner — none of what a run's step shows below its head: ${html}`,
  );
  assert.doesNotMatch(html, /no session yet|>#\d/, html);
  assert.equal(gateDrawn(html), false, html);
  assert.doesNotMatch(html, /running now/, html);

  const handles = [...html.matchAll(/<div (?:data-handleid="([^"]*)" )?data-handlepos="(\w+)"[^>]*class="[^"]*\b(source|target)\b/g)].map(
    (m) => [m[3], m[2], m[1] ?? null],
  );
  assert.deepEqual(
    handles,
    [
      ['target', 'left', null],
      ['source', 'right', null],
      ['source', 'bottom', LOOP_SOURCE],
      ['target', 'bottom', LOOP_TARGET],
    ],
    `its handles are a run's step's, in the same order, so an edge meets it where it meets a run's step: ${html}`,
  );
});

test("a step that sets nothing is drawn on the defaults: its harness's own effort and tools under its head, and nothing else", async () => {
  const html = await specMarkup(unset);
  assert.match(html, />default harness · default model</);
  const lines = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt><dd[^>]*>([^<]*)<\/dd>/g)].map((m) => [m[1], unescaped(m[2])]);
  assert.deepEqual(
    lines,
    [
      ['effort', "harness's own"],
      ['tools', "harness's own"],
    ],
    html,
  );
  assert.doesNotMatch(html, /data-state=/, html);

  const { specLines } = await import('../src/components/step/StepNode.tsx');
  assert.deepEqual(specLines({ ...unset, loop: 'implement', rounds: 1 }).at(-1), ['loop', 'implement · 1 round']);
});

test("a step on the builder has handles a person draws with — out on the right, in on the left, and a loop's out and in underneath, apart — and says it is unsaved or refused", async () => {
  const html = await specMarkup({ ...unset, harness: 'claude', check: 'npm test' }, { unsaved: true, refused: true, selected: true });
  const handles = [...html.matchAll(/<div (?:data-handleid="([^"]*)" )?data-handlepos="(\w+)"[^>]*class="([^"]*)"[^>]*>/g)].map((m) => {
    const classes = m[3].split(' ');
    const type = classes.includes('source') ? 'source' : 'target';
    return [type, m[2], m[1] ?? null, classes.includes('connectable'), classes.includes('connectablestart')];
  });
  assert.deepEqual(
    handles,
    [
      ['target', 'left', null, true, false],
      ['source', 'right', null, true, true],
      ['source', 'bottom', LOOP_SOURCE, true, true],
      ['target', 'bottom', LOOP_TARGET, true, false],
    ],
    html,
  );
  assert.match(
    html,
    new RegExp(`data-handleid="${LOOP_SOURCE}"[^>]*style="left:70%"`),
    `underneath, a loop's two dots are apart, so the one a person drags from is not under the one a loop comes into: ${html}`,
  );
  assert.match(html, new RegExp(`data-handleid="${LOOP_TARGET}"[^>]*style="left:30%"`), html);
  assert.match(html, /data-unsaved-step="true"/);
  assert.match(html, /data-refused-step="true"/);
  assert.match(html, />unsaved</);
  assert.match(html, />npm test</, 'and its lines, as on the Workflows page');

  const plain = await specMarkup(unset, { unsaved: false, refused: false, selected: false });
  assert.doesNotMatch(plain, /data-unsaved-step|data-refused-step|>unsaved</, plain);
  assert.doesNotMatch(await specMarkup(unset), /\bconnectable\b/, 'off the builder, nobody draws: no handle is connectable');
});

test('a step with more than three tools counts them on its node, named in the title; three or fewer are written out', async () => {
  const { specLines } = await import('../src/components/step/StepNode.tsx');
  const four = ['Read', 'Grep', 'Glob', 'Bash'];
  const toolsOf = (tools: string[] | null) => specLines({ ...unset, tools }).filter(([label]) => label === 'tools');
  assert.deepEqual(toolsOf(four), [['tools', '4', 'Read, Grep, Glob, Bash']]);
  assert.deepEqual(toolsOf(four.slice(0, 3)), [['tools', 'Read, Grep, Glob']]);
  assert.deepEqual(toolsOf(['Read']), [['tools', 'Read']]);
  assert.deepEqual(toolsOf(null), [['tools', "harness's own"]], "unset is the harness's own set");
  assert.deepEqual(toolsOf([]), [['tools', 'none']], 'an empty list is none: never a line with nothing on it');
  assert.deepEqual(
    specLines({ ...unset, effort: 'high' }).find(([label]) => label === 'effort'),
    ['effort', 'high'],
    'the effort a step sets',
  );
  const fenced = specLines({ ...unset, harness: 'codex', sandbox: 'read-only' });
  assert.deepEqual(
    fenced.find(([label]) => label === 'sandbox'),
    ['sandbox', 'read-only'],
    "a codex step's fence under Codex's name, `sandbox`",
  );
  assert.equal(
    fenced.find(([label]) => label === 'mode'),
    undefined,
    "never Claude Code's `mode`",
  );
  assert.deepEqual(
    specLines(unset).find(([label]) => label === 'effort'),
    ['effort', "harness's own"],
    "the harness's own effort where a step sets none",
  );
  const lines = specLines({ ...unset, effort: 'high', context: 200_000 });
  assert.deepEqual(
    lines.slice(0, 2),
    [
      ['effort', 'high'],
      ['context', '200k'],
    ],
    'the context window, under the effort, as the package writes it',
  );
  assert.deepEqual(
    specLines({ ...unset, context: 123_456 }).find(([label]) => label === 'context'),
    ['context', '123456'],
  );
  assert.equal(
    specLines(unset).some(([label]) => label === 'context'),
    false,
    "no context line where the step sets none: the model's whole window",
  );

  const toolsLine = (html: string) => {
    const m = /<dt[^>]*>tools<\/dt><dd[^>]*title="([^"]*)"[^>]*>([^<]*)<\/dd>/.exec(html);
    return m && { shows: m[2], title: m[1] };
  };
  assert.deepEqual(toolsLine(await specMarkup({ ...unset, tools: [...four, 'Edit'] })), {
    shows: '5',
    title: 'Read, Grep, Glob, Bash, Edit',
  });
  assert.deepEqual(toolsLine(await specMarkup({ ...unset, tools: four.slice(0, 3) })), {
    shows: 'Read, Grep, Glob',
    title: 'Read, Grep, Glob',
  });
});

test("the inspector's Details say what a step used and what it cost beside its sessions — `not measured`, never 0", () => {
  const run = runWith(null);
  const rows = (step: RunDetail['steps'][number]) =>
    [...renderToStaticMarkup(createElement(StepTabs, { run, step })).matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map(
      (m) => [m[1], m[2].replace(/<[^>]+>/g, '')],
    );
  const labels = rows(run.steps[0]);
  const at = (label: string) => labels.findIndex(([l]) => l === label);
  assert.deepEqual(
    labels.slice(at('latest took'), at('latest took') + 4).map(([l, v]) => [l, l === 'latest took' ? '…' : v]),
    [
      ['latest took', '…'],
      ['ran on', 'not recorded'],
      ['used', 'not measured'],
      ['cost', 'not measured'],
    ],
  );

  const measured = {
    ...run.steps[0],
    used: {
      ...UNMEASURED,
      usage: { responses: 12, costUsd: 0.004 },
      used: '12 responses · tool calls not measured · tokens in not measured · tokens out not measured',
      cost: '$0.004',
      costUsd: 0.004,
    },
  };
  const said = Object.fromEntries(rows(measured));
  assert.deepEqual(
    [said.used, said.cost],
    ['12 responses · tool calls not measured · tokens in not measured · tokens out not measured', '$0.004'],
  );
  const unfiledStep = { ...run.steps[0], taskId: null, used: null };
  const unfiled = Object.fromEntries(rows(unfiledStep));
  assert.deepEqual(
    [unfiled.sessions, unfiled.used, unfiled.cost, unfiled.task],
    [undefined, undefined, undefined, undefined],
    'a step not filed has run nothing: never a table of dashes',
  );
  const html = renderToStaticMarkup(createElement(StepTabs, { run, step: unfiledStep }));
  assert.match(html, /<p data-unfiled="true"[^>]*>not filed yet<\/p>/, 'said once');
  assert.match(
    html,
    /data-unfiled="true"[^>]*>not filed yet<\/p><p[^>]*>No spec:/,
    'and what its spec says still below: none, on this fixture',
  );
  const gated = renderToStaticMarkup(
    createElement(StepTabs, {
      run: { ...run, waitingOnYou: [] },
      step: { ...unfiledStep, approve: 'approve implement' },
    }),
  );
  assert.match(
    gated,
    /<p data-unfiled="true"[^>]*>not filed yet: it waits at its gate<\/p>/,
    "at its gate, it says so; the brief above it, which reads the run's decision, is the e2e's to prove, and waiting on nobody here draws none",
  );
});

const { Facts, specRows, unreadRows, when } = facts;

test("REFUSED: a step's session alone unread draws an `unread` fact, the runtime's words whole, and a step read draws none", () => {
  const words = '`ae/t-1/1`\'s transcript cannot be read: line 2 does not decode: Expected string, got "yesterday" at ["timestamp"]';
  const html = renderToStaticMarkup(createElement(Facts, { rows: [['task', 't-1'], ...unreadRows(words)] }));
  const row = /<div data-fact="unread"[^>]*>.*?<dd[^>]*><span data-unread="true"[^>]*>([^<]*)<\/span><\/dd><\/div>/.exec(html);
  assert.ok(row, `an unread fact holds the words: ${html}`);
  assert.equal(unescaped(row[1]), words, "the runtime's words, whole");
  assert.deepEqual(unreadRows(null), [], 'a step whose session was read: no row');
});

test("the inspector's Details list a step's rounds, a row a try: its round and how it was reached, its task, sessions and verdict, and a link that selects it", () => {
  const run = runWith('round 2 of 3');
  const step = { ...run.steps[0], name: 'implement', ...coded('running (working)'), attempts: threeTries[2].attempts, tries: threeTries };
  const html = renderToStaticMarkup(createElement(StepTabs, { run, step }));
  const section = /<section aria-label="Rounds"[\s\S]*?<\/section>/.exec(html)?.[0];
  assert.ok(section, `a Rounds section: ${html}`);
  const rows = [...section.matchAll(/<li data-try="(\d+)"([^>]*)>([\s\S]*?)<\/li>/g)].map((m) => [
    m[1],
    /aria-current="true"/.test(m[2]),
    textsOf(m[3]),
  ]);
  assert.deepEqual(
    rows,
    [
      ['1', false, ['round 1 · try 1', 'closeout', 'r-1-implement', '#1 · 12m 30s', 'check', 'exit 1']],
      ['2', false, ['round 1 · try 2 (retries)', 'closeout', 'r-1-implement-try2', '#1 · 12m 30s', 'check', 'passed']],
      ['3', true, ['round 2 · try 3 (round)', '· current', 'closeout', 'r-1-implement-try3', '#2 · running', 'check', 'not filed']],
    ],
    'the current try is selected until another is: filed, its session still running, its check not filed yet',
  );
  assert.deepEqual(
    [...section.matchAll(/<button type="button" aria-label="([^"]+)"/g)].map((m) => m[1]),
    [
      'Show the closeout of round 1 · try 1',
      'Show the closeout of round 1 · try 2 (retries)',
      'Show the closeout of round 2 · try 3 (round)',
    ],
  );
  const facts = [...html.matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], textsOf(m[2]).join(' ')]);
  assert.deepEqual(
    facts.slice(0, 2),
    [
      ['try', 'round 2 · try 3 (round)'],
      ['sessions', '2'],
    ],
    "the sessions above it are the current try's, and say which try that is",
  );

  const once = renderToStaticMarkup(createElement(StepTabs, { run, step: run.steps[0] }));
  assert.doesNotMatch(once, /aria-label="Rounds"|>try<\/dt>/, 'one try: no Rounds, and no `try` above the sessions');
  assert.match(once, />sessions<\/dt>/);
});

test("the Output tab opens on the outcome and who said it, then draws each field by its shape — findings a table, replies with badges, a yes or no with what it means, anything else JSON — and every other try's folded beneath it", () => {
  const replies = [
    { finding: '`src/cache.ts:12` — the cache never expires', answer: 'fixed', why: 'Entries expire after the **TTL** now.' },
    { finding: 'src/cache.ts:40 — a miss is counted twice', answer: "won't fix", why: 'Once per layer, on purpose.' },
  ];
  const findings = [
    { file: 'src/cache.ts', line: 12, what: 'It never **expires**.' },
    { file: 'test/cache.test.ts', line: null, what: 'No test waits out the TTL.' },
  ];
  const schema = {
    findings: {
      type: 'array',
      items: { type: 'object', properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } } },
    },
    again: { type: 'boolean', description: 'true when a finding is worth another round.' },
    matrix: { type: 'array' },
    notes: { type: 'string' },
  };
  const output = { findings, again: false, matrix: [[1, 2], [3]] };
  const tries = threeTries.map((t) =>
    t.current ? { ...t, closeout: closeoutSaying('Answered the review.', { replies, output, missing: ['notes'], schema }) } : t,
  );
  const html = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[2], none: 'No closeout yet.' }));
  assert.deepEqual(textsOf(/<p data-shown-try="3"[^>]*>[\s\S]*?<\/p>/.exec(html)![0]), ['round 2 · try 3 (round) · current']);

  assert.deepEqual(
    textsOf(/<p data-outcome="done" data-by="agent"[^>]*>[\s\S]*?<\/p>/.exec(html)![0]),
    ['done', 'said by the agent'],
    'first the outcome, in words, and who said it',
  );
  assert.ok(html.indexOf('data-outcome') < html.indexOf('Answered the review.'), 'the outcome before the summary');
  assert.match(html, /<label for="[^"]+"[^>]*>Raw<\/label>/, 'the Raw switch, named by a label of its own');

  assert.deepEqual(
    [...html.matchAll(/<section data-field="([^"]+)" data-kind="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    [
      ['findings', 'findings'],
      ['again', 'yesno'],
      ['matrix', 'json'],
      ['replies', 'replies'],
    ],
    "each field under its name, drawn as its shape says, in the schema's order, then the replies",
  );
  const table = /<table data-kind="findings"[\s\S]*?<\/table>/.exec(html)![0];
  assert.deepEqual(
    [...table.matchAll(/<th scope="row" data-place="true"[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]),
    ['src/cache.ts:12', 'test/cache.test.ts'],
    'a null line is the file alone',
  );
  assert.match(
    table,
    /<td[^>]*><div data-cell="what"><div data-markdown="true"[^>]*><p[^>]*>It never <strong>expires<\/strong>\.<\/p>/,
    'its text is markdown, unnamed: the one field beside the place',
  );
  assert.deepEqual(textsOf(/<section data-field="again"[\s\S]*?<\/section>/.exec(html)![0]), [
    'again',
    'no',
    '— true when a finding is worth another round.',
  ]);
  assert.match(/<section data-field="matrix"[\s\S]*?<\/section>/.exec(html)![0], /<pre[^>]*>\[\n {2}\[\n {4}1,/);
  assert.match(html, /<p data-missing="true"[^>]*>declared and not given: notes<\/p>/);

  assert.deepEqual(
    [...html.matchAll(/<li data-answer="[^"]*"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => textsOf(m[1]).join(' ')),
    [
      'src/cache.ts:12 — the cache never expires → fixed · Entries expire after the TTL now.',
      "src/cache.ts:40 — a miss is counted twice → won't fix · Once per layer, on purpose.",
    ],
    'replies read `finding → answer · why`',
  );
  assert.match(
    html,
    /<li data-answer="fixed"[^>]*><div data-markdown="true"[^>]*><p[^>]*><code[^>]*>src\/cache\.ts:12<\/code> — the cache never expires<\/p><\/div>/,
    "a reply's finding is markdown",
  );
  assert.match(
    html,
    /→ <span data-slot="badge"[^>]*bg-surface-variant[^>]*>fixed<\/span><\/span> <span aria-hidden="true">·<\/span> <div data-markdown="true"[^>]*><p[^>]*>Entries expire after the <strong>TTL<\/strong> now\.<\/p>/,
    'its answer a badge, and its why markdown',
  );
  assert.match(html, /<span data-slot="badge"[^>]*>won&#x27;t fix<\/span>/);

  const folds = (markup: string) =>
    [...markup.matchAll(/<details data-try="(\d+)"([^>]*)><summary[^>]*>([\s\S]*?)<\/summary>/g)].map((m) => [
      m[1],
      /\bopen\b/.test(m[2]),
      textsOf(m[3]).join(''),
    ]);
  assert.deepEqual(
    folds(html),
    [
      ['2', false, 'round 1 · try 2 (retries) — done'],
      ['1', false, 'round 1 · try 1 — done'],
    ],
    'the other tries, latest first, each in a closed fold',
  );
  assert.ok(html.indexOf('Fixed the failing test.') > html.indexOf('<details data-try="2"'), 'an earlier summary is in its fold');
  assert.ok(html.indexOf('Answered the review.') < html.indexOf('<details'), "the selected try's summary is above the folds");

  const earlier = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[0], none: 'No closeout yet.' }));
  assert.deepEqual(
    textsOf(/<p data-shown-try="1"[^>]*>[\s\S]*?<\/p>/.exec(earlier)![0]),
    ['round 1 · try 1'],
    'an earlier try selected: its closeout on top',
  );
  assert.deepEqual(
    folds(earlier),
    [
      ['3', false, 'round 2 · try 3 (round) · current — done'],
      ['2', false, 'round 1 · try 2 (retries) — done'],
    ],
    'and the current one folded with the rest',
  );
  assert.ok(earlier.indexOf('Added the cache.') < earlier.indexOf('<details'), earlier);

  const none = renderToStaticMarkup(createElement(TryCloseouts, { tries: threeTries, selected: threeTries[2], none: 'No closeout yet.' }));
  assert.match(none, /<p data-outcome="no closeout" data-by="nobody"/, 'a try still running says it has no closeout, by nobody');
  assert.match(none, /<p data-reason="true"[^>]*>No closeout yet\.<\/p>/, 'in the words it was told to say');
  const first = renderToStaticMarkup(createElement(TryCloseouts, { tries: [tries[2]], selected: tries[2], none: 'No closeout yet.' }));
  assert.doesNotMatch(first, /<details|data-shown-try/, 'a step on its first try has no folds and no label');
});

test("a plan's files are a table, its path over its change; its steps a list; a long approach markdown; a screenshot a field names, the image", () => {
  const shot = '/wf/runs/r-1/artifacts/implement/runs-light.png';
  const artifacts = [
    {
      path: shot,
      name: 'runs-light.png',
      url: '/api/runs/r-1/steps/implement/artifacts/runs-light.png',
      kind: 'image' as const,
      size: 2048,
    },
  ];
  const approach = `Cache it.\n\nThen **expire** it: ${'a reason '.repeat(10)}`;
  const output = { approach, files: [{ path: 'src/cache.ts', change: 'New.' }], steps: ['Write it.', 'Test it.'], screenshots: [shot] };
  const tries = [{ ...threeTries[2], attempts: ranOnce, closeout: closeoutSaying('A plan.', { output, artifacts }) }];
  const html = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[0], none: '-' }));
  assert.deepEqual(
    [...html.matchAll(/<section data-field="([^"]+)" data-kind="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    [
      ['approach', 'markdown'],
      ['files', 'table'],
      ['steps', 'list'],
      ['screenshots', 'list'],
    ],
  );
  assert.match(html, /<th scope="row" data-place="true"[^>]*>src\/cache\.ts<\/th><td[^>]*><div data-cell="change">/);
  assert.match(html, /<p[^>]*>Then <strong>expire<\/strong> it:/);
  const screenshots = /<section data-field="screenshots"[\s\S]*?<\/section>/.exec(html)![0];
  assert.match(
    screenshots,
    /<figure data-artifact="image"[\s\S]*<img src="\/api\/runs\/r-1\/steps\/implement\/artifacts\/runs-light\.png" alt="runs-light\.png"/,
  );
});

test("a closeout's question field is drawn as its questions, read-only, the recommended marked — every other field as before", () => {
  const output = { approach: 'Cut it.', open: [cut, where] };
  const said = closeoutSaying('A design.', { output, questions: [{ field: 'open', questions: [cut, where] }] });
  const tries = [{ ...threeTries[2], attempts: ranOnce, closeout: said }];
  const html = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[0], none: '-' }));
  assert.deepEqual(
    [...html.matchAll(/<section data-(field|questions)="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    [
      ['field', 'approach'],
      ['questions', 'open'],
    ],
  );
  const open = /<section data-questions="open"[\s\S]*?<\/section>/.exec(html)![0];
  assert.deepEqual(
    [...open.matchAll(/<li data-question="([^"]+)"/g)].map((m) => unescaped(m[1])),
    [cut.title, where.title],
  );
  assert.equal([...open.matchAll(/data-recommended="true"/g)].length, 1);
  assert.doesNotMatch(open, /<input|<button/, 'read-only: nothing to choose');
});

test("a try that ended with no statement says the machine's reason, unsigned, in a sentence — and its fold says the reason, where it said `no closeout`", () => {
  const unsigned: StepAttempts = {
    count: 1,
    latest: { startedAt: at, ended: 'failed', endedAt: tookAt, reason: 'unsigned', release: null, harness: null },
  };
  const tries = threeTries.map((t) => (t.try === 1 ? { ...t, attempts: unsigned, closeout: null } : t));
  const html = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[0], none: 'unused' }));
  assert.deepEqual(textsOf(/<p data-outcome="unsigned" data-by="machine"[^>]*>[\s\S]*?<\/p>/.exec(html)![0]), [
    'unsigned',
    'no statement: the machine’s reason',
  ]);
  assert.match(
    html,
    /<p data-reason="true"[^>]*>The session ended without the closing statement it was asked for\. It may have finished; it did not say so\.<\/p>/,
  );
  assert.doesNotMatch(
    html.slice(0, html.indexOf('<section aria-label="Other tries"')),
    /data-closeout|Raw/,
    'no statement, so nothing to draw nor show raw',
  );
  const current = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[2], none: 'No closeout yet.' }));
  assert.match(current, /<details data-try="1"[^>]*><summary[^>]*>round 1 · try 1 — unsigned<\/summary>/);
});

test('a try whose statement could not be read says so, why, and shows it whole as it came — its fold says `unreadable`', () => {
  const said = '{"outcome": "done", "summary": "Cut off';
  const tries = threeTries.map((t) =>
    t.try === 1 ? { ...t, closeout: null, unreadable: { error: 'unparseable: Unterminated string in JSON', raw: said } } : t,
  );
  const html = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[0], none: 'unused' }));
  assert.deepEqual(textsOf(/<p data-outcome="unreadable" data-by="unreadable"[^>]*>[\s\S]*?<\/p>/.exec(html)![0]), [
    'unreadable',
    'said by the agent, not readable',
  ]);
  assert.match(
    html,
    /<p data-reason="true"[^>]*>It gave a closing statement that could not be read \(unparseable: Unterminated string in JSON\)\. Here it is as it came\.<\/p>/,
  );
  assert.match(
    html,
    /<section aria-label="As it came"[^>]*>[\s\S]*?<pre data-raw="true"[^>]*>\{&quot;outcome&quot;: &quot;done&quot;, &quot;summary&quot;: &quot;Cut off<\/pre>/,
    'the statement, untouched',
  );
  const current = renderToStaticMarkup(createElement(TryCloseouts, { tries, selected: tries[2], none: 'No closeout yet.' }));
  assert.match(current, /<details data-try="1"[^>]*><summary[^>]*>round 1 · try 1 — unreadable<\/summary>/);
});

test("a closeout's image is drawn inline, its name its alt, opening full-size in a new tab; a text file is a link, anything else a link with its size, and a bare path the path", () => {
  const url = (name: string) => `/api/runs/r-1/steps/shoot/artifacts/${name}`;
  const dir = '/wf/runs/r-1/artifacts/shoot';
  const html = renderToStaticMarkup(
    createElement(Artifacts, {
      artifacts: [
        { path: `${dir}/shot.png`, name: 'shot.png', url: url('shot.png'), kind: 'image', size: 48_213 },
        { path: `${dir}/notes.txt`, name: 'notes.txt', url: url('notes.txt'), kind: 'text', size: 13 },
        { path: `${dir}/trace.zip`, name: 'trace.zip', url: url('trace.zip'), kind: 'other', size: 2_400_000 },
        { path: 'RESPONSE.md' },
      ],
    }),
  );
  const [image, text, other, bare] = html.split('<li ').slice(1);
  assert.match(image, /data-artifact="image"/);
  assert.ok(image.includes(`<a href="${url('shot.png')}" target="_blank" rel="noreferrer"`), image);
  assert.match(
    image,
    /<a [^>]*><img src="\/api\/runs\/r-1\/steps\/shoot\/artifacts\/shot\.png" alt="shot\.png"/,
    'the image inside the link that opens it',
  );
  assert.match(image, />shot\.png · 47\.1 KB<\/figcaption>/);
  assert.ok(text.includes(`<a href="${url('notes.txt')}" target="_blank" rel="noreferrer"`), text);
  assert.match(text, />notes\.txt<\/a><\/span>/, 'a link, and nothing after it');
  assert.match(other, />trace\.zip<\/a><span[^>]*> · 2\.3 MB<\/span>/);
  assert.match(bare, /data-artifact="path"[^>]*>RESPONSE\.md<\/span>/);
  assert.doesNotMatch(bare, /<a /);
  assert.equal(html.match(/<img /g)?.length, 1, 'only the image is drawn');
  assert.match(renderToStaticMarkup(createElement(Artifacts, { artifacts: [] })), />none named</);
});

test("a closeout's file `wf prune --artifacts` removed is its path and when it went, in the form the run's pruned row gives that moment — no link, no image, and not a bare path that reads as never made", () => {
  const at = '2026-09-28T09:00:00.000Z';
  const said = `its files were removed at ${at} (wf prune --artifacts)`;
  const html = renderToStaticMarkup(
    createElement(Artifacts, {
      artifacts: [{ path: '/wf/runs/r-1/artifacts/shoot/shot.png', pruned: said, prunedAt: at }, { path: 'RESPONSE.md' }],
    }),
  );
  const [pruned, bare] = html.split('<li ').slice(1);
  assert.match(pruned, /data-artifact="pruned"/);
  assert.ok(pruned.includes('>/wf/runs/r-1/artifacts/shoot/shot.png</span>'), pruned);
  const time = renderToStaticMarkup(when(at));
  assert.ok(pruned.includes(`> — its files were removed at ${time}, by a prune of its files</span>`), pruned);
  assert.ok(!textsOf(pruned).join(' ').includes(at), 'the moment is drawn as `when` draws it, never as the api spells it');
  assert.doesNotMatch(pruned, /<a |<img /);
  assert.match(bare, /data-artifact="path"/, 'a path the prune did not reach is the path, as before');
});

test("the spec says what a step runs with: the workflow's word where it sets one, the engine's marked `default` where it does not, and a dash for a step not filed", () => {
  const rowsOf = (spec: StepSpec, filed: StepFiled | null) =>
    Object.fromEntries(
      [
        ...renderToStaticMarkup(createElement(Facts, { rows: specRows(spec, filed) })).matchAll(
          /<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g,
        ),
      ].map((m) => [m[1], textsOf(m[2]).join(' ')]),
    );
  const ranWith = (rows: Record<string, string>) => [rows.model, rows.effort, rows['permission mode'], rows.tools, rows.deadline];
  const unset: StepSpec = {
    harness: 'claude',
    model: null,
    effort: null,
    context: null,
    after: [],
    workspace: null,
    place: null,
    resume: null,
    fence: null,
    sandbox: null,
    tools: null,
    deadlineSeconds: null,
    loop: null,
    rounds: null,
  };

  const bare: StepFiled = {
    model: null,
    askedModel: null,
    effort: null,
    contextTokens: null,
    fence: null,
    runsIn: null,
    tools: null,
    deadlineSeconds: null,
    remote: null,
    bridge: null,
  };
  assert.deepEqual(
    ranWith(rowsOf(unset, bare)),
    ["harness's own · default", "harness's own · default", "harness's own · default", "harness's own · default", 'no limit · default'],
    'filed as a step that sets none of them is, on a harness the api could not ask: nothing said but the defaults',
  );
  const given: StepFiled = {
    model: 'opus',
    askedModel: null,
    effort: 'high',
    contextTokens: null,
    fence: 'auto',
    runsIn: { mode: 'auto', by: 'filed' },
    tools: ['Read', 'Grep'],
    deadlineSeconds: 3600,
    remote: null,
    bridge: null,
  };
  assert.deepEqual(ranWith(rowsOf(unset, given)), [
    'opus · default',
    'high · default',
    'auto · default',
    'Read, Grep · default',
    '1h 00m · default',
  ]);

  assert.equal(
    rowsOf(unset, { ...bare, runsIn: { mode: 'auto', by: 'default' } })['permission mode'],
    'auto · default',
    'the mode the session runs in, as its harness decides it: Claude Code\'s `auto` for a task filed with none, never "the harness\'s own", which reads as its prompting default',
  );
  assert.equal(
    rowsOf(unset, { ...bare, fence: 'auto', runsIn: { mode: 'default', by: 'harness' } })['permission mode'],
    'default · by harness',
    'a Claude Code session filed `auto` that its harness ran in another mode: the mode it ran in, marked as its harness',
  );
  assert.equal(
    rowsOf(unset, { ...bare, runsIn: { mode: 'workspace-write', by: 'default' } })['permission mode'],
    'workspace-write · default',
    "Codex's `workspace-write`",
  );
  const reviewer: StepSpec = { ...unset, harness: 'codex', sandbox: 'workspace-write', tools: ['Read', 'Grep'] };
  const narrowed: StepFiled = {
    ...bare,
    fence: 'workspace-write',
    tools: ['Read', 'Grep'],
    runsIn: { mode: 'read-only', by: 'harness' },
  };
  assert.equal(
    rowsOf(reviewer, narrowed).sandbox,
    'read-only · by harness',
    "a codex step's fence is its `sandbox:`, which the engine's task files as its permission mode, as its harness ran it whatever was named",
  );
  assert.equal(rowsOf(reviewer, narrowed)['permission mode'], undefined, 'and no row is called `permission mode`');
  assert.equal(rowsOf({ ...reviewer, sandbox: null }, { ...narrowed, fence: null }).sandbox, 'read-only · by harness');
  const readOnly: StepSpec = { ...unset, harness: 'codex', sandbox: 'read-only' };
  assert.equal(
    rowsOf(readOnly, { ...bare, fence: 'read-only', runsIn: { mode: 'read-only', by: 'filed' } }).sandbox,
    'read-only',
    "the workflow's word, as filed",
  );
  assert.equal(
    rowsOf(readOnly, { ...bare, fence: 'workspace-write', runsIn: { mode: 'workspace-write', by: 'filed' } }).sandbox,
    'workspace-write · this try',
  );
  assert.equal(rowsOf(readOnly, null).sandbox, 'read-only', 'and a step not filed yet says what its workflow says');
  const widest: StepSpec = { ...unset, harness: 'codex', sandbox: 'danger-full-access' };
  const former: StepFiled = { ...bare, fence: 'bypassPermissions', runsIn: { mode: 'danger-full-access', by: 'filed' } };
  assert.equal(
    rowsOf(widest, former).sandbox,
    'danger-full-access',
    'a try filed with `permissionMode: bypassPermissions` has the fence Codex runs as `-s danger-full-access`: no try of its own',
  );
  assert.equal(rowsOf(widest, { ...former, runsIn: null }).sandbox, 'danger-full-access', 'nor where the api could not ask the harness');
  assert.equal(
    rowsOf(widest, { ...former, fence: 'read-only', runsIn: { mode: 'read-only', by: 'filed' } }).sandbox,
    'read-only · this try',
    'another sandbox is still a try of its own',
  );

  assert.equal(
    rowsOf(unset, { ...bare, model: 'sonnet', askedModel: 'sonnet' }).model,
    'sonnet · this try',
    "a model a person's `wf retry --model` asked for is this try's, and not a default, where the workflow names none",
  );

  const set: StepSpec = {
    ...unset,
    model: 'opus',
    effort: 'high',
    context: 200_000,
    fence: 'dontAsk',
    tools: [],
    deadlineSeconds: 600,
  };
  const asSet: StepFiled = {
    model: 'opus',
    askedModel: null,
    effort: 'high',
    contextTokens: 200_000,
    fence: 'dontAsk',
    runsIn: { mode: 'dontAsk', by: 'filed' },
    tools: [],
    deadlineSeconds: 600,
    remote: null,
    bridge: null,
  };
  assert.deepEqual(ranWith(rowsOf(set, asSet)), ['opus', 'high', 'dontAsk', 'none', '10m 00s'], "the workflow's words");
  assert.equal(
    ['max attempts', 'attempts'].some((row) => row in rowsOf(set, asSet) || row in rowsOf(unset, bare) || row in rowsOf(unset, null)),
    false,
    'no count of attempts: the runtime makes one per start, and a step that says a count is refused',
  );
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(Facts, { rows: specRows(set, asSet) })),
    /data-mark/,
    "the workflow's words, unmarked",
  );
  assert.equal(
    rowsOf(set, { ...asSet, model: 'sonnet' }).model,
    'sonnet · this try',
    "a try filed on another model than the workflow's says so",
  );
  assert.equal(rowsOf(set, { ...asSet, model: 'sonnet', askedModel: 'sonnet' }).model, 'sonnet · this try');

  assert.equal(
    rowsOf(unset, bare).context,
    "model's whole window · default",
    "the context window, as the step writes it: the model's whole window where neither the step nor the try has one",
  );
  assert.equal(rowsOf(unset, { ...bare, contextTokens: 200_000 }).context, '200k · default');
  assert.equal(rowsOf(set, asSet).context, '200k');
  assert.equal(rowsOf(set, { ...asSet, contextTokens: 150_000 }).context, '150k · this try');
  assert.equal(rowsOf(set, null).context, '200k');
  assert.equal(rowsOf(unset, null).context, '—');

  assert.deepEqual(ranWith(rowsOf(unset, null)), ['—', '—', '—', '—', '—'], 'not filed: a dash where the workflow sets nothing');
  assert.deepEqual(ranWith(rowsOf(set, null)), ['opus', 'high', 'dontAsk', 'none', '10m 00s'], "and the workflow's words where it does");
});

test('a step on a remote A2A agent says the agent and its address, and no model, effort, context, fence or tools the run never chose', () => {
  const rowsOf = (spec: StepSpec, filed: StepFiled | null) =>
    Object.fromEntries(
      [
        ...renderToStaticMarkup(createElement(Facts, { rows: specRows(spec, filed) })).matchAll(
          /<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g,
        ),
      ].map((m) => [m[1], textsOf(m[2]).join(' ')]),
    );
  const spec: StepSpec = {
    harness: 'a2a:reviewer',
    model: null,
    effort: null,
    context: null,
    after: ['draft'],
    workspace: null,
    place: null,
    resume: null,
    fence: null,
    sandbox: null,
    tools: null,
    deadlineSeconds: null,
    loop: null,
    rounds: null,
  };
  const bare: StepFiled = {
    model: null,
    askedModel: null,
    effort: null,
    contextTokens: null,
    fence: null,
    runsIn: null,
    tools: null,
    deadlineSeconds: null,
    remote: { name: 'reviewer', address: 'https://agents.example.com/reviewer' },
    bridge: null,
  };
  const rows = rowsOf(spec, bare);
  assert.deepEqual(Object.keys(rows), ['harness', 'agent', 'after', 'deadline']);
  assert.deepEqual(rows, {
    harness: 'a2a:reviewer',
    agent: 'https://agents.example.com/reviewer',
    after: 'draft',
    deadline: 'no limit · default',
  });
  assert.equal(
    rowsOf(spec, { ...bare, remote: { name: 'reviewer', address: null } }).agent,
    'no longer in a2a-agents.json',
    "a name the store's file no longer declares, or reads as refused: the name is on the harness row, and the address is said to be gone",
  );
  assert.deepEqual(
    Object.keys(rowsOf(spec, null)),
    ['harness', 'agent', 'after', 'deadline'],
    'not filed yet, the harness alone says it is remote: the same rows',
  );
  assert.equal(rowsOf(spec, null).agent, '—', 'the address not known');
  assert.equal(
    'agent' in rowsOf({ ...spec, harness: 'claude' }, { ...bare, remote: null }),
    false,
    'a harness of ours keeps its rows, and no agent row',
  );
  assert.ok('model' in rowsOf({ ...spec, harness: 'claude' }, { ...bare, remote: null }));
});

test("a step filed bridged has a reach row: its session's web link to open in a new tab, or why it is not up; a step not bridged has none", () => {
  const spec: StepSpec = {
    harness: 'claude',
    model: null,
    effort: null,
    context: null,
    after: [],
    workspace: null,
    place: null,
    resume: null,
    fence: null,
    sandbox: null,
    tools: null,
    deadlineSeconds: null,
    loop: null,
    rounds: null,
  };
  const filed = (bridge: StepFiled['bridge']): StepFiled => ({
    model: null,
    askedModel: null,
    effort: null,
    contextTokens: null,
    fence: null,
    runsIn: null,
    tools: null,
    deadlineSeconds: null,
    remote: null,
    bridge,
  });
  const html = (bridge: StepFiled['bridge']) => renderToStaticMarkup(createElement(Facts, { rows: specRows(spec, filed(bridge)) }));
  const link = 'https://example.test/code/session_01StepLink';

  const up = html({ url: link, why: null });
  assert.match(up, /data-fact="reach"/);
  assert.match(
    up,
    /<a href="https:\/\/example\.test\/code\/session_01StepLink" target="_blank" rel="noreferrer"[^>]*data-step-bridge="true"[^>]*>https:\/\/example\.test\/code\/session_01StepLink<\/a>/,
  );

  const down = html({ url: null, why: 'no `bridgeSessionId` yet.' });
  assert.match(down, /data-fact="reach"/);
  assert.doesNotMatch(down, /<a /, 'no link while it is not up');
  assert.match(down, /data-bridge-why[^>]*>The web link is not up: no `bridgeSessionId` yet\.</);

  assert.doesNotMatch(html(null), /data-fact="reach"/, 'not bridged: no row');
});

test("a step's node says what it needs: a gate's question after `waits on you`, and a session the harness blocked, with what the harness waits for and what the session said last — whole on hover", () => {
  const question = 'Should a finished run keep its card on the Factory?';
  const gate = nodeMarkup(needing('succeeded · BLOCKED', { needs: question }, { waitingOnYou: ['review'] }));
  const footer = /<p data-gate-band="true" title="([^"]*)" class="truncate [^"]*">([\s\S]*?)<\/p>/.exec(gate);
  assert.ok(footer, `one truncated line, as the node's others: a second would make it taller than the layering's row\n${gate}`);
  assert.equal(footer[1], `asks: ${question}`);
  assert.equal(footer[2], `<span class="font-semibold">${PERSON.blocked.rail}</span><span data-need="asks"> · asks: ${question}</span>`);
  assert.doesNotMatch(
    nodeMarkup(needing('succeeded · BLOCKED', { needs: question }, { waitingOnYou: [] })),
    /data-need/,
    'asked already, the api waits on nobody for it: no gate, and no question',
  );
  assert.doesNotMatch(
    nodeMarkup(needing('succeeded · BLOCKED', { needs: question }, { waitingOnYou: [], cancelledAt: at })),
    /data-need/,
    'nor on a run called off',
  );

  const held = nodeMarkup(needing('needs-human', { waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] }));
  assert.equal(gateDrawn(held), false, 'blocked by the harness is no gate: the step asked nothing');
  assert.ok(
    held.includes(`<p data-need="harness" title="blocked by the harness: ${WAIT.words} · ${LOGIN}" class="truncate `),
    `the whole of it, with what the session said last, is on hover\n${held}`,
  );
  assert.ok(
    held.includes(`>${WAIT.words}</p>`),
    `the line is the wait alone: thirty-odd characters is all the node has, and \`blocked by the harness: \` would leave \`waiting f…\`\n${held}`,
  );
  assert.doesNotMatch(held, /answer it in Claude Code/, 'where a person answers it is the banner’s');
  const mute = nodeMarkup(needing('needs-human', { lastLine: LOGIN }, { waitingOnYou: [] }));
  assert.ok(
    mute.includes(`title="blocked by the harness: ${LOGIN}"`) && mute.includes(`>blocked by the harness: ${LOGIN}</p>`),
    `a harness that says nothing about what for reads \`blocked by the harness\` and what the session said last, on the line as on hover\n${mute}`,
  );
  assert.ok(nodeMarkup(needing('needs-human', {}, { waitingOnYou: [] })).includes('>blocked by the harness</p>'));
  assert.doesNotMatch(nodeMarkup(needing('running (working)', {}, { waitingOnYou: [] })), /data-need/);
});

test("a step's node says how many calls its current try was denied, whole, and which on hover — and nothing when none was", () => {
  const two = { words: 'denied: Skill(look), Bash(pytest)', calls: ['Skill(look)', 'Bash(pytest)'] };
  const html = nodeMarkup(needing('unverified · done', { denied: two }, { waitingOnYou: [] }));
  assert.ok(html.includes(`<p data-denied="true" title="${two.words}" class="truncate `), html);
  assert.ok(html.includes('>denied 2 calls</p>'), html);
  const one = nodeMarkup(
    needing(
      'unverified · done',
      { denied: { words: 'denied: Edit(/a/very/long/path/to/a/file.ts)', calls: ['Edit(/a/very/long/path/to/a/file.ts)'] } },
      { waitingOnYou: [] },
    ),
  );
  assert.ok(one.includes('>denied 1 call</p>'), one);
  assert.doesNotMatch(nodeMarkup(needing('unverified · done', {}, { waitingOnYou: [] })), /data-denied/);
});

test('Choose the recommended answers chooses each recommended option, keeps words already written, and leaves a question with none as it was', () => {
  assert.deepEqual(unanswered([cut, where], {}), [cut.title, where.title], 'nothing is answered before the person answers');
  const typed = { [cut.title]: { chose: ['b'], own: 'Mine.' } };
  const filled = recommendedDraft([cut, where], typed);
  assert.deepEqual(filled, { [cut.title]: { chose: ['a'], own: 'Mine.' } });
  assert.deepEqual(unanswered([cut, where], filled), [where.title], 'a question without a recommendation still waits for the person');
  assert.deepEqual(recommendedDraft([where], {}), {});
  const many = { ...where, recommended: ['retry', 'gate'] };
  assert.deepEqual(recommendedDraft([many], {}), { [where.title]: { chose: ['retry', 'gate'], own: '' } }, 'a list chooses each label');
});

test('choosing takes the one option of a question that takes one, and adds or drops one of a question that takes several; the answers go as the api takes them', () => {
  const one = chosenDraft(chosenDraft({}, cut, 'a', true), cut, 'b', true);
  assert.deepEqual(one[cut.title].chose, ['b']);
  const both = chosenDraft(chosenDraft({}, where, 'retry', true), where, 'gate', true);
  assert.deepEqual(both[where.title].chose, ['retry', 'gate']);
  assert.deepEqual(chosenDraft(both, where, 'retry', false)[where.title].chose, ['gate']);
  const draft = { ...one, [where.title]: { chose: [], own: '  Neither.  ' } };
  assert.deepEqual(unanswered([cut, where], draft), []);
  assert.deepEqual(answersFrom([cut, where], draft), [
    { question: cut.title, chose: ['b'] },
    { question: where.title, chose: [], own: 'Neither.' },
  ]);
  assert.deepEqual(unanswered([where], { [where.title]: { chose: [], own: '   ' } }), [where.title], 'blank words answer nothing');
});

test('the tries say `your answer` beside a try a person answered, and above its closeout in the Output tab, selected or folded', () => {
  const answer = 'Postgres, the one in docker-compose.yml.';
  const answered = threeTries.map((t) => ({ ...t, answer: t.try === 2 ? answer : null }));
  const rounds = renderToStaticMarkup(createElement(Closeouts.Rounds, { tries: answered, selected: 3, onSelect: () => {} }));
  assert.deepEqual(
    [...rounds.matchAll(/<li data-try="(\d+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], /data-your-answer/.test(m[2])]),
    [
      ['1', false],
      ['2', true],
      ['3', false],
    ],
  );
  assert.ok(
    rounds.includes(
      `<p data-your-answer="true" title="${answer}" class="line-clamp-2 break-words"><span class="text-muted-foreground">your answer </span>${answer}</p>`,
    ),
    rounds,
  );

  const selected = renderToStaticMarkup(
    createElement(Closeouts.TryCloseouts, { tries: answered, selected: answered[1], none: 'No closeout yet.' }),
  );
  assert.ok(
    selected.indexOf('your answer:') >= 0 && selected.indexOf('your answer:') < selected.indexOf('Fixed the failing test.'),
    selected,
  );
  const folded = renderToStaticMarkup(
    createElement(Closeouts.TryCloseouts, { tries: answered, selected: answered[2], none: 'No closeout yet.' }),
  );
  const fold = /<details data-try="2"[\s\S]*?<\/details>/.exec(folded)![0];
  assert.ok(fold.indexOf('your answer:') >= 0 && fold.indexOf('your answer:') < fold.indexOf('Fixed the failing test.'), fold);
  assert.doesNotMatch(/<details data-try="1"[\s\S]*?<\/details>/.exec(folded)![0], /your answer/);
});

test('a short string in a closeout is drawn as markdown; a number as it is', async () => {
  const { FieldView } = await import('../src/components/step/Outcome.tsx');
  const field = (value: unknown): string =>
    renderToStaticMarkup(createElement(FieldView, { name: 'next', schema: null, value, artifacts: [], images: new Set<string>() }));
  assert.match(
    field('Run `npm test`.'),
    /data-kind="text"[^]*<div data-markdown="true"[^>]*><p[^>]*>Run <code[^>]*>npm test<\/code>\.<\/p>/,
  );
  assert.match(field(3), /data-kind="text"[^]*<p class="whitespace-pre-wrap break-words">3<\/p>/);
});

test('a step at its gate is a human gate on the canvas, and its node says what is asked of you — `approve review` after `waits on you` — and on a run called off, not', () => {
  const html = nodeMarkup(atGate());
  assert.match(html, />human gate</);
  assert.match(html, /border-yours/);
  assert.match(html, /data-state="awaiting-approval"/);
  const footer = /<p data-gate-band="true" title="([^"]*)" class="truncate [^"]*">([\s\S]*?)<\/p>/.exec(html);
  assert.ok(footer, html);
  assert.equal(
    footer[2],
    `<span class="font-semibold">${PERSON['awaiting-approval'].rail}</span><span data-need="approve"> · approve review&#x27;s hand-off</span>`,
    'what approving does, in a line that names the step as `wf ls` does: a step that ran hands on',
  );
  const spec = { ...atGate().steps[0].spec, workspace: 'base' } as RunDetail['steps'][number]['spec'];
  const ending = nodeMarkup(atGate({ taskId: null, spec, attempts: { count: 0, latest: null } }));
  assert.match(ending, /<span data-need="approve"> · approve review to run it<\/span>/, 'an ending not filed runs');
  assert.match(ending, />not filed yet</, 'an ending at its gate has not been filed: not `no session yet`');
  assert.doesNotMatch(html, /running now/, 'no spinner: nobody runs a step at its gate');
  assert.equal(gateDrawn(nodeMarkup(atGate({ approve: null }, { waitingOnYou: [], waitingOnYouWords: [], cancelledAt: at }))), false);
});

test("REFUSED: an ending's gate brief quotes the package's `toDecide.says` alone — never its step's body, which opens with its agent's instructions", () => {
  const led = endingRun();
  const ship = { ...led.steps[1], body: "You are Otto, a release engineer. You land a run's result.\n\nNever push." };
  const brief = (toDecide: RunDetail['toDecide']) =>
    textsOf(withClient(createElement(StepTabs, { run: { ...led, toDecide, steps: [led.steps[0], ship] }, step: ship }))).join(' ');
  for (const toDecide of [null, { ...toShip, step: 'implement' }]) {
    const said = brief(toDecide);
    assert.ok(said.includes('ship waits at its gate'), said);
    assert.doesNotMatch(said, /You are|Its folder says/, 'no decision about this step: nothing quoted');
  }
  assert.ok(brief(toShip).includes(`Its folder says what it does: “${SHIP_SAYS}”`), "the decision's own words, where it names this step");
});

test("a step's facts say `workspace` only where the step says it: the step that ends the run in the checkout, and no empty row for the rest", () => {
  const [implement, ship] = endingRun().steps;
  const rowsOf = (step: RunDetail['steps'][number]) => specRows(step.spec!).map(([key, value]) => [key, value === null ? null : 'set']);
  assert.ok(
    rowsOf(ship).some(([key]) => key === 'workspace'),
    JSON.stringify(rowsOf(ship)),
  );
  assert.equal(rowsOf(ship).find(([key]) => key === 'workspace')![1], 'set');
  assert.ok(
    !rowsOf({ ...ship, spec: { ...ship.spec!, workspace: null } }).some(([key]) => key === 'workspace'),
    'a step in a worktree says nothing',
  );
  assert.ok(
    !rowsOf({ ...ship, spec: { ...ship.spec!, workspace: undefined as unknown as null } }).some(([key]) => key === 'workspace'),
    'nor a detail from an api without the key',
  );
  assert.ok(!implement.spec, 'and the work of this fixture has no spec at all, which is not a row either');
});

test("a step's facts say `place` only for a step in a folder the run makes, on a remote agent too: none for a step on a repository", () => {
  const [, ship] = endingRun().steps;
  const placeOf = (spec: StepSpec) => specRows(spec).find(([key]) => key === 'place')?.[1];
  const inFolder = { ...ship.spec!, workspace: null, place: 'folder' };
  assert.equal(renderToStaticMarkup(createElement(Facts, { rows: [['place', placeOf(inFolder)]] })).includes('>folder</span>'), true);
  assert.ok(placeOf({ ...inFolder, harness: 'a2a:scribe' }), 'a remote step in a folder says it too');
  assert.equal(placeOf({ ...inFolder, place: 'git' }), undefined, 'a step that says `place: git` works where every step did before');
  assert.equal(placeOf({ ...inFolder, place: null }), undefined, 'nor one without the line');
});

test("the Factory's legend adds the edge between two cards, dashed and still as it is while a run waits until one lands, and the faint dotted line of a run read — and a run's page's legend does not", () => {
  const legendOf = (cards: boolean) =>
    withMotion(false, () => renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(CanvasLegend, { cards }))));
  const itemsOf = (html: string) =>
    new Map(
      html
        .split(/<span class="flex items-center gap-1"(?: title="[^"]*")?>/)
        .slice(1)
        .map((item) => [/([a-z ]+)<\/span>(?:<\/div>)?$/.exec(item)?.[1], item]),
    );
  assert.deepEqual([...itemsOf(legendOf(false)).keys()], ['to come', 'running', 'done', 'loops back', 'human gate']);
  const items = itemsOf(legendOf(true));
  assert.deepEqual(
    [...items.keys()],
    ['to come', 'running', 'done', 'loops back', 'waits until it lands', 'reads what it concluded', 'human gate', 'to decide'],
    'the edge between cards, the line of what a card reads, and the ring round a card whose result nobody has decided, which only the Factory draws',
  );
  assert.match(items.get('to decide')!, /ring-1 ring-yours/);
  const html = legendOf(true);
  assert.match(html, /title="A run that has started draws no line from its waits\."[^>]*>[\s\S]*?waits until it lands/);
  const reads = items.get('reads what it concluded')!;
  assert.match(reads, /data-sample="reads"/);
  assert.match(reads, /stroke-dasharray:1 5/);
  assert.doesNotMatch(reads, / Z"/, 'no arrow: it waits on nothing');
  const cards = items.get('waits until it lands')!;
  assert.match(cards, /data-sample="cards"/);
  assert.equal((cards.match(/<rect /g) ?? []).length, 2, 'a card at each end');
  assert.match(cards, /stroke:var\(--edge-to-come\);stroke-width:1.5;stroke-dasharray:5 4/);
  assert.equal(travelling(cards).length, 0);
});

/** What the api says of a card that still waits on `runs` before anything of it is filed (`RunWaiting`); null for none. */
const waitingOnRuns = (runs: string[]): RunView['waiting'] =>
  runs.length
    ? { runs: runs.map((run) => ({ run, missing: false, cancelledAt: null, gone: [] })), word: '', advice: '', waitingOnYou: false }
    : null;

test('the edges between cards are drawn only for live waits: dashed, out of one handle into the other, never moving — and a line of what the focused card reads, faint and dotted, with no arrow', () => {
  const card = (id: string, waits: string[], context: string[] = []) => ({ id, waiting: waitingOnRuns(waits), context });
  const runs = [card('a', []), card('b', ['a']), card('d', ['a', 'b'], ['a'])];
  const edges = afterEdges(runs);
  const shape = ({ id, source, target, type, sourceHandle, targetHandle, data }: StateFlowEdge) => ({
    id,
    source,
    target,
    type,
    sourceHandle,
    targetHandle,
    data,
  });
  const toCome = { type: 'state', sourceHandle: undefined, targetHandle: undefined, data: { state: 'to-come', loop: false } };
  assert.deepEqual(
    edges.map(shape),
    [
      { id: 'after:a->b', source: 'a', target: 'b', ...toCome },
      { id: 'after:b->d', source: 'b', target: 'd', ...toCome },
    ],
    "out of a card's one source handle, on its right, and into its one target handle, on the left: no handle named; a→d goes by b",
  );
  const markup = edges.map(edgeMarkup).join('');
  assert.equal((markup.match(/stroke-dasharray:5 4/g) ?? []).length, 2, 'every wait dashed');
  assert.equal(travelling(markup).length, 0);

  assert.deepEqual(readEdges(runs, null), [], 'nothing read is drawn without a focus');
  const [read, ...more] = readEdges(runs, 'd');
  assert.deepEqual(more, []);
  assert.deepEqual(
    { id: read.id, source: read.source, target: read.target, className: read.className, markerEnd: read.markerEnd },
    { id: 'read:a->d', source: 'a', target: 'd', className: 'context-edge', markerEnd: undefined },
  );
  const line = edgeMarkup(read);
  assert.match(line, /data-state="read"/);
  assert.match(line, /stroke-dasharray:1 5/);
  assert.doesNotMatch(line, /marker-end/);
});

/** A step's cost as the api gives it: what its tries cost, of a cap where it has one, and whether that is the cap or more. */
const priced = (spent: number | null, cap: number | null, over = false) => ({
  spent: spent === null ? null : { usd: spent, measured: 2, unmeasured: 0, said: `$${spent.toFixed(2)}` },
  budget: cap === null ? null : { usd: cap, said: `$${cap}`, of: spent === null ? null : `$${spent.toFixed(2)} of $${cap}`, over },
  raise: null,
});

/** `run`, its one step priced as `cost` says, with the word and who waits on it. */
const pricedRun = (
  status: Word,
  cost: ReturnType<typeof priced>,
  waitingOnYou: string[] = [],
  cancelledAt: string | null = null,
): RunDetail => {
  const run = runOf(status, { waitingOnYou, cancelledAt });
  return { ...run, steps: [{ ...run.steps[0], ...cost }] };
};

test("a step's node says what its tries cost, of its cap where it has one — in money's amber once they cost it or more — and a step past its budget is a human gate", () => {
  const over = nodeMarkup(pricedRun('over budget $4.25 of $3', priced(4.25, 3, true), ['review']));
  const costOf = (html: string) => /<p data-cost="(\w+)"[^>]*class="([^"]*)"><span[^>]*>cost <\/span>([^<]*)<\/p>/.exec(html);
  const [, state, className, said] = costOf(over) ?? [];
  assert.deepEqual([state, said], ['over', '$4.25 of $3'], over);
  assert.match(className, /\btext-money\b/);
  assert.equal(gateDrawn(over), true, 'over budget waits on you: a human gate');
  assert.equal(
    gateDrawn(nodeMarkup(pricedRun('budget exhausted $3.02 of $3', priced(3.02, 3, true), ['review']))),
    true,
    'and so does a session ended at its cap',
  );

  const within = costOf(nodeMarkup(pricedRun('verified ✓', priced(1.2, 3))));
  assert.deepEqual([within?.[1], within?.[3], /\btext-money\b/.test(within?.[2] ?? '')], ['within', '$1.20 of $3', false]);
  assert.equal(costOf(nodeMarkup(pricedRun('verified ✓', priced(1.2, null))))?.[3], '$1.20', 'no cap: what its tries cost');
  assert.equal(
    costOf(nodeMarkup(pricedRun('running (working)', priced(null, 3))))?.[3],
    'budget $3',
    'a cap, and nothing measured yet: the cap alone, never $0',
  );
  assert.doesNotMatch(nodeMarkup(pricedRun('verified ✓', priced(null, null))), /data-cost/, 'nothing measured and no cap: no cost row');

  const past = nodeMarkup(pricedRun('verified ✓', priced(3.02, 3, true)));
  assert.equal(costOf(past)?.[1], 'over', 'a job its harness ended a little past its cap, which finished: red');
  assert.match(
    past,
    /<p data-cost="over" title="What its tries have cost of its \$3 budget: the cap or more — its harness ends a job at its cap, a little past it where a call was under way, and this step finished; nothing waits on a raise"/,
    'and nothing waits on a raise',
  );
  assert.equal(gateDrawn(past), false, 'a finished step past its cap holds nothing');
});

test('REFUSED: a step past its budget is no gate where the api does not say it waits on you, nor on a run called off', () => {
  assert.equal(gateDrawn(nodeMarkup(pricedRun('over budget $4.25 of $3', priced(4.25, 3, true), []))), false);
  assert.equal(
    gateDrawn(nodeMarkup(pricedRun('over budget $4.25 of $3', priced(4.25, 3, true), ['review'], '2026-09-15T07:00:00.000Z'))),
    false,
  );
});

test("the inspector's Details say what every try cost of its cap — `spent`, red once past it — and add nothing for a step on its one try with no cap", () => {
  const run = runWith(null);
  const markup = (step: RunDetail['steps'][number]) => renderToStaticMarkup(createElement(StepTabs, { run, step }));
  const rows = (step: RunDetail['steps'][number]) =>
    Object.fromEntries(
      [...markup(step).matchAll(/<dt[^>]*>([^<]+)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, '')]),
    );
  const step = run.steps[0];
  const over = { ...step, ...priced(4.25, 3, true) };
  assert.equal(rows(over).spent, '$4.25 of $3');
  assert.match(markup(over), /<span data-spent="over" class="[^"]*\btext-money\b[^"]*">\$4\.25 of \$3<\/span>/);
  assert.match(
    markup({ ...step, ...priced(1.2, 3) }),
    /<span data-spent="within" class="font-mono text-body-small ">\$1\.20 of \$3<\/span>/,
  );
  assert.equal(rows({ ...step, ...priced(null, 3) }).spent, 'budget $3');
  assert.equal(
    Object.hasOwn(rows({ ...step, ...priced(1.2, null) }), 'spent'),
    false,
    'one try and no cap: its `cost` is all of it, and there is no `spent` row',
  );
  const twice = {
    ...step,
    tries: [
      { ...step.tries[0], current: false },
      { ...step.tries[0], try: 2 },
    ],
  };
  assert.equal(rows({ ...twice, ...priced(2.95, null) }).spent, '$2.95', "tried twice with no cap: every try's cost together");
  assert.equal(rows({ ...twice, ...priced(null, null) }).spent, 'not measured', 'for a filed step nobody priced, `not measured`, never $0');
});

test("a step past its budget is offered a raise: its word with the amounts, a box started above what it cost with no floor of the board's, and Raise the budget and try again — answer, for a step that asks; its check again, where one did not pass; go round again, for its loop", () => {
  type RetryMode = import('../src/lib/api/asks.ts').RetryMode;
  const checkRaise = {
    by: 'retry' as const,
    above: 4.25,
    said: '$4.25',
    modes: ['continue', 'fresh', 'recheck'] as RetryMode[],
    own: 'failed (check)' as const,
    needs: null,
    unfinished: false,
    questions: [],
  };
  const html = offersMarkup([
    { step: 'tokens', case: 'raise', kind: 'retry', message: 'over budget $4.25 of $3', ...checkRaise },
    {
      step: 'palette',
      case: 'raise',
      kind: 'retry',
      message: 'over budget $1.50 of $1',
      by: 'retry',
      above: 1.5,
      said: '$1.50',
      modes: ['continue', 'fresh'],
      own: 'blocked',
      needs: 'Warm colours, or cool ones?',
      unfinished: false,
      questions: [],
    },
    { step: 'types', case: 'raise', kind: 'retry', message: 'failed ✗ check (unfinished)', ...checkRaise, unfinished: true },
    {
      step: 'review',
      case: 'raise',
      kind: 'retry',
      message: 'over budget — implement $2.10 of $2',
      by: 'round',
      above: 2.1,
      said: '$2.10',
      modes: [],
      own: null,
      needs: null,
      unfinished: false,
      questions: [],
    },
  ]);
  const rows = new Map(
    [...html.matchAll(/<li data-offer="([^"]+)" data-kind="retry" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [
      m[2],
      { kind: m[1], html: m[3] },
    ]),
  );
  assert.deepEqual(
    [...rows].map(([name, { kind }]) => [name, kind]),
    [
      ['tokens', 'raise'],
      ['palette', 'raise'],
      ['types', 'raise'],
      ['review', 'raise'],
    ],
  );
  const buttons = (name: string) =>
    [...rows.get(name)!.html.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [
      m[1],
      Boolean(m[2]),
      m[3],
    ]);
  const radios = (name: string) =>
    [...rows.get(name)!.html.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])]);
  const input = (name: string) => /<input [^>]*type="number"[^>]*>/.exec(rows.get(name)!.html)?.[0] ?? '';
  const box = (name: string) => /\bvalue="([^"]*)"/.exec(input(name))?.[1];
  const boxClosed = (name: string) => /\bdisabled=""/.test(input(name));
  const said = (name: string) => {
    const label = /<label for="[^"]+" class="sr-only">([^<]*)<\/label><textarea [^>]*>/.exec(rows.get(name)!.html);
    return label ? [unescaped(label[1]), /\bdisabled=""/.test(label[0])] : null;
  };

  const tokens = textsOf(rows.get('tokens')!.html);
  assert.ok(
    tokens.includes('over budget $4.25 of $3') && tokens.join(' ').includes(': the button below raises it.') && tokens.includes('$4.25'),
    tokens.join(' | '),
  );
  assert.equal(box('tokens'), '5', 'the number box starts above what it cost, whatever order a server render writes its attributes in');
  assert.deepEqual(buttons('tokens'), [['submit', false, 'Raise the budget and try again']]);
  assert.deepEqual(
    radios('tokens'),
    [
      ['continue', true],
      ['fresh', false],
      ['recheck', false],
    ],
    'its check refused: its check again is a way on, which needs no raise, and a nudge is first',
  );
  assert.ok(rows.get('tokens')!.html.includes('Its check again costs nothing, and needs no raise.'), rows.get('tokens')!.html);
  assert.deepEqual(said('tokens'), ['What to tell tokens, if anything', false]);
  assert.equal(boxClosed('tokens'), false);
  assert.match(rows.get('tokens')!.html, /<span class="sr-only">The cap to raise tokens to, in dollars<\/span>/);

  const palette = textsOf(rows.get('palette')!.html);
  assert.ok(
    palette.join(' ').includes('asks: Warm colours, or cool ones?'),
    `signed off blocked past its budget: its question\n${palette.join(' | ')}`,
  );
  assert.match(
    rows.get('palette')!.html,
    /<div data-asks="true"[^>]*><p>asks:<\/p> <div data-markdown="true" class="[^"]*max-h-72 overflow-y-auto[^"]*"><p[^>]*>Warm colours, or cool ones\?<\/p>/,
    'the question as markdown, in a box that scrolls',
  );
  assert.ok(palette.join(' ').includes(': the button below raises it.'), palette.join(' | '));
  assert.equal(box('palette'), '2');
  assert.deepEqual(said('palette'), ['Your answer to palette', false], 'and the answer with the raise');
  assert.deepEqual(
    buttons('palette'),
    [['submit', true, 'Raise the budget and answer']],
    "the button waits for the answer, as an answer row's does",
  );
  assert.deepEqual(radios('palette'), [
    ['continue', true],
    ['fresh', false],
  ]);
  assert.doesNotMatch(rows.get('tokens')!.html, /data-asks/, 'a step that asked nothing has no question on its row');

  assert.deepEqual(
    radios('types'),
    [
      ['continue', false],
      ['fresh', false],
      ['recheck', true],
    ],
    'a check that did not finish past its budget: its check again first',
  );
  assert.deepEqual(buttons('types'), [['submit', false, 'Run its check again']]);
  assert.equal(boxClosed('types'), true, 'which files no session: no amount');
  assert.deepEqual(said('types'), ['What to tell types, if anything', true], 'and nobody to tell');

  const review = textsOf(rows.get('review')!.html);
  assert.ok(review.join(' ').includes(", with its loop's next round: the button below raises it."), review.join(' | '));
  assert.equal(box('review'), '3');
  assert.deepEqual(buttons('review'), [['submit', false, 'Raise the budget and go round again']]);
  assert.deepEqual(radios('review'), [], 'a round has no mode');
  assert.equal(said('review'), null, 'and nothing to tell: a round carries no message');
  assert.doesNotMatch(
    html,
    /\bmin="|\brequired=""/,
    'the package refuses a cap not above what was spent, in its words: the board sets no floor of its own that would keep that from it',
  );
});

/** `READ_ONLY_COMMANDS` as the api serves it, cut to a few. */
const READ_ONLY: ReadOnlyCommands = {
  harness: 'Claude Code',
  version: '2.1.272',
  measuredAt: '2026-09-15',
  source: "B9's last review",
  measured: ['cat', 'grep'],
  documented: ['find', 'git'],
  docs: 'code.claude.com/docs/en/permissions, "Read-only commands", read 2026-09-16',
};

/** What a Claude Code step allowed `npm test` gets, in `dontAsk` or not — and what denies what asks there: dontAsk, a job, or nothing. */
const allowedTo = (dontAsk: boolean, askDenier: StepReach['allowed']['askDenier'] = dontAsk ? 'dontAsk' : null): StepReach['allowed'] => ({
  rules: ['Bash(npm test)'],
  takenBack: [],
  asked: [],
  unused: [],
  bash: [{ rule: 'Bash(npm test)', command: 'npm test', except: [], asks: [] }],
  exceptions: [],
  dontAsk,
  askDenier,
  why: null,
});

/**
 * The read-only commands as the api gives them to a step: `denied` by a deny rule, and `asks` by an ask rule — which, `dontAsk`, the api
 * gives as the rule that denies it too.
 */
const readOnlyReach = (
  denied: Record<string, string> = {},
  asks: Record<string, string> = {},
  dontAsk = false,
): NonNullable<StepReach['readOnly']> =>
  [
    ...READ_ONLY.measured.map((command) => ({ command, measured: true })),
    ...READ_ONLY.documented.map((command) => ({ command, measured: false })),
  ].map((c) => {
    const rule = (of: Record<string, string>) => (of[c.command] ? { rule: of[c.command], source: '.claude/settings.json' } : null);
    return { ...c, denied: rule(denied) ?? (dontAsk ? rule(asks) : null), asks: rule(asks) };
  });

const allowedMarkup = (allowed: StepReach['allowed'], readOnly: StepReach['readOnly']) =>
  renderToStaticMarkup(createElement(AllowedReach, { allowed, readOnly, commands: READ_ONLY }));

/** Each read-only command drawn, as `command[:documented][:denied rule][:asks rule]`. */
const readOnlyChips = (html: string) =>
  [...html.matchAll(/<code data-read-only="([^"]+)"( data-documented="true")?(?: data-denied="([^"]+)")?(?: data-asks="([^"]+)")?/g)].map(
    ([, c, documented, denied, asks]) =>
      [c, documented ? ':documented' : '', denied ? `:${unescaped(denied)}` : '', asks ? `:asks ${unescaped(asks)}` : ''].join(''),
  );

test("in dontAsk, a step with Bash is not told that every command no rule allows is denied: Claude Code's read-only commands ask for none, measured apart from documented, dated — then what the settings allow of what asks", () => {
  const html = allowedMarkup(allowedTo(true), readOnlyReach());
  const texts = textsOf(html);
  assert.ok(texts.includes('Bash it may run'), texts.join(' | '));
  assert.doesNotMatch(html, /a command no rule allows is denied/, 'the sentence B9 left, which a read-only command makes false');
  assert.ok(
    texts.includes(
      "In dontAsk, a command that asks is denied without a prompt unless a rule allows it. Claude Code's read-only commands do not ask:",
    ),
    texts.join(' | '),
  );
  assert.deepEqual(readOnlyChips(html), ['cat', 'grep', 'find:documented', 'git:documented']);
  assert.ok(
    textsOf(html).some((t) =>
      t.startsWith(
        "The solid ones were measured on 2026-09-15 with 2.1.272 (B9's last review): that day, under that day's settings, they ran with no rule allowing them. The dashed ones are named by its docs",
      ),
    ),
    `the measurement is of its day: the words say so, and claim nothing of the settings or the harness today\n${textsOf(html).join(' | ')}`,
  );
  assert.match(
    html,
    /<code data-read-only="cat" title="Measured on 2026-09-15, Claude Code 2\.1\.272: it ran with no rule allowing it, under that day&#x27;s settings"/,
  );
  assert.ok(texts.includes('Of the commands that ask, the settings allow it:'), texts.join(' | '));
  assert.match(html, /<code data-bash="npm test"/);
  assert.doesNotMatch(html, /No Bash command at all/, 'a step whose settings allow no command still runs the read-only ones');
  const none = allowedMarkup({ ...allowedTo(true), rules: [], bash: [] }, readOnlyReach());
  assert.ok(textsOf(none).includes('None.') && readOnlyChips(none).length === 4, textsOf(none).join(' | '));
});

test('REFUSED: a read-only command a deny covers is drawn struck, with the deny — and a step with no Bash, or in no Claude Code, is drawn none', () => {
  const html = allowedMarkup(allowedTo(true), readOnlyReach({ cat: 'Bash(cat:*)', git: 'Bash(git:*)' }));
  assert.deepEqual(readOnlyChips(html), ['cat:Bash(cat:*)', 'grep', 'find:documented', 'git:documented:Bash(git:*)']);
  assert.match(
    html,
    /<code data-read-only="cat" data-denied="Bash\(cat:\*\)" title="Denied by Bash\(cat:\*\) \(.claude\/settings.json\)[^"]*" class="[^"]*line-through/,
  );
  const why = 'Its tools have no `Bash`, so it runs no command, whatever the settings allow.';
  const shut = allowedMarkup({ ...allowedTo(true), rules: [], bash: [], why }, []);
  assert.deepEqual(readOnlyChips(shut), []);
  assert.deepEqual(textsOf(shut), ['Bash it may run', why]);
  assert.deepEqual(readOnlyChips(allowedMarkup({ ...allowedTo(false), why }, null)), []);
});

test('REFUSED: a read-only command an ask rule covers is drawn asking, with the rule said beside it — struck in dontAsk, which denies what asks — and with no ask rule, nothing of it is drawn', () => {
  const html = allowedMarkup(allowedTo(true), readOnlyReach({}, { cat: 'Bash(cat:*)' }, true));
  assert.deepEqual(
    readOnlyChips(html),
    ['cat:Bash(cat:*):asks Bash(cat:*)', 'grep', 'find:documented', 'git:documented'],
    'on a dontAsk step, `ask: ["Bash(cat:*)"]` denies its cat: never solid under "do not ask"',
  );
  assert.match(
    html,
    /<code data-read-only="cat" data-denied="Bash\(cat:\*\)" data-asks="Bash\(cat:\*\)" title="Asks by Bash\(cat:\*\) \(.claude\/settings.json\), which beats the harness&#x27;s own leave, and dontAsk denies what asks" class="[^"]*line-through/,
  );
  assert.ok(textsOf(html).includes('cat asks, by Bash(cat:*) (.claude/settings.json), which dontAsk denies.'), textsOf(html).join(' | '));

  const job = allowedMarkup(allowedTo(false, 'a job'), readOnlyReach({}, { cat: 'Bash(cat:*)' }, true));
  assert.deepEqual(
    readOnlyChips(job),
    ['cat:Bash(cat:*):asks Bash(cat:*)', 'grep', 'find:documented', 'git:documented'],
    'on a job, which asks nobody in any mode, it is struck too',
  );
  assert.match(
    job,
    /<code data-read-only="cat" data-denied="Bash\(cat:\*\)" data-asks="Bash\(cat:\*\)" title="[^"]*, and a job denies what asks" class="[^"]*line-through/,
    'and the words name the job rather than a mode',
  );
  assert.ok(textsOf(job).includes('cat asks, by Bash(cat:*) (.claude/settings.json), which a job denies.'), textsOf(job).join(' | '));
  const jobNone = allowedMarkup({ ...allowedTo(false, 'a job'), rules: [], bash: [] }, readOnlyReach());
  assert.ok(
    textsOf(jobNone).some((t) => t.endsWith('and what would still ask is denied: a job asks nobody.')),
    textsOf(jobNone).join(' | '),
  );

  const asking = allowedMarkup(allowedTo(false), readOnlyReach({ find: 'Bash(find:*)' }, { cat: 'Bash(cat:*)', git: 'Bash(git:*)' }));
  assert.deepEqual(readOnlyChips(asking), [
    'cat:asks Bash(cat:*)',
    'grep',
    'find:documented:Bash(find:*)',
    'git:documented:asks Bash(git:*)',
  ]);
  assert.match(
    asking,
    /<code data-read-only="cat" data-asks="Bash\(cat:\*\)" title="Asks by Bash\(cat:\*\) \(.claude\/settings.json\), which beats the harness&#x27;s own leave" class="[^"]*bg-yours-container text-on-yours-container/,
  );
  assert.doesNotMatch(
    asking.match(/<code data-read-only="cat"[^>]*>/)![0],
    /line-through|bg-surface-variant/,
    'where no denier is claimed — a job in a mode not measured — outside dontAsk, it asks: not struck, and not drawn as running',
  );
  assert.ok(
    textsOf(asking).includes(
      'cat asks, by Bash(cat:*) (.claude/settings.json); find is denied, by Bash(find:*) (.claude/settings.json); read-only git asks, by Bash(git:*) (.claude/settings.json).',
    ),
    textsOf(asking).join(' | '),
  );

  for (const dontAsk of [true, false]) {
    const plain = allowedMarkup(allowedTo(dontAsk), readOnlyReach());
    assert.doesNotMatch(plain, /data-asks|data-read-only-taken/, 'no ask rule: no command marked asking, and no sentence of what is taken');
  }
});

test('REFUSED: an allow an ask rule takes back is drawn apart, with the rule — struck in dontAsk — and a narrower ask rule is said beside the allow it falls in', () => {
  const settings = (rule: string) => ({ rule, source: '.claude/settings.json' });
  const allowed = (dontAsk: boolean): StepReach['allowed'] => ({
    ...allowedTo(dontAsk),
    rules: ['Bash(npm test)', 'Bash(npx turbo run test:*)'],
    asked: [{ rule: 'Bash(git diff:*)', by: settings('Bash(git:*)') }],
    bash: [
      { rule: 'Bash(npm test)', command: 'npm test', except: [], asks: [] },
      {
        rule: 'Bash(npx turbo run test:*)',
        command: 'npx turbo run test:*',
        except: ['Bash(npx turbo run test e2e)'],
        asks: ['Bash(npx turbo run test build)'],
      },
    ],
    exceptions: [
      { rule: 'Bash(npx turbo run test:*)', except: ['Bash(npx turbo run test e2e)'], asks: ['Bash(npx turbo run test build)'] },
    ],
  });
  const shut = allowedMarkup(allowed(true), readOnlyReach());
  assert.ok(
    textsOf(shut).includes('Taken back by an ask rule, which beats an allow, and dontAsk denies what asks:'),
    textsOf(shut).join(' | '),
  );
  assert.match(
    shut,
    /<code data-asked="Bash\(git diff:\*\)" title="Asks by Bash\(git:\*\) \(.claude\/settings.json\)" class="[^"]*line-through/,
  );
  assert.doesNotMatch(shut, /data-bash="git diff/, 'not drawn among what it may run');
  assert.match(shut, /data-asks="npx turbo run test:\*"[^>]*>and asks for Bash\(npx turbo run test build\), which dontAsk denies</);
  assert.doesNotMatch(shut, /data-asks="npm test"/);

  const job = allowedMarkup({ ...allowed(false), askDenier: 'a job' }, readOnlyReach());
  assert.ok(
    textsOf(job).includes('Taken back by an ask rule, which beats an allow, and a job denies what asks:'),
    textsOf(job).join(' | '),
  );
  assert.match(job, /<code data-asked="Bash\(git diff:\*\)"[^>]*class="[^"]*line-through/);
  assert.match(job, /data-asks="Bash\(npx turbo run test:\*\)"[^>]*>and asks for Bash\(npx turbo run test build\), which a job denies</);

  const open = allowedMarkup(allowed(false), readOnlyReach());
  assert.ok(textsOf(open).includes('Taken back by an ask rule, which beats an allow: these ask.'), textsOf(open).join(' | '));
  assert.match(open, /<code data-asked="Bash\(git diff:\*\)"[^>]*class="[^"]*bg-yours-container text-on-yours-container/);
  assert.match(open, /data-except="Bash\(npx turbo run test:\*\)"[^>]*>except Bash\(npx turbo run test e2e\)</);
  assert.match(open, /data-asks="Bash\(npx turbo run test:\*\)"[^>]*>and asks for Bash\(npx turbo run test build\)</);
  assert.doesNotMatch(open, /dontAsk denies/);
  assert.doesNotMatch(allowedMarkup(allowedTo(true), readOnlyReach()), /Taken back by an ask rule/);
});

test("outside dontAsk the settings' allow rules are listed, and the read-only commands after them, in every mode", () => {
  const html = allowedMarkup(allowedTo(false), readOnlyReach());
  const texts = textsOf(html);
  assert.ok(texts.includes('Allowed without asking'), texts.join(' | '));
  assert.match(html, /<code data-allowed="Bash\(npm test\)"/);
  assert.ok(texts.includes("And, in every mode, Claude Code's read-only commands, which ask for no rule:"), texts.join(' | '));
  assert.deepEqual(readOnlyChips(html), ['cat', 'grep', 'find:documented', 'git:documented']);
  assert.doesNotMatch(html, /denied without a prompt/, 'nothing is denied without a prompt outside dontAsk');
});

const HOLDING = {
  at: '2026-09-23T07:00:00.000Z',
  runs: [{ run: 'p-1', missing: false, cancelledAt: null, gone: [], landed: false }],
  word: 'held until p-1 lands',
  advice:
    'nothing of r-1 is filed, and nothing is asked of you, until wf decide says p-1 has landed; to go on before then: wf hold r-1 --off',
  waitingOnYou: false,
};

test('on a run a person holds, a step at its gate is drawn held — no human gate, no waiting on you — and said held, and a step at work is drawn at work', () => {
  for (const status of ['awaiting approval', 'rounds exhausted', 'succeeded · BLOCKED'] as const) {
    const held = nodeMarkup({ ...runOf(status, { waitingOnYou: [] }), holding: HOLDING, holdUntil: ['p-1'] });
    assert.equal(
      gateDrawn(held),
      false,
      `${status}, held, as the api gives a held run: nobody is waited on, and no step offers its approval: ${held}`,
    );
    assert.match(held, /data-state="held"/, status);
    assert.ok(held.includes(`>${PERSON.held.rail}</span>`), `${status}, held, is said as held: ${held}`);
    assert.doesNotMatch(
      nodeMarkup(runOf(status, { waitingOnYou: [] })),
      /data-state="held"/,
      `${status}: the same step on the run unheld is its gate's state, not held; the hold is the one fact that differs`,
    );
  }
  assert.match(
    nodeMarkup({ ...runOf('running (working)', { waitingOnYou: [] }), holding: HOLDING, holdUntil: ['p-1'] }),
    /data-state="working"/,
  );
});

test("a held run's rail draws its gate held, its steps not filed as any step to come (grey blocks read as almost done) whose hover says the hold, and its work at work", () => {
  const held = {
    ...summaryRun(),
    waitingOnYou: [],
    waitingOnYouWords: [],
    toDecide: null,
    holdUntil: ['p-1'],
    holding: HOLDING,
  } as unknown as RunView;
  const html = railMarkup(held);
  const pills = Object.fromEntries([...html.matchAll(/<li data-step="([^"]+)" data-state="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(pills, { implement: 'verified', tokens: 'unverified', review: 'working', theme: 'held', respond: 'waiting' }, html);
  assert.match(
    html,
    /<li data-step="respond" data-state="waiting" title="respond: to come — [^"]*holds the run/,
    'its hover says the hold',
  );
});

test('a hold is drawn between two cards as an --after edge is: from the run it is held until into the held card, dashed — and none once it landed', () => {
  const card = (id: string, held: Array<{ run: string; landed: boolean }>) => ({
    id,
    waiting: null,
    holding: held.length
      ? {
          at: '2026-09-13T00:30:00.000Z',
          runs: held.map((h) => ({ ...h, missing: false, cancelledAt: null, gone: [] })),
          word: '',
          advice: '',
          waitingOnYou: false,
        }
      : null,
  });
  const edges = afterEdges([card('p', []), card('h', [{ run: 'p', landed: false }])]);
  assert.deepEqual(
    edges.map(({ id, source, target, type, data }) => ({ id, source, target, type, data })),
    [{ id: 'hold:p->h', source: 'p', target: 'h', type: 'state', data: { state: 'to-come', loop: false } }],
  );
  assert.match(edgeMarkup(edges[0]), /stroke-dasharray:5 4/);
  assert.deepEqual(afterEdges([card('p', []), card('h', [{ run: 'p', landed: true }])]), [], 'a hold whose run landed is no wait');
});

/** The looping run's one step, at plan's gate with that closeout — or signed off with none, or still running. */
function gatedRun(closeout: StepCloseout | null, status: Word = 'awaiting approval'): RunDetail {
  const run = runOf(status, { waitingOnYou: closeout ? ['review'] : [] });
  const [step] = run.steps;
  return {
    ...run,
    steps: [
      {
        ...step,
        approve: closeout ? 'approve review' : null,
        closeout,
        tries: [{ ...step.tries[0], closeout }],
      },
    ],
  };
}

const tabSelected = (html: string): string | undefined => /aria-selected="true"[^>]*>([A-Za-z]+)</.exec(html)?.[1];

test('a closeout whose body opens with its summary draws the body alone, its line said once: a heading, and a cut line up to its ellipsis', () => {
  const handed = (summary: string, body: string | null) =>
    renderToStaticMarkup(createElement(HandedOn, { closeout: { ...planCloseout, summary, body, output: {}, schema: {} } }));
  const heading = handed('## What I found', '## What I found\n\n- The cap is read on every pass');
  assert.doesNotMatch(heading, /data-summary/, 'a v0 body, its whole text, opens with the summary drawn as its heading');
  assert.match(heading, /<h4[^>]*>What I found<\/h4>/);
  const long = 'Picked the colour tokens for the sky, the sea and the sand, then wrote each down where the theme reads them, with a note';
  const cut = handed(
    'Picked the colour tokens for the sky, the sea and the sand, then wrote each down where the theme reads them, with…',
    long,
  );
  assert.doesNotMatch(cut, /data-summary/, 'a cut summary leads a body that holds it whole');
  assert.match(cut, new RegExp(long));
});

test('a closeout whose body does not open with its summary draws both, and one with no body its summary', () => {
  const handed = (summary: string, body: string | null) =>
    renderToStaticMarkup(createElement(HandedOn, { closeout: { ...planCloseout, summary, body, output: {}, schema: {} } }));
  const both = handed('Capped the runs in flight.', 'The cap is read on every pass, and stored nowhere.');
  assert.match(both, /<p data-summary="true"[^>]*>Capped the runs in flight\.<\/p>/);
  assert.match(both, /data-body="true"[^>]*>.*The cap is read on every pass/s);
  assert.match(handed('Capped the runs in flight.', null), /<p data-summary="true"[^>]*>Capped the runs in flight\.<\/p>/);
});

test('what the run did not accept of a closeout is drawn under its words, each under `not accepted`', () => {
  const why = '`needs` is said on a done closeout: needs is for a blocked one alone.';
  const html = renderToStaticMarkup(
    createElement(HandedOn, { closeout: { ...planCloseout, needs: 'A word from you', refused: [why], output: {}, schema: {} } }),
  );
  assert.ok(textsOf(html).includes(`not accepted: ${why}`), html);
  assert.match(html, /<p data-refused="true"/);
});

test('the inspector opens on Output for a step that has a closeout — at its gate, blocked or done — and on Details for one that has none', () => {
  const inspect = (run: RunDetail) => withClient(createElement(StepTabs, { run, step: run.steps[0] }));
  const atGate = inspect(gatedRun(planCloseout));
  assert.equal(tabSelected(atGate), 'Output');
  assert.match(atGate, /data-field="approach"/, 'the Output tab is drawn: the approach is there without a press');
  assert.match(atGate, /data-answer-at="Details"[^>]*>review waits at its gate on you/, 'and says the answer is under Details');
  const done = inspect(gatedRun({ ...planCloseout, output: {}, schema: {} }, 'succeeded'));
  assert.equal(tabSelected(done), 'Output');
  assert.doesNotMatch(
    inspect({ ...gatedRun(planCloseout, 'succeeded'), waitingOnYou: [] }),
    /data-answer-at/,
    'a step at no gate is not said to wait at one',
  );
  const running = inspect(gatedRun(null, 'running'));
  assert.equal(tabSelected(running), 'Details');
  assert.doesNotMatch(running, /data-closeout/);
});

test("what a gate approves is its summary and each field declared, a plan's approach first and drawn whole, the long ones folded with nothing drawn in them", () => {
  const html = renderToStaticMarkup(createElement(HandedOn, { closeout: planCloseout }));
  assert.ok(html.indexOf('Parse the flag, then store it.') < html.indexOf('data-field="approach"'), 'the summary first');
  assert.match(html, /<h4[^>]*>approach<\/h4>/, 'the approach under its name, never folded');
  assert.match(
    html,
    /<details data-fold="files"[^>]*><summary[^>]*><span[^>]*>files<\/span> · 4<\/summary><\/details>/,
    'four files folded, and nothing drawn in the fold',
  );
  assert.doesNotMatch(html, /store\.ts/, 'no file of the four is in the markup while the fold is shut');
  assert.doesNotMatch(html, /data-fold="(steps|risks)"/, 'two steps and one risk are read at a glance');
  assert.match(
    html,
    /data-field="steps"[\s\S]*Store it[\s\S]*data-field="risks"[\s\S]*An old record has no flag/,
    'steps then risks, in the order declared',
  );
  assert.doesNotMatch(html, /Raw/, 'no Raw switch: the statement whole is the Output tab');
  const summaryAlone = renderToStaticMarkup(createElement(HandedOn, { closeout: { ...planCloseout, output: {}, schema: {} } }));
  assert.doesNotMatch(summaryAlone, /data-field/, 'a step that declared nothing hands on its summary alone');
  assert.match(summaryAlone, /Parse the flag, then store it\./);
});

test("what a gate's approval sends: every answer in the order asked and the note beside them, left out when empty; a gate that asks nothing, its words alone", () => {
  const draft = { [where.title]: { chose: ['gate'], own: '' }, [cut.title]: { chose: [], own: ' Three ways. ' } };
  assert.deepEqual(Gates.approvalBody([cut, where], draft, ' Go. '), {
    answers: [
      { question: cut.title, chose: [], own: 'Three ways.' },
      { question: where.title, chose: ['gate'] },
    ],
    message: ' Go. ',
  });
  assert.deepEqual(Gates.approvalBody([cut, where], draft, '  '), {
    answers: [
      { question: cut.title, chose: [], own: 'Three ways.' },
      { question: where.title, chose: ['gate'] },
    ],
  });
  assert.deepEqual(Gates.approvalBody([], {}, 'Fine.'), { message: 'Fine.' });
  assert.deepEqual(Gates.approvalBody([], {}, ''), {});
});

test("a send-back carries the gate's answers all or none: every one answered goes with it, none goes without, some is held — and a send-back to another step carries none", () => {
  const all = { [cut.title]: { chose: ['a'], own: '' }, [where.title]: { chose: ['retry'], own: '' } };
  const some = { [cut.title]: { chose: ['a'], own: '' } };
  const back = (to: string, draft: Record<string, { chose: string[]; own: string }>, objection: string) =>
    Gates.sendBackBody({ step: 'design', to, mode: 'continue', objection, questions: [cut, where], draft });
  assert.deepEqual(back('design', all, ''), {
    mode: 'continue',
    step: 'design',
    answers: [
      { question: cut.title, chose: ['a'] },
      { question: where.title, chose: ['retry'] },
    ],
  });
  assert.deepEqual(back('design', all, 'Smaller.'), { ...back('design', all, ''), message: 'Smaller.' });
  assert.deepEqual(back('design', {}, 'Smaller.'), { mode: 'continue', message: 'Smaller.', step: 'design' });
  assert.deepEqual(back('plan', all, 'Redo it.'), { mode: 'continue', message: 'Redo it.', step: 'plan' });
  const waits = (to: string, draft: Record<string, { chose: string[]; own: string }>) =>
    Gates.sendBackWaits({ step: 'design', to, questions: [cut, where], draft });
  assert.deepEqual(waits('design', some), [where.title], 'some answered: held until the rest are');
  assert.equal(waits('design', {}).length, 0, 'none answered: the words go alone');
  assert.equal(waits('design', all).length, 0);
  assert.equal(waits('plan', some).length, 0, 'to another step: the answers stay behind');
});

test("what a raise's try sends: the budget typed, and for a step asking questions as data its answers in the order asked, the note left out when empty", () => {
  const draft = { [where.title]: { chose: ['retry', 'gate'], own: '' }, [cut.title]: { chose: ['b'], own: '' } };
  const asked = { mode: 'continue' as const, amount: '3', asks: true, questions: [cut, where], draft };
  const answers = [
    { question: cut.title, chose: ['b'] },
    { question: where.title, chose: ['retry', 'gate'] },
  ];
  assert.deepEqual(raiseBody({ ...asked, message: '' }), { mode: 'continue', budget: 3, answers });
  assert.deepEqual(raiseBody({ ...asked, message: 'Hurry.' }), { mode: 'continue', budget: 3, answers, message: 'Hurry.' });
  assert.deepEqual(raiseBody({ ...asked, amount: ' ', message: '' }), { mode: 'continue', answers });
  assert.deepEqual(raiseBody({ ...asked, questions: [], message: 'Warm.' }), { mode: 'continue', budget: 3, message: 'Warm.' });
  assert.deepEqual(raiseBody({ ...asked, asks: false, questions: [], message: '' }), { mode: 'continue', budget: 3 });
});

test('REFUSED: the Debug panel is closed by default, and reads and draws nothing of the path while it is', async () => {
  const { DebugPanel } = await import('../src/components/step/DebugPanel.tsx');
  const client = new QueryClient();
  const step = { name: 'implement', taskId: 't-1', message: 'running', tries: [{ try: 1, current: true }] };
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client }, createElement(DebugPanel, { run: { id: 'r-1' } as never, step: step as never })),
  );
  assert.match(html, /<section aria-label="Debug"/);
  assert.match(html, /aria-expanded="false"[^>]*>▸ Debug<\/button>/);
  assert.doesNotMatch(
    html,
    /data-path|data-machine|The path|Full width/,
    'no path, graph, timeline or full-width button drawn while closed',
  );
  assert.equal(client.getQueryCache().getAll().length, 0, 'and nothing read: no path, nor the lifecycle it carries');
});

test('a lifecycle state lit is marked data-lit and filled as alive; a route taken is drawn heavier in --edge-taken, and marked data-taken', async () => {
  const { MachineNode } = await import('../src/components/step/MachineNode.tsx');
  const { MachineEdge } = await import('../src/components/step/MachineEdge.tsx');
  const { drawMachine } = await import('../src/lib/machine.ts');
  const drawing = drawMachine({
    initial: 'a',
    states: ['a', 'b'],
    final: ['b'],
    edges: [{ from: 'a', event: 'GO', to: 'b', action: 'go' }],
    verbs: [],
  });
  const node = (lit: boolean) =>
    renderToStaticMarkup(
      createElement(ReactFlowProvider, null, createElement(MachineNode, { data: { ...drawing.states[0], lit } } as never)),
    );
  assert.match(node(true), /data-state="a"[^>]*data-lit="true"[^>]*class="[^"]*ring-alive/);
  assert.match(node(false), /<p data-state-name="true"[^>]*>a<\/p>/, 'the name marked for the e2e to measure its size');
  assert.doesNotMatch(node(false), /data-lit|ring-alive/);
  const edge = (taken: boolean) =>
    renderToStaticMarkup(
      createElement(ReactFlowProvider, null, createElement(MachineEdge, { data: { ...drawing.routes[0], taken } } as never)),
    );
  assert.match(edge(true), /stroke:var\(--edge-taken\);stroke-width:3/);
  assert.match(edge(false), /stroke:var\(--edge-done\);stroke-width:1.5/);
});

test("a machine's states carry the size their layout gave them, so React Flow draws none invisible while it measures one", async () => {
  const { flowOf } = await import('../src/components/step/MachineCanvas.tsx');
  const { drawMachine } = await import('../src/lib/machine.ts');
  const drawing = drawMachine({ initial: 'a', states: ['a', 'b'], final: ['b'], edges: [], verbs: [] });
  const sizes = drawing.states.map((box) => [box.id, box.width, box.height]);
  const { nodes } = flowOf(drawing, undefined, []);
  assert.deepEqual(
    nodes.map((node) => [node.id, node.width, node.height]),
    sizes,
    'each state is as wide and tall as its box on the node itself, where React Flow reads a size it measures nothing for',
  );
});

test("a route only a person's verb takes is drawn dashed; one an edge takes too is drawn solid", async () => {
  const { MachineEdge } = await import('../src/components/step/MachineEdge.tsx');
  const { drawMachine } = await import('../src/lib/machine.ts');
  const drawing = drawMachine({
    initial: 'a',
    states: ['a', 'b', 'c'],
    final: ['c'],
    edges: [
      { from: 'a', event: 'GO', to: 'b', action: 'go' },
      { from: 'b', event: 'END', to: 'c', action: 'end' },
    ],
    verbs: [{ verb: 'close', entry: 'closed', by: 'person', from: ['a', 'b'], to: 'c', guard: 'awaitsWord' }],
  });
  const edge = (id: string) => {
    const route = drawing.routes.find((r) => r.id === id) ?? assert.fail(`no route ${id}`);
    return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(MachineEdge, { data: route } as never)));
  };
  assert.match(edge('a->c'), /stroke:var\(--edge-done\);stroke-width:1.5;stroke-dasharray:6 4/);
  assert.doesNotMatch(edge('b->c'), /stroke-dasharray/, 'an edge takes it as well as the verb');
  assert.doesNotMatch(edge('a->b'), /stroke-dasharray/);
});

test("a workflow's step is marked as inspected only while the bar shows it, and never in the builder", async () => {
  const spec = { ...unset, harness: 'claude', model: 'opus' };
  const shown = await specMarkup(spec, undefined, true);
  assert.match(shown, /data-inspected="true"/, `the step the bar shows is marked: ${shown}`);
  assert.match(shown, /ring-2 ring-ring/, 'and ringed');
  for (const hidden of [await specMarkup(spec), await specMarkup(spec, undefined, false)]) {
    assert.doesNotMatch(hidden, /data-inspected/, `a step the bar does not show is not marked: ${hidden}`);
    assert.doesNotMatch(hidden, /(?<!:)ring-2 ring-ring/, 'nor ringed, but on keyboard focus');
  }
  const building = await specMarkup(spec, { unsaved: false, refused: false, selected: false }, true);
  assert.doesNotMatch(building, /data-inspected/, `the builder's node never takes the bar's mark: ${building}`);
});

/** The bar's body for the step `step` of `listing`, as the bar for a workflow's step draws it. */
async function specBodyMarkup(listing: import('../src/lib/api/workflows.ts').WorkflowListing, step: string): Promise<string> {
  const { SpecBody } = await import('../src/components/step/SpecBar.tsx');
  return renderToStaticMarkup(createElement(SpecBody, { listing, step }));
}

test("the bar for a workflow's step says what it runs on, its keys as its node lists them, and the steps it waits on in the workflow's order", async () => {
  const { workflow, stepSpec } = await import('./library-fixtures.ts');
  const { specLines } = await import('../src/components/step/StepNode.tsx');
  const step = (name: string, extra: Partial<WorkflowStepSpec> = {}) => ({
    name,
    spec: stepSpec({ ...extra }),
    body: '',
    own: { keys: [], body: '' },
    hired: null,
    layers: null,
    mcp: [],
    taskParts: null,
  });
  const listing = workflow({
    name: 'dev',
    steps: [step('plan'), step('implement'), step('review', { agent: 'reviewer', harness: 'claude', model: 'opus' })],
    graph: {
      roots: ['plan'],
      edges: [
        { from: 'implement', to: 'review', kind: 'after' },
        { from: 'plan', to: 'review', kind: 'after' },
        { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
        { from: 'plan', to: 'implement', kind: 'after' },
      ],
    },
  });
  const review = await specBodyMarkup(listing, 'review');
  assert.match(review, /<p[^>]*data-runs-on[^>]*>reviewer · claude · opus<\/p>/, review);
  const labels = [...review.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)].map((m) => m[1]);
  assert.deepEqual(
    labels,
    specLines(listing.steps[2].spec).map(([label]) => label),
    `every key its node lists: ${review}`,
  );
  const many = await specBodyMarkup(
    workflow({ steps: [step('ship', { tools: ['Read', 'Grep', 'Glob', 'Bash'] })], graph: { roots: ['ship'], edges: [] } }),
    'ship',
  );
  assert.match(many, /<dt[^>]*>tools<\/dt><dd[^>]*>Read, Grep, Glob, Bash<\/dd>/, `the tools by name, where the node counts them: ${many}`);
  assert.match(
    review,
    /<p[^>]*data-waits-on[^>]*><span[^>]*>plan, implement<\/span><\/p>/,
    `the sources of its after edges, in the workflow's order, and not the loop's: ${review}`,
  );

  const plan = await specBodyMarkup(listing, 'plan');
  assert.match(plan, /<p[^>]*data-waits-on[^>]*>nothing: it starts first<\/p>/, `a first step waits on nothing: ${plan}`);

  const implement = await specBodyMarkup(listing, 'implement');
  assert.match(implement, /<p[^>]*data-waits-on[^>]*><span[^>]*>plan<\/span><\/p>/, `the edge back a loop makes is no wait: ${implement}`);

  const missing = await specBodyMarkup(listing, 'ship');
  assert.match(missing, /dev has no step named ship\./, missing);
  assert.doesNotMatch(missing, /data-runs-on/, missing);
});

/** The layers of a step whose agent `writer` was given `alpha` and the person's words, its line adding `gamma`, told in its prompt. */
const LAYERS: StepLayers = {
  agent: 'writer',
  instructions: 'You are the writer.',
  custom: 'Be terse.',
  factory: null,
  agentSkills: ['alpha'],
  policy: 'Write the note.',
  addedSkills: ['gamma'],
  fence: [],
  folderFiles: true,
  task: '## What was asked for\n\nA note.',
  via: 'prompt',
};

/** `Told` drawn as a server draws it, the fold open as a person opens it. */
const toldMarkup = (props: { told: string | null; layers: StepLayers | null; filed: boolean }): string =>
  renderToStaticMarkup(createElement(Told, props));

test('what a step was told is drawn by layer, in the order it reads them, each skill under the layer that gives it, and the brief whole never', () => {
  const html = toldMarkup({ told: 'Write the note.\n\n## What was asked for\n\nA note.', layers: LAYERS, filed: true });
  const at = (needle: string): number => {
    const i = html.indexOf(needle);
    assert.ok(i >= 0, `${needle} in ${html}`);
    return i;
  };
  const order = [at('data-layer="instructions"'), at('data-layer="custom"'), at('data-layer="policy"'), at('data-layer="task"')];
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'instructions, custom, policy, task',
  );
  assert.ok(at('Instructions — writer&#x27;s') < at('You are the writer.'));
  assert.ok(order[0] < at('data-skill="alpha"') && at('data-skill="alpha"') < order[1], "the agent's skill under its instructions");
  assert.ok(order[2] < at('data-skill="gamma"') && at('data-skill="gamma"') < order[3], "the step's added skill under its policy");
  assert.ok(at('Be terse.') > order[1] && at('Be terse.') < order[2]);
  assert.equal(html.split('Write the note.').length - 1, 1, 'the policy is drawn once: the brief is not drawn whole beside the layers');
  assert.match(html, /What it was told/);
  assert.match(html, /in the session&#x27;s system prompt/);
  assert.match(toldMarkup({ told: null, layers: { ...LAYERS, via: 'brief' }, filed: false }), /at the head of its brief/);
});

test("the factory's rules are a layer of their own, between your custom instructions and the step's policy, drawn only where the run froze some", () => {
  const html = toldMarkup({ told: null, layers: { ...LAYERS, factory: 'Never push on a **Friday**.' }, filed: true });
  const at = (needle: string): number => {
    const i = html.indexOf(needle);
    assert.ok(i >= 0, `${needle} in ${html}`);
    return i;
  };
  const order = [at('data-layer="custom"'), at('data-layer="factory"'), at('data-layer="policy"')];
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'custom, factory, policy',
  );
  const layer = html.slice(order[1], order[2]);
  assert.match(layer, /<h4[^>]*>4\. The factory&#x27;s rules<\/h4>/);
  assert.match(layer, /Never push on a <strong>Friday<\/strong>\./, 'its words, as the markdown they are');
  assert.equal(html.split('Friday').length - 1, 1, 'drawn once');
  assert.match(html, /The agent&#x27;s instructions, yours and the factory&#x27;s rules were\s+frozen at the start of the run/);

  const none = toldMarkup({ told: null, layers: LAYERS, filed: true });
  assert.doesNotMatch(none, /data-layer="factory"|factory&#x27;s rules/, 'a run that froze none draws no layer for them, nor names them');
  assert.match(none, /The agent&#x27;s instructions and yours were\s+frozen at the start of the run/);
});

test("the folder's files are a layer of their own, third, numbered as the session is told them, and drawn only where the step reads a folder", () => {
  const html = toldMarkup({ told: null, layers: { ...LAYERS, factory: 'Never push on a Friday.' }, filed: true });
  const at = (needle: string): number => {
    const i = html.indexOf(needle);
    assert.ok(i >= 0, `${needle} in ${html}`);
    return i;
  };
  const order = ['instructions', 'custom', 'folder', 'factory', 'policy', 'task'].map((name) => at(`data-layer="${name}"`));
  assert.deepEqual(
    [...order].sort((a, b) => a - b),
    order,
    'instructions, custom, folder, factory, policy, task',
  );
  const layer = html.slice(order[2], order[3]);
  assert.match(layer, /<h4[^>]*>3\. The folder&#x27;s files<\/h4>/);
  assert.match(layer, /The session reads them itself/, 'the layer says the session reads them, the board having none to draw');
  assert.doesNotMatch(layer, /data-markdown/, 'nothing of them is frozen on the run, so none is drawn as words');
  const heads = [
    /<h4[^>]*>1\. Instructions — writer&#x27;s<\/h4>/,
    /<h4[^>]*>2\. Your custom instructions<\/h4>/,
    /<h4[^>]*>5\. The step&#x27;s policy<\/h4>/,
  ];
  for (const head of heads) assert.match(html, head);
  assert.match(html, /the higher number wins, and the task is above them all\./, 'the fold says what the numbers mean');

  const elsewhere = toldMarkup({ told: null, layers: { ...LAYERS, folderFiles: false }, filed: true });
  assert.doesNotMatch(elsewhere, /data-layer="folder"/, 'a step that reads no folder here is told of none');
});

test('the task is drawn in its parts: its text, and each run it was handed a block headed by how, linked to the run — a run handed neither way a plain block', async () => {
  const parts: TaskPart[] = [
    { kind: 'text', text: 'Do the work.' },
    { kind: 'from', run: 'cache-a1', asked: 'Build the cache.', body: 'It built **the cache**.', how: 'waited' },
    { kind: 'from', run: 'probe-b2', asked: 'Measure the cache.', body: 'Not landed, not judged.', how: 'read' },
    { kind: 'from', run: 'old-c3', asked: '', body: 'An older section.' },
  ];
  const html = await routedWith(createElement(Told, { told: null, layers: LAYERS, parts, filed: true }));
  const task = html.slice(html.indexOf('data-layer="task"'));
  assert.ok(task.indexOf('Do the work.') < task.indexOf('data-from-run="cache-a1"'), 'in the order the task has them');
  const block = (run: string) => new RegExp(`<section data-from-run="${run}"[\\s\\S]*?</section>`).exec(task)?.[0] ?? '';
  assert.match(block('cache-a1'), /data-how="waited"/);
  assert.match(block('cache-a1'), /href="\/runs\/cache-a1"[^>]*>Waited on, landed · Build the cache\. ↗<\/a>/);
  assert.match(block('cache-a1'), /<strong>the cache<\/strong>/, 'its body drawn as markdown');
  assert.match(block('probe-b2'), /href="\/runs\/probe-b2"[^>]*>Read as context · Measure the cache\. ↗<\/a>/);
  assert.doesNotMatch(task, /data-from-run="old-c3"|href="\/runs\/old-c3"/);
  assert.match(task, /From run old-c3[\s\S]*An older section\./);
  assert.doesNotMatch(task, /What was asked for/, "the task's words whole are not drawn beside its parts");
});

test("a layer the run froze none of says so; a step with no agent draws no agent's layer; a run that froze no layers draws its brief whole", () => {
  const unwritten = toldMarkup({ told: 'x', layers: { ...LAYERS, custom: null, agentSkills: [], addedSkills: [] }, filed: true });
  assert.match(unwritten, /data-layer="custom"[^]*None frozen on this run[^]*data-layer="policy"/);
  assert.doesNotMatch(unwritten, /data-skill|Its skills|Adds the skills/);

  const agentless = toldMarkup({
    told: 'x',
    layers: { ...LAYERS, agent: null, instructions: null, custom: null, agentSkills: [] },
    filed: true,
  });
  assert.doesNotMatch(agentless, /data-layer="instructions"|data-layer="custom"/);
  assert.match(
    agentless,
    /No agent: of the words Nemia composes, its own are all it was told\. Where two of them say different things, the higher number wins, and the task is above them all\.[^]*data-layer="folder"[^]*data-layer="policy"/,
    "a step with no agent is still told the folder's files, and which number wins",
  );

  const whole = toldMarkup({ told: 'Write the note.\n\n## What was asked for', layers: null, filed: false });
  assert.match(whole, /What it would be told now/);
  assert.match(whole, /<p[^>]*>Write the note\.<\/p>\s*<h6[^>]*>What was asked for<\/h6>/, 'the brief whole, as the markdown it is');
  assert.doesNotMatch(whole, /data-layer/);
  assert.equal(toldMarkup({ told: null, layers: null, filed: true }), '', 'nothing to fold, no fold');
});

/** A step of yours, `w/review`, read in the factory `hiring`, which hires `writer` into it: what its page draws. */
const hiredPage = async (extra: Record<string, unknown> = {}) => {
  const { stepPage } = await import('./library-fixtures.ts');
  return stepPage({
    workflow: 'w',
    from: 'yours',
    dir: '/store/workflows/w',
    step: 'review',
    factory: 'hiring',
    layers: { ...LAYERS, task: null },
    hired: 'writer',
    skillsFrom: [
      { name: 'alpha', from: 'yours', foundIn: null },
      { name: 'gamma', from: null, foundIn: null },
    ],
    ...extra,
  });
};

test("on a step's page, a skill named with its folder is drawn as written, the repository's, with where it was found and no link", async () => {
  const { StepTold } = await import('../src/components/step/StepParts.tsx');
  const page = await hiredPage({
    layers: { ...LAYERS, task: null, addedSkills: ['apps/site:set-type', 'gamma'] },
    skillsFrom: [
      { name: 'alpha', from: 'yours', foundIn: null },
      { name: 'apps/site:set-type', from: null, foundIn: 'apps/site/.claude/skills/set-type' },
      { name: 'gamma', from: null, foundIn: null },
    ],
  });
  const html = await routedWith(createElement(StepTold, { page, place: { factory: 'hiring' } }));
  const chip = (name: string): string =>
    new RegExp(`data-skill="${name}"[^>]*>[^]*?</span>(?=\\s*(<span[^>]*data-skill=|</))`).exec(html)?.[0] ?? '';
  assert.match(chip('alpha'), /<a[^>]*href="\/agents\/skills\/yours\/alpha"/, 'one with a page stays linked');
  const folder = chip('apps/site:set-type');
  assert.match(
    folder,
    /data-skill-found-in="apps\/site\/\.claude\/skills\/set-type"\s*title="apps\/site\/\.claude\/skills\/set-type"[^>]*>apps\/site:set-type\s*<span[^>]*>· this repository</,
  );
  assert.doesNotMatch(folder, /<a\b/, 'no link: it has no page');
  assert.doesNotMatch(html, /href="\/agents\/skills\/[^"]*(:|%3A)/i, 'and no address of a page that would be refused');
  assert.match(html, /data-skill="gamma"[^>]*>gamma</, 'one found nowhere: its name alone');
  assert.doesNotMatch(chip('gamma'), /data-skill-found-in/);
});

test("on a step's page, what it will be told is drawn open, each layer beside where it is edited, the agent's words folded and the task left to the brief", async () => {
  const { StepTold } = await import('../src/components/step/StepParts.tsx');
  const html = await routedWith(createElement(StepTold, { page: await hiredPage(), place: { factory: 'hiring' } }));
  assert.match(html, /<details open=""[^>]*data-will-be-told[^>]*><summary[^>]*>What it will be told<\/summary>/);
  assert.match(html, /data-read-now[^>]*>Read now from the files, and frozen when a run starts/);
  assert.match(html, /<details data-instructions-fold="true">[^]*You are the writer\./, "the agent's words folded, closed");
  const home = (name: string): string => new RegExp(`<span data-home="${name}"[^]*?</span>`).exec(html)?.[0] ?? '';
  assert.match(home('instructions'), /href="\/agents\/yours\/writer"/);
  assert.match(home('custom'), /href="\/agents\/yours\/writer#custom-instructions"/);
  assert.match(home('policy'), /href="\/workflows\/yours\/w\?factory=hiring&amp;build=true"/, 'one of yours: its builder, in the place');
  assert.match(html, /data-skill="alpha"[^>]*><a[^>]*href="\/agents\/skills\/yours\/alpha"/, 'a skill found: linked to its page');
  assert.match(html, /data-skill="gamma"[^>]*>gamma</, 'a skill found nowhere: its name alone');
  assert.match(html, /data-layer="task"[^>]*>Then the task: the brief a run is started with\./);
  assert.doesNotMatch(html, /Not composed|What it was told|What it would be told now/);
  assert.match(home('factory'), /written on[^]*href="\/factories\/hiring\/settings"[^>]*>hiring&#x27;s Settings</, "the rules' home");
  assert.match(
    html,
    /data-layer="factory"[^]*This step is told none: the factory keeps none that can be told, or the step is on a remote agent[^]*data-layer="policy"/,
    'told none, the page says so of the step: its factory may keep rules that cannot be told, or that a remote agent is not told',
  );
  assert.doesNotMatch(
    html,
    /None written: this factory|tells its agents no rules/,
    'never that the factory wrote none, which it cannot know',
  );
  const ruled = await routedWith(
    createElement(StepTold, {
      page: await hiredPage({ layers: { ...LAYERS, task: null, factory: 'Never push on a Friday.' } }),
      place: { factory: 'hiring' },
    }),
  );
  assert.match(ruled, /data-layer="custom"[^]*data-layer="factory"[^]*Never push on a Friday\.[^]*data-layer="policy"/);
  assert.doesNotMatch(ruled, /This step is told none/);
  assert.match(
    ruled,
    /data-read-now[^>]*>[^<]*, the agent&#x27;s words, yours and the factory&#x27;s rules (in its system prompt|at the head)/,
  );
  assert.match(html, /data-read-now[^>]*>[^<]*, the agent&#x27;s words and yours (in its system prompt|at the head of its brief)\./);

  const repo = await routedWith(
    createElement(StepTold, { page: await hiredPage({ from: 'repo', dir: '/code/app/workflows/w' }), place: {} }),
  );
  assert.match(
    repo,
    /data-home="policy"[^>]*>lives in <code[^>]*>\/code\/app\/workflows\/w\/review\.md<\/code>/,
    "the repository's: its file",
  );
  assert.doesNotMatch(repo, /build=true/);
  const nowhere = await routedWith(createElement(StepTold, { page: await hiredPage({ factory: null, hired: null }), place: {} }));
  assert.doesNotMatch(nowhere, /data-layer="factory"|data-home="factory"/, 'read in no factory: no rules to tell, and no layer for them');
});

test("a step's agent: the one the factory picked hires, marked hired; else its file's, and each factory that hires into it, linked to this page there", async () => {
  const { StepAgent } = await import('../src/components/step/StepParts.tsx');
  const hired = await routedWith(createElement(StepAgent, { page: await hiredPage() }));
  assert.match(hired, /href="\/agents\/yours\/writer"/);
  assert.match(hired, /data-hired="hiring"[^>]*>hired by hiring</);
  assert.doesNotMatch(hired, /data-hired-in/);

  const plain = await routedWith(
    createElement(StepAgent, {
      page: await hiredPage({
        factory: null,
        hired: null,
        keys: [{ key: 'agent', value: 'scribe', meaning: 'The agent.' }],
        hiredIn: [{ factory: 'hiring', agent: 'writer' }],
      }),
    }),
  );
  assert.match(plain, /href="\/agents\/yours\/scribe"[^]*named by its file/);
  assert.doesNotMatch(plain, /data-hired=/);
  assert.match(
    plain,
    /Hired into this step by:[^]*data-hired-in="hiring"[^>]*href="\/workflows\/yours\/w\/review\?factory=hiring"[^>]*>hiring</,
  );
  assert.match(
    await routedWith(createElement(StepAgent, { page: await hiredPage({ factory: null, hired: null, keys: [] }) })),
    /Its file names no agent\./,
  );
});

/**
 * StepHire for the step `review` of `w`, read in `place` (the factory `hiring` unless said) from `page`'s answer, drawn on the step's
 * page or a row.
 */
const hireOn = async (
  page: Record<string, unknown> | null,
  where: 'page' | 'row' = 'page',
  place: { factory?: string } = { factory: 'hiring' },
): Promise<string> => {
  const { StepHire } = await import('../src/components/step/StepHire.tsx');
  const { stepQuery } = await import('../src/lib/api/workflows.ts');
  const read = await hiredPage(page ?? {});
  const store = { workflows: '/store/workflows', agents: '/store/agents', skills: '/store/skills', fileFactory: '', turnOnNemia: '' };
  return routedWith(createElement(StepHire, { from: read.from, workflow: 'w', step: 'review', place, where }), [
    ...(page === null ? [] : [[stepQuery(read.from, 'w', 'review', place).queryKey, read] as [readonly unknown[], unknown]]),
    [['store'], store],
  ]);
};

const PICKABLE = {
  refused: null,
  agents: [
    { name: 'ada', description: 'Builds it.' },
    { name: 'scribe', description: null },
  ],
};

test('hiring into a step: the agent hired with Fire; else the picker of the agents beside it, with Hire and, on yours, New agent', async () => {
  const hired = await hireOn({});
  assert.match(hired, /hiring hires[^]*href="\/agents\/yours\/writer"[^]*into this step\./);
  assert.match(hired, /data-fire="writer"[^>]*>Fire</);
  assert.doesNotMatch(hired, /data-hire-picker|data-new-agent|data-hire-refused/, 'a step hired into is fired before another is hired');

  const open = await hireOn({ hired: null, hiring: PICKABLE });
  assert.match(open, /data-hire-picker/);
  assert.match(open, />Hire into this step in hiring</);
  assert.match(open, /data-hire="true"[^>]*disabled=""[^>]*>Hire</, 'Hire waits for an agent picked');
  assert.match(open, /<option value="ada">ada<\/option><option value="scribe">scribe<\/option>/);
  assert.doesNotMatch(open, /data-fire/);
  assert.match(
    open,
    /data-new-agent[^>]*href="\/agents\/new\?factory=hiring&amp;workflow=w&amp;step=review"[^>]*>New agent, hired into this step</,
    'New agent carries the step it comes back to hire into',
  );
  assert.doesNotMatch(open, /data-new-agent-repo/);

  const none = await hireOn({ hired: null, hiring: { refused: null, agents: [] } });
  assert.match(none, /data-hire-none[^>]*>None of your agents reads, so there is no agent to hire into this step in hiring\./);
  assert.match(none, /data-new-agent/, 'and New agent writes the first');
});

test("REFUSED, hiring into a step: the package's words said in place, and no picker, Fire nor New agent", async () => {
  const refused = "The step's own file names its agent, `agent: scribe`, which fills it in every factory.";
  const html = await hireOn({ hired: null, hiring: { refused, agents: [] } });
  assert.match(
    html,
    /data-hire-refused[^>]*>The step&#x27;s own file names its agent, `agent: scribe`, which fills it in every factory\.</,
  );
  assert.doesNotMatch(html, /data-hire-picker|data-fire|data-new-agent/);
});

test("hiring into one of the repository's steps: no New agent; its page says one is added through a card or by copying it into yours", async () => {
  const page = await hireOn({ hired: null, from: 'repo', hiring: PICKABLE });
  assert.match(page, /data-hire-picker/, "the repository's agents are hired as yours are");
  assert.doesNotMatch(page, /data-new-agent=/);
  assert.match(
    page,
    /data-new-agent-repo[^>]*>A new agent for the factory&#x27;s workflow is added through a card on the[^]*href="\/inbox"[^]*, or by copying the workflow&#x27;s folder into <code[^>]*>\/store\/workflows\/<\/code>/,
  );
  const none = await hireOn({ hired: null, from: 'repo', hiring: { refused: null, agents: [] } });
  assert.match(
    none,
    /data-hire-none[^>]*>None of the factory&#x27;s agents reads, so there is no agent to hire into this step in hiring\./,
  );
  assert.doesNotMatch(
    page + none,
    /this repository/,
    "refused: read in a named factory, whose folder may be its own, it is never this repository's",
  );
  const row = await hireOn({ hired: null, from: 'repo', hiring: PICKABLE }, 'row');
  assert.match(row, /data-hire-picker/);
  assert.doesNotMatch(row, /data-new-agent/, 'a row says no more than its controls');
});

/** `element` drawn as the root route's page at the address `at`, loaded, so it reads the address, with its queries already answered. */
async function routedAt(
  at: string,
  element: ReturnType<typeof createElement>,
  data: Array<[readonly unknown[], unknown]>,
): Promise<string> {
  const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } = await import('@tanstack/react-router');
  const client = new QueryClient();
  for (const [key, value] of data) client.setQueryData(key, value);
  const root = createRootRoute({ component: () => createElement(QueryClientProvider, { client }, element) });
  const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: [at] }) });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

test("REFUSED: the step's bar reads in the address's factory — its folder there, never the list read with none; and a factory that lists nowhere is said in the bar", async () => {
  const { SpecBar } = await import('../src/components/step/SpecBar.tsx');
  const { workflow, stepSpec } = await import('./library-fixtures.ts');
  const step = (name: string) => ({ name, spec: stepSpec(), body: '', own: null, hired: null, layers: null, mcp: [] });
  const listing = (steps: string[]) => workflow({ name: 'dev', from: 'repo', steps: steps.map(step), error: null });
  const bar = createElement(SpecBar, { from: 'repo', workflow: 'dev', step: 'draft' });
  const quay = filed('quay', { repos: ['/a', '/b'] });
  const pipao = filed('pipao', { repos: ['/code/pipao'] });
  const data: Array<[readonly unknown[], unknown]> = [
    [['factories'], [quay, pipao]],
    [['workflows'], [listing(['implement'])]],
    [['factory-workflows', 'pipao', '/code/pipao'], [listing(['draft'])]],
  ];
  const at = (factory: string) => `/?factory=${factory}&bar=spec%3Arepo%2Fdev%2Fdraft`;
  const placed = await routedAt(at('pipao'), bar, data);
  assert.match(placed, /data-runs-on/, "the factory's folder has the step");
  assert.match(placed, /the factory&#x27;s/);
  assert.doesNotMatch(placed, /has no step named|this repository/);
  assert.match(
    await routedAt('/?bar=spec%3Arepo%2Fdev%2Fdraft', bar, data),
    /dev has no step named draft\./,
    'with no factory, the list read with none',
  );
  const gone = await routedAt(at('gone'), bar, data);
  assert.match(gone, /data-unplaced[^>]*>No factory is named gone\.</);
  assert.doesNotMatch(gone, /data-runs-on|has no step named/, 'no list is read for it');
  assert.match(await routedAt(at('quay'), bar, data), /data-unplaced[^>]*>The factory quay works on 2 repositories/);
});

test('hiring into a step draws nothing before its read is there', async () => {
  assert.equal(await hireOn(null), '');
});

test("REFUSED, hiring into a step with no factory picked: nothing is drawn — not the default factory's refusal, which is said in it", async () => {
  const refused = '`default` is the default factory: a hire names a factory of yours.';
  const page = { factory: null, hired: null, hiring: { refused, agents: [] } };
  assert.equal(await hireOn(page, 'page', {}), '', 'under All factories, the step says nothing of a hire');
  assert.match(
    await hireOn(page, 'page', { factory: 'default' }),
    /data-hire-refused[^>]*>`default` is the default factory: a hire names a factory of yours\.</,
    'in the default factory, picked, why none is hired',
  );
});

test("a step's file draws its own words, never the agent's the loader fills its body with, and says the agent row is the hire's", async () => {
  const { StepWritten } = await import('../src/components/step/StepParts.tsx');
  const hired = await routedWith(
    createElement(StepWritten, {
      page: await hiredPage({ body: 'You are the writer.', keys: [{ key: 'agent', value: 'writer', meaning: 'The agent.' }] }),
    }),
  );
  assert.match(hired, /<p[^>]*>Write the note\.<\/p>/, "the step's policy, as its file says it");
  assert.doesNotMatch(hired, /You are the writer\./, "not the hire's instructions");
  assert.match(hired, /data-hired-row[^>]*> In hiring, <code>agent<\/code> is its hire, not the file&#x27;s\./);
  assert.doesNotMatch(
    await routedWith(createElement(StepWritten, { page: await hiredPage({ factory: null, hired: null }) })),
    /data-hired-row/,
    'with no hire, the rows are the file’s',
  );
});

test("a step's recent runs link to the step on each run's page, filed or not reached yet; none says so", async () => {
  const { RecentRuns } = await import('../src/components/step/StepParts.tsx');
  const recentRuns = [
    { id: 'r-1', brief: '# Add a cache\n\nKeep it small.', createdAt: '2026-10-01T12:00:00Z', factory: 'hiring', filed: true },
    { id: 'r-2', brief: 'Fix the bug', createdAt: '2026-10-02T12:00:00Z', factory: null, filed: false },
  ];
  const html = await routedWith(createElement(RecentRuns, { page: await hiredPage({ recentRuns }) }));
  assert.match(
    html,
    /data-recent-run="r-1"[^]*href="\/runs\/r-1#step-review"[^>]*>Add a cache<[^]*data-factory-tag="hiring"[^]*What it was told/,
  );
  assert.match(html, /data-recent-run="r-2"[^]*href="\/runs\/r-2#step-review"[^>]*>Fix the bug<[^]*not reached yet/);
  assert.match(await routedWith(createElement(RecentRuns, { page: await hiredPage() })), /No run holds this step yet in hiring\./);
});

test("a run's step links to the step's page in the run's place, and a run whose workflow the board pages on no address links none", async () => {
  const { StepPageLink } = await import('../src/components/step/StepParts.tsx');
  const html = await routedWith(
    createElement(StepPageLink, { page: { from: 'yours', workflow: 'w', factory: 'hiring', repo: null }, step: 'review' }),
  );
  assert.match(html, /href="\/workflows\/yours\/w\/review\?factory=hiring"[^>]*>What it will be told now →</);
  assert.equal(await routedWith(createElement(StepPageLink, { page: null, step: 'review' })), '');
});

test("an agent's custom instructions are anchored, so a step's page links to where they are written", async () => {
  const { CustomInstructions } = await import('../src/components/step/CustomInstructions.tsx');
  assert.match(await routedWith(createElement(CustomInstructions, { name: 'writer' })), /<section id="custom-instructions"/);
});

test("an agent's custom instructions say a run keeps the words it froze; the store's own agent's, beside her rules, that her open session is told them", async () => {
  const { CustomInstructions } = await import('../src/components/step/CustomInstructions.tsx');
  const { PolicyRules } = await import('../src/components/nemia/PolicyRules.tsx');
  const hired = await routedWith(createElement(CustomInstructions, { name: 'writer' }));
  assert.match(hired, /data-custom-frozen[^>]*>A run already started keeps the words it froze/, 'a hired agent: a run keeps what it froze');
  assert.match(hired, /wherever it is hired/);
  assert.doesNotMatch(hired, /data-custom-told|open session/);
  const hers = await routedWith(createElement(PolicyRules, { agent: 'nemia' }));
  assert.match(hers, /<section id="custom-instructions"/, 'her rules sit beside her custom instruction');
  assert.match(
    hers,
    /data-custom-told[^>]*>Her open session is told a save or a clear at her keeper’s next beat, within seconds: no restart/,
  );
  assert.doesNotMatch(
    hers,
    /data-custom-frozen|A run already started|wherever it is hired|runs started from now|next filed|keeps the words it was filed with/,
    'no run freezes her words',
  );
});

/** `StepPolicy` drawn as a server draws it. */
const policyMarkup = (layers: StepLayers): string => renderToStaticMarkup(createElement(StepPolicy, { layers }));

/** The layers of `LAYERS`, its step tightening the agent's fence with a deny of its own. */
const FENCED: StepLayers = { ...LAYERS, fence: [{ key: 'disallowedTools', value: 'Bash(git push:*)' }] };

test('the fence lines a step tightens are drawn under its policy layer, and under no other', () => {
  const html = toldMarkup({ told: null, layers: FENCED, filed: true });
  const fence = html.indexOf('data-fence="disallowedTools"');
  assert.ok(fence > html.indexOf('data-layer="policy"') && fence < html.indexOf('data-layer="task"'), html);
  assert.match(html, /Tightens writer&#x27;s fence:[^]*disallowedTools: Bash\(git push:\*\)/);
  assert.doesNotMatch(toldMarkup({ told: null, layers: LAYERS, filed: true }), /data-fence|Tightens/, 'no fence line, no fence');
});

test("each layer is drawn as the markdown it is: its source's line breaks joined, its marks drawn, no heading above the layer's own", () => {
  const layers = {
    ...LAYERS,
    instructions: '# Role\n\nYou **write**.',
    policy: 'Do **this**:\n\n- one\n- two',
    task: 'A line\nwrapped.',
  };
  const html = toldMarkup({ told: null, layers, filed: true });
  const layer = (name: string): string => new RegExp(`<section data-layer="${name}"[^]*?</section>`).exec(html)![0];
  assert.match(layer('policy'), /<strong>this<\/strong>[^]*<ul[^>]*>\s*<li[^>]*>one<\/li>/);
  assert.doesNotMatch(layer('policy'), /\*\*/);
  assert.match(layer('task'), /<div data-markdown="true"[^>]*><p[^>]*>A line\nwrapped\.<\/p><\/div>/, 'one paragraph, its break a space');
  assert.match(layer('instructions'), /<h5[^>]*>Role<\/h5>/, "a text's `#` sits under the layer's h4");
  assert.doesNotMatch(html, /<pre|whitespace-pre/, 'no layer keeps its source lines');
  assert.match(policyMarkup(layers), /data-layer="policy"[^]*<strong>this<\/strong>[^]*<li[^>]*>two<\/li>/, 'at the gate, the same');
});

test("at a gate, the step's policy is drawn open: its words, the skills it adds, its fence lines, and what was told before it — never the agent's words", () => {
  const html = policyMarkup(FENCED);
  assert.match(html, /data-gate-policy[^]*data-layer="policy"[^]*The step&#x27;s policy[^]*Write the note\./);
  assert.match(html, /data-skill="gamma"/);
  assert.doesNotMatch(html, /data-skill="alpha"/, "the agent's own skill is the agent's layer");
  assert.match(html, /data-fence="disallowedTools"/);
  assert.match(html, /Told after writer&#x27;s instructions and your custom instructions; where they conflict, this wins\./);
  assert.doesNotMatch(html, /You are the writer\.|Be terse\./, "the agent's words and the person's are in the fold, not here");
  assert.match(policyMarkup({ ...LAYERS, custom: null }), /Told after writer&#x27;s instructions; where they conflict/);
  assert.match(
    policyMarkup({ ...LAYERS, factory: 'Never push.' }),
    /Told after writer&#x27;s instructions, your custom instructions and the factory&#x27;s rules; where they conflict, this wins\./,
  );
  assert.match(
    policyMarkup({ ...LAYERS, custom: null, factory: 'Never push.' }),
    /Told after writer&#x27;s instructions and the factory&#x27;s rules; where they conflict/,
  );
  assert.doesNotMatch(policyMarkup({ ...LAYERS, factory: 'Never push.' }), /Never push\./, 'the rules are in the fold, not here');
  assert.match(
    policyMarkup({ ...LAYERS, policy: '', addedSkills: [], fence: [] }),
    /No words of its own: writer&#x27;s instructions are all it was told/,
  );
  assert.equal(
    policyMarkup({ ...LAYERS, agent: null, instructions: null, custom: null }),
    '',
    'a step with no agent has no policy over one',
  );
});

/** `StepBody` drawn as a server draws it. */
const bodyMarkup = (body: string | null, layers: StepLayers | null): string =>
  renderToStaticMarkup(createElement(StepBody, { body, layers }));

test("REFUSED: a step whose run froze its layers draws no body above its fold, which says each of the body's words by layer", () => {
  assert.equal(bodyMarkup('You are the writer.\n\nBe terse.\n\nWrite the note.', LAYERS), '', "an agent's step");
  assert.equal(bodyMarkup('Read the note.', { ...LAYERS, agent: null, instructions: null, custom: null }), '', 'a step with no agent');
});

test('a step whose run froze no layers draws its body, all the record says of its words; an empty body draws nothing', () => {
  assert.match(bodyMarkup('Write the **note**.', null), /<div data-markdown="true"[^>]*><p[^>]*>Write the <strong>note<\/strong>\.<\/p>/);
  assert.equal(bodyMarkup(null, null), '');
  assert.equal(bodyMarkup('', null), '');
});

/** `StepForm` for one step of `writer`'s, inside a router, with the listing's layers `layers`: its agent, a policy key and a wiring key. */
async function stepFormMarkup(layers: StepLayers | null, agent: string | null = 'writer'): Promise<string> {
  const { StepForm } = await import('../src/components/step/StepForm.tsx');
  const { keyForm, stepSpec } = await import('./library-fixtures.ts');
  const { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
  const form = keyForm({
    keys: [
      { key: 'workspace', meaning: 'Where the step works.', kind: 'choice', choices: ['main'], byHarness: null },
      { key: 'disallowedTools', meaning: 'What it may never run.', kind: 'list', choices: null, byHarness: null },
      { key: 'agent', meaning: 'Who it is.', kind: 'choice', choices: ['writer'], byHarness: null },
    ],
  });
  const step = {
    name: 'write',
    spec: stepSpec({ agent, disallowedTools: ['Bash(git push:*)'] }),
    body: 'Write the note.',
    own: agent === null ? null : { keys: ['agent', 'disallowedTools'], body: 'Write the note.' },
    schema: null,
  };
  const element = createElement(StepForm, {
    step,
    steps: [step],
    form,
    schemas: [],
    refused: null,
    layers,
    update: () => {},
    onRemoved: () => {},
  } as never);
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  return renderToStaticMarkup(createElement(RouterContextProvider, { router, children: element }));
}

test("a step with an agent is read by layer on the builder: its agent, the agent's instructions folded, your custom instructions, then the step's policy holding its words and its fence keys, then its wiring", async () => {
  const html = await stepFormMarkup(LAYERS);
  const at = (mark: string): number => {
    const index = html.indexOf(mark);
    assert.ok(index >= 0, `${mark} in ${html}`);
    return index;
  };
  const order = [
    'data-field="agent"',
    'data-layer="instructions"',
    'You are the writer.',
    'data-layer="custom"',
    'Be terse.',
    'data-layer="policy"',
    'Its words',
    'data-field="disallowedTools"',
    'data-field="workspace"',
  ].map(at);
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    html,
  );
  assert.match(html, /<details[^>]*>[^]*Read them[^]*You are the writer\.[^]*<\/details>/, 'the instructions are folded');
  assert.equal(html.split('data-field="disallowedTools"').length - 1, 1, 'a policy key is drawn once: never again among the wiring keys');
  assert.match(html, /May only tighten writer&#x27;s fence/);
  assert.match(html, /Told after writer&#x27;s instructions and your custom instructions; where they conflict, these words win\./);

  assert.doesNotMatch(html, /data-layer="factory"/, 'a listing that read no rules draws no layer for them');
  const ruled = await stepFormMarkup({ ...LAYERS, factory: 'Never push on a Friday.' });
  assert.match(ruled, /data-layer="custom"[^]*data-layer="factory"[^]*Never push on a Friday\.[^]*data-layer="policy"/);
  assert.match(
    ruled,
    /Told after writer&#x27;s instructions, your custom instructions and the factory&#x27;s rules; where they conflict, these words win\./,
  );

  const uncustomised = await stepFormMarkup({ ...LAYERS, custom: null });
  assert.match(uncustomised, /data-layer="custom"[^]*None\. Write them on[^]*writer[^]*&#x27;s page\./);
  assert.match(uncustomised, /Told after writer&#x27;s instructions; where they conflict/);

  const unread = await stepFormMarkup({ ...LAYERS, agent: 'critic' });
  assert.match(unread, /data-agent-layers-unread[^>]*>Save to read writer&#x27;s instructions here\./);
  assert.match(
    unread,
    /Told after writer&#x27;s instructions, and any custom instructions you wrote for it; where they conflict, these words win\./,
    'unread, the note claims no custom instructions it has not read',
  );
  assert.doesNotMatch(unread, /You are the writer\.|data-layer="instructions"/, "another agent's words are never drawn as this one's");

  const agentless = await stepFormMarkup(null, null);
  assert.doesNotMatch(agentless, /data-layer|data-agent-note/);
  assert.match(agentless, /What it is told/);
});

test("a workflow's steps, a row each: an agent's step by its policy, its agent linked and its skills; one without by its body and its own skills; each linked to its page", async () => {
  const { StepRows } = await import('../src/components/step/StepRows.tsx');
  const { workflow, stepSpec } = await import('./library-fixtures.ts');
  const layers = {
    agent: 'ada',
    instructions: 'Build what was asked.',
    custom: null,
    factory: null,
    agentSkills: ['implement-a-change'],
    policy: 'Keep the **diff** small.',
    addedSkills: ['look'],
    fence: [],
    folderFiles: true,
    task: null,
    via: 'prompt' as const,
  };
  const listing = workflow({
    from: 'repo',
    steps: [
      {
        name: 'build',
        spec: stepSpec({ agent: 'ada' }),
        body: 'Build what was asked.\n\nKeep the **diff** small.',
        own: null,
        hired: null,
        layers,
        mcp: [],
      },
      {
        name: 'ship',
        spec: stepSpec({ agent: null, skills: ['land-a-branch'] }),
        body: 'Land it.',
        own: null,
        hired: null,
        layers: null,
        mcp: [],
      },
    ],
  });
  const html = await routedWith(createElement(StepRows, { workflow: listing }));
  assert.match(html, /<ol[^>]*aria-label="Steps of build"/);
  assert.deepEqual(
    [...html.matchAll(/<a\b[^>]*href="([^"]*)"/g)].map((m) => m[1]),
    ['/workflows/repo/build/build', '/agents/repo/ada', '/workflows/repo/build/ship'],
    'each step linked to its page, and the agent to its own',
  );
  const [build, ship] = html.split('data-step-row="ship"');
  assert.match(build, /Keep the <strong>diff<\/strong> small\./, "the agent's step: its policy, as markdown");
  assert.doesNotMatch(build, /Build what was asked\./, "and not its agent's instructions");
  assert.match(build, /data-skill="implement-a-change"[\s\S]*data-skill="look"/, "its agent's skills, then those its line adds");
  assert.match(ship, /Land it\./, 'a step with no agent: its body');
  assert.match(ship, /No agent/);
  assert.match(ship, /data-skill="land-a-branch"/, 'and the skills its file names');
});

/** A line of a trace in `status`, its icon, title and fact. */
const traceLine = (status?: 'running' | 'error' | 'pending' | 'yours') =>
  renderToStaticMarkup(
    createElement(
      TraceLine,
      { status },
      createElement(TraceIcon, null, '*'),
      createElement(TraceTitle, null, 'Ran ', createElement('code', null, 'npm run lint')),
      createElement(TraceDescription, null, '14s'),
    ),
  );

test("a trace's line says its state in the board's meanings: running alive and shimmering, error failure, pending at rest, yours its own", () => {
  const done = traceLine();
  assert.doesNotMatch(done, /data-status=/, 'a line done carries no state');
  assert.doesNotMatch(done, /shimmer |text-alive|text-failure|border-yours/);
  const running = traceLine('running');
  assert.match(running, /data-status="running"/);
  assert.match(running, /\*:data-\[slot=trace-title\]:shimmer /);
  assert.match(running, /\*:data-\[slot=trace-title\]:shimmer-color-alive/);
  assert.match(running, /\*:data-\[slot=trace-icon\]:text-alive/);
  assert.match(running, /motion-reduce:\*:data-\[slot=trace-title\]:animate-none/, 'still under reduced motion');
  const error = traceLine('error');
  assert.match(error, /data-status="error"[^>]*text-failure|text-failure[^>]*data-status="error"/);
  assert.match(error, /\*:data-\[slot=trace-description\]:text-failure/);
  const pending = traceLine('pending');
  assert.match(pending, /text-on-surface-variant/);
  assert.doesNotMatch(pending, /opacity-/, 'at rest by its ink, never by an opacity');
  const yours = traceLine('yours');
  assert.match(yours, /border-l-2 border-yours/);
  assert.match(yours, /\*:data-\[slot=trace-icon\]:text-yours/);
  assert.match(traceLine(), /data-slot="trace-description" class="[^"]*font-mono text-body-small/, 'the fact in mono');
});

/** A step of a trace, open or not, holding `held` under its `kind`. */
const traceStep = (open: boolean, kind: 'nest' | 'body') =>
  renderToStaticMarkup(
    createElement(
      Trace,
      null,
      createElement(
        TraceCollapsible,
        { defaultExpanded: open },
        createElement(TraceCollapsibleTrigger, null, createElement(TraceLine, null, createElement(TraceTitle, null, 'Searched'))),
        createElement(TraceCollapsibleContent, { kind }, createElement('span', { 'data-held': true }, 'attached.ts:88')),
      ),
    ),
  );

test('a step of a trace draws what it holds only while open, nested on a rule or as a mono body', () => {
  assert.doesNotMatch(traceStep(false, 'body'), /data-held/, 'a closed step lays out nothing it holds');
  const body = traceStep(true, 'body');
  assert.match(body, /data-held/);
  assert.match(body, /data-kind="body"[^>]*font-mono text-body-small/);
  assert.match(traceStep(true, 'nest'), /data-kind="nest"[^>]*border-l border-outline-variant/);
  assert.match(body, /lucide-chevron-right/, 'the chevron that opens it');
});
