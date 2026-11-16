import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { policyQuery, type PolicyList } from '@/lib/api/policy';
import { PolicyRules } from './PolicyRules';
import { policyList, RETRY_RULE } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';
import { saysReading, Unread } from '../../../.storybook/unread';

/**
 * Her rules for Auto, seeded: what is in force, the default marked, and what she proposed.
 *
 * Each warns on axe, its test to come: the part draws the custom instruction's `h2` inside its own `h3`, then its `h4`s
 * (`heading-order`), on the Settings page as here; that is the page's outline to mend.
 */
const meta: Meta<typeof PolicyRules> = {
  title: 'Store/PolicyRules',
  component: PolicyRules,
  args: { agent: 'nemia' },
};
export default meta;

type Story = StoryObj<typeof PolicyRules>;

/** `PolicyRules` over `list`. */
const over = (list: PolicyList): Story => ({
  render: (args) => (
    <QueryClientProvider client={seeded([[policyQuery(args.agent).queryKey, list]])}>
      <PolicyRules {...args} />
    </QueryClientProvider>
  ),
});

/** The default in force, a Drop beside it, and a proposed rule waiting on Confirm. */
export const Proposed: Story = {
  ...over(policyList),
  parameters: { a11y: { test: 'todo' } },
  play: async ({ canvasElement }) => {
    const rules = within(canvasElement);
    await expect(rules.getByText('Default')).toBeVisible();
    await expect(rules.getByRole('button', { name: 'Confirm' })).toBeVisible();
  },
};

/** Her proposal confirmed and the default dropped: In force, and the default offered back. */
export const Confirmed: Story = {
  parameters: { a11y: { test: 'todo' } },
  ...over({
    ...policyList,
    isDefault: false,
    rules: [{ ...RETRY_RULE, from: 'proposed' }],
    proposed: policyList.proposed && { ...policyList.proposed, rules: [{ ...RETRY_RULE, confirmed: true }] },
  }),
};

/** Her rules still read: the shape of the rules in force. */
export const ReadingHerRules: Story = {
  render: (args) => (
    <Unread>
      <div style={{ width: 640 }}>
        <PolicyRules {...args} />
      </div>
    </Unread>
  ),
  play: saysReading('Reading her rules…'),
};
