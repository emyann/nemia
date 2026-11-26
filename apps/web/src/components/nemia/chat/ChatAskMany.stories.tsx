import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { ChatAsk } from '@/lib/chatFollowing';
import { ChatAskMany } from './ChatAskMany';

/** Her several questions in her chat: a tab each and Submit, numbered choices, a field for the person's own words, and the recap. */
const meta: Meta<typeof ChatAskMany> = { title: 'Frame/ChatAskMany', args: { onAnswer: () => undefined } };
export default meta;

/** Where an ask stands in its story: her side sheet's width, on its ground. */
const SHEET = { width: 400, padding: 16, background: 'var(--md-sys-color-background)', display: 'flex', flexDirection: 'column' as const };

/** One of her questions, by its header and words. */
const question = (header: string, words: string) => ({
  question: words,
  header,
  options: [
    { label: 'Cut it on read', description: 'The first line, cut at a word.', recommended: true },
    { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
  ],
  multiSelect: false,
});

/** Her ask of two questions. */
const ASK: ChatAsk = {
  kind: 'question',
  id: 'q:call-2',
  call: 'call-2',
  at: '2026-10-15T17:40:00.000Z',
  text: 'What the board shows as an old closeout’s one line?',
  questions: [
    question('Summary', 'What the board shows as an old closeout’s one line?'),
    question('Values', 'What the board shows for a value it cannot read?'),
  ],
};

/** The first question in hand: its tab marked, its choices numbered, the field for the person's own words, Next and 1 OF 2. */
export const FirstQuestion: StoryObj<typeof ChatAskMany> = {
  args: { ask: ASK },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(canvasElement.querySelector('[data-chat-option="Cut it on read"]')!);
    await userEvent.click(canvasElement.querySelector('[data-chat-qtab]:last-child')!);
    await expect(canvasElement.querySelector('[data-chat-left]')).toHaveTextContent('1 not answered');
    await expect(canvasElement.querySelector('[data-chat-submit]')).toBeDisabled();
    await userEvent.click(canvasElement.querySelector('[data-chat-qtab]')!);
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatAskMany {...args} />
    </div>
  ),
};

/** The person's own words: the last row chosen as they type in the field. */
export const OwnWords: StoryObj<typeof ChatAskMany> = {
  args: { ask: ASK },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.type(canvasElement.querySelector('[data-chat-own] input')!, 'Neither: the whole line');
    await expect(canvasElement.querySelector('[data-chat-option="own"]')).toHaveAttribute('data-selected', 'true');
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatAskMany {...args} />
    </div>
  ),
};

/** Answered: each question beside the answer the person gave it, and the line that says what they chose. */
export const Answered: StoryObj<typeof ChatAskMany> = {
  args: {
    ask: {
      ...ASK,
      chose: {
        'What the board shows as an old closeout’s one line?': 'Cut it on read',
        'What the board shows for a value it cannot read?': 'First line as it is',
      },
      choseAt: '2026-10-15T17:42:00.000Z',
    },
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatAskMany {...args} />
    </div>
  ),
};
