import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { ListFilter, NothingMatches } from './ListFilter';

/** A filter that holds what is typed, as a page holds it. */
function Held({ text: first }: { text: string }) {
  const [text, setText] = useState(first);
  return (
    <div style={{ width: 560 }}>
      <ListFilter label="Filter workflows" text={text} onText={setText} />
    </div>
  );
}

/** The filter over a whole list, one story a state: empty, holding a text, and the line a list says when it keeps nothing. */
const meta: Meta<typeof Held> = {
  title: 'Store/ListFilter',
  component: Held,
  args: { text: '' },
};
export default meta;

type Story = StoryObj<typeof Held>;

/** Empty: the kit's search bar, named by its hint, with no clear button. */
export const Empty: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const part = within(canvasElement);
    const field = part.getByRole('searchbox', { name: 'Filter workflows' });
    await expect(part.queryByRole('button', { name: 'Clear search' })).toBeNull();
    await userEvent.type(field, 'dev');
    await expect(field).toHaveValue('dev');
  },
};

/** Holding a text: its clear button empties it. */
export const Holding: Story = {
  args: { text: 'triage' },
  play: async ({ canvasElement, userEvent }) => {
    const part = within(canvasElement);
    await userEvent.click(part.getByRole('button', { name: 'Clear search' }));
    await expect(part.getByRole('searchbox', { name: 'Filter workflows' })).toHaveValue('');
  },
};

/** A filter that keeps nothing: the line says so and Clear the filter clears it. */
export const Nothing: StoryObj<typeof NothingMatches> = {
  args: { text: 'zzz', onClear: fn() },
  render: (args) => (
    <div style={{ width: 560 }}>
      <NothingMatches {...args} />
    </div>
  ),
  play: async ({ canvasElement, args, userEvent }) => {
    const part = within(canvasElement);
    await expect(part.getByText('zzz')).toBeVisible();
    await userEvent.click(part.getByRole('button', { name: 'Clear the filter' }));
    await expect(args.onClear).toHaveBeenCalledOnce();
  },
};
