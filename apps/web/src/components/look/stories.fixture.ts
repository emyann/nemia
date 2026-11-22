/** What the look's stories draw their parts with: runs' steps in each state a rail shows, and the grounds a part is shown on. */
import type { CSSProperties } from 'react';
import type { RunView } from '@/lib/api/judged';

/** A step of a rail, by its name and its codes, its check's verdict, its note and whether its next round is due. */
type RailStep = Pick<RunView['steps'][number], 'name' | 'phase' | 'reason' | 'on' | 'via' | 'verdict' | 'note' | 'roundDue'>;

/** The codes of each state the stories draw. */
const VERIFIED = {
  phase: 'succeeded',
  reason: 'CheckPassed',
  on: null,
  via: null,
  verdict: { result: 'passed', exit: 0 },
  note: null,
  roundDue: false,
} as const;
const UNVERIFIED = { phase: 'succeeded', reason: 'Succeeded', on: null, via: null, verdict: null, note: null, roundDue: false } as const;
const APPROVAL = { phase: 'waiting', reason: 'AwaitingApproval', on: null, via: null, verdict: null, note: null, roundDue: false } as const;
const WORKING = { phase: 'running', reason: 'Running', on: null, via: null, verdict: null, note: null, roundDue: false } as const;
const TO_COME = { phase: 'pending', reason: 'Pending', on: null, via: null, verdict: null, note: null, roundDue: false } as const;
const REFUSED_CHECK = {
  phase: 'failed',
  reason: 'CheckFailed',
  on: null,
  via: null,
  verdict: { result: 'failed', exit: 1 },
  note: null,
  roundDue: false,
} as const;

/** A run at its gate: every step verified, the last waiting on a person's word. */
export const GATE: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...VERIFIED },
  { name: 'review', ...VERIFIED },
  { name: 'land', ...APPROVAL },
];

/** A build run at its design gate: design ran and its closeout waits on a person's word, the rest to come. */
export const DESIGN_GATE: RailStep[] = [
  { name: 'design', ...APPROVAL },
  { name: 'implement', ...TO_COME },
  { name: 'review', ...TO_COME },
  { name: 'land', ...TO_COME },
];

/** A run whose steps are done, on a check or on their own word. */
export const DONE: RailStep[] = [
  { name: 'design', ...UNVERIFIED },
  { name: 'implement', ...VERIFIED },
  { name: 'review', ...UNVERIFIED },
  { name: 'land', ...APPROVAL },
];

/** A run at work on its second step. */
export const AT_WORK: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...WORKING },
  { name: 'review', ...TO_COME },
  { name: 'land', ...TO_COME },
];

/** A run nothing of which has started. */
export const TO_COME_ALL: RailStep[] = [
  { name: 'design', ...TO_COME },
  { name: 'implement', ...TO_COME },
  { name: 'land', ...TO_COME },
];

/** A run whose second step failed its check. */
export const REFUSED: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...REFUSED_CHECK },
  { name: 'review', ...TO_COME },
];

/** The codes of a step checked, waiting on a run slot, and passed by its route; a workflow node that filed its card. */
const CHECKING = { phase: 'running', reason: 'Checking', on: null, via: null, verdict: null, note: null, roundDue: false } as const;
const FOR_A_SLOT = { phase: 'waiting', reason: 'Waiting', on: 'limit', via: null, verdict: null, note: null, roundDue: false } as const;
const SKIPPED = { phase: 'succeeded', reason: 'Skipped', on: null, via: null, verdict: null, note: null, roundDue: false } as const;

/** A run as its graph draws it: its steps, its workflow's graph, its gates, never called off, held where `held` says. */
type GraphRunFixture = {
  steps: RailStep[];
  graph: RunView['graph'];
  gates: RunView['gates'];
  cancelledAt: string | null;
  holding: RunView['holding'];
};

/** The build workflow's graph, among the steps a run has: a chain, and review looping back to implement for three rounds. */
const chainOf = (steps: readonly RailStep[]) => {
  const names = steps.map((one) => one.name);
  const edges: Array<RunView['graph']['edges'][number]> = names.slice(1).map((to, i) => ({ from: names[i], to, kind: 'after' }));
  if (names.includes('review') && names.includes('implement')) edges.push({ from: 'review', to: 'implement', kind: 'loop', rounds: 3 });
  return { roots: names.slice(0, 1), edges };
};

/** A hold on a run until another lands. */
const HOLD: NonNullable<RunView['holding']> = {
  at: '2026-11-15T17:30:00.000Z',
  runs: [{ run: 'cli-the-api-only-consumer-1sw7', missing: false, cancelledAt: null, gone: [], landed: false }],
  word: 'held until cli-the-api-only-consumer-1sw7 lands',
  advice: '',
  waitingOnYou: false,
};

