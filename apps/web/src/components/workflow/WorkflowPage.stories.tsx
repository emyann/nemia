import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { factoriesQuery } from '@/lib/api/factories';
import { workflowsQuery, type WorkflowListing } from '@/lib/api/workflows';
import { listing } from '../../../.storybook/fixtures/factories';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { WorkflowPage } from './WorkflowPage';

/** A workflow of the person's own, with no step yet. */
const TRIAGE: WorkflowListing = { ...listing('triage'), from: 'user', dir: '/home/you/.agent-workflows/workflows/triage' };

/** A workflow's page, one story a state: one of the person's own, which the kit's Build opens in its builder, and one not listed. */
const meta: Meta<typeof WorkflowPage> = {
  title: 'Pages/Workflow',
  component: WorkflowPage,
  args: { from: 'user', name: 'triage', address: {}, building: false },
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [factoriesQuery.queryKey, []],
        [workflowsQuery.queryKey, [TRIAGE]],
      ])}
    >
      <div style={{ width: 880 }}>
        <WorkflowPage {...args} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof WorkflowPage>;

/** One of yours: its folder, and the kit's small outlined Build beside Remove…. */
export const Yours: Story = {
  play: async ({ canvasElement }) => {
    const build = within(canvasElement).getByRole('button', { name: 'Build' });
    await expect(build).toHaveAttribute('data-variant', 'outlined');
  },
};

/** A name no workflow has: said not listed. */
export const NotListed: Story = {
  args: { name: 'nowhere' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Build' })).toBeNull();
  },
};
