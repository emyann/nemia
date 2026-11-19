import type { Meta, StoryObj } from '@storybook/react-vite';
import { DEFAULT_NAMESPACE } from 'objects';
import { delay, http } from 'msw';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { factoryView, FACTORY } from '../../../.storybook/fixtures/proposals';
import { atRest, settled } from '../../../.storybook/play';
import { FactoryCostLines } from './FactoryCostLines';

/**
 * A factory's cost lines on its settings page, a story a state: a line set and one not, Save following each keystroke; a Save still
 * out; the default factory, which sets none; and a factory that offers no workflow.
 */
const meta: Meta<typeof FactoryCostLines> = {
  title: 'Factory/FactoryCostLines',
  component: FactoryCostLines,
  args: { factory: { ...factoryView(FACTORY), workflows: ['build', 'quick'], costLines: { build: 80 } } },
};
export default meta;

type Story = StoryObj<typeof FactoryCostLines>;

/** build's line of $80 and quick's none: an amount typed in quick's field, cents and all, offers Save before the field is left. */
export const Lines: Story = {
  play: async ({ canvasElement }) => {
    const page = within(canvasElement);
    const build = within(canvasElement.querySelector<HTMLElement>('[data-cost-line="build"]')!);
    const quick = within(canvasElement.querySelector<HTMLElement>('[data-cost-line="quick"]')!);
    await expect(page.getByRole('textbox', { name: 'The cost line of build, in dollars' })).toHaveValue('$80.00');
    await expect(build.getByRole('button', { name: 'Save' })).toBeDisabled();
    const field = page.getByRole('textbox', { name: 'The cost line of quick, in dollars' });
    await expect(quick.getByRole('button', { name: 'Save' })).toBeDisabled();
    await userEvent.type(field, '12.5');
    await expect(field).toHaveFocus();
    await expect(quick.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.clear(field);
    await expect(quick.getByRole('button', { name: 'Save' })).toBeDisabled();
    atRest();
  },
};

/** A Save still out: Writing…, the kit's small ProgressIndicator in it, the press off until the api answers. */
export const Writing: Story = {
  parameters: { msw: [http.put('/api/factories/:name/costlines/:workflow', async () => delay('infinite'))] },
  play: async ({ canvasElement }) => {
    const quick = within(canvasElement.querySelector<HTMLElement>('[data-cost-line="quick"]')!);
    await userEvent.type(quick.getByRole('textbox', { name: 'The cost line of quick, in dollars' }), '4');
    await userEvent.click(quick.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(quick.getByRole('button', { name: 'Writing…' })).toBeDisabled());
    await expect(quick.getByRole('button', { name: 'Writing…' }).querySelector('[data-pending]')).not.toBeNull();
    await settled(canvasElement);
  },
};

/** The default factory: it keeps no file, so it sets no line, and says so. */
export const DefaultFactory: Story = {
  args: { factory: factoryView(DEFAULT_NAMESPACE, true) },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-no-cost-lines]')).not.toBeNull();
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
  },
};

/** A factory that offers no workflow: the line that attaches one. */
export const NoWorkflow: Story = {
  args: { factory: { ...factoryView(FACTORY), workflows: [] } },
  play: async ({ canvasElement }) => {
    const { attach } = factoryView(FACTORY).commands;
    await expect(within(canvasElement).getByText(attach)).toBeVisible();
  },
};
