import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, screen, userEvent, within } from 'storybook/test';
import { levelQuery, nemiaMemoryQuery, type NemiaLevel } from '@/lib/api/nemia';
import { policyQuery } from '@/lib/api/policy';
import { NemiaSettings } from './NemiaSettings';
import { nemiaLevel, nemiaMemory, policyList } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/**
 * Nemia's section of the Settings page, its reads seeded: her level, each factory's, her session, her rules and her memory.
 *
 * Each warns on axe, its test to come: her rules (`PolicyRules`) draw the custom instruction's `h2` inside their own `h3`, then their
 * `h4`s (`heading-order`), on the Settings page as here; that is the page's outline to mend.
 */
const meta: Meta<typeof NemiaSettings> = {
  title: 'Store/NemiaSettings',
  component: NemiaSettings,
  args: {},
};
export default meta;

type Story = StoryObj<typeof NemiaSettings>;

/** The section over `level`. */
const at = (level: NemiaLevel): Story => ({
  render: () => (
    <QueryClientProvider
      client={seeded([
        [levelQuery.queryKey, level],
        [nemiaMemoryQuery.queryKey, nemiaMemory],
        [policyQuery('nemia').queryKey, policyList],
      ])}
    >
      <NemiaSettings />
    </QueryClientProvider>
  ),
});

/** At Semi-auto, her session up: her level picked, a factory raised, one to raise, her facts folded. */
export const SemiAuto: Story = {
  ...at(nemiaLevel('semi-auto')),
  parameters: { a11y: { test: 'todo' } },
  play: async ({ canvasElement }) => {
    const section = within(canvasElement);
    await userEvent.click(section.getByRole('button', { name: /Her level$/ }));
    await expect(await screen.findByRole('option', { name: 'Auto' })).toBeVisible();
    await userEvent.keyboard('{Escape}');
    await expect(section.getByRole('button', { name: 'End the raise' })).toBeVisible();
    await expect(section.getByRole('button', { name: 'owner.md' })).toHaveAttribute('aria-expanded', 'false');
  },
};

/** At Manual, her session stopped from outside: a way to a fresh one. */
export const Stopped: Story = {
  parameters: { a11y: { test: 'todo' } },
  ...at({ ...nemiaLevel('manual'), stopped: true, task: null, phase: null, sessionId: null, reach: [] }),
};
