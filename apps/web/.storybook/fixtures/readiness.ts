/**
 * The welcome's reads as the api answers them, for its stories (`Pages/Welcome`): the readiness read typed by `objects`' own `Readiness`,
 * the milestones by its `Milestones`, a fix by its `Fix` and a check turn by its `HarnessTurn`, so a key the api renames fails the
 * typecheck here; and the MSW handlers a story names in `parameters.msw` — a fresh store, a harness installing, a check failed, ready.
 */
import { http, HttpResponse } from 'msw';
import type { Fix, HarnessCheck, HarnessTurn, Milestones, Quota, Readiness, ReadinessPiece } from 'objects';

/** The harness's install piece, in `state`, carrying `checks` where it is met. */
const install = (state: ReadinessPiece['state'], checks?: HarnessCheck[]): ReadinessPiece => ({
  name: 'claude',
  area: 'harness',
  state,
  message:
    state === 'met'
      ? 'Claude Code (claude) is installed: 2.1.325, the version this release was tested with'
      : 'Claude Code (claude), at 2.1.325, the version this release was tested with',
  fixes:
    state === 'met'
      ? [{ message: 'remove Claude Code from the tools folder', command: 'nemia doctor fix claude --index 1', startable: true, index: 1, kind: 'removes' }]
      : [{ message: 'install Claude Code 2.1.325 into the tools folder', command: 'nemia doctor fix claude', startable: true, index: 0 }],
  harness: { name: 'claude', part: 'install' },
  cost: 'run',
  ...(checks === undefined ? {} : { checks }),
});

/** The harness's sign-in piece, in `state`. */
const signIn = (state: ReadinessPiece['state']): ReadinessPiece => ({
  name: 'claude-sign-in',
  area: 'harness',
  state,
  message: 'Claude Code is signed in as the user the daemon runs as',
  fixes:
    state === 'met'
      ? []
      : [{ message: 'sign in with your Claude account, as the user the daemon runs as', command: 'claude auth login', startable: false, kind: 'typed' }],
  harness: { name: 'claude', part: 'sign-in' },
  cost: 'run',
});

/** No factory filed. */
const NO_FACTORY: ReadinessPiece = {
  name: 'factory',
  area: 'factory',
  state: 'missing',
  message: 'no factory is filed: a run starts in one',
  fixes: [{ message: 'file one from a template', command: 'nemia factory add <name> --template <template>', startable: false, kind: 'typed' }],
  cost: 'run',
};

/** The version check at the pin. */
const VERSION: HarnessCheck = {
  name: 'version',
  state: 'passed',
  message: '2.1.325, the version this release was tested with',
  fixes: [],
  found: '2.1.325',
  pin: '2.1.325',
};

/** The turn check passed, with what it cost. */
const TURN_PASSED: HarnessCheck = {
  name: 'turn',
  state: 'passed',
  message: 'Claude Code answered a check turn, for $0.0042',
  fixes: [],
  answer: 'ready',
  costUsd: 0.0042,
  capUsd: 0.05,
  turn: 'turn-1',
};

/** The read of a store with the pieces `pieces`. */
const read = (pieces: ReadinessPiece[]): Readiness => ({ ready: false, ran: false, pieces });

/** A fresh store's milestones: the harness next. */
const FRESH_MILESTONES: Milestones = {
  milestones: [
    { name: 'harness', state: 'next', message: 'activate a harness: it runs every session in your factories' },
    { name: 'factory', state: 'later', message: 'file a factory' },
    { name: 'volume', state: 'later', message: 'give a factory a volume' },
    { name: 'landed', state: 'later', message: 'merge a first change into its base branch' },
  ],
};

/** The subscription's quota, fresh: what the welcome shows beside a passed turn, as information. */
const QUOTA: Quota = {
  state: 'fresh',
  askedAt: '2026-11-18T10:00:00.000Z',
  ageMs: 60_000,
  againAt: '2026-11-18T10:05:00.000Z',
  subscription: 'max',
  windows: [
    { key: 'five_hour', label: '5-hour', usedPercentage: 12, resetsAt: '2026-11-18T14:00:00.000Z', reset: false, marked: false },
    { key: 'seven_day', label: 'week', usedPercentage: 40, resetsAt: '2026-11-22T10:00:00.000Z', reset: false, marked: false },
  ],
  last: null,
  keepMs: 300_000,
  markAt: 80,
  said: null,
};

/** The install's fix, started. */
const STARTED: Fix = { id: 'fix-1', need: 'claude', phase: 'pending', output: '' };

/** The handlers of a store whose readiness reads `pieces`, whose install is started and followed while it runs, and whose turn runs. */
const answering = (pieces: ReadinessPiece[], milestones: Milestones = FRESH_MILESTONES) => [
  http.get('/api/readiness', () => HttpResponse.json(read(pieces))),
  http.get('/api/readiness/milestones', () => HttpResponse.json(milestones)),
  http.get('/api/quota', () => HttpResponse.json(QUOTA)),
  http.post('/api/readiness/fixes', () => HttpResponse.json(STARTED)),
  http.get('/api/readiness/fixes/:id/output', () =>
    new HttpResponse('event: output\ndata: added 1 package in 2s\n\n', { headers: { 'content-type': 'text/event-stream' } }),
  ),
  http.post('/api/readiness/turns', () =>
    HttpResponse.json({
      id: 'turn-2',
      harness: 'claude',
      check: { ...TURN_PASSED, state: 'running', message: 'a check turn runs through Claude Code, capped at $0.05', turn: 'turn-2' },
    } satisfies HarnessTurn),
  ),
];

/** A fresh store: no harness installed, no factory. */
export const freshStore = answering([install('missing'), signIn('inactive'), NO_FACTORY]);

/** The harness installed and signed in, its version differing from the pin. */
export const checkFailed = answering([
  install('met', [
    {
      ...VERSION,
      state: 'failed',
      found: '2.0.1',
      message: 'Claude Code answers 2.0.1, and this release was tested with 2.1.325: install 2.1.325 again',
      fixes: [{ message: 'install Claude Code 2.1.325 into the tools folder', command: 'nemia doctor fix claude', startable: true, index: 0 }],
    },
    { name: 'turn', state: 'unrun', message: 'no check turn has run through Claude Code yet: Run the check, on the board, runs one real turn capped at $0.05', fixes: [], capUsd: 0.05 },
  ]),
  signIn('met'),
  NO_FACTORY,
]);

/** The harness installed, signed in, and both checks passed: the factory next. */
export const harnessReady = answering([install('met', [VERSION, TURN_PASSED]), signIn('met'), NO_FACTORY], {
  milestones: [
    { name: 'harness', state: 'done', message: 'a harness is installed and signed in' },
    { name: 'factory', state: 'next', message: 'file a factory from a template: it may start with no volume' },
    { name: 'volume', state: 'later', message: 'give a factory a volume' },
    { name: 'landed', state: 'later', message: 'merge a first change into its base branch' },
  ],
});
