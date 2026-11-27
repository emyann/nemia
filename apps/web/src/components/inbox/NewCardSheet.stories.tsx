import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { inboxPageQuery } from '@/lib/api/inbox';
import { FACTORY, factoryView, seeded } from '../../../.storybook/fixtures/proposals';
import { NewCard } from './NewCardSheet';

/** The page's New card over a store that holds the factory `nemia` and two labels in use. */
const drawn = (factory?: string) => (
  <QueryClientProvider
    client={seeded([
      [factoriesQuery.queryKey, [factoryView(FACTORY)]],
      [
        inboxPageQuery({ limit: 1 }).queryKey,
        {
          entries: [],
          counts: { notStarted: 0, blocked: 0, waiting: 0, working: 0, done: 0, failed: 0, cancelled: 0 },
          labels: [
            { key: 'area', value: 'board', cards: 4 },
            { key: 'work', value: 'feature', cards: 2 },
          ],
          next: null,
          remaining: 0,
        },
      ],
    ])}
  >
    <NewCard factory={factory} />
  </QueryClientProvider>
);

/** The page's New card, the one filled press of the Inbox, and the side sheet it opens: the new card's fields. */
const meta: Meta<typeof NewCard> = { title: 'Store/NewCardSheet', component: NewCard, tags: ['network'] };
export default meta;

type Story = StoryObj<typeof NewCard>;

/** The press alone, as the page's head draws it. */
export const Closed: Story = {
  args: { factory: undefined },
  render: (args) => drawn(args.factory),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'New card' })).toBeVisible();
  },
};

/** Pressed: the sheet opens with every field of a new card in the look's cut field, and File card the one filled press. */
export const Open: Story = {
  args: { factory: FACTORY },
  render: (args) => drawn(args.factory),
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'New card' }));
    const sheet = await within(document.body).findByRole('dialog', { name: 'New card' });
    await waitFor(() => expect(within(sheet).getByRole('textbox', { name: 'Title' })).toBeVisible());
    await expect(within(sheet).getByRole('textbox', { name: 'Details' })).toBeVisible();
    await expect(within(sheet).getByRole('combobox', { name: 'Run it after' })).toBeVisible();
    await expect(within(sheet).getByRole('combobox', { name: 'Labels' })).toBeVisible();
    await expect(within(sheet).getByRole('button', { name: 'File card' })).toBeDisabled();
    await userEvent.type(within(sheet).getByRole('textbox', { name: 'Title' }), 'Decode the reads');
    await expect(within(sheet).getByRole('button', { name: 'File card' })).toBeEnabled();
  },
};
