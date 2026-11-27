import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { FACTORY, factoryView, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { CardActions } from './CardActions';

/** A card's one Start and its menu, over a store that holds the factory `nemia`. */
const meta: Meta<typeof CardActions> = {
  title: 'Store/CardActions',
  component: CardActions,
  tags: ['network'],
  args: { entry: unstartedCard('decode-the-reads', FACTORY), chain: null, stuck: false, onRefused: fn() },
  render: (args) => (
    <QueryClientProvider client={seeded([[factoriesQuery.queryKey, [factoryView(FACTORY)]]])}>
      <div style={{ width: 340, display: 'flex', gap: 8 }}>
        <CardActions {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof CardActions>;

/** A card filed and not started: its Start and its menu button. */
export const Filed: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(within(canvasElement).getByRole('button', { name: 'More actions on decode-the-reads' })).toBeVisible();
  },
};

/** The menu open: start now, edit, what it runs after, what it reads, its name and remove. */
export const MenuOpen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More actions on decode-the-reads' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Run it after…' })).toBeVisible();
    await expect(within(menu).getByRole('menuitem', { name: 'Runs it reads…' })).toBeVisible();
  },
};
