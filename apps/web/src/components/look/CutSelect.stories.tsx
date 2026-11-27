import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CutSelect } from './CutSelect';
import { ON_PLAIN } from './stories.fixture';

/** The look's one choice among a few: its label above, the word chosen in the cut field, and the choices in a list beside it. */
const meta: Meta<typeof CutSelect> = { title: 'Look/CutSelect', component: CutSelect };
export default meta;

type Story = StoryObj<typeof CutSelect>;

/** Nothing chosen: the hint shows; opened, the choices list; picking one says it in the field. */
export const Choosing: Story = {
  args: {
    label: 'Factory',
    placeholder: 'No factory: chosen at start',
    choices: [
      { id: 'nemia', label: 'nemia' },
      { id: 'hiring', label: 'hiring' },
    ],
  },
  render: (args) => {
    const [value, setValue] = useState('');
    return (
      <div style={{ ...ON_PLAIN, width: 360 }}>
        <CutSelect {...args} value={value} onChange={setValue} />
      </div>
    );
  },
  play: async ({ canvasElement, userEvent }) => {
    const page = within(canvasElement);
    await userEvent.click(page.getByRole('button', { name: /Factory/ }));
    await userEvent.click(await within(document.body).findByRole('option', { name: 'hiring' }));
    await expect(page.getByRole('button', { name: /Factory/ })).toHaveTextContent('hiring');
  },
};
