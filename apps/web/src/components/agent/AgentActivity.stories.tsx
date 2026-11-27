import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import type { AtWorkRow } from '@/lib/atWork';
import { ActivityLine, WorkingSection } from './AgentActivity';

const row = (run: string, title: string, minutes: number, round = 1) =>
  ({ agent: 'reviewer', run, title, workflow: 'quick', step: 'review', try: 1, round, minutes }) satisfies AtWorkRow;

const rows = [row('r-1a2b-9c3d', 'Approve modal uses the step', 14), row('r-4e5f-p7q8', 'Feed reads from a cursor', 6, 2)];

/** What an agent is doing now, in the line under its description, and the list of its sessions where several are at work. */
const meta: Meta<typeof ActivityLine> = {
  title: 'Frame/Agent activity',
  component: ActivityLine,
  args: { activity: { kind: 'none' }, endedAgo: '51 minutes ago' },
  render: (args) => (
    <div className="space-y-6">
      <ActivityLine {...args} />
      <WorkingSection activity={args.activity} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof ActivityLine>;

/** Nothing at work: it says so, and when its last session ended. */
export const None: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/Not working now\./)).toBeVisible();
  },
};

/** One session: the run it works on as a link, and where its step is. */
export const One: Story = {
  args: { activity: { kind: 'one', row: rows[0] } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole('link', { name: 'Approve modal uses the step' })).toBeVisible());
  },
};

/** Several sessions: the line counts them, and the Working list names each. */
export const Many: Story = {
  args: { activity: { kind: 'many', rows } },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText('2 sessions at once')).toBeVisible());
    await expect(canvasElement.querySelectorAll('[data-working-row]')).toHaveLength(2);
  },
};
