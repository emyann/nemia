import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { Token } from '@/lib/api/tokens';
import { atRest } from '../../../.storybook/play';
import { TokensReading, TokenTable } from './TokenTable';
import { saysReading } from '../../../.storybook/unread';

/** The store's standing tokens: the person's laptop, store-wide, and an agent's, bound to a factory and narrowed. */
const TOKENS: Token[] = [
  { name: 'laptop', holder: 'person', createdAt: '2026-11-02T09:14:00.000Z' },
  { name: 'scribe', holder: 'agent', agent: 'Scribe', factory: 'nemia', narrowed: 'read', createdAt: '2026-11-12T16:40:00.000Z' },
];

/** The tokens on Settings, one story a state: listed, and a Retire asked before it is sent. */
const meta: Meta<typeof TokenTable> = {
  title: 'Store/TokenTable',
  component: TokenTable,
  args: { tokens: TOKENS },
  render: (args) => (
    <div style={{ width: 960 }}>
      <TokenTable {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof TokenTable>;

/** Two tokens, each with the kit's outlined Retire. */
export const Listed: Story = {
  play: async ({ canvasElement }) => {
    const retire = canvasElement.querySelector('[data-token-retire="laptop"]');
    await expect(retire?.getAttribute('data-slot')).toBe('button');
  },
};

/** Retire pressed: the ask beside the table, the look's press that retires and the kit's Cancel, every Retire held while it asks. */
export const Asking: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const table = within(canvasElement);
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-token-retire="laptop"]')!);
    await expect(canvasElement.querySelector('[data-token-confirm="laptop"]')).not.toBeNull();
    await expect(table.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(canvasElement.querySelector('[data-token-retire="scribe"]')).toHaveAttribute('data-disabled');
    atRest();
  },
};

/** The tokens still read: the shape of their table. */
export const Reading: Story = {
  render: () => (
    <div style={{ width: 880 }}>
      <TokensReading />
    </div>
  ),
  play: saysReading('Reading the tokens…'),
};
