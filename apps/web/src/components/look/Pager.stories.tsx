import type { Meta, StoryObj } from '@storybook/react-vite';
import { useSearch } from '@tanstack/react-router';
import { finishedSearch, pageAt } from '@/lib/finished';
import { Pager } from './Pager';

/** The pager of the finished runs, on the page its address names, of three: on the first, and on the last. */
const meta: Meta = { title: 'Look/Pager' };
export default meta;

/** The pager standing on the page the story's address names. */
function Standing() {
  const page = pageAt(finishedSearch(useSearch({ strict: false })));
  return <Pager page={page} pages={3} total={25} size={9} />;
}

/** On the first page: Newer leads nowhere, and is no link. */
export const OnTheFirstPage: StoryObj = { render: () => <Standing /> };

/** On the last page: Older leads nowhere, and is no link. */
export const OnTheLastPage: StoryObj = { parameters: { at: '/?page=3' }, render: () => <Standing /> };
