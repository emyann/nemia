import type { Meta, StoryObj } from '@storybook/react-vite';
import { Composer } from './Composer';

/** The family's composer: open, off with nowhere to send to, offering the stop, and inviting the person's own words. */
const meta: Meta = { title: 'Conversation/Composer' };
export default meta;

/** Where the composer stands in its story: a panel's width, on the card's ground. */
const PANEL = { width: 460, padding: 16, background: 'var(--card)' };

/** What every story of it hands over, its caller's vocabulary. */
const SAID = { marks: 'chat', label: 'Message to Nemia', sendLabel: 'Send', onSend: () => {} };

/** Open, inviting what a person may say. */
export const Open: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Composer {...SAID} placeholder="Ask what waits on you, or tell me what to start" off={false} />
    </div>
  ),
};

/** Off: this browser keeps a message the api would not take, so there is nowhere for the next to go. */
export const Off: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Composer {...SAID} placeholder="The board cannot reach her" off />
    </div>
  ),
};

/** Offering the stop, which ends the turn and leaves the session open. */
export const Stopping: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Composer {...SAID} placeholder="She is answering" off={false} stop={{ label: 'Stop her answer', press: () => {} }} />
    </div>
  ),
};

/** Inviting the person's own words while one question waits on them. */
export const Answering: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Composer {...SAID} placeholder="Answer her, or say something else" off={false} />
    </div>
  ),
};
