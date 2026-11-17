import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { Chips } from './Decide';

/**
 * What Decide marks on a branch's files, a story a state: the files the next agent reads as instructions, each the kit's outlined `Tag`
 * in its hairline, beside those that could make its check pass, outlined in yours; and those alone.
 */
const meta: Meta<typeof Chips> = {
  title: 'Run/Decide/Chips',
  component: Chips,
  args: { agentFacing: [], checkAffecting: [] },
  render: (args) => (
    <div style={{ width: 560, padding: 16 }}>
      <Chips {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof Chips>;

/** Both kinds of file, a long path among them wrapping in its tag. */
export const AgentFacingAndCheckAffecting: Story = {
  args: {
    agentFacing: ['CLAUDE.md', 'packages/templates/sdlc/agents/grace.md'],
    checkAffecting: ['package.json', 'packages/agent-orchestrator/test/a-test-whose-path-runs-longer-than-its-row-has-room-for.test.ts'],
  },
  play: async ({ canvasElement }) => {
    const marks = within(canvasElement);
    const note = marks.getByText('CLAUDE.md').closest('[data-slot="tag"]');
    await expect(note).toHaveAttribute('data-chip', 'agent-facing');
    await expect(note).toHaveAttribute('title', 'the next agent reads this');
    const weighed = marks.getByText('package.json').closest('[data-slot="tag"]');
    await expect(weighed).toHaveAttribute('data-chip', 'check-affecting');
    await expect(weighed).toHaveAttribute('title', 'could make its check pass');
    const long = marks.getByText(/a-test-whose-path/).closest('[data-slot="tag"]');
    await expect(long?.getBoundingClientRect().right, 'a long path wraps inside the row').toBeLessThanOrEqual(
      canvasElement.querySelector('div')!.getBoundingClientRect().right,
    );
  },
};

/** The files that could make its check pass, and no file an agent reads. */
export const CheckAffectingOnly: Story = {
  args: { checkAffecting: ['packages/x/test/add.test.ts'] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-chip="agent-facing"]').length).toBe(0);
    await expect(canvasElement.querySelectorAll('[data-chip="check-affecting"]').length).toBe(1);
  },
};
