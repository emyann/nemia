/**
 * The board's components, rendered to markup as a server renders them: what a person is shown, without a browser.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one. Registered before
 * the components are imported, so every import of one below is dynamic. `npm run e2e` looks at the same components on the pages.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { behind, detail as detailOf, listed, summary, unpinned } from './run-fixtures.ts';
import './tsx.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { StatusChip, StepNote } = await import('../src/components/StatusChip.tsx');
const { StepTabs } = await import('../src/components/StepInspector.tsx');
const { StepNode } = await import('../src/components/StepNode.tsx');
const { afterEdges, readEdges, stepData, stepEdges } = await import('../src/components/stepGraph.ts');
const { StepRail, StepTiles } = await import('../src/components/StepRail.tsx');
const { flowSteps, railOf, tilesOf } = await import('../src/lib/flow.ts');
const { StateEdge } = await import('../src/components/StateEdge.tsx');
const { CanvasLegend } = await import('../src/components/CanvasLegend.tsx');
const { edgeStroke, LOOP_SOURCE, LOOP_TARGET, TRAVEL_SECONDS } = await import('../src/lib/canvas.ts');
const { Chips, DecideSection, DiffFileView, GroupBar, LessonChip, TouchedBranch } = await import('../src/components/Decide.tsx');
const { ReactFlowProvider } = await import('@xyflow/react');
const { AllowedReach } = await import('../src/components/Reach.tsx');
const { TemplateCard } = await import('../src/components/TemplateCard.tsx');
const { PERSON } = await import('../src/lib/words.ts');
const { StepBody, StepPolicy, Told } = await import('../src/components/Told.tsx');
const { RunGone } = await import('../src/components/RunGone.tsx');
const { KindsBehind } = await import('../src/components/KindsBehind.tsx');
const { RunClockCell } = await import('../src/components/RunClockCell.tsx');
const { RunCostCell } = await import('../src/components/RunCostCell.tsx');
const { BreakdownRows } = await import('../src/components/look/Breakdown.tsx');
const { clockBreakdown } = await import('../src/lib/breakdown.ts');
const { instantWhole, instantWords } = await import('../src/lib/instant.ts');
const { timeOfDay, timeToTheSecond } = await import('../src/lib/timeOfDay.ts');
type RunDetail = import('../src/lib/api.ts').RunDetail;
type StepReach = import('../src/lib/api.ts').StepReach;
type ReadOnlyCommands = import('../src/lib/api.ts').ReadOnlyCommands;
type GraphEdge = import('../src/lib/api.ts').GraphEdge;
type RunSummary = import('../src/lib/api.ts').RunSummary;
type StepUsed = import('../src/lib/api.ts').StepUsed;
type Decidable = import('../src/lib/api.ts').Decidable;
type StepLayers = import('../src/lib/api.ts').StepLayers;
type TaskPart = import('../src/lib/api.ts').TaskPart;
type StateFlowEdge = import('../src/components/StateEdge.tsx').StateFlowEdge;
type EdgeMarker = import('@xyflow/react').EdgeMarker;

const exhaustedNote = 'round 3 of 3, and it asked again — once more: wf round r-1 review';

/** The one element's `title`, unescaped as a browser reads it. */
const titleOf = (html: string): string | undefined =>
  /title="([^"]*)"/
    .exec(html)?.[1]
    ?.replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');

test("a chip shows a person's word for the state, never the status; on hover what it means, then the step's note it was given", () => {
  const withNote = renderToStaticMarkup(
    createElement(StatusChip, { status: 'rounds exhausted', runCancelled: false, runHeld: false, note: exhaustedNote }),
  );
  assert.match(withNote, /data-state="exhausted"/);
  assert.equal(withNote.replace(/<[^>]*>/g, ''), PERSON.exhausted.rail, 'the rail word is the text');
  assert.doesNotMatch(withNote.replace(/<[^>]*>/g, ''), /rounds exhausted/, 'the status is not shown');
  assert.equal(titleOf(withNote), `${PERSON.exhausted.meaning}\n${exhaustedNote}`);

  for (const note of [null, undefined, '']) {
    const without = renderToStaticMarkup(
      createElement(StatusChip, { status: 'rounds exhausted', runCancelled: false, runHeld: false, note }),
    );
    assert.equal(titleOf(without), PERSON.exhausted.meaning, String(note));
  }
  const cancelled = renderToStaticMarkup(createElement(StatusChip, { status: 'stopped', runCancelled: true, runHeld: false }));
  assert.equal(cancelled.replace(/<[^>]*>/g, ''), 'called off');
  const paused = renderToStaticMarkup(createElement(StatusChip, { status: 'waiting on the pause', runCancelled: false, runHeld: false }));
  assert.match(paused, /data-state="waiting"/);
  assert.notEqual(paused.replace(/<[^>]*>/g, ''), PERSON.waiting.rail, 'a check the pause holds is its own wait, not a step to come');
});

test('a note under a chip is the note as `wf ls` prints it, and nothing at all for a step without one', () => {
  const html = renderToStaticMarkup(createElement(StepNote, { note: 'try 2, by retries: 1' }));
  assert.match(html, /^<p data-note="true"[^>]*>try 2, by retries: 1<\/p>$/);
  assert.equal(renderToStaticMarkup(createElement(StepNote, { note: null })), '');
});

test('a run visited by its address that the store does not have is said gone by its id, and where the runs are listed', () => {
  const html = renderToStaticMarkup(createElement(RunGone, { id: 'r-9z8y' }));
  assert.match(html, /^<p data-run-gone="r-9z8y" role="status"/);
  assert.equal(html.replace(/<[^>]*>/g, ''), 'Run r-9z8y is not in this store: removed, or never was. Runs lists the runs the store has.');
});

const at = '2026-09-13T00:00:00.000Z';

/** A step's usage as the api gives it where nobody measured any: `wf decide`'s words, and nothing counted. */
const UNMEASURED: StepUsed = {
  usage: null,
  used: 'not measured',
  cost: 'not measured',
  costUsd: null,
  apiMs: null,
  toolMs: null,
  read: null,
  peak: null,
  rebuilt: 0,
};

/** A run of one looping step out of rounds, as GET /api/runs/:id gives it, with `note` on its step. */
function runWith(note: string | null): RunDetail {
  return {
    id: 'r-1',
    kinds: [],
    refresh: 'nemia refresh r-1',
    brief: 'Go round again',
    decide: 'nemia decide r-1',
    repo: '/code/app',
    place: 'repository',
    work: null,
    workflowDir: '/code/app/workflow',
    workflowPage: null,
    try: null,
    baseRef: 'abc123',
    branch: 'main',
    isolate: true,
    createdAt: at,
    startedAt: at,
    cancelledAt: null,
    pruned: null,
    onDisk: { worktrees: true, files: true },
    after: [],
    waiting: null,
    context: [],
    heldUntil: [],
    holding: null,
    status: 'failed',
    moving: false,
    cost: null,
    atWork: null,
    tokens: null,
    read: null,
    waitingOnYou: ['review'],
    onYou: ['review'],
    toDecide: null,
    gates: [],
    warning: null,
    graph: { roots: ['review'], edges: [] },
    steps: [
      {
        name: 'review',
        spec: null,
        filed: null,
        body: 'Review it.',
        told: null,
        layers: null,
        taskParts: null,
        taskId: 't-1',
        workspace: null,
        files: [],
        filesError: null,
        branch: 'wf/r-1/implement',
        status: 'rounds exhausted',
        note,
        roundDue: false,
        commands: { approve: 'nemia approve r-1 review', retry: 'nemia retry r-1 review', say: 'nemia say r-1 review' },
        needs: null,
        blockedByHarness: false,
        waitingFor: null,
        approve: null,
        denied: null,
        sessionUnread: null,
        gate: null,
        accepted: null,
        lastLine: null,
        said: [],
        asked: null,
        closeout: null,
        unreadable: null,
        check: null,
        attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
        used: UNMEASURED,
        spent: null,
        budget: null,
        raise: null,
        tries: [
          {
            try: 1,
            round: 1,
            cause: null,
            current: true,
            taskId: 't-1',
            note,
            status: 'rounds exhausted',
            check: null,
            closeout: null,
            unreadable: null,
            answer: null,
            attempts: { count: 1, latest: { startedAt: at, ended: 'done', endedAt: at, reason: 'harness' } },
          },
        ],
        timeline: [],
      },
    ],
    timeline: {
      rounds: [],
      run: {
        loop: null,
        round: null,
        tasks: 0,
        inFlight: 0,
        queuedMs: 0,
        ranMs: 0,
        wallMs: null,
        queued: '—',
        ran: '—',
        wall: 'not known',
        cost: null,
      },
    },
  };
}

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

/** The run of one step, `review`, with the word and note `wf ls` gives it, and who the api says is waited on. */
function runOf(
  status: string,
  { note = null, waitingOnYou, cancelledAt = null }: { note?: string | null; waitingOnYou: string[]; cancelledAt?: string | null },
): RunDetail {
  const run = runWith(note);
  return { ...run, cancelledAt, waitingOnYou, onYou: waitingOnYou, steps: [{ ...run.steps[0], status }] };
}

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
  for (const status of ['rounds exhausted', 'succeeded · BLOCKED']) {
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
  for (const status of ['unsigned', 'failed ✗ check (exit 1)'])
    assert.equal(
      gateDrawn(nodeMarkup(runOf(status, { waitingOnYou: ['review'] }))),
      false,
      `${status}: waiting on you, but work to try again rather than a decision, so not a gate`,
    );
});

test('a step a person has sent round or asked to retry is no gate from the moment they ask: the canvas draws what the api says', () => {
  const asked: Array<[status: string, note: string]> = [
    ['rounds exhausted', 'round 4 asked (wf round) — the next tick files implement'],
    ['succeeded · BLOCKED', 'try 2 asked (--nudge) — the next tick files it'],
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
  const step = { ...base.steps[0], status: 'unverified · done', spec: null };
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
  const run = loopRun({ implement: 'round 3 of 3', review: 'round 3 of 3, and it asked again — once more: wf round r-1 review' });

  const edges = stepEdges(run, 'r-1/');
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
        id: 'r-1/implement->review',
        source: 'r-1/implement',
        target: 'r-1/review',
        type: 'state',
        sourceHandle: undefined,
        targetHandle: undefined,
        label: undefined,
        data: { state: 'done', loop: false },
      },
      {
        id: 'r-1/loop:review->implement',
        source: 'r-1/review',
        target: 'r-1/implement',
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
    loopRun({ implement: null, review: 'round 2 of 3 due — review asked again, and the next tick files implement' }, true),
  );
  assert.deepEqual([due[1].label, due[1].data], ['round 2 of 3', { state: 'running', loop: true }]);
  const first = stepEdges(loopRun({ implement: null, review: null }));
  assert.deepEqual([first[1].label, first[1].data], [undefined, { state: 'to-come', loop: true }]);

  const chain = { ...run, graph: { roots: ['implement', 'review'], edges: [] } };
  assert.deepEqual(stepEdges(chain), [], 'a run with no loop draws no edge back');
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
    loopRun({ implement: 'round 3 of 3', review: 'round 3 of 3, and it asked again — once more: wf round r-1 review' }),
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
function runOfSteps(steps: Array<[name: string, status: string, after?: string]>): RunDetail {
  const base = runWith(null);
  const edges = steps.flatMap(([name, , from]): GraphEdge[] => (from ? [{ from, to: name, kind: 'after' }] : []));
  return {
    ...base,
    status: 'running',
    waitingOnYou: [],
    graph: { roots: steps.filter(([, , from]) => !from).map(([name]) => name), edges },
    steps: steps.map(([name, status]) => ({ ...base.steps[0], name, status, note: null })),
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
  const drawn = stepEdges(run);
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
function summaryRun(): RunSummary {
  const none = { needs: null, blockedByHarness: false, waitingFor: null, approve: null, denied: null, sessionUnread: null };
  const step = (name: string, status: string, extra = {}) => ({
    name,
    taskId: `t-${name}`,
    branch: null,
    status,
    note: null,
    ...none,
    ...extra,
  });
  const after = (from: string, to: string): GraphEdge => ({ from, to, kind: 'after' });
  return {
    id: 'r-1',
    repo: '/code/app',
    place: 'repository',
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
    onYou: ['approve theme'],
    toDecide: { kind: 'approve', step: 'theme', back: [] },
  } as unknown as RunSummary;
}
const railMarkup = (run: RunSummary, reduce = false): string =>
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
const tilesMarkup = (run: RunSummary, selected: string | null = null, reduce = false): string =>
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
    loopRun({ implement: 'round 2 of 3', review: 'round 2 of 3 due — review asked again, and the next tick files implement' }, true),
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
    runOfSteps([
      ['implement', 'verified ✓'],
      ['review', 'running (working)', 'implement'],
    ]),
  );
  const [, due] = stepEdges(
    loopRun({ implement: 'round 2 of 3', review: 'round 2 of 3 due — review asked again, and the next tick files implement' }, true),
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
    permissionMode: null,
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

const { SessionOwn } = await import('../src/components/session/SessionOwn.tsx');
const { SessionTalk } = await import('../src/components/session/SessionTalk.tsx');
const { foldTranscript, tailStart } = await import('../src/lib/transcript.ts');
const { sessionItems } = await import('../src/lib/sessionItems.ts');
type TranscriptEvent = import('../src/lib/api.ts').TranscriptEvent;

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
  const html = own({ what: 'told', at, attempt: 1, text: 'Widen the api too.', arrived: '2026-09-13T00:01:00.000Z' });
  assert.match(html, /data-session-message="told"/);
  assert.equal([...html.matchAll(/Widen the api too\./g)].length, 1, 'drawn once: the session\u2019s own line for them is taken out');
  assert.match(html, /data-session-arrived="2026-09-13T00:01:00\.000Z"/);
  assert.match(html, />You said, while it ran ·/, 'marked as yours, said while the session ran');
  assert.doesNotMatch(
    own({ what: 'told', at, attempt: 1, text: 'Widen the api too.', arrived: null }),
    /data-session-arrived/,
    'and says nothing of its arrival until the transcript shows it',
  );
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

test('the Activity tab draws the session compact, over the last of its turns, and links to the whole of it', () => {
  const compact = renderToStaticMarkup(createElement(SessionTalk, { who: 'implement', turns: [], live: false, density: 'compact' }));
  assert.match(compact, /data-session-talk="latest"[^>]*class="[^"]*gap-2"/, 'the tab stands its items closer than the page does');
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(SessionTalk, { who: 'implement', turns: [], live: false })),
    /data-session-talk="latest"[^>]*class="[^"]*gap-2"/,
    'and the page stands them at the room they want',
  );

  const inspector = fs.readFileSync(new URL('../src/components/StepInspector.tsx', import.meta.url), 'utf8');
  assert.match(inspector, /const tail = turns\.slice\(-ACTIVITY_TURNS\);/, 'the tab draws the tail of the conversation, not the whole');
  assert.match(
    inspector,
    /<SessionTalk who=\{step\.name\} turns=\{tail\} live=\{following\.live\} density="compact" \/>/,
    'drawn by the family, compact, over that tail',
  );
  assert.match(inspector, /Open the session/, 'and the whole of it is one click away');
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

const { Markdown } = await import('../src/components/Markdown.tsx');

/** A text, as the board renders it. */
const md = (text: string): string => renderToStaticMarkup(createElement(Markdown, null, text));

test('markdown is drawn as GFM: headings two levels down, lists, a table, a task list, strikethrough, an autolink and a footnote', () => {
  const html = md(
    [
      '# Title',
      '## What it needs',
      '###### Deepest',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '2. second',
      '',
      '| file | lines |',
      '|:--|--:|',
      '| a.ts | 12 |',
      '',
      '- [x] done',
      '- [ ] to do',
      '',
      '~~gone~~ and www.example.com',
      '',
      'A claim[^1].',
      '',
      '[^1]: Its source.',
    ].join('\n'),
  );
  assert.match(html, /^<div data-markdown="true"/);
  assert.match(html, /<h3[^>]*>Title<\/h3>/, '`#` is an h3: the page has its own h1 and h2');
  assert.match(html, /<h4[^>]*>What it needs<\/h4>/);
  assert.match(html, /<h6[^>]*>Deepest<\/h6>/, 'and nothing goes past h6');
  assert.doesNotMatch(html, /<h[12][\s>]/);
  assert.match(html, /<ul[^>]*>\s*<li[^>]*>one<\/li>\s*<li[^>]*>two<\/li>\s*<\/ul>/);
  assert.match(html, /<ol[^>]*>\s*<li[^>]*>first<\/li>/);
  assert.match(
    html,
    /<div class="[^"]*overflow-x-auto[^"]*"><table[^>]*><thead><tr><th[^>]*style="text-align:left"[^>]*>file<\/th><th[^>]*style="text-align:right"[^>]*>lines<\/th>/,
    'a table, in a box that scrolls sideways',
  );
  assert.match(html, /<td[^>]*>a\.ts<\/td><td[^>]*>12<\/td>/);
  assert.match(html, /<input type="checkbox" disabled=""[^>]*checked=""\/> done/, 'a task done, its box not to be ticked from the board');
  assert.match(html, /<input type="checkbox" disabled=""[^>]*\/> to do/);
  assert.match(html, /<del>gone<\/del>/);
  assert.match(html, /<a href="http:\/\/www\.example\.com" target="_blank"/);
  assert.match(html, /<section data-footnotes="true"/);
  assert.match(html, /Its source\./);
});

test('a link opens in a new tab and gives the page it opens nothing of this one; a footnote link stays in the tab', () => {
  const html = md('See [the docs](https://example.com/docs) and a note[^n].\n\n[^n]: Here.');
  assert.match(html, /<a href="https:\/\/example\.com\/docs" target="_blank" rel="noreferrer noopener"[^>]*>the docs<\/a>/);
  const internal = [...html.matchAll(/<a href="#[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.equal(internal.length, 2, 'the reference and the way back');
  for (const a of internal) assert.doesNotMatch(a, /target=/, a);
});

test('REFUSED: raw HTML in a text is shown as the text it is — no element is made of it, inline or as a block', () => {
  const html = md(
    'Before <b>bold</b> <img src=x onerror="alert(1)"> after.\n\n<script>alert(1)</script>\n\n<div onclick="alert(1)">a block</div>\n\n<a href="https://example.com">a tag</a>',
  );
  assert.match(html, /&lt;b&gt;bold&lt;\/b&gt;/);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /&lt;div onclick=&quot;alert\(1\)&quot;&gt;a block&lt;\/div&gt;/);
  for (const element of ['b', 'img', 'script', 'div onclick', 'a href="https://example.com">a tag']) {
    assert.ok(!html.includes(`<${element}`), `no <${element}> element`);
  }
});

test('REFUSED: a link whose address could run script is its words and no link; an image is a link to it, never fetched', () => {
  for (const address of ['javascript:alert(1)', 'JavaScript:alert(1)', 'vbscript:msgbox(1)', 'data:text/html,<script>alert(1)</script>']) {
    const html = md(`[click me](${address}) and <${address}>`);
    assert.match(html, /click me/, address);
    assert.doesNotMatch(html, /href="[^"]*(script|data):/i, address);
    assert.doesNotMatch(html, /<a[^>]*>click me<\/a>/, `${address}: its words, not a link`);
  }
  const image = md('![the diagram](https://example.com/d.png) and ![](javascript:alert(1))');
  assert.doesNotMatch(image, /<img/);
  assert.match(
    image,
    /<a href="https:\/\/example\.com\/d\.png" target="_blank" rel="noreferrer noopener" data-image="true"[^>]*>image: the diagram<\/a>/,
  );
  assert.match(image, /<span data-image="true">image<\/span>/, 'an image whose address was emptied is a word');
});

test("a fenced block is the board's code block in its fence's language; one it has no grammar for is text; inline code is inline", () => {
  const html = md('Run `npm test`:\n\n```bash\nnpm test\nnpm run e2e\n```\n\n```python\nprint(1)\n```\n\n```\nplain\n```');
  assert.match(html, /data-language="bash"[^>]*>.*<code>npm test\nnpm run e2e<\/code>/s, 'the code, less the newline the block ends with');
  assert.match(html, /data-language="text"[^>]*>.*<code>print\(1\)<\/code>/s);
  assert.equal([...html.matchAll(/data-language=/g)].length, 3);
  assert.match(html, /Run <code class="[^"]*font-mono[^"]*">npm test<\/code>:/);
});

test('two texts with footnotes on one page name theirs apart — no id twice, each reference to its own note', () => {
  const html = renderToStaticMarkup(
    createElement(
      'div',
      null,
      createElement(Markdown, null, 'One[^1].\n\n[^1]: First.'),
      createElement(Markdown, null, 'Two[^1].\n\n[^1]: Second.'),
    ),
  );
  const ids = [...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(ids.length, 6, 'a reference, a label and a note, in each');
  assert.equal(new Set(ids).size, ids.length, `no id twice: ${ids.join(', ')}`);
  for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(href), `#${href} names an element on the page`);
  for (const [, label] of html.matchAll(/aria-describedby="([^"]+)"/g))
    assert.ok(ids.includes(label), `${label} names an element on the page`);
});

test('given a level, `#` is drawn as that heading and deeper ones follow it, sized by their own level and never past h6', () => {
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  const panel = renderToStaticMarkup(createElement(Markdown, { level: 5, children: '# A\n## B\n### C' }));
  assert.match(panel, /<h5 class="[^"]*text-\[1\.15em\][^"]*">A<\/h5>/, "a text's `#` keeps its size in a panel");
  assert.match(panel, /<h6 class="[^"]*text-\[1\.08em\][^"]*">B<\/h6>/);
  assert.match(panel, /<h6[^>]*>C<\/h6>/);
  assert.doesNotMatch(panel, /<h[1-4][\s>]/, "no heading outranks the panel's own");
  assert.match(md('# A\n## B'), /<h3[^>]*>A<\/h3>\s*<h4[^>]*>B<\/h4>/, 'without a level, `#` is an h3');
});

test('a code block keeps its lines as written: a long one scrolls inside the block, never wraps', () => {
  const html = md('```\n' + 'x'.repeat(300) + '\n```');
  const block = /<div class="([^"]*)" data-language="text"/.exec(html);
  assert.ok(block, html);
  assert.match(block[1], /(^|\s)\[&amp;_pre\]:whitespace-pre(\s|$)/, 'its lines are not wrapped');
});

test('a soft line break joins its lines into one paragraph, and nothing around a text keeps its breaks', () => {
  const html = md('one\ntwo\n\nthree');
  assert.match(html, /<p[^>]*>one\ntwo<\/p>\s*<p[^>]*>three<\/p>/);
  assert.doesNotMatch(html, /whitespace-pre|<br/);
});

type WorkflowStepSpec = import('../src/lib/api.ts').WorkflowStepSpec;

/** A step of a workflow no run has started, as the Workflows page draws it: in the step node's spec mode — on the builder, with `build`. */
async function specMarkup(
  spec: WorkflowStepSpec,
  build?: { unsaved: boolean; refused: boolean; selected: boolean },
  inspected?: boolean,
): Promise<string> {
  const { SpecNode } = await import('../src/components/StepNode.tsx');
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
  background: null,
  remote: null,
  deadlineSeconds: null,
  budget: null,
  check: null,
  retries: null,
  gate: null,
  output: null,
  tally: [],
  loop: null,
  rounds: null,
};

const unescaped = (text: string) =>
  text.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

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

  const { specLines } = await import('../src/components/StepNode.tsx');
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
  const { specLines } = await import('../src/components/StepNode.tsx');
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

/** Each bar's added and removed widths, in the order the bars are drawn. */
const barsOf = (html: string): Array<[number, number]> =>
  [
    ...html.matchAll(
      /<span data-added="true"[^>]*style="width:([\d.]+)%"[^>]*><\/span><span data-removed="true"[^>]*style="width:([\d.]+)%"/g,
    ),
  ].map((m) => [Number(m[1]), Number(m[2])]);

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
  assert.deepEqual(
    barsOf(html),
    [
      [0.44, 0],
      [0, 0],
      [99.78, 0.22],
    ],
    '(root) +2 −0, assets binary only, packages/x +453 −1 — which is the most, and fills the track',
  );
  assert.match(html, /data-group="packages\/x"[\s\S]*?>2 files<[\s\S]*?>\+453<\/span> <span[^>]*>−1<\/span>/);
  assert.match(html, /data-group="assets"[\s\S]*?>binary<\/span>/);
  assert.match(html, /data-group="\(root\)"[\s\S]*?>−0<\/span><span[^>]*> · 1 binary<\/span>/);
});

test('the agent-facing chips are a hairline at rest and the check-affecting ones ringed in yours, each titled with why — and neither is drawn when there are none', () => {
  const both = renderToStaticMarkup(
    createElement(Chips, { agentFacing: ['CLAUDE.md'], checkAffecting: ['package.json', 'packages/x/test/add.test.ts'] }),
  );
  const chips = [...both.matchAll(/<span data-chip="([^"]+)" title="([^"]+)" class="([^"]+)">([^<]+)<\/span>/g)].map((m) => ({
    kind: m[1],
    title: m[2],
    cls: m[3],
    file: m[4],
  }));
  assert.deepEqual(
    chips.map(({ kind, title, file }) => [kind, title, file]),
    [
      ['agent-facing', 'the next agent reads this', 'CLAUDE.md'],
      ['check-affecting', 'could make its check pass', 'package.json'],
      ['check-affecting', 'could make its check pass', 'packages/x/test/add.test.ts'],
    ],
  );
  assert.ok(holds(chips[0].cls, hairline), 'a note: at rest');
  for (const chip of chips.slice(1)) {
    assert.ok(holds(chip.cls, ringed.yours), 'what a person weighs: yours, drawn light');
    assert.doesNotMatch(chip.cls, /\bbg-/, 'an outline, not a fill');
  }

  assert.equal(renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: [] })), '');
  const onlyCheck = renderToStaticMarkup(createElement(Chips, { agentFacing: [], checkAffecting: ['package.json'] }));
  assert.doesNotMatch(onlyCheck, /agent-facing/);
  assert.match(onlyCheck, /data-chip="check-affecting"/);
  const plain = renderToStaticMarkup(createElement(TouchedBranch, { touched: { branch: 'wf/r-1/implement', radius: radiusWith() } }));
  assert.doesNotMatch(
    plain,
    /data-chip|agent-facing|check-affecting/,
    "on a branch with neither, the branch's rows are drawn and no chip is",
  );
  const unread = renderToStaticMarkup(
    createElement(TouchedBranch, {
      touched: { branch: 'wf/gone', radius: { error: 'what this run changed is not known: the place has no branch wf/gone in /r' } },
    }),
  );
  assert.match(
    unread,
    />what this run changed is not known: the place has no branch wf\/gone in \/r</,
    'a branch the place did not say says so, in the sentence the api gave',
  );
  assert.doesNotMatch(unread, /data-bar|data-group/, 'and draws no row');
});

test('the lesson chip is sage with what was written, a grey ring when nothing was, and dashed when a branch could not be read', () => {
  const chip = (lesson: { said: string; state: 'written' | 'nothing' | 'unknown' }) => {
    const m = /<span data-lesson="(\w+)" title="[^"]*" class="([^"]+)">([^<]+)<\/span>/.exec(
      renderToStaticMarkup(createElement(LessonChip, { lesson })),
    );
    assert.ok(m, lesson.state);
    return { state: m[1], cls: m[2], text: m[3] };
  };
  const written = chip({ said: 'CLAUDE.md +2 −0', state: 'written' });
  assert.deepEqual([written.state, written.text], ['written', 'lesson · CLAUDE.md +2 −0']);
  assert.ok(holds(written.cls, container.sage));
  assert.doesNotMatch(written.cls, /\bring-/);

  const nothing = chip({ said: 'nothing written where the next agent reads', state: 'nothing' });
  assert.deepEqual([nothing.state, nothing.text], ['nothing', 'nothing written where the next agent reads']);
  assert.ok(holds(nothing.cls, ringed.grey));
  assert.doesNotMatch(nothing.cls, /\bbg-/);

  const unknown = chip({ said: 'not known — wf/gone could not be read', state: 'unknown' });
  assert.equal(unknown.text, 'lesson not known — wf/gone could not be read');
  assert.match(unknown.cls, /\bborder-dashed\b/);
  assert.doesNotMatch(unknown.cls, /\bbg-|\bring-/);
});

test('a diff is folded under its file, coloured by line, and a capped one says how many more lines `wf decide` prints', () => {
  const lines = [
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -1 +1 @@',
    '-{"a":1}',
    '+{"a":2}',
    ' }',
  ];
  const capped = renderToStaticMarkup(
    createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 26 }, counts: { added: 1, removed: 1 } }),
  );
  assert.match(capped, /^<details data-diff="package\.json"/, 'collapsed: a details element with no open attribute');
  assert.doesNotMatch(capped, /<details[^>]*\bopen\b/);
  assert.match(capped, /<summary[^>]*>.*package\.json.*\+1<\/span> <span[^>]*>−1<\/span>/);
  assert.deepEqual(
    [...capped.matchAll(/data-line="(\w+)"/g)].map((m) => m[1]),
    ['meta', 'meta', 'meta', 'hunk', 'removed', 'added', 'context'],
  );
  assert.match(capped, /<p data-cut="26"[^>]*>26 more lines — the command line&#x27;s decide prints them all<\/p>/);

  const whole = renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 0 } }));
  assert.doesNotMatch(whole, /data-cut|more line/);
  assert.match(
    renderToStaticMarkup(createElement(DiffFileView, { file: { path: 'package.json', lines, cut: 1 } })),
    />1 more line — the command line/,
  );
});

