import type { Meta, StoryObj } from '@storybook/react-vite';
import { delay, http } from 'msw';
import { expect, userEvent, within } from 'storybook/test';
import { ForgetToken } from './ForgetToken';

/** The room the section is drawn in, in pixels: Settings' column. */
type Args = { width: number };

/** Settings' section for this browser's token, its press the kit's outlined button: offered, and pressed while the api clears it. */
const meta: Meta<Args> = {
  tags: ['network'],
  title: 'Frame/ForgetToken',
  args: { width: 560 },
  parameters: { msw: [http.delete('/api/session', async () => delay('infinite'))] },
  render: ({ width }) => (
    <div style={{ width }}>
      <ForgetToken />
    </div>
  ),
};
export default meta;

type Story = StoryObj<Args>;

/** Offered: what forgetting does, and the press. */
export const Offered: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: "Forget this browser's token" })).toBeEnabled();
  },
};

/** Pressed: off while the api clears the cookie, before the page loads again. */
export const Forgetting: Story = {
  play: async ({ canvasElement }) => {
    const press = within(canvasElement).getByRole('button', { name: "Forget this browser's token" });
    await userEvent.click(press);
    await expect(press).toBeDisabled();
    await expect(press.querySelector('[data-pending]'), 'the press draws the indicator, its label still its name').not.toBeNull();
  },
};
