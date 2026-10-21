import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ConversationItem } from '@/lib/conversation';
import { Note, Said } from './Said';

/** What is said in a conversation: the agent's words with their links, the person's own, and a quiet line that frames them. */
const meta: Meta = { title: 'Conversation/Said' };
export default meta;

/** Where a bubble stands in its story: a panel's width, on the card's ground, laid out as the talk lays its items out. */
const PANEL = { width: 460, padding: 16, background: 'var(--card)', display: 'flex', flexDirection: 'column' as const, gap: 16 };

const AT = '2026-10-15T17:40:00.000Z';

/** The agent's words, as her adapter gives them: the links taken out of the sentence and named beside it. */
const THEIRS: Extract<ConversationItem, { kind: 'said' }> = {
  kind: 'said',
  id: 'm:1',
  who: 'Nemia',
  at: AT,
  text: 'Both checks are green. Two gates wait on you: the run and the card.\n\n- `implement` passed its check\n- `review` asked for one more round',
  markdown: true,
  yours: false,
  links: [
    { words: 'the run', href: '/runs/r-1' },
    { words: 'the card', href: '/inbox/c-2' },
  ],
};

/** The person's own words, plain and at the right. */
const YOURS: Extract<ConversationItem, { kind: 'said' }> = {
  kind: 'said',
  id: 'p:1',
  who: 'You',
  at: '2026-10-15T17:52:00.000Z',
  text: 'Land the first and hold the second.',
  markdown: false,
  yours: true,
  links: [],
};

/** The agent's words with markdown in them and two links under them. */
export const Theirs: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Said said={THEIRS} marks="chat" />
    </div>
  ),
};

/** The person's own, at the right in a ringed bubble. */
export const Yours: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Said said={YOURS} marks="chat" />
    </div>
  ),
};

/** A quiet line that frames the conversation rather than being said in it. */
export const QuietNote: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Note what="keeper" marks="chat">
        She was told what you wrote.
      </Note>
    </div>
  ),
};

/** The three one after another, as the talk lays them out. */
export const OneAfterAnother: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Said said={THEIRS} marks="chat" />
      <Said said={YOURS} marks="chat" />
      <Note what="session" marks="chat">
        A session of hers began — her 4
      </Note>
    </div>
  ),
};
