import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, fn, screen, waitFor, within } from 'storybook/test';
import { atRest } from '../../../.storybook/play';
import { CardGate } from './CardGate';

/** A run of the `nemia` factory whose card the gate sits on. */
const RUN = { id: 'ship-it-k2rq', namespace: 'nemia' };

/** The gate of `plan`, which a send-back asks again. */
const GATE = { step: 'plan', back: ['plan'], onto: null };

/** The approval's address, as the api serves it. */
const APPROVE = '/api/namespaces/:namespace/runs/:name/steps/:step/approve';

/** The menu of the gate's other answers, opened from the split button's trailing half. */
const menuOf = async (canvasElement: HTMLElement, userEvent: { click: (element: Element) => Promise<void> }) => {
  await userEvent.click(within(canvasElement).getByRole('button', { name: 'Other answers to plan' }));
  return screen.findByRole('menu');
};

/**
 * The gate on the Factory's card, one story a state: on the card, its menu, Approve pressed and taken or refused, Approve with words…
 * opened, and Send back… opened.
 */
const meta: Meta<typeof CardGate> = {
  title: 'Factory/CardGate',
  component: CardGate,
  args: { run: RUN, gate: GATE, title: 'plan waits on your approval', stamp: 'plan|1', onTaken: () => undefined },
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
    const split = canvasElement.querySelector('[data-gate-answer="plan"] [data-slot="split-button"]');
    await expect(split).toHaveAttribute('data-variant', 'filled');
    await expect(within(canvasElement).getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(within(canvasElement).getByRole('button', { name: 'Other answers to plan' })).toHaveAttribute('aria-haspopup');
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
  args: { gate: { step: 'plan', back: [], onto: null } },
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
  tags: ['network'],
  args: { onTaken: fn() },
  parameters: {
    msw: [
      http.post(APPROVE, ({ params }) =>
        HttpResponse.json(
          { step: String(params.step), try: 1, at: '2026-11-17T10:00:00Z', message: null, file: 'approve-plan-1' },
          { status: 202 },
        ),
      ),
    ],
  },
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(args.onTaken).toHaveBeenCalledOnce());
    await expect(screen.queryByRole('dialog')).toBeNull();
    atRest();
  },
};

/** Approve pressed and refused: the approval's form opens over the card to say the refusal in the api's words. */
export const ApprovalRefused: Story = {
  tags: ['network'],
  parameters: {
    msw: [http.post(APPROVE, () => HttpResponse.json({ error: 'plan is not waiting at its gate' }, { status: 409 }))],
  },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Approve' }));
    const approval = await screen.findByRole('dialog', { name: 'Approve plan' });
    await waitFor(() => expect(within(approval).getByText('plan is not waiting at its gate')).toBeVisible());
    atRest();
  },
};

/**
 * Approve with words… chosen: the kit's popover, named for what it does, the words in the kit's text field and the press that approves.
 */
export const Approving: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const menu = await menuOf(canvasElement, userEvent);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Approve with words…' }));
    const approval = await screen.findByRole('dialog', { name: 'Approve plan' });
    const asks = within(approval);
    await expect(asks.getByRole('textbox', { name: 'Words to approve plan with, if any' })).toBeVisible();
    await expect(asks.getByRole('button', { name: 'Approve' })).toBeEnabled();
    await expect(asks.getByRole('button', { name: 'Not yet' })).toBeVisible();
    atRest();
  },
};

/** Send back… chosen: the words it needs, Send back held until there are some. */
export const SendingBack: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const menu = await menuOf(canvasElement, userEvent);
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Send back…' }));
    const sending = await screen.findByRole('dialog', { name: 'Send plan back' });
    const asks = within(sending);
    await expect(asks.getByRole('button', { name: 'Send back' })).toBeDisabled();
    atRest();
  },
};
