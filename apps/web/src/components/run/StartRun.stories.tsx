import type { Meta, StoryObj } from '@storybook/react-vite';
import type { WorkflowListing } from '@/lib/api/workflows';
import { StartRun } from './StartRun';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A workflow of one step, as the api lists it. */
const LISTING: WorkflowListing = {
  name: 'build',
  from: 'repo',
  dir: '/code/app/workflows/build',
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

/** The start of a run of a workflow: here while the runs it may wait on are read, the shape of their list. */
const meta: Meta<typeof StartRun> = {
  title: 'Factory/StartRun',
  component: StartRun,
  args: { workflow: LISTING, repo: '/code/app' },
  render: (args) => (
    <Unread>
      <div style={{ width: 560 }}>
        <StartRun {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The runs to wait on still read. */
export const ReadingTheRuns: StoryObj<typeof meta> = { play: saysReading('Reading the runs…') };
