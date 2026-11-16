import type { Meta, StoryObj } from '@storybook/react-vite';
import { Marker } from './Marker';

/** The look's marker: a quiet line across a conversation, its words between two hairlines. */
const meta: Meta = { title: 'Look/Marker' };
export default meta;

/** Where a marker stands in its story: a panel's width, on the card's ground. */
const PANEL = { width: 460, padding: 16, background: 'var(--card)' };

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
