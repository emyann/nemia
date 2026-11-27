import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, sse } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import type { StepTranscript } from 'objects';
import { StepBar, StepPanel } from './StepBar';
import { transcriptPath } from '@/lib/api/steps';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';
import { streamsOf } from '../../../.storybook/streams';
import { saysReading, Unread } from '../../../.storybook/unread';

/** A step at work, its session started: a conversation the bar follows once it is opened. */
const AT_WORK = runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)]));

/** The bar's address of the step at work, so its menu holds Open. */
const AT = `/?bar=step:${AT_WORK.id}/design`;

/** What the step's conversation reads as, live, so the bar follows it from its cursor. */
const TALK: StepTranscript = {
  events: [
    { id: 'a-1', at: '2026-10-12T17:02:00.000Z', role: 'assistant', kind: 'text', text: 'Reading the spec before I touch the bar.' },
    { id: 'a-2', at: '2026-10-12T17:03:00.000Z', role: 'assistant', kind: 'text', text: 'The panel is the step’s card now.' },
  ],
  cursor: 'a-2',
  live: true,
  open: true,
};

/** A read that never settles: every query of the story's client but the conversation's. */
const stillOut = () => new Promise<never>(() => undefined);

/**
 * A query client whose reads are each still out, but the step's conversation's: no other read reaches the network, and the
 * conversation's read and its stream, answered by the story's handlers, are the only requests the bar makes.
 */
function talkingClient() {
  const client = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
  const defaulted = client.defaultQueryOptions.bind(client);
  client.defaultQueryOptions = (options) => ({
    ...defaulted(options),
    ...(options.queryKey?.[0] === 'transcript' ? {} : { queryFn: stillOut }),
  });
  return client;
}

/** Holds `children` under `talkingClient`. */
function Talking({ children }: { children: ReactNode }) {
  const [client] = useState(talkingClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** The step's conversation, read as `TALK`, and its stream, held open and saying nothing, as a session at work between two turns. */
const followed = [
  http.get(transcriptPath(AT_WORK.id, 'design'), () => HttpResponse.json(TALK)),
  sse(`${transcriptPath(AT_WORK.id, 'design')}/stream`, () => undefined),
];

/** The bar's ⋯ menu in `canvas`, opened, and its item `label` pressed. */
async function pick(canvas: HTMLElement, label: string) {
  await userEvent.click(within(canvas).getByRole('button', { name: 'More actions' }));
  await userEvent.click(await within(canvas.ownerDocument.body).findByRole('menuitem', { name: label }));
}

/** A step's bar: here while its run is read, in the shape of what it holds; then the step's card, and its conversation once opened. */
const meta: Meta<typeof StepBar> = {
  title: 'Run/StepBar',
  component: StepBar,
  args: { run: 'r-1', step: 'design' },
  render: (args) => (
    <Unread>
      <div style={{ width: 420 }}>
        <StepBar {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** The run still read. */
export const Reading: StoryObj<typeof meta> = {
  play: saysReading('Reading the run…'),
};

/** The bar of a step at work, as the sheet holds it: its height, 400 wide, on the page's ground. */
function Sheet({ children }: { children: ReactNode }) {
  return (
    <Talking>
      <div className="bg-background" style={{ width: 400, height: 720, padding: 16, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </Talking>
  );
}

/**
 * The step's card: the whole bar one cut frame in the step's hue, alive, the part whole on its grain with no frame of its own and no link
 * to the step's page, the ⋯ menu holding Open and Open conversation, and no conversation. Its conversation, opened from the menu, is
 * followed while it shows, and Back closes its stream: none is left open.
 */
export const TheCard: StoryObj<typeof meta> = {
  tags: ['network'],
  parameters: { at: AT, msw: { handlers: followed } },
  render: () => (
    <Sheet>
      <StepPanel id={AT_WORK.id} name="design" run={AT_WORK} error={undefined} />
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bar = canvasElement.querySelector('aside[data-bar]');
    await expect(bar?.closest('[data-cut-frame]')?.getAttribute('data-cut-frame'), "the bar's frame, in the step's hue").toBe('alive');
    await expect(canvasElement.querySelectorAll('[data-cut-frame]').length, 'one frame, the bar’s').toBe(1);
    await expect(canvasElement.querySelector('[data-step-part="L"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-step-action]'), "no link to the step's page").toBeNull();
    await expect(canvas.queryByRole('region', { name: 'Its conversation' })).toBeNull();
    await expect(canvas.queryByRole('link', { name: 'Open' }), 'Open is in the menu, not a button').toBeNull();

    await userEvent.click(canvas.getByRole('button', { name: 'More actions' }));
    const items = await within(canvasElement.ownerDocument.body).findAllByRole('menuitem');
    await expect(items.map((item) => item.textContent)).toEqual(['Open', 'Open conversation']);

    const streams = await streamsOf(async () => {
      await userEvent.click(items[1]);
      await canvas.findByText('The panel is the step’s card now.');
      await waitFor(() => expect(canvas.getByText('Followed as it runs.')).toBeVisible());
      await userEvent.click(canvas.getByRole('button', { name: 'Back to the step' }));
    });
    await expect(canvasElement.querySelector('[data-step-part="L"]'), 'Back shows the card again').not.toBeNull();
    await expect(streams, 'its stream was opened while it showed, and Back left none open').toEqual({ opened: 1, open: 0 });
  },
};

/** The step's conversation, opened from the bar's menu: Back to the card, its compact tail followed as it runs, the way to the whole. */
export const ItsConversation: StoryObj<typeof meta> = {
  tags: ['network'],
  parameters: { at: AT, msw: { handlers: followed } },
  render: () => (
    <Sheet>
      <StepPanel id={AT_WORK.id} name="design" run={AT_WORK} error={undefined} />
    </Sheet>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await pick(canvasElement, 'Open conversation');
    await canvas.findByText('The panel is the step’s card now.');
    await expect(canvas.getByRole('button', { name: 'Back to the step' })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Open the session' })).toBeVisible();
    await expect(canvasElement.querySelector('[data-step-part]'), "in the card's place").toBeNull();
    await userEvent.click(canvas.getByRole('button', { name: 'More actions' }));
    const items = await within(canvasElement.ownerDocument.body).findAllByRole('menuitem');
    await expect(
      items.map((item) => item.textContent),
      'its menu holds Open alone',
    ).toEqual(['Open']);
    await userEvent.keyboard('{Escape}');
  },
};
