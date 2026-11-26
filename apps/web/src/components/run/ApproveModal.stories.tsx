import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Run } from 'objects';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { agentsQuery } from '@/lib/api/agents';
import { runLinesQuery, runObjectQuery, stepToldQuery, stepTriesQuery } from '@/lib/api/run';
import { stepStamp } from '@/lib/lifecyclePath';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { linesOf, TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { ApproveAction } from './ApproveModal';

/** A run of the targets whose first step waits at its approval's gate. */
const AT_ITS_GATE: Run = {
  ...TARGET_RUNS['1sw7'],
  status: {
    ...TARGET_RUNS['1sw7'].status,
    steps: TARGET_RUNS['1sw7'].status.steps.map((step, i) =>
      i === 0 ? { ...step, phase: 'waiting', reason: 'AwaitingApproval', message: 'awaiting approval' } : step,
    ),
  },
};

/** The run's id, and the step that waits. */
const ID = AT_ITS_GATE.metadata.name;
const GATED = AT_ITS_GATE.status.steps[0];

/**
 * A waiting card's `Approve <step>` and the modal it opens: the step's part at M, read from the run's answers, seeded. The gate's own
 * Approve and Send back are the e2e page's, which answers them against the api.
 */
const meta: Meta<{ step: string }> = {
  title: 'Run/ApproveModal',
  tags: ['network', 'overlay'],
  args: { step: GATED.name },
  render: ({ step }) => (
    <QueryClientProvider
      client={seeded([
        [runObjectQuery(ID).queryKey, AT_ITS_GATE],
        [runLinesQuery(ID).queryKey, linesOf(ID)],
        ...AT_ITS_GATE.status.steps.flatMap((s) => [
          [stepTriesQuery(ID, s.name, stepStamp(s)).queryKey, []] as const,
          [stepToldQuery(ID, s.name, stepStamp(s)).queryKey, null] as const,
        ]),
        [agentsQuery.queryKey, []],
      ])}
    >
      <div style={{ height: 720 }}>
        <ApproveAction run={{ id: ID }} step={step} />
      </div>
    </QueryClientProvider>
  ),
};
export default meta;

/** The button alone, named for the step that waits. */
export const Button: StoryObj<{ step: string }> = {
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('button', { name: `Approve ${args.step}` })).toBeVisible();
  },
};

/** A press opens the modal over the page, named for the step, holding the step's part and its Close button. */
export const Open: StoryObj<{ step: string }> = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: `Approve ${args.step}` }));
    const dialog = await waitFor(() => within(document.body).getByRole('dialog', { name: `Approve ${args.step}` }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Close' })).toBeVisible());
    await waitFor(() => expect(dialog.querySelector('[data-step-part="M"]')).not.toBeNull());
  },
};
