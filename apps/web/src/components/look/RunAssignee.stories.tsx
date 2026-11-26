import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { NOW_WORDS } from '@/lib/words';
import { AssigneeLine } from './RunAssignee';

/** An assignee at a gate, nothing said: who, when, and the words the api says of it. */
const BARE = {
  at: '2026-11-26T10:02:00.000Z',
  forMs: 3_600_000,
  comesBackAt: '2026-11-26T11:02:00.000Z',
  word: 'operator has it in hand — back to you at 2026-11-26T11:02:00.000Z if unanswered',
  name: 'operator',
};

/** A reason near the 200 characters an assignee's why may hold. */
const LONG_WHY =
  'Reviewing the plan against the spec the person approved this morning: its fourth question changed what implement owes, and the approval waits until the two read the same, then goes on as asked.';

/** A run's assignee line, as the runs table draws it under an assigned row's words, in the width of the table's Now column. */
const meta: Meta<typeof AssigneeLine> = {
  title: 'Look/AssigneeLine',
  component: AssigneeLine,
  args: {
    assignee: { ...BARE, why: 'reading the plan first', actor: { kind: 'agent', agent: 'operator', token: 'ops' } },
  },
  render: (args) => (
    <div style={{ width: 360, padding: 16 }}>
      <AssigneeLine {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof AssigneeLine>;

/** At a gate: who has it, when it comes back, why, and the agent that took it. */
export const AtAGate: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-assignee-who]')).toHaveTextContent(
      `${NOW_WORDS.hasIt('operator')} · ${NOW_WORDS.backAt('11:02 AM')}`,
    );
    await expect(canvasElement.querySelector('[data-assignee-why]')).toHaveTextContent('reading the plan first');
    await expect(canvasElement.querySelector('[data-assignee-by] [data-actor="agent"]')).not.toBeNull();
  },
};

/** At work: nothing is asked, so nothing is timed. */
export const AtWork: Story = {
  args: { assignee: { ...BARE, comesBackAt: null, actor: { kind: 'person', token: 'laptop' } } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-assignee-who]')).toHaveTextContent(NOW_WORDS.notTimed);
    await expect(canvasElement.querySelector('[data-assignee-by] [data-actor="person"]')).not.toBeNull();
  },
};

/** Nothing said: no why, and no caller known — the name alone. */
export const NoneSaid: Story = {
  args: { assignee: BARE },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-assignee-why]'), 'no why').toBeNull();
    await expect(canvasElement.querySelector('[data-assignee-by]'), 'nobody named').toBeNull();
  },
};

/** A reason near the cap, cut at two lines and whole on hover. */
export const LongWhy: Story = {
  args: { assignee: { ...BARE, why: LONG_WHY } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-assignee-why]'), 'the whole why on hover').toHaveAttribute('title', LONG_WHY);
  },
};
