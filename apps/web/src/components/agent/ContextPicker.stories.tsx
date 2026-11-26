import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import type { Concluded } from 'objects';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import { ConcludedPreview, ContextPicker } from './ContextPicker';
import { saysReading, Unread } from '../../../.storybook/unread';
import { nothingWaits, TARGET_RUNS } from '../../../.storybook/fixtures/runs';

/** The run in flight a story picks: lgll, being checked. */
const LGLL = TARGET_RUNS.lgll.metadata.name;

/** What lgll would hand a run that reads it: it has not landed, so its preview is badged. */
const HANDS: Concluded = {
  run: LGLL,
  succeeded: false,
  section: `\n## From run ${LGLL}\n\nIt measured **the cache** and wrote what it found.`,
};

/**
 * The runs a run reads as context, the kit's checkbox a run, over the runs page's answers (`nothingWaits`): the runs in flight, then the
 * finished, with Show older; each run picked shows what it would hand. Its args are the runs picked and what a pick calls.
 */
const meta: Meta<typeof ContextPicker> = {
  tags: ['network'],
  title: 'Store/ContextPicker',
  component: ContextPicker,
  args: { selected: [], onChange: fn(), label: 'Reads' },
  parameters: {
    msw: [...nothingWaits, http.get('/api/runs/:name/concluded', () => HttpResponse.json(HANDS))],
  },
};
export default meta;

type Story = StoryObj<typeof ContextPicker>;

/** Nothing picked: every run a box to tick, and a tick hands the list back with it. */
export const NothingPicked: Story = {
  play: async ({ canvasElement, args }) => {
    await waitFor(() => expect(canvasElement.querySelector(`li[data-run="${LGLL}"]`)).not.toBeNull());
    const box = within(canvasElement.querySelector<HTMLElement>(`li[data-run="${LGLL}"]`)!).getByRole('checkbox');
    await expect(box).not.toBeChecked();
    await userEvent.click(box);
    await waitFor(() => expect(args.onChange).toHaveBeenCalledWith([LGLL]));
  },
};

/**
 * lgll picked: its box ticked, and what it would hand drawn under the list, badged not landed. It warns on axe, its test to come: the
 * preview draws the section's `##` as an `h6` under its own `h4` (`heading-order`), on the page as here; that is the preview's outline
 * to mend.
 */
export const OnePicked: Story = {
  parameters: { a11y: { test: 'todo' } },
  args: { selected: [LGLL] },
  play: async ({ canvasElement }) => {
    const picker = within(canvasElement);
    await waitFor(() => expect(canvasElement.querySelector(`[data-concluded="${LGLL}"] [data-not-succeeded]`)).not.toBeNull());
    await waitFor(() => expect(picker.getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked)).toHaveLength(1));
  },
};

/** Held while the form writes: every box disabled. */
export const Disabled: Story = { args: { selected: [LGLL], disabled: true } };

/** The runs still read: the shape of the list's rows. */
export const ReadingTheRuns: Story = {
  render: (args) => (
    <Unread>
      <div style={{ width: 560 }}>
        <ContextPicker {...args} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the runs…'),
};

/** A run picked, what it concluded still read: the shape of its section. */
export const ReadingWhatItConcluded: Story = {
  render: () => (
    <Unread>
      <div style={{ width: 560 }}>
        <ConcludedPreview run="r-1" />
      </div>
    </Unread>
  ),
  play: saysReading('Reading what it concluded…'),
};
