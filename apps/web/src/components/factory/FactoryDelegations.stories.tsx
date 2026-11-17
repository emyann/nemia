import { useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { delegableAgentsQuery, delegationsQuery, type DelegableAgent } from '@/lib/api/proposals';
import { FactoryDelegations } from './FactoryDelegations';
import { FACTORY, seeded } from '../../../.storybook/fixtures/proposals';
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
 * narrowing the factory's agents; and a name that is no agent of the factory, refused under the field when the form is sent.
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
      'Criticcode reviewer · critic',
      'KeeperNo role yet · keeper',
      'Plannerplans the work · planner',
      'Scribewrites the notes · scribe',
    ]);
    await userEvent.click(field);
    await userEvent.type(field, 'sc');
    await waitFor(() => expect(body.getAllByRole('option').map((o) => o.textContent)).toEqual(['Scribewrites the notes · scribe']));
    await userEvent.click(body.getByRole('option', { name: /Scribe/ }));
    await expect(field).toHaveValue('scribe');
    await expect(field).not.toHaveAttribute('aria-invalid');
  },
};

/** A name that is no agent of the factory: Save keeps the form, and the field says why under it. */
export const NoSuchAgent: Story = {
  play: async ({ canvasElement }) => {
    const form = within(canvasElement);
    const field = form.getByRole('combobox', { name: 'Agent' });
    await userEvent.type(field, 'nobody');
    await userEvent.click(form.getByText('hires'));
    await userEvent.click(form.getByText('update'));
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'));
    await expect(form.getByRole('alert').textContent).toContain('nobody');
    await expect(field).toHaveValue('nobody');
  },
};
