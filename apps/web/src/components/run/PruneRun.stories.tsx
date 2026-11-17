import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { SnackbarRegion } from '@/components/ui/ds';
import { PruneQuestion } from './PruneRun';
import { TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { CODES, NOW, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { snackbarShown } from '../../../.storybook/play';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A run that ended, its worktrees still on disk: one a prune is offered on. */
const ENDED = runOf(stepOf(CODES.done, [tryOf(1, CODES.done, true, null)]));

/**
 * A run's Prune…, asked once its menu's press was made: while whether it was merged is read, the shape of its form; and, for a run
 * called off, the form itself; and, pruned, the frame's snackbar that says so.
 */
const meta: Meta<typeof PruneQuestion> = {
  title: 'Run/PruneRun',
  component: PruneQuestion,
  args: { run: ENDED, onClose: fn() },
  render: (args) => (
    <Unread>
      <div style={{ width: 480, minHeight: 320 }}>
        <PruneQuestion {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** Asked, whether it was merged still read. */
export const Reading: StoryObj<typeof meta> = {
  play: async (context) => {
    await saysReading('Reading whether it was merged…')(context);
  },
};

/** A run called off, its worktrees still on disk: nobody has anything to decide of it, so its form reads nothing first. */
const CALLED_OFF = { ...ENDED, status: 'cancelled' as const, cancelledAt: NOW.toISOString() };

/** Asked on a run called off: what to give back, a choice each, the first chosen; then Prune… asks, in words that say what goes. */
export const Choices: StoryObj<typeof meta> = {
  args: { run: CALLED_OFF },
  render: (args) => (
    <div style={{ width: 480, minHeight: 520 }}>
      <PruneQuestion {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const form = within(canvasElement);
    const choices = await form.findAllByRole('radio');
    await expect(choices[0]).toBeChecked();
    await userEvent.click(form.getByRole('button', { name: 'Prune…' }));
    await expect(form.getByRole('button', { name: 'Prune' })).toBeEnabled();
  },
};

/** Pruned with nothing left behind: the form closes, and the snackbar the frame hosts names the run pruned. */
export const Pruned: StoryObj<typeof meta> = {
  args: { run: CALLED_OFF },
  parameters: {
    msw: [
      http.get('/api/runs/:name', () => HttpResponse.json(TARGET_RUNS.x57v)),
      http.post('/api/namespaces/:namespace/runs/:name/prune', ({ params }) =>
        HttpResponse.json({ id: String(params.name), pruned: true, lines: [], worktrees: [], artifacts: null, left: [] }),
      ),
    ],
  },
  render: (args) => (
    <div style={{ width: 480, minHeight: 520 }}>
      <PruneQuestion {...args} />
      <SnackbarRegion />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    const form = within(canvasElement);
    await userEvent.click(await form.findByRole('button', { name: 'Prune…' }));
    await userEvent.click(await form.findByRole('button', { name: 'Prune' }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    await expect(await snackbarShown(canvasElement.ownerDocument.body)).toHaveTextContent(args.run.id);
  },
};
