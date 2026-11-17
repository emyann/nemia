import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { pauseQuery, type Paused } from '@/lib/api/pause';
import { PauseButton } from './PauseButton';
import { PAUSED, RUNNING } from '../../../.storybook/fixtures/frame';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** What a story of the pause reads: the pause as `GET /api/pause` answers it. */
type Args = { read: Paused };

/** Where the button stands: the machine bar's ground, as tall as its line, its right end where the bar holds it. */
const BAR = { display: 'flex', justifyContent: 'flex-end', width: 480, height: 32, background: 'var(--surface-container)' };

/** The pause button over `read`, its popover opening under it. */
const drawn = ({ read }: Args) => (
  <QueryClientProvider client={seeded([[pauseQuery.queryKey, read]])}>
    <div style={BAR}>
      <PauseButton />
    </div>
  </QueryClientProvider>
);

/**
 * The pause of all factories in the machine bar, a story a state: every factory running, its popover open on what may be done, Pause…
 * asking why, and every factory paused with a session parked. The button is the kit's text `Button`, the popover the kit's `Popover`
 * opened by its `PopoverTrigger`, its heading the kit's `Title`, the why the kit's `TextField`.
 */
const meta: Meta<Args> = {
  title: 'Frame/PauseButton',
  args: { read: RUNNING },
  render: drawn,
};
export default meta;

type Story = StoryObj<Args>;

/** The popover of the page's document: the kit portals it over the page. */
const popover = () => within(document.body).findByRole('dialog', { name: 'The pause of all factories' });

/** Every factory running: a pause icon, no words. */
export const Running: Story = {
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: /pause/i })).toBeVisible());
  },
};

/** Its popover open: the heading says Running, and the two ways to pause are offered. */
export const Opened: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /pause/i }));
    const open = within(await popover());
    await expect(open.getByRole('heading', { name: 'Running' })).toBeVisible();
    await expect(open.getByRole('button', { name: 'Pause…' })).toBeVisible();
    await expect(open.getByRole('button', { name: 'Stop now…' })).toBeVisible();
  },
};

/** Pause… asks an optional why in the kit's field, with Cancel beside Pause. */
export const AsksWhy: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /pause/i }));
    await userEvent.click(within(await popover()).getByRole('button', { name: 'Pause…' }));
    const open = within(await popover());
    await expect(open.getByRole('heading', { name: 'Pause all factories' })).toBeVisible();
    await userEvent.type(open.getByRole('textbox', { name: 'Why (optional)' }), 'merging by hand on main');
    await expect(open.getByRole('button', { name: 'Pause' })).toBeEnabled();
  },
};

/** Every factory paused: the play icon and Paused, and the popover names the parked step and offers Resume. */
export const PausedWithAParkedStep: Story = {
  args: { read: PAUSED },
  play: async ({ canvasElement }) => {
    await waitFor(() => expect(within(canvasElement).getByText('Paused')).toBeVisible());
    await userEvent.click(within(canvasElement).getByRole('button', { name: /paused/i }));
    const open = within(await popover());
    await expect(open.getByRole('heading', { name: 'Paused' })).toBeVisible();
    await expect(open.getByRole('button', { name: 'Resume' })).toBeVisible();
  },
};
