import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { runViewOf } from '@/lib/api/judged';
import { nowOf } from '@/lib/runWords';
import { Facts, PanelFoot, RunsWaiting } from './RunPanel';
import { READS, TARGET_RUNS } from '../../../.storybook/fixtures/runs';

/** The instant the stories' answer was read at. */
const AS_OF = new Date('2026-11-15T18:00:00.000Z');

/** The runs the panels' runs are found among. */
const AMONG = Object.values(TARGET_RUNS).map((run) => runViewOf(run));

/** A target run as the surface has it. */
const RUN = (four: '1sw7' | '72wy' | 'vqvd') => runViewOf(TARGET_RUNS[four]);

/** What the run's panel adds under its graph, apart: the facts, the runs it waits on and that wait on it, and its foot. */
const meta: Meta<typeof Facts> = {
  title: 'Look/RunPanel',
  component: Facts,
  render: (args) => (
    <div style={{ width: 440, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Facts {...args} />
      <RunsWaiting run={args.run} among={AMONG} className="flex flex-col gap-2" />
      <PanelFoot run={args.run} step={nowOf(args.run)?.step ?? null} read={READ[args.run.id] ?? null} className="flex items-center gap-4" />
    </div>
  ),
};
export default meta;

/** Each panel's run read alone, by its whole id. */
const READ: Record<string, (typeof READS)[keyof typeof READS]> = {
  [TARGET_RUNS['1sw7'].metadata.name]: READS['1sw7'],
  [TARGET_RUNS['72wy'].metadata.name]: READS['72wy'],
  [TARGET_RUNS.vqvd.metadata.name]: READS.vqvd,
};

type Story = StoryObj<typeof Facts>;

/** The facts as a grid of four. */
const GRID = 'grid grid-cols-4 gap-4';

/** At work: the clock with its start, the cost against the step's budget, the gates, the run that waits on it, its last line. */
export const AtWork: Story = {
  args: { run: RUN('1sw7'), now: nowOf(RUN('1sw7')), clock: '1h 02m', asOf: AS_OF, className: GRID },
  play: async ({ canvasElement }) => {
    const box = within(canvasElement);
    await expect(box.getByText('step $2.40 of $12')).toBeVisible();
    await expect(box.getByText('design approved')).toBeVisible();
    await expect(canvasElement.querySelector('[data-runs="Waited on by"] [data-run-mark]')).toHaveAttribute(
      'data-run-mark',
      TARGET_RUNS.c7un.metadata.name,
    );
    await expect(box.getByText('npx tsrs --noEmit -p apps/cli')).toBeVisible();
  },
};

/** Waiting on you for answers: the gate that waits on you, no run either way, and the line its session ended on. */
export const AnswersAsked: Story = {
  args: { run: RUN('72wy'), now: nowOf(RUN('72wy')), clock: 'waited 5m', asOf: AS_OF, className: GRID },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('design waits on you')).toBeVisible();
    await expect(within(canvasElement).getAllByText('no run')).toHaveLength(2);
    await expect(within(canvasElement).getByText('signed off: 4 questions for you')).toBeVisible();
  },
};

/** Waiting on you to decide, its land failed: no gates, and its check's last line. */
export const Decides: Story = {
  args: { run: RUN('vqvd'), now: nowOf(RUN('vqvd')), clock: 'waited 6m', asOf: AS_OF, className: GRID },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('none')).toBeVisible();
    await expect(within(canvasElement).getByText('check: landing.ts receipt — exit 1')).toBeVisible();
  },
};
