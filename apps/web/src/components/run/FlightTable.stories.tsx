import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { judged, type UnjudgedRun } from '@/lib/api/judged';
import { openOf } from '@/lib/api/runs';
import { inFlightList, TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { rowOpens, standing } from '../../../.storybook/play';
import { FlightTable } from './FlightTable';

/** The runs in flight when nothing waits on you, as the page reads them: lgll being checked and two waiting on its checkout. */
const OPEN = openOf(inFlightList);

/** A run the list could not judge, its journal unread: a row of its own, under the judged ones. */
const UNJUDGED: UnjudgedRun = {
  id: 'board-a-run-whose-journal-is-torn-u9tn',
  factory: 'nemia',
  unjudged: 'its journal could not be read: run nemia doctor',
};

/** The judged runs every row's words can name. */
const AMONG = OPEN.inFlight.filter((run) => judged(run));

/** The runs in flight, the kit's dense table in the look's cut frame: each row opens its run, as its title does. */
const meta: Meta<typeof FlightTable> = {
  title: 'Run/FlightTable',
  component: FlightTable,
  args: { runs: [...OPEN.inFlight, UNJUDGED], among: AMONG, asOf: new Date(OPEN.asOf) },
  render: (args) => (
    <div style={{ width: 1100 }}>
      <FlightTable {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof FlightTable>;

/** The row of `id` in the story. */
const rowOf = (canvas: HTMLElement, id: string) => canvas.querySelector<HTMLElement>(`tr[data-run="${id}"]`)!;

/**
 * Three judged runs and one the list could not judge: a press on a label inside a row follows the label, not the row; the pointer on a
 * row lights it and Enter opens its run, the judged row and the unjudged alike. The last row, at the frame's foot, is lit by the layer
 * `TableAtCut` lays on it in the cut's shape, which the look's browser test reads in pixels (`test/e2e/cuts.test.ts`).
 */
export const InFlight: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const lgll = rowOf(canvasElement, TARGET_RUNS.lgll.metadata.name);
    const label = lgll.querySelector<HTMLElement>('[data-label="area=api"]')!;
    await userEvent.click(label);
    await waitFor(() => expect(standing(lgll), 'the label is followed, not the row').toBe('/labels/area/api'));
    await userEvent.unhover(label);
    await rowOpens(userEvent, lgll, `/runs/${TARGET_RUNS.lgll.metadata.name}`);
    const foot = rowOf(canvasElement, UNJUDGED.id);
    const [layer, row] = [canvasElement.querySelector('[data-framed-foot]')!.getBoundingClientRect(), foot.getBoundingClientRect()];
    await expect([layer.top, layer.bottom], "the foot's state layer lies on the last row").toEqual([row.top, row.bottom]);
    await rowOpens(userEvent, foot, `/runs/${UNJUDGED.id}`);
  },
};
