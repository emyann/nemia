import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { FactoryHome } from './FactoryHome';
import { FACTORY } from '../../../.storybook/fixtures/proposals';

/** A factory's home on its settings page: what it is, and the line that opens a person's own session there, with its Copy button. */
const meta: Meta<typeof FactoryHome> = {
  title: 'Factory/FactoryHome',
  component: FactoryHome,
  args: { name: FACTORY, line: `nemia factory home ${FACTORY}` },
};
export default meta;

type Story = StoryObj<typeof FactoryHome>;

/** The card, titled Home, its line as the api answered it, and the button that copies it. */
export const Line: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await expect(canvasElement.querySelector('code')).toHaveTextContent(`nemia factory home ${FACTORY}`);
    await expect(page.getByRole('button', { name: `Copy: nemia factory home ${FACTORY}` })).toBeVisible();
  },
};
