import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { RunMeta } from './RunMeta';

/** What a run is, in the quiet line under its title: its id's end, its factory and workflow as a path, and its own labels. */
const meta: Meta<typeof RunMeta> = {
  title: 'Run/RunMeta',
  component: RunMeta,
  args: {
    run: {
      id: 'board-the-parts-page-goes-5zt1',
      factory: 'nemia',
      workflowDir: '/code/nemia/workflows/quick',
      labels: { factory: 'nemia', workflow: 'quick', area: 'board', initiative: 'visual', work: 'feature' },
    },
  },
  render: (args) => (
    <div style={{ width: 640, padding: 16 }}>
      <RunMeta {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof RunMeta>;

/** A run with labels of its own: each value alone, the store's keys said by the path, never as labels. */
export const WithLabels: Story = {
  play: async ({ canvasElement }) => {
    const line = within(canvasElement);
    await expect(line.getByText('5zt1')).toBeVisible();
    await expect(line.getByText('nemia')).toBeVisible();
    await expect(line.getByText('quick')).toHaveAttribute('title', '/code/nemia/workflows/quick');
    await expect(line.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'area=board',
      'initiative=visual',
      'work=feature',
    ]);
    await expect(canvasElement.querySelector('[data-tag-mark]')).not.toBeNull();
  },
};

/** A run with no labels of its own: the id and the path alone, no divider and no mark. */
export const NoLabels: Story = {
  args: { run: { id: 'r-k2rq', factory: null, workflowDir: '/code/app/workflows/build', labels: { workflow: 'build' } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('default')).toBeVisible();
    await expect(canvasElement.querySelector('[data-tag-mark]')).toBeNull();
    await expect(within(canvasElement).queryAllByRole('link')).toHaveLength(0);
  },
};

/** A finished run's line: its workflow a link to its page, here the Workflows page, the api giving none. */
export const LinkedWorkflow: Story = {
  args: { workflowPage: null },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('link', { name: 'quick' })).toHaveAttribute('href', '/workflows');
  },
};
