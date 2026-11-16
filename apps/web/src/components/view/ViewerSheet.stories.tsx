import type { Meta, StoryObj } from '@storybook/react-vite';
import { TextFile, ViewerSheet } from './ViewerSheet';
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

/** The run read and the file opened, its text still read. */
export const ReadingTheFile: StoryObj<typeof meta> = {
  render: () => (
    <Unread>
      <div style={{ width: 640 }}>
        <TextFile
          viewer="markdown"
          file={{
            path: '/wf/runs/r-1/artifacts/design/plan.md',
            relativePath: 'plan.md',
            name: 'plan.md',
            url: '/api/runs/r-1/steps/design/artifacts/plan.md',
            kind: 'text',
            size: 2_048,
          }}
        />
      </div>
    </Unread>
  ),
  play: saysReading('Reading plan.md…'),
};
