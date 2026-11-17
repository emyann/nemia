import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { runActionsOf } from '@/lib/runActions';
import { RunMenu } from './RunMenu';
import { CODES, runOf, stepOf, tryOf } from '../../../.storybook/fixtures/steps';

/** A try at work: one a person may remove, or hold. */
const TRY_AT_WORK = { ...runOf(stepOf(CODES.work, [tryOf(1, CODES.work, false, null)])), try: { agent: 'scribe' } };

/** A try over and held, its worktrees and files on disk: one a person may remove, lift and prune, every kind of action at once. */
const HELD_OVER = {
  ...runOf(stepOf(CODES.done, [tryOf(1, CODES.done, true, null)])),
  try: { agent: 'scribe' },
  holding: { at: '2026-11-16T09:00:00.000Z', runs: [], word: 'held', advice: '', waitingOnYou: true },
};

/** The run's actions behind one button in its header, the kit's menu: Remove for a try, Hold or Lift, and Prune, each its own question. */
const meta: Meta<typeof RunMenu> = {
  title: 'Run/RunMenu',
  component: RunMenu,
  args: { run: TRY_AT_WORK },
  render: (args) => (
    <div style={{ width: 480, minHeight: 320, display: 'flex', justifyContent: 'flex-end' }}>
      <RunMenu {...args} />
    </div>
  ),
};
export default meta;

/** The labels of the menu's items, in their order. */
const itemsOf = (menu: HTMLElement): string[] =>
  within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent?.trim() ?? '');

/** Opened by a press on a try at work: Remove… and Hold…, in the order the run's actions say (`runActionsOf`). */
export const Opened: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: `Actions on ${args.run.id}` }));
    const menu = await within(canvasElement.ownerDocument.body).findByRole('menu', { name: `Actions on ${args.run.id}` });
    await expect(itemsOf(menu)).toEqual(['Remove…', 'Hold…']);
  },
};

/**
 * Opened by the keyboard on a try over and held: Tab reaches the button, Enter opens the menu on its first item, and the arrow keys walk
 * Remove…, Lift… and Prune…, the run's actions in their order; Escape closes it and gives the focus back to the button.
 */
export const ByKeyboard: StoryObj<typeof meta> = {
  args: { run: HELD_OVER },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole('button', { name: `Actions on ${args.run.id}` });
    await userEvent.tab();
    await expect(button).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    const menu = await within(canvasElement.ownerDocument.body).findByRole('menu', { name: `Actions on ${args.run.id}` });
    const labels = runActionsOf(args.run).map((action) => action.label);
    await expect(labels).toEqual(['Remove…', 'Lift…', 'Prune…']);
    await expect(itemsOf(menu)).toEqual(labels);
    const items = within(menu).getAllByRole('menuitem');
    await waitFor(() => expect(items[0]).toHaveFocus());
    await userEvent.keyboard('{ArrowDown}');
    await expect(items[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(items[2]).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(within(canvasElement.ownerDocument.body).queryByRole('menu')).toBeNull());
    await expect(button).toHaveFocus();
  },
};

/** Remove… pressed: the menu closes, and its question opens beside the button, Remove and Keep it, which takes it back. */
export const Asks: StoryObj<typeof meta> = {
  play: async ({ canvasElement, args }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(within(canvasElement).getByRole('button', { name: `Actions on ${args.run.id}` }));
    await userEvent.click(within(await body.findByRole('menu')).getByRole('menuitem', { name: 'Remove…' }));
    const asked = await body.findByRole('dialog', { name: `Remove ${args.run.id}` });
    await expect(body.queryByRole('menu')).toBeNull();
    await expect(within(asked).getByRole('button', { name: 'Remove' })).toBeEnabled();
    await userEvent.click(within(asked).getByRole('button', { name: 'Keep it' }));
    await waitFor(() => expect(body.queryByRole('dialog')).toBeNull());
  },
};
