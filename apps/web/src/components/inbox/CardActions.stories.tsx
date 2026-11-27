import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { http, HttpResponse } from 'msw';
import { expect, fn, waitFor, within } from 'storybook/test';
import type { Card } from 'objects';
import { SnackbarRegion } from '@/components/ui/ds';
import { factoriesQuery } from '@/lib/api/factories';
import { FACTORY, factoryView, queuedCard, seeded, unstartedCard } from '../../../.storybook/fixtures/proposals';
import { CardActions } from './CardActions';

/** What each write of a Start sent the stand-in api, newest last: the card's name and, for a start, its body. */
const sent: { queue: string[]; start: { name: string; body: unknown }[] } = { queue: [], start: [] };

/** The card `name` as the api serves it, its body the brief a start sends. */
const served = (name: string) =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Card',
    metadata: { name, namespace: FACTORY, creationTimestamp: '2026-11-15T18:00:00.000Z', resourceVersion: '1' },
    spec: { body: 'Decode the reads.\n', workflow: 'build' },
    status: {
      state: 'filed',
      runs: [],
      inPlay: true,
      phase: 'notStarted',
      followedBy: [],
      chained: false,
      title: name,
      file: `${name}.md`,
    },
  }) satisfies Card;

/** The api taking a card's body read, its queueing and its start, each kept in `sent`. */
const answers = [
  http.get('/api/cards/:name', ({ params }) => HttpResponse.json(served(String(params.name)))),
  http.post('/api/namespaces/:namespace/cards/:name/queue', ({ params }) => {
    sent.queue.push(String(params.name));
    return HttpResponse.json(served(String(params.name)));
  }),
  http.post('/api/namespaces/:namespace/cards/:name/start', async ({ params, request }) => {
    sent.start.push({ name: String(params.name), body: await request.json() });
    return HttpResponse.json({ id: 'decode-the-reads-r4nd', card: String(params.name) }, { status: 201 });
  }),
];

/** A chain of two cards: the first filed, and the second queued behind it. */
const FIRST = { ...unstartedCard('first-slice', FACTORY), chained: true, followedBy: ['second-slice'] };
const SECOND = {
  ...queuedCard('second-slice', FACTORY, 1),
  chained: true,
  phase: 'blocked' as const,
  waits: [{ card: 'first-slice', kind: 'waiting' as const, state: 'filed' as const, stalled: false }],
};

/** A card's one Start and its menu, over a store that holds the factory `nemia`. */
const meta: Meta<typeof CardActions> = {
  title: 'Store/CardActions',
  component: CardActions,
  tags: ['network'],
  parameters: { msw: answers },
  args: { entry: unstartedCard('decode-the-reads', FACTORY), chain: null, stuck: false, onRefused: fn() },
  render: (args) => (
    <QueryClientProvider client={seeded([[factoriesQuery.queryKey, [factoryView(FACTORY)]]])}>
      <div style={{ width: 340, display: 'flex', gap: 8 }}>
        <CardActions {...args} />
      </div>
      <SnackbarRegion />
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof CardActions>;

/** A card filed and not started: its Start and its menu button. */
export const Filed: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('button', { name: 'Start' })).toBeVisible();
    await expect(within(canvasElement).getByRole('button', { name: 'More actions on decode-the-reads' })).toBeVisible();
  },
};

/** The menu open: start now, edit, what it runs after, what it reads, its name and remove. */
export const MenuOpen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More actions on decode-the-reads' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Run it after…' })).toBeVisible();
    await expect(within(menu).getByRole('menuitem', { name: 'Runs it reads…' })).toBeVisible();
  },
};

/** Start on a card that waits on one not done: it queues it, which starts nothing ahead of its chain. */
export const StartChained: Story = {
  args: {
    entry: {
      ...unstartedCard('second-slice', FACTORY),
      chained: true,
      phase: 'blocked',
      waits: [{ card: 'first-slice', kind: 'waiting', state: 'filed', stalled: false }],
    },
  },
  play: async ({ canvasElement, userEvent }) => {
    sent.queue.length = 0;
    sent.start.length = 0;
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(sent.queue).toEqual(['second-slice']));
    await expect(sent.start).toEqual([]);
  },
};

/** Start on a free card that names its factory and workflow: it starts it with its body as the brief, in one press, and says so. */
export const StartFree: Story = {
  play: async ({ canvasElement, userEvent }) => {
    sent.queue.length = 0;
    sent.start.length = 0;
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Start' }));
    await waitFor(() => expect(sent.start).toHaveLength(1));
    await expect(sent.start[0]).toMatchObject({ name: 'decode-the-reads', body: { workflow: 'build', brief: 'Decode the reads.\n' } });
    await expect(sent.queue).toEqual([]);
    await waitFor(() => expect(within(document.body).getByText('Card decode-the-reads will start')).toBeVisible());
  },
};

/** The menu of a queued card whose chain still holds a filed card: Start chain… offers it. */
export const MenuChainOpen: Story = {
  args: { entry: SECOND, chain: [FIRST, SECOND] },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More actions on second-slice' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Start chain…' })).toBeVisible();
  },
};

/** The menu of a queued card whose chain has nothing left to start, its first card working: no Start chain…. */
export const MenuChainUnderway: Story = {
  args: { entry: SECOND, chain: [{ ...FIRST, state: 'running', phase: 'working', startedAs: ['first-slice-r1'] }, SECOND] },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'More actions on second-slice' }));
    const menu = await within(document.body).findByRole('menu');
    await expect(within(menu).getByRole('menuitem', { name: 'Copy its name' })).toBeVisible();
    await expect(within(menu).queryByRole('menuitem', { name: 'Start chain…' })).toBeNull();
  },
};
