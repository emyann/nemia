import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { FactoryVolumes } from './FactoryVolumes';
import { factoryView, FACTORY } from '../../../.storybook/fixtures/proposals';
import { volumes } from '../../../.storybook/fixtures/factories';

/** A factory's volumes on its settings page, one story a state: none, with the line that mounts one, and two, a divider between them. */
const meta: Meta<typeof FactoryVolumes> = {
  title: 'Factory/FactoryVolumes',
  component: FactoryVolumes,
  args: { factory: factoryView(FACTORY) },
};
export default meta;

type Story = StoryObj<typeof FactoryVolumes>;

/** No volume: the kit's empty state, with the line that mounts a folder. */
export const None: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-no-volumes] [data-slot="empty-state"]')).not.toBeNull();
  },
};

/** A read-only folder and a writable one, which says it is not the run's workspace. */
export const Two: Story = {
  args: { factory: { ...factoryView(FACTORY), volumes } },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('[data-factory-volume]').length).toBe(2);
    await expect(canvasElement.querySelector('[data-volume-caveat]')).not.toBeNull();
  },
};
