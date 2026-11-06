import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSearch } from '@tanstack/react-router';
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

/** On the first page: Newer leads nowhere, and is no link. */
export const OnTheFirstPage: StoryObj = { render: () => <Standing /> };

/** On the last page: Older leads nowhere, and is no link. */
export const OnTheLastPage: StoryObj = { parameters: { at: '/?older=f.page2~f.page3' }, render: () => <Standing /> };
