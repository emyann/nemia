import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import type { RunView } from '@/lib/api/judged';
import { FirstHint } from './FirstHint';

/**
 * A first card's run as the hints read it: labelled, in `status`, its first step filed where `filed`, and `land` its ending step
 * (`workspace: base`), so a run that succeeded draws it.
 */
const runOf = (status: RunView['status'], filed: boolean) => ({
  labels: { onboarding: 'first-card', workflow: 'quick' },
  status,
  steps: [
    { name: 'implement', filed: filed ? {} : null, spec: { workspace: null } },
    { name: 'land', filed: null, spec: { workspace: 'base' } },
  ] as unknown as RunView['steps'],
});

/** The hint of one beat, on a run that stands at it: one story a beat. */
const meta: Meta<typeof FirstHint> = {
  title: 'Run/First hint',
  component: FirstHint,
  args: { run: runOf('running', false), beat: 'card' },
};
export default meta;

type Story = StoryObj<typeof meta>;

/** Started, nothing filed yet: the card. */
export const Card: Story = {
  args: { run: runOf('running', false), beat: 'card' },
  play: async ({ canvasElement }) => expect(canvasElement.querySelector('[data-first-hint="card"]')).not.toBeNull(),
};

/** A step filed and at work: the steps. */
export const Steps: Story = {
  args: { run: runOf('running', true), beat: 'steps' },
  play: async ({ canvasElement }) => expect(canvasElement.querySelector('[data-first-hint="steps"]')).not.toBeNull(),
};

/** At its gate: the hint that it waits on you. */
export const Gate: Story = {
  args: { run: runOf('awaiting approval', true), beat: 'gate' },
  play: async ({ canvasElement }) => expect(canvasElement.querySelector('[data-first-hint="gate"]')).not.toBeNull(),
};

/** Succeeded: the hint leads to what is next. */
export const Succeeded: Story = {
  args: { run: runOf('succeeded', true), beat: 'succeeded' },
  play: async ({ canvasElement }) => expect(canvasElement.querySelector('[data-first-next]')).not.toBeNull(),
};

/** A run that is not the first card's draws no hint: the page around it says only what it is. */
export const NotFirst: Story = {
  args: { run: { ...runOf('awaiting approval', true), labels: { workflow: 'quick' } }, beat: 'gate' },
  render: (args) => (
    <section className="flex flex-col gap-2">
      <p className="m-0 text-body-medium text-on-surface-variant">A run that is no first card&rsquo;s, at its gate.</p>
      <FirstHint {...args} />
    </section>
  ),
  play: async ({ canvasElement }) => expect(canvasElement.querySelector('[data-first-hint]')).toBeNull(),
};
