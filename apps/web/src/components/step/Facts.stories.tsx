import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { StepFiledView, StepSpecView } from '@/lib/api/judged';
import { Facts, specRows } from './Facts';

/**
 * A step's facts as the run's step page lists them (`specRows`): what its workflow says beside what the engine filed its current try
 * with. Each story here is one state of its memory row: what its session asks of the machine, its limit, and the peak it reached.
 */
const meta: Meta = { title: 'Run/Facts' };
export default meta;

const MI = 1024 ** 2;
const GI = 1024 * MI;

/** A local step whose workflow sets none of what the engine files. */
const SPEC: StepSpecView = {
  harness: null,
  model: null,
  effort: null,
  context: null,
  after: ['design'],
  place: null,
  resume: null,
  fence: null,
  sandbox: null,
  tools: null,
  deadlineSeconds: null,
  loop: null,
  rounds: null,
};

/** What the engine filed the try with, its memory as given. */
const filed = (memory: StepFiledView['memory']) =>
  ({
    model: 'opus',
    askedModel: null,
    memory,
    effort: 'high',
    contextTokens: null,
    fence: 'auto',
    runsIn: { mode: 'auto', by: 'filed' },
    tools: null,
    deadlineSeconds: 3600,
    remote: null,
    bridge: null,
  }) satisfies StepFiledView;

type Args = { memory: StepFiledView['memory'] };

const render = ({ memory }: Args) => (
  <div style={{ maxWidth: 560 }}>
    <Facts rows={specRows(SPEC, filed(memory))} />
  </div>
);

/** A light step's session, asking 1Gi under the daemon's 6Gi limit, peaked well within what it asks. */
export const PeakedWithinItsAsk: StoryObj<Args> = {
  args: { memory: { request: '1Gi', limit: '6Gi', askedBytes: GI, peakBytes: 812 * MI, peakLimitBytes: 6 * GI } },
  render,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('asks 1Gi · limit 6Gi · peaked 812Mi')).toBeTruthy();
  },
};

/** A session that asked 2Gi and peaked past it, at 5.8Gi: said apart, in the failure ink. */
export const PeakedAboveItsAsk: StoryObj<Args> = {
  args: { memory: { request: '2Gi', limit: '8Gi', askedBytes: 2 * GI, peakBytes: 5.8 * GI, peakLimitBytes: 8 * GI } },
  render,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(', above what it asks')).toBeTruthy();
  },
};

/** A session run under a limit alone, whose peak the kernel did not keep. */
export const PeakNotMeasured: StoryObj<Args> = {
  args: { memory: { request: null, limit: '4Gi', askedBytes: 4 * GI, peakBytes: null, peakLimitBytes: null } },
  render,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('limit 4Gi · peak not measured')).toBeTruthy();
  },
};
