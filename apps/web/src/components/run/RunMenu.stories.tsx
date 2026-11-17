import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RunMenu } from './RunMenu';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';

/** A try at work: one a person may remove, or hold. */
const TRY_AT_WORK = { ...runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)])), try: { agent: 'scribe' } };

/** The run's actions behind one button in its header: Remove for a try, Hold or Lift, and Prune, each its own question once pressed. */
const meta: Meta<typeof RunMenu> = {
  title: 'Run/RunMenu',
  component: RunMenu,
  args: { run: TRY_AT_WORK },
  render: (args) => (
    <div style={{ width: 480, minHeight: 240, display: 'flex', justifyContent: 'flex-end' }}>
      <RunMenu {...args} />
    </div>
  ),
};
export default meta;

/** Opened on a try at work: Remove… and Hold…. */
export const Opened: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: `Actions on ${args.run.id}` }));
    const menu = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: `Actions on ${args.run.id}` });
    await expect(within(menu).getByRole('button', { name: 'Remove…' })).toBeInTheDocument();
    await expect(within(menu).getByRole('button', { name: 'Hold…' })).toBeInTheDocument();
  },
};
