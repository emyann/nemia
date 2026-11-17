import type { Meta, StoryObj } from '@storybook/react-vite';
import { headOf } from '@/lib/stepPart';
import { PartHead } from './PartHead';
import { CODES, NOW, runOf, stepOf, tryOf } from '../../../../.storybook/fixtures/steps';
import { saysReading } from '../../../../.storybook/unread';

/** A run whose one step is at work, its own answer not read yet: the head knows the step from the run's row alone. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** A step's head: here while the step's own answer is read, the shape of its facts. */
const meta: Meta<typeof PartHead> = {
  title: 'Run/PartHead',
  component: PartHead,
  args: { head: headOf({ run: AT_WORK, step: 'design', now: NOW }), size: 'M' },
  render: (args) => (
    <div style={{ width: 360 }}>
      <PartHead {...args} />
    </div>
  ),
};
export default meta;

/** The step still read. */
export const ReadingTheStep: StoryObj<typeof meta> = { play: saysReading('Reading the step…') };
