import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { barValue } from '@/lib/bar';
import { Unread } from '../../../.storybook/unread';
import { FrameSheet } from './FrameSheet';
import { FramePaneProvider, HerSheetProvider } from './HerSheet';

/**
 * The frame's side sheet, docked at the right of the page on a screen wider than a tablet, on the page's ground: here it shows the
 * gauges the address names (`?bar=gauges`), their reads still out. It stands the window's whole height, and opens over the whole
 * window at a phone's width, so the story is tagged `overlay`.
 */
const meta: Meta<typeof FrameSheet> = {
  title: 'Frame/FrameSheet',
  component: FrameSheet,
  args: { path: '/', feed: 'open' },
  parameters: { at: `/?bar=${barValue({ kind: 'gauges' })}` },
  tags: ['overlay'],
  render: (args) => (
    <Unread>
      <HerSheetProvider>
        <FramePaneProvider shortcut={false}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', height: 640 }}>
            <FrameSheet {...args} />
          </div>
        </FramePaneProvider>
      </HerSheetProvider>
    </Unread>
  ),
};
export default meta;

/** Docked, showing the gauges: the sheet stands on the page's ground, the floor's rung, as the rail beside the page does. */
export const Docked: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-frame-sheet="docked"]')).not.toBeNull();
  },
};
