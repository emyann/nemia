import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { runViewOf } from '@/lib/api/judged';
import { RunClock, RunCost } from './RunFigures';
import { TARGET_RUNS } from '../../../.storybook/fixtures/runs';

/** The instant the stories' answer was read at. */
const AS_OF = new Date('2026-11-15T18:00:00.000Z');

/** 1sw7 as the list carries it, no breakdown of its clock read. */
const listed = () => ({ ...runViewOf(TARGET_RUNS['1sw7']), wallMs: 0, finishedAt: null, clock: null });

/** A run's clock and cost, as the runs tables and the run part say them: each a button over its breakdown, or plain words without one. */
const meta: Meta = { title: 'Look/RunFigures' };
export default meta;

const ROW = { display: 'flex', alignItems: 'center', gap: 32, padding: 24 } as const;

/** The clock, with no breakdown to open, and the cost with no tokens: plain words that take no focus. */
export const Plain: StoryObj<typeof RunClock> = {
  args: { run: listed(), asOf: AS_OF, finished: false },
  render: (args) => (
    <div style={ROW}>
      <RunClock {...args} />
      <RunCost run={{ ...listed(), tokens: null }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryAllByRole('button')).toHaveLength(0);
    await expect(within(canvasElement).getByText('$4.12')).toBeVisible();
  },
};

/** The clock smaller, as a card at md draws it. */
export const Small: StoryObj<typeof RunClock> = {
  args: { run: listed(), asOf: AS_OF, finished: false, className: 'text-body-small' },
  render: (args) => (
    <div style={ROW}>
      <RunClock {...args} />
    </div>
  ),
};
