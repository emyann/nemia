import type { Meta, StoryObj } from '@storybook/react-vite';
import type { StepCardFacts } from '@/lib/stepCard';
import { StepCard } from './StepCard';

/** A step's card in each of its states, with the values the owner's canvas draws: at work, at a gate, done, to come and failed. */
const meta: Meta = { title: 'Board/StepCard' };
export default meta;

/** The session's five facts on the A2A harness. */
const facts = (effort: string, context: string, permission: string): StepCardFacts['facts'] => [
  { key: 'Harness', value: 'a2a:remote' },
  { key: 'Model', value: 'opus' },
  { key: 'Effort', value: effort },
  { key: 'Context', value: context },
  { key: 'Permission', value: permission },
];

const SELDON = { name: 'Seldon', initial: 'S', role: 'Software architect' };

const AT_WORK: StepCardFacts = {
  kind: 'work',
  hue: 'alive',
  tag: { word: 'at work', color: 'secondary', variant: 'tonal' },
  agent: { name: 'Ada', initial: 'A', role: 'Software engineer' },
  step: 'implement',
  place: 'try 1 · round 1 of 3',
  time: { label: 'At work', value: '9m', note: 'since 7:55 PM', ink: 'alive' },
  facts: facts('medium', '400k tokens', 'auto'),
  spend: { kind: 'words', label: 'Spent', said: 'not measured yet', note: 'of $40' },
  note: { text: '1 call denied: Bash(cd)', icon: 'shield' },
  action: { words: 'Open the step', runId: 'the-board-s-frame-on-the-kit-04ys', step: 'implement' },
};

const AT_A_GATE: StepCardFacts = {
  kind: 'gate',
  hue: 'yours',
  tag: { word: 'waits for you', color: 'primary', variant: 'filled' },
  agent: SELDON,
  step: 'design',
  place: 'try 1',
  time: { label: 'Waiting', value: '6m', note: 'since 7:41 PM', ink: 'yours' },
  facts: facts('high', '200k tokens', 'auto'),
  spend: { kind: 'meter', label: 'Spent', value: 2.39, max: 10, said: '$2.39 of $10' },
  note: { text: 'Nine questions for you, each with a recommendation.', icon: 'info' },
  action: { words: 'Read and approve', runId: 'the-board-s-frame-on-the-kit-04ys', step: 'design' },
};

const DONE: StepCardFacts = {
  ...AT_A_GATE,
  kind: 'done',
  hue: 'none',
  tag: { word: 'verified', color: 'neutral', variant: 'tonal' },
  place: '2 tries',
  time: { label: 'Done', value: '7:55 PM', note: 'its last try ran 4m', ink: 'plain' },
  spend: { kind: 'meter', label: 'Spent', value: 3.71, max: 10, said: '$3.71 of $10' },
  note: { text: 'Approved at 7:56 PM.', icon: 'info' },
  action: { words: 'Open the step', runId: 'the-board-s-frame-on-the-kit-04ys', step: 'design' },
};

const TO_COME: StepCardFacts = {
  kind: 'come',
  hue: 'none',
  tag: { word: 'to come', color: 'secondary', variant: 'outlined' },
  agent: { name: 'Agora', initial: 'A', role: 'Code reviewer' },
  step: 'review',
  place: 'up to 3 rounds',
  time: { label: 'Starts', value: 'after implement', note: '', ink: 'muted' },
  facts: facts('high', '200k tokens', 'auto'),
  spend: { kind: 'words', label: 'Budget', said: '$16', note: '' },
  note: null,
  action: { words: 'Open the step', runId: 'the-board-s-frame-on-the-kit-04ys', step: 'review' },
};

const FAILED: StepCardFacts = {
  kind: 'failed',
  hue: 'none',
  tag: { word: 'failed its check', color: 'error', variant: 'tonal' },
  agent: { name: 'Otto', initial: 'O', role: 'Release engineer' },
  step: 'land',
  place: 'try 1',
  time: { label: 'Failed', value: '7:57 PM', note: 'ran 4m', ink: 'failure' },
  facts: facts('high', '200k tokens', 'auto'),
  spend: { kind: 'meter', label: 'Spent', value: 0.52, max: 10, said: '$0.52 of $10' },
  note: { text: 'Its check refused it (exit 1).', icon: 'fail' },
  action: { words: 'Open the step', runId: 'the-board-s-frame-on-the-kit-04ys', step: 'land' },
};

/** A step at work: the alive frame, how long since its session started, and its spend not measured yet. */
export const AtWork: StoryObj = { render: () => <StepCard facts={AT_WORK} /> };

/** A step at its gate: the frame that glows, waiting on you, its spend on a meter, and Read and approve. */
export const AtAGate: StoryObj = { render: () => <StepCard facts={AT_A_GATE} /> };

/** A step done: a quiet frame, when it ended, its tries and its spend. */
export const Done: StoryObj = { render: () => <StepCard facts={DONE} /> };

/** A step to come: when it starts, the rounds it may run, and its budget. */
export const ToCome: StoryObj = { render: () => <StepCard facts={TO_COME} /> };

/** A step its check refused: when it failed, and why. */
export const Failed: StoryObj = { render: () => <StepCard facts={FAILED} /> };
