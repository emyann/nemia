import type { Meta, StoryObj } from '@storybook/react-vite';

/** The look's scroll bars, which the board's styles draw on what is marked as scrolling: a box shorter than what it holds. */
const meta: Meta = { title: 'Look/ScrollBars' };
export default meta;

/** A box shorter than what it holds. */
function Scroller() {
  return (
    <div data-scroller style={{ width: 260, height: 160, overflow: 'auto', background: 'var(--card)' }}>
      <div style={{ height: 640, padding: 16 }}>A box shorter than what it holds.</div>
    </div>
  );
}

/** A box whose scrolls are marked, as the board's frame marks them: its bar is drawn while it scrolls. */
export const Marked: StoryObj = { render: () => <Scroller /> };

/** A box with nothing listening to its scrolls: no mark is written, and no bar is drawn in the look's inks. */
export const Unmarked: StoryObj = { parameters: { scrollMark: false }, render: () => <Scroller /> };
