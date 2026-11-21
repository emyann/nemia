import type { Meta, StoryObj } from '@storybook/react-vite';
import { ArrowUpIcon } from 'lucide-react';
import { expect } from 'storybook/test';
import { atRest, tabTo } from '../../../.storybook/play';
import { CutIconPress } from './CutIconPress';
import { ON_PLAIN } from './stories.fixture';

/** The kit's tonal icon button in the look's cut: a composer's send, its stop, and a send with nothing to send. */
const meta: Meta = { title: 'Look/CutIconPress' };
export default meta;

/** What the stop shows: a square of the button's ink, as the composer draws it. */
const StopGlyph = ({ className }: { size?: number; className?: string }) => (
  <span aria-hidden="true" className={`size-3 bg-current ${className ?? ''}`} />
);

/** The send: its ring, a band in the cut shape, shown only once the keyboard reaches it. */
export const Send: StoryObj<typeof CutIconPress> = {
  args: { cut: 10, label: 'Send', icon: ArrowUpIcon },
  render: (args) => (
    <div style={ON_PLAIN}>
      <CutIconPress {...args} data-press-story="send" />
    </div>
  ),
  play: async ({ canvasElement, userEvent }) => {
    const ring = canvasElement.querySelector<HTMLElement>('[data-cut-ring]')!;
    await expect(getComputedStyle(ring).display, 'no ring before the keyboard reaches it').toBe('none');
    await tabTo(userEvent, 'pressStory');
    await expect(getComputedStyle(ring).display, 'the ring in the cut shape, with the keyboard on it').toBe('block');
    atRest();
  },
};

/** The stop, while a turn is at work: a square in the button's ink. */
export const Stop: StoryObj<typeof CutIconPress> = {
  args: { cut: 10, label: 'Stop', icon: StopGlyph },
  render: (args) => (
    <div style={ON_PLAIN}>
      <CutIconPress {...args} />
    </div>
  ),
};

/** A send with nothing to send: it takes no press and no focus. */
export const Off: StoryObj<typeof CutIconPress> = {
  args: { cut: 10, label: 'Send', icon: ArrowUpIcon, isDisabled: true },
  render: (args) => (
    <div style={ON_PLAIN}>
      <CutIconPress {...args} />
    </div>
  ),
};