test('the Decide section copies its commands and runs none: a button per command, and each only copies', () => {
  const commands = [
    {
      label: 'once more',
      command: 'wf retry r-1 implement',
      said: 'implement: succeeded · BLOCKED. Continue its session, told what happened:  wf retry r-1 implement  (--fresh, or --model <m>, for a new session)',
      step: 'implement',
    },
    { label: 'ship it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null, step: null },
    { label: 'drop it', command: 'git -C /code/app branch -D wf/r-1/implement', said: null, step: null },
  ] as const;
  const decision: Decidable = {
    standings: [],
    touched: [{ branch: 'wf/r-1/implement', radius: radiusWith({ agentFacing: ['CLAUDE.md'] }) }],
    lesson: { said: 'CLAUDE.md +2 −0', state: 'written' },
    sensitive: [
      { branch: 'wf/r-1/implement', files: [{ path: 'packages/x/test/add.test.ts', lines: ['@@ -1 +1,451 @@'], cut: 3 }], error: null },
    ],
    used: {},
    total: {
      ...UNMEASURED,
      usage: { toolCalls: 34 },
      used: 'turns not measured · 34 tool calls · tokens in not measured · tokens out not measured',
    },
    cost: null,
    overBudget: null,
    collisions: null,
    commands: [...commands],
    awaiting: null,
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(html, /^<section aria-label="Decide"/);
  const buttons = [...html.matchAll(/<button [^>]*>/g)].map((m) => m[0]);
  assert.equal(buttons.length, commands.length, html);
  for (const [i, button] of buttons.entries()) {
    assert.match(button, /\bdata-copy="true"/);
    assert.ok(button.includes(`aria-label="Copy: ${commands[i].command}"`), button);
  }
  for (const { command } of commands) assert.ok(html.includes(`>${command}</code>`), command);
  assert.match(
    html,
    />implement: succeeded · BLOCKED\. Continue its session, told what happened {2}\(--fresh, or --model &lt;m&gt;, for a new session\)</,
    "the once-more line's words, without the command that follows it on the line below",
  );
  assert.match(html, /<dt[^>]*>used<\/dt><dd[^>]*>turns not measured · 34 tool calls/, "the run's total, in `wf decide`'s words");
  assert.match(html, /<dt[^>]*>cost<\/dt><dd[^>]*>not measured<\/dd>/, 'never a 0 for what nobody measured');
  assert.match(
    html,
    /data-diff="packages\/x\/test\/add\.test\.ts"[\s\S]*?\+450<\/span> <span[^>]*>−0<\/span>[\s\S]*?3 more lines/,
    "the capped file, with the file's lines off the branch's radius in its summary",
  );
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
    labels.slice(at('latest took'), at('latest took') + 3).map(([l, v]) => [l, l === 'latest took' ? '…' : v]),
    [
      ['latest took', '…'],
      ['used', 'not measured'],
      ['cost', 'not measured'],
    ],
  );

  const measured = {
    ...run.steps[0],
    used: {
      ...UNMEASURED,
      usage: { turns: 12, costUsd: 0.004 },
      used: '12 turns · tool calls not measured · tokens in not measured · tokens out not measured',
      cost: '$0.004',
      costUsd: 0.004,
    },
  };
  const said = Object.fromEntries(rows(measured));
  assert.deepEqual(
    [said.used, said.cost],
    ['12 turns · tool calls not measured · tokens in not measured · tokens out not measured', '$0.004'],
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

const { Artifacts, TryCloseouts } = await import('../src/components/Closeout.tsx');
const facts = await import('../src/components/Facts.tsx');
const { Facts, specRows, unreadRows, when } = facts;
type StepTry = import('../src/lib/api.ts').StepTry;
type StepCloseout = import('../src/lib/api.ts').StepCloseout;
type StepSpec = import('../src/lib/api.ts').StepSpec;
type StepFiled = import('../src/lib/api.ts').StepFiled;

/** A markup's text, tags taken for separators: each run of text between two tags, trimmed, and none of the empty ones. */
const textsOf = (html: string): string[] =>
  html
    .split(/<[^>]+>/)
    .map((text) => unescaped(text).trim())
    .filter(Boolean);

const tookAt = '2026-09-13T00:12:30.000Z';
const ranOnce = { count: 1, latest: { startedAt: at, ended: 'done', endedAt: tookAt, reason: 'harness' } };
const closeoutSaying = (summary: string, more: Partial<StepCloseout> = {}): StepCloseout => ({
  outcome: 'done',
  summary,
  needs: null,
  apiVersion: null,
  body: null,
  values: [],
  refused: [],
  artifacts: [],
  output: {},
  missing: [],
  replies: null,
  schema: {},
  questions: [],
  raw: { outcome: 'done', summary },
  ...more,
});

/**
 * implement on its third try, as the api gives it: refused by its check on the first, tried again by `retries:`, then sent round by
 * review's loop.
 */
const threeTries: StepTry[] = [
  {
    try: 1,
    round: 1,
    cause: 'retries',
    current: false,
    taskId: 'r-1-implement',
    note: null,
    status: 'succeeded',
    attempts: ranOnce,
    check: {
      command: 'npm test',
      taskId: 'r-1-implement-check',
      verdict: 'exit 1',
      refused: { exit: 'exit 1', stdout: null, stderr: { lines: [], truncated: false }, unreadable: null },
    },
    closeout: closeoutSaying('Added the cache.'),
    unreadable: null,
    answer: null,
  },
  {
    try: 2,
    round: 1,
    cause: 'round',
    current: false,
    taskId: 'r-1-implement-try2',
    note: 'try 2, by retries: 1',
    status: 'succeeded',
    attempts: ranOnce,
    check: { command: 'npm test', taskId: 'r-1-implement-try2-check', verdict: 'passed', refused: null },
    closeout: closeoutSaying('Fixed the failing test.'),
    unreadable: null,
    answer: null,
  },
  {
    try: 3,
    round: 2,
    cause: null,
    current: true,
    taskId: 'r-1-implement-try3',
    note: 'round 2 of 3',
    status: 'running (working)',
    attempts: { count: 2, latest: { startedAt: tookAt, ended: null, endedAt: null, reason: null } },
    check: { command: 'npm test', taskId: null, verdict: null, refused: null },
    closeout: null,
    unreadable: null,
    answer: null,
  },
];

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
  const step = { ...run.steps[0], name: 'implement', status: 'running (working)', attempts: threeTries[2].attempts, tries: threeTries };
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

const { answersFrom, chosenDraft, recommendedDraft, unanswered } = await import('../src/components/Questions.tsx');
type Question = import('../src/lib/api.ts').Question;

const cut: Question = {
  title: 'How is the card cut?',
  body: 'It is **big**.',
  options: [
    { label: 'a', meaning: 'The shape and the board first.' },
    { label: 'b', meaning: 'All of it at once.' },
  ],
  recommended: 'a',
  multiple: false,
};
const where: Question = {
  title: 'Where do the answers go?',
  body: 'Either or both.',
  options: [
    { label: 'retry', meaning: 'Into the next try.' },
    { label: 'gate', meaning: 'With the approval.' },
  ],
  recommended: null,
  multiple: true,
};

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
  const unsigned = { count: 1, latest: { startedAt: at, ended: 'failed', endedAt: tookAt, reason: 'unsigned' } };
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
    permissionMode: null,
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
    permissionMode: null,
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
    permissionMode: 'auto',
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
    '3600 s · default',
  ]);

  assert.equal(
    rowsOf(unset, { ...bare, runsIn: { mode: 'auto', by: 'default' } })['permission mode'],
    'auto · default',
    'the mode the session runs in, as its harness decides it: Claude Code\'s `auto` for a task filed with none, never "the harness\'s own", which reads as its prompting default',
  );
  assert.equal(
    rowsOf(unset, { ...bare, runsIn: { mode: 'workspace-write', by: 'default' } })['permission mode'],
    'workspace-write · default',
    "Codex's `workspace-write`",
  );
  const reviewer: StepSpec = { ...unset, harness: 'codex', sandbox: 'workspace-write', tools: ['Read', 'Grep'] };
  const narrowed: StepFiled = {
    ...bare,
    permissionMode: 'workspace-write',
    tools: ['Read', 'Grep'],
    runsIn: { mode: 'read-only', by: 'tools' },
  };
  assert.equal(
    rowsOf(reviewer, narrowed).sandbox,
    'read-only · by tools',
    "a codex step's fence is its `sandbox:`, which the engine's task files as its permission mode, as its tools narrowed it whatever was named",
  );
  assert.equal(rowsOf(reviewer, narrowed)['permission mode'], undefined, 'and no row is called `permission mode`');
  assert.equal(rowsOf({ ...reviewer, sandbox: null }, { ...narrowed, permissionMode: null }).sandbox, 'read-only · by tools');
  const readOnly: StepSpec = { ...unset, harness: 'codex', sandbox: 'read-only' };
  assert.equal(
    rowsOf(readOnly, { ...bare, permissionMode: 'read-only', runsIn: { mode: 'read-only', by: 'filed' } }).sandbox,
    'read-only',
    "the workflow's word, as filed",
  );
  assert.equal(
    rowsOf(readOnly, { ...bare, permissionMode: 'workspace-write', runsIn: { mode: 'workspace-write', by: 'filed' } }).sandbox,
    'workspace-write · this try',
  );
  assert.equal(rowsOf(readOnly, null).sandbox, 'read-only', 'and a step not filed yet says what its workflow says');
  const widest: StepSpec = { ...unset, harness: 'codex', sandbox: 'danger-full-access' };
  const former: StepFiled = { ...bare, permissionMode: 'bypassPermissions', runsIn: { mode: 'danger-full-access', by: 'filed' } };
  assert.equal(
    rowsOf(widest, former).sandbox,
    'danger-full-access',
    'a try filed with `permissionMode: bypassPermissions` has the fence Codex runs as `-s danger-full-access`: no try of its own',
  );
  assert.equal(rowsOf(widest, { ...former, runsIn: null }).sandbox, 'danger-full-access', 'nor where the api could not ask the harness');
  assert.equal(
    rowsOf(widest, { ...former, permissionMode: 'read-only', runsIn: { mode: 'read-only', by: 'filed' } }).sandbox,
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
    permissionMode: 'dontAsk',
    tools: [],
    deadlineSeconds: 600,
  };
  const asSet: StepFiled = {
    model: 'opus',
    askedModel: null,
    effort: 'high',
    contextTokens: 200_000,
    permissionMode: 'dontAsk',
    runsIn: { mode: 'dontAsk', by: 'filed' },
    tools: [],
    deadlineSeconds: 600,
    remote: null,
    bridge: null,
  };
  assert.deepEqual(ranWith(rowsOf(set, asSet)), ['opus', 'high', 'dontAsk', 'none', '600 s'], "the workflow's words");
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
  assert.deepEqual(ranWith(rowsOf(set, null)), ['opus', 'high', 'dontAsk', 'none', '600 s'], "and the workflow's words where it does");
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
    permissionMode: null,
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
    permissionMode: null,
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
    permissionMode: null,
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
    permissionMode: null,
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

const Answering = await import('../src/components/Decide.tsx');
const { NeedsBanner, ToDecideBanner } = await import('../src/components/Needs.tsx');
const { container, hairline, ringed } = await import('../src/lib/meaning.ts');

/** Whether the class list `cls` carries every class of the drawn form `form`. */
const holds = (cls: string, form: string): boolean => form.split(' ').every((c) => cls.split(' ').includes(c));
/** Whether the class list `cls` carries any class of the drawn form `form`. */
const touches = (cls: string, form: string): boolean => form.split(' ').some((c) => cls.split(' ').includes(c));
/** Whether `cls` is drawn as a wait on a person: the yours container whole, and nothing of an amount's or a failure's. */
const drawnYours = (cls: string): boolean =>
  holds(cls, container.yours) && !touches(cls, container.money) && !touches(cls, container.failure);
const { decisionStamp } = await import('../src/lib/decide.ts');
const Closeouts = await import('../src/components/Closeout.tsx');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
type Answer = import('../src/lib/asks.ts').Answer;

const LOGIN =
  'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute';

/**
 * What the harness says a blocked session waits for, as the api gives it: the words a card or a node says, and what a person does about it.
 */
const WAIT = { words: 'waiting for a permission prompt', advice: 'answer it in Claude Code: claude agents, session ae/t-1/1' };

/** The run of one step, `review`, in `status`, with what the api says it needs and who it says is waited on. */
function needing(
  status: string,
  needs: Partial<Pick<RunDetail['steps'][number], 'needs' | 'blockedByHarness' | 'waitingFor' | 'lastLine' | 'denied'>>,
  over: { waitingOnYou: string[]; cancelledAt?: string | null },
): RunDetail {
  const run = runOf(status, over);
  return {
    ...run,
    steps: [
      {
        ...run.steps[0],
        needs: null,
        blockedByHarness: false,
        waitingFor: null,
        lastLine: null,
        asked: null,
        denied: null,
        sessionUnread: null,
        ...needs,
      },
    ],
  };
}

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

  const held = nodeMarkup(needing('needs-human', { blockedByHarness: true, waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] }));
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
  const mute = nodeMarkup(needing('needs-human', { blockedByHarness: true, lastLine: LOGIN }, { waitingOnYou: [] }));
  assert.ok(
    mute.includes(`title="blocked by the harness: ${LOGIN}"`) && mute.includes(`>blocked by the harness: ${LOGIN}</p>`),
    `a harness that says nothing about what for reads \`blocked by the harness\` and what the session said last, on the line as on hover\n${mute}`,
  );
  assert.ok(nodeMarkup(needing('needs-human', { blockedByHarness: true }, { waitingOnYou: [] })).includes('>blocked by the harness</p>'));
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

/** The Decide section's answers for `offers`, rendered inside the query client their asks are made with. */
const offersMarkup = (offers: Answer[]) =>
  renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(Answering.Offers, { runId: 'r-1', offers })),
  );

test("the answers: a box for a step that asks, Try again for a refused check with a recheck, its box closed while a recheck is chosen — and a try asked, `wf ls`'s note", () => {
  const html = offersMarkup([
    { step: 'implement', kind: 'answer', needs: 'Which database?', questions: [] },
    { step: 'theme', kind: 'try-again', recheck: true, unfinished: false },
    { step: 'lint', kind: 'try-again', recheck: true, unfinished: true },
    { step: 'docs', kind: 'try-again', recheck: false, unfinished: false },
    { step: 'plan', kind: 'asked', try: 2, note: 'try 2 asked (--nudge, with your answer) — the next tick files it' },
  ]);
  assert.match(html, /^<section aria-label="Answer"/);
  const rows = new Map(
    [...html.matchAll(/<li data-offer="([^"]+)" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [
      m[2],
      { kind: m[1], html: m[3] },
    ]),
  );
  assert.deepEqual(
    [...rows].map(([name, { kind }]) => [name, kind]),
    [
      ['implement', 'answer'],
      ['theme', 'try-again'],
      ['lint', 'try-again'],
      ['docs', 'try-again'],
      ['plan', 'asked'],
    ],
  );
  const said = (name: string) => textsOf(/<(p|div) data-said="true"[^>]*>([\s\S]*?)<\/\1>/.exec(rows.get(name)!.html)![2]).join(' ');
  const buttons = (name: string) =>
    [...rows.get(name)!.html.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [
      m[1],
      Boolean(m[2]),
      m[3],
    ]);
  const radios = (name: string) =>
    [...rows.get(name)!.html.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])]);
  const boxes = (name: string) => [...rows.get(name)!.html.matchAll(/<textarea /g)].length;
  const closed = (name: string) => /<textarea [^>]*\bdisabled=""/.test(rows.get(name)!.html);

  assert.equal(said('implement'), 'implement asks: Which database?', 'an answer: what it asks, a question as its markdown under `asks:`');
  assert.equal(boxes('implement'), 1, 'a box');
  assert.deepEqual(buttons('implement'), [['submit', true, 'Answer and continue']], 'and a button that waits for an answer');
  assert.deepEqual(
    radios('implement'),
    [
      ['nudge', true],
      ['fresh', false],
    ],
    'a nudge unless a new session is chosen (a server render writes `checked` before `value`)',
  );
  assert.match(rows.get('implement')!.html, /<label for="[^"]+" class="sr-only">Your answer to implement<\/label>/);

  assert.equal(said('theme'), 'theme was refused by its check', 'any need but a question is a sentence');
  assert.equal(boxes('theme'), 1, 'a refused check: something to tell it if you like');
  assert.deepEqual(buttons('theme'), [['submit', false, 'Try again']]);
  assert.deepEqual(
    radios('theme'),
    [
      ['nudge', true],
      ['fresh', false],
      ['recheck', false],
    ],
    'and its check again',
  );
  assert.deepEqual(
    radios('lint'),
    [
      ['nudge', false],
      ['fresh', false],
      ['recheck', true],
    ],
    'the check first where it did not finish',
  );
  assert.equal(
    closed('lint'),
    true,
    `a recheck files no session, so a message on it is refused (\`messageRefusal\`): its box is closed while it is chosen\n${rows.get('lint')!.html}`,
  );
  assert.match(rows.get('lint')!.html, /placeholder="A recheck runs the check again and files no session: there is nobody to tell\."/);
  assert.deepEqual([closed('implement'), closed('theme'), closed('docs')], [false, false, false]);
  assert.equal(
    said('docs'),
    "docs gave no closeout the run accepts — none, one short of a field it declares, or one naming a file the run does not have; the CLI's decide says which",
  );
  assert.deepEqual(radios('docs'), [
    ['nudge', true],
    ['fresh', false],
  ]);

  assert.deepEqual(
    textsOf(rows.get('plan')!.html),
    ['plan', 'try 2 asked (--nudge, with your answer) — the next tick files it'],
    'asked: what `wf ls` says of it',
  );
  assert.deepEqual(buttons('plan'), [], 'and nothing to press');

  assert.equal(boxes('plan'), 0);
  assert.doesNotMatch(html, /data-refused/);
});

test('a step `denials: fail` stopped is offered Try again with a new session first, as `wf decide` offers it, and its row names the calls it was denied', () => {
  const html = offersMarkup([
    { step: 'notes', kind: 'denied', calls: 'denied: Write(/tmp/w/notes.md)' },
    { step: 'bare', kind: 'denied', calls: null },
  ]);
  const rows = new Map([...html.matchAll(/<li data-offer="([^"]+)" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[2], m[3]]));
  const said = (name: string) => textsOf(/<p data-said="true"[^>]*>([\s\S]*?)<\/p>/.exec(rows.get(name)!)![1]).join(' ');
  assert.equal(
    said('notes'),
    "notes signed off having been denied a call (denied: Write(/tmp/w/notes.md)), and says denials: fail. This run's allowedTools: is frozen, so a try is denied the same again: a new session is told to do without it",
  );
  assert.equal(
    said('bare'),
    "bare signed off having been denied a call, and says denials: fail. This run's allowedTools: is frozen, so a try is denied the same again: a new session is told to do without it",
  );
  const radios = [...rows.get('notes')!.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [
    m[2],
    Boolean(m[1]),
  ]);
  assert.deepEqual(
    radios,
    [
      ['fresh', true],
      ['nudge', false],
    ],
    'a new session first, and no recheck: no check of it ran',
  );
  assert.match(rows.get('notes')!, /<form aria-label="Try notes again"/);
  assert.match(rows.get('notes')!, /<button type="submit"[^>]*>Try again<\/button>/);
});

test('a step asking questions as data is answered by choosing: radios where it takes one, checkboxes where several, the recommended marked, nothing chosen, and a button that waits for every answer', () => {
  const html = offersMarkup([
    { step: 'design', kind: 'answer', needs: 'Two questions.', questions: [cut, where] },
    { step: 'spec', kind: 'answer', needs: 'One question.', questions: [where] },
  ]);
  const rows = new Map(
    [...html.matchAll(/<li data-offer="answer" data-questions="true" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[1], m[2]]),
  );
  const design = rows.get('design')!;
  assert.ok(design, html);
  assert.deepEqual(
    [...design.matchAll(/<fieldset data-question="([^"]+)"/g)].map((m) => unescaped(m[1])),
    [cut.title, where.title],
  );
  const choices = [
    ...design.matchAll(/<input type="(radio|checkbox)" class="[^"]*" name="[^"]*-choice"( checked="")? value="([^"]+)"/g),
  ].map((m) => [m[3], m[1], Boolean(m[2])]);
  assert.deepEqual(
    choices,
    [
      ['a', 'radio', false],
      ['b', 'radio', false],
      ['retry', 'checkbox', false],
      ['gate', 'checkbox', false],
    ],
    'nothing is chosen until the person chooses',
  );
  assert.equal([...design.matchAll(/data-recommended="true"/g)].length, 1, 'the one recommended option is marked');
  assert.match(
    design,
    /<strong class="font-medium">a<\/strong> <span[^>]*>— The shape and the board first\.<\/span><span data-recommended="true"[^>]*>recommended<\/span>/,
  );
  assert.match(design, /<strong>big<\/strong>/, 'a body is its markdown');
  const buttons = (row: string) =>
    [...row.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]);
  assert.deepEqual(buttons(design), [
    ['submit', true, 'Answer and continue'],
    ['button', false, 'Choose the recommended answers'],
  ]);
  assert.match(design, /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"/);
  assert.equal([...design.matchAll(/<textarea [^>]*data-own="true"/g)].length, 2, "a line for each question's own words");
  assert.deepEqual(
    buttons(rows.get('spec')!),
    [['submit', true, 'Answer and continue']],
    'no recommended answers to choose where none is recommended',
  );
  assert.doesNotMatch(html, /--recheck/, 'a recheck files no session to read answers');
});

test('Choose the recommended answers chooses each recommended option, keeps words already written, and leaves a question with none as it was', () => {
  assert.deepEqual(unanswered([cut, where], {}), [cut.title, where.title], 'nothing is answered before the person answers');
  const typed = { [cut.title]: { chose: ['b'], own: 'Mine.' } };
  const filled = recommendedDraft([cut, where], typed);
  assert.deepEqual(filled, { [cut.title]: { chose: ['a'], own: 'Mine.' } });
  assert.deepEqual(unanswered([cut, where], filled), [where.title], 'a question without a recommendation still waits for the person');
  assert.deepEqual(recommendedDraft([where], {}), {});
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

test('the Decide section puts the answers first, before what there is to decide, and its commands still only copy', () => {
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: null,
    overBudget: null,
    collisions: null,
    commands: [{ label: 'ship it', command: 'git -C /code/app merge --no-ff wf/r-1/implement', said: null, step: null }],
    awaiting: null,
  };
  const offers = createElement(
    QueryClientProvider,
    { client: new QueryClient() },
    createElement(Answering.Offers, {
      runId: 'r-1',
      offers: [{ step: 'implement', kind: 'answer', needs: 'Which database?', questions: [] }],
    }),
  );
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision, offers }));
  assert.ok(html.indexOf('aria-label="Answer"') < html.indexOf('data-lesson'), html);
  const commands = /<section aria-label="Commands"[\s\S]*?<\/section>/.exec(html)![0];
  assert.deepEqual(
    [...commands.matchAll(/<button [^>]*>/g)].map((m) => /data-copy="true"/.test(m[0])),
    [true],
  );
  assert.match(html, />implement<\/strong> asks:<\/p> <div data-markdown="true"[^>]*><p[^>]*>Which database\?<\/p><\/div>/);
});

test("the Decide section's accept row takes a reason and presses it; every other row still only copies", () => {
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: null,
    overBudget: null,
    collisions: null,
    awaiting: null,
    commands: [
      { label: 'once more', command: 'nemia round r-1 review', said: null, step: 'review' },
      {
        label: 'accept',
        command: 'nemia accept r-1 review --message "<why>"',
        said: 'review: enough — go on with what is there:  nemia accept r-1 review --message "<why>"',
        step: 'review',
      },
    ],
  };
  const html = renderToStaticMarkup(
    createElement(QueryClientProvider, { client: new QueryClient() }, createElement(DecideSection, { runId: 'r-1', decision })),
  );
  const commands = /<section aria-label="Commands"[\s\S]*?<\/section>/.exec(html)![0];
  const row = /<li data-command="accept"[\s\S]*?<\/li>/.exec(commands)![0];
  assert.match(row, /data-step="review"/);
  assert.match(row, /<code[^>]*>nemia accept r-1 review --message &quot;&lt;why&gt;&quot;<\/code>/);
  assert.match(row, /<form aria-label="Accept review as it stands"/);
  const label = /<label for="([^"]+)"[^>]*>Why review&#x27;s work is good enough as it stands<\/label>/.exec(row);
  assert.ok(label, row);
  assert.match(row, new RegExp(`<textarea id="${label[1]}"`));
  assert.match(
    row,
    /<button type="submit" disabled=""[^>]*>Accept as it stands<\/button>/,
    'blank, the button waits for a reason, as `wf accept` waits for `--message`',
  );
  assert.deepEqual(
    [.../<li data-command="once more"[\s\S]*?<\/li>/.exec(commands)![0].matchAll(/<button [^>]*>/g)].map((m) =>
      /data-copy="true"/.test(m[0]),
    ),
    [true],
  );
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

/** The banner, rendered inside the query client its Continue asks with. */
const bannerMarkup = (run: RunDetail) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(NeedsBanner, { run })));

