import type { Meta, StoryObj } from '@storybook/react-vite';
import { Markdown } from '../markdown/Markdown';
import { CutBubble } from './CutBubble';
import { ON_PLAIN } from './stories.fixture';

/** The agent's words in a cut bubble: as a conversation draws a message, markdown and all, and as one is told while it is written. */
const meta: Meta = { title: 'Look/CutBubble' };
export default meta;

/** A message, its markdown drawn: the ground cut at two corners, the words clear of both. */
export const Words: StoryObj<typeof CutBubble> = {
  args: { size: 10 },
  render: (args) => (
    <div style={{ ...ON_PLAIN, width: 420 }}>
      <CutBubble {...args} data-bubble-story="words">
        <Markdown>{'The run **waits on you** at `land`: read the change, then approve it or send it back.'}</Markdown>
      </CutBubble>
    </div>
  ),
};

/** A message told as it is written: its line breaks and spaces kept as they come. */
export const Writing: StoryObj<typeof CutBubble> = {
  args: { size: 10, pre: true },
  render: (args) => (
    <div style={{ ...ON_PLAIN, width: 420 }}>
      <CutBubble {...args} data-bubble-story="writing">
        {'Reading the change…\n  two files so far'}
      </CutBubble>
    </div>
  ),
};
