import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, waitFor, within } from 'storybook/test';
import { agentsQuery, factoryAgentsQuery } from '@/lib/api/agents';
import { skillsQuery } from '@/lib/api/skills';
import { storeQuery } from '@/lib/api/store';
import { AgentsPage, FactoryAgentsPage } from './AgentsPage';
import { millAgents, scribe, skillPlaces, yourStore } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** The Agents page, its reads seeded: your agents, your store's folders and the skills by place; its filter as the address keeps it. */
const meta: Meta<typeof AgentsPage> = {
  title: 'Pages/Agents',
  component: AgentsPage,
  args: { query: '', onQuery: fn() },
  render: (args) => (
    <QueryClientProvider
      client={seeded([
        [agentsQuery.queryKey, [scribe]],
        [storeQuery.queryKey, yourStore],
        [skillsQuery.queryKey, skillPlaces],
      ])}
    >
      <Suspense>
        <AgentsPage {...args} />
      </Suspense>
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof AgentsPage>;

/** One agent of yours, New agent and New skill each a link to its page. */
export const OneAgent: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('link', { name: 'New agent' })).toHaveAttribute('href', '/agents/new');
    await expect(page.getByRole('link', { name: 'New skill' })).toHaveAttribute('href', '/agents/skills/new');
  },
};

/**
 * Filtered as a person types: the filter is sent to the address, and only what it keeps is drawn, a list it keeps nothing of not at
 * all.
 */
export const Filtered: Story = {
  args: { query: 'grill' },
  play: async ({ canvasElement, args, userEvent }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('searchbox', { name: 'Filter agents and skills' })).toHaveValue('grill');
    await expect(canvasElement.querySelector('[data-skill-row="grill-me"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-skill-row="write-a-note"]')).toBeNull();
    await expect(page.queryByRole('region', { name: 'Yours' })).toBeNull();
    await userEvent.clear(page.getByRole('searchbox', { name: 'Filter agents and skills' }));
    await userEvent.type(page.getByRole('searchbox', { name: 'Filter agents and skills' }), 'NOTE');
    await expect(args.onQuery).toHaveBeenLastCalledWith('NOTE');
    await expect(page.getByRole('region', { name: 'Yours' })).toBeVisible();
    await expect(canvasElement.querySelector('[data-skill-row="write-a-note"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-skill-row="grill-me"]')).toBeNull();
  },
};

/** A filter that keeps nothing: the page says so, under the filter, and draws neither list. */
export const NothingMatches: Story = {
  args: { query: 'zzz' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await waitFor(() => expect(page.getByRole('button', { name: 'Clear the filter' })).toBeVisible());
    await expect(page.queryByRole('region', { name: 'Yours' })).toBeNull();
    await expect(page.queryByRole('region', { name: 'Skills' })).toBeNull();
  },
};

/** Cleared from nothing matches: Clear the filter brings both lists back and clears the address's. */
export const Cleared: Story = {
  args: { query: 'zzz' },
  play: async ({ canvasElement, args, userEvent }) => {
    const page = within(canvasElement);
    await userEvent.click(await page.findByRole('button', { name: 'Clear the filter' }));
    await expect(args.onQuery).toHaveBeenLastCalledWith('');
    await expect(page.getByRole('region', { name: 'Yours' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Filter agents and skills' })).toHaveValue('');
  },
};

/**
 * A factory's Agents page, its reads seeded: the factory mill's own two agents and none of yours. `own` is what the factory serves, so a
 * story of a factory with none seeds an empty list.
 * @param own The factory's own agents.
 */
const millPage = (own: typeof millAgents) =>
  function MillPage(args: { query: string; onQuery: (query: string) => void }) {
    return (
      <QueryClientProvider
        client={seeded([
          [factoryAgentsQuery('mill').queryKey, own],
          [agentsQuery.queryKey, []],
          [storeQuery.queryKey, yourStore],
          [skillsQuery.queryKey, skillPlaces],
        ])}
      >
        <Suspense>
          <FactoryAgentsPage factory="mill" {...args} />
        </Suspense>
      </QueryClientProvider>
    );
  };

/** A factory's own agents, listed first under its name, each linked to its page in the factory; yours below, none yet. */
export const FactoryAgents: Story = {
  render: millPage(millAgents),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const mill = await page.findByRole('region', { name: 'mill' });
    await expect(within(mill).getByRole('link', { name: 'Builder' })).toHaveAttribute('href', '/factories/mill/agents/builder');
    await expect(within(mill).getByRole('link', { name: 'Warden' })).toHaveAttribute('href', '/factories/mill/agents/warden');
    await expect(canvasElement.querySelector('[data-agent="builder"] [data-node="build/implement"]')).not.toBeNull();
    await expect(page.getByRole('region', { name: 'Yours' })).toBeVisible();
    const regions = [...canvasElement.querySelectorAll('section[aria-label]')].map((region) => region.getAttribute('aria-label'));
    await expect(regions.indexOf('mill')).toBeLessThan(regions.indexOf('Yours'));
  },
};

/** A factory's agents filtered: the filter keeps the one it matches, and Yours, which keeps nothing, is not drawn. */
export const FactoryAgentsFiltered: Story = {
  render: millPage(millAgents),
  args: { query: 'build' },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const mill = await page.findByRole('region', { name: 'mill' });
    await expect(within(mill).getByRole('link', { name: 'Builder' })).toBeVisible();
    await expect(within(mill).queryByRole('link', { name: 'Warden' })).toBeNull();
    await expect(page.queryByRole('region', { name: 'Yours' })).toBeNull();
  },
};

/** A factory with no agent of its own says so under its name, naming where a factory's agents come from. */
export const FactoryWithNoAgents: Story = {
  render: millPage([]),
  play: async ({ canvasElement }) => {
    const mill = await within(canvasElement).findByRole('region', { name: 'mill' });
    await expect(within(mill).queryByRole('listitem')).toBeNull();
    await expect(mill.querySelector('code')).toHaveTextContent('agents/');
  },
};
