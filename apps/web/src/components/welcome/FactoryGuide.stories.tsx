import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { DOCS_PAGES } from '@/lib/docs';
import { FactoryGuide } from './FactoryGuide';

/** The short guide an empty factory is given: a workflow, an agent and a hire, each with its docs page. */
const meta: Meta<typeof FactoryGuide> = {
  title: 'Pages/Factory guide',
  component: FactoryGuide,
  args: {},
  render: () => (
    <div style={{ width: 560 }}>
      <FactoryGuide />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** Three ideas in order, each link leading to its docs page, in a new tab. */
export const Ideas: Story = {
  play: async ({ canvasElement }) => {
    const items = [...canvasElement.querySelectorAll<HTMLElement>('[data-guide]')];
    await expect(items.map((i) => i.dataset.guide)).toEqual(['workflow', 'agent', 'hire']);
    for (const item of items) {
      const link = within(item).getByRole('link');
      await expect(link).toHaveAttribute('href', DOCS_PAGES[item.dataset.guide as keyof typeof DOCS_PAGES]);
      await expect(link).toHaveAttribute('target', '_blank');
    }
  },
};
