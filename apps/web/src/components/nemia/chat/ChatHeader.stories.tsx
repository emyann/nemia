import type { Meta, StoryObj } from '@storybook/react-vite';
import { UP } from '@/lib/presence';
import { ChatHeader } from './ChatHeader';

/** The header of her chat: her face, her name, her line, and in her sheet the kit's icon buttons that open it as a page and close it. */
const meta: Meta<typeof ChatHeader> = {
  title: 'Frame/ChatHeader',
  args: { nemia: undefined, presence: UP, now: new Date('2026-10-15T17:40:00.000Z'), onClose: () => undefined },
};
export default meta;

/** Where the header stands in its story: her side sheet's width, on its ground. */
const SHEET = { width: 400, padding: 16, background: 'var(--md-sys-color-surface)' };

/** In her side sheet: open as a page, and close. */
export const InHerSheet: StoryObj<typeof ChatHeader> = {
  args: { mode: 'sheet' },
  render: (args) => (
    <div style={SHEET}>
      <ChatHeader {...args} />
    </div>
  ),
};

/** On her own page: neither control, the page being the panel itself. */
export const OnHerPage: StoryObj<typeof ChatHeader> = {
  args: { mode: 'page' },
  render: (args) => (
    <div style={SHEET}>
      <ChatHeader {...args} />
    </div>
  ),
};
