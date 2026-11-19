import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, within } from 'storybook/test';
import type { VolumeWay } from '@/lib/volumeStep';
import { VOLUME_WAY_LINES, VolumeWays } from './VolumeWays';

/** What a story of the tiles draws: the way chosen at first, none for none, and what is told of each choice. */
type Args = { chosen: VolumeWay | null; onChange: (way: VolumeWay) => void };

/** The three ways to give a factory its work, one tile each: a folder, a repository by its address, a new one. */
const meta: Meta<Args> = {
  title: 'Pages/Volume ways',
  args: { chosen: null, onChange: fn() },
  render: function Render({ chosen, onChange }) {
    const [way, setWay] = useState<VolumeWay | undefined>(chosen ?? undefined);
    return (
      <div style={{ width: 560 }}>
        <VolumeWays
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

/** None chosen: three tiles in order, each with its line; the arrow keys move the choice. */
export const NoneChosen: Story = {
  play: async ({ args, canvasElement, userEvent }) => {
    const radios = within(canvasElement).getAllByRole('radio');
    await expect(radios.map((r) => r.getAttribute('value'))).toEqual(['folder', 'address', 'new']);
    const tiles = [...canvasElement.querySelectorAll<HTMLElement>('[data-volume-way]')];
    for (const tile of tiles) await expect(within(tile).getByText(VOLUME_WAY_LINES[tile.dataset.volumeWay as VolumeWay])).toBeVisible();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowDown}');
    await expect(args.onChange).toHaveBeenLastCalledWith('address');
  },
};

/** A folder on this machine chosen. */
export const FolderChosen: Story = {
  args: { chosen: 'folder' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('[data-volume-way="folder"]')).toHaveAttribute('data-selected', 'true');
  },
};
