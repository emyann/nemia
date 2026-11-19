import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { AskQuestion } from '@/lib/api/chat';
import type { ChatAsk as Ask } from '@/lib/chatFollowing';
import { ChatAsk } from './ChatAsk';

/** Her one question in her chat, its choices explained: the kit's radios, its checkboxes where it takes several, and Answer. */
const meta: Meta<typeof ChatAsk> = { title: 'Frame/ChatAsk', args: { onAnswer: () => undefined } };
export default meta;

/** Where an ask stands in its story: her side sheet's width, on its ground. */
const SHEET = { width: 400, padding: 16, background: 'var(--md-sys-color-surface)', display: 'flex', flexDirection: 'column' as const };

/** Her question, each choice with why; `multiSelect` where it takes several. */
const question = (multiSelect: boolean) => ({
  question: 'What the board shows as an old closeout’s one line?',
  header: 'Summary',
  options: [
    { label: 'Cut it on read', description: 'The first line, cut at a word.', recommended: true },
    { label: 'First line as it is', description: 'The board cuts it by its layout.', recommended: false },
    { label: 'The whole summary', description: 'Wrapped, however long it is.', recommended: false },
  ],
  multiSelect,
});

/** Her ask, carrying `q`. */
const ask = (q: AskQuestion) =>
  ({
    kind: 'question',
    id: 'q:call-1',
    call: 'call-1',
    at: '2026-10-15T17:40:00.000Z',
    text: 'The design signed off with a question it cannot settle alone. [Read the design](/runs/r-1)',
    questions: [q],
  }) satisfies Ask;

/** One choice of several: radios, the Recommended tag, the link her words carry, and Answer off until a choice is made. */
export const OneChoice: StoryObj<typeof ChatAsk> = {
  args: { ask: ask(question(false)) },
  play: async ({ canvasElement, userEvent }) => {
    const answer = canvasElement.querySelector<HTMLButtonElement>('[data-chat-answer]')!;
    await expect(answer).toBeDisabled();
    await userEvent.click(canvasElement.querySelector('[data-chat-option="First line as it is"]')!);
    await expect(canvasElement.querySelector('[data-chat-option="First line as it is"]')).toHaveAttribute('data-selected', 'true');
    await expect(answer).toBeEnabled();
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatAsk {...args} />
    </div>
  ),
};

/** A question that takes several: a checkbox a choice. */
export const Several: StoryObj<typeof ChatAsk> = {
  args: { ask: ask(question(true)) },
  play: async ({ canvasElement, userEvent }) => {
    await userEvent.click(canvasElement.querySelector('[data-chat-option="Cut it on read"]')!);
    await userEvent.click(canvasElement.querySelector('[data-chat-option="The whole summary"]')!);
    await expect(canvasElement.querySelectorAll('[data-chat-option][data-selected]')).toHaveLength(2);
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatAsk {...args} />
    </div>
  ),
};

/** A call of hers that would prompt: what the SDK handed over drawn over the form, and Deny picked first where it leans to no. */
export const Permission: StoryObj<typeof ChatAsk> = {
  args: {
    ask: {
      kind: 'permission',
      id: 'q:permission',
      call: 'permission',
      at: '2026-10-15T17:40:00.000Z',
      text: 'May I run this?',
      questions: [
        {
          question: 'May I run this?',
          header: 'Bash',
          options: [
            { label: 'Allow', description: 'Run it this once.', recommended: false },
            { label: 'Deny', description: 'Do not run it.', recommended: false },
          ],
          multiSelect: false,
        },
      ],
      permission: {
        tool: 'Bash',
        command: 'rm -rf dist',
        description: 'Removes the build folder',
        decisionReason: 'No rule allows Bash(rm *)',
        blockedPath: '/srv/project/dist',
        always: true,
        defaultToNo: true,
      },
    },
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatAsk {...args} />
    </div>
  ),
};

/** Answered: her tag says so, and the line says what the person chose; the form is gone. */
export const Answered: StoryObj<typeof ChatAsk> = {
  args: {
    ask: {
      ...ask(question(false)),
      chose: { 'What the board shows as an old closeout’s one line?': 'Cut it on read' },
      choseAt: '2026-10-15T17:42:00.000Z',
    },
  },
  render: (args) => (
    <div style={SHEET}>
      <ChatAsk {...args} />
    </div>
  ),
};
