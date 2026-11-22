import type { Meta, StoryObj } from '@storybook/react-vite';
import { ActsOn } from './Gate';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A run at its gate, its one step waiting on your word. */
const AT_GATE = runOf(stepOf(CODES.gate, [tryOf(1, CODES.gate, true, null)], true));

/** What a gate's step would act on: here while the result branch is still read, in the shape of its lines. */
const meta: Meta<typeof ActsOn> = {
  title: 'Run/Gate',
  component: ActsOn,
  args: { run: AT_GATE, step: AT_GATE.steps[0] },
  render: (args) => (
    <Unread>
      <div style={{ width: 420 }}>
        <ActsOn {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The branch still read: the shape of what it stands at. */
export const ReadingTheBranch: StoryObj<typeof meta> = { tags: ['network'], play: saysReading('Reading the branch…') };
