import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ConversationItem } from '@/lib/conversation';
import { Talk, TalkEmpty } from './Talk';

/** The family's talk: an item of every kind at once, the same with the line over what is new, and the empty shell. */
const meta: Meta = { title: 'Conversation/Talk' };
export default meta;

/** Where a talk stands in its story: a panel's width and a panel's height, on the card's ground. */
const PANEL = { width: 460, height: 420, padding: 16, background: 'var(--card)', display: 'flex' };

/** What a caller of the talk draws itself, here a question of hers in her own words. */
type Own = { words: string };

const ITEMS: ConversationItem<Own>[] = [
  {
    kind: 'said',
    id: 'p:1',
    who: 'You',
    at: '2026-10-15T17:40:00.000Z',
    text: 'What is waiting on me?',
    markdown: false,
    yours: true,
    links: [],
  },
  {
    kind: 'work',
    id: 'w:1',
    running: false,
    ms: 134_000,
    lines: [
      { id: 'l:1', tool: 'Read', sentence: 'Read the inbox', fact: '16 cards', state: 'done' },
      { id: 'l:2', tool: 'Grep', sentence: 'Read the runs that wait', fact: '2 gates', state: 'done' },
    ],
  },
  {
    kind: 'said',
    id: 'm:1',
    who: 'Nemia',
    at: '2026-10-15T17:42:14.000Z',
    text: 'Two gates wait on you: the run and the card.',
    markdown: true,
    yours: false,
    links: [
      { words: 'the run', href: '/runs/r-1' },
      { words: 'the card', href: '/inbox/c-2' },
    ],
  },
  { kind: 'note', id: 's:1', what: 'session', words: 'A session of hers began — her 4' },
  { kind: 'own', id: 'q:1', own: { words: 'Which of the two shall I land first?' } },
];

/** What the caller draws for an `own` item of its own. */
const drawOwn = (own: Own) => (
  <div data-chat-own className="border border-outline-variant px-3.5 py-2.5 text-body-medium text-on-surface">
    {own.words}
  </div>
);

/** An item of every kind at once: the person's words, a folded turn, the agent's words with links, a quiet note, and the caller's own. */
export const EveryKind: StoryObj = {
  name: 'An item of every kind',
  render: () => (
    <div style={PANEL}>
      <Talk
        items={ITEMS}
        marks="chat"
        label="Nemia's talk"
        backLabel="Earlier messages"
        newAt={null}
        unread={0}
        readable={null}
        onRead={() => {}}
        drawOwn={drawOwn}
      />
    </div>
  ),
};

/** The same talk with the line that says what is new, over the first item the person has not read. */
export const WhatIsNew: StoryObj = {
  name: 'The line over what is new',
  render: () => (
    <div style={PANEL}>
      <Talk
        items={ITEMS}
        marks="chat"
        label="Nemia's talk"
        backLabel="Earlier messages"
        newAt="m:1"
        unread={2}
        readable="m:1"
        onRead={() => {}}
        drawOwn={drawOwn}
      />
    </div>
  ),
};

/** The empty shell, holding a greeting of the caller's own. */
export const Empty: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <TalkEmpty marks="chat">
        <div className="flex flex-col gap-2 px-0.5 pt-4">
          <h3 className="text-title-medium text-on-surface">I keep your factories running.</h3>
          <p className="text-body-medium text-on-surface-variant">
            Ask what waits on you, tell me what to start, or ask why a run stopped.
          </p>
        </div>
      </TalkEmpty>
    </div>
  ),
};
