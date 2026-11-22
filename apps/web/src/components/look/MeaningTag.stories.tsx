import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Tag } from '@/components/ui/ds';
import { CutTag } from './CutTag';
import { MeaningTag } from './MeaningTag';
import { ON_CARD } from './stories.fixture';

/**
 * A tag in a meaning's colour, at the kit Tag's metrics: what says a session is at work, now that the theme's secondary, the kit Tag's
 * default, is ink.
 */
const meta: Meta<typeof MeaningTag> = {
  title: 'Look/MeaningTag',
  component: MeaningTag,
  args: { hue: 'alive', children: 'At work' },
  render: (args) => (
    <div style={ON_CARD}>
      <MeaningTag {...args} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tag = canvasElement.querySelector('[data-meaning]');
    await expect(tag).not.toBeNull();
    await expect(tag).toHaveAttribute('data-slot', 'tag');
  },
};
export default meta;

/** Alive, in its container: the quiet form, as a step at work and the runs in flight say it. */
export const Alive: StoryObj<typeof MeaningTag> = {};

/** Alive, filled: the meaning itself under its own ink. */
export const AliveFilled: StoryObj<typeof MeaningTag> = { args: { form: 'filled' } };

/** In the look's cut, beside the kit's own tag, the same height and type: the chip naming the step a run is on. */
export const InACut: StoryObj<typeof MeaningTag> = {
  args: { children: 'implement', className: 'uppercase' },
  render: (args) => (
    <div style={{ ...ON_CARD, display: 'flex', gap: 12, alignItems: 'center' }}>
      <CutTag>
        <MeaningTag {...args} />
      </CutTag>
      <CutTag>
        <Tag variant="filled" color="primary" className="uppercase">
          review
        </Tag>
      </CutTag>
    </div>
  ),
};
