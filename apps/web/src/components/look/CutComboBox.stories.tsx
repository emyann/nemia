import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { CutComboBox } from './CutComboBox';
import { ON_PLAIN } from './stories.fixture';

/** The look's line of text with suggestions: its label above, the cut field, and the suggestions in a list beside it. */
const meta: Meta<typeof CutComboBox> = { title: 'Look/CutComboBox', component: CutComboBox };
export default meta;

type Story = StoryObj<typeof CutComboBox>;

/** The labels in use, each with how many cards hold it: picking one is `onPick`, Enter on text no suggestion is on is `onSubmit`. */
export const Suggesting: Story = {
  args: { label: 'Labels', placeholder: 'key=value', onPick: fn(), onSubmit: fn() },
  render: (args) => {
    const [text, setText] = useState('');
    return (
      <div style={{ ...ON_PLAIN, width: 360, minHeight: 240 }}>
        <CutComboBox
          {...args}
          text={text}
          onText={setText}
          suggestions={[
            { id: 'area=board', label: 'area: board', hint: '4' },
            { id: 'work=feature', label: 'work: feature', hint: '2' },
          ]}
        />
      </div>
    );
  },
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('combobox', { name: 'Labels' }));
    await userEvent.click(await within(document.body).findByRole('option', { name: /area: board/ }));
    await expect(args.onPick).toHaveBeenCalledWith('area=board');
  },
};
