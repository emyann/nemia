import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn, userEvent, within } from 'storybook/test';
import { SkillPicker } from './SkillPicker';
import { saysReading, Unread } from '../../../.storybook/unread';

/** An agent's skills, and Add a skill: here opened while the skills it may add are read, the shape of their places. */
const meta: Meta<typeof SkillPicker> = {
  title: 'Store/SkillPicker',
  component: SkillPicker,
  args: { skills: '', given: [], onSkills: fn() },
  render: (args) => (
    <Unread>
      <div style={{ width: 560 }}>
        <SkillPicker {...args} />
      </div>
    </Unread>
  ),
};
export default meta;

/** Opened, the skills still read. */
export const ReadingTheSkills: StoryObj<typeof meta> = {
  play: async (context) => {
    await userEvent.click(within(context.canvasElement).getByRole('button', { name: 'Add a skill' }));
    await saysReading('Reading the skills…')(context);
  },
};
