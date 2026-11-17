import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { CardGate } from './CardGate';

/** A run of the `nemia` factory whose card the gate sits on. */
const RUN = { id: 'ship-it-k2rq', namespace: 'nemia' };

/** The ending `land`, which a send-back returns to `implement` or `review`. */
const ENDING = { step: 'land', ends: true, back: ['implement', 'review'], onto: 'main' };

/** The gate on the Factory's card, one story a state: on the card, Approve opened, and Send back opened on an ending that waits on two. */
const meta: Meta<typeof CardGate> = {
  title: 'Factory/CardGate',
  component: CardGate,
  args: { run: RUN, gate: ENDING, title: 'land merges the pull request onto main', stamp: 'land|1', onTaken: () => undefined },
  render: (args) => (
    <div style={{ width: 300, paddingBlock: 8 }}>
      <CardGate {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof CardGate>;

/** On the card: what approving does, the kit's Approve and Send back…, and the link to what is being approved. */
export const OnTheCard: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-answer="Approve"]')).toHaveAttribute('data-slot', 'button');
    await expect(canvasElement.querySelector('[data-answer="Send back"]')).toHaveAttribute('data-variant', 'outlined');
  },
};

/** Approve pressed: the kit's popover, named for what it does, the words in the kit's text field and the press that runs the ending. */
export const Approving: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-answer="Approve"]')!);
    const approval = await screen.findByRole('dialog', { name: 'Approve land' });
    const asks = within(approval);
    await expect(asks.getByRole('textbox', { name: 'Words to approve land with, if any' })).toBeVisible();
    await expect(asks.getByRole('button', { name: 'Run land now' })).toBeEnabled();
    await expect(asks.getByRole('button', { name: 'Not yet' })).toBeVisible();
    atRest();
  },
};

/** Send back pressed on an ending that waits on two: the words it needs, the kit's radios for where it goes, Send back held until words. */
export const SendingBack: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-answer="Send back"]')!);
    const sending = await screen.findByRole('dialog', { name: 'Send the work back' });
    const asks = within(sending);
    await expect(asks.getByRole('radio', { name: 'implement' })).toBeChecked();
    await expect(asks.getByRole('button', { name: 'Send back' })).toBeDisabled();
    await userEvent.click(asks.getByText('review'));
    await expect(asks.getByRole('radio', { name: 'review' })).toBeChecked();
    atRest();
  },
};
