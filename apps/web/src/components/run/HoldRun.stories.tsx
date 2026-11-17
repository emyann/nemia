import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { HoldQuestion } from './HoldRun';
import { noRuns, oneWaits } from '../../../.storybook/fixtures/runs';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A run at work, which a hold may hold. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** A run's Hold…, asked once its menu's press was made: while the runs it may wait on are read, the shape of their list; once read, the runs to tick, and none. */
const meta: Meta<typeof HoldQuestion> = {
  title: 'Run/HoldRun',
  component: HoldQuestion,
  args: { run: AT_WORK, onClose: fn() },
  render: (args) => (
    <Unread>
      <div style={{ width: 480, minHeight: 320 }}>
        <HoldQuestion {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** Asked, the runs still read. */
export const Reading: StoryObj<typeof meta> = {
  play: async (context) => {
    await saysReading('Reading the runs to wait on…')(context);
  },
};

/** Hold…'s form, drawn whole with its reads answered (`parameters.msw`), not under `Unread`. */
const answered = (args: Parameters<typeof HoldQuestion>[0]) => (
  <div style={{ width: 480, minHeight: 520 }}>
    <HoldQuestion {...args} />
  </div>
);

/** Asked on the runs of its repository: the runs to wait on, each a box to tick, one ticked, the why and Hold. */
export const Picks: StoryObj<typeof meta> = {
  parameters: { msw: oneWaits },
  render: answered,
  play: async ({ canvasElement }) => {
    const form = within(canvasElement.ownerDocument.body);
    const boxes = await waitFor(() => {
      const found = form.getAllByRole('checkbox');
      if (!found.length) throw new Error('no run to wait on is offered');
      return found;
    });
    await userEvent.click(boxes[0]);
    await expect(boxes[0]).toBeChecked();
    await expect(form.getByRole('textbox', { name: 'Why (optional)' })).toBeInTheDocument();
    await expect(form.getByRole('button', { name: 'Hold' })).toBeEnabled();
  },
};

/** Asked where no other run of its repository may still land: held until a person lifts it, which the form says. */
export const NoneToWaitOn: StoryObj<typeof meta> = {
  parameters: { msw: noRuns },
  render: answered,
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(canvasElement.ownerDocument.body.querySelector('[data-hold-none]')).not.toBeNull());
    await expect(within(canvasElement.ownerDocument.body).queryAllByRole('checkbox')).toHaveLength(0);
  },
};
