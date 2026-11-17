import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { RadioTile, RadioTileGroup } from './RadioTile';

/** The tiles a story draws: three workflows, the last of which cannot be picked. */
type Tiles = { chosen: string | null; layout: 'row' | 'column'; width: number };

/** The kit's radio-tile block, copied in: one choice among a few, each a tile with its title and its line. */
const meta: Meta<Tiles> = {
  title: 'Look/RadioTile',
  args: { chosen: null, layout: 'column', width: 420 },
  render: ({ chosen, layout, width }) => (
    <div style={{ width }}>
      <RadioTileGroup label="Workflow" defaultValue={chosen} layout={layout}>
        <RadioTile value="build" title="build" description="An intent to main, through a design and a review." />
        <RadioTile value="quick" title="quick" description="A card that needs no design, implemented then reviewed." />
        <RadioTile value="janitor" title="janitor" isDisabled description="The step clean has no agent: hire one into it first." />
      </RadioTileGroup>
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof meta>;

/** None chosen yet: the group is one tab stop, and the arrow keys move the choice from tile to tile, past the one disabled. */
export const NoneChosen: Story = {
  play: async ({ canvasElement, userEvent }) => {
    const radios = [...canvasElement.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    await expect(radios.map((r) => r.checked)).toEqual([false, false, false]);
    await expect(radios[2]).toBeDisabled();
    await userEvent.tab();
    await expect(radios[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(radios[1]).toBeChecked();
    await userEvent.keyboard('{ArrowDown}');
    await expect(radios[0]).toBeChecked();
    await expect(radios[1]).not.toBeChecked();
  },
};

/** One chosen: its tile outlined in the primary role and tinted, and pressing another tile anywhere chooses it instead. */
export const Chosen: Story = {
  args: { chosen: 'build' },
  play: async ({ canvasElement, userEvent }) => {
    const tiles = [...canvasElement.querySelectorAll<HTMLElement>('[data-slot="radio"]')];
    await expect(tiles[0]).toHaveAttribute('data-selected', 'true');
    await userEvent.click(tiles[1]!);
    await expect(tiles[1]).toHaveAttribute('data-selected', 'true');
    await expect(tiles[0]).not.toHaveAttribute('data-selected');
  },
};

/** Side by side, wrapping where the width runs out, as the block lays its tiles by default. */
export const InARow: Story = { args: { layout: 'row', width: 640 } };
