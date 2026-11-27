import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { CutSearch } from './CutSearch';
import { CutSearchPanel } from './CutSearchPanel';
import { ON_PLAIN } from './stories.fixture';

/** The panel of the search bar: groups with titles and lines, and the keys it answers to at its foot. It opens from the bar. */
const meta: Meta<typeof CutSearchPanel> = { title: 'Look/CutSearchPanel', component: CutSearchPanel };
export default meta;

type Story = StoryObj<typeof CutSearchPanel>;

/** Two groups: the panel lists each line under its title, the typed letters in bold, and names the keys at its foot. */
export const Groups: Story = {
  args: {
    sections: [
      { id: 'keys', title: 'Filter by', items: [{ id: 'area:', label: 'area: board, runtime', hint: '3 values', keeps: true }] },
      { id: 'recent', title: 'Recent', items: [{ id: 'recent:a', label: 'area: board · factory: globex' }] },
    ],
  },
  render: (args) => {
    const [text, setText] = useState('');
    return (
      <div style={{ ...ON_PLAIN, width: 560, height: 260 }}>
        <CutSearch
          label="Search the cards"
          chips={[]}
          onRemove={fn()}
          onPick={fn()}
          onSubmit={fn()}
          sections={args.sections}
          text={text}
          onText={setText}
        />
      </div>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await waitFor(() => expect(within(document.body).getAllByRole('option')).toHaveLength(2));
    await expect(within(document.body).getByText('Filter by')).toBeVisible();
    await expect(within(document.body).getByText('Esc to close')).toBeVisible();
    await userEvent.keyboard('{Escape}');
  },
};
