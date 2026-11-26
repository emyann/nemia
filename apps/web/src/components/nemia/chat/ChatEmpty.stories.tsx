import type { Meta, StoryObj } from '@storybook/react-vite';
import { UP } from '@/lib/presence';
import type { NemiaLevel } from '@/lib/api/nemia';
import { ChatEmpty } from './ChatEmpty';

/** Her chat with nothing said yet: her face, her greeting, her tags, and the four chips a person may start with. */
const meta: Meta<typeof ChatEmpty> = { title: 'Frame/ChatEmpty', args: { onSend: () => undefined } };
export default meta;

/** Where her greeting stands in its story: her side sheet's width, on its ground. */
const SHEET = { width: 400, padding: 16, background: 'var(--md-sys-color-background)' };

/** Where she is: Semi-auto, keeping two factories. */
const NEMIA: NemiaLevel = {
  level: 'semi-auto',
  since: '2026-10-15T12:00:00.000Z',
  task: null,
  phase: null,
  sessionId: null,
  reach: [],
  bridge: null,
  stopped: false,
  rests: false,
  spend: null,
  allows: [],
  factories: [],
  untrusted: null,
};

/** Her greeting, up, three runs at work: the chips the kit's outlined buttons. */
export const Ready: StoryObj<typeof ChatEmpty> = {
  args: { nemia: NEMIA, presence: UP, atWork: 3 },
  render: (args) => (
    <div style={SHEET}>
      <ChatEmpty {...args} />
    </div>
  ),
};

/** A message kept unsent: the chips are off, since pressing one would take the place of the words nobody has yet. */
export const NotSent: StoryObj<typeof ChatEmpty> = {
  args: { nemia: NEMIA, presence: { ...UP, notSent: true }, atWork: 1 },
  render: (args) => (
    <div style={SHEET}>
      <ChatEmpty {...args} />
    </div>
  ),
};
