import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, fireEvent, within } from 'storybook/test';
import { atRest, tabStops, tabTo } from '../../../.storybook/play';
import { CutButton, CutPress } from './CutButton';
import { ON_CARD } from './stories.fixtures';

/**
 * The look's filled button with two cut corners: a link to a route, quiet, a button that is pressed, a press that is disabled, and a
 * press still out.
 */
const meta: Meta = { title: 'Look/CutButton' };
export default meta;

/** The button as a link: pressed, or Enter on it, it leads to its route once. */
export const Link: StoryObj = {
  render: () => (
    <div style={ON_CARD}>
      <CutButton to="." search={{ read: 'button' } as never}>
        Open the run
      </CutButton>
    </div>
  ),
};

/** The button as a link, quiet: no ground, the surface's ink inside a hairline, as a waiting card's one button. */
export const Quiet: StoryObj<typeof CutButton> = {
  args: { quiet: true },
  render: (args) => (
    <div style={ON_CARD}>
      <CutButton {...args} to="." search={{ read: 'button' } as never}>
        Open the run
      </CutButton>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const link = canvasElement.querySelector('[data-cut-button="link"]')!;
    await expect(link.getAttribute('data-quiet')).toBe('true');
    const fill = getComputedStyle(link.querySelector('[data-cut-shape]')!).backgroundColor;
    await expect(fill.endsWith(', 0)'), `a quiet button paints no ground: ${fill}`).toBe(true);
  },
};

/** A press on a card, which counts on its ground how many times it was pressed (`data-presses`). */
function Counted({ isDisabled = false }: { isDisabled?: boolean }) {
  const [presses, setPresses] = useState(0);
  return (
    <div data-presses={presses} style={ON_CARD}>
      <CutPress isDisabled={isDisabled} onPress={() => setPresses((n) => n + 1)}>
        Approve
      </CutPress>
    </div>
  );
}

/** How many times the press drawn in `canvas` was pressed. */
const pressesIn = (canvas: HTMLElement) => canvas.querySelector('[data-presses]')?.getAttribute('data-presses');

/** The button as a press: a button, no link, which Enter and Space each press once by the keyboard; its ring is the link's. */
export const Press: StoryObj = {
  render: () => <Counted />,
  play: async ({ canvasElement, userEvent }) => {
    await tabTo(userEvent, 'cutButton');
    await expect(canvasElement.querySelector('[data-cut-button]')?.tagName, 'the press is a button, no link').toBe('BUTTON');
    await expect(pressesIn(canvasElement)).toBe('0');
    await userEvent.keyboard('{Enter}');
    await expect(pressesIn(canvasElement), 'Enter presses it once').toBe('1');
    await userEvent.keyboard(' ');
    await expect(pressesIn(canvasElement), 'Space presses it once').toBe('2');
    atRest();
  },
};

/** A press that is disabled: it takes no press and no focus, draws no ring, and is drawn in the disabled ground and ink. */
export const DisabledPress: StoryObj = {
  render: () => <Counted isDisabled />,
  play: async ({ canvasElement, userEvent }) => {
    const button = canvasElement.querySelector<HTMLButtonElement>('[data-cut-button]');
    const stops = (await tabStops(userEvent)).filter((stop) => stop.marks.includes('cutButton'));
    await expect(stops, 'Tab passes the disabled press').toEqual([]);
    await fireEvent.click(button!);
    await expect(pressesIn(canvasElement), 'a click presses nothing').toBe('0');
    await expect(button?.disabled).toBe(true);
    await expect(button?.querySelectorAll('[data-cut-ring]').length, 'it draws no ring').toBe(0);
  },
};

/** A press still out: disabled while it waits, the kit's small ProgressIndicator before its words, which stay its name. */
export const PendingPress: StoryObj<typeof CutPress> = {
  args: { isDisabled: true, pending: true, children: 'Approving…' },
  render: (args) => (
    <div style={ON_CARD}>
      <CutPress {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', { name: 'Approving…' });
    await expect(button.querySelector('[data-pending]'), 'it draws the indicator').not.toBeNull();
    await expect(within(canvasElement).queryByRole('progressbar'), 'the indicator is hidden from a screen reader').toBeNull();
  },
};
