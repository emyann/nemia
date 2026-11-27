import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { CutTextArea } from './CutTextArea';
import { ON_PLAIN } from './stories.fixture';

/** The look's several-line text field: its label above and the cut field around the text. */
const meta: Meta<typeof CutTextArea> = { title: 'Look/CutTextArea', component: CutTextArea };
export default meta;

type Story = StoryObj<typeof CutTextArea>;

/** Four lines, a hint inside; typing fills it. */
export const Plain: Story = {
  args: { label: 'Details', placeholder: 'What it is about.' },
  render: (args) => (
    <div style={{ ...ON_PLAIN, width: 420 }}>
      <CutTextArea {...args} />
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Details' });
    await userEvent.type(field, 'One line.');
    await expect(field).toHaveValue('One line.');
  },
};
