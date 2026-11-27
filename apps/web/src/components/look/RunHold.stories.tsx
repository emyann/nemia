import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { NOW_WORDS } from '@/lib/words';
import { HoldLine } from './RunHold';

/** A hold with no reason and nobody named: the runs it waits on, and the words the api says of it. */
const BARE = {
  at: '2026-11-15T17:30:00.000Z',
  runs: [{ run: 'cli-the-api-only-consumer-1sw7', missing: false, cancelledAt: null, failed: false, released: false }],
  word: 'held until cli-the-api-only-consumer-1sw7 succeeds',
  advice: '',
  waitingOnYou: false,
};

/** A reason near the 200 characters a hold's why may hold. */
const LONG_WHY =
  'Waits for 1sw7 to land first: its board change reads the hold’s new fields, which only that run serves; resuming before it lands would build against a schema the api does not answer yet.';

/** A held run's hold line, as the runs table draws it under a held row's words, in the width of the table's Now column. */
const meta: Meta<typeof HoldLine> = {
  title: 'Look/HoldLine',
  component: HoldLine,
  args: {
    holding: { ...BARE, why: 'merge conflicts with 1sw7’s schema change', by: 'ann', actor: { kind: 'person', token: 'laptop' } },
  },
  render: (args) => (
    <div style={{ width: 360, padding: 16 }}>
      <HoldLine {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof HoldLine>;

/** A short reason, who the person said they are, and the person who put it. */
export const Said: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-hold-why]')).toHaveTextContent('merge conflicts with 1sw7’s schema change');
    await expect(canvasElement.querySelector('[data-hold-by]')).toHaveTextContent('by ann');
    await expect(canvasElement.querySelector('[data-hold-by] [data-actor="person"]')).not.toBeNull();
  },
};

/** A reason near the cap, cut at two lines and whole on hover, put by an agent. */
export const LongWhy: Story = {
  args: { holding: { ...BARE, why: LONG_WHY, by: 'operator', actor: { kind: 'agent', agent: 'operator', token: 'ops' } } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-hold-why]'), 'the whole why on hover').toHaveAttribute('title', LONG_WHY);
    await expect(canvasElement.querySelector('[data-hold-by] [data-actor="agent"]')).not.toBeNull();
  },
};

/** A hold older code wrote, or one put with nothing said: no reason given, and nobody named. */
export const NoneSaid: Story = {
  args: { holding: BARE },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-hold-why]')).toHaveTextContent(NOW_WORDS.noWhy);
    await expect(canvasElement.querySelector('[data-hold-by]'), 'nobody named').toBeNull();
  },
};
