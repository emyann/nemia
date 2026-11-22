import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { sent, TAKEN, templatesServed, writesRefused } from '../../../.storybook/fixtures/templates';
import { ScratchForm } from './ScratchForm';

/** What a story of the form draws: what is told of a factory made. */
type Args = { onMade: (name: string) => void };

/** The scratch way's form: a name and nothing else, an empty factory filed. Its filing is answered by MSW, which keeps what it was sent. */
const meta: Meta<Args> = {
  tags: ['network'],
  title: 'Pages/Scratch form',
  args: { onMade: fn() },
  parameters: { msw: templatesServed },
  render: (args) => (
    <div style={{ width: 560 }}>
      <ScratchForm {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** No name yet: the press waits on one. */
export const Blank: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Make an empty factory' })).toBeDisabled();
  },
};

/** A name typed and pressed: the factory filed by its name alone, with no volume, and told made. */
export const Made: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const form = within(canvasElement);
    sent.length = 0;
    await userEvent.type(form.getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.click(form.getByRole('button', { name: 'Make an empty factory' }));
    await waitFor(() => expect(args.onMade).toHaveBeenCalledWith('my-app'), { timeout: 5000 });
    await expect(sent).toEqual([{ route: 'POST /api/factories', body: { name: 'my-app' } }]);
  },
};

/** The filing refused: the api's words said as an alert, and the press offered again. */
export const Refused: Story = {
  parameters: { msw: writesRefused },
  play: async ({ args, canvasElement, userEvent }) => {
    const form = within(canvasElement);
    await userEvent.type(form.getByRole('textbox', { name: /Name/ }), 'my-app');
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(canvasElement.querySelector('[data-factory-refused]')).toHaveTextContent(TAKEN), { timeout: 5000 });
    await expect(canvasElement.querySelector('[data-factory-refused]')).toHaveAttribute('role', 'alert');
    await expect(form.getByRole('button', { name: 'Make an empty factory' })).toBeEnabled();
    await expect(args.onMade).not.toHaveBeenCalled();
  },
};
