import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from 'react-aria-components';
import { expect } from 'storybook/test';
import { atRest, tipOf } from '../../../.storybook/play';
import { cn, focusRing } from '@/components/ui/ds/utils';
import { StepGraph } from './StepGraph';
import {
  AT_WORK,
  CHECKED,
  DESIGN_GATE,
  DONE,
  FORKED,
  GATE,
  graphRun,
  LONG,
  LOOPED,
  ON_CARD,
  REFUSED,
  ROUTED,
  SLOT,
  TO_COME_ALL,
  UNGRAPHED_RUN,
} from './stories.fixture';

/**
 * A run's steps as its workflow's graph drawn small, one story a state: done, at work, checked, at its gate, at its design gate,
 * refused, waiting, held, looped, routed, folded, ungraphed, named in a fork, pressable.
 */
const meta: Meta<typeof StepGraph> = {
  title: 'Look/StepGraph',
  render: (args) => (
    <div style={ON_CARD}>
      <StepGraph {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof StepGraph>;

/** The centre of a step's node across the graph, in the graph's own pixels. */
const centreOf = (canvas: HTMLElement, step: string) => {
  const node = canvas.querySelector<HTMLElement>(`[data-step="${step}"]`)!;
  return node.offsetLeft + node.offsetWidth / 2;
};

/** A run whose steps are done, on a check or on their own word, its last at its gate. */
export const Done: Story = { args: { run: graphRun(DONE) } };

/**
 * A run at work on implement: its node violet and a size larger, its pulse ring growing and fading, still under reduced motion. Its
 * name and word in the kit's tooltip, opened by the keyboard's focus.
 */
export const AtWork: Story = {
  args: { run: graphRun(AT_WORK) },
  play: async ({ canvasElement, userEvent }) => {
    const node = canvasElement.querySelector('[data-step="implement"] [role="img"]')!;
    await expect(await tipOf(userEvent, node)).toHaveTextContent('implement · working');
    atRest();
  },
};

/** A run whose check is at work on implement: alive, as its session would be. */
export const Checking: Story = { args: { run: graphRun(CHECKED) } };

/** A run at its gate: land yellow and a size larger, its gate's tick yellow, before land, which is approved before it runs. */
export const AtItsGate: Story = {
  args: { run: graphRun(GATE) },
  play: async ({ canvasElement }) => {
    const tick = canvasElement.querySelector('[data-gate="land"]')!;
    await expect(tick).toHaveAttribute('data-gate-at', 'before');
    await expect(Number(tick.getAttribute('x1'))).toBeLessThan(centreOf(canvasElement, 'land'));
  },
};

/**
 * A build run at its design gate: design yellow and a size larger, its gate's tick yellow after it, between design and implement, since
 * its closeout is what waits; land's tick still before land.
 */
export const AtItsDesignGate: Story = {
  args: { run: graphRun(DESIGN_GATE) },
  play: async ({ canvasElement }) => {
    const tick = canvasElement.querySelector('[data-gate="design"]')!;
    await expect(tick).toHaveAttribute('data-gate-at', 'after');
    const x = Number(tick.getAttribute('x1'));
    await expect(x).toBeGreaterThan(centreOf(canvasElement, 'design'));
    await expect(x).toBeLessThan(centreOf(canvasElement, 'implement'));
  },
};

/** A run whose implement failed its check: red, the steps after it hollow. */
export const Refused: Story = { args: { run: graphRun(REFUSED) } };

/** A run whose implement waits on a run slot: drawn by its four corners. */
export const ForASlot: Story = { args: { run: graphRun(SLOT) } };

/** A held run nothing of which has started: its first step by its corners, the hold stopping it, the rest hollow. */
export const Held: Story = { args: { run: graphRun(TO_COME_ALL, true) } };

/** A run gone round its loop, at work on implement's second round: the loop violet. */
export const LoopTaken: Story = { args: { run: graphRun(LOOPED) } };

/** A routed run: the condition a dot, its fork two lanes, the route not taken faint. */
export const Routed: Story = { args: { run: ROUTED } };

/** A run of nine steps: the columns away from where it is fold into a count. */
export const Folded: Story = { args: { run: LONG } };

/** A run listed without its graph: its steps in a row, and what to do. */
export const Ungraphed: Story = { args: { run: UNGRAPHED_RUN } };

/**
 * A forked graph naming its steps, as the opened floor card does: each under its own node, a fork's two lanes one row each, so no two
 * names share a box.
 */
export const Named: Story = {
  args: {
    run: FORKED,
    width: 600,
    named: new Map(FORKED.steps.map((step) => [step.name, { agent: `${step.name} agent`, said: '4m · $1.00' }])),
  },
  play: async ({ canvasElement }) => {
    const boxes = [...canvasElement.querySelectorAll<HTMLElement>('[data-named]')].map((one) => {
      const box = one.getBoundingClientRect();
      return `${Math.round(box.left)},${Math.round(box.top)}`;
    });
    await expect(boxes).toHaveLength(FORKED.steps.length);
    await expect(new Set(boxes).size).toBe(boxes.length);
  },
};

/** A node as a button, as the runs page wraps it to open its step's card, named by its step and its word. */
function pressable(node: ReactNode, step: { name: string; state: string }) {
  return (
    <Button
      aria-label={`${step.name}, ${step.state}`}
      data-step-bar={step.name}
      className={cn('grid size-full place-items-center outline-none', focusRing())}
    >
      {node}
    </Button>
  );
}

/** A graph whose nodes are buttons: the keyboard's Tab reaches each, in the run's order. */
export const Pressable: Story = {
  args: { run: graphRun(GATE), wrap: pressable },
  play: async ({ userEvent }) => {
    const stops: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      await userEvent.tab();
      stops.push((document.activeElement as HTMLElement | null)?.dataset.stepBar ?? '');
    }
    await expect(stops).toEqual(['design', 'implement', 'review', 'land']);
    atRest();
  },
};
