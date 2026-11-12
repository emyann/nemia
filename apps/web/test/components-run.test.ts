/**
 * The board's run components (`src/components/run/`), rendered to markup as a server renders them: what a
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
import { behind, coded, detail as detailOf, readsOf, unpinned } from './run-fixtures.ts';
import './tsx.ts';
import { at, atGate, endingRun, pagedWith, routedWith, runWith, textsOf, unescaped, UNMEASURED } from './markup-fixtures.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { ReactFlowProvider } = await import('@xyflow/react');
const { RunGone } = await import('../src/components/run/RunGone.tsx');
const { KindsBehind } = await import('../src/components/run/KindsBehind.tsx');
const { RunClockCell } = await import('../src/components/run/RunClockCell.tsx');
const { RunCostCell } = await import('../src/components/run/RunCostCell.tsx');
const { BreakdownRows } = await import('../src/components/look/Breakdown.tsx');
const { clockBreakdown } = await import('../src/lib/breakdown.ts');
const { instantWhole } = await import('../src/lib/instant.ts');
const { timeToTheSecond } = await import('../src/lib/timeOfDay.ts');
type RunDetail = import('../src/lib/runView.ts').RunDetail;
type StepUsed = import('../src/lib/api/usage.ts').StepUsed;
const { Timeline } = await import('../src/components/run/Timeline.tsx');

test('a run visited by its address that the store does not have is said gone by its id, and where the runs are listed', () => {
  const html = renderToStaticMarkup(createElement(RunGone, { id: 'r-9z8y' }));
  assert.match(html, /^<p data-run-gone="r-9z8y" role="status"/);
  assert.equal(html.replace(/<[^>]*>/g, ''), 'Run r-9z8y is not in this store: removed, or never was. Runs lists the runs the store has.');
});

test("the run page's timeline: a row per try's session and per check, in the api's words — a recheck, a check still running, a task with no record — and the totals", async () => {
  const { Timeline } = await import('../src/components/run/Timeline.tsx');
  type TaskSpan = NonNullable<RunDetail['steps'][number]['timeline'][number]['session']>;
  type TimelineTotal = RunDetail['timeline']['run'];
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
    usage: { responses: 54 },
    used: '54 responses · tool calls not measured · tokens in not measured · tokens out not measured',
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
  assert.ok(html.includes('>54 responses · tool calls not measured'), 'what the session used, beside it');
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

/**
 * A card's start form, rendered as a server renders it: the workflow it runs on, and the card's `repo:` when it names one. A folder
 * team's start looks at no repository, and the form says so — before the start, since a start the api takes opens the run's page.
 */
async function startMarkup(folderTeam: boolean, repo?: string): Promise<string> {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const { StartRun } = await import('../src/components/run/StartRun.tsx');
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
        card: { name: 'a-note-on-the-tides', factory: null, body: 'Why the tides come twice a day.' },
        ...(repo ? { repo } : {}),
      }),
    ),
  );
}

test("REFUSED: a card's start says nothing of a card's repository, retired: the factory places the run, a folder team's included", async () => {
  for (const [inFolders, repo] of [
    [true, '/code/app'],
    [false, '/code/app'],
    [true, undefined],
  ] as const) {
    assert.doesNotMatch(await startMarkup(inFolders, repo), /data-ignored-repo|is not looked at/, `${inFolders} ${repo}`);
  }
  assert.match(await startMarkup(false, '/code/app'), /Runs in <code[^>]*>\/code\/app<\/code>/, 'the repository its factory wires, said');
});

test('a start given no repository, the default factory working on none, lists no run to wait on and calls no repository its own', async () => {
  const none = await startMarkup(false);
  const after = /<legend[^>]*>After<\/legend>.*?<\/fieldset>/.exec(none)?.[0] ?? assert.fail(`no After list: ${none}`);
  assert.match(after, /data-no-repo/, 'the After list says why it lists no run');
  assert.doesNotMatch(after, /Reading the runs/, 'and waits on no repository of the api');
  assert.doesNotMatch(none, /this repository/, 'nor says it runs in one');
  assert.doesNotMatch(await startMarkup(false, '/code/app'), /data-no-repo/, 'a repository given lists its runs');
});

