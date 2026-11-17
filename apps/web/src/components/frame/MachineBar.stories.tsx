import type { CSSProperties } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { pauseQuery, type Paused } from '@/lib/api/pause';
import { NemiaChatProvider } from '@/lib/useNemiaChat';
import { frameRunsQuery } from '../nav/nav';
import { MachineBar } from './MachineBar';
import { PAUSED, quietChat, RUNNING } from '../../../.storybook/fixtures/frame';
import { openRuns, seeded } from '../../../.storybook/fixtures/proposals';

/** What a story of the bar reads: the pause, and how many runs wait on the person. */
type Args = { read: Paused; waiting: number };

/** The page the bar stands under. */
const PATH = '/runs';

/** The machine bar at the foot of a window 960 wide, its reads seeded, her chat at rest. */
const drawn = ({ read, waiting }: Args) => (
  <QueryClientProvider
    client={seeded([
      [pauseQuery.queryKey, read],
      [frameRunsQuery(PATH).queryKey, openRuns(waiting)],
    ])}
  >
    <NemiaChatProvider>
      <div style={{ width: 960, '--frame-foot': '2rem' } as CSSProperties}>
        <MachineBar path={PATH} feed="open" />
      </div>
    </NemiaChatProvider>
  </QueryClientProvider>
);

/**
 * The machine bar, a story a state: every factory running, and every factory paused. Its line is the kit's `Pressable`, pressed whole to
 * open the gauges; the pause beside it is the kit's text `Button` (`PauseButton`'s own stories open its popover).
 *
 * Axe's `label-content-name-mismatch` alone is off, for the line: its name says the machine as a sentence (`This machine: daemon
 * ticking, …, quota …`), the words the e2e and a screen reader read, and its visible text says the same words in short, joined by
 * dots, which the rule reads as text left out of the name. Every other rule holds the bar.
 */
const meta: Meta<Args> = {
  title: 'Frame/MachineBar',
  args: { read: RUNNING, waiting: 0 },
  parameters: { msw: quietChat, a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
  render: drawn,
};
export default meta;

type Story = StoryObj<Args>;

/** Every factory running: the line says the machine in short and takes the focus as one press. */
export const Running: Story = {
  play: async ({ canvasElement }) => {
    const line = within(canvasElement).getByRole('button', { name: /^This machine: daemon/ });
    await expect(line).toHaveAttribute('aria-expanded', 'false');
    await userEvent.tab();
    await expect(line).toHaveFocus();
  },
};

/** Every factory paused: the pause beside the line says Paused. */
export const AllPaused: Story = {
  args: { read: PAUSED, waiting: 2 },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText('Paused')).toBeVisible());
  },
};
