import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { CutSearch } from './CutSearch';
import { ON_PLAIN } from './stories.fixture';

/** The look's search bar: a magnifier, the chips of what was picked, and the words being typed, with suggestions in a list beside it. */
const meta: Meta<typeof CutSearch> = { title: 'Look/CutSearch', component: CutSearch };
export default meta;

type Story = StoryObj<typeof CutSearch>;

/** Empty: the hint says what to search. */
export const Empty: Story = {
  args: {
    label: 'Search the cards',
    placeholder: 'Search the cards: words, labels',
    chips: [],
    suggestions: [],
    onRemove: fn(),
    onPick: fn(),
    onSubmit: fn(),
  },
  render: (args) => {
    const [text, setText] = useState('');
    return (
      <div style={{ ...ON_PLAIN, width: 560 }}>
        <CutSearch {...args} text={text} onText={setText} />
      </div>
    );
  },
  play: async ({ args, canvasElement, userEvent }) => {
    const bar = within(canvasElement).getByRole('combobox', { name: 'Search the cards' });
    await userEvent.type(bar, 'reads{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('reads');
  },
};

/** Two chips in the bar: each says what it stands for and has a key that takes it off; Backspace on empty words takes the last. */
export const WithChips: Story = {
  args: {
    label: 'Search the cards',
    chips: [
      { id: 'q', label: '“reads”' },
      { id: 'area=board', label: 'area: board' },
    ],
    suggestions: [{ id: 'work=feature', label: 'work: feature', hint: '2' }],
    onRemove: fn(),
    onPick: fn(),
    onSubmit: fn(),
  },
  render: (args) => {
    const [text, setText] = useState('');
    return (
      <div style={{ ...ON_PLAIN, width: 560 }}>
        <CutSearch {...args} text={text} onText={setText} />
      </div>
    );
  },
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Take off “reads”' }));
    await expect(args.onRemove).toHaveBeenCalledWith('q');
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }));
    await expect(within(canvasElement).getByRole('button', { name: 'Take off area: board' })).toBeVisible();
    await userEvent.keyboard('{Backspace}');
    await expect(args.onRemove).toHaveBeenCalledWith('area=board');
  },
};

/** Words kept with Enter become a chip, and the suggestions close: the chip's key is found by its role, which an open list would hide. */
export const Kept: Story = {
  args: {
    label: 'Search the cards',
    chips: [],
    suggestions: [{ id: 'work=feature', label: 'work: feature', hint: '2' }],
    onRemove: fn(),
    onPick: fn(),
    onSubmit: fn(),
  },
  render: (args) => {
    const [text, setText] = useState('');
    const [kept, setKept] = useState<string | null>(null);
    return (
      <div style={{ ...ON_PLAIN, width: 560 }}>
        <CutSearch
          {...args}
          chips={kept === null ? [] : [{ id: 'q', label: `“${kept}”` }]}
          text={text}
          onText={setText}
          onSubmit={(words) => {
            setKept(words);
            setText('');
          }}
        />
      </div>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.type(within(canvasElement).getByRole('combobox', { name: 'Search the cards' }), 'reads{Enter}');
    await waitFor(() => expect(within(document.body).getByRole('button', { name: 'Take off “reads”' })).toBeVisible());
    await expect(within(document.body).queryByRole('listbox')).toBeNull();
  },
};
