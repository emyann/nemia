import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { DEFAULT_NAMESPACE } from 'objects';
import { CardLift, LiftHold } from './LiftHold';

/** Lift, where a run is held: asked once a menu's Lift… was pressed; on the Factory's card, in a popover over the card. */
const meta: Meta<typeof LiftHold> = {
  title: 'Run/LiftHold',
  component: LiftHold,
  args: { id: 'board-hold-the-floor-a1b2', onClose: fn() },
  render: (args) => (
    <div style={{ width: 400 }}>
      <LiftHold {...args} />
    </div>
  ),
};
export default meta;

/** Asked, once a menu's Lift… was pressed: what a lift does, Lift and Keep it, which closes the question. */
export const Asking: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement);
    await expect(page.getByRole('button', { name: 'Lift' })).toBeEnabled();
    await userEvent.click(page.getByRole('button', { name: 'Keep it' }));
    await expect(args.onClose).toHaveBeenCalled();
  },
};

/** On the Factory's card, Lift… opened: the popover that asks, and the press that lifts. */
export const OnTheCard: StoryObj<typeof meta> = {
  render: (args) => (
    <div style={{ width: 400, minHeight: 240, display: 'flex', justifyContent: 'flex-end' }}>
      <CardLift id={args.id} namespace={DEFAULT_NAMESPACE} />
    </div>
  ),
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Lift…' }));
    const dialog = await within(canvasElement.ownerDocument.body).findByRole('dialog', { name: `Lift the hold on ${args.id}` });
    await expect(within(dialog).getByRole('button', { name: 'Lift' })).toBeEnabled();
  },
};
