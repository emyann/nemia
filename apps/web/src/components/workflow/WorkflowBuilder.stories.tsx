import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import type { WorkflowListing } from '@/lib/api/workflows';
import { WorkflowBuilder } from './WorkflowBuilder';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A workflow of one step, as the api lists it. */
const LISTING: WorkflowListing = {
  name: 'build',
  from: 'repo',
  dir: '/code/app/flow',
  description: 'Build a card.',
  readme: null,
  steps: [],
  graph: { roots: [], edges: [] },
  schemas: [],
  folderTeam: false,
  version: '1',
  error: null,
  unfilled: null,
};

/** The workflow builder: here while the keys a step may set are read, the shape of the step's fields beside its graph. */
const meta: Meta<typeof WorkflowBuilder> = {
  title: 'Factory/WorkflowBuilder',
  component: WorkflowBuilder,
  args: { workflow: LISTING, onClose: fn() },
  render: (args) => (
    <Unread>
      <div style={{ width: 960, height: 560 }}>
        <WorkflowBuilder {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The keys still read. */
export const ReadingTheKeys: StoryObj<typeof meta> = { play: saysReading('Reading the keys a step may set…') };
