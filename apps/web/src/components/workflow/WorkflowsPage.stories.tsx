import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { storeQuery } from '@/lib/api/store';
import { workflowsQuery, type WorkflowListing } from '@/lib/api/workflows';
import { yourStore } from '../../../.storybook/fixtures/agents';
import { listing } from '../../../.storybook/fixtures/factories';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { WorkflowsPage } from './WorkflowsPage';

/** Two workflows of the person's, each said by its first paragraph. */
const YOURS: WorkflowListing[] = ['build', 'quick'].map((name) => ({ ...listing(name), from: 'user', dir: `/store/workflows/${name}` }));

/** The Workflows page with no factory picked, its reads seeded: the person's two workflows; one story a state of its filter. */
const meta: Meta<typeof WorkflowsPage> = {
  title: 'Pages/Workflows',
  component: WorkflowsPage,
  args: { place: {}, query: '', onQuery: fn() },
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [factoriesQuery.queryKey, []],
        [storeQuery.queryKey, yourStore],
        [workflowsQuery.queryKey, YOURS],
      ])}
    >
      <Suspense>
        <WorkflowsPage {...args} />
      </Suspense>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof WorkflowsPage>;

/** Unfiltered: a card for each, under an empty filter. */
export const Every: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('searchbox', { name: 'Filter workflows' })).toHaveValue('');
    await expect(page.getByRole('region', { name: 'Workflow build' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Workflow quick' })).toBeVisible();
  },
};

/** Filtered, by a word of a description in another case: the card it keeps alone; and each keystroke is sent to the address. */
export const Filtered: Story = {
  args: { query: 'INTENT' },
  play: async ({ canvasElement, args, userEvent }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('region', { name: 'Workflow build' })).toBeVisible();
    await expect(page.queryByRole('region', { name: 'Workflow quick' })).toBeNull();
    const field = page.getByRole('searchbox', { name: 'Filter workflows' });
    await userEvent.clear(field);
    await userEvent.type(field, 'qu');
    await expect(args.onQuery).toHaveBeenLastCalledWith('qu');
    await expect(page.getByRole('region', { name: 'Workflow quick' })).toBeVisible();
    await expect(page.queryByRole('region', { name: 'Workflow build' })).toBeNull();
  },
};

/** A filter that keeps nothing: the page says so, and Clear the filter brings every card back and clears the address's. */
export const NothingMatches: Story = {
  args: { query: 'zzz' },
  play: async ({ canvasElement, args, userEvent }) => {
    const page = within(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Clear the filter' }));
    await expect(args.onQuery).toHaveBeenLastCalledWith('');
    await expect(page.getByRole('region', { name: 'Workflow build' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Workflow quick' })).toBeVisible();
  },
};
