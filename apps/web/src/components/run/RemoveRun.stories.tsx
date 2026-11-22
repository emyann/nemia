import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { SnackbarRegion } from '@/components/ui/ds';
import { TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { snackbarShown } from '../../../.storybook/play';
import { RemoveRun } from './RemoveRun';

/** Remove, asked once a menu's Remove… was pressed: Remove removes, and the frame's snackbar says so; Keep it closes the question. */
const meta: Meta<typeof RemoveRun> = {
  title: 'Run/RemoveRun',
  component: RemoveRun,
  args: { id: 'try-scribe-notes-c3d4', onClose: fn() },
  render: (args) => (
    <div style={{ width: 400 }}>
      <RemoveRun {...args} />
    </div>
  ),
};
export default meta;

/** Asked: the question, Remove and Keep it, which closes it. */
export const Asking: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('button', { name: 'Remove' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Keep it' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/** Pressed through: the try is removed, the question closes, and the snackbar the frame hosts names the run removed. */
export const Removed: StoryObj<typeof meta> = {
  tags: ['network'],
  parameters: {
    msw: [
      http.get('/api/runs/:name', () => HttpResponse.json(TARGET_RUNS.x57v)),
      http.delete('/api/namespaces/:namespace/runs/:name', ({ params }) =>
        HttpResponse.json({ id: String(params.name), removed: true, engine: null }),
      ),
    ],
  },
  render: (args) => (
    <div style={{ width: 400, minHeight: 160 }}>
      <RemoveRun {...args} />
      <SnackbarRegion />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(await within(canvasElement).findByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(args.onClose).toHaveBeenCalled());
    const said = await snackbarShown(canvasElement.ownerDocument.body);
    await expect(said).toHaveTextContent(args.id);
    await expect(within(said).queryByRole('button', { name: 'Undo' })).toBeNull();
  },
};
