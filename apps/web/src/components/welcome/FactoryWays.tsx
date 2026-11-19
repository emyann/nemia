import { RadioTile, RadioTileGroup } from '@/components/look';
import { Tag } from '@/components/ui/ds';
import { FACTORY_WAYS, type FactoryWay } from '@/lib/factoryStep';

/** Each way's title, as its tile says it. */
const WAY_TITLES: Readonly<Record<FactoryWay, string>> = {
  nemia: 'Talk to Nemia',
  template: 'From a template',
  scratch: 'From scratch',
};

/** Each way's one line, saying what happens next. */
export const WAY_LINES: Readonly<Record<FactoryWay, string>> = {
  nemia: 'Her chat opens beside this page: tell her what you build, and she makes the factory with you.',
  template: 'Pick a team built into Nemia, give it a name, and it is made with every setting at its default.',
  scratch: 'Give it a name: an empty factory is made, and a short guide says what to put in it.',
};

/**
 * The three ways to make a first factory, one tile each in the order the step offers them (`FACTORY_WAYS`), Talk to Nemia marked
 * Recommended. Choosing a tile shows its panel and does nothing else, since the arrow keys move a radio's choice: `value` the way chosen,
 * none before a press, and `onChange` told the way the person chose.
 */
export function FactoryWays({ value, onChange }: { value: FactoryWay | undefined; onChange: (way: FactoryWay) => void }) {
  return (
    <RadioTileGroup
      label="How do you want to make it?"
      layout="column"
      value={value ?? null}
      onChange={(chosen) => {
        const way = FACTORY_WAYS.find((w) => w === chosen);
        if (way !== undefined) onChange(way);
      }}
    >
      {FACTORY_WAYS.map((way) => (
        <RadioTile
          key={way}
          value={way}
          data-factory-way={way}
          title={
            way === 'nemia' ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                {WAY_TITLES[way]}
                <Tag color="primary">Recommended</Tag>
              </span>
            ) : (
              WAY_TITLES[way]
            )
          }
          description={WAY_LINES[way]}
        />
      ))}
    </RadioTileGroup>
  );
}
