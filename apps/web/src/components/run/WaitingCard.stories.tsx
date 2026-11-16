import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import type { WaitingRun } from '@/lib/api/runs';
import { WaitingCard } from './WaitingCard';

/** A run that waits on a person, as a card of the runs page: in a box as narrow as a card where the page is narrow, and wide. */
const meta: Meta = { title: 'Run/WaitingCard' };
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
  ...codes,
  raise: null,
  timeline: [],
  filed: null,
  spec: null,
  taskId: `t-${i}`,
  workspace: null,
  branch: null,
  files: [],
  filesError: null,
  note: null,
  roundDue: false,
  needs: null,
  waitingFor: null,
  approve: null,
  denied: null,
  sessionUnread: null,
  lastLine: null,
  gate: null,
  said: [],
  asked: null,
  check: null,
  attempts: { count: 0, latest: null },
  used: null,
  spent: null,
  budget: null,
});

/** A run at its last gate, its title long enough to run over the copy control under it on one line of the wide card. */
const RUN: WaitingRun = {
  labels: {},
  id: 'lay-the-diamond-top-e2e4',
  repo: '/code/app',
  factory: 'nemia',
  place: 'git',
  work: null,
  brief: 'A title that runs over the copy control of its card',
  workflowDir: '/code/app/workflows/dev',
  try: null,
  baseRef: null,
  branch: null,
  isolate: null,
  createdAt: '2026-10-12T15:02:00.000Z',
  startedAt: '2026-10-12T15:02:00.000Z',
  cancelledAt: null,
  pruned: null,
  onDisk: { worktrees: true, files: true },
  read: null,
  gates: ['land'],
  warning: null,
  kinds: [],
  after: [],
  context: [],
  waiting: null,
  holdUntil: [],
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
  graph: {
    roots: ['design'],
    edges: [
      { from: 'design', to: 'implement', kind: 'after' },
      { from: 'implement', to: 'review', kind: 'after' },
      { from: 'review', to: 'land', kind: 'after' },
      { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
    ],
  },
  waitingOnYou: ['land'],
  waitingOnYouWords: ['approve land'],
  toDecide: null,
  timeline: {
    rounds: [],
    run: {
      loop: null,
      round: null,
      tasks: 4,
      inFlight: 0,
      queuedMs: 0,
      ranMs: 0,
      wallMs: null,
      queued: '0s',
      ran: '0s',
      wall: '0s',
      cost: null,
    },
  },
  wallMs: 7_740_000,
  finishedAt: null,
  clock: null,
  stepCosts: null,
  waitingSince: '2026-10-12T16:40:00.000Z',
};

/** A box as wide as a card of the runs page where the page is narrow. */
const NARROW: CSSProperties = { width: 360 };

/** A box as wide as a card where the page is wide. */
const WIDE: CSSProperties = { width: 760 };

/** Where the button of the card drawn in `canvas` stands against its rail, and how far its right edge is from the foot's. */
const footOf = (canvas: HTMLElement): { beside: boolean; fromRight: number } => {
  const foot = canvas.querySelector('[data-foot]')!;
  const [rail, button] = ['[data-run-steps]', '[data-cut-button]'].map((part) => foot.querySelector(part)!.getBoundingClientRect());
  return {
    beside: button.top < rail.bottom && button.bottom > rail.top,
    fromRight: Math.round(foot.getBoundingClientRect().right - button.right),
  };
};

/**
 * The card where the page is narrow: its graph, 188 pixels wide as on every surface, and its cost on one line, and its one button
 * under them, at the card's right.
 */
export const Narrow: StoryObj = {
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    await expect(footOf(canvasElement), 'the button under the graph, at the right').toEqual({ beside: false, fromRight: 0 });
    await expect(canvasElement.querySelectorAll('[data-cut-button]').length, 'one button').toBe(1);
    await expect(canvasElement.querySelectorAll('[data-step]').length, 'its four steps, laid out by their edges').toBe(4);
    await expect(canvasElement.querySelector('[data-fold]'), 'none folded').toBeNull();
  },
  render: () => (
    <div data-card-box style={NARROW}>
      <WaitingCard run={RUN} asOf={AS_OF} />
    </div>
  ),
};

/**
 * The card where the page is wide: the button at the card's right, and the title under the meta line, raised over the copy control's
 * target, so its highest pixels under the control answer the title's link: a press there opens the run, and copies nothing.
 */
export const Wide: StoryObj = {
  play: async ({ canvasElement, userEvent }) => {
    await document.fonts.ready;
    await expect(footOf(canvasElement), 'the button beside the rail, at the right').toEqual({ beside: true, fromRight: 0 });
    const article = canvasElement.querySelector('article[data-run]')!;
    const link = article.querySelector('h3 a')!;
    const button = article.querySelector('[data-copy-id] button')!.getBoundingClientRect();
    const x = button.left + button.width / 2;
    const row = [...link.getClientRects()][0];
    const at = document.elementFromPoint(x, row.top + 1);
    await expect(x > row.left && x < row.right, 'the title runs under the copy control').toBe(true);
    await expect(at?.closest('a'), `the point a pixel inside the title, under the copy control, answers ${at?.tagName ?? 'nothing'}`).toBe(
      link,
    );
    await userEvent.click(at!);
    const run = article.getAttribute('data-run');
    await waitFor(() => expect(canvasElement.querySelector('[data-story-ground]')?.getAttribute('data-at')).toBe(`/runs/${run}`));
    await expect(canvasElement.querySelectorAll('[data-copied]').length, 'and nothing was copied').toBe(0);
    atRest();
  },
  render: () => (
    <div data-card-box style={WIDE}>
      <WaitingCard run={RUN} asOf={AS_OF} />
    </div>
  ),
};
