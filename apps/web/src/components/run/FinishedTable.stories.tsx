import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, waitFor } from 'storybook/test';
import { finishedOf } from '@/lib/api/runs';
import { titleOf } from '@/lib/factory';
import { finishedList, linesOf, TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { rowOpens, standing, tipInRow } from '../../../.storybook/play';
import { FinishedTable } from './FinishedTable';

/** The first page of the finished runs, five of 123, an older page after it. */
const PAGE = finishedOf(finishedList);

/** A page of the finished runs, the kit's dense table in the look's cut frame over its pager: each row opens its run, as its title does. */
const meta: Meta<typeof FinishedTable> = {
  title: 'Run/FinishedTable',
  component: FinishedTable,
  args: { page: PAGE, trail: [] },
  tags: ['network'],
  parameters: { msw: [http.get('/api/runs/:name/lines', ({ params }) => HttpResponse.json(linesOf(String(params.name))))] },
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

/** The first page with its first run's title made short enough to read whole in its column. */
const SHORT_FIRST = { ...PAGE, runs: PAGE.runs.map((run, at) => (at === 0 ? { ...run, brief: 'board: a short title' } : run)) };

/**
 * A run's title in the kit's tooltip only where it is cut, beside its words: at a narrow width, a short title reached by the keyboard is
 * described by nothing, and a long one cut to its column opens the whole title, its box touching the title's words.
 */
export const TitleTips: Story = {
  args: { page: SHORT_FIRST },
  render: (args) => (
    <div style={{ width: 760 }}>
      <FinishedTable {...args} />
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const [short, long] = [...canvasElement.querySelectorAll<HTMLElement>('tr[data-run]')];
    const whole = short.querySelector<HTMLElement>('a[href^="/runs/"]')!;
    await userEvent.tab();
    short.focus();
    for (let i = 0; i < 20 && document.activeElement !== whole; i += 1) await userEvent.keyboard('{ArrowRight}');
    await expect(document.activeElement, 'the short title is reached').toBe(whole);
    await expect(whole, 'a title that reads whole is described by nothing').not.toHaveAttribute('aria-describedby');
    await expect(document.querySelectorAll('[role="tooltip"]'), 'a title that reads whole opens no tooltip').toHaveLength(0);
    const cut = long.querySelector<HTMLElement>('a[href^="/runs/"]')!;
    const tip = await tipInRow(userEvent, long, cut);
    await expect(tip, 'the whole title').toHaveTextContent(titleOf(PAGE.runs[1]));
    const words = cut.getBoundingClientRect();
    const box = tip.getBoundingClientRect();
    await expect(box.bottom, 'the tooltip sits just over the title').toBeGreaterThan(words.top - 16);
    await expect(box.bottom).toBeLessThanOrEqual(words.top + 1);
    await expect(box.right, 'the tooltip overlaps the title’s words across').toBeGreaterThan(words.left);
    await expect(box.left).toBeLessThan(words.right);
  },
};
