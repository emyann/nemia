import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ChatAsk } from '@/lib/chatFollowing';
import { ChatActions } from './ChatActions';

/** Her action ask in her chat: one button a choice, the first filled; once chosen, the choice on its line. */
const meta: Meta<typeof ChatActions> = { title: 'Frame/ChatActions', args: { onAnswer: () => undefined } };
export default meta;

/** Where an ask stands in its story: her side sheet's width, on its ground. */
const SHEET = { width: 400, padding: 16, background: 'var(--md-sys-color-surface)', display: 'flex', flexDirection: 'column' as const };

/** Her proposal, its two choices said whole. */
const PROPOSAL: ChatAsk = {
  kind: 'proposal',
  id: 'q:call-1',
  call: 'call-1',
  at: '2026-10-15T17:40:00.000Z',
  text: 'The review asked for one more round on `implement`. Shall I start it?',
  questions: [
    {
      question: 'Shall I start the round?',
      header: 'Round',
      options: [
        { label: 'Start the round', description: '', recommended: false },
        { label: 'Keep going', description: '', recommended: false },
      ],
      multiSelect: false,
    },
  ],
};

/** Her proposal waiting on the person: the choice she puts first filled, the other outlined. */
export const Waiting: StoryObj<typeof ChatActions> = {
  args: { ask: PROPOSAL },
  render: (args) => (
    <div style={SHEET}>
      <ChatActions {...args} />
    </div>
  ),
};

/** Her proposal chosen: her tag says Proposed, and the line says what the person chose. */
export const Chosen: StoryObj<typeof ChatActions> = {
  args: {
    ask: { ...PROPOSAL, chose: { 'Shall I start the round?': 'Start the round' }, choseAt: '2026-10-15T17:42:00.000Z' },
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatActions {...args} />
    </div>
  ),
};
