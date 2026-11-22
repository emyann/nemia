import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Marker } from './Marker';

/** The look's marker: a quiet line across a conversation, its words between two hairlines. */
const meta: Meta = { title: 'Look/Marker' };
export default meta;

/** Where a marker stands in its story: a panel's width, on the card's ground. */
const PANEL = { width: 460, padding: 16, background: 'var(--md-sys-color-surface-container-low)' };

/** A line in a conversation's own type, as a conversation draws it. */
export const Quiet: StoryObj<{ words: string }> = {
  args: { words: 'Her session began · 5:40 PM' },
  render: ({ words }) => (
    <div style={PANEL}>
      <Marker className="text-body-small">{words}</Marker>
    </div>
  ),
};

/** Words that run past the panel's width: they wrap, centred, and the hairlines keep to either side. */
export const Long: StoryObj<{ words: string }> = {
  args: {
    words: 'The turn was cut short: the session reached its budget, and what it had written so far is kept above this line.',
  },
  play: async ({ canvasElement }) => {
    const line = canvasElement.querySelector<HTMLElement>('[data-slot="marker"]')!;
    const words = canvasElement.querySelector<HTMLElement>('[data-slot="marker-content"]')!;
    await expect(words.getBoundingClientRect().right, 'the words keep within the line').toBeLessThanOrEqual(
      line.getBoundingClientRect().right,
    );
    await expect(words.getBoundingClientRect().height, 'and wrap onto more than one line').toBeGreaterThan(24);
    for (const side of ['::before', '::after'])
      await expect(parseFloat(getComputedStyle(line, side).width), `a hairline is kept ${side}`).toBeGreaterThanOrEqual(24);
  },
  render: ({ words }) => (
    <div style={PANEL}>
      <Marker className="text-body-small">{words}</Marker>
    </div>
  ),
};

/** A link in its words, underlined, lit on hover. */
export const WithALink: StoryObj<{ words: string }> = {
  args: { words: 'Read the brief' },
  render: ({ words }) => (
    <div style={PANEL}>
      <Marker className="text-body-small">
        <a href="#brief">{words}</a>
      </Marker>
    </div>
  ),
};
