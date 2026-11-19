import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { volumeStore } from '../../../.storybook/fixtures/folders';
import { FolderPick, InitOffer } from './FolderPick';

/** What a story of the field draws: what is told of a folder used, and whether a volume is being added. */
type Args = { onUse: (path: string, repository: boolean | undefined) => void; pending: boolean };

/** The folder way's field: a path typed, the folders under it offered by the api's listing (MSW), and Use this folder. */
const meta: Meta<Args> = {
  title: 'Pages/Folder pick',
  args: { onUse: fn(), pending: false },
  parameters: { msw: volumeStore() },
  render: (args) => (
    <div style={{ width: 560 }}>
      <FolderPick {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** Nothing typed: Use waits on an absolute path. */
export const Blank: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Use this folder' })).toBeDisabled();
  },
};

/** A repository's folder typed and used: handed on with the listing's word that it is one. */
export const Used: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('combobox', { name: /Folder/ }), '/home/you/code/acme');
    await new Promise((resolve) => setTimeout(resolve, 600));
    await userEvent.keyboard('{Escape}');
    await userEvent.click(canvas.getByRole('button', { name: 'Use this folder' }));
    await waitFor(() => expect(args.onUse).toHaveBeenCalledWith('/home/you/code/acme', true));
  },
};

/** A volume being added: the field and the press held. */
export const Adding: Story = {
  args: { pending: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Use this folder' })).toBeDisabled();
  },
};

/** The offer to make a folder a repository, as the step draws it, and the words it says on a no. */
export const Offer: StoryObj<typeof InitOffer> = {
  args: { path: '/home/you/code/notes', declined: false, onYes: fn(), onNo: fn(), onAnother: fn() },
  render: (args) => (
    <div style={{ width: 560 }}>
      <InitOffer {...args} />
    </div>
  ),
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'No' }));
    await expect(args.onNo).toHaveBeenCalledOnce();
  },
};

/** The offer declined: the step says why, and offers the repository again or another folder. */
export const OfferDeclined: StoryObj<typeof InitOffer> = {
  ...Offer,
  args: { ...Offer.args, declined: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-init-declined]')).not.toBeNull();
    await expect(within(canvasElement).queryByRole('button', { name: 'No' })).toBeNull();
  },
};
