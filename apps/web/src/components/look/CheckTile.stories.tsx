import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { CheckTile, CheckTileGroup } from './CheckTile';

/** The tiles a story draws: three places answers may go, the last of which cannot be picked. */
type Tiles = { chosen: string[]; layout: 'row' | 'column'; width: number };

/** Several choices among a few, each a tile with its title and its line: the twin of the radio tile for a question that takes any. */
const meta: Meta<Tiles> = {
  title: 'Look/CheckTile',
  args: { chosen: [], layout: 'column', width: 420 },
  render: ({ chosen, layout, width }) => (
    <div style={{ width }}>
      <CheckTileGroup label="Where the answers go" defaultValue={chosen} layout={layout}>
        <CheckTile value="retry" title="retry" description="Into the next try, as its brief." />
        <CheckTile value="gate" title="gate" description="With the approval, for the steps after it." />
        <CheckTile value="chat" title="chat" isDisabled description="This run has no conversation to carry them." />
      </CheckTileGroup>
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** None chosen yet: each tile a stop of its own, Space choosing the one in focus, the disabled one faded apart from the others. */
export const NoneChosen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const boxes = [...canvasElement.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    await expect(boxes.map((b) => b.checked)).toEqual([false, false, false]);
    await expect(boxes[2]).toBeDisabled();
    const tiles = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="checkbox"]')];
    await expect(getComputedStyle(tiles[2]).borderTopColor).not.toBe(getComputedStyle(tiles[0]).borderTopColor);
    await userEvent.tab();
    await expect(boxes[0]).toHaveFocus();
    await userEvent.keyboard(' ');
    await expect(boxes[0]).toBeChecked();
    await userEvent.tab();
    await expect(boxes[1]).toHaveFocus();
  },
};

/** Two chosen: both outlined in the primary role and tinted, and pressing a chosen tile anywhere takes it back, the other kept. */
export const TwoChosen: Story = {
  args: { chosen: ['retry', 'gate'] },
  play: async ({ canvasElement, userEvent }) => {
    const tiles = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="checkbox"]')];
    await expect(tiles[0]).toHaveAttribute('data-selected', 'true');
    await expect(tiles[1]).toHaveAttribute('data-selected', 'true');
    await userEvent.click(tiles[0]);
    await expect(tiles[0]).not.toHaveAttribute('data-selected');
    await expect(tiles[1]).toHaveAttribute('data-selected', 'true');
  },
};

/** Side by side, wrapping where the width runs out, as the radio tiles lay out by default. */
export const InARow: Story = { args: { layout: 'row', width: 640 } };
