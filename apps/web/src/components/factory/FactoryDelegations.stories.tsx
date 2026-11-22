import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { delegableAgentsQuery, delegationsQuery, type DelegableAgent } from '@/lib/api/proposals';
import { FactoryDelegations } from './FactoryDelegations';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';
import { settled } from '../../../.storybook/play';
import { saysReading, Unread } from '../../../.storybook/unread';

/** The agents the factory serves, as its agents page names them: three with a role, and one whose file says none. */
const AGENTS: readonly DelegableAgent[] = [
  { name: 'critic', role: 'code reviewer' },
  { name: 'keeper', role: null },
  { name: 'planner', role: 'plans the work' },
  { name: 'scribe', role: 'writes the notes' },
];

/** `children` over a query client that holds the factory's agents and no delegation, asking the network nothing. */
function Served({ children }: { children: ReactNode }) {
  const [client] = useState(() =>
    seeded([
      [delegationsQuery(FACTORY).queryKey, []],
      [delegableAgentsQuery(FACTORY).queryKey, AGENTS],
    ]),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * A factory's delegations, a story a state: while they are read, the shape of its list; the agent picked in the kit's ComboBox, typing
 * narrowing the factory's agents; a name the list does not hold, written as typed; and a write the api refuses, its words under the form.
 */
const meta: Meta<typeof FactoryDelegations> = {
  title: 'Factory/FactoryDelegations',
  component: FactoryDelegations,
  args: { name: FACTORY },
  render: (args) => (
    <Served>
      <div style={{ width: 640 }}>
        <FactoryDelegations {...args} />
      </div>
    </Served>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** The delegations still read. */
export const Reading: Story = {
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <FactoryDelegations {...args} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading the delegations…'),
};

/** The agent picked: the list names every agent of the factory, typing narrows it, and a pick writes the agent's file name. */
export const Picked: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const field = within(canvasElement).getByRole('combobox', { name: 'Agent' });
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-delegation-agent] [data-slot="combo-box-trigger"]')!);
    const listed = await body.findAllByRole('option');
    await expect(listed.map((o) => o.textContent)).toEqual([
      'Critic code reviewer · critic',
      'Keeper No role yet · keeper',
      'Planner plans the work · planner',
      'Scribe writes the notes · scribe',
    ]);
    await userEvent.click(field);
    await userEvent.type(field, 'sc');
    await waitFor(() => expect(body.getAllByRole('option').map((o) => o.textContent)).toEqual(['Scribe writes the notes · scribe']));
    await userEvent.click(body.getByRole('option', { name: /Scribe/ }));
    await expect(field).toHaveValue('scribe');
    await expect(field).not.toHaveAttribute('aria-invalid');
  },
};

/** The url a delegation is written to: its factory's, named by its agent. */
const PUT = `/api/namespaces/${FACTORY}/delegations/:agent`;

/** Types `name` in the agent's field, gives grant 1 hires' updates, and presses Save. */
const sent = async (canvasElement: HTMLElement, name: string) => {
  const form = within(canvasElement);
  await userEvent.type(form.getByRole('combobox', { name: 'Agent' }), name);
  await userEvent.click(form.getByText('hires'));
  await userEvent.click(form.getByText('update'));
  await userEvent.click(form.getByRole('button', { name: 'Save' }));
};

/** The agents whose delegation a story's api wrote, by name. */
const written: string[] = [];

/**
 * A name the list does not hold, the store's own agent: kept as typed and written as it is, since a delegation may name an agent the
 * factory serves none of.
 */
export const Unlisted: Story = {
  tags: ['network'],
  parameters: {
    msw: [
      http.put(PUT, ({ params }) => {
        const agent = String(params.agent);
        written.push(agent);
        return HttpResponse.json({
          apiVersion: 'nemia/v1',
          kind: 'Delegation',
          metadata: { name: agent, namespace: FACTORY, resourceVersion: '1', creationTimestamp: '2026-11-15T18:00:00.000Z' },
          spec: { rules: [{ resources: ['hires'], resourceNames: [], verbs: ['update'] }] },
        });
      }),
    ],
  },
  play: async ({ canvasElement }) => {
    written.length = 0;
    await sent(canvasElement, 'nemia');
    await waitFor(() => expect(written).toEqual(['nemia']));
    await expect(canvasElement.querySelector('[data-delegation-refused]')).toBeNull();
    await settled(canvasElement);
  },
};

/** A write the api refuses: its words under the form, the name kept in the field to mend. */
export const Refused: Story = {
  tags: ['network'],
  parameters: {
    msw: [http.put(PUT, () => HttpResponse.json({ error: 'this factory serves no agent named nobody' }, { status: 422 }))],
  },
  play: async ({ canvasElement }) => {
    await sent(canvasElement, 'nobody');
    const refused = await waitFor(() => {
      const alert = canvasElement.querySelector<HTMLElement>('[data-delegation-refused]');
      if (!alert) throw new Error('no refusal is shown');
      return alert;
    });
    await expect(refused.textContent).toContain('nobody');
    await expect(within(canvasElement).getByRole('combobox', { name: 'Agent' })).toHaveValue('nobody');
    await settled(canvasElement);
  },
};
