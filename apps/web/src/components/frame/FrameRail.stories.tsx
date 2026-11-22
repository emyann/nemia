import type { CSSProperties } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { openRunsQuery } from '@/lib/api/runs';
import { NemiaChatProvider } from '@/lib/useNemiaChat';
import { frameRunsQuery } from '../nav/nav';
import { FrameRail } from './FrameRail';
import { FramePaneProvider, HerSheetProvider } from './HerSheet';
import { quietChat } from '../../../.storybook/fixtures/frame';
import { FACTORY, openRuns, seeded } from '../../../.storybook/fixtures/proposals';

/** What a story of the rail draws: the page at `path`, and how many runs wait on the person in every factory. */
type Args = { path: string; waiting: number };

/** The store's rail at `path` under the frame's own state (`FramePaneProvider`, `HerSheetProvider`), her chat at rest. */
const drawn = ({ path, waiting }: Args) => (
  <QueryClientProvider
    client={seeded([
      [openRunsQuery().queryKey, openRuns(waiting)],
      [frameRunsQuery(path).queryKey, openRuns(waiting)],
    ])}
  >
    <NemiaChatProvider>
      <HerSheetProvider>
        <FramePaneProvider shortcut={path.startsWith('/factories/')}>
          <div style={{ display: 'flex', height: 720, '--frame-foot': '0px' } as CSSProperties}>
            <FrameRail path={path} search={{}} />
          </div>
        </FramePaneProvider>
      </HerSheetProvider>
    </NemiaChatProvider>
  </QueryClientProvider>
);

/**
 * The store's rail, docked, a story a state: on a page of the store's, and on a factory's page, where the menu button folds the
 * factory pane the frame keeps itself (`FramePaneProvider`, the `sidebar_state` cookie).
 *
 * Axe's `label-content-name-mismatch` alone is off, for Waiting's badge: the ds kit's `NavigationRail` names a badged item by its
 * `badgeLabel` (`Waiting, 2 wait on you in every factory`) beside its visible count, which the rule reads as text left out of the name.
 * That is the kit's to mend, upstream; every other rule holds the rail.
 */
const meta: Meta<Args> = {
  tags: ['network'],
  title: 'Frame/FrameRail',
  args: { path: '/runs', waiting: 0 },
  parameters: {
    msw: quietChat,
    at: '/runs',
    a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } },
  },
  render: drawn,
};
export default meta;

type Story = StoryObj<Args>;

/** On a page of the store's, two runs waiting: her face first, the groups, and no menu button, the page having no pane. */
export const OnTheStore: Story = {
  args: { waiting: 2 },
  play: async ({ canvasElement }) => {
    const rail = within(canvasElement);
    await expect(rail.queryByRole('button', { name: /factory pane/ })).toBeNull();
    await expect(rail.getByRole('link', { name: /^Waiting/ })).toBeVisible();
  },
};

/** On a factory's page: the menu button folds the pane and unfolds it again, saying which a press does. */
export const OnAFactory: Story = {
  args: { path: `/factories/${FACTORY}` },
  parameters: { at: `/factories/${FACTORY}` },
  play: async ({ canvasElement }) => {
    const rail = within(canvasElement);
    const menu = rail.getByRole('button', { name: /factory pane/ });
    const was = menu.getAttribute('aria-label');
    await userEvent.click(menu);
    await expect(menu).not.toHaveAttribute('aria-label', was);
    await userEvent.click(menu);
    await expect(menu).toHaveAttribute('aria-label', was);
  },
};
