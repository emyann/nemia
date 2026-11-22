import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { finishedOf } from '@/lib/api/runs';
import { finishedList, TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { rowOpens, standing } from '../../../.storybook/play';
import { FinishedTable } from './FinishedTable';

/** The first page of the finished runs, five of 123, an older page after it. */
const PAGE = finishedOf(finishedList);

/** A page of the finished runs, the kit's dense table in the look's cut frame over its pager: each row opens its run, as its title does. */
const meta: Meta<typeof FinishedTable> = {
  title: 'Run/FinishedTable',
  component: FinishedTable,
  args: { page: PAGE, trail: [] },
  render: (args) => (
    <div style={{ width: 1100 }}>
      <FinishedTable {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof FinishedTable>;

/**
 * Five finished runs: a press on a label inside a row follows the label, not the row; the pointer on the last row, the one at the cut
 * frame's foot over the pager, lights it, and Enter opens its run.
 */
export const OnePage: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const id = TARGET_RUNS.x57v.metadata.name;
    const row = canvasElement.querySelector<HTMLElement>(`tr[data-run="${id}"]`)!;
    const label = row.querySelector<HTMLElement>('[data-label="area=board"]')!;
    await userEvent.click(label);
    await waitFor(() => expect(standing(row), 'the label is followed, not the row').toBe('/labels/area/board'));
    await userEvent.unhover(label);
    await rowOpens(userEvent, row, `/runs/${id}`);
  },
};
