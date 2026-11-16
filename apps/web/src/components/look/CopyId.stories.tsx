import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, waitFor } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { CopyId } from './CopyId';
import { ON_CARD } from './stories.fixtures';

/** A run's id with the control that copies it: short, its last four characters, whole, and whole under a title. */
const meta: Meta = { title: 'Look/CopyId' };
export default meta;

/**
 * Each id the story drawn in `canvas` holds, as its box is laid out: its edge, its room and how tall it is; and its glyph, twelve
 * pixels across and seven from the id, on a line no taller than the id.
 */
async function idsHold(canvas: HTMLElement, boxes: readonly string[]): Promise<void> {
  await document.fonts.ready;
  const found = [...canvas.querySelectorAll<HTMLElement>('[data-run-id]')].map((id) => {
    const style = getComputedStyle(id);
    return `${id.textContent}: ${style.borderTopWidth}, ${style.paddingLeft} ${style.paddingRight}, ${id.getBoundingClientRect().height}px tall`;
  });
  await expect(found).toEqual(boxes);
  const drawn = [...canvas.querySelectorAll('[data-copy-id]')].map((copy) => {
    const [glyph, id] = ['[data-copy-glyph]', '[data-run-id]'].map((part) => copy.querySelector(part)!.getBoundingClientRect());
    return `glyph ${glyph.width} by ${glyph.height}, ${Math.round(glyph.left - id.right)} from the id, on a line ${copy.getBoundingClientRect().height} tall`;
  });
  await expect(drawn, 'the glyph is 12 pixels across, 7 from the id, and the line is no taller than the id').toEqual(
    boxes.map((box) => `glyph 12 by 12, 7 from the id, on a line ${/(\d+)px tall$/.exec(box)?.[1]} tall`),
  );
}

/** The ink of the short id drawn in `canvas`, as the page computes it. */
const inkOf = (canvas: HTMLElement): string => getComputedStyle(canvas.querySelector('[data-run-id]')!).color;

/** The hue of a session at work, as the page computes it. */
const aliveOf = (): string => {
  const probe = document.createElement('i');
  probe.style.color = 'var(--meaning-alive)';
  document.body.append(probe);
  const said = getComputedStyle(probe).color;
  probe.remove();
  return said;
};

/** The short id's ink as it is at rest, whatever was just copied. */
const KEPT_INK = '[data-copied] [data-run-id] { color: var(--md-sys-color-on-surface-variant) !important; }';

/**
 * The short id: its last four characters in no box, quiet beside a title; and its ink takes the hue of a session at work for the
 * moment after a copy, on a clipboard that takes anything, and its own back at rest: an ink kept as it was is seen.
 */
export const Short: StoryObj = {
  play: async ({ canvasElement, userEvent }) => {
    await idsHold(canvasElement, ['2e13: 0px, 0px 0px, 16px tall']);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
    const [rest, alive] = [inkOf(canvasElement), aliveOf()];
    await expect(rest, `at rest the id is no hue of a session at work: ${rest}`).not.toBe(alive);
    await userEvent.click(canvasElement.querySelector('button')!);
    await waitFor(() => expect(canvasElement.querySelector('[data-copied]')).not.toBeNull());
    await waitFor(() => expect(inkOf(canvasElement), 'just copied, its ink is the hue of a session at work').toBe(alive));
    const kept = document.createElement('style');
    kept.textContent = KEPT_INK;
    document.head.append(kept);
    try {
      await waitFor(() => expect(inkOf(canvasElement), 'an id left in its own ink: seen').toBe(rest));
    } finally {
      kept.remove();
    }
    await waitFor(() => expect(canvasElement.querySelector('[data-copied]'), 'the copied moment ends').toBeNull(), { timeout: 3000 });
    atRest();
  },
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <CopyId id="the-tool-errors-panels-2e13" short />
    </div>
  ),
};

/** The whole id, in no box. */
export const Whole: StoryObj = {
  play: ({ canvasElement }) => idsHold(canvasElement, ['lay-the-diamond-top-e2e4: 0px, 0px 0px, 16px tall']),
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <CopyId id="lay-the-diamond-top-e2e4" />
    </div>
  ),
};

/** The whole id under a run's title, four pixels from it, as a card lays it out: the line it stands on is as tall as the id. */
export const UnderTitle: StoryObj = {
  play: async ({ canvasElement }) => {
    await idsHold(canvasElement, ['lay-the-diamond-top-e2e4: 0px, 0px 0px, 16px tall']);
    const [title, copy] = [...canvasElement.querySelector('[data-under-title]')!.children].map((child) => child.getBoundingClientRect());
    await expect(copy.top - title.bottom, 'under a title, the id stands four pixels from it').toBe(4);
  },
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <div data-under-title style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
        <span className="text-title-medium">Lay the diamond top</span>
        <CopyId id="lay-the-diamond-top-e2e4" />
      </div>
    </div>
  ),
};

/** Two whole ids of different lengths given one room, as the rows of a table hold them: their controls stand at one edge. */
export const Lined: StoryObj = {
  play: ({ canvasElement }) =>
    idsHold(canvasElement, [
      'lay-the-diamond-top-e2e4: 0px, 0px 0px, 16px tall',
      'the-board-s-frame-on-the-kit-04ys: 0px, 0px 0px, 16px tall',
    ]),
  render: () => (
    <div data-id-ground style={ON_CARD}>
      <div data-lined style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 16 }}>
        <CopyId id="lay-the-diamond-top-e2e4" room={33} />
        <CopyId id="the-board-s-frame-on-the-kit-04ys" room={33} />
      </div>
    </div>
  ),
};
