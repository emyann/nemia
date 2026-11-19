import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { FactoryWay } from '@/lib/factoryStep';
import { FactoryWays, WAY_LINES } from './FactoryWays';

/** What a story of the tiles draws: the way chosen at first, none for none, and what is told of each choice. */
type Args = { chosen: FactoryWay | null; onChange: (way: FactoryWay) => void };

/** The three ways to make a first factory, one tile each, Talk to Nemia first and marked Recommended. */
const meta: Meta<Args> = {
  title: 'Pages/Factory ways',
  args: { chosen: null, onChange: fn() },
  render: function Render({ chosen, onChange }) {
    const [way, setWay] = useState<FactoryWay | undefined>(chosen ?? undefined);
    return (
      <div style={{ width: 560 }}>
        <FactoryWays
          value={way}
          onChange={(next) => {
            setWay(next);
            onChange(next);
          }}
        />
      </div>
    );
  },
};
export default meta;

type Story = StoryObj<typeof meta>;

/** None chosen: three tiles in order, Talk to Nemia first and Recommended, each with its line; the arrow keys move the choice. */
export const NoneChosen: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const radios = within(canvasElement).getAllByRole('radio');
    await expect(radios.map((r) => r.getAttribute('value'))).toEqual(['nemia', 'template', 'scratch']);
    await expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([false, false, false]);
    const tiles = [...canvasElement.querySelectorAll<HTMLElement>('[data-factory-way]')];
    await expect(tiles.map((t) => t.dataset.factoryWay)).toEqual(['nemia', 'template', 'scratch']);
    await expect(within(tiles[0]).getByText('Recommended')).toBeVisible();
    await expect(within(tiles[1]).queryByText('Recommended')).toBeNull();
    for (const tile of tiles) await expect(within(tile).getByText(WAY_LINES[tile.dataset.factoryWay as FactoryWay])).toBeVisible();
    await userEvent.tab();
    await expect(radios[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(radios[1]).toBeChecked();
    await expect(args.onChange).toHaveBeenLastCalledWith('template');
  },
};

/** Talk to Nemia chosen. */
export const NemiaChosen: Story = {
  args: { chosen: 'nemia' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-factory-way="nemia"]')).toHaveAttribute('data-selected', 'true');
  },
};

/** From a template chosen. */
export const TemplateChosen: Story = {
  args: { chosen: 'template' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-factory-way="template"]')).toHaveAttribute('data-selected', 'true');
  },
};

/** From scratch chosen, by a press on its tile. */
export const ScratchChosen: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    await userEvent.click(canvasElement.querySelector<HTMLElement>('[data-factory-way="scratch"]')!);
    await expect(canvasElement.querySelector('[data-factory-way="scratch"]')).toHaveAttribute('data-selected', 'true');
    await expect(args.onChange).toHaveBeenCalledWith('scratch');
  },
};
