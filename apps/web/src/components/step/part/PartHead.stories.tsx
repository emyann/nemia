import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { headOf } from '@/lib/stepPart';
import { PartHead } from './PartHead';
import { CODES, NOW, runOf, stepOf, tryOf, waitNode, waitingTry } from '../../../../.storybook/fixtures/steps';
import { saysReading } from '../../../../.storybook/unread';

/** A run whose one step is at work, its own answer not read yet: the head knows the step from the run's row alone. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** A step's head: here while the step's own answer is read, the shape of its facts. */
const meta: Meta<typeof PartHead> = {
  title: 'Run/PartHead',
  component: PartHead,
  args: { head: headOf({ run: AT_WORK, step: 'design', now: NOW }), size: 'M' },
  render: (args) => (
    <div style={{ width: 360 }}>
      <PartHead {...args} />
    </div>
  ),
};
export default meta;

/** The step still read. */
export const ReadingTheStep: StoryObj<typeof meta> = { play: saysReading('Reading the step…') };

/** A wait node not filed yet, then waiting with each condition written or not, both with the run's own answer read. */
const WAIT_TO_COME = runOf(waitNode(stepOf(CODES.come, [])));
const WAITING = runOf(waitNode(stepOf(CODES.checking, [waitingTry()]), { turn: 'True', ci: 'False', landed: 'Unknown' }));

/** What a wait node's head holds in place of an agent: the conditions in order, each with `words` (null before it is filed), no budget. */
const waitsOn =
  (words: ReadonlyArray<string | null>) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const head = canvasElement.querySelector<HTMLElement>('[data-step-head]')!;
    await expect(head.textContent, 'no agent named').not.toContain('no agent');
    await expect(head.querySelector('[data-step-agent]')).toBeNull();
    await expect(head.querySelector('[data-step-spend]'), 'no budget line').toBeNull();
    const conditions = [...head.querySelectorAll('[data-waits-on]')];
    await expect(conditions.map((c) => c.getAttribute('data-waits-on'))).toEqual(['turn', 'ci', 'landed', 'base-ci']);
    await expect(conditions.map((c) => c.getAttribute('data-condition-word'))).toEqual(words);
  };

/** A wait node not filed yet: the conditions it will wait on, no agent and no budget. */
export const WaitNodeToCome: StoryObj<typeof meta> = {
  args: { head: headOf({ run: WAIT_TO_COME, step: 'land', detail: WAIT_TO_COME, now: NOW }) },
  play: waitsOn([null, null, null, null]),
};

/** A wait node waiting: each condition with the word of what was written for its try, `pending` where nothing was. */
export const WaitNodeWaiting: StoryObj<typeof meta> = {
  args: { head: headOf({ run: WAITING, step: 'land', detail: WAITING, now: NOW }) },
  play: waitsOn(['passed', 'failed', 'unknown', 'pending']),
};
