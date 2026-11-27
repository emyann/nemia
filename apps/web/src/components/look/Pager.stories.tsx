import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSearch } from '@tanstack/react-router';
import { expect } from 'storybook/test';
import { atRest, tabStops } from '../../../.storybook/play';
import { finishedSearch, trailOf } from '@/lib/finished';
import { Pager } from './Pager';

/** The pager of the finished runs, on the page its address's trail leads to, of three: on the first, and on the last. */
const meta: Meta = { title: 'Look/Pager' };
export default meta;

/** The pager standing on the page the story's address leads to: nine rows on the first two, seven on the last, which has no next. */
function Standing() {
  const trail = trailOf(finishedSearch(useSearch({ strict: false })));
  const last = trail.length >= 2;
  return <Pager trail={trail} next={last ? null : `f.page${trail.length + 2}`} count={last ? 7 : 9} total={25} size={9} />;
}

/** The marks of every stop the Tab key makes in the story. */
const stopsOf = async (user: Parameters<typeof tabStops>[0]) => (await tabStops(user)).flatMap((stop) => stop.marks);

/** On the first page: Newer leads nowhere, takes no focus, and is no link. */
export const OnTheFirstPage: StoryObj = {
  render: () => <Standing />,
  play: async ({ canvasElement, userEvent }) => {
    const stops = await stopsOf(userEvent);
    await expect(stops, `Tab reaches Older: ${stops.join(' ')}`).toContain('pagerOlder');
    await expect(stops, 'on the first page Newer takes no focus').not.toContain('pagerNewer');
    const newer = canvasElement.querySelector('[data-pager-newer]');
    await expect(newer?.getAttribute('aria-disabled')).toBe('true');
    await expect(newer?.getAttribute('href')).toBeNull();
    atRest();
  },
};

/** On the last page: Older leads nowhere, takes no focus, and is no link. */
export const OnTheLastPage: StoryObj = {
  parameters: { at: '/?older=f.page2~f.page3' },
  render: () => <Standing />,
  play: async ({ userEvent }) => {
    const ends = await stopsOf(userEvent);
    await expect(ends, `on the last page Newer takes the focus: ${ends.join(' ')}`).toContain('pagerNewer');
    await expect(ends, `on the last page Older takes no focus: ${ends.join(' ')}`).not.toContain('pagerOlder');
    atRest();
  },
};

/** The pager of the cards, its ends following the sort: Newer and Older, or Older and Newer. */
export const OfCards: StoryObj<typeof Pager> = {
  args: { noun: 'Cards', trail: [], next: 'bmV4dA', count: 12, total: 30, size: 12, ends: ['Older', 'Newer'] },
  render: (args) => <Pager {...args} />,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-pager-rows]')).toHaveTextContent('Cards 1–12 of 30');
    await expect(canvasElement.querySelector('[data-pager-older]')).toHaveTextContent('Newer');
  },
};
