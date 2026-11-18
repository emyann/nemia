import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { MilestoneRead } from 'objects';
import { atRest } from '../../../.storybook/play';
import { GettingStarted } from './GettingStarted';

/** The four milestones of a store, each in `states`' state. */
const milestones = (states: readonly MilestoneRead['state'][]): MilestoneRead[] =>
  (['harness', 'factory', 'volume', 'landed'] as const).map((name, i) => ({
    name,
    state: states[i] ?? 'later',
    message:
      states[i] === 'done'
        ? `${name} is done`
        : name === 'harness'
          ? 'activate a harness: it runs every session in your factories'
          : `${name}, still to do`,
  }));

/** The floor's Getting started list, one story a state: a fresh store, the harness done, all but the landing done. */
const meta: Meta<typeof GettingStarted> = {
  title: 'Frame/GettingStarted',
  component: GettingStarted,
  args: { milestones: milestones(['next', 'later', 'later', 'later']), onDismiss: () => undefined },
  render: (args) => (
    <div style={{ width: 900 }}>
      <GettingStarted {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof GettingStarted>;

/** A fresh store: the harness next, linked to Setup; Dismiss tells the floor. */
export const Fresh: Story = {
  args: { onDismiss: fn() },
  play: async ({ args, canvasElement, userEvent }) => {
    const list = within(canvasElement);
    await expect(list.getByRole('link', { name: 'A harness' })).toHaveAttribute('href', '/setup');
    await userEvent.click(list.getByRole('button', { name: 'Dismiss' }));
    await expect(args.onDismiss).toHaveBeenCalledOnce();
    atRest();
  },
};

/** The harness done: the factory next, whose page a later card adds, so it links nowhere yet. */
export const HarnessDone: Story = {
  args: { milestones: milestones(['done', 'next', 'later', 'later']) },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('link')).toHaveLength(0);
  },
};

/** All but the landing done. */
export const AllButLanded: Story = {
  args: { milestones: milestones(['done', 'done', 'done', 'next']) },
};
