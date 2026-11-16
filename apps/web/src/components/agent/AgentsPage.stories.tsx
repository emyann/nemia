import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { agentsQuery } from '@/lib/api/agents';
import { skillsQuery } from '@/lib/api/skills';
import { storeQuery } from '@/lib/api/store';
import { AgentsPage } from './AgentsPage';
import { scribe, skillPlaces, yourStore } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** The Agents page, its reads seeded: your agents, your store's folders and the skills by place. */
const meta: Meta<typeof AgentsPage> = {
  title: 'Pages/Agents',
  component: AgentsPage,
  args: {},
  render: () => (
    <QueryClientProvider
      client={seeded([
        [agentsQuery.queryKey, [scribe]],
        [storeQuery.queryKey, yourStore],
        [skillsQuery.queryKey, skillPlaces],
      ])}
    >
      <Suspense>
        <AgentsPage />
      </Suspense>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof AgentsPage>;

/** One agent of yours, New agent and New skill each a link to its page. */
export const OneAgent: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('link', { name: 'New agent' })).toHaveAttribute('href', '/agents/new');
    await expect(page.getByRole('link', { name: 'New skill' })).toHaveAttribute('href', '/agents/skills/new');
  },
};
