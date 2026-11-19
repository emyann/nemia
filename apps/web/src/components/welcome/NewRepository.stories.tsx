import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import { NewRepository } from './NewRepository';

/** What a story of the form draws: what is told of a name given, whether it is being made, and a refusal. */
type Args = { onMake: (name: string) => void; pending: boolean; refused?: string };

/** The new way's form: a name, and an empty repository made in Nemia's store. */
const meta: Meta<Args> = {
  title: 'Pages/New repository',
  args: { onMake: fn(), pending: false },
  render: (args) => (
    <div style={{ width: 560 }}>
      <NewRepository {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** A name typed and made: handed on as typed. */
export const Named: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Make it' })).toBeDisabled();
    await userEvent.type(canvas.getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(canvas.getByRole('button', { name: 'Make it' }));
    await expect(args.onMake).toHaveBeenCalledWith('my-app');
  },
};

/** A name refused: the api's words under the field. */
export const Refused: Story = {
  args: {
    refused:
      "`My App` is not a repository's name: a name is lowercase letters, digits, dots, dashes and underscores — acme or my-app, say.",
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('alert')).toBeVisible();
  },
};
