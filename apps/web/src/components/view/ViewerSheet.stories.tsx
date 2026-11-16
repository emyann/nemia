import type { Meta, StoryObj } from '@storybook/react-vite';
import { ViewerSheet } from './ViewerSheet';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The sheet that shows a step's file: here while its run is read, the shape of the file's lines. */
const meta: Meta<typeof ViewerSheet> = {
  title: 'Run/ViewerSheet',
  component: ViewerSheet,
  args: {},
  parameters: { at: '/?bar=run:r-1&view=design/plan.md' },
  render: () => (
    <Unread>
      <p className="text-body-medium">The run's page, under the sheet.</p>
      <ViewerSheet />
    </Unread>
  ),
};
export default meta;

/** The run still read. */
export const ReadingTheRun: StoryObj<typeof meta> = { play: saysReading('Reading the run…') };
