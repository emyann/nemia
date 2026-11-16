import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { Run } from 'objects';
import { runViewOf } from '@/lib/api/judged';
import { Chip, Fan, Pips, Ring, RunMark, Words } from './RunMarks';
import { TARGET_RUNS } from '../../../.storybook/fixtures/runs';

/** `run` as the surface has it. */
const viewed = (run: Run) => runViewOf(run);

/** The runs the stories' marks are found among. */
const AMONG = Object.values(TARGET_RUNS).map(viewed);

/** The marks a run says itself by: its chip, its round as pips, its budget's ring, the fan of the runs that wait on it, and its words. */
const meta: Meta = { title: 'Look/RunMarks' };
export default meta;

const ROW = { display: 'flex', alignItems: 'center', gap: 16, padding: 24 } as const;

/** The chip in each tone, small and at its size. */
export const Chips: StoryObj<typeof Chip> = {
  args: { small: false },
  render: (args) => (
    <div style={ROW}>
      {(['alive', 'yours', 'failure', 'waits', 'rest'] as const).map((tone) => (
        <Chip key={tone} {...args} now={{ step: tone, tone }} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tones = [...canvasElement.querySelectorAll('[data-now-word]')].map((chip) => chip.getAttribute('data-tone'));
    await expect(tones).toEqual(['alive', 'yours', 'failure', 'waits', 'rest']);
  },
};

/** The round as pips: one of three, and two of three said in words, in violet and in yellow. */
export const Rounds: StoryObj<typeof Pips> = {
  args: { round: { at: 2, of: 3 }, tone: 'alive', words: true },
  render: (args) => (
    <div style={ROW}>
      <Pips {...args} round={{ at: 1, of: 3 }} words={false} />
      <Pips {...args} />
      <Pips {...args} tone="yours" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getAllByText('round 2 of 3')).toHaveLength(2);
  },
};

/** The budget's ring under its cap, under it with its words, and past it, red and said. */
export const Budgets: StoryObj<typeof Ring> = {
  args: { budget: { spent: 2.4, cap: 12, capSaid: '$12', over: false }, words: true },
  render: (args) => (
    <div style={ROW}>
      <Ring {...args} words={false} />
      <Ring {...args} />
      <Ring {...args} budget={{ spent: 6.3, cap: 6, capSaid: '$6', over: true }} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const rings = [...canvasElement.querySelectorAll('[data-budget-ring]')].map((ring) => ring.getAttribute('data-budget-ring'));
    await expect(rings).toEqual(['under', 'under', 'over']);
    await expect(within(canvasElement).getByText('over its $6')).toBeVisible();
  },
};

/** How many runs wait on this one: one, and six. */
export const Fans: StoryObj<typeof Fan> = {
  args: { count: 6 },
  render: (args) => (
    <div style={ROW}>
      <Fan count={1} />
      <Fan {...args} />
    </div>
  ),
};

/** A run named by its mark, and by the words of a wait: each run named is its mark, in the state of its step now. */
export const Named: StoryObj<typeof Words> = {
  args: { words: ['waits on', { run: TARGET_RUNS.lgll.metadata.name }, '· the checkout'], tone: 'waits', among: AMONG },
  render: (args) => (
    <div style={{ ...ROW, flexDirection: 'column', alignItems: 'flex-start' }}>
      <span>
        The checkout is held by <RunMark id={TARGET_RUNS['1sw7'].metadata.name} run={viewed(TARGET_RUNS['1sw7'])} /> until it lands.
      </span>
      <RunMark id="a-run-the-surface-has-not-q9z0" />
      <Words {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const marks = [...canvasElement.querySelectorAll('[data-run-mark]')].map((mark) => [
      mark.getAttribute('data-run-mark')?.slice(-4),
      mark.querySelector('[data-mark]')?.getAttribute('data-mark'),
    ]);
    await expect(marks).toEqual([
      ['1sw7', 'alive'],
      ['q9z0', 'rest'],
      ['lgll', 'alive'],
    ]);
    await expect(canvasElement.querySelector('[data-run-mark$="lgll"]')).toHaveAttribute('href', `/runs/${TARGET_RUNS.lgll.metadata.name}`);
  },
};
