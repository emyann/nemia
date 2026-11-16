import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { agentQuery } from '@/lib/api/agents';
import { skillsQuery } from '@/lib/api/skills';
import { AgentPage } from './AgentPage';
import { critic, scribe, skillPlaces } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/**
 * An agent's page, its reads seeded: the agent at its origin and the skills it can be given.
 *
 * Theirs warns on axe only (`todo`): a read-only agent's instructions are drawn as markdown whose `##` is an `h4` under the page's
 * `h1` (`heading-order`), on the page as here; that is the page's outline to mend.
 */
const meta: Meta<typeof AgentPage> = {
  title: 'Pages/Agent',
  component: AgentPage,
  args: { from: 'user', name: 'scribe', place: {} },
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [agentQuery('user', 'scribe').queryKey, scribe],
        [agentQuery('repo', 'critic').queryKey, critic],
        [skillsQuery.queryKey, skillPlaces],
      ])}
    >
      <Suspense>
        <AgentPage {...args} />
      </Suspense>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof AgentPage>;

/** Yours: its form, Try it, and Remove, asked twice. */
export const Yours: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Remove…' }));
    await expect(page.getByRole('button', { name: 'Remove' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Keep it' })).toBeVisible();
  },
};

/** The repository's: read-only, and copied to yours to be tried. */
export const Theirs: Story = { args: { from: 'repo', name: 'critic' }, parameters: { a11y: { test: 'todo' } } };