test("the banner continues a session the harness blocked: Continue, and a box for anything to tell it, where the commands to copy were — and once asked, the step's note in `wf ls`'s words", () => {
  const base = needing('needs-human', { blockedByHarness: true, waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] });
  const asks = {
    ...base.steps[0],
    name: 'implement',
    taskId: 't-2',
    status: 'succeeded · BLOCKED',
    needs: 'Which database?',
    blockedByHarness: false,
    waitingFor: null,
    lastLine: null,
  };
  const run: RunDetail = { ...base, waitingOnYou: ['implement'], onYou: ['implement'], steps: [asks, base.steps[0]] };
  const html = bannerMarkup(run);

  assert.match(html, /^<section aria-label="Waiting on you"/);
  const texts = textsOf(html);
  assert.ok(textContentOf(html).includes('implement asks: Which database?'), html);
  assert.ok(
    texts.includes(`is blocked by the harness: ${WAIT.words} · ${LOGIN}`),
    `after the step's name, which is a tag of its own\n${html}`,
  );
  const items = new Map([...html.matchAll(/<li data-need="(\w+)" data-step="(\w+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [m[2], m[3]]));
  assert.doesNotMatch(items.get('implement')!, /<form|<button|<textarea/, 'a question is answered from the Decide section, not the banner');
  const review = items.get('review')!;
  assert.match(
    review,
    /^<p [^>]*>[\s\S]*?<\/p><p data-advice="true" class="break-words text-body-small">answer it in Claude Code: claude agents, session ae\/t-1\/1<\/p><div data-continue="true"[^>]*><form aria-label="Continue review"/,
    'under the wait, where a person answers it, which this board does not; then a form that asks the tick for another try, and nothing else',
  );
  assert.deepEqual(
    [...review.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]),
    [['submit', false, 'Continue']],
    'one button, enabled with nothing written: the box is optional',
  );
  assert.match(review, /<label for="[^"]+" class="sr-only">What to tell review, if anything<\/label>/);
  assert.match(review, /<textarea [^>]*placeholder="Anything to tell it \(optional\): the next try is told it\."/);
  assert.ok(textsOf(review).includes('nemia retry r-1 review'), `the step's retry line, as the api answers it\n${review}`);
  assert.doesNotMatch(
    html,
    /data-copy|data-unblock|ae stop|cannot continue/,
    'no commands to copy, and no sentence that the board cannot continue it',
  );

  const note = 'try 2 asked (--nudge) — stopping its blocked session, then the tick files it';
  const held = { ...base.steps[0], note, asked: { try: 2, mode: 'nudge' as const, model: null, message: null, stopFirst: true } };
  const asked = bannerMarkup({ ...run, steps: [asks, held] });
  assert.ok(
    asked.includes(`<p data-note="true" class="font-mono text-body-small">${note}</p></li>`),
    `asked: what the tick does with it, in \`wf ls\`'s words\n${asked}`,
  );
  assert.doesNotMatch(/<li data-need="harness"[\s\S]*?<\/li>/.exec(asked)![0], /<form|<button|<textarea/, 'and nothing to press');
  assert.doesNotMatch(
    /<li data-need="harness"[\s\S]*?<\/li>/.exec(asked)![0],
    /data-advice/,
    'no advice to answer the prompt in that session: the next tick stops it, so the line would send a person to a session about to go',
  );
  assert.ok(
    textsOf(asked).includes(`is blocked by the harness: ${WAIT.words} · ${LOGIN}`),
    `the wait is still said, in the need's own line\n${asked}`,
  );

  const mute = bannerMarkup({ ...run, steps: [asks, { ...base.steps[0], waitingFor: null }] });
  assert.ok(
    textsOf(mute).includes(`is blocked by the harness: ${LOGIN}`),
    `a harness that says nothing about what for: the need alone\n${mute}`,
  );
  assert.doesNotMatch(mute, /data-advice/, 'with no empty line under it');
});

/** What a piece of markup reads as, its tags gone: `textContent`, as the e2e's `hasText` reads it. */
const textContentOf = (html: string): string => unescaped(html.replace(/<[^>]+>/g, ''));

test("an agent's question is drawn as its markdown after `asks:`, in the banner and in the inspector; the banner's hover keeps it plain", async () => {
  const needs = 'Which **database**?\n\n- one\n- two';
  const run = needing('succeeded · BLOCKED', { needs }, { waitingOnYou: ['review'] });
  const item = /<li data-need="asks"[^]*?<\/li>/.exec(bannerMarkup(run))![0];
  assert.match(item, /<strong>review<\/strong> asks: <div data-markdown="true"[^>]*><p[^>]*>Which <strong>database<\/strong>\?<\/p>\s*<ul/);
  assert.match(item, /class="[^"]*max-h-40 overflow-y-auto[^"]*"/, 'a long question scrolls in a box of its own');
  assert.match(item, new RegExp(`title="asks: Which \\*\\*database\\*\\*\\?\\n\\n- one`));
  assert.ok(textContentOf(item).startsWith('review asks: Which database?'), item);

  const { Asked } = await import('../src/components/GateBrief.tsx');
  const asked = await routedWith(createElement(Asked, { run, step: run.steps[0] }));
  assert.match(
    asked,
    /data-asked="asks"[^]*<strong>review<\/strong> asks: <div data-markdown="true"[^>]*><p[^>]*>Which <strong>database<\/strong>/,
  );
  assert.ok(textContentOf(asked).includes('review asks: Which database?'), asked);
  assert.doesNotMatch(asked, /\*\*|whitespace-pre/);

  const harness = needing('needs-human', { blockedByHarness: true, waitingFor: WAIT, lastLine: '**not markdown**' }, { waitingOnYou: [] });
  const blocked = await routedWith(createElement(Asked, { run: harness, step: harness.steps[0] }));
  assert.match(
    blocked,
    /data-asked="harness"[^]*<p class="[^"]*break-words[^"]*">review is blocked by the harness; [^<]*\*\*not markdown\*\*<\/p>/,
  );
  assert.doesNotMatch(blocked, /data-markdown/, "the harness's words and the session's last line are said as they are");
});

test("a result nobody decided is asked in the inspector, with the way to the run's Decide section; a run called off asks nothing", async () => {
  const { Asked } = await import('../src/components/GateBrief.tsx');
  const toDecide = {
    kind: 'result' as const,
    branches: ['wf/r-1/ship'],
    said: 'merge or drop wf/r-1/ship',
    command: 'git merge wf/r-1/ship',
  };
  const run = { ...needing('succeeded', {}, { waitingOnYou: [] }), toDecide };
  const asked = await routedWith(createElement(Asked, { run, step: run.steps[0] }));
  assert.match(asked, /data-asked="result"/);
  assert.ok(textContentOf(asked).includes("The run's result waits on you: merge or drop wf/r-1/ship."), asked);
  assert.match(asked, /<a data-answer-link="true"[^>]*href="\/runs\/r-1#decide"/);

  const called = { ...needing('succeeded', {}, { waitingOnYou: [], cancelledAt: at }), toDecide };
  assert.equal(await routedWith(createElement(Asked, { run: called, step: called.steps[0] })), '');
});

test('a short string in a closeout is drawn as markdown; a number as it is', async () => {
  const { FieldView } = await import('../src/components/Outcome.tsx');
  const field = (value: unknown): string =>
    renderToStaticMarkup(createElement(FieldView, { name: 'next', schema: null, value, artifacts: [], images: new Set<string>() }));
  assert.match(
    field('Run `npm test`.'),
    /data-kind="text"[^]*<div data-markdown="true"[^>]*><p[^>]*>Run <code[^>]*>npm test<\/code>\.<\/p>/,
  );
  assert.match(field(3), /data-kind="text"[^]*<p class="whitespace-pre-wrap break-words">3<\/p>/);
});

test('REFUSED: the banner offers no Continue for a session still at work, which the harness did not block, nor on a run called off', () => {
  assert.equal(bannerMarkup(needing('running (working)', {}, { waitingOnYou: [] })), '', 'nothing needed: no banner');
  const held = needing('needs-human', { blockedByHarness: true, waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] });
  assert.match(bannerMarkup(held), /<form aria-label="Continue review"/);
  assert.equal(bannerMarkup({ ...held, cancelledAt: at }), '', 'called off: nobody waits for the session');
});

const Gates = await import('../src/components/Gate.tsx');

/** The run of one step, `review`, waiting at its gate on you — as the api gives it: its word, the need, and its gate. */
const atGate = (over: Partial<RunDetail['steps'][number]> = {}, run: Partial<RunDetail> = {}): RunDetail => {
  const base = runOf('awaiting approval', { waitingOnYou: ['review'] });
  return {
    ...base,
    onYou: ['approve review'],
    gates: ['review'],
    ...run,
    steps: [
      {
        ...base.steps[0],
        needs: null,
        blockedByHarness: false,
        lastLine: null,
        asked: null,
        approve: 'approve review',
        gate: { awaiting: true, approval: null },
        ...over,
      },
    ],
  };
};

/** A component rendered inside the query client its writes are made with. */
const withClient = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, element));

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
  const spec = { ...atGate().steps[0].spec, workspace: 'main' } as RunDetail['steps'][number]['spec'];
  const ending = nodeMarkup(atGate({ taskId: null, spec, attempts: { count: 0, latest: null } }));
  assert.match(ending, /<span data-need="approve"> · approve review to run it<\/span>/, 'an ending not filed runs');
  assert.match(ending, />not filed yet</, 'an ending at its gate has not been filed: not `no session yet`');
  assert.doesNotMatch(html, /running now/, 'no spinner: nobody runs a step at its gate');
  assert.equal(gateDrawn(nodeMarkup(atGate({ approve: null }, { waitingOnYou: [], onYou: [], cancelledAt: at }))), false);
});

test("the banner says who the run waits on as `wf ls` does — `approve review`, linked to the step's section, where Approve is — beside a step it names by its name", () => {
  const theme = { ...atGate().steps[0], name: 'theme', status: 'failed ✗ check (exit 1)', approve: null, gate: null };
  const run = atGate({}, { waitingOnYou: ['review', 'theme'], onYou: ['approve review', 'theme'] });
  const both = bannerMarkup({ ...run, steps: [run.steps[0], theme] });
  const line = /<p>(Waiting on you:[\s\S]*?)<\/p>/.exec(both)![1];
  assert.equal(
    textsOf(line).join(''),
    `Waiting on you:approve review, theme— signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget —nemia decide r-1`,
  );
  assert.match(
    line,
    /<strong><a href="#step-review" data-approve="review" class="underline underline-offset-2">approve review<\/a>, theme<\/strong>/,
  );
  assert.doesNotMatch(
    both,
    /<li |<form|<button/,
    "the need is the banner's line: no question to list under it, and nothing to press in the banner",
  );
});

test("in the frame's bar, the banners name a step by a button that opens the step's bar, where a hash would point nowhere", () => {
  const theme = { ...atGate().steps[0], name: 'theme', status: 'failed ✗ check (exit 1)', approve: null, gate: null };
  const run = atGate({}, { waitingOnYou: ['review', 'theme'], onYou: ['approve review', 'theme'] });
  const onStep = () => {};
  const needs = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(NeedsBanner, { run: { ...run, steps: [run.steps[0], theme] }, onStep }),
    ),
  );
  assert.doesNotMatch(needs, /href="#step-/);
  assert.match(
    needs,
    /<strong><button type="button" data-approve="review" class="underline underline-offset-2">approve review<\/button>, theme<\/strong>/,
  );
  const decide = withClient(createElement(ToDecideBanner, { run: endingRun(), onStep }));
  assert.doesNotMatch(decide, /href="#step-/);
  assert.match(decide, /<button type="button" data-approve="ship" class="underline underline-offset-2">/);
});

test('the gate: Approve with a box for the words, which may stay empty, and Send back — the answer box — with an objection it waits for, continuing the session or in a new one', () => {
  const html = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(html, /^<section aria-label="The gate of plan" data-gate="awaiting"/);
  assert.match(
    html,
    /as <code>nemia approve r-1 plan<\/code> approves it: the next tick files what waits on it/,
    'beside Approve, the line it answers',
  );
  const forms = new Map([...html.matchAll(/<form aria-label="([^"]+)"[^>]*>([\s\S]*?)<\/form>/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual([...forms.keys()], ['Approve plan', 'Send plan back']);
  const buttons = (form: string) =>
    [...forms.get(form)!.matchAll(/<button type="(\w+)"( disabled="")?[^>]*>([^<]*)<\/button>/g)].map((m) => [m[1], Boolean(m[2]), m[3]]);
  assert.deepEqual(buttons('Approve plan'), [['submit', false, 'Approve']], 'Approve is enabled with no words: an approval needs none');
  assert.deepEqual(
    buttons('Send plan back'),
    [['submit', true, 'Send back']],
    'Send back waits for an objection: the package refuses one with none',
  );
  assert.match(
    forms.get('Approve plan')!,
    /<label for="[^"]+" class="sr-only">Words to approve plan with, if any<\/label><textarea [^>]*placeholder="Your words \(optional\): every step after the gate is handed them, under “Approved”\."/,
  );
  assert.ok(textsOf(forms.get('Approve plan')!).includes('nemia approve r-1 plan'), 'the line the api answers beside the button');
  assert.match(forms.get('Send plan back')!, /<label for="[^"]+" class="sr-only">What to change, sent back to plan<\/label>/);
  const radios = [...forms.get('Send plan back')!.matchAll(/<input type="radio" name="[^"]*"( checked="")? value="(\w+)"/g)].map((m) => [
    m[2],
    Boolean(m[1]),
  ]);
  assert.deepEqual(
    radios,
    [
      ['nudge', true],
      ['fresh', false],
    ],
    'no recheck: a gate held nothing a check refused',
  );
  assert.doesNotMatch(html, /data-refused/);
});

test('an instant on a page: its words against now, and on hover the whole instant, after what it is of where the caller says', async () => {
  const { Instant } = await import('../src/components/Instant.tsx');
  const whole = instantWhole(new Date(at));
  assert.match(whole, /^\d{1,2} Sep 2026, \d{1,2}:00:00 [AP]M$/);
  const words = instantWords(new Date(at), new Date());
  assert.equal(renderToStaticMarkup(createElement(Instant, { at })), `<time dateTime="${at}" title="${whole}">${words}</time>`);
  assert.equal(
    renderToStaticMarkup(createElement(Instant, { at, about: 'When its file was last written', className: 'font-mono' })),
    `<time dateTime="${at}" title="When its file was last written: ${whole}" class="font-mono">${words}</time>`,
  );
  const today = new Date().toISOString();
  assert.match(renderToStaticMarkup(createElement(Instant, { at: today })), />\d{1,2}:\d\d [AP]M<\/time>$/, 'the time alone today');
});

test('REFUSED: an instant that does not parse stands on its page in fixed words, hover included, and its page does not throw', async () => {
  const { Instant } = await import('../src/components/Instant.tsx');
  assert.equal(
    renderToStaticMarkup(createElement(Instant, { at: 'not a date', about: 'Queued at' })),
    '<time dateTime="not a date" title="Queued at: an unreadable time">an unreadable time</time>',
  );
});

test("REFUSED: a queued card's last try says when as the board writes an instant, its date before its time on another day", async () => {
  const { Tried } = await import('../src/components/InboxParts.tsx');
  const tried = { at: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(), refused: true, why: 'no such workflow', repo: '/r' };
  const entry = { repo: '/r', factory: null, error: null, tried };
  const html = renderToStaticMarkup(createElement(Tried, { entry: entry as never }));
  const words = instantWords(new Date(tried.at), new Date());
  assert.ok(textsOf(html).join(' ').startsWith(`Not started at ${words}: no such workflow.`), html);
  assert.match(words, /^\d{1,2} [A-Z][a-z]{2} (\d{4}, )?\d{1,2}:\d\d [AP]M$/, 'three days ago is another day: never its time alone');
});

test('the approval under a step: the try, when, and the words as they were written — or that there were none', () => {
  const words = 'Ship the second reading.\nKeep the flag <b>off</b> by default.';
  const html = renderToStaticMarkup(createElement(Gates.Approved, { step: 'plan', approval: { try: 2, at, message: words } }));
  assert.match(html, /^<section aria-label="The approval of plan" data-approval="2"/);
  assert.ok(textsOf(html).includes('Approved'), html);
  assert.ok(html.includes(`try 2, <time dateTime="${at}" title="${instantWhole(new Date(at))}">`), html);
  assert.match(
    html,
    /<p data-words="true" class="whitespace-pre-wrap break-words">Ship the second reading\.\nKeep the flag &lt;b&gt;off&lt;\/b&gt; by default\.<\/p>/,
    'as text, never as markup',
  );
  const none = renderToStaticMarkup(createElement(Gates.Approved, { step: 'plan', approval: { try: 1, at, message: null } }));
  assert.match(none, /<p data-words="none"[^>]*>with no words<\/p>/);
  assert.ok(
    textsOf(html).join(' ').includes('every step after the gate is handed these words'),
    `a gate lets what follows through\n${html}`,
  );
  assert.ok(textsOf(none).join(' ').includes('every step after the gate is handed the approval'), none);
  const ending = renderToStaticMarkup(
    createElement(Gates.Approved, { step: 'ship', approval: { try: 1, at, message: words }, ends: true }),
  );
  assert.ok(
    textsOf(ending).join(' ').includes('your approval filed it, and the step is handed these words as the terms it acts on'),
    `an ending's approval files the step itself, and the words are the terms it acts on\n${ending}`,
  );
  const bare = renderToStaticMarkup(createElement(Gates.Approved, { step: 'ship', approval: { try: 1, at, message: null }, ends: true }));
  assert.ok(textsOf(bare).join(' ').includes('your approval filed it, and the step is handed it as the terms it acts on'), bare);
  assert.doesNotMatch(ending, /every step after the gate/);
  assert.deepEqual(
    [
      Gates.gateWord({ awaiting: true, approval: null }),
      Gates.gateWord({ awaiting: false, approval: { try: 1, at, message: null } }),
      Gates.gateWord({ awaiting: false, approval: null }),
    ],
    ['awaiting approval', 'approved, try 1', 'holds once it has signed off'],
  );
});

/** What `wf ls` says of a run at its ending's gate, as the api gives it (`RunToDecide`). */
const SHIPS = 'Merge this run onto the base branch, or abort on any failure.';
const toShip = {
  kind: 'approve' as const,
  step: 'ship',
  says: SHIPS,
  filed: false,
  /** An ending's send-back goes to the work it waits on, not to the step itself. */
  back: ['implement'],
  onto: 'main',
  said: `${SHIPS} — wf approve r-1 ship`,
  command: 'wf approve r-1 ship',
};

/**
 * A run of implement → ship whose ship is the workflow's ending, at its gate: implement signed off with a summary and a file, ship is
 * unfiled and `awaiting approval`, and the run carries what there is to decide. Ship's `spec`, off the workflow the run froze, is what the
 * board tells an ending's gate from another gate by.
 */
function endingRun(over: Partial<RunDetail> = {}): RunDetail {
  const run = runWith(null);
  const base = run.steps[0];
  const implement = {
    ...base,
    name: 'implement',
    taskId: 't-1',
    status: 'unverified · done',
    branch: 'wf/r-1/implement',
    gate: null,
    approve: null,
    closeout: closeoutSaying('## What changed', {
      body: '## What changed\n\n- the cap on runs in flight',
      artifacts: [{ path: 'RESPONSE.md' }],
    }),
  };
  const ship = {
    ...base,
    name: 'ship',
    taskId: null,
    status: 'awaiting approval',
    branch: null,
    body: `${SHIPS}\n\nLook at the checkout first.`,
    closeout: null,
    approve: 'approve ship',
    gate: { awaiting: true, approval: null },
    spec: {
      harness: 'claude',
      model: null,
      effort: null,
      after: ['review'],
      context: null,
      workspace: 'main',
      place: null,
      resume: null,
      permissionMode: null,
      sandbox: null,
      tools: null,
      deadlineSeconds: null,
      loop: null,
      rounds: null,
    },
  };
  return {
    ...run,
    status: 'failed',
    waitingOnYou: ['ship'],
    onYou: ['approve ship'],
    toDecide: toShip,
    gates: ['ship'],
    graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'ship', kind: 'after' }] },
    steps: [implement, ship],
    ...over,
  };
}

/** The run's decision as the api gives it, cut to what the panel reads: where the result branch stands, and how much it changed. */
const decidedAs = (standings: unknown[]) => ({
  standings,
  touched: [],
  lesson: { said: '', state: 'nothing' },
  sensitive: [],
  used: {},
  total: {},
  cost: null,
  overBudget: null,
  commands: [],
});

/**
 * A component rendered with the run's decision already read, as the Decide section on the same page has read it for this state of the run.
 */
function withDecision(run: RunDetail, decision: unknown, element: ReturnType<typeof createElement>): string {
  const client = new QueryClient();
  client.setQueryData(['runs', run.id, 'decision', decisionStamp(run)], decision);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, element));
}

test("the to-decide banner says what `wf ls` says after `→ to decide:`, and links an ending step's gate to its section — and nothing where there is nothing to decide", () => {
  const run = endingRun();
  const html = withClient(createElement(ToDecideBanner, { run }));
  assert.match(html, /^<section aria-label="To decide" data-to-decide="approve"/);
  assert.deepEqual(textsOf(html), ['To decide:', toShip.said]);
  assert.match(html, /<a href="#step-ship" data-approve="ship" class="underline underline-offset-2">/);

  const branch = {
    kind: 'result' as const,
    branches: ['wf/r-1/implement'],
    said: 'wf/r-1/implement is ahead of main, and nothing has merged it — wf decide r-1',
    command: 'wf decide r-1',
  };
  const ahead = withClient(createElement(ToDecideBanner, { run: { ...run, toDecide: branch } }));
  assert.match(ahead, /data-to-decide="result"/);
  assert.deepEqual(textsOf(ahead), ['To decide:', branch.said], 'a branch nobody merged: the words, and the command in them');
  assert.doesNotMatch(ahead, /<a /, 'it names no step to link to');

  assert.equal(withClient(createElement(ToDecideBanner, { run: { ...run, toDecide: null } })), '', 'nothing to decide: no banner');
  assert.equal(
    withClient(createElement(ToDecideBanner, { run: { ...run, toDecide: undefined as unknown as null } })),
    '',
    'and none from an api that carries none',
  );
});

test("the ending step's own gate is not asked for twice: the to-decide banner says it, and the banner below has nothing left to say", () => {
  const run = endingRun();
  assert.equal(bannerMarkup(run), '', 'the whole of what it waits on is the decision');
  const theme = { ...run.steps[0], name: 'theme', status: 'failed ✗ check (exit 1)', closeout: null, approve: null, gate: null };
  const both = bannerMarkup({ ...run, steps: [...run.steps, theme], waitingOnYou: ['ship', 'theme'], onYou: ['approve ship', 'theme'] });
  assert.match(both, /^<section aria-label="Waiting on you"/, 'another step waiting on you is still said, beside the decision');
  const line = /<p>(Waiting on you:[\s\S]*?)<\/p>/.exec(both)![1];
  assert.equal(
    textsOf(line).join(''),
    'Waiting on you:theme— signed off blocked, unsigned, refused by its check, denied a call, waiting at its gate, out of rounds, or past its budget —nemia decide r-1',
    'and only it',
  );
});

test('the step that ends the run in the checkout is known by its `workspace`, and its gate says where it holds — not that it holds once the step has signed off', async () => {
  const [implement, ship] = endingRun().steps;
  assert.equal(Gates.endsTheRun(ship), true, "it works in the repository's own checkout");
  assert.equal(Gates.endsTheRun(implement), false, 'the work does not');
  assert.equal(Gates.endsTheRun({ spec: null }), false, 'nor a step nothing defines any more');
  assert.equal(Gates.endsTheRun({ spec: { ...ship.spec!, workspace: null } }), false, 'nor one in a worktree of the run');

  const held = { awaiting: false, approval: null };
  assert.equal(
    Gates.gateWord(held, true),
    'holds once the work has handed on, and your approval files it',
    'its gate holds before the step is filed, so the word for a gate not yet held is about the work, never about this step signing off',
  );

  assert.equal(Gates.gateWord(held), 'holds once it has signed off', "§6's gate, which holds what its step handed on");
  assert.deepEqual(
    [
      Gates.gateWord({ awaiting: true, approval: null }, true),
      Gates.gateWord({ awaiting: false, approval: { try: 1, at, message: null } }, true),
    ],
    ['awaiting approval', 'approved, try 1'],
    "at it, and approved, both gates read the same: the word is the run's state, not the step's kind",
  );
});

test("what an ending step would act on, beside its gate: the branch's standing and counts, and each work step's closeout with its files", () => {
  const run = endingRun();
  const standing = {
    branch: 'wf/r-1/implement',
    where: 'ahead',
    commits: 3,
    said: 'wf/r-1/implement is ahead of main by 3 commits',
    stat: '4 files: +456 −2',
  };
  const html = withDecision(run, decidedAs([standing]), createElement(Gates.ActsOn, { run, step: run.steps[1] }));
  assert.match(html, /^<section aria-label="What ship would act on"/);
  assert.match(html, /data-standing="ahead"/);
  const texts = textsOf(html);
  assert.ok(texts.includes(standing.said), html);
  assert.ok(texts.includes(standing.stat), 'how much it changed, as `wf decide` prints it');
  assert.ok(texts.includes('implement'), `the work it waits on, off the graph\n${html}`);
  assert.match(html, /<h4[^>]*>What changed<\/h4>/, 'its closeout rendered as the markdown it is');
  assert.ok(texts.includes('the cap on runs in flight'), html);
  assert.match(html, /aria-label="Artifacts of implement"/, 'and the files it named');
  assert.ok(texts.includes('RESPONSE.md'), html);

  const none = withDecision(run, decidedAs([]), createElement(Gates.ActsOn, { run, step: run.steps[1] }));
  assert.ok(
    textsOf(none).includes('No result branch of its own: the work is on the base branch.'),
    `a run with no result branch of its own: said, not left blank\n${none}`,
  );
});

test("a result branch whose place was not heard reads unread beside an ending's gate, in the package's words — never on the base, nor ahead", () => {
  const run = endingRun();
  const why = 'the place was not heard: timed out';
  const standing = {
    branch: 'wf/r-1/implement',
    where: 'unread',
    why,
    said: `wf/r-1/implement: where it stands is not read (${why})`,
    stat: null,
  };
  const html = withDecision(run, decidedAs([standing]), createElement(Gates.ActsOn, { run, step: run.steps[1] }));
  assert.match(html, /data-standing="unread"/);
  assert.ok(textsOf(html).includes(standing.said), html);
  assert.doesNotMatch(html, /data-standing="(on|ahead|gone)"|data-stat/, 'no standing of its own, and no counts');
});

test('the gate of an ending step says approving is what files it, and its send-back goes to the work — never to the step at the gate, which `wf retry` refuses', () => {
  const html = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: ['implement'], acts: true }),
  );
  const texts = textsOf(html).join(' ');
  assert.match(
    texts,
    /ship waits at its gate: nothing of it runs until you approve it — your approval is what files it — or you send implement back\./,
  );
  assert.ok(texts.includes('nemia approve r-1 ship'), html);
  assert.match(texts, /the next tick files it(?! what)/);
  const forms = [...html.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(forms, ['Approve ship', 'Send implement back'], 'the send-back names the step it goes to');
  assert.match(html, /What to change, sent back to implement<\/label>/);
  const wide = withClient(
    createElement(Gates.Gate, {
      runId: 'r-1',
      step: 'ship',
      approveLine: 'nemia approve r-1 ship',
      back: ['implement', 'docs'],
      acts: true,
    }),
  );
  assert.deepEqual(
    [...wide.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]),
    ['Approve ship', 'Send the work back'],
    'several work steps: one send-back form',
  );
  const to = [...wide.matchAll(/<input type="radio" name="[^"]*-to"( checked="")? value="(\w+)"/g)].map((m) => [m[2], Boolean(m[1])]);
  assert.deepEqual(
    to,
    [
      ['implement', true],
      ['docs', false],
    ],
    'the objection picks one, since one is enough to hold the gate again',
  );
  const held = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(
    textsOf(held).join(' '),
    /plan waits at its gate: nothing after it is filed until you approve what it handed on, or send it back\./,
    'a gate that is no ending holds what its step handed on',
  );
  assert.doesNotMatch(held, /name="[^"]*-to"/, "and its send-back is the step's own");
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
  assert.ok(brief(toShip).includes(`Its folder says what it does: “${SHIPS}”`), "the decision's own words, where it names this step");
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

test("the gate's own words at an ending: the approval's box says the step is handed them, and the word taken names the step it was about", () => {
  const html = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: ['review'], acts: true }),
  );
  assert.match(
    html,
    /placeholder="Your words \(optional\): the step is handed them as the terms it acts on, under “Approved”\."/,
    "the words go to the step itself, as its brief's `## Approved` hands them: nothing follows an ending to be handed anything",
  );
  const held = withClient(createElement(Gates.Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan' }));
  assert.match(held, /placeholder="Your words \(optional\): every step after the gate is handed them, under “Approved”\."/);

  assert.deepEqual(
    Gates.takenOf({ approved: 1 }, 'ship', true),
    { named: 'ship', said: 'approved try 1 — the next tick files it' },
    "the panel shown the moment a word is taken: an approval is the gated step's, and files it where nothing follows it",
  );
  assert.deepEqual(Gates.takenOf({ approved: 2 }, 'plan', false), {
    named: 'plan',
    said: 'approved try 2 — the next tick files what waits on it',
  });
  assert.deepEqual(
    Gates.takenOf({ asked: { try: 2, stopFirst: false }, step: 'review' }, 'ship', true),
    { named: 'review', said: 'try 2 asked — the next tick files it' },
    "a send-back is about the step its try was asked for: the work at an ending's gate, never the step at the gate",
  );
  assert.deepEqual(Gates.takenOf({ asked: { try: 3, stopFirst: false }, step: 'plan' }, 'plan', false), {
    named: 'plan',
    said: 'try 3 asked — the next tick files it',
  });
});

test('REFUSED: an ending that waits on nothing is offered no send-back, since a try of the unfiled step is refused — the approval is the only word there is', () => {
  const alone = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: [], acts: true }),
  );
  const forms = [...alone.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(forms, ['Approve ship'], "the approval alone, as `wf ls`'s gate note prints it for such a step");
  assert.doesNotMatch(alone, /Send back|What to change/);
  assert.ok(
    textsOf(alone).join(' ').includes('ship waits at its gate: nothing of it runs until you approve it — your approval is what files it.'),
    alone,
  );
  const withWork = withClient(
    createElement(Gates.Gate, { runId: 'r-1', step: 'ship', approveLine: 'nemia approve r-1 ship', back: ['review'], acts: true }),
  );
  assert.deepEqual(
    [...withWork.matchAll(/<form aria-label="([^"]+)"/g)].map((m) => m[1]),
    ['Approve ship', 'Send review back'],
    'with work to send back to, both are offered',
  );
});

