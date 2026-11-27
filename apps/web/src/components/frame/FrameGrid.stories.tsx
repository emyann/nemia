import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { FrameGrid } from './FrameGrid';

/** The frame's grid, in the page's column as the frame draws it: the wide span takes the column, the reading span stops at its measure. */
const meta: Meta<typeof FrameGrid> = { title: 'Frame/FrameGrid', component: FrameGrid };
export default meta;

/** A page column 1600 wide holding `children`, as the frame's main does. */
const column = (children: React.ReactNode) => (
  <div className="@container/page" style={{ width: 1600 }}>
    {children}
  </div>
);

const TEXT =
  'A line of the page, long enough to take all the room the span gives it, and then wrap onto the next line of the page. '.repeat(8);

/** The wide span takes the grid's whole width between its edges. */
export const Wide: StoryObj<typeof FrameGrid> = {
  args: { span: 'wide', children: TEXT },
  render: (args) => column(<FrameGrid {...args} />),
  play: async ({ canvasElement }) => {
    const span = canvasElement.querySelector('[data-frame-span="wide"]')!.getBoundingClientRect();
    await expect(span.width).toBeGreaterThan(1500);
  },
};

/** The reading span starts at the grid's left edge and its lines stop at 48rem. */
export const Reading: StoryObj<typeof FrameGrid> = {
  args: { span: 'reading', children: TEXT },
  render: (args) => column(<FrameGrid {...args} />),
  play: async ({ canvasElement }) => {
    const span = canvasElement.querySelector('[data-frame-span="reading"]')!.getBoundingClientRect();
    await expect(span.width).toBeLessThanOrEqual(768);
    await expect(span.left).toBe(canvasElement.querySelector('[data-frame-grid]')!.getBoundingClientRect().left + 24);
  },
};
