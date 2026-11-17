import type { Meta, StoryObj } from '@storybook/react-vite';
import { delay, http } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { FactoryCostLines } from './FactoryCostLines';
import { factoryView } from '../../../.storybook/fixtures/proposals';

/** A factory's cost lines on its settings page: each workflow's line with its form, a story a state. */
const meta: Meta<typeof FactoryCostLines> = {
  title: 'Factory/FactoryCostLines',
  component: FactoryCostLines,
  args: { factory: { ...factoryView('nemia'), workflows: ['build', 'quick'], costLines: { build: 16 } } },
  parameters: { msw: [http.put('/api/factories/:name/costlines/:workflow', async () => delay('infinite'))] },
  render: (args) => (
    <div style={{ width: 640 }}>
      <FactoryCostLines {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** Two workflows, one with its line set and one with none. */
export const Lines: Story = {
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-cost-line-said="16"]')).not.toBeNull();
    await expect(canvasElement.querySelector('[data-cost-line-said="none"]')).not.toBeNull();
  },
};

/** A Save still out: Writing…, the kit's small ProgressIndicator in it, the press off until the api answers. */
export const Writing: Story = {
  play: async ({ canvasElement }) => {
    const row = within(canvasElement.querySelector<HTMLElement>('[data-cost-line="quick"]')!);
    await userEvent.type(row.getByRole('spinbutton'), '4');
    await userEvent.click(row.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(row.getByRole('button', { name: 'Writing…' })).toBeDisabled());
    await expect(row.getByRole('button', { name: 'Writing…' }).querySelector('[data-pending]')).not.toBeNull();
  },
};

/** The default factory, which keeps no file and so sets no line. */
export const DefaultFactory: Story = {
  args: { factory: factoryView('default', true) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-no-cost-lines]')).not.toBeNull();
  },
};
