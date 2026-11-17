import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import type { TokenAsked } from '@/lib/api/read';
import { TokenPage } from './TokenPage';

/** The token page, a story a state: a browser that sent no token, and one whose token this Nemia no longer keeps, in the api's words. */
const meta: Meta<typeof TokenPage> = {
  title: 'Frame/TokenPage',
  component: TokenPage,
  args: { asked: { reason: 'token-required', message: '' } satisfies TokenAsked },
};
export default meta;

type Story = StoryObj<typeof TokenPage>;

/** No token sent: the kit's field asks for one, and Use this token waits on a token typed. */
export const TokenRequired: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const field = page.getByLabelText('Token');
    await expect(field).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Use this token' })).toBeDisabled();
    await userEvent.type(field, 'nmt_k3p9q');
    await expect(page.getByRole('button', { name: 'Use this token' })).toBeEnabled();
  },
};

/** A token this Nemia no longer keeps: why it asks again, and the api's own words. */
export const UnknownToken: Story = {
  args: {
    asked: {
      reason: 'unknown-token',
      message: 'unknown token: this Nemia keeps no token by that value',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no token this Nemia keeps/)).toBeVisible();
  },
};
