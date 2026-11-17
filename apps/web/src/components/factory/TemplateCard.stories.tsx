import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { TemplateCard } from './TemplateCard';
import { rendered, unrendered } from '../../../.storybook/fixtures/factories';

/** The template a factory is made from, the first section of its Settings, one story a state: not rendered yet, and rendered. */
const meta: Meta<typeof TemplateCard> = {
  title: 'Factory/TemplateCard',
  component: TemplateCard,
  args: { template: unrendered },
};
export default meta;

type Story = StoryObj<typeof TemplateCard>;

/** Before the daemon renders it: where it is and the version wanted, and that it is not rendered yet. */
export const NotRendered: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-template-applied=""]')).not.toBeNull();
  },
};

/** Rendered: the version applied, the parameters given, and each condition the daemon wrote, the one amiss in the error colour. */
export const Rendered: Story = {
  args: { template: rendered },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-param]').length).toBe(2);
    await expect(canvasElement.querySelector('[data-amiss] [data-slot="tag"]')?.getAttribute('data-color')).toBe('error');
  },
};
