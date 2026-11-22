import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { SessionReading } from './SessionReading';

/** A box as the session page, or the step bar, gives its talk. */
const PANEL = { width: 460, height: 420, padding: 16, background: 'var(--md-sys-color-surface-container-low)', display: 'flex' };

/** A step's conversation while it is first read: the shape of its turns where the talk will stand, named for a screen reader. */
const meta: Meta<typeof SessionReading> = {
  title: 'Run/SessionReading',
  component: SessionReading,
  args: { words: 'Reading the conversation…', density: 'page' },
  render: (args) => (
    <div style={PANEL}>
      <SessionReading {...args} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await expect(within(canvasElement).getByRole('status')).toHaveTextContent(args.words);
    await expect(canvasElement.querySelector('[data-session-reading]')).not.toBeNull();
  },
};
export default meta;

/** On the step's session page. */
export const Page: StoryObj<typeof SessionReading> = {};

/** In the step bar, its tail compact. */
export const InTheBar: StoryObj<typeof SessionReading> = { args: { words: 'Reading its conversation…', density: 'compact' } };
