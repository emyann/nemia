import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { TalkReading } from './TalkReading';

/** A box as a panel gives a talk (`Talk.stories.tsx`'s). */
const PANEL = { width: 460, height: 420, padding: 16, background: 'var(--card)', display: 'flex' };

/** The talk's place while its conversation is first read, in the shape of its turns, beside the talk's own stories (`Run/Talk`). */
const meta: Meta<typeof TalkReading> = {
  title: 'Run/TalkReading',
  component: TalkReading,
  args: { marks: 'session', label: 'Reading the conversation…', density: 'page' },
  render: (args) => (
    <div style={PANEL}>
      <TalkReading {...args} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(args.label);
  },
};
export default meta;

/** As a step's session page draws it until the conversation is in. */
export const Page: StoryObj<typeof TalkReading> = {};

/** Compact, as the step bar draws its conversation's tail until it is in. */
export const Compact: StoryObj<typeof TalkReading> = { args: { label: 'Reading its conversation…', density: 'compact' } };
