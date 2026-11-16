import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { LabelTags, Labels, QuietLabels } from './Labels';

/** A run's labels: as a row's tags, and edited on its page, the store's `factory` and `workflow` shown and never removed. */
const meta: Meta = { title: 'Run/Labels' };
export default meta;

const BOX = { maxWidth: 640, padding: 24 };
const MAP = { factory: 'acme', workflow: 'build', team: 'core', size: 'wide' };

export const Tags: StoryObj = {
  render: () => (
    <div style={BOX}>
      <LabelTags labels={MAP} />
    </div>
  ),
};

/** A run's own labels, quiet: each value alone, a link to its label page, its key in the tooltip; the store's keys left out. */
export const Quiet: StoryObj<typeof QuietLabels> = {
  args: { labels: MAP },
  render: (args) => (
    <div style={BOX}>
      <QuietLabels {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
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

export const Edited: StoryObj = {
  render: () => (
    <div style={BOX}>
      <Labels labels={MAP} edit={() => Promise.resolve()} />
    </div>
  ),
};

/** Add a changed value: the api's refusal is said under the field. */
export const Refused: StoryObj = {
  render: () => (
    <div style={BOX}>
      <Labels labels={MAP} edit={() => Promise.reject(new Error('team is core: pass overwrite to change it to web'))} />
    </div>
  ),
};
