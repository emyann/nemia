import type { Meta, StoryObj } from '@storybook/react-vite';
import { unread } from '@/lib/following';
import { SessionBody } from './StepPage';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { saysReading } from '../../../.storybook/unread';

/** A step at work, its session started. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** A step's session page, its talk: here while the conversation is first read, the shape of its turns. */
const meta: Meta<typeof SessionBody> = {
  title: 'Run/StepPage',
  component: SessionBody,
  args: { step: AT_WORK.steps[0], following: unread(true), turns: [] },
  render: (args) => (
    <div style={{ width: 720, height: 480, display: 'flex', flexDirection: 'column' }}>
      <SessionBody {...args} />
    </div>
  ),
};
export default meta;

/** The conversation still read. */
export const ReadingTheConversation: StoryObj<typeof meta> = { play: saysReading('Reading the conversation…') };
