import { CircleXIcon, PauseIcon } from 'lucide-react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { ConversationBand } from './ConversationBand';

/** The band both conversations draw over their talk: a quiet note at rest, and a failure's container whole. */
const meta: Meta = { title: 'Conversation/ConversationBand' };
export default meta;

/** Where a band stands in its story: a panel's width, on the card's ground. */
const PANEL = { width: 460, padding: 16, background: 'var(--card)' };

/** A quiet note at rest, over an accent at its left. */
export const ANote: StoryObj = {
  name: 'A quiet note',
  render: () => (
    <div style={PANEL}>
      <ConversationBand role="status" what="stopped" icon={<PauseIcon />} title="Her session stopped">
        Her session was stopped from outside. Your factories still tick; gates still come to you.
      </ConversationBand>
    </div>
  ),
};

/** A thing that went wrong, in the failure's container whole. */
export const AFailure: StoryObj = {
  name: 'A failure',
  render: () => (
    <div style={PANEL}>
      <ConversationBand role="alert" what="unreadable" icon={<CircleXIcon />} title="The board cannot read her chat">
        The api refused the read. It reads again every few seconds; what you write is kept here until the api takes it.
      </ConversationBand>
    </div>
  ),
};