test("the Factory's legend adds the edge between two cards, dashed and still as it is while a run waits until one ships, and the faint dotted line of a run read — and a run's page's legend does not", () => {
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
    ['to come', 'running', 'done', 'loops back', 'waits until it ships', 'reads what it concluded', 'human gate', 'to decide'],
    'the edge between cards, the line of what a card reads, and the ring round a card whose result nobody has decided, which only the Factory draws',
  );
  assert.match(items.get('to decide')!, /ring-1 ring-yours/);
  const html = legendOf(true);
  assert.match(html, /title="A run that has started draws no line from its waits\."[^>]*>[\s\S]*?waits until it ships/);
  const reads = items.get('reads what it concluded')!;
  assert.match(reads, /data-sample="reads"/);
  assert.match(reads, /stroke-dasharray:1 5/);
  assert.doesNotMatch(reads, / Z"/, 'no arrow: it waits on nothing');
  const cards = items.get('waits until it ships')!;
  assert.match(cards, /data-sample="cards"/);
  assert.equal((cards.match(/<rect /g) ?? []).length, 2, 'a card at each end');
  assert.match(cards, /stroke:var\(--edge-to-come\);stroke-width:1.5;stroke-dasharray:5 4/);
  assert.equal(travelling(cards).length, 0);
});

/** What the api says of a card that still waits on `runs` before anything of it is filed (`RunWaiting`); null for none. */
const waitingOnRuns = (runs: string[]): RunSummary['waiting'] =>
  runs.length
    ? { runs: runs.map((run) => ({ run, missing: false, cancelledAt: null, gone: [] })), word: '', advice: '', onYou: false }
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

test("the run page's timeline: a row per try's session and per check, in the api's words — a recheck, a check still running, a task with no record — and the totals", async () => {
  const { Timeline } = await import('../src/components/Timeline.tsx');
  type TaskSpan = import('../src/lib/api.ts').TaskSpan;
  type TimelineTotal = import('../src/lib/api.ts').TimelineTotal;
  const T = (m: number, s = 0) => new Date(Date.UTC(2026, 8, 13, 8, m, s)).toISOString();
  const span = (taskId: string, at: TaskSpan['at'], queued: string, ran: string, times: Partial<TaskSpan> = {}): TaskSpan => ({
    taskId,
    at,
    filedAt: null,
    spawnedAt: null,
    endedAt: null,
    attempts: 1,
    queuedMs: null,
    ranMs: null,
    queued,
    ran,
    ...times,
  });
  const total = (
    round: number | null,
    queued: string,
    ran: string,
    wall: string,
    loop: string | null = round === null ? null : 'review',
  ): TimelineTotal => ({ loop, round, tasks: 0, inFlight: 0, queuedMs: 0, ranMs: 0, wallMs: null, queued, ran, wall, cost: null });
  const base = runWith(null);
  const used: StepUsed = {
    ...UNMEASURED,
    usage: { turns: 54 },
    used: '54 turns · tool calls not measured · tokens in not measured · tokens out not measured',
  };
  const run: RunDetail = {
    ...base,
    steps: [
      {
        ...base.steps[0],
        name: 'implement',
        timeline: [
          {
            try: 1,
            round: 1,
            sessionOf: null,
            used,
            session: span('t-1', 'ended', '12s', '19m42s', { filedAt: T(0), spawnedAt: T(0, 12), endedAt: T(19, 54) }),
            check: span('c-1', 'ended', '1s', '58s', { filedAt: T(19, 56) }),
          },
          {
            try: 2,
            round: 1,
            sessionOf: 1,
            used: null,
            session: null,
            check: span('c-2', 'running', '1s', 'still running, no end yet', { filedAt: T(30), spawnedAt: T(30, 1) }),
          },
        ],
      },
      {
        ...base.steps[0],
        name: 'review',
        timeline: [
          {
            try: 1,
            round: 1,
            sessionOf: null,
            used: null,
            session: span('t-lost', 'unknown', 'not on the record', 'not on the record'),
            check: null,
          },
        ],
      },
      { ...base.steps[0], name: 'respond', timeline: [] },
    ],
    timeline: { rounds: [total(1, '14s', '20m40s', 'still going')], run: total(null, '14s', '20m40s, 1 still running', 'still going') },
  };
  const html = renderToStaticMarkup(createElement(Timeline, { run }));
  const rows = [...html.matchAll(/<tr data-step="([^"]+)"(?: data-try="\d+")? data-task="(\w+)" data-at="(\w+)"/g)].map((m) => [
    m[1],
    m[2],
    m[3],
  ]);
  assert.deepEqual(
    rows,
    [
      ['implement', 'session', 'ended'],
      ['implement', 'check', 'ended'],
      ['implement', 'session', 'rechecked'],
      ['implement', 'check', 'running'],
      ['review', 'session', 'unknown'],
    ],
    `a recheck has no session of its own, and its check still running\n${html}`,
  );
  const cell = (name: string) => [...html.matchAll(new RegExp(`data-cell="${name}"[^>]*>([^<]*)<`, 'g'))].map((m) => unescaped(m[1]));
  assert.deepEqual(cell('queued'), ['12s', '1s', '1s', '14s']);
  assert.deepEqual(cell('ran'), ['19m42s', '58s', 'still running, no end yet', '20m40s, 1 still running']);
  assert.ok(
    html.includes(`<time dateTime="${T(0, 12)}"`) || html.includes(`datetime="${T(0, 12)}"`),
    'each instant as the engine wrote it, on its <time>',
  );
  const filed = new Date(T(0, 12));
  assert.ok(
    html.includes(`<time dateTime="${T(0, 12)}" title="${instantWhole(filed)}" class="font-mono">${timeToTheSecond(filed)}</time>`),
    "a log's timestamp: the time to the second on a 12-hour clock, the whole instant on hover",
  );
  assert.match(timeToTheSecond(filed), /^\d{1,2}:00:12 [AP]M$/);
  assert.match(unescaped(html), /try 2<\/td><td colSpan="7"[^>]*>its session is try 1's, checked again/i);
  assert.match(html, /no record of t-lost/);
  assert.doesNotMatch(html, /\bengine\b/, 'a person reads no runtime word');
  assert.ok(html.includes('>54 turns · tool calls not measured'), 'what the session used, beside it');
  assert.doesNotMatch(html, /data-step="respond"/, 'a step not filed has no row');
  assert.deepEqual(
    [...html.matchAll(/data-total="([^"]+)"/g)].map((m) => m[1]),
    ['run'],
    "one round: the run's total alone",
  );
  assert.match(html, /data-cell="wall"[^>]*>wall still going</, "its wall in the api's words");

  const looped = {
    ...run,
    timeline: {
      rounds: [total(1, '30s', '13m30s', '15m00s'), total(2, '1m10s', '6m50s', '9m00s')],
      run: total(null, '1m40s', '20m20s', '25m00s'),
    },
  };
  assert.deepEqual(
    [...renderToStaticMarkup(createElement(Timeline, { run: looped })).matchAll(/data-total="([^"]+)"/g)].map((m) => m[1]),
    ['round-1', 'round-2', 'run'],
    "a loop that went round: each round's total, then the run's",
  );
  const twoLoops = {
    ...run,
    timeline: {
      rounds: [
        total(1, '0s', '1m00s', '1m00s'),
        total(2, '0s', '1m00s', '1m00s'),
        total(1, '0s', '2m00s', '2m00s', 'proofread'),
        total(2, '0s', '2m00s', '2m00s', 'proofread'),
        total(1, '0s', '3m00s', '3m00s', 'lint'),
      ],
      run: total(null, '0s', '9m00s', '9m00s'),
    },
  };
  const labels = [
    ...renderToStaticMarkup(createElement(Timeline, { run: twoLoops })).matchAll(/<tr data-total="round-\d+"[^>]*><td[^>]*>([^<]+)</g),
  ].map((m) => m[1]);
  assert.deepEqual(
    labels,
    ['review round 1', 'review round 2', 'proofread round 1', 'proofread round 2'],
    "two loops that went round, and a third that did not: each round of the two, named by its looping step; none of the third's",
  );
  assert.equal(
    renderToStaticMarkup(createElement(Timeline, { run: { ...run, steps: run.steps.map((step) => ({ ...step, timeline: [] })) } })),
    '',
    'nothing filed: no timeline at all',
  );
});

const { Timeline } = await import('../src/components/Timeline.tsx');

/** A step's cost as the api gives it: what its tries cost, of a cap where it has one, and whether that is the cap or more. */
const priced = (spent: number | null, cap: number | null, over = false) => ({
  spent: spent === null ? null : { usd: spent, measured: 2, unmeasured: 0, said: `$${spent.toFixed(2)}` },
  budget: cap === null ? null : { usd: cap, said: `$${cap}`, of: spent === null ? null : `$${spent.toFixed(2)} of $${cap}`, over },
  raise: null,
});

/** `run`, its one step priced as `cost` says, with the word and who waits on it. */
const pricedRun = (
  status: string,
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
  assert.doesNotMatch(past, /--bg/, 'said of a job, not of a --bg session');
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

test("the timeline has a cost column: what each session cost, `not measured` where nobody priced it, nothing for a check — and each total its sessions', never $0", () => {
  const span = (taskId: string) => ({
    taskId,
    at: 'ended' as const,
    filedAt: at,
    spawnedAt: at,
    endedAt: at,
    attempts: 1,
    queuedMs: 0,
    ranMs: 0,
    queued: '0s',
    ran: '0s',
  });
  const used = (cost: number | null): StepUsed => ({
    ...UNMEASURED,
    cost: cost === null ? 'not measured' : `$${cost.toFixed(2)}`,
    costUsd: cost,
  });
  const base = runWith(null);
  const total = { ...base.timeline.run, loop: 'review', tasks: 2 };
  const run: RunDetail = {
    ...base,
    steps: [
      {
        ...base.steps[0],
        timeline: [
          { try: 1, round: 1, session: span('t-1'), sessionOf: null, check: span('t-1-check'), used: used(1.75) },
          { try: 2, round: 2, session: span('t-2'), sessionOf: null, check: null, used: used(null) },
        ],
      },
    ],
    timeline: {
      rounds: [
        { ...total, round: 1, cost: { usd: 1.75, measured: 1, unmeasured: 0, said: '$1.75' } },
        { ...total, round: 2, cost: null },
      ],
      run: { ...base.timeline.run, cost: { usd: 1.75, measured: 1, unmeasured: 1, said: '≥$1.75' } },
    },
  };
  const html = renderToStaticMarkup(createElement(Timeline, { run }));
  assert.match(
    html,
    /<th scope="col"[^>]*>ran<\/th><th scope="col"[^>]*>cost<\/th><th scope="col"[^>]*>used<\/th><\/tr><\/thead>/,
    'cost before `used`, which runs long: in view without scrolling the table',
  );
  const rows = [...html.matchAll(/<tr ([^>]*)>([\s\S]*?)<\/tr>/g)].map((m) => [
    /data-task="(\w+)"/.exec(m[1])?.[1] ?? /data-total="([^"]+)"/.exec(m[1])?.[1],
    /<td data-cell="cost"[^>]*>([^<]*)<\/td>/.exec(m[2])?.[1],
  ]);
  assert.deepEqual(rows, [
    ['session', '$1.75'],
    ['check', ''],
    ['session', 'not measured'],
    ['round-1', '$1.75'],
    ['round-2', 'not measured'],
    ['run', '≥$1.75'],
  ]);
  assert.match(
    html,
    /<td data-cell="cost" title="What the run&#x27;s tries cost, as its harness priced each session: 1 session measured; 1 ended session had no cost on it, so it cost at least this. A session still running is priced once it ends."/,
    'what a `≥` leaves out, on hover',
  );
});

test("the Decide section says why a step past its budget is held — `wf decide`'s OVER BUDGET line — and what every try of the run cost", () => {
  const line = 'OVER BUDGET, waiting on you: tokens ($4.25 of $3)  — the run files nothing more for it on its own; nothing after it ran';
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: 'run $6.35 measured · 2 sessions not measured',
    overBudget: line,
    collisions: null,
    commands: [],
    awaiting: null,
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(
    html,
    /<p data-over-budget="true" class="[^"]*">OVER BUDGET, waiting on you: tokens \(\$4\.25 of \$3\) {2}— the run files nothing more for it on its own; nothing after it ran<\/p>/,
  );
  assert.ok(drawnYours(/<p data-over-budget="true" class="([^"]*)"/.exec(html)![1]), 'a step held on its budget waits on a person: yours');
  assert.match(html, /<dt[^>]*>every try<\/dt><dd[^>]*>run \$6\.35 measured · 2 sessions not measured<\/dd>/);
  const none = renderToStaticMarkup(
    createElement(DecideSection, { runId: 'r-1', decision: { ...decision, overBudget: null, cost: null } }),
  );
  assert.doesNotMatch(none, /data-over-budget/, 'no step held on a budget: no line');
  assert.match(none, /<dt[^>]*>every try<\/dt><dd[^>]*>—<\/dd>/, 'nothing ended yet: a dash, not $0');
});

test('the Decide section of an ending whose landing its check refused shows its trial merges: the runs in flight, each it collides with, and the semantic conflict, linked to the step — and none where the decision read no trial', async () => {
  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: UNMEASURED,
    cost: null,
    overBudget: null,
    collisions: {
      onto: 'main',
      base: [],
      inFlight: ['r-2'],
      colliding: [
        {
          run: 'r-2',
          branch: 'wf/r-2/implement',
          ours: 'wf/r-1/implement',
          merge: { clean: false, conflicts: ['src/a.ts'] },
          said: "conflicts with r-2's wf/r-2/implement in 1 file: src/a.ts",
        },
      ],
      semantic: { step: 'ship', check: 't-check', sha: 'b'.repeat(40), said: "ship's landing check refused the merged tree" },
      said: 'collides with 1 of the 1 run in flight on main: r-2',
    },
    commands: [],
    awaiting: null,
  };
  const html = await routedWith(createElement(DecideSection, { runId: 'r-1', decision }));
  const merges = html.match(/<section aria-label="Trial merges"[^]*?<\/section>/)?.[0] ?? '';
  assert.match(merges, /<dd data-fact="others" data-state="bad"[^>]*>collides with 1 of the 1 run in flight on main: r-2<\/dd>/);
  assert.match(
    merges,
    /<dd data-fact="collides" data-state="bad"[^>]*>wf\/r-1\/implement conflicts with r-2&#x27;s wf\/r-2\/implement in 1 file: src\/a\.ts<\/dd>/,
  );
  assert.match(
    merges,
    /<dd data-fact="semantic" data-state="bad"[^>]*><a data-fact-link="ship"[^>]*href="\/runs\/r-1#step-ship"[^>]*>ship&#x27;s landing check refused the merged tree<\/a><\/dd>/,
  );
  const none = await routedWith(createElement(DecideSection, { runId: 'r-1', decision: { ...decision, collisions: null } }));
  assert.doesNotMatch(none, /Trial merges|data-fact="(others|collides|semantic)"/, 'no trial read: nothing said of one');
});

test('what sessions read, by price: beside the cost, the peak marked at a cap or past 200k, a rebuilt cache said beneath — and no row where nothing measured it', () => {
  const { Read, readRows } = facts;
  const markup = (node: unknown) => renderToStaticMarkup(node as Parameters<typeof renderToStaticMarkup>[0]);
  const used = (read: string | null, peak: 'cap' | 'large' | null = null, rebuilt = 0) => ({
    usage: null,
    used: '',
    cost: '$3.01',
    costUsd: 3.01,
    apiMs: null,
    toolMs: null,
    read,
    peak,
    rebuilt,
  });

  assert.deepEqual(readRows(used(null)), [], 'a runner that counted its input as one number: no row, not 0');
  assert.deepEqual(readRows(null), []);

  const plain = markup(createElement(Read, { said: 'read 21.4M · wrote 412k · peak 167k', peak: null, rebuilt: 0 }));
  assert.match(
    plain,
    /<span class="font-mono text-body-small"><span>read 21\.4M<\/span><span> · wrote 412k<\/span><span> · peak 167k<\/span><\/span>/,
  );
  assert.doesNotMatch(plain, /data-peak|data-rebuilt/, 'under its cap, and resumed from a warm cache: nothing marked');

  const capped = markup(
    createElement(Read, {
      said: 'read 4.4M · wrote 355k · peak 174k, compacted twice at its 200k cap · a resumed session wrote its context to the cache again instead of reading it',
      peak: 'cap',
      rebuilt: 1,
    }),
  );
  assert.match(
    capped,
    /<span data-peak="cap" class="[^"]*text-money[^"]*" title="It reached the step&#x27;s context: cap: Claude Code compacted[^"]*">peak 174k, compacted twice at its 200k cap<\/span>/,
  );
  const unpeaked = markup(createElement(Read, { said: 'read 900k · wrote 20k · compacted at its 100k cap', peak: 'cap', rebuilt: 0 }));
  assert.match(
    unpeaked,
    /<span data-peak="cap"[^>]*>compacted at its 100k cap<\/span>/,
    'no peak measured: the compaction is where it stands, and not dropped',
  );
  assert.match(
    capped,
    /<span data-rebuilt="1" class="block text-body-small [^"]*" title="[^"]*the cache was rebuilt\.">a resumed session wrote its context to the cache again instead of reading it<\/span>/,
  );

  const large = markup(
    createElement(Read, { said: 'read 2.9M · wrote 100k · peak 250k, past 200k with no cap', peak: 'large', rebuilt: 0 }),
  );
  assert.match(large, /<span data-peak="large"[^>]*>peak 250k, past 200k with no cap<\/span>/);

  const decision: Decidable = {
    standings: [],
    touched: [],
    lesson: { said: 'nothing written where the next agent reads', state: 'nothing' },
    sensitive: [],
    used: {},
    total: used('read 7.3M · wrote 455k · peak 250k, past 200k with no cap', 'large'),
    cost: 'run $6.80',
    overBudget: null,
    collisions: null,
    commands: [],
    awaiting: null,
  };
  const html = renderToStaticMarkup(createElement(DecideSection, { runId: 'r-1', decision }));
  assert.match(
    html,
    /<dt[^>]*>cost<\/dt><dd[^>]*>\$3\.01<\/dd><\/div><div[^>]*class="contents"><dt[^>]*>read<\/dt><dd[^>]*><span data-read="true" class="block"><span class="font-mono text-body-small"><span>read 7\.3M<\/span>/,
    "on the Decide section, beside the total's cost",
  );
});

