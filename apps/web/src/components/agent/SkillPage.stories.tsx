import { Suspense } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { skillQuery, type SkillDetail } from '@/lib/api/skills';
import { SkillPage } from './SkillPage';
import { skillDetail } from '../../../.storybook/fixtures/agents';
import { seeded } from '../../../.storybook/fixtures/proposals';

/** A skill's page, its read seeded: its form, the switch that loads it every turn, and whom it changes. */
const meta: Meta<typeof SkillPage> = {
  title: 'Pages/Skill',
  component: SkillPage,
  args: { from: 'user', name: 'write-a-note', place: {} },
};
export default meta;

type Story = StoryObj<typeof SkillPage>;

/** The page over `detail`. */
const over = (detail: SkillDetail) =>
  ({
    render: (args) => (
      <QueryClientProvider client={seeded([[skillQuery(args.from, args.name).queryKey, detail]])}>
        <Suspense>
          <SkillPage {...args} />
        </Suspense>
      </QueryClientProvider>
    ),
  }) satisfies Story;

/** Yours, named: the switch off and free to press. */
export const Named: Story = {
  ...over(skillDetail),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(await page.findByRole('switch', { name: /Load it every turn/ })).not.toBeChecked();
    await expect(page.getByRole('switch', { name: /Load it every turn/ })).toBeEnabled();
  },
};

/** Yours, loaded every turn: the switch on. */
export const Preloaded: Story = over({ ...skillDetail, skill: { ...skillDetail.skill, preload: true } });
