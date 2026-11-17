import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, fn, screen, waitFor, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { CardGate } from './CardGate';

/** A run of the `nemia` factory whose card the gate sits on. */
const RUN = { id: 'ship-it-k2rq', namespace: 'nemia' };

/** The ending `land`, which a send-back returns to `implement` or `review`. */
const ENDING = { step: 'land', ends: true, back: ['implement', 'review'], onto: 'main' };

/** The approval's address, as the api serves it. */
const APPROVE = '/api/namespaces/:namespace/runs/:name/steps/:step/approve';

/** The menu of the gate's other answers, opened from the split button's trailing half. */
const menuOf = async (canvasElement: HTMLElement, userEvent: { click: (element: Element) => Promise<void> }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Other answers to land' }));
  return screen.findByRole('menu');
};

/**
 * The gate on the Factory's card, one story a state: on the card, Approve pressed and taken, Approve refused, Approve with words… opened,
 * and Send back… opened on an ending that waits on two.
 */
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

/** On the card: what approving does, the kit's split button — Approve, and the menu of the other answers — and the link to what is read. */
export const OnTheCard: Story = {
  play: async ({ canvasElement }) => {
    const split = canvasElement.querySelector('[data-gate-answer="land"] [data-slot="split-button"]');
    await expect(split).toHaveAttribute('data-variant', 'filled');
    await expect(within(canvasElement).getByRole('button', { name: 'Approve', exact: true })).toBeEnabled();
    await expect(within(canvasElement).getByRole('button', { name: 'Other answers to land' })).toHaveAttribute('aria-haspopup');
  },
};

/** The trailing half pressed: the menu holds Approve with words… and Send back…, in that order. */
export const Answers: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const menu = await menuOf(canvasElement, userEvent);
    const items = within(menu).getAllByRole('menuitem');
    await expect(items.map((item) => item.textContent)).toEqual(['Approve with words…', 'Send back…']);
  },
};

/** A gate no send-back reaches: its menu holds Approve with words… alone. */
export const ApprovalAlone: Story = {
  args: { gate: { step: 'land', ends: true, back: [], onto: 'main' } },
  play: async ({ canvasElement, userEvent }) => {
    const menu = await menuOf(canvasElement, userEvent);
    await expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Approve with words…']);
  },
};

/** Approve pressed: the approval is sent at once, with no words, and the card is told it was taken. */
export const Approved: Story = {
  args: { onTaken: fn() },
  parameters: {
    msw: [
      http.post(APPROVE, ({ params }) =>
        HttpResponse.json(
          { step: String(params.step), try: 1, at: '2026-11-17T10:00:00Z', message: null, file: 'approve-land-1' },
          { status: 202 },
        ),
      ),
    ],
  },
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Approve', exact: true }));
    await waitFor(() => expect(args.onTaken).toHaveBeenCalledOnce());
    await expect(screen.queryByRole('dialog')).toBeNull();
    atRest();
  },
};

/** Approve pressed and refused: the approval's form opens over the card to say the refusal in the api's words. */
export const ApprovalRefused: Story = {
  parameters: {
    msw: [http.post(APPROVE, () => HttpResponse.json({ error: 'land is not waiting at its gate' }, { status: 409 }))],
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Approve', exact: true }));
    const approval = await screen.findByRole('dialog', { name: 'Approve land' });
    await expect(await within(approval).findByText('land is not waiting at its gate')).toBeVisible();
    atRest();
  },
};

/** Approve with words… chosen: the kit's popover, named for what it does, the words in the kit's text field and the press that runs the ending. */
export const Approving: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const menu = await menuOf(canvasElement, userEvent);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Approve with words…' }));
    const approval = await screen.findByRole('dialog', { name: 'Approve land' });
    const asks = within(approval);
    await expect(asks.getByRole('textbox', { name: 'Words to approve land with, if any' })).toBeVisible();
    await expect(asks.getByRole('button', { name: 'Run land now' })).toBeEnabled();
    await expect(asks.getByRole('button', { name: 'Not yet' })).toBeVisible();
    atRest();
  },
};

/** Send back… chosen on an ending that waits on two: the words it needs, the kit's radios for where it goes, Send back held until words. */
export const SendingBack: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const menu = await menuOf(canvasElement, userEvent);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Send back…' }));
    const sending = await screen.findByRole('dialog', { name: 'Send the work back' });
    const asks = within(sending);
    await expect(asks.getByRole('radio', { name: 'implement' })).toBeChecked();
    await expect(asks.getByRole('button', { name: 'Send back' })).toBeDisabled();
    await userEvent.click(asks.getByText('review'));
    await expect(asks.getByRole('radio', { name: 'review' })).toBeChecked();
    atRest();
  },
};
