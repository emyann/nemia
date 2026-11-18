import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { NemiaLevel } from '@/lib/api/nemia';
import { unreadChat } from '@/lib/chatFollowing';
import { UP } from '@/lib/presence';
import type { NemiaChat } from '@/lib/useNemiaChat';
import { ChatPanel } from './ChatPanel';

/** Her chat's panel in her side sheet: her header, a band where she is not there to talk to, her greeting or her talk, and the composer. */
const meta: Meta<typeof ChatPanel> = {
  title: 'Frame/ChatPanel',
  args: { atWork: 0, now: new Date('2026-10-15T17:40:00.000Z'), mode: 'sheet', onClose: () => undefined },
};
export default meta;

/** Where the panel stands in its story: her side sheet's size, on its ground. */
const SHEET = { width: 400, height: 640, padding: 16, background: 'var(--md-sys-color-surface)' };

/** Her chat read, nothing said yet, every press doing nothing. */
const CHAT: NemiaChat = {
  state: unreadChat(false),
  kept: null,
  send: () => undefined,
  answer: () => undefined,
  stop: () => undefined,
  sendKept: () => undefined,
  editKept: () => undefined,
  discardKept: () => undefined,
  markRead: () => undefined,
};

/** Where she is: Manual, no task of hers open, a message to wake her. */
const RESTING: NemiaLevel = {
  level: 'manual',
  since: '2026-10-15T12:00:00.000Z',
  task: null,
  phase: null,
  sessionId: null,
  reach: [],
  bridge: null,
  stopped: false,
  rests: true,
  spend: null,
  allows: [],
  factories: [],
  untrusted: null,
};

/** The panel drawn in her sheet. */
const render: StoryObj<typeof ChatPanel>['render'] = (args) => (
  <div style={SHEET}>
    <ChatPanel {...args} />
  </div>
);

/** Resting: her header says so, no band says she stopped, and the composer says a message wakes her. */
export const Resting: StoryObj<typeof ChatPanel> = {
  args: { chat: CHAT, nemia: RESTING, presence: { ...UP, resting: true } },
  render,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-band="stopped"]')).toBeNull();
    await expect(canvasElement.querySelector('[placeholder]')?.getAttribute('placeholder')).toBe('Write to her; your message wakes her');
  },
};

/** Down: her folder untrusted, so no message wakes her; the band says why and where she is started. */
export const Down: StoryObj<typeof ChatPanel> = {
  args: {
    chat: CHAT,
    nemia: { ...RESTING, rests: false, untrusted: 'Claude Code did not take the trust of her folder: mend its file.' },
    presence: { ...UP, down: true },
  },
  render,
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-band="stopped"]')).not.toBeNull();
  },
};
