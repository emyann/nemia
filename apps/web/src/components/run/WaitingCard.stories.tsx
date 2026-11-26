import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { WaitingCard } from './WaitingCard';
import { AS_OF, RUN } from './approve.fixture';

/** A run that waits on a person, as a card of the runs page: in a box as narrow as a card where the page is narrow, and wide. */
const meta: Meta = { title: 'Run/WaitingCard' };
export default meta;

/** A box as wide as a card of the runs page where the page is narrow. */
const NARROW: CSSProperties = { width: 360 };

/** A box as wide as a card where the page is wide. */
const WIDE: CSSProperties = { width: 760 };

/** Where the button of the card drawn in `canvas` stands against its rail, and how far its right edge is from the foot's. */
const footOf = (canvas: HTMLElement) => {
  const foot = canvas.querySelector('[data-foot]')!;
  const [rail, button] = ['[data-run-steps]', '[data-cut-button]:not([data-approve])'].map((part) =>
    foot.querySelector(part)!.getBoundingClientRect(),
  );
  return {
    beside: button.top < rail.bottom && button.bottom > rail.top,
    fromRight: Math.round(foot.getBoundingClientRect().right - button.right),
  };
};

/**
 * The card where the page is narrow: its graph, 188 pixels wide as on every surface, and its cost on one line, and its two buttons
 * under them, at the card's right.
 */
export const Narrow: StoryObj = {
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    await expect(footOf(canvasElement), 'the button under the graph, at the right').toEqual({ beside: false, fromRight: 0 });
    await expect(canvasElement.querySelectorAll('[data-cut-button]').length, 'Approve and Open the run').toBe(2);
    await expect(canvasElement.querySelector('[data-approve="land"]')?.textContent, 'Approve names its step').toBe('Approve land');
    await expect(canvasElement.querySelectorAll('[data-step]').length, 'its four steps, laid out by their edges').toBe(4);
    await expect(canvasElement.querySelector('[data-fold]'), 'none folded').toBeNull();
  },
  render: () => (
    <div data-card-box style={NARROW}>
      <WaitingCard run={RUN} asOf={AS_OF} />
    </div>
  ),
};

/**
 * The card where the page is wide: the button at the card's right, and the title under the meta line, raised over the copy control's
 * target, so its highest pixels under the control answer the title's link: a press there opens the run, and copies nothing.
 */
export const Wide: StoryObj = {
  play: async ({ canvasElement, userEvent }) => {
    await document.fonts.ready;
    await expect(footOf(canvasElement), 'the button beside the rail, at the right').toEqual({ beside: true, fromRight: 0 });
    const article = canvasElement.querySelector('article[data-run]')!;
    const link = article.querySelector('h3 a')!;
    const button = article.querySelector('[data-copy-id] button')!.getBoundingClientRect();
    const x = button.left + button.width / 2;
    const row = [...link.getClientRects()][0];
    const at = document.elementFromPoint(x, row.top + 1);
    await expect(x > row.left && x < row.right, 'the title runs under the copy control').toBe(true);
    await expect(at?.closest('a'), `the point a pixel inside the title, under the copy control, answers ${at?.tagName ?? 'nothing'}`).toBe(
      link,
    );
    await userEvent.click(at!);
    const run = article.getAttribute('data-run');
    await waitFor(() => expect(canvasElement.querySelector('[data-story-ground]')?.getAttribute('data-at')).toBe(`/runs/${run}`));
    await expect(canvasElement.querySelectorAll('[data-copied]').length, 'and nothing was copied').toBe(0);
    atRest();
  },
  render: () => (
    <div data-card-box style={WIDE}>
      <WaitingCard run={RUN} asOf={AS_OF} />
    </div>
  ),
};
