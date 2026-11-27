import type { CSSProperties } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import type { WaitingRun } from '@/lib/api/runs';
import { WaitingCard } from './WaitingCard';
import { ANSWER, AS_OF, LONG_APPROVAL, LONG_STEP, RUN } from './approve.fixture';

/** A run that waits on a person, as a card of the runs page: in a box as narrow as a card where the page is narrow, and wide. */
const meta: Meta = { title: 'Run/WaitingCard' };
export default meta;

/** A box as wide as a card of the runs page where the page is narrow. */
const NARROW: CSSProperties = { width: 360 };

/** A box as wide as a card where the page is wide. */
const WIDE: CSSProperties = { width: 760 };

/** A card story given its run. */
type Given = StoryObj<{ run: WaitingRun }>;

/** The card of the run a story is given, in a box as narrow as a card where the page is narrow. */
const narrowCard = ({ run }: { run: WaitingRun }) => (
  <div data-card-box style={NARROW}>
    <WaitingCard run={run} asOf={AS_OF} />
  </div>
);

/** Open the run, the card's quiet button, beside its Approve or Answer. */
const OPENS_BUTTON = '[data-cut-button]:not([data-approve]):not([data-answer])';

/** The card's Approve or Answer. */
const ACTION_BUTTON = '[data-approve], [data-answer]';

/** Where the button of the card drawn in `canvas` stands against its rail, and how far its right edge is from the foot's. */
const footOf = (canvas: HTMLElement) => {
  const foot = canvas.querySelector('[data-foot]')!;
  const [rail, button] = ['[data-run-steps]', OPENS_BUTTON].map((part) => foot.querySelector(part)!.getBoundingClientRect());
  return {
    beside: button.top < rail.bottom && button.bottom > rail.top,
    fromRight: Math.round(foot.getBoundingClientRect().right - button.right),
  };
};

/**
 * What the card drawn in `canvas` says on its now line and in its foot: whether its words are drawn, and its Approve's or Answer's height
 * against Open the run's.
 */
const saidOnce = (canvas: HTMLElement) => {
  const [approve, opens] = [ACTION_BUTTON, OPENS_BUTTON].map((part) =>
    Math.round(canvas.querySelector(`${part} [data-cut-shape]`)!.getBoundingClientRect().height),
  );
  return { words: canvas.querySelector('[data-now-words]') !== null, sameHeight: approve === opens };
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
    await expect(canvasElement.querySelector('[data-approve="land"]')?.textContent, 'Approve says its verb alone').toBe('Approve');
    await expect(
      within(canvasElement).getByRole('button', { name: 'Approve land' }),
      'and names its step to a screen reader',
    ).toBeVisible();
    await expect(canvasElement.querySelector('[title="Approve land"] [data-approve]'), 'and on hover').not.toBeNull();
    await expect(canvasElement.querySelectorAll('[data-step]').length, 'its four steps, laid out by their edges').toBe(4);
    await expect(canvasElement.querySelector('[data-fold]'), 'none folded').toBeNull();
    await expect(saidOnce(canvasElement), 'Approve says the wait alone, and both buttons are one height').toEqual({
      words: false,
      sameHeight: true,
    });
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
    await expect(saidOnce(canvasElement), 'Approve says the wait alone, and both buttons are one height').toEqual({
      words: false,
      sameHeight: true,
    });
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

/**
 * The card at the gate of a step whose name runs long, where the page is narrow: its button says Approve alone, names the step to a
 * screen reader and on hover, and stands inside the card, as wide as at a step of four letters.
 */
export const LongStepName: Given = {
  args: { run: LONG_APPROVAL },
  render: narrowCard,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const button = within(canvasElement).getByRole('button', { name: `Approve ${LONG_STEP}` });
    await expect(button.textContent, 'Approve says its verb alone').toBe('Approve');
    await expect(button.closest(`[title="Approve ${LONG_STEP}"]`), 'it names its step on hover').not.toBeNull();
    const card = canvasElement.querySelector('article[data-run]')!.getBoundingClientRect();
    await expect(button.getBoundingClientRect().right <= card.right, 'the button stands inside the card').toBe(true);
    await expect(saidOnce(canvasElement), 'Approve says the wait alone, and both buttons are one height').toEqual({
      words: false,
      sameHeight: true,
    });
  },
};

/**
 * The card of a run whose step signed off blocked on a person's answer, where the page is narrow: Answer beside Open the run, naming
 * the step to a screen reader and on hover, and no words of the wait on its now line.
 */
export const Answer: Given = {
  args: { run: ANSWER },
  render: narrowCard,
  play: async ({ canvasElement }) => {
    await document.fonts.ready;
    const button = within(canvasElement).getByRole('button', { name: 'Answer land' });
    await expect(button.textContent, 'Answer says its verb alone').toBe('Answer');
    await expect(button).toHaveAttribute('data-answer', 'land');
    await expect(button.closest('[title="Answer land"]'), 'it names its step on hover').not.toBeNull();
    await expect(canvasElement.querySelector('[data-approve]'), 'and no Approve').toBeNull();
    await expect(saidOnce(canvasElement), 'Answer says the wait alone, and both buttons are one height').toEqual({
      words: false,
      sameHeight: true,
    });
  },
};
