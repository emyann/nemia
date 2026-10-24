import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { WaitingRun } from '@/lib/api';
import { WaitingCard } from './WaitingCard';

/** A run that waits on a person, as a card of the runs page: in a box too narrow to hold its tiles and its button, and in one that does. */
const meta: Meta = { title: 'Board/WaitingCard' };
export default meta;

/** The instant the stories' answer was read at. */
const AS_OF = new Date('2026-10-12T17:11:00.000Z');

/** The codes and the words of a step verified by its check, and of one at its gate. */
const VERIFIED = {
  phase: 'succeeded',
  reason: 'CheckPassed',
  on: null,
  via: null,
  message: 'verified ✓',
  verdict: { result: 'passed', exit: 0 },
} as const;
const APPROVAL = {
  phase: 'waiting',
  reason: 'AwaitingApproval',
  on: null,
  via: null,
  message: 'awaiting approval',
  verdict: null,
} as const;

/** A step of `RUN`, by its name and its codes, with nothing a person is asked. */
const step = (name: string, codes: typeof VERIFIED | typeof APPROVAL, i: number): WaitingRun['steps'][number] => ({
  name,
  taskId: `t-${i}`,
  branch: null,
  ...codes,
  status: codes.message,
  note: null,
  roundDue: false,
  agent: null,
  since: null,
  needs: null,
  blockedByHarness: false,
  waitingFor: null,
  approve: null,
  denied: null,
  sessionUnread: null,
});

/** A run at its last gate, its title long enough to run over the copy control under it on one line of the wide card. */
const RUN: WaitingRun = {
  id: 'lay-the-diamond-top-e2e4',
  repo: '/code/app',
  factory: 'nemia',
  place: 'repository',
  work: null,
  brief: 'A title that runs over the copy control of its card',
  workflowDir: '/code/app/workflows/build',
  workflowPage: null,
  try: null,
  createdAt: '2026-10-12T15:02:00.000Z',
  startedAt: '2026-10-12T15:02:00.000Z',
  cancelledAt: null,
  pruned: null,
  after: [],
  context: [],
  waiting: null,
  heldUntil: [],
  holding: null,
  status: 'awaiting approval',
  phase: 'waiting',
  reason: 'AwaitingApproval',
  on: null,
  via: null,
  moving: false,
  cost: null,
  atWork: null,
  tokens: null,
  steps: [step('design', VERIFIED, 0), step('implement', VERIFIED, 1), step('review', VERIFIED, 2), step('land', APPROVAL, 3)],
  graph: { roots: [], edges: [] },
  waitingOnYou: ['land'],
  onYou: ['approve land'],
  toDecide: null,
  unreadable: null,
  wallMs: 7_740_000,
  finishedAt: null,
  clock: null,
  stepCosts: null,
  waitingSince: '2026-10-12T16:40:00.000Z',
};

/** A box as wide as a card of the runs page where the page is narrow: the foot wraps in it. */
const NARROW: CSSProperties = { width: 360 };

/** A box as wide as a card where the page is wide: the foot holds the tiles and the button on one line. */
const WIDE: CSSProperties = { width: 760 };

/** The card where it cannot hold its tiles and its button side by side: the button under the tiles, at the card's right. */
export const Narrow: StoryObj = {
  render: () => (
    <div data-card-box style={NARROW}>
      <WaitingCard run={RUN} asOf={AS_OF} />
    </div>
  ),
};

/** The card where it holds both: the button beside the tiles, at the card's right, and the title on one line over the copy control. */
export const Wide: StoryObj = {
  render: () => (
    <div data-card-box style={WIDE}>
      <WaitingCard run={RUN} asOf={AS_OF} />
    </div>
  ),
};
