import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { ChatKeptMessage } from './ChatKept';

/** The message this browser kept because the api did not take it, and the three things the person may do with it. */
const meta: Meta<typeof ChatKeptMessage> = {
  title: 'Frame/ChatKept',
  args: { onAgain: () => undefined, onEdit: () => undefined, onDiscard: () => undefined },
};
export default meta;

/** Where the message stands in its story: her side sheet's width, on its ground, laid out as the talk lays its items out. */
const SHEET = { width: 400, padding: 16, background: 'var(--md-sys-color-background)', display: 'flex', flexDirection: 'column' as const };

/** The daemon lost: nothing reached her, and the kit's three buttons send it again, change it, or throw it away. */
export const Lost: StoryObj<typeof ChatKeptMessage> = {
  args: { kept: { text: 'Land the first and hold the second.', at: '2026-10-15T17:40:00.000Z' } },
  render: (args) => (
    <div style={SHEET}>
      <ChatKeptMessage {...args} />
    </div>
  ),
};

/** The api refused it: its line is the api's own words. */
export const Refused: StoryObj<typeof ChatKeptMessage> = {
  args: {
    kept: { text: 'Land the first and hold the second.', at: '2026-10-15T17:40:00.000Z', refused: 'Her outbox is full: wait for her.' },
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatKeptMessage {...args} />
    </div>
  ),
};

/** Its words being changed: the kit's text field, multiline, holding them, and Keep the change. */
export const Editing: StoryObj<typeof ChatKeptMessage> = {
  args: { kept: { text: 'Land the first and hold the second.', at: '2026-10-15T17:40:00.000Z' } },
  play: async ({ canvasElement, userEvent }) => {
    const edit = [...canvasElement.querySelectorAll('button')].find((button) => button.textContent === 'Edit')!;
    await userEvent.click(edit);
    await expect(canvasElement.querySelector('textarea')).toHaveValue('Land the first and hold the second.');
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatKeptMessage {...args} />
    </div>
  ),
};