test("a step past its budget is offered a raise: its word with the amounts, a box started above what it cost with no floor of the board's, and Raise the budget and try again — answer, for a step that asks; its check again, where one did not pass; go round again, for its loop", () => {
  type RetryMode = import('../src/lib/api.ts').RetryMode;
  const checkRaise = {
    by: 'retry' as const,
    above: 4.25,
    said: '$4.25',
    modes: ['nudge', 'fresh', 'recheck'] as RetryMode[],
    own: 'failed (check)' as const,
    needs: null,
    unfinished: false,
    questions: [],
  };
  const html = offersMarkup([
    { step: 'tokens', kind: 'raise', status: 'over budget $4.25 of $3', ...checkRaise },
    {
      step: 'palette',
      kind: 'raise',
      status: 'over budget $1.50 of $1',
      by: 'retry',
      above: 1.5,
      said: '$1.50',
      modes: ['nudge', 'fresh'],
      own: 'blocked',
      needs: 'Warm colours, or cool ones?',
      unfinished: false,
      questions: [],
    },
    { step: 'types', kind: 'raise', status: 'failed ✗ check (unfinished)', ...checkRaise, unfinished: true },
    {
      step: 'review',
      kind: 'raise',
      status: 'over budget — implement $2.10 of $2',
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
    [...html.matchAll(/<li data-offer="([^"]+)" data-step="([^"]+)"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => [
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
      ['nudge', true],
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
    ['nudge', true],
    ['fresh', false],
  ]);
  assert.doesNotMatch(rows.get('tokens')!.html, /data-asks/, 'a step that asked nothing has no question on its row');

  assert.deepEqual(
    radios('types'),
    [
      ['nudge', false],
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
    'on a background session, outside dontAsk, it asks: not struck, and not drawn as running',
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

/**
 * The builder's banner for a save that did not go through, as the api answered it: the head line, and whether it offers to read the folder
 * again.
 */
async function refusedMarkup(
  message: string,
  steps: string[],
  status: number | null,
): Promise<{ head: string; reread: boolean; said: string }> {
  const { SaveRefused } = await import('../src/components/WorkflowBuilder.tsx');
  const { BuildRefusal } = await import('../src/lib/api.ts');
  const html = renderToStaticMarkup(
    createElement(SaveRefused, {
      refusal: new BuildRefusal(message, steps, status),
      rereading: false,
      onReread: () => {},
    }),
  );
  const texts = textsOf(html);
  return { head: texts[0], reread: /Read the folder again/.test(html), said: texts[1] };
}

test('a save the api refused — a 4xx — says nothing was written, and only a 409 offers to read the folder again', async () => {
  const refused = await refusedMarkup('review: waits on "x", which is not a step here', ['review'], 422);
  assert.equal(refused.head, 'Not saved, and nothing written. The api refused it, for review:');
  assert.equal(refused.said, 'review: waits on "x", which is not a step here');
  assert.equal(refused.reread, false, 'nothing to read again: the folder is as the draft read it');
  const cycle = await refusedMarkup('these steps wait on each other: implement, review', ['implement', 'review'], 422);
  assert.equal(cycle.head, 'Not saved, and nothing written. The api refused it, for implement and review:');
  const folder = await refusedMarkup('no steps to write to /w, and a workflow has at least one.', [], 400);
  assert.equal(folder.head, 'Not saved, and nothing written. The api refused it:', 'no steps named, no clause');
  const stale = await refusedMarkup('/w has changed since it was read at version 3. Nothing was written. Read the folder again', [], 409);
  assert.equal(
    stale.head,
    'Not saved, and nothing written. The api refused it:',
    'the folder changed since it was read: nothing written either',
  );
  assert.equal(stale.reread, true, 'and the way on is to read it again');
});

test('REFUSED at shipped defaults: a save the api broke off — a 500 — does not say nothing was written; it says the folder may have been, and offers to read it again', async () => {
  const broke = await refusedMarkup("EACCES: permission denied, open '/w/plan.md'", [], 500);
  assert.equal(
    broke.head,
    'Not saved. The folder may have been written all the same: the api broke off (500), and what the folder holds is what is on disk:',
  );
  assert.doesNotMatch(broke.head, /nothing written/, 'a 500 is a write that broke off partway, and the api cannot say what it wrote');
  assert.equal(broke.said, "EACCES: permission denied, open '/w/plan.md'");
  assert.equal(broke.reread, true);
});

test('REFUSED at shipped defaults: a save with no status — a fetch that never landed, and an answer without what it wrote — does not say nothing was written; it says the folder may have been, names no status, and offers to read it again', async () => {
  const said =
    'Not saved. The folder may have been written all the same: the api did not say what it wrote, and what the folder holds is what is on disk:';
  const lost = await refusedMarkup('Failed to fetch', [], null);
  assert.equal(lost.head, said);
  assert.doesNotMatch(lost.head, /nothing written/, 'the api may have carried the write out and died before answering');
  assert.equal(lost.said, 'Failed to fetch');
  assert.equal(lost.reread, true);

  const shapeless = await refusedMarkup(
    'PUT /api/workflows/yours/mine answered what this board does not read: at workflow, the value is missing. The folder may be written: reload the Workflows page before writing it again.',
    [],
    null,
  );
  assert.equal(
    shapeless.head,
    said,
    "the other refusal with no status of its own (`build` in lib/api/workflows.ts): the head says what the api's answer did not say",
  );
  assert.doesNotMatch(
    shapeless.head,
    /did not answer/,
    'it answered: 200, without what it wrote; a head that says it said nothing would contradict its message on the line below',
  );
  assert.equal(shapeless.reread, true);
});

/**
 * A card's start form, rendered as a server renders it: the workflow it runs on, and the card's `repo:` when it names one. A folder
 * team's start looks at no repository, and the form says so — before the start, since a start the api takes opens the run's page.
 */
async function startMarkup(folderTeam: boolean, repo?: string): Promise<string> {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { StartRun } = await import('../src/components/StartRun.tsx');
  const workflow = {
    name: 'note',
    from: 'yours' as const,
    dir: '/home/me/.agent-workflows/workflows/note',
    description: null,
    readme: null,
    steps: [],
    graph: { roots: [], edges: [] },
    schemas: [],
    folderTeam,
    version: '0',
    error: null,
    unfilled: null,
  };
  return renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(StartRun, {
        workflow,
        card: { name: 'a-note-on-the-tides', body: 'Why the tides come twice a day.' },
        ...(repo ? { repo } : {}),
      }),
    ),
  );
}

test('a card that names a repository, started on a team that works in folders: the form says the repository is not looked at, and names it', async () => {
  const html = await startMarkup(true, '/code/app');
  const said = textsOf(html).find((text) => text.startsWith("The card's repo:"));
  assert.equal(said, "The card's repo: /code/app is not looked at — this workflow's steps work in folders, with no git repository.");
  assert.match(html, /data-ignored-repo/, 'in a note of its own, which the e2e and a person can find');
});

test('REFUSED at shipped defaults: no such note on a team that works on a repository, nor for a card that names none', async () => {
  assert.doesNotMatch(
    await startMarkup(false, '/code/app'),
    /data-ignored-repo|is not looked at/,
    'the repository is looked at, and the form says where the run goes: a note would contradict it',
  );
  assert.doesNotMatch(await startMarkup(true), /data-ignored-repo|is not looked at/, 'a card that names no repository has nothing to say');
});

const HOLDING = {
  at: '2026-09-23T07:00:00.000Z',
  runs: [{ run: 'p-1', missing: false, cancelledAt: null, gone: [], shipped: false }],
  word: 'held until p-1 ships',
  advice:
    'nothing of r-1 is filed, and nothing is asked of you, until wf decide says p-1 has shipped; to go on before then: wf hold r-1 --off',
  onYou: false,
};

test('on a run a person holds, a step at its gate is drawn held — no human gate, no waiting on you — and said held, and a step at work is drawn at work', () => {
  for (const status of ['awaiting approval', 'rounds exhausted', 'succeeded · BLOCKED']) {
    const held = nodeMarkup({ ...runOf(status, { waitingOnYou: [] }), holding: HOLDING, heldUntil: ['p-1'] });
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
    nodeMarkup({ ...runOf('running (working)', { waitingOnYou: [] }), holding: HOLDING, heldUntil: ['p-1'] }),
    /data-state="working"/,
  );
});

test("a held run's rail draws its gate and the steps not filed held, and its work at work", () => {
  const held = {
    ...summaryRun(),
    waitingOnYou: [],
    onYou: [],
    toDecide: null,
    heldUntil: ['p-1'],
    holding: HOLDING,
  } as unknown as RunSummary;
  const html = railMarkup(held);
  const pills = Object.fromEntries([...html.matchAll(/<li data-step="([^"]+)" data-state="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(pills, { implement: 'verified', tokens: 'unverified', review: 'working', theme: 'held', respond: 'held' }, html);
});

test('a hold is drawn between two cards as an --after edge is: from the run it is held until into the held card, dashed — and none once it shipped', () => {
  const card = (id: string, held: Array<{ run: string; shipped: boolean }>) => ({
    id,
    waiting: null,
    holding: held.length
      ? {
          at: '2026-09-13T00:30:00.000Z',
          runs: held.map((h) => ({ ...h, missing: false, cancelledAt: null, gone: [] })),
          word: '',
          advice: '',
          onYou: false,
        }
      : null,
  });
  const edges = afterEdges([card('p', []), card('h', [{ run: 'p', shipped: false }])]);
  assert.deepEqual(
    edges.map(({ id, source, target, type, data }) => ({ id, source, target, type, data })),
    [{ id: 'hold:p->h', source: 'p', target: 'h', type: 'state', data: { state: 'to-come', loop: false } }],
  );
  assert.match(edgeMarkup(edges[0]), /stroke-dasharray:5 4/);
  assert.deepEqual(afterEdges([card('p', []), card('h', [{ run: 'p', shipped: true }])]), [], 'a hold whose run shipped is no wait');
});

const { HandedOn } = await import('../src/components/Closeout.tsx');
const { Gate } = await import('../src/components/Gate.tsx');

/** A plan's closeout as the api gives it, its fields in the order its schema declares them: files long enough to fold, risks not. */
const planCloseout: StepCloseout = {
  outcome: 'done',
  summary: 'Parse the flag, then store it.',
  needs: null,
  apiVersion: null,
  body: null,
  values: [],
  refused: [],
  artifacts: [],
  replies: null,
  missing: [],
  questions: [],
  raw: {},
  output: {
    approach: 'Parse `--flag` in cli.ts and store it on the run record.',
    files: ['cli.ts', 'run.ts', 'store.ts', 'README.md'].map((path) => ({ path, change: `edit ${path}` })),
    steps: ['Parse it', 'Store it'],
    risks: ['An old record has no flag'],
  },
  schema: {
    approach: { type: 'string' },
    files: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, change: { type: 'string' } } } },
    steps: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
  },
};

/** The looping run's one step, at plan's gate with that closeout — or signed off with none, or still running. */
function gatedRun(closeout: StepCloseout | null, status = 'awaiting approval'): RunDetail {
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

test("the run page's gate draws what is being approved beside Approve and Send back; the inspector's, whose Output tab has it, does not", () => {
  const html = withClient(
    createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan', closeout: planCloseout }),
  );
  const handed = html.indexOf('aria-label="What plan handed on"');
  assert.ok(handed >= 0, html);
  assert.ok(handed < html.indexOf('aria-label="Approve plan"'), 'what it handed on comes before the answer: read, then decided');
  assert.match(html, /data-field="approach"/);
  assert.match(html, /lg:grid-cols-2/, 'beside the answer where the page is wide');
  const bare = withClient(createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan', framed: false }));
  assert.doesNotMatch(bare, /handed on, which you approve|data-handed-on|lg:grid-cols-2/);
});

/** A design's closeout at its gate, asking two questions as data in its `open` field. */
const askingCloseout: StepCloseout = {
  ...planCloseout,
  output: { approach: 'Cut it.', open: [cut, where] },
  schema: { approach: { type: 'string' }, open: { type: 'array' } },
  questions: [{ field: 'open', questions: [cut, where] }],
};

test('a gate whose step asks questions draws them in the answer column, after what it handed on, with the recommended answers offered — and Approve and Send back wait until each is answered', () => {
  const html = withClient(
    createElement(Gate, {
      runId: 'r-1',
      step: 'design',
      approveLine: 'nemia approve r-1 design',
      closeout: askingCloseout,
      questions: [cut, where],
    }),
  );
  const handed = html.indexOf('aria-label="What design handed on"');
  const asked = html.indexOf('aria-label="What design asks"');
  const approve = html.indexOf('aria-label="Approve design"');
  assert.ok(handed >= 0 && handed < asked && asked < approve, html);
  assert.doesNotMatch(html.slice(handed, asked), /data-questions=/, 'the questions are drawn once, as fields, not read-only beside');
  assert.match(html, /<fieldset data-question="How is the card cut\?"/);
  assert.match(html, /<fieldset data-question="Where do the answers go\?"/);
  assert.match(html, /<button type="button" data-recommend-all[^>]*>Choose the recommended answers<\/button>/);
  assert.match(
    html,
    /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"[^>]*>Approve<\/button>/,
  );
  assert.match(
    html,
    /placeholder="A note beside the answers \(optional\): every step after the gate is handed it with the answers, under “Approved”\."/,
  );
  assert.match(html, /<button type="submit" disabled=""[^>]*>Send back<\/button>/, 'nothing to send back yet: no words, no answers');
  const plain = withClient(
    createElement(Gate, { runId: 'r-1', step: 'plan', approveLine: 'nemia approve r-1 plan', closeout: planCloseout }),
  );
  assert.doesNotMatch(plain, /data-gate-questions|Not answered|data-recommend-all/);
  assert.match(plain, /<button type="submit"[^>]*>Approve<\/button>/);
  assert.doesNotMatch(plain, /<button type="submit" disabled=""[^>]*>Approve<\/button>/);
});

test("the inspector's gate of a step that asks questions draws them too, its Approve waiting until each is answered — and a step that asks none, no fields", async () => {
  const { Asked } = await import('../src/components/GateBrief.tsx');
  const run = atGate({ closeout: askingCloseout });
  const html = await routedWith(createElement(Asked, { run, step: run.steps[0] }));
  const asked = /<section aria-label="What review asks of you"[^]*$/.exec(html)?.[0] ?? '';
  assert.match(asked, /<section [^>]*aria-label="What review asks"/, html);
  assert.match(asked, /<fieldset data-question="How is the card cut\?"/);
  assert.match(asked, /<fieldset data-question="Where do the answers go\?"/);
  assert.match(asked, /<button type="button" data-recommend-all[^>]*>Choose the recommended answers<\/button>/);
  assert.match(
    asked,
    /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"[^>]*>Approve<\/button>/,
  );
  const plain = atGate({ closeout: planCloseout });
  const none = await routedWith(createElement(Asked, { run: plain, step: plain.steps[0] }));
  assert.match(none, /aria-label="What review asks of you"/);
  assert.doesNotMatch(none, /data-question=|Not answered|data-recommend-all/);
  assert.match(none, /<button type="submit"[^>]*>Approve<\/button>/);
  assert.doesNotMatch(none, /<button type="submit" disabled=""[^>]*>Approve<\/button>/);
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
    Gates.sendBackBody({ step: 'design', to, mode: 'nudge', objection, questions: [cut, where], draft });
  assert.deepEqual(back('design', all, ''), {
    mode: 'nudge',
    step: 'design',
    answers: [
      { question: cut.title, chose: ['a'] },
      { question: where.title, chose: ['retry'] },
    ],
  });
  assert.deepEqual(back('design', all, 'Smaller.'), { ...back('design', all, ''), message: 'Smaller.' });
  assert.deepEqual(back('design', {}, 'Smaller.'), { mode: 'nudge', message: 'Smaller.', step: 'design' });
  assert.deepEqual(back('plan', all, 'Redo it.'), { mode: 'nudge', message: 'Redo it.', step: 'plan' });
  const waits = (to: string, draft: Record<string, { chose: string[]; own: string }>) =>
    Gates.sendBackWaits({ step: 'design', to, questions: [cut, where], draft });
  assert.deepEqual(waits('design', some), [where.title], 'some answered: held until the rest are');
  assert.equal(waits('design', {}).length, 0, 'none answered: the words go alone');
  assert.equal(waits('design', all).length, 0);
  assert.equal(waits('plan', some).length, 0, 'to another step: the answers stay behind');
});

const { raiseBody } = await import('../src/components/Raise.tsx');

test('a raise of a step that signed off blocked asking questions as data draws them to answer by choosing, with the recommended answers and a note beside them, its button waiting for each', () => {
  const html = offersMarkup([
    {
      step: 'palette',
      kind: 'raise',
      status: 'over budget $1.50 of $1',
      by: 'retry',
      above: 1.5,
      said: '$1.50',
      modes: ['nudge', 'fresh'],
      own: 'blocked',
      needs: 'Two questions.',
      unfinished: false,
      questions: [cut, where],
    },
  ]);
  assert.match(html, /<fieldset data-question="How is the card cut\?"/);
  assert.match(html, /<fieldset data-question="Where do the answers go\?"/);
  assert.match(html, /data-recommend-all[^>]*>Choose the recommended answers</);
  assert.match(html, /class="sr-only">A note to palette beside the answers<\/label>/);
  assert.doesNotMatch(html, /Your answer to palette/);
  assert.match(
    html,
    /<button type="submit" disabled="" title="Not answered: How is the card cut\? · Where do the answers go\?"[^>]*>Raise the budget and answer<\/button>/,
  );
});

test("what a raise's try sends: the budget typed, and for a step asking questions as data its answers in the order asked, the note left out when empty", () => {
  const draft = { [where.title]: { chose: ['retry', 'gate'], own: '' }, [cut.title]: { chose: ['b'], own: '' } };
  const asked = { mode: 'nudge' as const, amount: '3', asks: true, questions: [cut, where], draft };
  const answers = [
    { question: cut.title, chose: ['b'] },
    { question: where.title, chose: ['retry', 'gate'] },
  ];
  assert.deepEqual(raiseBody({ ...asked, message: '' }), { mode: 'nudge', budget: 3, answers });
  assert.deepEqual(raiseBody({ ...asked, message: 'Hurry.' }), { mode: 'nudge', budget: 3, answers, message: 'Hurry.' });
  assert.deepEqual(raiseBody({ ...asked, amount: ' ', message: '' }), { mode: 'nudge', answers });
  assert.deepEqual(raiseBody({ ...asked, questions: [], message: 'Warm.' }), { mode: 'nudge', budget: 3, message: 'Warm.' });
  assert.deepEqual(raiseBody({ ...asked, asks: false, questions: [], message: '' }), { mode: 'nudge', budget: 3 });
});

test("an agent's form shows its card read-only, generated from its skills: an entry each, no field to edit it, and the package's refusal where none can be made", async () => {
  const { AgentForm } = await import('../src/components/AgentForm.tsx');
  const agent = {
    name: 'scribe',
    from: 'yours' as const,
    dir: '/store/agents',
    file: '/store/agents/scribe.md',
    role: null,
    description: 'Writes notes.',
    keys: { tools: 'Read, Skill' },
    body: 'Write.\n',
    schema: null,
    skills: 'write-a-note, file-it',
    harnessPrompt: null,
    mcp: null,
    given: [],
    source: '',
    version: 'v1',
    usedBy: [],
    error: null,
    untried: null,
    cardError: null,
    card: [
      { id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['note', 'docs'] },
      { id: 'file-it', name: 'File it away', description: 'Files a note where it belongs.', tags: ['file-it'] },
    ],
  };
  const form = (listing: typeof agent | null) =>
    withClient(createElement(AgentForm, { listing, keyForm: undefined, saving: false, refusal: null, onSave: () => {} }));
  const html = form(agent);
  assert.deepEqual(
    [...html.matchAll(/data-agent-skill="([^"]+)"/g)].map((m) => m[1]),
    ['write-a-note', 'file-it'],
    'an entry for each skill, in its order',
  );
  assert.ok(textsOf(html).includes('Write a note') && textsOf(html).includes('Files a note where it belongs.'));
  assert.doesNotMatch(html, /Card file|Its card|skills\.json/, 'no field edits it, and no card file is named');
  assert.match(html, /Generated from its skills/);
  const refused = form({
    ...agent,
    card: null,
    cardError: 'agents/scribe.md gives the skill `file-it`, and no skills folder has it',
  } as never);
  assert.match(refused, /data-card-error/);
  assert.ok(textsOf(refused).some((t) => t.startsWith('agents/scribe.md gives the skill `file-it`, and no skills folder has it')));
  assert.doesNotMatch(refused, /data-agent-skill/);
  assert.match(form(null), /data-card-generated[^>]*>[^<]*Shown once it is saved\./, 'a new agent has no card until it is saved');
});

const PLACES = [
  {
    from: 'yours',
    dir: '/store/workflows/skills',
    skills: [
      {
        name: 'write-a-note',
        from: 'yours',
        dir: '/store/workflows/skills/write-a-note',
        entry: { id: 'write-a-note', name: 'Write a note', description: 'Writes the notes of a change.', tags: ['note'] },
        error: null,
        preload: false,
        cost: { preload: false, listed: 12, body: 340, perTurn: 12 },
        usedBy: ['scribe'],
        found: null,
      },
    ],
  },
  {
    from: 'repo',
    dir: '/repo/.claude/skills',
    skills: [
      {
        name: 'scratch',
        from: 'repo',
        dir: '/repo/.claude/skills/scratch',
        entry: null,
        error: '/repo/.claude/skills/scratch/SKILL.md has no frontmatter',
        preload: false,
        cost: { preload: false, listed: 3, body: 9, perTurn: 3 },
        usedBy: [],
        found: null,
      },
      {
        name: 'ask-first',
        from: 'repo',
        dir: '/repo/.claude/skills/ask-first',
        entry: { id: 'ask-first', name: 'Ask first', description: 'Asks before it acts.', tags: ['ask-first'] },
        error: null,
        preload: true,
        cost: { preload: true, listed: 8, body: 1200, perTurn: 1208 },
        usedBy: [],
        found: null,
      },
    ],
  },
  { from: 'shipped', dir: '/hkb/workflows/skills', skills: [] },
];

/** An agent's form of yours with the skill list read already, as the picker reads it, inside a router: a given skill links to its page. */
async function agentFormWith(listing: Record<string, unknown>, readOnly = false): Promise<string> {
  const { AgentForm } = await import('../src/components/AgentForm.tsx');
  const { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
  const client = new QueryClient();
  client.setQueryData(['skills'], PLACES);
  const form = createElement(AgentForm, {
    listing: listing as never,
    keyForm: undefined,
    readOnly,
    saving: false,
    refusal: null,
    onSave: () => {},
  });
  return renderToStaticMarkup(
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
    createElement(RouterContextProvider, { router, children: createElement(QueryClientProvider, { client }, form) }),
  );
}

const composing = {
  name: 'scribe',
  from: 'yours',
  dir: '/store/agents',
  file: '/store/agents/scribe.md',
  role: null,
  description: 'Writes notes.',
  keys: { tools: 'Read' },
  body: 'Write.\n',
  schema: null,
  skills: 'write-a-note, ask-first, gone',
  harnessPrompt: null,
  mcp: null,
  source: '',
  version: 'v1',
  usedBy: [],
  error: null,
  untried: null,
  cardError: null,
  card: null,
  given: [
    {
      name: 'gone',
      from: null,
      foundIn: null,
      entry: null,
      error: 'No skills folder has `gone` — looked in /store/workflows/skills, /repo/.claude/skills.',
      preload: false,
      cost: null,
    },
  ],
};

test("a skill an agent gives named with its folder is a row as written, the repository's, with the folder it is read from and no link; one found nowhere still says so", async () => {
  const { GivenSkills } = await import('../src/components/AgentParts.tsx');
  const rows = [
    {
      name: 'apps/site:lay-out',
      from: null,
      foundIn: 'apps/site/.claude/skills/lay-out',
      entry: null,
      error: null,
      preload: false,
      cost: null,
    },
    { ...composing.given[0] },
  ];
  const html = await routedWith(createElement(GivenSkills, { rows, none: 'None.' }));
  const [folder, gone] = html.split('data-given-skill="gone"');
  assert.match(folder, /data-given-skill="apps\/site:lay-out"[^]*<span[^>]*font-mono[^>]*>apps\/site:lay-out<\/span>/);
  assert.match(folder, /data-skill-from="folder"[^>]*bg-muted text-muted-foreground[^>]*>this repository</);
  assert.match(folder, /data-found-in[^>]*>Read from\s*<code[^>]*>apps\/site\/\.claude\/skills\/lay-out<\/code>/);
  assert.doesNotMatch(folder, /data-skill-link|href="\/agents\/skills\/|not found/);
  assert.match(gone, /data-skill-from="none"[^>]*>not found</);
  assert.doesNotMatch(gone, /data-found-in/);
});

test('an agent of yours lists the skills it gives, each with where it is found and what it costs a turn, and a Remove each; one found nowhere says so', async () => {
  const html = await agentFormWith(composing);
  assert.deepEqual(
    [...html.matchAll(/data-given-skill="([^"]+)"/g)].map((m) => m[1]),
    ['write-a-note', 'ask-first', 'gone'],
    'in the order its line gives them',
  );
  assert.deepEqual(
    [...html.matchAll(/data-skill-from="([^"]+)"/g)].map((m) => m[1]),
    ['yours', 'repo', 'none'],
  );
  assert.deepEqual(
    [...html.matchAll(/href="([^"]+)"[^>]*data-skill-link="([^"]+)"|data-skill-link="([^"]+)"[^>]*href="([^"]+)"/g)].map(
      (m) => m[1] ?? m[4],
    ),
    ['/agents/skills/yours/write-a-note', '/agents/skills/repo/ask-first'],
    'each found skill links to its page, where it is found; the one found nowhere has no page',
  );
  const texts = textsOf(html);
  assert.ok(texts.includes('named — about 12 tokens a turn, and about 340 more in a turn that loads it'), texts.join(' | '));
  assert.ok(texts.includes('loaded every turn — about 1,208 tokens (cached)'), 'a preloaded skill costs its body every turn');
  assert.ok(
    texts.some((t) => t.startsWith('No skills folder has `gone`')),
    "the one found nowhere says why, in the api's words",
  );
  assert.equal([...html.matchAll(/aria-label="Remove [^"]+"/g)].length, 3);
  assert.match(html, />Add a skill</);
  assert.doesNotMatch(html, /aria-label="Skills"|placeholder="review-a-change/, 'no field to type the names in');
});

test('an agent whose tools leave out Skill is told so before a save is refused, with the one press that puts it right; one with no tools set is not', async () => {
  assert.match(await agentFormWith(composing), /data-skill-tool-note[\s\S]*Add Skill to its tools/);
  assert.doesNotMatch(await agentFormWith({ ...composing, keys: { tools: 'Read, Skill' } }), /data-skill-tool-note/);
  assert.doesNotMatch(
    await agentFormWith({ ...composing, keys: {} }),
    /data-skill-tool-note/,
    'unset, the harness decides, and Skill is among what it allows',
  );
  assert.match(await agentFormWith({ ...composing, keys: { disallowedTools: 'Skill' } }), /Take Skill off its denied tools/);
  assert.doesNotMatch(
    await agentFormWith({ ...composing, skills: null, given: [] }),
    /data-skill-tool-note/,
    'nor one that gives no skills',
  );
});

test("Claude Code's prompt is a choice of what the agent does, keep drawn chosen when unset, and Only my instructions kept behind For experts", async () => {
  const unset = await agentFormWith({ ...composing, skills: null, given: [] });
  assert.match(
    unset,
    /data-harness-prompt="keep"[^>]*data-selected="true"|data-selected="true"[^>]*data-harness-prompt="keep"/,
    'unset reads as keep',
  );
  assert.match(
    unset,
    /data-slot="label">Claude Code&#x27;s prompt<\/span>/,
    "the choice is labelled Claude Code's prompt, never System prompt",
  );
  assert.doesNotMatch(unset, /System prompt/);
  assert.match(
    unset,
    /harnessPrompt:<\/code> — how much of Claude Code&#x27;s own prompt its sessions keep, before the instructions\s+below\./,
    'the help line names the key and what it shapes',
  );
  assert.match(unset, /Works on code or files/);
  assert.match(unset, /Doesn&#x27;t write code/);
  assert.match(unset, /For experts/);
  assert.doesNotMatch(unset, /Only my instructions/, 'the expert choice is not drawn while its fold is shut');
  const replace = await agentFormWith({ ...composing, harnessPrompt: 'replace' });
  assert.match(
    replace,
    /data-harness-prompt="replace"[^>]*data-selected="true"|data-selected="true"[^>]*data-harness-prompt="replace"/,
    'an agent that says replace opens the fold, chosen',
  );
  assert.match(await agentFormWith({ ...composing, harnessPrompt: 'terse' }), /harnessPrompt: terse<\/code>, which is none of these/);
});

test("the repository's agent lists the skills it gives read-only: no Remove, no Add, and no list read for it", async () => {
  const html = await agentFormWith(
    {
      ...composing,
      from: 'repo',
      given: [
        {
          name: 'write-a-note',
          from: 'repo',
          entry: { id: 'write-a-note', name: 'Write a note', description: 'Writes.', tags: [] },
          error: null,
          preload: false,
          cost: { preload: false, listed: 5, body: 7, perTurn: 5 },
        },
      ],
      skills: 'write-a-note',
    },
    true,
  );
  assert.deepEqual(
    [...html.matchAll(/data-given-skill="([^"]+)"/g)].map((m) => m[1]),
    ['write-a-note'],
  );
  assert.doesNotMatch(html, /aria-label="Remove |Add a skill|data-skill-tool-note/);
});

test("a repository agent's instructions are read as markdown, under their label and hint; one of yours is typed in as written", async () => {
  const body = '## Role\n\nYou **write**.';
  const theirs = await agentFormWith({ ...composing, from: 'repo', body }, true);
  const field = /<section aria-label="Instructions" data-field-markdown="true"[^]*?<\/section>/.exec(theirs)?.[0] ?? '';
  assert.match(field, />Instructions<[^]*<h4[^>]*>Role<\/h4>[^]*<strong>write<\/strong>[^]*What every node that names it is told/);
  assert.doesNotMatch(theirs, /<textarea[^>]*>## Role/, 'no box to type in');
  assert.match(await agentFormWith({ ...composing, from: 'repo', body: '' }, true), /data-field-markdown[^]*Nothing written/);
  const mine = await agentFormWith({ ...composing, body });
  assert.match(mine, /<textarea[^>]*>## Role\n\nYou \*\*write\*\*\.<\/textarea>/);
  assert.doesNotMatch(mine, /data-field-markdown/);
});

const SKILL_DETAIL = {
  skill: PLACES[0].skills[0],
  version: 'v1',
  draft: {
    name: 'write-a-note',
    title: 'Write a note',
    description: 'Writes the notes of a change.',
    tags: ['note'],
    examples: ['Write the notes'],
    preload: false,
    body: 'Write them.\n',
  },
  body: 'Write them.\n',
  users: [{ from: 'yours', name: 'scribe' }],
  copyHint: "mkdir -p '/repo/.claude/skills' && cp -r '/store/workflows/skills/write-a-note' '/repo/.claude/skills/'",
};

async function skillForm(props: Record<string, unknown>): Promise<string> {
  const { SkillForm } = await import('../src/components/SkillForm.tsx');
  return renderToStaticMarkup(createElement(SkillForm, { saving: false, refusal: null, onSave: () => {}, ...props } as never));
}

test("a new skill's form takes its name, title, description, tags, examples and instructions, and creates it", async () => {
  const html = await skillForm({ detail: null });
  assert.match(html, /aria-label="New skill"/);
  for (const label of ['Name', 'Title', 'Description', 'Tags', 'Examples', 'Instructions'])
    assert.match(html, new RegExp(`>${label}</label>`), label);
  assert.doesNotMatch(html, /readonly=""/i, 'every field is to be typed in');
  assert.match(html, />Create skill</);
});

test("a skill of yours is filled from its file, its name set once, and saved; the repository's or Nemia's is read, not saved", async () => {
  const between = (changed: boolean) => createElement('p', { 'data-between': String(changed) });
  const mine = await skillForm({ detail: SKILL_DETAIL, between });
  assert.match(mine, /readOnly=""[^>]*value="write-a-note"/, 'the name is its folder, and an agent names it by it');
  assert.match(mine, /Writes the notes of a change\./);
  assert.match(mine, />Write them\.\n<\/textarea>/);
  assert.match(mine, /data-between="false"/, 'the switch is told the form holds nothing unsaved');
  assert.match(mine, />Save</);
  const theirs = await skillForm({ detail: { ...SKILL_DETAIL, skill: { ...SKILL_DETAIL.skill, from: 'repo' } }, readOnly: true });
  assert.doesNotMatch(theirs, />Save<|>Create skill</);
  assert.equal([...theirs.matchAll(/readOnly=""/g)].length, 5, 'every field read-only, and its instructions read as markdown');
  assert.match(
    theirs,
    /<section aria-label="Instructions" data-field-markdown="true"[^>]*>[^]*<div data-markdown="true"[^>]*><p[^>]*>Write them\.<\/p>/,
  );
  assert.equal([...mine.matchAll(/readOnly=""/g)].length, 1, 'of yours, only the name');
  assert.doesNotMatch(mine, /data-field-markdown/, 'of yours, the instructions are typed in');
});

/** A page's piece inside a router, with the queries it reads already answered: a route link needs the router. */
async function routedWith(element: ReturnType<typeof createElement>, data: Array<[readonly unknown[], unknown]> = []): Promise<string> {
  const { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
  const client = new QueryClient();
  for (const [key, value] of data) client.setQueryData(key, value);
  return renderToStaticMarkup(
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
    createElement(RouterContextProvider, { router, children: createElement(QueryClientProvider, { client }, element) }),
  );
}

const tried = (id: string, fields: Record<string, unknown> = {}) => ({
  id,
  try: { agent: 'scribe' },
  createdAt: at,
  moving: false,
  ...fields,
});

/** A try's run as its page reads it: one step, `try`, filed, with what it spent of its dollar and the files its folder holds. */
function tryDetail(fields: Record<string, unknown> = {}): RunDetail {
  const run = runWith(null);
  return {
    ...run,
    id: 'r-t',
    repo: null,
    place: 'folder',
    status: 'succeeded',
    try: { agent: 'scribe' },
    holding: null,
    cancelledAt: null,
    steps: [
      {
        ...run.steps[0],
        name: 'try',
        status: 'done',
        taskId: 't-t',
        filesError: null,
        files: [{ path: 'note.md', name: 'note.md', url: '/api/runs/r-t/steps/try/files/note.md', kind: 'text', size: 120 }],
        spent: { said: '$0.12', usd: 0.12, measured: 1, unmeasured: 0 },
        budget: { usd: 1, said: '$1', of: '$0.12 of $1', over: false },
      },
    ],
    ...fields,
  } as never;
}

test('an agent of yours is tried from its page: the fence said in one line, and Try it held until there is a brief', async () => {
  const { TryAgent } = await import('../src/components/TryAgent.tsx');
  const html = await routedWith(createElement(TryAgent, { agent: composing as never }), [[['runs'], []]]);
  const texts = textsOf(html);
  assert.ok(
    texts.includes(
      "A rehearsal fenced to its own folder, not the agent's own permissions: dontAsk, allowed Edit(**) in its folder and never more than the agent is, $1 to spend.",
    ),
    texts.join(' | '),
  );
  assert.match(html, /<button type="submit" disabled=""[^>]*>Try it<\/button>/, 'no brief, no try');
  assert.match(html, /data-try-held[^>]*>Write a brief to try it on\./);
  assert.doesNotMatch(html, /data-try=/, 'an agent never tried shows no try');
});

test('REFUSED: a second try while one moves — the button is held, and the latest try is drawn: its state, its spend of the dollar, its files and its run', async () => {
  const { TryAgent } = await import('../src/components/TryAgent.tsx');
  const runs = [
    tried('r-old', { createdAt: '2026-09-01T00:00:00.000Z' }),
    tried('r-t', { moving: true, createdAt: '2026-09-25T00:00:00.000Z' }),
    { ...tried('r-x'), try: null },
  ];
  const html = await routedWith(createElement(TryAgent, { agent: composing as never }), [
    [['runs'], runs],
    [['runs', 'r-t'], tryDetail({ status: 'running' })],
  ]);
  assert.match(html, /data-try-held[^>]*>A try is still running \(r-t\): one at a time\./);
  assert.match(html, /<button type="submit" disabled=""/);
  assert.match(html, /data-try="r-t"/, 'the newest try of this agent, not the older one');
  assert.match(html, /href="\/runs\/r-t"[^>]*data-try-run="r-t"|data-try-run="r-t"[^>]*href="\/runs\/r-t"/, 'linked to its run');
  assert.match(html, /data-try-status[^>]*>running</);
  assert.match(html, /data-try-spent[\s\S]*\$0\.12 of \$1/, 'what it spent of its budget');
  assert.match(html, /data-try-files[\s\S]*note\.md/);
});

test("a try stopped where no step broke says what stopped it, in its run's own word and with no row of the list, not a bare failed", async () => {
  const { TryAgent } = await import('../src/components/TryAgent.tsx');
  const html = await routedWith(createElement(TryAgent, { agent: composing as never }), [
    [['runs'], [tried('r-t', { status: 'running' })]],
    [['runs', 'r-t'], tryDetail({ status: 'blocked' })],
  ]);
  assert.match(html, /data-try-status[^>]*>blocked</);
});

test('a try not filed yet says so in place of its files', async () => {
  const { TryRun } = await import('../src/components/TryAgent.tsx');
  const unfiled = tryDetail();
  (unfiled.steps[0] as { taskId: string | null }).taskId = null;
  const html = await routedWith(createElement(TryRun, { id: 'r-t' }), [[['runs', 'r-t'], unfiled]]);
  assert.match(html, /Not filed yet/);
  assert.doesNotMatch(html, /data-try-files/);
});

test("the repository's agent is not tried: its page says to copy it to yours, with the api's copy into the store it reads", async () => {
  const { TryYours } = await import('../src/components/TryAgent.tsx');
  const copy = "mkdir -p '/tmp/e2e-store/workflows/agents' && cp '/repo/workflows/agents/critic.md' '/tmp/e2e-store/workflows/agents/'";
  const untried = { why: 'Only an agent of yours can be tried — a try runs with no repository. Copy it to yours to try it.', copy };
  const html = renderToStaticMarkup(
    createElement(TryYours, { agent: { ...composing, from: 'repo', file: '/repo/workflows/agents/critic.md', untried } as never }),
  );
  assert.match(html, /data-try-yours/);
  assert.match(html, /Copy it to yours to try it/);
  assert.ok(textsOf(html).includes(copy), `the copy as the api words it, into its own store: ${textsOf(html).join(' | ')}`);
  assert.doesNotMatch(html, /~\/\.agent-workflows/, 'no store the api may not read');
  assert.doesNotMatch(html, />Try it<\/button>/);
});

test("REFUSED: an agent of yours the try's fence does not reach says why in place of the Try it button", async () => {
  const { TryAgent } = await import('../src/components/TryAgent.tsx');
  const why =
    "coder runs on `codex`, and a try is fenced by Claude Code's permission mode — `dontAsk` with `Edit(**)`, in a folder of its own — which codex does not take.";
  const html = await routedWith(
    createElement(TryAgent, { agent: { ...composing, name: 'coder', keys: { harness: 'codex' }, untried: { why, copy: null } } as never }),
    [[['runs'], []]],
  );
  assert.ok(textsOf(html).includes(why), textsOf(html).join(' | '));
  assert.match(html, /data-try-untried/);
  assert.doesNotMatch(html, /data-try-yours/, 'it is yours: nothing to copy');
  assert.doesNotMatch(html, />Try it<\/button>|<textarea/, 'no brief and no button');
});

test("a try's run is tagged try and names the agent it tried, linked to its page; any other run names its workflow, linked to its page in the run's place", async () => {
  const { StartedFrom } = await import('../src/components/TryTag.tsx');
  const html = await routedWith(
    createElement(StartedFrom, { run: { workflowDir: '/store/tries/scribe', workflowPage: null, try: { agent: 'scribe' } } }),
  );
  assert.match(html, /data-try-tag="scribe"[^>]*>try</);
  assert.match(html, /href="\/agents\/yours\/scribe"/);
  assert.doesNotMatch(html, /data-workflow=/, 'its folder is on no page');
  const other = await routedWith(
    createElement(StartedFrom, { run: { workflowDir: '/store/workflows/notes', workflowPage: null, try: null } }),
  );
  assert.match(other, /data-workflow="notes"/);
  assert.match(other, /href="\/workflows"/, 'a workflow the board pages on no address: the Workflows page');
  assert.doesNotMatch(other, /data-try-tag/);
  const paged = await routedWith(
    createElement(StartedFrom, {
      run: {
        workflowDir: '/store/workflows/notes',
        workflowPage: { from: 'yours', workflow: 'notes', factory: 'nemia', repo: '/code/app' },
        try: null,
      },
    }),
  );
  assert.match(paged, /href="\/workflows\/yours\/notes\?factory=nemia&amp;repo=%2Fcode%2Fapp"/, paged);
});

test('REFUSED: the Debug panel is closed by default, and reads and draws nothing of the path while it is', async () => {
  const { DebugPanel } = await import('../src/components/DebugPanel.tsx');
  const client = new QueryClient();
  const step = { name: 'implement', taskId: 't-1', status: 'running', tries: [{ try: 1, current: true }] };
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
  assert.equal(client.getQueryCache().getAll().length, 0, 'and nothing read: no machine and no path');
});

test('a lifecycle state lit is marked data-lit and filled as alive; a route taken is drawn heavier in --edge-taken, and marked data-taken', async () => {
  const { MachineNode } = await import('../src/components/MachineNode.tsx');
  const { MachineEdge } = await import('../src/components/MachineEdge.tsx');
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

test("a machine's state the bar shows is marked data-inspected and ringed; one it does not show is not, but on keyboard focus", async () => {
  const { MachineNode } = await import('../src/components/MachineNode.tsx');
  const { drawMachine } = await import('../src/lib/machine.ts');
  const [box] = drawMachine({ initial: 'a', states: ['a'], final: [], edges: [], verbs: [] }).states;
  const node = (data: object) =>
    renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(MachineNode, { data: { ...box, ...data } } as never)));
  const shown = node({ pressable: true, inspected: true });
  assert.match(shown, /data-state="a"[^>]*data-inspected="true"[^>]*class="[^"]*(?<!:)ring-4 ring-ring/, shown);
  const pressable = node({ pressable: true, inspected: false });
  assert.doesNotMatch(pressable, /data-inspected|(?<!:)ring-4 ring-ring/, pressable);
  assert.match(pressable, /in-focus-visible:ring-2/, `ringed on keyboard focus: ${pressable}`);
  assert.doesNotMatch(node({}), /data-inspected|ring-2|cursor-pointer/, 'a state no press reaches takes no mark of the bar');
});

test("a machine's states take a press, the focus and a name only when the canvas is given a press, as the Debug panel's never is", async () => {
  const { flowOf } = await import('../src/components/MachineCanvas.tsx');
  const { drawMachine } = await import('../src/lib/machine.ts');
  const drawing = drawMachine({ initial: 'a', states: ['a', 'b'], final: ['b'], edges: [], verbs: [] });
  const inert = flowOf(drawing, undefined, [], false, null).nodes;
  for (const node of inert) {
    assert.equal(node.style?.pointerEvents, undefined, `${node.id} takes no pointer events, so a click on it lands on the pane`);
    assert.equal(node.ariaLabel, undefined, `${node.id} is named for no press`);
    assert.equal(node.data.pressable, false);
  }
  const pressed = flowOf(drawing, undefined, [], true, 'b').nodes;
  assert.deepEqual(
    pressed.map((n) => [n.id, n.style?.pointerEvents, n.ariaLabel, n.data.inspected]),
    [
      ['a', 'all', 'State a', false],
      ['b', 'all', 'State b', true],
    ],
  );
});

test("a machine's states carry the size their layout gave them, so React Flow draws none invisible while it measures one", async () => {
  const { flowOf } = await import('../src/components/MachineCanvas.tsx');
  const { drawMachine } = await import('../src/lib/machine.ts');
  const drawing = drawMachine({ initial: 'a', states: ['a', 'b'], final: ['b'], edges: [], verbs: [] });
  const sizes = drawing.states.map((box) => [box.id, box.width, box.height]);
  for (const pressed of [false, true]) {
    const { nodes } = flowOf(drawing, undefined, [], pressed, null);
    assert.deepEqual(
      nodes.map((node) => [node.id, node.width, node.height]),
      sizes,
      `each state is as wide and tall as its box on the node itself, where React Flow reads a size it measures nothing for; pressed: ${pressed}`,
    );
  }
});

/** The bar's body for the state `state` of `graph`, as the bar for a machine's state draws it. */
async function stateBodyMarkup(graph: import('../src/lib/api.ts').MachineGraph, state: string): Promise<string> {
  const { StateBody } = await import('../src/components/StateBar.tsx');
  return renderToStaticMarkup(createElement(StateBody, { graph, state }));
}

test("the bar for a machine's state says its kind, the edges that keep it there, and each route out with its edges and verbs", async () => {
  const graph = {
    name: 'm',
    title: 'A machine',
    source: 'm.ts',
    initial: 'a',
    states: ['a', 'b', 'c'],
    final: ['c'],
    edges: [
      { from: 'a', event: 'TICK', to: 'a', action: 'nothing' },
      { from: 'a', event: 'GO', guard: 'ready', to: 'b', action: 'go' },
      { from: 'b', event: 'END', to: 'c', action: 'end' },
    ],
    verbs: [{ verb: 'close', entry: 'closed', by: 'person', from: ['a', 'b'], to: 'c', guard: 'awaitsWord' }],
  } as never as import('../src/lib/api.ts').MachineGraph;
  const a = await stateBodyMarkup(graph, 'a');
  assert.match(a, /data-state-kind="initial state"/, a);
  assert.match(a, /<div data-edge-line="true"[^>]*>TICK<\/div>/, `the edge back to it: ${a}`);
  const outs = [...a.matchAll(/data-route-out="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(outs, ['b', 'c'], `a route out per state it leads to, in the drawing's order: ${a}`);
  assert.match(a, /data-route-out="b".*?GO \[ready\].*?→ go/s, `the route to b lists its edge by action: ${a}`);
  assert.match(a, /data-route-out="c".*?data-route-verb="close \[awaitsWord\]"/s, `the route to c lists the verb with its guard: ${a}`);
  assert.doesNotMatch(a, /data-routes-none|data-stays-none/, a);

  const b = await stateBodyMarkup(graph, 'b');
  assert.deepEqual(
    [...b.matchAll(/data-route-out="([^"]+)"/g)].map((m) => m[1]),
    ['c'],
    `one route out, its edge and the verb along it on the one route: ${b}`,
  );
  assert.match(b, /data-route-out="c".*?END.*?→ end.*?data-route-verb="close \[awaitsWord\]"/s, b);

  const c = await stateBodyMarkup(graph, 'c');
  assert.match(c, /data-state-kind="final state"/, c);
  assert.match(c, /<p data-routes-none="true">none: it ends here<\/p>/, `a final state with nothing out says so: ${c}`);
  assert.match(c, /<p data-stays-none="true">no edge keeps it here<\/p>/, c);

  const gone = await stateBodyMarkup(graph, 'gone');
  assert.match(gone, /A machine has no state named gone\./, gone);
  assert.doesNotMatch(gone, /data-state-kind/, gone);
});

test("a route only a person's verb takes is drawn dashed; one an edge takes too is drawn solid", async () => {
  const { MachineEdge } = await import('../src/components/MachineEdge.tsx');
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

test("an agent's face is drawn from its name, alive at all times: the same name the same face, another name another, named as a person is", async () => {
  const { AgentFace, personOf } = await import('../src/components/AgentParts.tsx');
  const face = (name: string) => renderToStaticMarkup(createElement(AgentFace, { name, size: 16 }));
  const iris = face('iris');
  assert.match(iris, /^<svg [^>]*>/, "an inline drawing, which Blobatar's stylesheet moves");
  assert.doesNotMatch(iris, /<img/, 'no still image');
  const open = /^<svg [^>]*>/.exec(iris)?.[0] ?? '';
  assert.match(open, /role="img"/);
  assert.match(open, /data-agent-face="iris"/);
  assert.match(open, /aria-label="Iris"/, 'a screen reader says its name as a person is named');
  assert.doesNotMatch(open, /aria-hidden="true"/);
  assert.doesNotMatch(iris, /<title>/, 'and no title: the name is no text of the line it stands in, and no tooltip');
  assert.match(iris, /<g class="[^"]*\bmo-root\b[^"]*\bmo-always\b/, 'it moves with nothing hovering it');
  assert.equal(face('iris'), iris, 'the same name draws the same face');
  const drawing = (html: string) => html.replace(/aria-label="[^"]*"/, '').replace(/data-agent-face="[^"]*"/, '');
  assert.notEqual(drawing(face('nora')), drawing(iris), 'another name draws another face, not only another label');
  assert.equal(personOf('iris'), 'Iris');
  assert.equal(personOf('note-writer'), 'Note writer');
});

test('a face that follows the pointer is an inline drawing its driver can move, alive at all times, still named as a person is', async () => {
  const { AgentFace } = await import('../src/components/AgentParts.tsx');
  const face = (name: string) => renderToStaticMarkup(createElement(AgentFace, { name, size: 36, follows: true }));
  const iris = face('iris');
  assert.match(iris, /^<svg [^>]*>/, iris);
  assert.doesNotMatch(iris, /<img/, 'no image: a driver moves only an inline drawing');
  const open = /^<svg [^>]*>/.exec(iris)?.[0] ?? '';
  assert.match(open, /role="img"/);
  assert.match(open, /data-agent-face="iris"/);
  assert.match(iris, /^<svg [^>]*><title>Iris<\/title>/, 'its name is its first child, so a screen reader says it');
  assert.match(iris, /class="[^"]*mo-eyes/, 'it has eyes a driver can move');
  assert.match(iris, /<g class="[^"]*\bmo-root\b[^"]*\bmo-always\b/, 'it moves with nothing hovering it');
  assert.equal(face('iris'), iris, 'the same name draws the same face');
  const drawing = (html: string) => html.replace(/<title>[^<]*<\/title>/, '').replace(/data-agent-face="[^"]*"/, '');
  assert.notEqual(drawing(face('nora')), drawing(iris), 'another name draws another face, not only another title');
});

test('REFUSED: a face on a plate stands on its own Blobatar backdrop, not the grey round; one without stays on the grey round', async () => {
  const { AgentFace } = await import('../src/components/AgentParts.tsx');
  const backdrop = /<svg [^>]*>(?:<title>[^<]*<\/title>)?<path [^>]*><\/path><g class="mo-root/;
  const plated = renderToStaticMarkup(createElement(AgentFace, { name: 'iris', size: 112, follows: true, plate: true }));
  assert.match(plated, backdrop, 'a backdrop drawn under the face, in its own colours');
  assert.doesNotMatch(plated, /rounded-full|bg-muted/, 'and no grey round behind it');
  assert.match(
    plated,
    /^<svg [^>]*class="[^"]*dark:\[&amp;&gt;path\]:opacity-25/,
    "its backdrop, the drawing's one path of its own, dimmed in the dark theme",
  );
  const bare = renderToStaticMarkup(createElement(AgentFace, { name: 'iris', size: 112, follows: true }));
  assert.doesNotMatch(bare, backdrop);
  assert.match(bare, /class="[^"]*rounded-full bg-muted/);
  assert.match(renderToStaticMarkup(createElement(AgentFace, { name: 'iris', size: 16 })), /^<svg [^>]*class="[^"]*rounded-full bg-muted/);
});

/** An agent as the Agents page lists it, one that sets every kind of key: what a character card is drawn from. */
const character = {
  ...composing,
  name: 'iris',
  role: 'Product engineer',
  description: 'Turns an idea into an intent.',
  keys: {
    model: 'opus',
    effort: 'high',
    harness: 'claude',
    disallowedTools: 'Bash(git push)',
    permissionMode: 'auto',
    tools: 'Read, Grep',
    output: 'iris.schema.json',
  },
  skills: 'grilling',
  harnessPrompt: 'no-coding',
  mcp: null,
  card: [{ id: 'grilling', name: 'Grilling', description: 'Asks until the plan holds.', tags: ['interview'] }],
  usedBy: [{ from: 'repo', workflow: 'intake', step: 'ask' }],
};

const agentCard = async (agent: Record<string, unknown>) => {
  const { AgentCard } = await import('../src/components/AgentCard.tsx');
  return routedWith(createElement(AgentCard, { agent: { ...character, ...agent } as never }));
};

test('REFUSED: a character card shows what its agent can do and its model, effort and harness, and none of its other keys', async () => {
  const html = await agentCard({});
  const stats = /<dl data-agent-stats[^>]*>([\s\S]*?)<\/dl>/.exec(html)?.[1] ?? '';
  for (const value of ['opus', 'high', 'claude']) assert.match(stats, new RegExp(`>${value}<`), `the stats hold ${value}: ${stats}`);
  assert.match(
    html,
    /data-agent-skill="grilling"[\s\S]*>Grilling<[\s\S]*line-clamp-2[^>]*>Asks until the plan holds\.</,
    'its skills, in front',
  );
  assert.doesNotMatch(html, /title=/, 'no tooltip: the name link stretched over the card would take its hover');
  assert.match(html, /data-agent-role[^>]*>Product engineer · <span[^>]*>iris<\/span>/);
  for (const hidden of ['Bash(git push)', '>auto<', 'no-coding', 'Read, Grep', 'iris.schema.json', '>interview<', '>grilling<'])
    assert.ok(!html.includes(hidden), `the card leaves ${hidden} to the agent's page`);
});

test("a character card holds one link to its agent's page, and its nodes' links beside it, never inside it", async () => {
  const html = await agentCard({});
  assert.equal([...html.matchAll(/href="\/agents\/yours\/iris"/g)].length, 1, html);
  assert.match(html, /<a [^>]*href="\/agents\/yours\/iris"[^>]*>Iris<\/a>/, "the person's name is the link");
  assert.match(html, /href="\/workflows\/repo\/intake\/ask"/);
  assert.doesNotMatch(html, /<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /, 'no link inside a link');
});

test("REFUSED: a character card tags each factory its agent fills a step in, linked to its floor above the card's own link; none for none", async () => {
  const html = await agentCard({ factories: ['nemia', 'pipao'] });
  const tags = [...html.matchAll(/<a [^>]*data-factory-tag="([^"]+)"[^>]*>/g)];
  assert.deepEqual(
    tags.map(([, name]) => name),
    ['nemia', 'pipao'],
    html,
  );
  for (const [tag, name] of tags) assert.match(tag, new RegExp(`href="/factories/${name}"`), "each opens its factory's floor");
  assert.match(html, /data-factory-tags[^>]*class="[^"]*relative z-10/, "above the name's link stretched over the card");
  assert.doesNotMatch(html, /<a [^>]*>(?:(?!<\/a>)[\s\S])*<a /, 'no link inside a link');
  assert.doesNotMatch(html, /title=/, 'no tooltip: the name link stretched over the card would take its hover');
  for (const none of [await agentCard({ factories: [] }), await agentCard({})]) assert.doesNotMatch(none, /data-factory-tag/);
});

test('REFUSED: a character card draws no stats line for an agent that sets none, nor for one whose file does not read', async () => {
  const unset = await agentCard({ keys: { tools: 'Read' } });
  assert.match(unset, /data-agent-skill="grilling"/, 'the card is drawn');
  assert.doesNotMatch(unset, /data-agent-stats/);
  const broken = await agentCard({ error: 'agents/iris.md: no frontmatter.' });
  assert.match(broken, /agents\/iris\.md: no frontmatter\./);
  assert.doesNotMatch(broken, /data-agent-stats/);
});

/** A run's card on the floor, inside the router its title links with, as the floor draws it: shown in the bar or not (`inspected`). */
async function cardMarkup(run: RunDetail, inspected: boolean, reads: string[] = []): Promise<string> {
  const { RunNode } = await import('../src/components/RunNode.tsx');
  const data = {
    run,
    reads,
    finished: false,
    open: false,
    detail: null,
    trouble: null,
    inspected,
    selected: null,
    onToggle() {},
    onStep() {},
  };
  const props = { id: run.id, type: 'run' as const, data, dragging: false, zIndex: 0, isConnectable: false, positionAbsoluteX: 0 };
  return routedWith(createElement(ReactFlowProvider, null, createElement(RunNode, { ...props, positionAbsoluteY: 0 } as never)));
}

test('the card the bar shows is ringed and marked as inspected, and a card it does not show is not', async () => {
  const shown = await cardMarkup(atGate(), true);
  assert.match(shown, /data-inspected="true"/);
  assert.match(shown, /ring-2 ring-ring/);
  const other = await cardMarkup(atGate(), false);
  assert.doesNotMatch(other, /data-inspected/);
  assert.doesNotMatch(other, /ring-2 ring-ring/);
});

test('a card that reads runs as context says how many in a chip, each run on hover by its id and title — and a card that reads none has none', async () => {
  const { readsLines } = await import('../src/lib/factory.ts');
  const reader = atGate({}, { context: ['shipped-a1', 'gone-b2'] });
  const reads = readsLines(reader, [{ id: 'shipped-a1', brief: '# Cache the floor\nand more' }]);
  assert.deepEqual(reads, ['shipped-a1 — Cache the floor', 'gone-b2'], 'a run the list does not have is said by its id');
  const html = await cardMarkup(reader, false, reads);
  const chip = /<span[^>]*data-context="true"[^>]*>[\s\S]*?<\/span>/.exec(html)?.[0] ?? '';
  assert.match(chip, /title="shipped-a1 — Cache the floor\ngone-b2"/);
  assert.match(chip, />⧉ reads 2 runs</);
  assert.doesNotMatch(await cardMarkup(atGate(), false), /data-context/);
});

test('a run picked to read shows what it would hand, as markdown — badged not shipped, not judged where it has not shipped, and unbadged where it has', async () => {
  const { ConcludedPreview } = await import('../src/components/ContextPicker.tsx');
  const preview = (shipped: boolean) =>
    routedWith(createElement(ConcludedPreview, { run: 'probe-b2' }), [
      [['runs', 'probe-b2', 'concluded'], { run: 'probe-b2', shipped, section: '\n## From run probe-b2\n\nIt measured **the cache**.' }],
    ]);
  const inFlight = await preview(false);
  assert.match(inFlight, /data-not-shipped[^>]*>not shipped, not judged</);
  assert.match(inFlight, /<strong>the cache<\/strong>/);
  assert.doesNotMatch(await preview(true), /data-not-shipped|not shipped, not judged/);
});

/** A piece that reads the address (`useBar`), drawn as a loaded root route's page, with the queries it reads already answered. */
async function pagedWith(element: ReturnType<typeof createElement>, data: Array<[readonly unknown[], unknown]> = []): Promise<string> {
  const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } = await import('@tanstack/react-router');
  const router = createRouter({ routeTree: createRootRoute({ component: () => element }), history: createMemoryHistory() });
  await router.load();
  const client = new QueryClient();
  for (const [key, value] of data) client.setQueryData(key, value);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
}

test("the run bar: the run's title and id, what it asks of a person, its steps each a button with its status, and its brief", async () => {
  const { RunBar } = await import('../src/components/RunBar.tsx');
  const { titleOf: runTitle } = await import('../src/lib/factory.ts');
  const theme = { ...atGate().steps[0], name: 'theme', status: 'failed ✗ check (exit 1)', approve: null, gate: null };
  const base = atGate({}, { waitingOnYou: ['review', 'theme'], onYou: ['approve review', 'theme'], brief: 'Make the **floor** clear.' });
  const run = { ...base, steps: [base.steps[0], theme] };
  const html = await pagedWith(createElement(RunBar, { run: run.id }), [[['runs', run.id], run]]);
  assert.ok(html.includes(`>${runTitle(run)}</h2>`), html);
  assert.ok(html.includes(`<span class="font-mono text-body-small">${run.id}</span>`), html);
  assert.match(html, /<section aria-label="Waiting on you"/);
  assert.match(html, /<button type="button" data-approve="review"/, "a step the banner names opens that step's bar");
  const steps = /<section aria-label="Steps"[\s\S]*?<\/section>/.exec(html)![0];
  assert.deepEqual(
    [...steps.matchAll(/<button type="button" data-step="([^"]+)"[\s\S]*?data-state="([^"]+)"/g)].map((m) => [m[1], m[2]]),
    [
      ['review', 'awaiting-approval'],
      ['theme', 'failed-check'],
    ],
  );
  assert.match(/<section aria-label="Brief"[\s\S]*?<\/section>/.exec(html)![0], /<strong>floor<\/strong>/);

  const decide = await pagedWith(createElement(RunBar, { run: 'r-1' }), [[['runs', 'r-1'], endingRun()]]);
  assert.match(decide, /<section aria-label="To decide"[^>]*>[\s\S]*?<button type="button" data-approve="ship"/);
});

test('the run bar says a run not read yet, a read that failed, and a run gone from the store, and draws nothing of it under them', async () => {
  const { RunBody } = await import('../src/components/RunBar.tsx');
  const { ReadRefusal } = await import('../src/lib/api/read.ts');
  const run = atGate();
  const body = (props: { run: RunDetail | undefined; error: unknown }) => pagedWith(createElement(RunBody, { id: run.id, ...props }));
  assert.match(await body({ run: undefined, error: null }), />Reading the run…</);
  assert.match(await body({ run: undefined, error: new Error('the api is down') }), /Could not read the run r-1: the api is down/);
  const gone = await body({ run, error: new ReadRefusal('gone', 404) });
  assert.match(gone, /data-run-gone="r-1"/);
  assert.doesNotMatch(gone, /aria-label="Steps"/);
});

const { FactoryBlockNode } = await import('../src/components/FactoryBlock.tsx');

/** A factory's block on the Factories canvas, rendered to markup, `inspected` or not. */
function factoryBlockMarkup(inspected: boolean): string {
  const block = {
    name: 'hiring',
    default: false,
    repos: ['checkout'],
    runs: 1,
    inFlight: 0,
    waitsOnYou: 0,
    workflows: 1,
    hires: 1,
    error: null,
    inspected,
  };
  const props = {
    id: block.name,
    type: 'factory' as const,
    data: block,
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
  return renderToStaticMarkup(createElement(ReactFlowProvider, null, createElement(FactoryBlockNode, props)));
}

test("a factory's block is no link, so a press inspects it, and is marked as inspected only while the bar shows it", () => {
  const shown = factoryBlockMarkup(true);
  const hidden = factoryBlockMarkup(false);
  for (const html of [shown, hidden]) {
    assert.doesNotMatch(html, /<a[\s>]/, `the block holds no link: ${html}`);
    assert.doesNotMatch(html, /href=/, `and no address: ${html}`);
    assert.match(html, /data-factory="hiring"/);
    assert.match(html, /0 in flight · 1 run/);
    assert.match(html, /1 workflow · 1 hire/);
  }
  assert.match(shown, /data-inspected/, 'the block the bar shows is marked');
  assert.match(shown, /ring-2 ring-ring/, 'and ringed');
  assert.doesNotMatch(hidden, /data-inspected/, 'a block the bar does not show is not marked');
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
async function specBodyMarkup(listing: import('../src/lib/api.ts').WorkflowListing, step: string): Promise<string> {
  const { SpecBody } = await import('../src/components/SpecBar.tsx');
  return renderToStaticMarkup(createElement(SpecBody, { listing, step }));
}

test("the bar for a workflow's step says what it runs on, its keys as its node lists them, and the steps it waits on in the workflow's order", async () => {
  const { workflow, stepSpec } = await import('./library-fixtures.ts');
  const { specLines } = await import('../src/components/StepNode.tsx');
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

/** The frame's tab strip at `path`, inside a router, around a page that reads `the page`. */
async function frameTabsAt(path: string): Promise<string> {
  const { FrameTabs } = await import('../src/components/FrameTabs.tsx');
  // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
  return routedWith(createElement(FrameTabs, { path, children: createElement('p', { 'data-page': '' }, 'the page') }));
}

/** The strip's tabs, in their order: each one's tag, `href`, name and whether it is selected. */
const tabsIn = (html: string) =>
  [...(/<div[^>]*role="tablist"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? '').matchAll(/<(\w+)\b([^>]*role="tab"[^>]*)>([^<]*)</g)].map(
    ([, tag, attrs, name]) => ({
      tag,
      href: /href="([^"]*)"/.exec(attrs ?? '')?.[1],
      name,
      selected: /aria-selected="true"/.test(attrs ?? ''),
    }),
  );

test("a tab's page is drawn under the strip of Settings' tabs, each a link to its own address, its own alone selected", async () => {
  const html = await frameTabsAt('/capabilities');
  assert.match(html, /role="tablist"[^>]*aria-label="Settings"|aria-label="Settings"[^>]*role="tablist"/, html);
  assert.deepEqual(tabsIn(html), [
    { tag: 'a', href: '/settings', name: 'Settings', selected: false },
    { tag: 'a', href: '/machines', name: 'Machines', selected: false },
    { tag: 'a', href: '/capabilities', name: 'Capabilities', selected: true },
  ]);
  assert.match(
    html,
    /<div[^>]*role="tabpanel"[^>]*>\s*<p data-page="">the page<\/p>/,
    `the page sits in the selected tab's panel: ${html}`,
  );
  assert.doesNotMatch(
    /<div[^>]*role="tabpanel"[^>]*>/.exec(html)?.[0] ?? '',
    /\btext-body-medium\b/,
    "the panel leaves the page's text its own size",
  );
});

test('a page with one view draws no strip: its page bare', async () => {
  for (const path of ['/agents', '/machinesx']) {
    const html = await frameTabsAt(path);
    assert.doesNotMatch(html, /role="tab/, `refused: ${path} has no tabs`);
    assert.equal(html, '<p data-page="">the page</p>', path);
  }
});

/** A factory as the api lists it, for the switcher: on one repository, offering one workflow; `extra` puts keys over it. */
const filed = (name: string, extra: Partial<import('../src/lib/api.ts').Factory> = {}): import('../src/lib/api.ts').Factory => ({
  name,
  default: false,
  repos: ['/code/nemia'],
  workflows: ['build'],
  hires: {},
  error: null,
  schedules: [],
  commands: {
    attach: `nemia factory attach ${name} <workflow>`,
    rm: `nemia factory rm ${name}`,
    add: `nemia factory add ${name} --repo <path>`,
    schedule: `nemia factory schedule ${name} <workflow> --cron <expr> --brief <text>`,
    trust: `nemia factory trust ${name}`,
  },
  untrusted: [],
  template: null,
  ...extra,
});

test('REFUSED: the sidebar is drawn folded only where the cookie keeps sidebar_state=false, whole', async () => {
  const { sidebarOpenOf } = await import('../src/components/ui/sidebar.tsx');
  assert.equal(sidebarOpenOf('a=1; sidebar_state=false'), false);
  assert.equal(sidebarOpenOf('sidebar_state=false'), false);
  for (const open of ['', 'sidebar_state=true', 'sidebar_statex=false', 'xsidebar_state=false', 'a=sidebar_state=false'])
    assert.equal(sidebarOpenOf(open), true, open);
});

test("the picker offers the factories Home lists, then the address's own when they leave it out, never twice", async () => {
  const { pickerFactories } = await import('../src/components/FactoryPicker.tsx');
  const factories = [filed('default', { default: true, workflows: null }), filed('nemia'), filed('quay')];
  const names = (picked: string | undefined) => pickerFactories(factories, false, picked).map((item) => item.name);
  assert.deepEqual(names(undefined), ['nemia', 'quay']);
  assert.deepEqual(names('quay'), ['nemia', 'quay']);
  assert.deepEqual(names('default'), ['nemia', 'quay', 'default']);
  assert.deepEqual(names('gone'), ['nemia', 'quay', 'gone']);
  assert.equal(pickerFactories(factories, false, 'gone').at(-1)?.factory, undefined);
  assert.deepEqual(
    pickerFactories(factories, true, undefined).map((item) => item.name),
    ['nemia', 'quay'],
    'a default factory that holds a run is not offered once a factory is named',
  );
  const alone = [filed('default', { default: true, workflows: null })];
  assert.deepEqual(
    pickerFactories(alone, true, undefined).map((item) => item.name),
    ['default'],
    'with no factory named, the default one is offered while it holds a run',
  );
  assert.equal(pickerFactories(alone, false, undefined).length, 0, 'and not while it holds none');
});

test("REFUSED: the picker offers only All factories until the default's light answer arrives, though the address picks the default", async () => {
  const { pickerOffer } = await import('../src/components/FactoryPicker.tsx');
  const alone = [filed('default', { default: true, workflows: null })];
  const counts = (finished: number) => ({ counts: { waiting: 0, inFlight: 0, finished } });
  assert.deepEqual(pickerOffer(alone, undefined, 'default'), [], 'the light answer unread: nothing is offered');
  assert.deepEqual(pickerOffer(undefined, counts(1), 'default'), [], 'the factories unread: nothing is offered');
  assert.deepEqual(
    pickerOffer(alone, counts(1), 'default').map((item) => item.name),
    ['default'],
    'read, and holding a run: the default is offered',
  );
  assert.equal(pickerOffer(alone, counts(1), 'default')[0].factory, alone[0], 'as the factory the api lists, not a bare name');
  const named = [...alone, filed('nemia')];
  assert.deepEqual(
    pickerOffer(named, undefined, undefined).map((item) => item.name),
    ['nemia'],
    'once a factory is named, no light answer is waited for',
  );
});

test("a factory in the switcher says its runs in flight, every factory's said as runs; a name no factory has, or a file that does not read, says so", async () => {
  const { inFlightWords, supportOf } = await import('../src/components/FactoryPicker.tsx');
  assert.equal(inFlightWords(0, true), 'none in flight');
  assert.equal(inFlightWords(1, true), '1 run in flight');
  assert.equal(inFlightWords(5, true), '5 runs in flight');
  assert.equal(inFlightWords(4, false), '4 in flight');
  const moving = (id: string, factory: string | null) => listed(summary([['build', 'checking']], { id, factory }));
  const open = {
    asOf: at,
    counts: { waiting: 0, inFlight: 3, finished: 0 },
    waiting: [],
    inFlight: [moving('a', 'nemia'), moving('b', 'nemia'), moving('c', null)],
  };
  assert.equal(supportOf({ name: 'nemia', factory: filed('nemia') }, open), '2 in flight');
  assert.equal(
    supportOf({ name: 'default', factory: filed('default', { default: true }) }, open),
    '1 in flight',
    "a run naming none is the default's",
  );
  assert.equal(supportOf({ name: 'quay', factory: filed('quay') }, open), 'none in flight');
  assert.equal(supportOf({ name: 'quay', factory: filed('quay') }, undefined), undefined, 'nothing before the light answer is read');
  assert.equal(supportOf({ name: 'gone' }, open), 'no such factory');
  assert.equal(supportOf({ name: 'quay', factory: filed('quay', { error: 'not JSON' }) }, open), 'its file does not read');
});

test('REFUSED: the start in no factory yet offers each factory a run starts in, the default left out, one that cannot start saying why', async () => {
  const { FactoryChoice } = await import('../src/components/FactoryStart.tsx');
  const factories = [
    filed('default', { default: true, workflows: null }),
    filed('nemia'),
    filed('quay', { error: '/wf/factories/quay.json is not JSON' }),
  ];
  const html = await pagedWith(createElement(FactoryChoice, { factories }));
  assert.deepEqual(
    [...html.matchAll(/data-start-factory="([^"]+)"/g)].map((m) => m[1]),
    ['nemia', 'quay'],
  );
  assert.match(html, /data-start-factory="quay"[\s\S]*disabled=""[\s\S]*data-why-not[^>]*>The factory quay&#x27;s file does not read/);
  assert.doesNotMatch(html.slice(0, html.indexOf('data-start-factory="quay"')), /disabled=""|data-why-not/);
  assert.equal([...html.matchAll(/<button[^>]*>(nemia|quay)<\/button>/g)].length, 2, 'each factory a button, which a press picks');
  assert.doesNotMatch(html, /type="radio"/, 'refused: a radio, which an arrow key checks, and so picks, while moving past it');
  assert.match(await pagedWith(createElement(FactoryChoice, { factories: [factories[0]] })), /No factory is filed to start a run in/);
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
    { kind: 'from', run: 'probe-b2', asked: 'Measure the cache.', body: 'Not shipped, not judged.', how: 'read' },
    { kind: 'from', run: 'old-c3', asked: '', body: 'An older section.' },
  ];
  const html = await routedWith(createElement(Told, { told: null, layers: LAYERS, parts, filed: true }));
  const task = html.slice(html.indexOf('data-layer="task"'));
  assert.ok(task.indexOf('Do the work.') < task.indexOf('data-from-run="cache-a1"'), 'in the order the task has them');
  const block = (run: string) => new RegExp(`<section data-from-run="${run}"[\\s\\S]*?</section>`).exec(task)?.[0] ?? '';
  assert.match(block('cache-a1'), /data-how="waited"/);
  assert.match(block('cache-a1'), /href="\/runs\/cache-a1"[^>]*>Waited on, shipped · Build the cache\. ↗<\/a>/);
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
  const { StepTold } = await import('../src/components/StepParts.tsx');
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
  const { StepTold } = await import('../src/components/StepParts.tsx');
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
  const { StepAgent } = await import('../src/components/StepParts.tsx');
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
  const { StepHire } = await import('../src/components/StepHire.tsx');
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

test('REFUSED: a place that lists no workflows is said on the page — a factory on several repositories asks which, each a link, and one refused says why — and a place that lists draws nothing', async () => {
  const { Unplaced } = await import('../src/components/WorkflowParts.tsx');
  const draw = (where: unknown) =>
    routedWith(
      createElement(Unplaced, {
        where: where as never,
        back: 'the way out',
        onRepo: (repo: string, name: string) => createElement('a', { href: `?repo=${repo}` }, name),
      }),
    );
  const pick = await draw({ kind: 'pick', factory: 'quay', repos: ['/code/a', '/code/b'] });
  assert.match(pick, /data-pick-repo="quay"[^]*works on 2 repositories/);
  assert.match(
    pick,
    /title="\/code\/a"[^]*<a href="\?repo=\/code\/a">a<\/a>[^]*title="\/code\/b"[^]*<a href="\?repo=\/code\/b">b<\/a>[^]*the way out\./,
  );
  const refused = await draw({ kind: 'refused', factory: 'gone', why: 'No factory is named gone.' });
  assert.match(refused, /data-unplaced="gone"[^>]*>No factory is named gone\. the way out\.</);
  assert.equal(await draw({ kind: 'every' }), '');
  assert.equal(await draw({ kind: 'in', place: { factory: 'f', repo: '/r' }, repos: ['/r'] }), '');
});

test("REFUSED: the step's bar reads in the address's factory — its folder there, never the list read with none; and a factory that lists nowhere is said in the bar", async () => {
  const { SpecBar } = await import('../src/components/SpecBar.tsx');
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
  const { StepWritten } = await import('../src/components/StepParts.tsx');
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
  const { RecentRuns } = await import('../src/components/StepParts.tsx');
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
  const { StepPageLink } = await import('../src/components/StepParts.tsx');
  const html = await routedWith(
    createElement(StepPageLink, { page: { from: 'yours', workflow: 'w', factory: 'hiring', repo: null }, step: 'review' }),
  );
  assert.match(html, /href="\/workflows\/yours\/w\/review\?factory=hiring"[^>]*>What it will be told now →</);
  assert.equal(await routedWith(createElement(StepPageLink, { page: null, step: 'review' })), '');
});

test("an agent's custom instructions are anchored, so a step's page links to where they are written", async () => {
  const { CustomInstructions } = await import('../src/components/CustomInstructions.tsx');
  assert.match(await routedWith(createElement(CustomInstructions, { name: 'writer' })), /<section id="custom-instructions"/);
});

test("an agent's custom instructions say a run keeps the words it froze; the store's own agent's, beside her rules, that her open session is told them", async () => {
  const { CustomInstructions } = await import('../src/components/CustomInstructions.tsx');
  const { AutoRules } = await import('../src/components/AutoRules.tsx');
  const hired = await routedWith(createElement(CustomInstructions, { name: 'writer' }));
  assert.match(hired, /data-custom-frozen[^>]*>A run already started keeps the words it froze/, 'a hired agent: a run keeps what it froze');
  assert.match(hired, /wherever it is hired/);
  assert.doesNotMatch(hired, /data-custom-told|open session/);
  const hers = await routedWith(createElement(AutoRules, { agent: 'nemia' }));
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

/** A factory's rules as its settings page draws them over the api's answer `read`: the file is `/store/factories/hiring/RULES.md`. */
async function rulesMarkup(read: { words: string | null; error: string | null }): Promise<string> {
  const { FactoryRules } = await import('../src/components/FactoryRules.tsx');
  const { factoryRulesQuery } = await import('../src/lib/api/factories.ts');
  const answer = { name: 'hiring', file: '/store/factories/hiring/RULES.md', ...read };
  return routedWith(createElement(FactoryRules, { name: 'hiring' }), [[factoryRulesQuery('hiring').queryKey, answer]]);
}

test("a factory's rules draw their words, where they are kept and who is told them; Clear is offered only while a file is kept", async () => {
  const kept = await rulesMarkup({ words: 'Never push on a Friday.', error: null });
  assert.match(kept, /<section aria-label="Rules" data-factory-rules="true"/);
  assert.match(kept, /data-rules-told[^>]*>Told to every agent hired into this factory, after its custom instructions and before/);
  assert.match(kept, /<textarea[^>]*>Never push on a Friday\.<\/textarea>/);
  assert.match(kept, /data-rules-file[^>]*>\/store\/factories\/hiring\/RULES\.md</);
  assert.match(kept, />Clear…</, 'rules kept: they can be cleared');
  assert.doesNotMatch(kept, /data-rules-error|data-rules-refused|data-rules-done/, 'rules that read say no trouble, and nothing done yet');
  const none = await rulesMarkup({ words: null, error: null });
  assert.match(none, /<textarea[^>]*><\/textarea>/);
  assert.doesNotMatch(none, />Clear…<|data-rules-error/, 'no file kept: nothing to clear, and nothing wrong');
});

test("a factory's rules that cannot be told say why and what they stop, and what is there can be cleared, words read or not", async () => {
  const why = '/store/factories/hiring/RULES.md is not a file: remove it, and write the rules again.';
  const untold = await rulesMarkup({ words: null, error: why });
  const alert = /<div[^>]*data-rules-error="true"[^>]*>[^]*?<\/div><\/div>/.exec(untold)?.[0] ?? '';
  assert.match(alert, /role="alert"/, untold);
  assert.match(alert, /These rules cannot be told, and no run starts in this factory until they can/);
  assert.ok(alert.includes(why), alert);
  assert.match(untold, /<textarea[^>]*><\/textarea>/, 'no words were read');
  assert.match(untold, />Clear…</, 'with no words read, what is at the file can still be cleared');
  const keyed = await rulesMarkup({ words: '---\ntools: Bash\n---\nUse Bash.', error: 'RULES.md opens with a frontmatter block.' });
  assert.match(keyed, /data-rules-error="true"[^]*RULES\.md opens with a frontmatter block\./);
  assert.match(keyed, /<textarea[^>]*>---\ntools: Bash\n---\nUse Bash\.<\/textarea>/, 'the words are given beside it, to mend');
  assert.match(keyed, />Clear…</);
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
  const { StepForm } = await import('../src/components/StepForm.tsx');
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
  const { StepRows } = await import('../src/components/StepRows.tsx');
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

/** Nemia's section, drawn over a cache holding `level`, her memory, `facts`, and each fact's words, read as if opened once. */
async function nemiaWith(level: Record<string, unknown>, facts: string[] = []): Promise<string> {
  const { NemiaSettings } = await import('../src/components/NemiaSettings.tsx');
  const client = new QueryClient();
  client.setQueryData(['nemia', 'level'], {
    level: 'manual',
    since: null,
    task: null,
    phase: null,
    sessionId: null,
    reach: [],
    bridge: null,
    stopped: false,
    spend: null,
    allows: [],
    factories: [],
    trust: null,
    ...level,
  });
  client.setQueryData(['nemia', 'memory'], { dir: '/store/nemia/memory', facts, fact: null });
  for (const name of facts)
    client.setQueryData(['nemia', 'memory', name], { dir: '/store/nemia/memory', facts, fact: { name, text: `What ${name} says.` } });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(NemiaSettings)));
}

/** The level the Select pressed at `mark` shows in `html`, or undefined where there is none. */
const pickedAt = (html: string, mark: string): string | undefined =>
  html.slice(html.indexOf(mark)).match(/data-slot="select-value"[^>]*><span[^>]*>([^<]*)</)?.[1];

/** Her session up and reached, on Semi-auto. */
const nemiaUp = {
  level: 'semi-auto',
  since: '2026-10-05T12:00:00.000Z',
  task: 'nemia-1',
  phase: 'running',
  sessionId: '0123456789abcdef',
  reach: ['attach 01234567', 'https://example.test/code/session_0123'],
  bridge: { url: 'https://example.test/code/session_0123', why: null },
};

test("REFUSED to offer: the default factory's own switch or raise, a raise over a raise, a raise of a factory at Semi-auto by default", async () => {
  const row = (factory: string, over: Record<string, unknown> = {}) => ({
    factory,
    level: 'manual',
    default: 'manual',
    own: null,
    raise: null,
    ...over,
  });
  const html = await nemiaWith({
    factories: [
      row('default'),
      row('mill', { level: 'semi-auto', raise: { level: 'semi-auto', until: '2026-10-05T18:00:00.000Z' } }),
      row('quay'),
      row('harbour', { level: 'semi-auto', default: 'semi-auto', own: 'semi-auto' }),
    ],
  });
  const of = (factory: string) => html.slice(html.indexOf(`data-factory-level="${factory}"`)).split('</li>')[0];
  assert.match(of('default'), /data-level="manual"/);
  assert.match(of('default'), /the store&#x27;s level, for runs in no factory/);
  assert.doesNotMatch(
    of('default'),
    /data-factory-default|data-factory-raise|data-factory-end/,
    "the default factory's level is the store's",
  );
  assert.match(of('mill'), /data-level="semi-auto"/);
  assert.match(of('mill'), /data-factory-raised/);
  assert.match(of('mill'), /data-factory-end/);
  assert.doesNotMatch(of('mill'), /data-factory-raise=/, 'a raise in force is ended, never raised again');
  assert.match(of('quay'), /data-factory-raise=/);
  assert.match(of('quay'), /data-factory-stretch/);
  assert.doesNotMatch(of('quay'), /data-factory-end|data-factory-raised/);
  assert.doesNotMatch(of('harbour'), /data-factory-raise=|data-factory-end/, 'Semi-auto by default has nothing to raise');
  assert.match(of('harbour'), /Semi-auto by default \(its own\)\./);
});

test('at Auto: her level and a factory by default picked at Auto in one control each, and a session kept from before named', async () => {
  const html = await nemiaWith({
    ...nemiaUp,
    level: 'auto',
    factories: [{ factory: 'quay', level: 'auto', default: 'auto', own: 'auto', raise: null }],
  });
  assert.equal(pickedAt(html, 'data-nemia-pick'), 'Auto');
  assert.equal(pickedAt(html, 'data-factory-default'), 'Auto');
  assert.equal(
    html.split('data-slot="select-trigger"').length - 1,
    2,
    'one control for her level, one for the factory: no raise over Auto',
  );
  assert.doesNotMatch(html, /data-slot="switch"/, 'no switch beside it');
  assert.match(
    html,
    /one kept from before asks you every answer until it is filed again — set her level and every factory above Manual to Manual, ending any raise, and once her session reads Off, set them back\./,
  );
});

test('Nemia off: her level picked at Manual, her session off, no reach, and her memory empty with how to prune it', async () => {
  const html = await nemiaWith({});
  assert.match(html, /data-nemia-level="manual"/);
  assert.equal(pickedAt(html, 'data-nemia-pick'), 'Manual');
  assert.match(html, /data-nemia-session="true" data-state="off"/);
  assert.doesNotMatch(html, /data-nemia-reach/);
  assert.doesNotMatch(html, /data-nemia-restart/);
  assert.match(html, /data-nemia-no-facts[^>]*>She keeps no facts yet\./);
  assert.match(html, /data-nemia-prune[^>]*>She keeps these facts herself[^<]*ask her to in her session\./);
});

test('Nemia up: her level picked at Semi-auto, her task and phase, the attach line as code to copy and the rest as words, her spend and allows', async () => {
  const html = await nemiaWith({ ...nemiaUp, spend: { usd: 1.25, measured: 2, unmeasured: 0 }, allows: ['Bash(git status)'] }, [
    'owner',
    'style',
  ]);
  assert.equal(pickedAt(html, 'data-nemia-pick'), 'Semi-auto');
  assert.match(html, /data-state="up"/);
  assert.match(html, /data-nemia-task[^>]*>nemia-1</);
  assert.match(html, /data-nemia-phase[^>]*>running</);
  assert.match(html, /data-nemia-attach[^>]*>attach 01234567<\/code><button[^>]*data-copy/);
  assert.match(html, /<a href="https:\/\/example\.test\/code\/session_0123" target="_blank" rel="noreferrer"[^>]*data-nemia-bridge="true"/);
  assert.equal(
    html.split('https://example.test/code/session_0123</').length,
    2,
    'her link is drawn once, as a link: never again as her reach line',
  );
  assert.match(html, /data-nemia-spend[^>]*>Spent \$1\.25 over 2 sessions ended; her open one counts once it ends\./);
  assert.match(html, /data-nemia-allows[\s\S]*>Bash\(git status\)</);
  assert.match(html, /data-nemia-fact="owner"[\s\S]*data-nemia-fact="style"/);
  assert.doesNotMatch(html, /data-nemia-fact-text|What style says\./, "a fact's words are drawn only while it is open, read or not");
});

test('Nemia asked bridged and not up: why, in place of her link; not asked: her attach line alone', async () => {
  const why = 'no `bridgeSessionId` yet.';
  const down = await nemiaWith({
    ...nemiaUp,
    reach: ['attach 01234567', `her web link is not up: ${why}`],
    bridge: { url: null, why },
  });
  assert.doesNotMatch(down, /data-nemia-bridge|<a /, 'no link while it is not up');
  assert.match(down, /data-bridge-why[^>]*>The web link is not up: no `bridgeSessionId` yet\.</);
  assert.equal(down.split('is not up: no `bridgeSessionId`').length, 2, 'said once');
  assert.match(down, /data-bridge-why[^>]*class="[^"]*\bwrap-anywhere\b/, 'a word it quotes breaks where it must, on a phone too');
  assert.match(down, /data-nemia-attach[^>]*>attach 01234567<\/code><button[^>]*data-copy/, 'the attach line still to copy');

  const unasked = await nemiaWith({ ...nemiaUp, reach: ['attach 01234567'], bridge: null });
  assert.match(unasked, /data-nemia-attach[^>]*>attach 01234567</);
  assert.doesNotMatch(unasked, /data-nemia-bridge|data-bridge-why/, 'not asked: nothing of a bridge');
});

/** The line that trusts her folder, as the api answers it. */
const TRUST = "cd '/store/nemia' && claude";

/** Where the line that trusts her folder sits in Nemia's section `html`: inside her level's part, under its switch, or elsewhere. */
const trustAt = (html: string): 'level' | 'elsewhere' | 'none' => {
  const at = html.indexOf('data-nemia-trust');
  if (at < 0) return 'none';
  return at > html.indexOf('data-nemia-pick') && at < html.indexOf('>Factories</h3>') ? 'level' : 'elsewhere';
};

test('Nemia waiting on her folder trusted: under the switch, that no session is filed until it is, and the line to copy, said once; her session untrusted; trusted: no such line', async () => {
  const html = await nemiaWith({ level: 'semi-auto', since: '2026-10-05T12:00:00.000Z', task: 'nemia-1', trust: TRUST });
  assert.equal(trustAt(html), 'level', 'the wait is plain beside the switch that reads Semi-auto');
  assert.match(
    html,
    /data-nemia-trust[\s\S]*>No session of hers is filed until her folder is trusted: run this once in a terminal[^<]*<\/p>/,
  );
  assert.match(html, /data-nemia-trust[\s\S]*<code[^>]*>cd &#x27;\/store\/nemia&#x27; &amp;&amp; claude<\/code><button[^>]*data-copy/);
  assert.equal(html.split('data-nemia-trust').length, 2, 'the line is drawn once');
  assert.equal(html.split('in a terminal').length, 2, 'how to trust it is said once');
  assert.match(html, /data-nemia-session="true" data-state="untrusted"[\s\S]*>Waiting on your trust: the keeper files her session/);
  assert.equal(trustAt(await nemiaWith({ trust: TRUST })), 'level', 'off, the line is shown before she is turned on');
  assert.doesNotMatch(await nemiaWith({ ...nemiaUp }), /data-nemia-trust/, 'a trusted folder: no trust line');
});

/** The Factories with no factory, drawn over a cache holding the store's lines and Nemia's `level`, or none read yet. */
async function noFactoryWith(level: Record<string, unknown> | null): Promise<string> {
  const { FactoriesCanvas } = await import('../src/components/FactoriesCanvas.tsx');
  const client = new QueryClient();
  client.setQueryData(['store'], {
    workflows: '/store/workflows',
    agents: '/store/agents',
    skills: '/store/skills',
    fileFactory: 'nemia factory new <name>',
    turnOnNemia: 'nemia level semi-auto',
  });
  if (level !== null)
    client.setQueryData(['nemia', 'level'], {
      level: 'manual',
      since: null,
      task: null,
      phase: null,
      sessionId: null,
      reach: [],
      bridge: null,
      stopped: false,
      spend: null,
      allows: [],
      factories: [],
      trust: null,
      ...level,
    });
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(FactoriesCanvas, { blocks: [] })));
}

test('no factory and Nemia off: Turn Nemia on, beside the line that does it from the command line; on: her session in words', async () => {
  const off = await noFactoryWith({});
  assert.match(off, /No factory yet[\s\S]*<code>nemia factory new &lt;name&gt;<\/code>/);
  assert.match(
    off,
    /data-nemia-off[\s\S]*<button[^>]*data-nemia-turn-on[^>]*>Turn Nemia on<\/button>[\s\S]*<code[^>]*>nemia level semi-auto<\/code>/,
  );
  assert.doesNotMatch(off, /data-nemia-on=/);

  const raised = await noFactoryWith({ factories: [{ factory: 'mill', level: 'semi-auto', default: 'manual', own: null, raise: null }] });
  assert.doesNotMatch(raised, /data-nemia-turn-on/, 'a factory above Manual keeps her: she is on');

  const waiting = await noFactoryWith({ level: 'semi-auto', task: 'nemia-1', trust: TRUST });
  assert.doesNotMatch(waiting, /data-nemia-turn-on/);
  assert.match(waiting, /data-nemia-on="true" data-state="untrusted"[\s\S]*Nemia is on\. Waiting on your trust/);
  assert.match(waiting, /data-nemia-trust[\s\S]*<code[^>]*>cd &#x27;\/store\/nemia&#x27; &amp;&amp; claude<\/code>/);
  assert.equal(waiting.split('in a terminal').length, 2, 'how to trust it is said once');

  const up = await noFactoryWith({ ...nemiaUp });
  assert.match(up, /data-nemia-on="true" data-state="up"[\s\S]*Nemia is on\. Up: her session runs\./);
  assert.doesNotMatch(up, /data-nemia-trust/);

  assert.doesNotMatch(await noFactoryWith(null), /data-nemia-o(n|ff)=/, 'nothing offered while her level is not read');
});

test('Nemia stopped from outside: said so, with a way to a fresh session', async () => {
  const html = await nemiaWith({ ...nemiaUp, stopped: true });
  assert.match(html, /data-state="stopped"/);
  assert.match(html, /data-nemia-restart[^>]*>Start a fresh session</);
});

test('Nemia not filed, or waiting on her trust, names no task; filed, it names its task and phase', async () => {
  const untrusted = await nemiaWith({ level: 'semi-auto', since: '2026-10-05T12:00:00.000Z', task: 'nemia-1', trust: TRUST });
  assert.match(untrusted, /data-state="untrusted"/);
  assert.doesNotMatch(untrusted, /data-nemia-task|>Task/, 'waiting on her trust: nothing filed, no task named');
  const notFiled = await nemiaWith({ level: 'semi-auto', task: 'nemia-1' });
  assert.match(notFiled, /data-state="not-filed"/);
  assert.doesNotMatch(notFiled, /data-nemia-task|>Task/, 'not filed yet: no task named');
  const starting = await nemiaWith({ level: 'semi-auto', task: 'nemia-1', phase: 'pending' });
  assert.match(starting, /data-state="starting"/);
  assert.match(starting, /data-nemia-task[^>]*>nemia-1</);
  assert.match(starting, /data-nemia-phase[^>]*>pending</);
  const stopped = await nemiaWith({ ...nemiaUp, stopped: true });
  assert.match(stopped, /data-nemia-task[^>]*>nemia-1</);
  assert.match(stopped, /data-nemia-phase[^>]*>running</);
});

/** A factory's template as the api answers it: applied at `applied`, with `conditions`. */
const template = (applied: string | null, conditions: import('../src/lib/api.ts').FactoryCondition[] = []) => ({
  source: '/drafts/team',
  version: 'v2',
  params: { repo: '/work/repo', retries: 2 },
  applied,
  conditions,
});

test("a factory's Template card: where it is, the version wanted and applied, each parameter, and each condition, amiss in the destructive colour", () => {
  const html = renderToStaticMarkup(
    createElement(TemplateCard, {
      template: template('v1', [
        { type: 'Applied', status: 'False', reason: 'VersionDrift', message: 'the template is at v2, applied at v1' },
        { type: 'ConflictsPending', status: 'False', reason: 'None', message: 'nothing to merge' },
      ]),
    }),
  );
  assert.match(html, /data-template="\/drafts\/team"/);
  assert.match(html, />Template</);
  assert.match(html, /data-template-version="true">v2</);
  assert.match(html, /data-template-applied="v1">applied at <span[^>]*>v1</);
  assert.match(html, /data-param="repo"><dt[^>]*>repo<\/dt><dd[^>]*>\/work\/repo</);
  assert.match(html, /data-param="retries"><dt[^>]*>retries<\/dt><dd[^>]*>2</);
  assert.match(html, /data-condition="Applied" data-condition-status="False" data-amiss=""><span[^>]*data-variant="destructive"/);
  assert.match(html, /VersionDrift<\/span><span[^>]*>the template is at v2, applied at v1</);
  assert.match(html, /data-condition="ConflictsPending" data-condition-status="False"><span[^>]*data-variant="secondary"/);
  assert.doesNotMatch(html, /<(button|input|textarea)/, 'read-only: nothing to press or type in');
});

test('a Template card not rendered yet says the daemon renders it, and lists no condition', () => {
  const html = renderToStaticMarkup(createElement(TemplateCard, { template: template(null) }));
  assert.match(html, /data-template-applied="">not rendered yet: the daemon renders its tree on its next pass</);
  assert.doesNotMatch(html, /data-condition=/);
});

test('REFUSED: a schedule whose latest fire was refused draws why, whole, under its alert; one whose fire started its run draws none', async () => {
  const { FactorySchedules } = await import('../src/components/FactorySchedules.tsx');
  const why =
    'dev: the factory nemia does not offer this workflow — it offers none yet. Attach it: nemia factory attach nemia dev. Nothing was started.';
  const scheduled = (workflow: string, extra: Partial<import('../src/lib/api.ts').FactorySchedule>) => ({
    workflow,
    cron: '0 9 * * 1',
    tz: 'America/Montreal',
    brief: 'Read the stats',
    repo: null,
    next: '2026-10-12T13:00:00.000Z',
    last: null,
    refused: null,
    commands: { unschedule: `nemia factory unschedule nemia ${workflow}` },
    ...extra,
  });
  const factory = filed('nemia', {
    schedules: [
      scheduled('dev', { refused: why }),
      scheduled('janitor', { last: { run: 'read-the-stats-k2v9', at: '2026-10-05T13:00:02.000Z' } }),
    ],
  });
  const html = await routedWith(createElement(FactorySchedules, { factory }));
  const [, dev = '', janitor = ''] = html.split(/data-factory-schedule="(?=dev"|janitor")/);
  assert.match(dev, /data-schedule-refused="true"[^]*Its latest fire started no run/, 'the refused fire under its alert');
  assert.ok(dev.includes(why), `and why, whole: ${dev}`);
  assert.match(janitor, /href="\/runs\/read-the-stats-k2v9"/, "the started fire's row, its last run a link to the run's page");
  assert.doesNotMatch(janitor, /data-schedule-refused/, 'and no alert');
});

test("REFUSED: a banner that says a person is waited on is drawn in an amount's colour or a failure's — Waiting on you and To decide both read yours", () => {
  const waiting = bannerMarkup(needing('needs-human', { blockedByHarness: true, waitingFor: WAIT, lastLine: LOGIN }, { waitingOnYou: [] }));
  const decide = withClient(createElement(ToDecideBanner, { run: endingRun() }));
  for (const [label, html] of [
    ['Waiting on you', waiting],
    ['To decide', decide],
  ]) {
    const m = new RegExp(`<section aria-label="${label}"[^>]*class="([^"]*)"`).exec(html);
    assert.ok(m, `${label} is drawn`);
    assert.equal(drawnYours(m[1]), true, `${label}: ${m[1]}`);
  }
  assert.equal(drawnYours(`rounded ${container.money}`), false, 'the amber of an amount is no wait');
  assert.equal(drawnYours(`rounded ${container.yours} ${container.failure}`), false);
});

test("FactoryTrust says each place that is not trusted, what is withheld and the api's line; nothing for a factory whose places are trusted", async () => {
  const { FactoryTrust } = await import('../src/components/FactoryTrust.tsx');
  assert.equal(renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia') })), '');
  const place = { place: '/code/nemia', harness: 'A harness', withheld: 'the allow rules of its settings', never: null };
  const one = renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia', { untrusted: [place] }) }));
  assert.match(one, /data-untrusted="nemia"/);
  assert.match(one, /A place is not trusted/);
  assert.match(one, /data-untrusted-place="\/code\/nemia"/);
  assert.match(one, /is not trusted for A harness\. Withheld:.*the allow rules of its settings\./);
  assert.match(one, /Trust it:.*nemia factory trust nemia/);
  const home = { ...place, place: '/home/me', never: 'No trust is kept for a home directory.' };
  const never = renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia', { untrusted: [home] }) }));
  assert.match(never, /No trust is kept for a home directory\./);
  assert.doesNotMatch(never, /data-trust-command/, 'a place no line repairs is offered none');
  const two = renderToStaticMarkup(createElement(FactoryTrust, { factory: filed('nemia', { untrusted: [place, home] }) }));
  assert.match(two, /2 places are not trusted/);
  assert.match(two, /Trust them:/);
});

const InboxParts = await import('../src/components/InboxParts.tsx');
const { FileCard } = await import('../src/components/FileCard.tsx');
const { UnassignedStart } = await import('../src/components/FactoryCardStart.tsx');

/** A card as the inbox lists it, named `idea`, with `extra` over it. */
const inboxCard = (extra: Record<string, unknown> = {}) =>
  ({
    name: 'idea',
    file: 'idea.md',
    title: 'An idea',
    workflow: null,
    repo: null,
    factory: null,
    from: [],
    startedAs: [],
    error: null,
    body: 'An idea',
    filedAt: null,
    ...extra,
  }) as never;

/** A factory as the api lists it, on `repos`. */
const listedFactory = (name: string, repos: string[], error: string | null = null) => ({
  name,
  default: name === 'default',
  repos,
  workflows: name === 'default' ? null : ['dev'],
  hires: {},
  error,
  schedules: [],
  commands: { attach: '', rm: '', add: '', schedule: '' },
  template: null,
});

/** Your store, as the api answers it, with the line that files a factory. */
const STORE_ANSWER: [readonly unknown[], unknown] = [
  ['store'],
  { workflows: '', agents: '', skills: '', fileFactory: 'nemia factory add <name> --repo <path>', turnOnNemia: '' },
];
const LISTED = [listedFactory('default', ['/code/app']), listedFactory('solo', ['/r/a']), listedFactory('pair', ['/r/a', '/r/b'])];

test('REFUSED: a card that names no factory wears no default tag — its line says it has no factory yet; one naming a factory wears its tag, and an entry that does not read says neither', async () => {
  const line = (extra: Record<string, unknown>) => routedWith(createElement(InboxParts.CardMeta, { entry: inboxCard(extra) }));
  const tagged = await line({ factory: 'solo' });
  assert.match(tagged, /data-factory-tag="solo"/);
  assert.doesNotMatch(tagged, /data-unassigned/);
  for (const factory of [null, 'default']) {
    const bare = await line({ factory });
    assert.match(
      bare,
      /<span data-unassigned="true" title="It names no factory: Start gives it one\.">no factory yet<\/span>/,
      String(factory),
    );
    assert.doesNotMatch(bare, /data-factory-tag/, `${factory}: no tag, the default's least of all`);
  }
  const unread = await line({ error: 'idea.md: not a card' });
  assert.doesNotMatch(unread, /data-factory-tag|data-unassigned/);
});

test('REFUSED: a card that names a workflow and no factory says it has no Queue and that Start gives it a factory — and no other card says it', async () => {
  const note = (extra: Record<string, unknown>) => renderToStaticMarkup(createElement(InboxParts.NoQueue, { entry: inboxCard(extra) }));
  for (const factory of [null, 'default']) {
    assert.equal(
      note({ factory, workflow: 'dev' }),
      '<p data-no-queue="true" class="text-body-small text-muted-foreground">No Queue: a queued card starts on its own, in the factory it names, and this one names none. Start gives it one.</p>',
      String(factory),
    );
  }
  assert.equal(note({ factory: 'solo', workflow: 'dev' }), '', 'a card of a factory has its Queue');
  assert.equal(note({ factory: null }), '', 'no workflow: nothing to queue it on');
  assert.equal(note({ factory: null, workflow: 'dev', queued: { at: '2026-09-16T10:00:00.000Z', place: 1 } }), '', 'queued: Unqueue');
});

test('REFUSED: the box says the factories are being read until they are, and never that the store has none', async () => {
  const html = await routedWith(createElement(FileCard, { shown: 'solo' }), [STORE_ANSWER]);
  assert.match(html, /data-reading-factories="true"[^>]*>Reading the factories…<\/p>/);
  assert.doesNotMatch(html, /data-no-factory/);
  const read = await routedWith(createElement(FileCard, { shown: 'solo' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.doesNotMatch(read, /data-reading-factories/);
});

test('the workflows a list leaves out are said under it, each by name with why it does not read — and nothing when every one reads', async () => {
  const { WorkflowsUnread } = await import('../src/components/WorkflowOptions.tsx');
  const listing = (name: string, error: string | null, from = 'repo') => ({ name, from, error }) as never;
  const html = renderToStaticMarkup(
    createElement(WorkflowsUnread, { workflows: [listing('ok', null), listing('dev', 'implement: `agent: implementer` fills this step')] }),
  );
  assert.equal(
    html,
    '<div data-workflows-unread="true" class="space-y-1 text-body-small text-yours"><p>Not offered until it reads:</p><p data-unread="dev" class="whitespace-pre-wrap break-words"><span class="font-mono">dev</span>: implement: `agent: implementer` fills this step</p></div>',
  );
  assert.equal(renderToStaticMarkup(createElement(WorkflowsUnread, { workflows: [listing('ok', null)] })), '');
});

test('the box that files a card lists No factory and each factory offered; under No factory it draws no Workflow and no Repository control, and says the card is parked', async () => {
  const html = await routedWith(createElement(FileCard, { shown: undefined }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.deepEqual(
    [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]),
    [
      ['', 'No factory: chosen at start'],
      ['solo', 'solo'],
      ['pair', 'pair'],
    ],
    'never the default factory',
  );
  assert.match(html, /data-parked="true"[^>]*>Parked with no factory: it gets its factory, workflow and repository when you start it\./);
  assert.doesNotMatch(html, />Workflow<|>Repository<|<input/, 'nothing to type or pick but the idea and the factory');
  assert.doesNotMatch(html, /data-no-factory/);
});

test('the box with no factory to offer has the one choice, and the line that files a factory', async () => {
  const html = await routedWith(createElement(FileCard, { shown: 'default' }), [[['factories'], [LISTED[0]]], STORE_ANSWER]);
  assert.equal([...html.matchAll(/<option /g)].length, 1);
  assert.match(
    html,
    /data-no-factory="true"[^>]*>The store has no factory yet: file one with <code[^>]*>nemia factory add &lt;name&gt; --repo &lt;path&gt;<\/code>/,
  );
});

test("the box preset to the address's factory says its one repository as text, and offers the repositories of a factory on several as a list with none chosen", async () => {
  const solo = await routedWith(createElement(FileCard, { shown: 'solo' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.match(solo, /<option value="solo" selected="">solo<\/option>/);
  assert.match(solo, /data-factory-repo="true"[^>]*>\/r\/a<\/p>/);
  assert.doesNotMatch(solo, /<input|data-parked/, 'no repository to type');
  assert.match(solo, />Workflow<\/label>/);

  const pair = await routedWith(createElement(FileCard, { shown: 'pair' }), [[['factories'], LISTED], STORE_ANSWER]);
  assert.match(
    pair,
    />Repository<\/label><select[^>]*><option value="" selected="">None: chosen at start<\/option><option value="\/r\/a">\/r\/a<\/option><option value="\/r\/b">\/r\/b<\/option><\/select>/,
  );
  assert.match(pair, /data-needs-repo="true"/, 'its workflows are read once a repository is picked');
});

test('REFUSED: the start of a card that names no factory draws no start form before a factory is picked — a Factory list with nothing chosen; and with no factory to offer, the line that files one', async () => {
  const start = (factories: unknown[]) =>
    routedWith(createElement(UnassignedStart, { entry: inboxCard(), onStarted: () => {}, onRefused: () => {} }), [
      [['factories'], factories],
      STORE_ANSWER,
    ]);
  const html = await start(LISTED);
  assert.match(html, /data-start-unassigned="true"/);
  assert.match(
    html,
    /<option value="" disabled="" selected="">Pick the factory it runs in<\/option><option value="solo">solo<\/option><option value="pair">pair<\/option>/,
  );
  assert.doesNotMatch(html, /<form|>Workflow<|aria-label="Start idea"/);
  const none = await start([LISTED[0]]);
  assert.match(none, /data-no-factory="true"[^>]*>A card starts in a factory, and the store has none yet: file one with /);
  assert.doesNotMatch(none, /<select|<form/);
});

const { Trace, TraceCollapsible, TraceCollapsibleContent, TraceCollapsibleTrigger, TraceDescription, TraceIcon, TraceLine, TraceTitle } =
  await import('../src/components/ui/trace.tsx');

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

const { NemiaFace } = await import('../src/components/NemiaFace.tsx');
const { UP } = await import('../src/lib/presence.ts');

test("Nemia's face is her blobatar on its plate, dimmed in dark, and wears the expression her presence picks", () => {
  const up = renderToStaticMarkup(createElement(NemiaFace, { presence: UP }));
  const waits = renderToStaticMarkup(createElement(NemiaFace, { presence: { ...UP, waitsOnYou: 2, answering: true } }));
  assert.match(up, /data-agent-face="nemia"/);
  assert.match(up, /dark:\[&amp;&gt;path\]:opacity-25|dark:\[&>path\]:opacity-25/, 'the plate, dimmed in dark');
  assert.match(up, /data-nemia-face="idle"/);
  assert.match(waits, /data-nemia-face="surprised"/);
  const drawing = (html: string) => html.slice(html.indexOf('<svg'));
  assert.notEqual(drawing(up), drawing(waits), 'the expression reaches the drawing');
  assert.equal(drawing(renderToStaticMarkup(createElement(NemiaFace, { presence: UP }))), drawing(up), 'one presence, one drawing');
});

test('the run page draws one tag per kind the run is behind on, and the verb to type; nothing at all for a run with none', () => {
  const drawn = renderToStaticMarkup(createElement(KindsBehind, { run: behind() }));
  assert.match(drawn, /agent coder: rev 5, ledger at 6/, 'what a filing after this would take, as the ledger holds it');
  assert.match(drawn, /skill look: implement ran on rev 1, ledger at 2/, 'and what a step that already ran ran on');
  assert.match(drawn, /nemia refresh r-1/, 'the verb to type, as the api said it');
  assert.match(drawn, /data-kinds-behind="2"/);

  assert.equal(renderToStaticMarkup(createElement(KindsBehind, { run: detailOf({ kinds: [] }) })), '', 'a run on the newest draws none');
  assert.equal(renderToStaticMarkup(createElement(KindsBehind, { run: unpinned() })), '', 'and so does one the api pinned nothing for');
});

const { Worked, WorkedLine } = await import('../src/components/conversation/Worked.tsx');
const { HARNESS_TOOL, THOUGHT_TOOL } = await import('../src/lib/sessionItems.ts');
const { ChatLostBand, ChatRetryingBand, ChatStoppedBand, ChatUnreadableBand } = await import('../src/components/chat/ChatBand.tsx');
const { chatItems } = await import('../src/lib/chatFollowing.ts');
type ConversationLine = import('../src/lib/conversation.ts').ConversationLine;
const { dockWords } = await import('../src/lib/presence.ts');
type ChatEvent = import('../src/lib/api.ts').ChatEvent;

/** One step of hers. */
const chatStep = (id: string, state: 'done' | 'running' | 'waits', second: number): Extract<ChatEvent, { kind: 'step' }> => ({
  kind: 'step',
  id,
  at: new Date(Date.UTC(2026, 9, 15, 21, 40, second)).toISOString(),
  tool: 'Read',
  sentence: 'Read the inbox',
  state,
});

/** The family's turn over `steps` of hers, through her adapter onto the one shape it draws. */
const workOf = (steps: Extract<ChatEvent, { kind: 'step' }>[]) => {
  const [item] = chatItems(steps);
  if (item.kind !== 'work') throw new Error('her consecutive steps fold into one turn of the family');
  return item;
};

test('a turn at work draws its lines, the one that waits on a person in yours; a finished turn folds and lays out nothing it holds', () => {
  const live = workOf([chatStep('t:1', 'done', 0), chatStep('t:2', 'waits', 4)]);
  const running = renderToStaticMarkup(createElement(Worked, { work: live, marks: 'chat' }));
  assert.match(running, /data-chat-turn="running"/);
  assert.match(running, /data-status="yours"[^>]*data-chat-step="waits"/, 'a step that waits on a person is the look’s own state');
  assert.match(running, /border-l-2 border-yours/);
  const over = workOf([chatStep('t:1', 'done', 0), chatStep('t:2', 'done', 134)]);
  const folded = renderToStaticMarkup(createElement(Worked, { work: over, marks: 'chat' }));
  assert.match(folded, /data-chat-turn="folded"/);
  assert.match(folded, /Worked for 2m 14s · 2 steps/);
  assert.doesNotMatch(folded, /data-chat-step=/, 'a closed fold lays out none of its steps');
});

test('REFUSED: a family part that writes one conversation’s marks: the prefix its caller names is the one it writes', () => {
  const work = workOf([chatStep('t:1', 'done', 0), chatStep('t:2', 'running', 4)]);
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

test("her session stopped is a status, the daemon lost an alert in the failure's colour, and neither is dimmed by an opacity", async () => {
  const stopped = await routedWith(createElement(ChatStoppedBand, { words: 'Her session was stopped from outside.' }));
  assert.match(stopped, /data-band="stopped"[^>]*role="status"|role="status"[^>]*data-band="stopped"/);
  assert.match(stopped, /Her session stopped/);
  assert.match(stopped, /What you write waits for her\./);
  assert.match(stopped, /data-chat-start[^>]*href="\/settings"|href="\/settings"/, 'Start her session leads to her settings');
  const lost = renderToStaticMarkup(
    createElement(ChatLostBand, { since: '2026-10-15T21:57:00.000Z', now: new Date('2026-10-15T22:00:00.000Z') }),
  );
  assert.match(lost, /data-band="lost"[^>]*role="alert"|role="alert"[^>]*data-band="lost"/);
  assert.match(lost, /No answer from the daemon/);
  assert.match(lost, /bg-failure-container text-on-failure-container/);
  assert.match(lost, /nothing you wrote is lost/);
  for (const html of [stopped, lost]) assert.doesNotMatch(html, /\sopacity-\d/, 'a dimmed text falls under 4.5:1');
});

test("her docked face is called by the presence that gives it its expression, in the owner's order", () => {
  assert.equal(dockWords(UP, false), "Open Nemia's chat. Her session is up.");
  assert.equal(dockWords(UP, true), "Close Nemia's chat. Her session is up.");
  assert.equal(dockWords({ ...UP, waitsOnYou: 2 }, false), "Open Nemia's chat. 2 wait on you.");
  assert.equal(dockWords({ ...UP, waitsOnYou: 1 }, false), "Open Nemia's chat. 1 waits on you.");
  assert.equal(dockWords({ ...UP, notSent: true }, false), "Open Nemia's chat. A message was not sent.");
  assert.equal(dockWords({ ...UP, down: true }, false), "Open Nemia's chat. Her session is down.");
  assert.equal(dockWords({ ...UP, answering: true }, false), "Open Nemia's chat. She is answering.");
  assert.equal(dockWords({ ...UP, unread: 2 }, true), "Close Nemia's chat. 2 new answers.");
  assert.equal(dockWords({ ...UP, unread: 1 }, false), "Open Nemia's chat. 1 new answer.");
  assert.equal(
    dockWords({ waitsOnYou: 2, notSent: true, down: true, answering: true, unread: 3 }, false),
    "Open Nemia's chat. 2 wait on you.",
    'what waits on a person comes first, as her face does',
  );
});

test("a chat the board cannot read says so as an alarm, in the read's own words, and says the board reads again on its own", () => {
  const html = renderToStaticMarkup(createElement(ChatUnreadableBand, { why: 'the api answered 503' }));
  assert.match(html, /data-band="unreadable"/);
  assert.match(html, /role="alert"/);
  assert.match(html, /The board cannot read her chat/);
  assert.match(html, /the api answered 503\. It reads again every few seconds/);
  assert.match(html, /what you write is kept here until the api takes it/);
});

test('a chat the api cannot stream and reads again on a beat is a quiet note at rest, never the failure that ends a page', () => {
  const html = renderToStaticMarkup(createElement(ChatRetryingBand, { why: 'Her session is not pushed as it is written.' }));
  assert.match(html, /data-band="retrying"[^>]*role="status"|role="status"[^>]*data-band="retrying"/);
  assert.match(html, /Reading her chat again/);
  assert.match(html, /Her session is not pushed as it is written\. Nothing is lost/);
  assert.match(html, /border-rest/, 'a note the board makes of itself is rest, not a write refused');
  assert.doesNotMatch(html, /failure/, 'the colour that says a write was refused says nothing here');
});

const { ChatAsk } = await import('../src/components/chat/ChatAsk.tsx');
const { ChatAskMany } = await import('../src/components/chat/ChatAskMany.tsx');
const { ChatProposal } = await import('../src/components/chat/ChatProposal.tsx');
type AskQuestion = import('../src/lib/api.ts').AskQuestion;
type ChatAskEvent = Extract<ChatEvent, { kind: 'question' | 'proposal' }>;

/** One question of hers, its choices explained; `plain` is the same with nothing to explain, which her proposal draws as actions. */
const askQuestion = (plain = false): AskQuestion => ({
  question: 'What the board shows as an old closeout’s one line?',
  header: 'Summary',
  options: [
    { label: 'Cut it on read', description: plain ? '' : 'The first line, cut at a word.', recommended: true },
    { label: 'First line as it is', description: plain ? '' : 'The board cuts it by its layout.', recommended: false },
  ],
  multiSelect: false,
});

/** An ask of hers in her chat, its choice on it where one was made. */
const askEvent = (kind: 'question' | 'proposal', questions: readonly AskQuestion[], chose?: Record<string, string>): ChatAskEvent => ({
  kind,
  id: 'q:call-1',
  call: 'call-1',
  at: new Date(Date.UTC(2026, 9, 15, 22, 2, 0)).toISOString(),
  text: 'The design signed off with a question it cannot settle alone. [Read the design](/runs/r-1)',
  questions,
  ...(chose === undefined ? {} : { chose, choseAt: CHOSE_AT.toISOString() }),
});

/** When the person chose, and the time of day the board writes it as, read where the draw reads it: a moment is drawn in the zone
 * the browser is in, and the runner's is not this machine's. */
const CHOSE_AT = new Date(Date.UTC(2026, 9, 15, 22, 4, 0));

test('her one question with its choices explained is drawn as the form: the choice, why, the Recommended tag, and the link in her words', () => {
  const html = renderToStaticMarkup(createElement(ChatAsk, { ask: askEvent('question', [askQuestion()]), onAnswer: () => undefined }));
  assert.match(html, /data-chat-ask="form"/);
  assert.match(html, /data-chat-tag="asks you"/);
  assert.match(html, /1 of 1 · Summary/);
  assert.match(html, /data-chat-option="Cut it on read"/);
  assert.match(html, /The first line, cut at a word\./, 'a choice that explains itself says why on its row');
  assert.match(html, /data-chat-recommended/);
  assert.match(html, /Recommended/);
  assert.match(html, /href="\/runs\/r-1"/, 'the link her words carry is a plain link beside the Answer');
  assert.match(html, /disabled=""/, 'nothing is chosen yet, so the Answer is off');
});

test('her proposal is drawn as its actions, each choice said whole by its own button, and answered it says what was chosen', () => {
  const asks = renderToStaticMarkup(
    createElement(ChatProposal, { ask: askEvent('proposal', [askQuestion(true)]), onAnswer: () => undefined }),
  );
  assert.match(asks, /data-chat-ask="actions"/);
  assert.match(asks, /data-chat-tag="proposes"/);
  assert.match(asks, /data-chat-action="Cut it on read"/);
  assert.match(asks, /data-chat-action="First line as it is"/);
  assert.doesNotMatch(asks, /data-chat-option=/, 'a choice with nothing to explain is a button, never a row of a form');
  const chose = renderToStaticMarkup(
    createElement(ChatProposal, {
      ask: askEvent('proposal', [askQuestion(true)], { [askQuestion().question]: 'Cut it on read' }),
      onAnswer: () => undefined,
    }),
  );
  assert.match(chose, /data-chat-tag="proposed"/);
  assert.match(chose, /data-chat-chose/);
  assert.match(chose, new RegExp(`You chose: Cut it on read · ${timeOfDay(CHOSE_AT)}`));
  assert.doesNotMatch(chose, /data-chat-action=/, 'an answered proposal asks nothing more');
});

test('her several questions are drawn as the flow: a tab each and Submit, numbered choices, her own words, and N OF M', () => {
  const questions = [askQuestion(), { ...askQuestion(), question: 'And the values?', header: 'Values' }];
  const html = renderToStaticMarkup(createElement(ChatAskMany, { ask: askEvent('question', questions), onAnswer: () => undefined }));
  assert.match(html, /data-chat-ask="many"/);
  assert.match(html, /data-chat-qtab="on"[^>]*>Summary/);
  assert.match(html, /data-chat-qtab="off"[^>]*>Values/);
  assert.match(html, /Submit/);
  assert.match(html, /1\./, 'the choices are numbered');
  assert.match(html, /data-chat-option="own"/);
  assert.match(html, /Your own words/);
  assert.match(html, /data-chat-own/);
  assert.match(html, /data-chat-of[^>]*>1 OF 2/);
  assert.doesNotMatch(html, /data-chat-submit/, 'the Submit tab is reached, never drawn beside the question in hand');
  assert.doesNotMatch(html, /data-chat-asked/, 'while it waits, the tabs say the questions: nothing is said twice');
});

test('her several questions answered keep each question beside the answer it was given, the tabs that asked them gone', () => {
  const questions = [askQuestion(), { ...askQuestion(), question: 'And the values?', header: 'Values' }];
  const chose = { [askQuestion().question]: 'Cut it on read', 'And the values?': 'Hand them' };
  const html = renderToStaticMarkup(createElement(ChatAskMany, { ask: askEvent('question', questions, chose), onAnswer: () => undefined }));
  assert.doesNotMatch(html, /data-chat-qtab/, 'an answered ask asks nothing more');
  assert.match(html, /data-chat-asked/);
  for (const [question, answer] of Object.entries(chose))
    assert.match(
      html,
      new RegExp(`${question.replace(/[?]/g, '\\?')}</dt><dd[^>]*>${answer}`),
      'what she asked stands over what the person answered it, so the history reads as a history',
    );
  assert.match(html, new RegExp(`You chose: Cut it on read · Hand them · ${timeOfDay(CHOSE_AT)}`));
});

/** Where a run's wall time went: an hour of wall, ten minutes of it at work. */
const CLOCK = { wallMs: 3_600_000, sessionsMs: 600_000, checksMs: 0, personMs: 3_000_000, slotMs: 0, restMs: 0 };

/** A row of either runs table as its Clock cell reads it: an hour old, ten minutes at work, with `more` over it. */
const clocked = (more: object = {}) => ({
  createdAt: '2026-10-12T10:00:00.000Z',
  startedAt: '2026-10-12T10:05:00.000Z',
  cancelledAt: null,
  waiting: null,
  waitingOnYou: [],
  holding: null,
  atWork: { ms: 600_000, since: null, endedAt: '2026-10-12T10:15:00.000Z' },
  clock: CLOCK,
  ...more,
});

/** The Clock cell of `run` drawn at eleven, an hour after the fixture was created. */
const clockCell = (run: object, finished = false): string =>
  renderToStaticMarkup(createElement(RunClockCell, { run: run as never, asOf: new Date('2026-10-12T11:00:00.000Z'), finished }));

test("REFUSED: a Clock cell that says the run's wall time — it says the time at work, and `not started` for a run nothing of which is filed", () => {
  const working = clockCell(clocked());
  assert.match(working, />10m</, 'ten minutes at work');
  assert.doesNotMatch(working, />1h</, 'REFUSED: the hour of wall time the column used to show');
  assert.match(working, /<button[^>]*data-clock-words/, 'the words are a button, which the keyboard reaches to open the preview');
  const done = clockCell(clocked({ atWork: { ms: 600_000, since: null, endedAt: null } }), true);
  assert.match(done, />10m</, 'a finished row says the figure alone');
  assert.doesNotMatch(done, /took/, "REFUSED: the card's sentence in a row's cell");

  const unstarted = clockCell(clocked({ startedAt: null, atWork: null }));
  assert.match(unstarted, />not started</);
  assert.doesNotMatch(unstarted, />1h</, 'REFUSED: the minutes since it was filed, which are no time at work');
  assert.match(clockCell(clocked({ startedAt: null, atWork: null, cancelledAt: '2026-10-12T10:30:00.000Z' }), true), />not started</);
  assert.match(clockCell(clocked({ atWork: null })), />not judged</, 'a run the api gives no time at work of');
});

test('a Clock cell whose row carries no clock draws the words as a plain span with the times in full, and takes no focus', () => {
  const unbroken = clockCell(clocked({ clock: null }));
  assert.match(unbroken, /<span[^>]*data-clock-words/);
  assert.doesNotMatch(unbroken, /<button/, 'nothing to break down, so nothing for the keyboard to open');
  assert.match(unbroken, /title="At work 10m 00s\. Started [^"]+"/, 'the times in full stay on the title');
});

test("a breakdown's rows are terms with their amounts, each named by what it counts, and the foot says the wall time they add up to", () => {
  const html = renderToStaticMarkup(createElement(BreakdownRows, { breakdown: clockBreakdown(CLOCK, '10m', '11 Oct 1:11 PM') }));
  for (const what of ['Sessions at work', 'Checks running', 'Waiting on you', 'Queued for a slot'])
    assert.match(html, new RegExp(`data-breakdown-row="${what}"`), what);
  assert.doesNotMatch(html, /Everything else/, 'the last line is absent where the four parts cover the wall');
  assert.match(html, /<dd[^>]*>10m<\/dd>/, "the sessions' ten minutes");
  assert.match(html, /data-breakdown-foot[^>]*>Wall time 1h, from 11 Oct 1:11 PM\.</);
});

/** The Cost cell of a row with `cost` and `tokens`. */
const costCell = (cost: object | null, tokens: object | null): string =>
  renderToStaticMarkup(createElement(RunCostCell, { run: { cost, tokens } as never }));

const COST = { usd: 5.63, measured: 3, unmeasured: 0, said: '$5.63' };
const TOKENS = {
  total: 900,
  input: 600,
  output: 300,
  cacheRead: 400,
  cacheWrite: 100,
  uncached: 100,
  measured: 3,
  unmeasured: 0,
  said: '',
  split: '',
};

test('REFUSED: a Cost cell the keyboard cannot reach to open its tokens: a row with tokens draws its cost as a button', () => {
  const priced = costCell(COST, TOKENS);
  assert.match(priced, /<button[^>]*data-cost-words[^>]*>\$5\.63<\/button>/, 'the cost words are a button that opens the preview');
  const untokened = costCell(COST, null);
  assert.match(untokened, /<span[^>]*data-cost-words[^>]*>\$5\.63<\/span>/);
  assert.doesNotMatch(untokened, /<button/, 'no tokens to break down, so nothing for the keyboard to open');
  assert.equal(costCell(null, TOKENS), '', 'a row with no cost says nothing');
});
