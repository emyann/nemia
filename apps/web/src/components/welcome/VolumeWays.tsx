import { RadioTile, RadioTileGroup } from '@/components/look';
import { VOLUME_WAYS, type VolumeWay } from '@/lib/volumeStep';

/** Each way's title, as its tile says it. */
const WAY_TITLES: Readonly<Record<VolumeWay, string>> = {
  folder: 'A folder on this machine',
  address: 'A repository by its address',
  new: 'A new repository',
};

/** Each way's one line, saying what happens next. */
export const VOLUME_WAY_LINES: Readonly<Record<VolumeWay, string>> = {
  folder: 'Type its path: the folders under what you type are offered as you go.',
  address: 'GitHub, GitLab or any git host: Nemia clones it.',
  new: 'Give it a name: Nemia makes an empty repository for it.',
};

/**
 * The three ways to give a factory its work, one tile each in the order the step offers them (`VOLUME_WAYS`). Choosing a tile shows its
 * panel and does nothing else: `value` the way chosen, none before a press, and `onChange` told the way the person chose.
 */
export function VolumeWays({ value, onChange }: { value: VolumeWay | undefined; onChange: (way: VolumeWay) => void }) {
  return (
    <RadioTileGroup
      label="Where is it?"
      layout="column"
      value={value ?? null}
      onChange={(chosen) => {
        const way = VOLUME_WAYS.find((w) => w === chosen);
        if (way !== undefined) onChange(way);
      }}
    >
      {VOLUME_WAYS.map((way) => (
        <RadioTile key={way} value={way} data-volume-way={way} title={WAY_TITLES[way]} description={VOLUME_WAY_LINES[way]} />
      ))}
    </RadioTileGroup>
  );
}
