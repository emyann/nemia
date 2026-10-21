import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ConversationLine } from '@/lib/conversation';
import { Worked, WorkedLine } from './Worked';

/** The family's turn: at work with a line in each state, folded, the same opened, and a line that opens to what it asked and got. */
const meta: Meta = { title: 'Conversation/Worked' };
export default meta;

/** Where a turn stands in its story: a panel's width, on the card's ground. */
const PANEL = { width: 460, padding: 16, background: 'var(--card)' };

/** One line of a turn, over what every line has. */
const line = (over: Partial<ConversationLine> & { id: string }): ConversationLine => ({
  tool: 'Read',
  sentence: 'Read the inbox',
  state: 'done',
  ...over,
});

const AT_WORK = {
  kind: 'work' as const,
  id: 'w:1',
  running: true,
  ms: 41_000,
  lines: [
    line({ id: 'l:1', fact: '16 cards' }),
    line({ id: 'l:2', tool: 'Grep', sentence: 'Searched for the runs that wait', fact: '3 matches' }),
    line({ id: 'l:3', tool: 'Bash', sentence: 'Ran npm run lint', state: 'error', fact: 'exit 1' }),
    line({ id: 'l:4', tool: 'Write', sentence: 'Write the card', state: 'pending' }),
    line({ id: 'l:5', tool: 'Task', sentence: 'Waits for your approval: land', state: 'waits', fact: '2m' }),
    line({ id: 'l:6', tool: 'WebFetch', sentence: 'Reading the run that is at work', state: 'running', fact: '8s' }),
  ],
};

const OVER = { ...AT_WORK, running: false, ms: 134_000, lines: AT_WORK.lines.slice(0, 2) };

/** A turn at work: a line in each of the five states, the one at work last and alive. */
export const AtWork: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Worked work={AT_WORK} marks="chat" />
    </div>
  ),
};

/** The same turn finished, folded into its one line. */
export const Folded: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Worked work={OVER} marks="chat" />
    </div>
  ),
};

/** The folded turn opened, its lines under it. */
export const Opened: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <Worked work={OVER} marks="chat" open />
    </div>
  ),
};

/** What a search asked and what came back. */
const SEARCHED = `rg -n drainsThis packages/agent-runtime/src
feed.ts:88        const held = () => draining || drainsThis(root);
feed-file.ts:141  export const drainsThis = (root: string) => …
1 more, in feed.boundary.test.ts`;

/** A line that carries what it asked and what came back, closed: pressing it opens to both. */
export const Openable: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <WorkedLine
        line={line({
          id: 'l:7',
          tool: 'Grep',
          sentence: 'Searched for drainsThis',
          fact: '3 matches',
          input: SEARCHED.split('\n')[0],
          result: SEARCHED,
        })}
        marks="chat"
      />
    </div>
  ),
};

/** The same line opened. */
export const OpenedLine: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <WorkedLine
        line={line({
          id: 'l:8',
          tool: 'Grep',
          sentence: 'Searched for drainsThis',
          fact: '3 matches',
          input: SEARCHED.split('\n')[0],
          result: SEARCHED,
        })}
        marks="chat"
        open
      />
    </div>
  ),
};

/** A line whose call failed: what came back is in the failure's ink. */
export const Failed: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <WorkedLine
        line={line({
          id: 'l:9',
          tool: 'Bash',
          sentence: 'Ran npm run lint',
          fact: 'exit 1',
          state: 'error',
          input: 'npm run lint',
          result: 'src/lib/feed.ts:88:7  error  no-unused-vars\nFound 1 error.',
        })}
        marks="chat"
        open
      />
    </div>
  ),
};

/** What a long read came back with: capped, and scrolling inside its own block. */
const LONG = Array.from({ length: 40 }, (_, i) => `${i + 1}  const line = ${i} // a line of the file it read`).join('\n');

/** A line whose result is long enough to scroll inside its own cap. */
export const Long: StoryObj = {
  render: () => (
    <div style={PANEL}>
      <WorkedLine
        line={line({
          id: 'l:10',
          tool: 'Read',
          sentence: 'Read src/lib/feed.ts',
          fact: '212 lines',
          input: 'src/lib/feed.ts',
          result: LONG,
        })}
        marks="chat"
        open
      />
    </div>
  ),
};
