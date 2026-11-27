import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { SectionHead } from './SectionHead';
import { ON_PLAIN } from './stories.fixture';

/** A section's head, the one the pages of the board share: its count and its word on a cut tag in the section's colour. */
const meta: Meta<typeof SectionHead> = { title: 'Look/SectionHead', component: SectionHead };
export default meta;

type Story = StoryObj<typeof SectionHead>;

/** One head a tone: waiting on you, at work, at rest; and quiet where the count is zero. */
export const Tones: Story = {
  render: () => (
    <div style={{ ...ON_PLAIN, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <SectionHead count={3} word="Waiting" tone="yours" />
      <SectionHead count={2} word="Working" tone="alive" />
      <SectionHead count={12} word="Cards" tone="rest" />
      <SectionHead count={0} word="Chains" tone="rest" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tones = [...canvasElement.querySelectorAll('[data-count-chip]')].map((chip) => chip.getAttribute('data-count-tone'));
    await expect(tones).toEqual(['yours', 'alive', 'rest', 'quiet']);
  },
};
