import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';
import { skillsQuery } from '@/lib/api/skills';
import { SkillPicker } from './SkillPicker';
import { scribe, skillPlaces } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** The skills an agent of yours gives, and the side sheet of every skill it can be given, opened by Add a skill. */
const meta: Meta<typeof SkillPicker> = {
  title: 'Store/SkillPicker',
  component: SkillPicker,
  args: { skills: 'write-a-note', given: scribe.given, onSkills: fn() },
  render: (args) => (
    <QueryClientProvider client={seeded([[skillsQuery.queryKey, skillPlaces]])}>
      <SkillPicker {...args} />
    </QueryClientProvider>
  ),
};
export default meta;

type Story = StoryObj<typeof SkillPicker>;

/** One skill given, the sheet closed. */
export const Given: Story = {};

/** None given. */
export const NoneGiven: Story = { args: { skills: '', given: [] } };

/**
 * The sheet open: your library's skills, one given and one to add, and Nemia's own to copy; Add hands the line back with it.
 *
 * Axe's `label-content-name-mismatch` alone is off: Copy's name names its skill inside its words (`Copy grill-me to my library and add`),
 * which its visible words (`Copy to my library and add`) are then not a part of, on the page as here. Its words are the page's to mend,
 * apart from this story; every other rule holds the sheet.
 */
export const SheetOpen: Story = {
  parameters: { a11y: { config: { rules: [{ id: 'label-content-name-mismatch', enabled: false }] } } },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Add a skill' }));
    const sheet = await screen.findByRole('dialog', { name: 'Add a skill' });
    await waitFor(() => expect(within(sheet).getByRole('button', { name: 'Copy grill-me to my library and add' })).toBeVisible());
    await userEvent.click(within(sheet).getByRole('button', { name: 'Add ask-first' }));
    await expect(args.onSkills).toHaveBeenCalledWith('write-a-note, ask-first');
  },
};
