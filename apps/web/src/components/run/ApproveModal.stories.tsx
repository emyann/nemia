import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { ApproveAction } from './ApproveModal';
import { RUN } from './approve.fixture';
import { Unread } from '../../../.storybook/unread';

/**
 * A waiting card's `Approve <step>` and the modal it opens: the step's part, read once it opens. Here the run is still read, so the
 * modal holds the shape of what is coming; the whole gate, with its summary, Approve and Send back, is the e2e page's.
 */
const meta: Meta = {
  title: 'Run/ApproveModal',
  tags: ['network', 'overlay'],
  render: () => (
    <Unread>
      <ApproveAction run={RUN} step="land" />
    </Unread>
  ),
};
export default meta;

/** The button alone, named for the step that waits. */
export const Button: StoryObj = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Approve land' })).toBeVisible();
  },
};

/** A press opens the modal over the page, named for the step, with its Close button. */
export const Open: StoryObj = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Approve land' }));
    const dialog = await waitFor(() => within(document.body).getByRole('dialog', { name: 'Approve land' }));
    await expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible();
  },
};
