import type { Meta, StoryObj } from '@storybook/react-vite';
import { ChatLostBand, ChatRetryingBand, ChatStoppedBand, ChatUnreadableBand } from './ChatBand';

/** The lines of her chat about the chat itself: her session stopped, the daemon lost, her chat unread, and read again on a beat. */
const meta: Meta = { title: 'Frame/ChatBand' };
export default meta;

/** Where a band stands in its story: her side sheet's width, on its ground. */
const SHEET = {
  width: 400,
  padding: 16,
  background: 'var(--md-sys-color-background)',
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 10,
};

/** Her session stopped: why, and the kit's two buttons that lead to her settings. */
export const Stopped: StoryObj<typeof ChatStoppedBand> = {
  args: { words: 'Her session was stopped from outside.' },
  render: (args) => (
    <div style={SHEET}>
      <ChatStoppedBand {...args} />
    </div>
  ),
};

/** The board having lost the daemon, since a time of day. */
export const Lost: StoryObj<typeof ChatLostBand> = {
  args: { since: '2026-10-15T17:40:00.000Z', now: new Date('2026-10-15T17:43:00.000Z') },
  render: (args) => (
    <div style={SHEET}>
      <ChatLostBand {...args} />
    </div>
  ),
};

/** Her chat the board cannot read, in the read's own words. */
export const Unreadable: StoryObj<typeof ChatUnreadableBand> = {
  args: { why: 'The api answered 503' },
  render: (args) => (
    <div style={SHEET}>
      <ChatUnreadableBand {...args} />
    </div>
  ),
};

/** Her chat read again on a beat: a quiet note. */
export const Retrying: StoryObj<typeof ChatRetryingBand> = {
  args: { why: 'The api cannot stream her chat right now.' },
  render: (args) => (
    <div style={SHEET}>
      <ChatRetryingBand {...args} />
    </div>
  ),
};
