import type { Meta, StoryObj } from '@storybook/react-vite';
import { delay, http, HttpResponse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { Answer } from '@/lib/asks';
import { TARGET_RUNS } from '../../../.storybook/fixtures/runs';
import { RaiseRow } from './Raise';

/** A raise, as the gate's Decide section offers one. */
type Offer = Extract<Answer, { case: 'raise' }>;

/** A step over its budget, offered a raise with its try. */
const OVER: Offer = {
  step: 'implement',
  case: 'raise',
  kind: 'retry',
  message: 'over budget $4.25 of $3',
  by: 'retry',
  above: 4.25,
  said: '$4.25',
  modes: ['continue', 'fresh', 'recheck'],
  own: 'failed (check)',
  needs: null,
  unfinished: false,
  questions: [],
};

/** What the api was asked to try again with, each ask's body in order. */
const asked: unknown[] = [];

/**
 * A step past its budget offered the raise of its cap, a story a state: over it, its box started at the next whole dollar; and a loop's
 * round. The api holds each ask unanswered, so a play reads what was sent.
 */
const meta: Meta<{ offer: Offer }> = {
  title: 'Run/Raise',
  args: { offer: OVER },
  parameters: {
    msw: [
      http.get('/api/runs/:name', () => HttpResponse.json(TARGET_RUNS['1sw7'])),
      http.post('/api/namespaces/:namespace/runs/:name/steps/:step/retry', async ({ request }) => {
        asked.push(await request.json());
        return delay('infinite');
      }),
    ],
  },
  render: ({ offer }) => (
    <ul style={{ maxWidth: 640 }}>
      <RaiseRow runId="kit-parts-1sw7" offer={offer} />
    </ul>
  ),
};
export default meta;

type Story = StoryObj<{ offer: Offer }>;

/** Over its budget: the box at $5.00; a cap typed with its cents and Enter asks with that cap, as typed. */
export const Over: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const field = page.getByRole('textbox', { name: 'The cap to raise implement to, in dollars' });
    await expect(field).toHaveValue('$5.00');
    await userEvent.clear(field);
    await userEvent.type(field, '7.25{Enter}');
    await waitFor(() => expect(asked.at(-1)).toMatchObject({ mode: 'continue', budget: 7.25 }));
    await waitFor(() => expect(page.getByRole('button', { name: 'Asking…' })).toBeDisabled());
  },
};

/** A loop's round past its cap: the box, and Raise the budget and go round again. */
export const Round: Story = {
  args: {
    offer: {
      ...OVER,
      step: 'review',
      by: 'round',
      above: 2.1,
      said: '$2.10',
      modes: [],
      own: null,
      message: 'over budget — implement $2.10 of $2',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('textbox', { name: 'The cap to raise review to, in dollars' })).toHaveValue('$3.00');
    await expect(within(canvasElement).getByRole('button', { name: 'Raise the budget and go round again' })).toBeEnabled();
  },
};
