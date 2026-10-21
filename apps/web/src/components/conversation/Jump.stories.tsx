import type { Meta, StoryObj } from '@storybook/react-vite';
import { Jump } from './Jump';

/** The pill over a talk the person has read back from: what it says of how many are new. */
const meta: Meta = { title: 'Conversation/Jump' };
export default meta;

/** Where the pill stands in its story: a panel's width, on the card's ground. */
const PANEL = { width: 460, padding: 16, background: 'var(--card)' };

/** Two new. */
export const Two: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Jump unread={2} marks="chat" onJump={() => {}} />
    </div>
  ),
};

/** One new, which the words say in the singular. */
export const One: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Jump unread={1} marks="chat" onJump={() => {}} />
    </div>
  ),
};
