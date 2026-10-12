import type { Meta, StoryObj } from '@storybook/react-vite';
import type { Breakdown } from '@/lib/breakdown';
import { StatTile } from './StatTile';

/** A stat of a waiting run: the sticker tile over its breakdown, which the keyboard and a resting pointer open; and a tile alone. */
const meta: Meta = { title: 'Look/StatTile' };
export default meta;

const COST: Breakdown = {
  head: 'What $4.25 was spent on',
  rows: [
    { what: 'design', amount: 1.1, said: '$1.10', none: false },
    { what: 'implement', amount: 3.15, said: '$3.15', none: false },
    { what: 'review', amount: 0, said: 'none', none: true },
  ],
  foot: 'Every try of every step, summed.',
};

/** A tile with a breakdown: it takes the focus, and its tooltip adds up to it. */
export const WithABreakdown: StoryObj = { render: () => <StatTile hue="money" label="Cost" value="$4.25" breakdown={COST} /> };

/** A tile given no breakdown: drawn alone, it takes no focus. */
export const Alone: StoryObj = { render: () => <StatTile hue="alive" label="Clock" value="27m" breakdown={null} /> };
