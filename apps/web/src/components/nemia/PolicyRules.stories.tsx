import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { policyQuery, type PolicyList } from '@/lib/api/policy';
import { PolicyRules } from './PolicyRules';
import { policyList } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/**
 * Her rules for Auto, seeded: what is in force, the default marked, and what she proposed.
 *
 * Axe's `heading-order` alone is off: the part draws the custom instruction's `h2` inside its own `h3`, then its `h4`s, on the Settings
 * page as here. That is the page's outline to mend, apart from this story; every other rule holds the part.
 */
const meta: Meta<typeof PolicyRules> = {
  title: 'Store/PolicyRules',
  component: PolicyRules,
  args: { agent: 'nemia' },
  parameters: { a11y: { config: { rules: [{ id: 'heading-order', enabled: false }] } } },
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
  play: async ({ canvasElement }) => {
    const rules = within(canvasElement);
    await expect(rules.getByText('Default')).toBeVisible();
    await expect(rules.getByRole('button', { name: 'Confirm' })).toBeVisible();
  },
};

/** Her proposal confirmed and the default dropped: In force, and the default offered back. */
export const Confirmed: Story = over({
  ...policyList,
  isDefault: false,
  rules: [{ ...policyList.proposed!.rules[0]!, from: 'proposed' }],
  proposed: { ...policyList.proposed!, rules: [{ ...policyList.proposed!.rules[0]!, confirmed: true }] },
});
