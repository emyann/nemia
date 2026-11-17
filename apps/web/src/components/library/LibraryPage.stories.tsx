import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { agentSourcesQuery, libraryQuery, type LibraryItem } from '@/lib/api/storeLibrary';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { LibraryPage } from './LibraryPage';

/** One item of the library, the user library's and used by no factory. */
const item = (kind: LibraryItem['kind'], name: string, description: string | null): LibraryItem => ({
  kind,
  name,
  description,
  origin: 'user',
  factories: [],
  builtinChanged: false,
});

/** The library: a skill, an agent, a server, which says nothing of itself, and Nemia's workflow, used by one factory. */
const ITEMS: LibraryItem[] = [
  item('Skill', 'write-a-note', 'Writes the notes of a change.'),
  item('Agent', 'scribe', 'Use this when a change needs its notes written.'),
  item('McpServer', 'github', null),
  { ...item('Workflow', 'quick', 'A card that settles its change, to main.'), origin: 'builtin', factories: ['nemia'] },
];

/** The store's Library, its reads seeded; one story a state of its filter. */
const meta: Meta<typeof LibraryPage> = {
  title: 'Pages/Library',
  component: LibraryPage,
  args: { query: '', onQuery: fn() },
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [libraryQuery().queryKey, ITEMS],
        [agentSourcesQuery().queryKey, []],
      ])}
    >
      <Suspense>
        <LibraryPage {...args} />
      </Suspense>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof LibraryPage>;

/** Unfiltered: each kind under its heading, each item with what it says it is for. */
export const Every: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('searchbox', { name: 'Filter the library' })).toHaveValue('');
    for (const name of ['Skills', 'Agents', 'MCP servers', 'Workflows']) await expect(page.getByRole('region', { name })).toBeVisible();
    await expect(page.getByText('Writes the notes of a change.')).toBeVisible();
  },
};

/** Filtered, by a word two descriptions hold: the two items it keeps, under their kinds alone; each keystroke sent to the address. */
export const Filtered: Story = {
  args: { query: 'notes' },
  play: async ({ canvasElement, args, userEvent }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(page.getByRole('region', { name: 'Skills' })).toBeVisible());
    await expect(page.getByRole('region', { name: 'Agents' })).toBeVisible();
    await expect(page.queryByRole('region', { name: 'MCP servers' })).toBeNull();
    await expect(page.queryByRole('region', { name: 'Workflows' })).toBeNull();
    const field = page.getByRole('searchbox', { name: 'Filter the library' });
    await userEvent.clear(field);
    await userEvent.type(field, 'GIT');
    await expect(args.onQuery).toHaveBeenLastCalledWith('GIT');
    await expect(canvasElement.querySelector('[data-library-item="McpServer.github"]')).not.toBeNull();
    await expect(page.queryByRole('region', { name: 'Skills' })).toBeNull();
  },
};

/** A filter that keeps nothing: the page says so, and Clear the filter brings every kind back and clears the address's. */
export const NothingMatches: Story = {
  args: { query: 'zzz' },
  play: async ({ canvasElement, args, userEvent }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(page.getByText('zzz')).toBeVisible());
    await userEvent.click(page.getByRole('button', { name: 'Clear the filter' }));
    await expect(args.onQuery).toHaveBeenLastCalledWith('');
    await expect(page.getByRole('region', { name: 'Workflows' })).toBeVisible();
  },
};
