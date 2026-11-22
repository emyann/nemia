import type { Meta, StoryObj } from '@storybook/react-vite';

/**
 * The look's scroll bars, which the board's styles draw on what is marked as scrolling: a box shorter than what it holds, in a page
 * longer than the window, as the board's pages are, so the page's own bar is drawn too.
 */
const meta: Meta = { title: 'Look/ScrollBars' };
export default meta;

/** A box shorter than what it holds, at the head of a page twice the height of the checks' window (800). */
function Scroller() {
  return (
    <div style={{ minHeight: 1600 }}>
      <div data-scroller style={{ width: 260, height: 160, overflow: 'auto', background: 'var(--md-sys-color-surface-container-low)' }}>
        <div style={{ height: 640, padding: 16 }}>A box shorter than what it holds.</div>
      </div>
    </div>
  );
}

/** A box whose scrolls are marked, as the board's frame marks them: its bar is drawn while it scrolls. */
export const Marked: StoryObj = { render: () => <Scroller /> };

/** A box with nothing listening to its scrolls: no mark is written, and no bar is drawn in the look's inks. */
export const Unmarked: StoryObj = { parameters: { scrollMark: false }, render: () => <Scroller /> };
