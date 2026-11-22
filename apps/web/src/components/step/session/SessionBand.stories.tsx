import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { stepQueuedSaid } from '@/lib/queued';
import { SessionQueuedBand } from './SessionBand';

/** The band over a step's talk while its session, or its check, is filed and waits to start: one sentence of why. */
const meta: Meta<typeof SessionQueuedBand> = {
  title: 'Run/SessionQueuedBand',
  component: SessionQueuedBand,
  render: (args) => (
    <div style={{ width: 460, padding: 16, background: 'var(--md-sys-color-surface-container-low)' }}>
      <SessionQueuedBand {...args} />
    </div>
  ),
};
export default meta;

const GI = 2 ** 30;

/** Its session waits for memory, with some kept free for a person's turn and withheld from it. */
export const ForMemory: StoryObj<typeof meta> = {
  args: { why: stepQueuedSaid({ task: 'session', wait: { for: 'memory', needBytes: 2 * GI, roomBytes: 1.5 * GI, keptBytes: 2.5 * GI } }) },
  play: async ({ canvasElement }) => {
    const band = canvasElement.querySelector('[data-band="queued"]');
    await expect(band?.getAttribute('role')).toBe('status');
    await expect(band?.textContent).toContain('kept for a person’s turn');
  },
};

/** Its check waits for a slot: its pool at its ceiling. */
export const ForASlot: StoryObj<typeof meta> = {
  args: { why: stepQueuedSaid({ task: 'check', wait: { for: 'slot', pool: 'check', ceiling: 2 } }) },
};

/** The server paused: nothing filed starts until it resumes. */
export const WhilePaused: StoryObj<typeof meta> = {
  args: { why: stepQueuedSaid({ task: 'session', wait: { for: 'paused' } }) },
};
