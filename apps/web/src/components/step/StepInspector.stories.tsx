import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { unread } from '@/lib/following';
import { ActivityTail } from './StepInspector';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';

/** A step at work, its session started: what the bar follows. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** The step bar's Activity: the tail of a step's conversation, here while it is first read, in the shape of its turns. */
const meta: Meta<typeof ActivityTail> = {
  title: 'Run/StepInspector',
  component: ActivityTail,
  args: { run: AT_WORK, step: AT_WORK.steps[0], following: unread(true) },
  render: (args) => (
    <div style={{ width: 420, height: 480, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <ActivityTail {...args} />
    </div>
  ),
};
export default meta;

/** Its conversation not read yet: the skeleton of its turns, and a screen reader told it is read. */
export const Reading: StoryObj<typeof ActivityTail> = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent('Reading its conversation…');
    await expect(within(canvasElement).queryByText('Not running, so not followed.')).toBeNull();
  },
};
