import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { atRest, tipOf } from '../../../.storybook/play';
import { QuietLabels, RunMeta } from './RunMeta';

/** What a run is, in the quiet line under its title: its id's end, its factory and workflow as a path, and its own labels. */
const meta: Meta<typeof RunMeta> = {
  title: 'Look/RunMeta',
  component: RunMeta,
  args: {
    run: {
      id: 'board-the-parts-page-goes-5zt1',
      factory: 'nemia',
      workflowDir: '/code/acme/flows/quick',
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
  play: async ({ canvasElement, userEvent }) => {
    const line = within(canvasElement);
    await expect(line.getByText('5zt1')).toBeVisible();
    await expect(line.getByText('nemia')).toBeVisible();
    await expect(await tipOf(userEvent, line.getByText('quick')), "the workflow's folder whole in the kit's tooltip").toHaveTextContent(
      '/code/acme/flows/quick',
    );
    await expect(canvasElement.querySelector('[title]')).toBeNull();
    await expect(line.getAllByRole('link').map((link) => link.getAttribute('aria-label'))).toEqual([
      'area=board',
      'initiative=visual',
      'work=feature',
    ]);
    await expect(canvasElement.querySelector('[data-tag-mark]')).not.toBeNull();
    atRest();
  },
};

/** A run with no labels of its own: the id and the path alone, no divider and no mark. */
export const NoLabels: Story = {
  args: { run: { id: 'r-k2rq', factory: null, workflowDir: '/code/acme/flows/build', labels: { workflow: 'build' } } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('default')).toBeVisible();
    await expect(canvasElement.querySelector('[data-tag-mark]')).toBeNull();
    await expect(within(canvasElement).queryAllByRole('link')).toHaveLength(0);
  },
};

/** A finished run's line: its workflow a link to its page, here the Workflows page, the api giving none. */
export const LinkedWorkflow: Story = {
  args: { workflowPage: null },
  play: async ({ canvasElement, userEvent }) => {
    const link = within(canvasElement).getByRole('link', { name: 'quick' });
    await expect(link).toHaveAttribute('href', '/workflows');
    await expect(await tipOf(userEvent, link)).toHaveTextContent('/code/acme/flows/quick');
    atRest();
  },
};

/** A run's own labels, quiet: each value alone, a link to its label page, its key in the tooltip; the store's keys left out. */
export const Quiet: StoryObj<typeof QuietLabels> = {
  args: { labels: { factory: 'acme', workflow: 'build', team: 'core', size: 'wide' } },
  render: (args) => (
    <div style={{ maxWidth: 640, padding: 24 }}>
      <QuietLabels {...args} />
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const box = within(canvasElement);
    const team = box.getByRole('link', { name: 'team=core' });
    await expect(team).toHaveTextContent(/^core$/);
    await expect(team).toHaveAttribute('href', '/labels/team/core');
    await expect(box.getByRole('link', { name: 'size=wide' })).toHaveAttribute('href', '/labels/size/wide');
    await expect(box.queryByText('acme')).toBeNull();
    await expect(box.queryByText(/team=/)).toBeNull();
    await userEvent.tab();
    await expect(await within(canvasElement.ownerDocument.body).findByRole('tooltip')).toHaveTextContent('size=wide');
  },
};
