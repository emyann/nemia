import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FACTORY, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { CardFrom } from './CardFrom';

/** A card filed and not started, which reads two runs as context. */
const READS = { ...unstartedCard('decode-the-reads', FACTORY), from: ['ship-it-k2rq', 'measure-it-p4xd'] };

/** A card's `from:`, one story a state: the runs it reads with the kit's Change, and a card that reads none and can no longer change. */
const meta: Meta<typeof CardFrom> = {
  title: 'Store/CardFrom',
  component: CardFrom,
  args: { entry: READS, editable: true, onRefused: () => undefined },
  render: (args) => (
    <div style={{ width: 560 }}>
      <CardFrom {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof CardFrom>;

/** Reads two runs: each linked, and the kit's small outlined Change, closed. */
export const ReadsTwo: Story = {
  play: async ({ canvasElement }) => {
    const change = within(canvasElement).getByRole('button', { name: 'Change' });
    await expect(change).toHaveAttribute('data-slot', 'button');
    await expect(change).toHaveAttribute('aria-expanded', 'false');
  },
};

/** Reads two and has started: the runs alone, no Change. */
export const Started: Story = {
  args: { editable: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Change' })).toBeNull();
  },
};
