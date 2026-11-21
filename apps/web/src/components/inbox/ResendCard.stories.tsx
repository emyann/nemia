import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { Card, CardResent } from 'objects';
import { FACTORY } from '../../../.storybook/fixtures/proposals';
import { ResendCard } from './ResendCard';

/** The Card's `resend`, as the api serves it. */
const RESEND = '/api/namespaces/:namespace/cards/:name/resend';

/** Each body the `resend` stories were sent, newest last. */
const sent: unknown[] = [];

/** The card a send on files, `<run>-resent`, on `workflow` or none. */
const filedCard = (workflow?: string) =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Card',
    metadata: { name: 'ship-it-k2rq-resent', namespace: FACTORY, creationTimestamp: '2026-11-21T10:00:00.000Z', resourceVersion: '1' },
    spec: { body: 'Ship it.\n', from: ['ship-it-k2rq'], ...(workflow === undefined ? {} : { workflow }) },
    status: {
      state: workflow === undefined ? 'filed' : 'queued',
      runs: [],
      inPlay: true,
      title: 'Ship it.',
      file: 'ship-it-k2rq-resent.md',
    },
  }) satisfies Card;

/** The api taking the send on: the body kept in `sent`, and the card filed answered with the run cancelled. */
const takes = http.post(RESEND, async ({ request }) => {
  const body = (await request.json()) as { workflow?: string };
  sent.push(body);
  const answer: CardResent = {
    card: filedCard(body.workflow),
    from: { card: 'ship-it', run: 'ship-it-k2rq' },
    cancelled: 'ship-it-k2rq',
  };
  return HttpResponse.json(answer, { status: 201 });
});

/**
 * A started card sent on, one story a state: the factory's workflows and none to choose among, a workflow picked and sent, none picked and
 * sent with no workflow, and a refusal told in the api's words.
 */
const meta: Meta<typeof ResendCard> = {
  title: 'Store/ResendCard',
  component: ResendCard,
  args: { entry: { name: 'ship-it', factory: FACTORY }, workflows: ['intake', 'build', 'quick'], onRefused: () => undefined },
  parameters: { msw: [takes] },
  render: (args) => (
    <div style={{ width: 560 }}>
      <ResendCard {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof ResendCard>;

/** Opened: each workflow its factory offers and none, none chosen, and Send on. */
export const Choosing: Story = {
  play: async ({ canvasElement }) => {
    const radios = within(canvasElement).getAllByRole('radio');
    await expect(radios).toHaveLength(4);
    await expect(within(canvasElement).getByRole('radio', { name: /None/ })).toBeChecked();
    await expect(within(canvasElement).getByRole('button', { name: 'Send on' })).toBeEnabled();
  },
};

/** intake picked and Send on pressed: the body names intake, and no refusal is told. */
export const ToAWorkflow: Story = {
  args: { onRefused: fn() },
  play: async ({ args, canvasElement, userEvent }) => {
    sent.length = 0;
    await userEvent.click(within(canvasElement).getByRole('radio', { name: 'intake' }));
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Send on' }));
    await waitFor(() => expect(sent).toEqual([{ workflow: 'intake' }]));
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'Send on' })).toBeEnabled());
    await expect(args.onRefused).not.toHaveBeenCalledWith(expect.any(String));
  },
};

/** None left chosen and Send on pressed: the body names no workflow, for its factory's card triggers. */
export const ToItsTriggers: Story = {
  play: async ({ canvasElement, userEvent }) => {
    sent.length = 0;
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Send on' }));
    await waitFor(() => expect(sent).toEqual([{}]));
  },
};

/** Refused, its run still at work: the api's words are told to `onRefused`. */
export const Refused: Story = {
  args: { onRefused: fn() },
  parameters: {
    msw: [http.post(RESEND, () => HttpResponse.json({ error: 'ship-it: its run ship-it-k2rq is still at work' }, { status: 409 }))],
  },
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Send on' }));
    await waitFor(() => expect(args.onRefused).toHaveBeenCalledWith(expect.stringContaining('still at work')));
  },
};
