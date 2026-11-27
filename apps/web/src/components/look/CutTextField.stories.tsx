import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Button } from '@/components/ui/ds';
import { CutTextField } from './CutTextField';
import { ON_PLAIN } from './stories.fixture';

/** The look's one-line text field: its label above, the cut field, and a line of help under it. */
const meta: Meta<typeof CutTextField> = { title: 'Look/CutTextField', component: CutTextField };
export default meta;

type Story = StoryObj<typeof CutTextField>;

/** A field with its label above and a hint inside; typing fills it. */
export const Plain: Story = {
  args: { label: 'Title', placeholder: 'What the card is about' },
  render: (args) => (
    <div style={{ ...ON_PLAIN, width: 420 }}>
      <CutTextField {...args} />
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const field = within(canvasElement).getByRole('textbox', { name: 'Title' });
    await userEvent.type(field, 'A new card');
    await expect(field).toHaveValue('A new card');
  },
};

/** A field with a line of help under it, and a button at its end. */
export const WithHelpAndEnd: Story = {
  args: { label: 'Filter by labels', description: 'Labels as key=value, joined by commas.' },
  render: (args) => {
    const [value, setValue] = useState('team=core');
    return (
      <div style={{ ...ON_PLAIN, width: 480 }}>
        <CutTextField
          {...args}
          value={value}
          onChange={setValue}
          end={
            <Button type="submit" size="xsmall" variant="tonal">
              Filter
            </Button>
          }
        />
      </div>
    );
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox', { name: 'Filter by labels' })).toHaveAccessibleDescription(
      'Labels as key=value, joined by commas.',
    );
  },
};

/** A field whose label is for a screen reader alone, where its place says what it is. */
export const HiddenLabel: Story = {
  args: { label: 'Filter by labels', hideLabel: true, placeholder: 'Filter by labels: team=core' },
  render: (args) => (
    <div style={{ ...ON_PLAIN, width: 420 }}>
      <CutTextField {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox', { name: 'Filter by labels' })).toBeVisible();
  },
};
