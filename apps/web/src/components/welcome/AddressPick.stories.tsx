import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { ACME, volumeStore } from '../../../.storybook/fixtures/folders';
import { AddressPick } from './AddressPick';

/** What a story of the panel draws: the factory, what is told of an address cloned, whether a clone is out, and a refusal. */
type Args = { factory: string; onClone: (address: string) => void; pending: boolean; refused?: string };

/** The address way's panel: this factory's missing needs with their fixes (MSW's readiness read), then the address and Clone. */
const meta: Meta<Args> = {
  title: 'Pages/Address pick',
  args: { factory: ACME, onClone: fn(), pending: false },
  parameters: { msw: volumeStore() },
  render: (args) => (
    <div style={{ width: 560 }}>
      <AddressPick {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The factory's host sign-in missing: drawn first, with its fix; the address is handed on as typed. */
export const NeedFirst: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    await waitFor(() => expect(canvasElement.querySelector('[data-address-need="gh-sign-in"]')).not.toBeNull(), { timeout: 5000 });
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: /Address/ }), 'https://github.com/you/acme.git');
    await userEvent.click(canvas.getByRole('button', { name: 'Clone it' }));
    await expect(args.onClone).toHaveBeenCalledWith('https://github.com/you/acme.git');
  },
};

/** A clone out: it says it may take minutes, and holds the press. */
export const Cloning: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-address-cloning]')).not.toBeNull();
  },
};

/** A clone refused: the api's words under the field. */
export const Refused: Story = {
  args: { refused: 'git@github.com:you/acme.git could not be cloned: give the machine an SSH key that github.com accepts, then ask again' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-volume-refused]')).toBeVisible();
  },
};