/** Build's gates: design approved after it, its closeout waiting; land, an ending, approved before it runs. */
const BUILD_GATES: RunView['gates'] = [
  { step: 'design', at: 'after' },
  { step: 'land', at: 'before' },
];

/**
 * A run of `steps` as its graph draws it: build's graph among them, design and land gated.
 * @param steps The run's steps.
 * @param held Whether a person holds it.
 */
export const graphRun = (steps: RailStep[], held = false) => ({
  steps,
  graph: chainOf(steps),
  gates: BUILD_GATES.filter((gate) => steps.some((one) => one.name === gate.step)),
  cancelledAt: null,
  holding: held ? HOLD : null,
});

/** A run whose check is at work on implement. */
export const CHECKED: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...CHECKING },
  { name: 'review', ...TO_COME },
  { name: 'land', ...TO_COME },
];

/** A run whose next step waits on a run slot. */
export const SLOT: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...FOR_A_SLOT },
  { name: 'review', ...TO_COME },
  { name: 'land', ...TO_COME },
];

/** A run gone round its loop: implement at work on its second round. */
export const LOOPED: RailStep[] = [
  { name: 'design', ...VERIFIED },
  { name: 'implement', ...WORKING, note: 'round 2 of 3' },
  { name: 'review', ...VERIFIED },
  { name: 'land', ...TO_COME },
];

/** A routed run, as intake's: its condition took build, so the route to quick was passed by. */
export const ROUTED: GraphRunFixture = {
  steps: [
    { name: 'intake', ...VERIFIED },
    { name: 'next', ...VERIFIED },
    { name: 'to-build', ...UNVERIFIED, phase: 'succeeded', reason: 'Sent' },
    { name: 'to-quick', ...SKIPPED },
  ],
  graph: {
    roots: ['intake'],
    edges: [
      { from: 'intake', to: 'next', kind: 'after' },
      { from: 'next', to: 'to-build', kind: 'route', route: 'build' },
      { from: 'next', to: 'to-quick', kind: 'route', route: 'quick' },
    ],
    nodes: [
      { name: 'intake', kind: 'step' },
      { name: 'next', kind: 'condition' },
      { name: 'to-build', kind: 'workflow', workflow: 'build' },
      { name: 'to-quick', kind: 'workflow', workflow: 'quick' },
    ],
  },
  gates: [{ step: 'next', at: 'after' }],
  cancelledAt: null,
  holding: null,
};

/** A run of nine steps in a chain, at work on its sixth: more than a row's width holds. */
export const LONG: GraphRunFixture = graphRun(
  ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((name, i) => ({ name, ...(i < 5 ? VERIFIED : i === 5 ? WORKING : TO_COME) })),
);

/** A run whose workflow forks: design, then implement and tokens side by side, each its own lane, joining at review, then land. */
export const FORKED: GraphRunFixture = {
  ...graphRun([
    { name: 'design', ...VERIFIED },
    { name: 'implement', ...WORKING },
    { name: 'tokens', ...WORKING },
    { name: 'review', ...TO_COME },
    { name: 'land', ...TO_COME },
  ]),
  graph: {
    roots: ['design'],
    edges: [
      { from: 'design', to: 'implement', kind: 'after' },
      { from: 'design', to: 'tokens', kind: 'after' },
      { from: 'implement', to: 'review', kind: 'after' },
      { from: 'tokens', to: 'review', kind: 'after' },
      { from: 'review', to: 'land', kind: 'after' },
    ],
  },
};

/** A run listed without its graph, by an api older than the board. */
export const UNGRAPHED_RUN: GraphRunFixture = { ...graphRun(AT_WORK), graph: undefined as unknown as RunView['graph'] };

/** A card's ground around a part, as a part stands on a card. */
export const ON_CARD: CSSProperties = { display: 'inline-block', padding: 16, background: 'var(--md-sys-color-surface-container-low)' };

/** The page's own ground around a part, with room for a glow. */
export const ON_PLAIN: CSSProperties = { display: 'inline-block', padding: 40, background: 'var(--md-sys-color-background)' };

/** A ground unlike the page's and the card's, on which a cut corner painted over is seen. */
export const ON_OTHER: CSSProperties = { display: 'inline-block', padding: 40, background: 'var(--md-sys-color-inverse-surface)' };

/** What a card in a frame holds its lines in. */
export const CARD: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16, padding: '22px 26px 24px' };

/** Parts side by side. */
export const ROW: CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 };
