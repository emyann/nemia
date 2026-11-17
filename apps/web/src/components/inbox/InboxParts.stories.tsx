import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FACTORY, queuedCard, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { GoneItem, QueueButtons } from './InboxParts';

/** A card that may be queued, and one queued first. */
const FILED = unstartedCard('decode-the-reads', FACTORY);
const QUEUED = queuedCard('measure-the-list', FACTORY, 1);

/** A card's Queue and Unqueue, one story a state: offered, waiting on its write, taken off, and a card gone with its Dismiss. */
const meta: Meta<typeof QueueButtons> = {
  title: 'Store/InboxParts',
  component: QueueButtons,
  args: { entry: FILED, pending: false, onQueue: () => undefined },
  render: (args) => (
    <div style={{ width: 560, display: 'flex', gap: 8 }}>
      <QueueButtons {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof QueueButtons>;

/** A card that may be queued: the kit's outlined Queue, its hint on hover. */
export const Queue: Story = {
  play: async ({ canvasElement }) => {
    const queue = within(canvasElement).getByRole('button', { name: 'Queue' });
    await expect(queue).toHaveAttribute('data-variant', 'outlined');
    await expect(queue.parentElement).toHaveAttribute(
      'title',
      'Start it on its own, in its factory and on its workflow, when a run slot frees',
    );
  },
};

/** Its write out: Queueing…, held. */
export const Queueing: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Queueing…' })).toBeDisabled();
  },
};

/** A queued card: Unqueue. */
export const Unqueue: Story = {
  args: { entry: QUEUED },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Unqueue' })).toBeEnabled();
  },
};

/** A card gone from the inbox behind the page's back: what it was refused with, and the kit's Dismiss. */
export const Gone: Story = {
  render: () => (
    <ul style={{ width: 560 }}>
      <GoneItem
        entry={FILED}
        refusal={{ entry: FILED, action: 'start', message: 'no card decode-the-reads in the inbox' }}
        onDismiss={() => undefined}
      />
    </ul>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Dismiss' })).toHaveAttribute('data-slot', 'button');
  },
};