test("a try's run is tagged try and names the agent it tried, linked to its page; any other run names its workflow, linked to its page in the run's place", async () => {
  const { StartedFrom } = await import('../src/components/run/TryTag.tsx');
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

/** A run's card on the floor, inside the router its title links with, as the floor draws it: shown in the bar or not (`inspected`). */
async function cardMarkup(run: RunDetail, inspected: boolean, reads: string[] = []): Promise<string> {
  const { RunNode } = await import('../src/components/run/RunNode.tsx');
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
  const reader = atGate({}, { context: ['landed-a1', 'gone-b2'] });
  const reads = readsLines(reader, [{ id: 'landed-a1', brief: '# Cache the floor\nand more' }]);
  assert.deepEqual(reads, ['landed-a1 — Cache the floor', 'gone-b2'], 'a run the list does not have is said by its id');
  const html = await cardMarkup(reader, false, reads);
  const chip = /<span[^>]*data-context="true"[^>]*>[\s\S]*?<\/span>/.exec(html)?.[0] ?? '';
  assert.match(chip, /title="landed-a1 — Cache the floor\ngone-b2"/);
  assert.match(chip, />⧉ reads 2 runs</);
  assert.doesNotMatch(await cardMarkup(atGate(), false), /data-context/);
});

test("a ghost's card writes the api's word for what it waits on, then an arrow to each run it waits on, the word naming each run once", async () => {
  const base = atGate({}, { waitingOnYou: [], waitingOnYouWords: [] });
  const ghost: RunDetail = {
    ...base,
    toDecide: null,
    waiting: {
      runs: [
        { run: 'a-1x2y', missing: false, cancelledAt: null, gone: [] },
        { run: 'b-3z', missing: false, cancelledAt: null, gone: [] },
      ],
      word: 'after a-1x2y and b-3z land',
      advice: 'it starts once both land',
      waitingOnYou: false,
    },
  };
  const html = await cardMarkup(ghost, false);
  assert.match(html, /data-ghost-run="true"/, 'the card is a ghost');
  const line = /<p[^>]*data-waiting="on-runs"[^>]*>([\s\S]*?)<\/p>/.exec(html)![1];
  assert.equal(line.replace(/<[^>]+>/g, ''), 'after a-1x2y and b-3z land', "the line reads the api's word as it is, each run named once");
  assert.deepEqual(
    [...line.matchAll(/<a [^>]*>/g)].map((m) => [/href="\/runs\/([^"]+)"/.exec(m[0])?.[1], /aria-label="([^"]+)"/.exec(m[0])?.[1]]),
    [
      ['a-1x2y', 'Open a-1x2y'],
      ['b-3z', 'Open b-3z'],
    ],
    'each run it waits on is a link to its page',
  );
});

test("the run bar: the run's title and id, what it asks of a person, its steps each a button with its status, and its brief", async () => {
  const { RunBar } = await import('../src/components/run/RunBar.tsx');
  const { titleOf: runTitle } = await import('../src/lib/factory.ts');
  const theme = { ...atGate().steps[0], name: 'theme', ...coded('failed ✗ check (exit 1)'), approve: null, gate: null };
  const base = atGate(
    {},
    { waitingOnYou: ['review', 'theme'], waitingOnYouWords: ['approve review', 'theme'], brief: 'Make the **floor** clear.' },
  );
  const run = { ...base, steps: [base.steps[0], theme] };
  const html = await pagedWith(createElement(RunBar, { run: run.id }), readsOf(run));
  assert.ok(html.includes(`>${runTitle(run)}</h2>`), html);
  assert.ok(textsOf(html).includes(run.id), `the bar says the run's id\n${html}`);
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

  const decide = await pagedWith(createElement(RunBar, { run: 'r-1' }), readsOf(endingRun()));
  assert.match(decide, /<section aria-label="To decide"[^>]*>[\s\S]*?<button type="button" data-approve="ship"/);
});

test('the run bar says a run not read yet, a read that failed, and a run gone from the store, and draws nothing of it under them', async () => {
  const { RunBody } = await import('../src/components/run/RunBar.tsx');
  const { ReadRefusal } = await import('../src/lib/api/read.ts');
  const run = atGate();
  const body = (props: { run: RunDetail | undefined; error: unknown }) => pagedWith(createElement(RunBody, { id: run.id, ...props }));
  assert.match(await body({ run: undefined, error: null }), />Reading the run…</);
  assert.match(await body({ run: undefined, error: new Error('the api is down') }), /Could not read the run r-1: the api is down/);
  const gone = await body({ run, error: new ReadRefusal('gone', 404) });
  assert.match(gone, /data-run-gone="r-1"/);
  assert.doesNotMatch(gone, /aria-label="Steps"/);
});

test('the run page draws one tag per kind the run is behind on, and the verb to type; nothing at all for a run with none', () => {
  const drawn = renderToStaticMarkup(createElement(KindsBehind, { run: behind() }));
  assert.match(drawn, /agent coder: rev 5, files at rev 6/, 'what a filing after this would take, as the files hold it now');
  assert.match(drawn, /skill look: implement ran on rev 1, files at rev 2/, 'and what a step that already ran ran on');
  assert.match(drawn, /nemia refresh r-1/, 'the verb to type, as the api said it');
  assert.match(drawn, /data-kinds-behind="2"/);

  assert.equal(renderToStaticMarkup(createElement(KindsBehind, { run: detailOf({ kinds: [] }) })), '', 'a run on the newest draws none');
  assert.equal(renderToStaticMarkup(createElement(KindsBehind, { run: unpinned() })), '', 'and so does one the api pinned nothing for');
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
  assert.match(html, /data-breakdown-foot[^>]*>Wall time 1h 00m, from 11 Oct 1:11 PM\.</);
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
