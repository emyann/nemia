import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import type { Trigger } from 'objects';
import { factoryTriggersQuery } from '@/lib/api/factories';
import { FactoryTriggers } from './FactoryTriggers';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';
import { saysReading, Unread } from '../../../.storybook/unread';

const TRIGGER = '/api/namespaces/:namespace/triggers/:name';

/** A trigger of the factory named `name`, its spec and status as given. */
const trigger = (name: string, spec: Trigger['spec'], status: Trigger['status']) =>
  ({
    apiVersion: 'nemia/v1',
    kind: 'Trigger',
    metadata: { name, namespace: FACTORY, creationTimestamp: '2026-11-19T00:00:00.000Z', resourceVersion: 'v1' },
    spec,
    status,
  }) satisfies Trigger;

/** A card trigger `name` of the factory's own, selecting `selector` and sending to `to`. */
const onCards = (name: string, selector: string, to: string, status: Omit<Trigger['status'], 'since' | 'from'>) =>
  trigger(
    name,
    { when: { kind: 'cards', selector }, target: { kind: 'Workflow', name: to } },
    { since: '2026-11-19T00:00:00.000Z', from: 'factory', ...status },
  );

const NIGHTLY = trigger(
  'janitor',
  { when: { kind: 'time', cron: '0 3 * * *', brief: 'Sweep the stats', tz: 'Europe/Paris' }, target: { kind: 'Workflow', name: 'janitor' } },
  { since: '2026-11-19T00:00:00.000Z', from: 'factory', quota: 'spends', quotaBy: 'janitor', next: '2026-11-22T02:00:00.000Z' },
);

/** `children` over a query client that holds `items` as the factory's triggers, asking the network nothing. */
function Served({ items, children }: { items: readonly Trigger[]; children: ReactNode }) {
  const [client] = useState(() => seeded([[factoryTriggersQuery(FACTORY).queryKey, items]]));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * A factory's triggers on its settings page, a story a state: while they are read; none; a card trigger that spends quota beside a
 * schedule; one that is free however many cards it queues; one whose reach does not read; two that clash on a card; one its template
 * defines; and a card trigger taken back.
 */
const meta: Meta<typeof FactoryTriggers> = {
  title: 'Factory/FactoryTriggers',
  component: FactoryTriggers,
  args: { name: FACTORY },
};
export default meta;

type Story = StoryObj<typeof meta>;

/** `items` served as the factory's triggers, in the settings page's width. */
const served = (items: readonly Trigger[]): Story['render'] =>
  function ServedTriggers(args) {
    return (
      <Served items={items}>
        <div style={{ width: 640 }}>
          <FactoryTriggers {...args} />
        </div>
      </Served>
    );
  };

/** The triggers still read. */
export const Reading: Story = {
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FactoryTriggers {...args} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the triggers…'),
};

/** No trigger: the line says so, and the command that writes one. */
export const None: Story = {
  render: served([]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-no-triggers]')).not.toBeNull();
  },
};

/** A card trigger to a workflow that runs an agent spends quota; a schedule beside it reads as the time kind with its next fire. */
export const Spends: Story = {
  render: served([onCards('ready', 'ready=yes', 'build', { quota: 'spends', quotaBy: 'build', queued: ['fix-login'] }), NIGHTLY]),
  play: async ({ canvasElement }) => {
    const ready = canvasElement.querySelector('[data-factory-trigger="ready"]');
    await expect(ready?.querySelector('[data-trigger-quota]')).toHaveTextContent('Spends quota: build runs an agent');
    await expect(ready?.querySelector('[data-trigger-now]')).toHaveTextContent('queues 1 card now');
    const nightly = canvasElement.querySelector('[data-factory-trigger="janitor"]');
    await expect(nightly?.querySelector('[data-trigger-now]')).toHaveTextContent(/^Next fire/);
    await expect(nightly?.querySelector('button')).toBeNull();
  },
};

/** A card trigger whose target reaches only a script condition and card nodes costs no quota, however many cards it queues. */
export const FreeWhileQueuing: Story = {
  render: served([
    onCards('door', 'front-door=yes', 'sort', { quota: 'free', queued: ['card-a', 'card-b', 'card-c', 'card-d', 'card-e'] }),
  ]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-trigger-quota]')).toHaveAttribute('data-trigger-quota', 'free');
    await expect(canvasElement.querySelector('[data-trigger-now]')).toHaveTextContent('queues 5 cards now');
  },
};

/** A trigger one of whose reached workflows does not read: its quota is unknown, and the workflow named. */
export const Unknown: Story = {
  render: served([onCards('ready', 'ready=yes', 'sort', { quota: 'unknown', quotaBy: 'gone' })]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-trigger-quota]')).toHaveTextContent('Quota unknown: gone does not read');
  },
};

/** Two triggers select the same card for two workflows: each says the card waits, and what to change. */
export const Clash: Story = {
  render: served([
    onCards('bugs', 'kind=bug', 'quick', { quota: 'spends', quotaBy: 'quick', clashes: [{ card: 'both', with: ['bugs', 'ready'] }] }),
    onCards('ready', 'ready=yes', 'build', { quota: 'spends', quotaBy: 'build', clashes: [{ card: 'both', with: ['bugs', 'ready'] }] }),
  ]),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-trigger-clash="both"]')).toHaveLength(2);
    await expect(canvasElement.querySelector('[data-factory-trigger="bugs"] [data-trigger-now]')).toHaveTextContent(
      '1 waiting on a clash',
    );
  },
};

/** A card trigger its template defines: said as the template's, with no Remove, since it is taken back by the template's parameter. */
export const FromTemplate: Story = {
  render: served([
    trigger(
      'front-door',
      { when: { kind: 'cards', selector: 'front-door=yes' }, target: { kind: 'Workflow', name: 'front-door' } },
      { since: '', from: 'template', quota: 'spends', quotaBy: 'front-door', queued: [] },
    ),
  ]),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('from its template')).toBeVisible();
    await expect(within(canvasElement).queryByRole('button', { name: 'Remove' })).toBeNull();
  },
};

const deleted: string[] = [];

/** Remove on a card trigger of the factory's own sends the api its delete, by the trigger's name. */
export const Removed: Story = {
  render: served([onCards('ready', 'ready=yes', 'build', { quota: 'spends', quotaBy: 'build', queued: [] })]),
  parameters: {
    msw: [
      http.delete(TRIGGER, async ({ params }) => {
        deleted.push(String(params.name));
        await expect([params.namespace, params.name]).toEqual([FACTORY, 'ready']);
        return HttpResponse.json(onCards('ready', 'ready=yes', 'build', { quota: 'spends', quotaBy: 'build' }));
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(deleted).toContain('ready'));
    await waitFor(() => expect(within(canvasElement).getByRole('button', { name: 'Remove' })).toBeEnabled());
  },
};
