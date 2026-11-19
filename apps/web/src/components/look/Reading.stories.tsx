import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Skeleton } from '@/components/ui/ds';
import { Reading, ReadingLines } from './Reading';
import { ON_CARD } from './stories.fixture';

/** What a part draws while its first read is out: the kit's skeletons in the shape of what is coming, named for a screen reader. */
const meta: Meta<typeof Reading> = {
  title: 'Look/Reading',
  component: Reading,
  args: { label: 'Reading the rules…', at: 'late' },
  render: (args) => (
    <div style={{ ...ON_CARD, width: 420 }}>
      <Reading {...args} className="flex flex-col gap-3">
        <Skeleton className="w-40 text-title-small" />
        <ReadingLines widths={['w-full', 'w-5/6', 'w-2/3']} className="text-body-medium" />
      </Reading>
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(args.label);
  },
};
export default meta;

/** Held back a moment before the shapes show, as a part's own read is: a read that answers sooner draws nothing. */
export const Late: StoryObj<typeof Reading> = {};

/** Shown at once, as a route's pending page is, the router having held it back already. */
export const Now: StoryObj<typeof Reading> = { args: { at: 'now' } };
