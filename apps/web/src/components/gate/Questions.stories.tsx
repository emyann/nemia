import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect } from 'storybook/test';
import type { Question } from '@/lib/api/tries';
import type { Frozen } from '@/lib/frozen';
import { chosenDraft, wayDraft, wordsDraft, type Draft } from '@/lib/question-draft/questionDraft';
import { QuestionSeries } from './Questions';

/** A question that takes one answer, with a recommendation. */
const CUT: Frozen<Question> = {
  title: 'How is the card cut?',
  body: 'It is **big**: four packages and the board.',
  options: [
    { label: 'Shape first', meaning: 'The api and the answer first, the board in a second card.' },
    { label: 'All at once', meaning: 'One card, one review: longer, and nothing half merged.' },
  ],
  recommended: 'Shape first',
  multiple: false,
};

/** A question that takes several answers, two recommended. */
const WHERE: Frozen<Question> = {
  title: 'Where do the answers go?',
  body: 'Either or both.',
  options: [
    { label: 'retry', meaning: 'Into the next try, as its brief.' },
    { label: 'gate', meaning: 'With the approval, for the steps after it.' },
    { label: 'chat', meaning: 'Into the conversation, where the person asked.' },
  ],
  recommended: ['retry', 'gate'],
  multiple: true,
};

/** A question with no recommendation. */
const WHEN: Frozen<Question> = {
  title: 'When does it land?',
  body: 'The board look changes next week.',
  options: [
    { label: 'Now', meaning: 'With today’s look.' },
    { label: 'After the look', meaning: 'Wait for the new parts.' },
  ],
  recommended: null,
  multiple: false,
};

/** What a story draws: the questions, the draft it starts from, and whether it is answered or read. */
type Series = { questions: readonly Frozen<Question>[]; draft: Draft; readOnly: boolean };

/** The series answered, its draft kept in the story's own state, as a form keeps it. */
function Answered({ questions, draft }: { questions: readonly Frozen<Question>[]; draft: Draft }) {
  const [now, setNow] = useState(draft);
  return (
    <div className="flex max-w-xl flex-col gap-4">
      <QuestionSeries questions={questions} draft={now} onDraft={setNow} />
    </div>
  );
}

/**
 * A series of questions from an agent, one part, a story a state: each question a section, each option a tile, the recommendation
 * tagged, one answer apart from several, and the two ways out the board supplies on every question.
 */
const meta: Meta<Series> = {
  title: 'Run/QuestionSeries',
  args: { questions: [CUT, WHERE, WHEN], draft: {}, readOnly: false },
  render: ({ questions, draft, readOnly }) =>
    readOnly ? (
      <div className="max-w-xl">
        <QuestionSeries field="open" questions={questions} />
      </div>
    ) : (
      <Answered questions={questions} draft={draft} />
    ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Nothing chosen yet: radio tiles where a question takes one, check tiles where it takes any, each with Something else and None of
 * these after its options, and no box for words. None of these on a question of several takes its checks back; Something else opens
 * the box for words.
 */
export const NothingChosen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    await expect(canvasElement.querySelector('[data-own]')).toBeNull();
    const where = canvasElement.querySelector<HTMLElement>(`fieldset[data-question="${WHERE.title}"]`)!;
    await expect(where.querySelectorAll('[data-way]').length).toBe(2);
    await userEvent.click(where.querySelector<HTMLElement>('[data-option="retry"]')!);
    await expect(where.querySelector('[data-option="retry"]')).toHaveAttribute('data-selected', 'true');
    await userEvent.click(where.querySelector<HTMLElement>('[data-way="none"]')!);
    await expect(where.querySelector('[data-option="retry"]')).not.toHaveAttribute('data-selected');
    await expect(where.querySelector('[data-own]')).not.toBeNull();
    const cut = canvasElement.querySelector<HTMLElement>(`fieldset[data-question="${CUT.title}"]`)!;
    await userEvent.click(cut.querySelector<HTMLElement>('[data-way="else"]')!);
    await expect(cut.querySelector('[data-own]')).not.toBeNull();
  },
};

/** The recommended answers chosen: the tagged tiles outlined and tinted, the question with none left as it was. */
export const RecommendedChosen: Story = {
  args: {
    draft: chosenDraft(chosenDraft(chosenDraft({}, CUT, 'Shape first', true), WHERE, 'retry', true), WHERE, 'gate', true),
  },
};

/** Something else taken on a question that takes one: its choice taken back, the box open with the person's words. */
export const SomethingElse: Story = {
  args: { draft: wordsDraft(wayDraft({}, CUT, 'else', true), CUT, 'Cut it three ways: the wire, the terminal, the board.') },
};

/** None of these taken on a question that takes several: no option checked, the box open for why, if the person will say. */
export const NoneOfThese: Story = { args: { draft: wayDraft({}, WHERE, 'none', true) } };

/** Words beside a choice, asked for by Add your words. */
export const WordsBesideAChoice: Story = {
  args: { draft: wordsDraft(chosenDraft({}, WHEN, 'Now', true), WHEN, 'Before Friday, please.') },
};

/** Read-only, under a step's output: the same sections and tiles, the recommendation tagged, no control and no way out. */
export const ReadOnly: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('input, textarea, button')).toBeNull();
    await expect(canvasElement.querySelector('[data-way]')).toBeNull();
    await expect(canvasElement.querySelectorAll('[data-recommended]').length).toBe(3);
  },
};
