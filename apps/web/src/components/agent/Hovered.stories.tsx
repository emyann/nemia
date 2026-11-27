import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Tag } from '@/components/ui/ds';
import { Hovered } from './Hovered';

/** A part that is not a control, with the sentence that says what it is on hover and on focus. */
const meta: Meta<typeof Hovered> = {
  title: 'Frame/Hovered',
  component: Hovered,
  args: {
    said: 'Reviewer belongs to factory acme, so it can not be edited here.',
    children: (
      <Tag variant="outlined" color="neutral">
        Read only
      </Tag>
    ),
  },
};
export default meta;

type Story = StoryObj<typeof Hovered>;

/** The tag at rest. */
export const AtRest: Story = {};

/** The keyboard reaches the tag, and the sentence shows. */
export const Focused: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByText('Read only')).toBeVisible();
    await expect(await within(document.body).findByRole('tooltip')).toHaveTextContent(/belongs to factory acme/);
  },
};
