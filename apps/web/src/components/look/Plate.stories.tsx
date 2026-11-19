import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { PageName, Plate } from './Plate';

/** The look's plate, a section's heading, in each hue and quiet; and a page's name over its rule. */
const meta: Meta = { title: 'Look/Plate' };
export default meta;

/** The plate of what waits on a person. */
export const Yours: StoryObj = { render: () => <Plate count={2} title="Waiting on you" /> };

/** The plate of the sessions at work. */
export const Alive: StoryObj = { render: () => <Plate count={3} title="In flight" hue="alive" /> };

/** The plate of what is at rest. */
export const Grey: StoryObj = { render: () => <Plate count={6} title="Finished" hue="grey" /> };

/** The plate of a section that holds nothing: grey whatever its hue, with no barcode. */
export const Quiet: StoryObj = { render: () => <Plate count={0} title="Waiting on you" quiet /> };

/**
 * A long name's lit part reaches past this many pixels, and a short one's stops short of them: the brand face lights Runs 153 wide,
 * and Factories 295.
 */
const LONG = 200;

/**
 * The page's name drawn in `canvas` lights its rule exactly under the whole name, and the hairline runs the h1's width, the lit part
 * lying on it at the h1's foot; its lit part's width, in pixels.
 */
async function litUnder(canvas: HTMLElement, said: string) {
  await document.fonts.ready;
  const name = canvas.querySelector('[data-page-name]')!;
  const text = document.createRange();
  text.selectNodeContents(name.querySelector('[data-page-name-text]')!.firstChild!);
  const [word, lit, rule, whole] = [
    text.getBoundingClientRect(),
    name.querySelector('[data-page-rule-lit]')!.getBoundingClientRect(),
    name.querySelector('[data-page-rule]')!.getBoundingClientRect(),
    name.getBoundingClientRect(),
  ];
  const across = (box: DOMRect) => [Math.round(box.left), Math.round(box.right)];
  await expect(name.textContent).toBe(said);
  await expect(across(lit), 'the lit part is as wide as the name').toEqual(across(word));
  await expect(across(rule), "the hairline runs the h1's width").toEqual(across(whole));
  const onTheRule = Math.round(lit.bottom) === Math.round(rule.bottom) && Math.round(lit.bottom) === Math.round(whole.bottom);
  await expect(onTheRule, "the lit part lies on the hairline, at the h1's foot").toBe(true);
  return Math.round(lit.right) - Math.round(lit.left);
}

/** A page's short name, in the brand face over its rule, lit under the name alone. */
export const NameOfAPage: StoryObj = {
  render: () => <PageName>Runs</PageName>,
  play: async ({ canvasElement }) => {
    const lit = await litUnder(canvasElement, 'Runs');
    await expect(lit, `a short name's lit part stops short of a long one's: ${lit}`).toBeLessThan(LONG);
  },
};

/** A page's long name: its rule lit under the whole name, past where a short one's stops. */
export const LongNameOfAPage: StoryObj = {
  render: () => <PageName>Factories</PageName>,
  play: async ({ canvasElement }) => {
    const lit = await litUnder(canvasElement, 'Factories');
    await expect(lit, `a long name's lit part reaches past a short one's: ${lit}`).toBeGreaterThan(LONG);
  },
};
