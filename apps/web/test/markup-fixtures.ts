/**
 * The runs, steps, closeouts and readers that the markup tests of more than one of the board's component folders draw with
 * (`components-<noun>.test.ts`): each written once here and imported by name. A fixture one folder's tests alone use stays in that
 * file.
 *
 * Node runs a test's TypeScript as it is, and not a component's JSX: `./tsx.ts` registers the hooks that load one, so every component
 * below is imported after it, dynamically.
 */
import { coded, EXIT_1, PASSED, triedAs, type Word } from './run-fixtures.ts';
import './tsx.ts';

const { createElement } = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
type RunView = import('../src/lib/runView.ts').RunView;
type StepAttempts = import('../src/lib/api/tries.ts').StepAttempts;
type StepUsed = import('../src/lib/api/usage.ts').StepUsed;
type StepTry = import('../src/lib/api/tries.ts').StepTry;
type StepCloseout = import('../src/lib/api/tries.ts').StepCloseout;
type Question = import('../src/lib/api/tries.ts').Question;
const Answering = await import('../src/components/gate/Decide.tsx');
const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
type Answer = import('../src/lib/asks.ts').Answer;

export const at = '2026-09-13T00:00:00.000Z';

/** A step's usage as the api gives it where nobody measured any: `wf decide`'s words, and nothing counted. */
export const UNMEASURED: StepUsed = {
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
export function runWith(note: string | null): RunView {
  return {
    id: 'r-1',
    labels: {},
    kinds: [],
    refresh: 'nemia refresh r-1',
    brief: 'Go round again',
    decide: 'nemia decide r-1',
    repo: '/code/app',
    place: 'git',
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
    holdUntil: [],
    holding: null,
    status: 'failed',
    phase: 'failed',
    reason: 'Failed',
    on: null,
    via: null,
    moving: false,
    cost: null,
    atWork: null,
    tokens: null,
    read: null,
    waitingOnYou: ['review'],
    waitingOnYouWords: ['review'],
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
        ...coded('rounds exhausted'),
        note,
        roundDue: false,
        commands: { approve: 'nemia approve r-1 review', retry: 'nemia retry r-1 review', say: 'nemia say r-1 review' },
        needs: null,
        waitingFor: null,
        approve: null,
        denied: null,
        sessionUnread: null,
        gate: null,
        lastLine: null,
        said: [],
        asked: null,
        closeout: null,
        unreadable: null,
        check: null,
        attempts: { count: 1, latest: { startedAt: at, ended: 'succeeded', endedAt: at, reason: 'harness', release: null, harness: null } },
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
            ...triedAs('rounds exhausted'),
            check: null,
            closeout: null,
            unreadable: null,
            answer: null,
            attempts: {
              count: 1,
              latest: { startedAt: at, ended: 'succeeded', endedAt: at, reason: 'harness', release: null, harness: null },
            },
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

/** The run of one step, `review`, with the word and note `wf ls` gives it, and who the api says is waited on. */
export function runOf(
  status: Word,
  { note = null, waitingOnYou, cancelledAt = null }: { note?: string | null; waitingOnYou: string[]; cancelledAt?: string | null },
): RunView {
  const run = runWith(note);
  return { ...run, cancelledAt, waitingOnYou, waitingOnYouWords: waitingOnYou, steps: [{ ...run.steps[0], ...coded(status) }] };
}

export const unescaped = (text: string) =>
  text.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#x27;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');

/**
 * The class tokens of the first tag in `html` that carries `mark` (a data mark as the markup writes it, `data-unread="dev"`), and none
 * where no tag does: a test reads one class that carries a meaning as a token, never the whole string of classes beside it.
 */
export const classesAt = (html: string, mark: string): string[] =>
  new RegExp(`<[^>]*${mark}[^>]*>`)
    .exec(html)?.[0]
    .match(/\bclass="([^"]*)"/)?.[1]
    .split(/\s+/) ?? [];

/** A markup's text, tags taken for separators: each run of text between two tags, trimmed, and none of the empty ones. */
export const textsOf = (html: string): string[] =>
  html
    .split(/<[^>]+>/)
    .map((text) => unescaped(text).trim())
    .filter(Boolean);

export const tookAt = '2026-09-13T00:12:30.000Z';

export const ranOnce: StepAttempts = {
  count: 1,
  latest: { startedAt: at, ended: 'succeeded', endedAt: tookAt, reason: 'harness', release: null, harness: null },
};

export const closeoutSaying = (summary: string, more: Partial<StepCloseout> = {}): StepCloseout => ({
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
export const threeTries: StepTry[] = [
  {
    try: 1,
    round: 1,
    cause: 'retries',
    current: false,
    taskId: 'r-1-implement',
    note: null,
    phase: 'succeeded',
    reason: 'Succeeded',
    on: null,
    via: null,
    message: 'succeeded',
    attempts: ranOnce,
    check: {
      command: 'npm test',
      taskId: 'r-1-implement-check',
      verdict: EXIT_1,
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
    phase: 'succeeded',
    reason: 'Succeeded',
    on: null,
    via: null,
    message: 'succeeded',
    attempts: ranOnce,
    check: { command: 'npm test', taskId: 'r-1-implement-try2-check', verdict: PASSED, refused: null },
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
    phase: 'running',
    reason: 'Running',
    on: null,
    via: null,
    message: 'running (working)',
    attempts: { count: 2, latest: { startedAt: tookAt, ended: null, endedAt: null, reason: null, release: null, harness: null } },
    check: { command: 'npm test', taskId: null, verdict: null, refused: null },
    closeout: null,
    unreadable: null,
    answer: null,
  },
];

export const cut: Question = {
  title: 'How is the card cut?',
  body: 'It is **big**.',
  options: [
    { label: 'a', meaning: 'The shape and the board first.' },
    { label: 'b', meaning: 'All of it at once.' },
  ],
  recommended: 'a',
  multiple: false,
};

export const where: Question = {
  title: 'Where do the answers go?',
  body: 'Either or both.',
  options: [
    { label: 'retry', meaning: 'Into the next try.' },
    { label: 'gate', meaning: 'With the approval.' },
  ],
  recommended: null,
  multiple: true,
};

export const LOGIN =
  'Could not refresh your login because another Claude Code process is refreshing it (or exited mid-refresh) · Try again in a minute';

/**
 * What the harness says a blocked session waits for, as the api gives it: the words a card or a node says, and what a person does about it.
 */
export const WAIT = { words: 'waiting for a permission prompt', advice: 'answer it in Claude Code: claude agents, session ae/t-1/1' };

/** The run of one step, `review`, in `status`, with what the api says it needs and who it says is waited on. */
export function needing(
  status: Word,
  needs: Partial<Pick<RunView['steps'][number], 'needs' | 'waitingFor' | 'lastLine' | 'denied'>>,
  over: { waitingOnYou: string[]; cancelledAt?: string | null },
): RunView {
  const run = runOf(status, over);
  return {
    ...run,
    steps: [
      {
        ...run.steps[0],
        needs: null,
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

/** Each step's three commands, as the api answers them on a run `r-1`. */
export const commandsOf = (step: string) => ({
  name: step,
  commands: { approve: `nemia approve r-1 ${step}`, retry: `nemia retry r-1 ${step}`, say: `nemia say r-1 ${step}` },
});

/** The Decide section's answers for `offers`, and the notes of `asked`, rendered inside the query client their asks are made with. */
export const offersMarkup = (offers: Answer[], asked: Array<{ step: string; try: number; note: string | null }> = []) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(Answering.Offers, { runId: 'r-1', offers, asked, steps: [...offers, ...asked].map((o) => commandsOf(o.step)) }),
    ),
  );

/** The run of one step, `review`, waiting at its gate on you — as the api gives it: its word, the need, and its gate. */
export const atGate = (over: Partial<RunView['steps'][number]> = {}, run: Partial<RunView> = {}): RunView => {
  const base = runOf('awaiting approval', { waitingOnYou: ['review'] });
  return {
    ...base,
    waitingOnYouWords: ['approve review'],
    gates: ['review'],
    ...run,
    steps: [
      {
        ...base.steps[0],
        needs: null,
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
export const withClient = (element: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, element));

/** What `wf ls` says of a run at its ending's gate, as the api gives it (`RunToDecide`). */
export const SHIP_SAYS = 'Merge this run onto the base branch, or abort on any failure.';

export const toShip = {
  kind: 'approve' as const,
  step: 'ship',
  says: SHIP_SAYS,
  filed: false,
  /** An ending's send-back goes to the work it waits on, not to the step itself. */
  back: ['implement'],
  onto: 'main',
  said: `${SHIP_SAYS} — wf approve r-1 ship`,
  command: 'wf approve r-1 ship',
};

/**
 * A run of implement → ship whose ship is the workflow's ending, at its gate: implement signed off with a summary and a file, ship is
 * unfiled and `awaiting approval`, and the run carries what there is to decide. Ship's `spec`, off the workflow the run froze, is what the
 * board tells an ending's gate from another gate by.
 */
export function endingRun(over: Partial<RunView> = {}): RunView {
  const run = runWith(null);
  const base = run.steps[0];
  const implement = {
    ...base,
    name: 'implement',
    taskId: 't-1',
    ...coded('unverified · done'),
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
    ...coded('awaiting approval'),
    branch: null,
    body: `${SHIP_SAYS}\n\nLook at the checkout first.`,
    closeout: null,
    approve: 'approve ship',
    gate: { awaiting: true, approval: null },
    spec: {
      harness: 'claude',
      model: null,
      effort: null,
      after: ['review'],
      context: null,
      workspace: 'base',
      place: null,
      resume: null,
      fence: null,
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
    waitingOnYouWords: ['approve ship'],
    toDecide: toShip,
    gates: ['ship'],
    graph: { roots: ['implement'], edges: [{ from: 'implement', to: 'ship', kind: 'after' }] },
    steps: [implement, ship],
    ...over,
  };
}

/** A plan's closeout as the api gives it, its fields in the order its schema declares them: files long enough to fold, risks not. */
export const planCloseout: StepCloseout = {
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

/** A page's piece inside a router, with the queries it reads already answered: a route link needs the router. */
export async function routedWith(
  element: ReturnType<typeof createElement>,
  data: Array<[readonly unknown[], unknown]> = [],
): Promise<string> {
  const { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider } = await import('@tanstack/react-router');
  const router = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory() });
  const client = new QueryClient();
  for (const [key, value] of data) client.setQueryData(key, value);
  return renderToStaticMarkup(
    // oxlint-disable-next-line react/no-children-prop -- createElement's type wants `children` among the props, and a .ts file has no JSX.
    createElement(RouterContextProvider, { router, children: createElement(QueryClientProvider, { client }, element) }),
  );
}

/** A piece that reads the address (`useBar`), drawn as a loaded root route's page, with the queries it reads already answered. */
export async function pagedWith(
  element: ReturnType<typeof createElement>,
  data: Array<[readonly unknown[], unknown]> = [],
): Promise<string> {
  const { createMemoryHistory, createRootRoute, createRouter, RouterProvider } = await import('@tanstack/react-router');
  const router = createRouter({ routeTree: createRootRoute({ component: () => element }), history: createMemoryHistory() });
  await router.load();
  const client = new QueryClient();
  for (const [key, value] of data) client.setQueryData(key, value);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
}

/** A factory as the api lists it, for the switcher: on one repository, offering one workflow; `extra` puts keys over it. */
export const filed = (
  name: string,
  extra: Partial<import('../src/lib/api/factories.ts').Factory> = {},
): import('../src/lib/api/factories.ts').Factory => ({
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
    volume: `nemia factory volume add ${name} <path>:ro|:rw`,
  },
  untrusted: [],
  volumes: [],
  template: null,
  ...extra,
});

/** Her session up and reached, on Semi-auto. */
export const nemiaUp = {
  level: 'semi-auto',
  since: '2026-10-05T12:00:00.000Z',
  task: 'nemia-1',
  phase: 'running',
  sessionId: '0123456789abcdef',
  reach: ['attach 01234567', 'https://example.test/code/session_0123'],
  bridge: { url: 'https://example.test/code/session_0123', why: null },
};

/** The line that trusts her folder, as the api answers it. */
export const TRUST = "cd '/store/nemia' && claude";

/** A card as the inbox lists it, named `idea`, with `extra` over it. */
export const inboxCard = (extra: Record<string, unknown> = {}) =>
  ({
    name: 'idea',
    labels: {},
    file: 'idea.md',
    title: 'An idea',
    workflow: null,
    repo: null,
    factory: null,
    from: [],
    startedAs: [],
    state: 'filed',
    error: null,
    body: 'An idea',
    filedAt: null,
    ...extra,
  }) as never;

/** A factory as the api lists it, on `repos`. */
export const listedFactory = (name: string, repos: string[], error: string | null = null) => ({
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
export const STORE_ANSWER: [readonly unknown[], unknown] = [
  ['store'],
  { workflows: '', agents: '', skills: '', fileFactory: 'nemia factory add <name> --repo <path>', turnOnNemia: '' },
];

export const LISTED = [listedFactory('default', ['/code/app']), listedFactory('solo', ['/r/a']), listedFactory('pair', ['/r/a', '/r/b'])];

/** A proposal of `acme` named `nemia-ab12c` in `phase`, changing one hire to widen access where `widens`. */
export const proposalIn = (phase: import('objects').ProposalPhase, widens: boolean, applyAt?: 'run-end'): import('objects').Proposal => ({
  apiVersion: 'nemia/v1',
  kind: 'Proposal',
  metadata: { name: 'nemia-ab12c', namespace: 'acme', resourceVersion: '3', creationTimestamp: '2026-11-06T10:00:00Z' },
  spec: { objects: [], why: 'the planner reads more', ...(applyAt ? { applyAt } : {}) },
  status: {
    phase,
    proposedBy: { agent: 'nemia' },
    changes: [{ resource: 'hires', name: 'build.plan', verb: 'update', access: widens ? 'widens' : 'same' }],
    widens,
    ...(phase === 'applied' ? { approvedBy: { by: 'person' as const, at: '2026-11-06T10:05:00Z' } } : {}),
  },
});

/** `element` rendered with the proposal `proposal` read already, as the page's loader leaves it. */
export async function withProposal(
  proposal: import('objects').Proposal,
  element: Parameters<typeof renderToStaticMarkup>[0],
): Promise<string> {
  const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
  const client = new QueryClient();
  client.setQueryData(['proposal', 'acme', 'nemia-ab12c'], proposal);
  return renderToStaticMarkup(createElement(QueryClientProvider, { client }, element));
}
