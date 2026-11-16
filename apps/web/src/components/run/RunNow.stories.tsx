import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import type { Run } from 'objects';
import { runViewOf } from '@/lib/api/judged';
import type { ListedRun } from '@/lib/api/runs';
import { NOW_WORDS, PERSON } from '@/lib/words';
import { RunNow } from './RunNow';
import { TARGET_RUNS } from '../../../.storybook/fixtures/runs';

/** The instant the stories' answer was read at. */
const AS_OF = new Date('2026-11-15T18:00:00.000Z');

/** `run` as the list carries one, with no clock. */
const listed = (run: Run): ListedRun => ({ ...runViewOf(run), wallMs: 0, finishedAt: null, clock: null });

/**
 * What a run does now, in marks, as a row of the runs page draws it in its NOW column, 384 pixels wide: one chip naming its step, in
 * the colour of its state, its agent, its round, its words, how many runs wait on it and its budget; its steps' rail under them.
 */
const meta: Meta<typeof RunNow> = {
  title: 'Run/RunNow',
  component: RunNow,
  args: { run: listed(TARGET_RUNS['1sw7']), asOf: AS_OF, waitedBy: 0 },
  render: (args) => (
    <div style={{ width: 384, padding: 16 }}>
      <RunNow {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof RunNow>;

/** The chip drawn in `canvas`: its tone and its word. */
const chipOf = (canvas: HTMLElement) => {
  const chip = canvas.querySelector('[data-now-word]')!;
  return { tone: chip.getAttribute('data-tone'), word: chip.textContent };
};

/** At work: the violet chip, its agent, its round two of three as pips, its budget's ring, and the one run held until it lands. */
export const AtWork: Story = {
  args: { waitedBy: 1 },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'alive', word: 'implement' });
    const now = within(canvasElement);
    await expect(now.getByText('Implementer')).toBeVisible();
    await expect(now.getByRole('img', { name: 'round 2 of 3' })).toBeVisible();
    await expect(now.getByRole('img', { name: 'its step: $2.40 of its $12 cap' })).toBeVisible();
    await expect(now.getByRole('img', { name: 'a run waits on it' })).toHaveTextContent('1');
    await expect(canvasElement.querySelector('[data-budget-ring]')?.getAttribute('data-budget-ring')).toBe('under');
  },
};

/** At work past its step's cap: the ring red, and the words that say so. */
export const OverItsCap: Story = {
  args: { run: listed(TARGET_RUNS.wov8) },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'alive', word: 'review' });
    await expect(canvasElement.querySelector('[data-budget-ring]')?.getAttribute('data-budget-ring')).toBe('over');
    await expect(within(canvasElement).getByText(NOW_WORDS.over('$6'))).toBeVisible();
  },
};

/** Being checked: the violet chip, and the words. */
export const BeingChecked: Story = {
  args: { run: listed(TARGET_RUNS.lgll), waitedBy: 2 },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'alive', word: 'land' });
    await expect(within(canvasElement).getByText(PERSON.checking.rail)).toBeVisible();
  },
};

/** Waiting on a run: the outlined chip, and the run it waits on by its id's end, a link to its page. */
export const WaitsOnARun: Story = {
  args: { run: listed(TARGET_RUNS.onLgll) },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'waits', word: 'land' });
    const link = within(canvasElement).getByRole('link', { name: 'lgll' });
    await expect(link).toHaveAttribute('href', `/runs/${TARGET_RUNS.lgll.metadata.name}`);
  },
};

/** Waiting on the checkout: the outlined chip, and the run whose ending has it by its id's end, a link to its page, then the checkout. */
export const WaitsOnTheCheckout: Story = {
  args: { run: listed(TARGET_RUNS['649a']) },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'waits', word: 'land' });
    const link = within(canvasElement).getByRole('link', { name: 'lgll' });
    await expect(link).toHaveAttribute('href', `/runs/${TARGET_RUNS.lgll.metadata.name}`);
    await expect(within(canvasElement).getByText(NOW_WORDS.theCheckout, { exact: false })).toBeVisible();
  },
};

/** Waiting for a run slot: the outlined chip. */
export const WaitsForASlot: Story = {
  args: { run: listed(TARGET_RUNS.k2rq) },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'waits', word: 'implement' });
    await expect(within(canvasElement).getByText(NOW_WORDS.slot)).toBeVisible();
  },
};

/** Held by a person until a run lands: outlined as a step not started, never grey, the run it waits for a link. */
export const Held: Story = {
  args: { run: listed(TARGET_RUNS.c7un) },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'waits', word: 'design' });
    await expect(within(canvasElement).getByRole('link', { name: '1sw7' })).toBeVisible();
  },
};

/** Waiting on you, its check failed: the yellow chip and the words of what is asked, in yellow. */
export const WaitsOnYou: Story = {
  args: { run: listed(TARGET_RUNS.vqvd) },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'yours', word: 'land' });
    await expect(within(canvasElement).getByText('Shipper')).toBeVisible();
  },
};

/** Failed, waiting on nobody: the chip in the error container. */
export const Failed: Story = {
  args: { run: listed(TARGET_RUNS.f41l) },
  play: async ({ canvasElement }) => {
    await expect(chipOf(canvasElement)).toEqual({ tone: 'failure', word: 'implement' });
    await expect(within(canvasElement).getByText(PERSON.failed.rail)).toBeVisible();
  },
};
