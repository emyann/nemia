import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { commandLine, OPEN_WORDS } from 'objects';
import type { TokenAsked } from '@/lib/api/read';
import { TokenPage } from './TokenPage';

/**
 * The token page, a story a state: on a store marked exposed, a browser that sent no token, and one whose token this Nemia no longer
 * keeps, in the api's words; on a store served on this machine alone, the same two, which name the command that opens the board here (`OPEN_WORDS`) and ask for no token.
 */
const meta: Meta<typeof TokenPage> = {
  title: 'Frame/TokenPage',
  component: TokenPage,
  args: { asked: { reason: 'token-required', message: '', exposed: true } satisfies TokenAsked },
};
export default meta;

type Story = StoryObj<typeof TokenPage>;

/** The command the page names on a store served on this machine alone, as `objects` says it. */
const OPEN = commandLine(OPEN_WORDS, {});

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
      exposed: true,
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no token this Nemia keeps/)).toBeVisible();
  },
};

/**
 * On this machine, no token sent: the page names the command that opens the board here (`OPEN_WORDS`) and draws no token field until the person opens the disclosure, which
 * holds the field for someone handed a token.
 */
export const OpenHere: Story = {
  args: {
    asked: {
      reason: 'token-required',
      message: 'every route of the api takes a token, on loopback as on a shared address',
      exposed: false,
    },
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('heading', { name: 'Open Nemia from your terminal' })).toBeVisible();
    await expect(canvasElement.querySelector('[data-token-way] code')).toHaveTextContent(OPEN);
    await expect(page.queryByLabelText('Token')).toBeNull();
    await expect(page.queryByRole('region', { name: 'Pair this browser' })).toBeNull();
    await userEvent.click(page.getByRole('button', { name: 'I was given a token' }));
    await expect(page.getByLabelText('Token')).toHaveAttribute('type', 'password');
  },
};

/** On this machine, a sign-in this Nemia no longer keeps: why, and the same command, with no token asked. */
export const OpenHereUnknownToken: Story = {
  args: { asked: { reason: 'unknown-token', message: 'unknown token: this Nemia keeps no token by that value', exposed: false } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText(/no longer one this Nemia keeps/)).toBeVisible();
    await expect(canvasElement.querySelector('[data-token-way] code')).toHaveTextContent(OPEN);
    await expect(within(canvasElement).queryByLabelText('Token')).toBeNull();
  },
};
