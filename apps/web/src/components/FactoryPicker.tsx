/**
 * The top bar's factory switcher: All factories first, then each factory the Overview lists, with its runs in flight, the one the address
 * picks among them; a pick goes where `pickTo` says.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Key } from 'react';
import { Select, SelectItem } from '@/components/ui/ds/components/Select';
import { factoriesQuery, openRunsQuery, type Factory, type OpenRuns } from '@/lib/api';
import { DEFAULT_NAME, factoriesShown } from '@/lib/factories';
import { pickTo } from './nav';

/** The choice of every factory: a number, where every factory's name is a string. */
const ALL = 0;

/** A factory the picker offers: its name, and what the api says of it, none for a name the api lists no factory by. */
export type PickerFactory = { name: string; factory?: Factory };

/**
 * The factories the picker offers after All factories, from what the api answered: those Home lists (`factoriesShown`), in its order, the
 * default one among them only while it holds a run (`held`), and `picked`, the address's, after them when they leave it out — the default
 * factory once one is filed, or a name no factory has.
 */
export function pickerFactories(factories: readonly Factory[], held: boolean, picked: string | undefined): PickerFactory[] {
  const listed: PickerFactory[] = factoriesShown(factories, held).map((factory) => ({ name: factory.name, factory }));
  if (picked === undefined || listed.some((item) => item.name === picked)) return listed;
  return [...listed, { name: picked, factory: factories.find((f) => f.name === picked) }];
}

/** Whether the default factory holds a run, by the counts of its light answer. */
const holdsRuns = ({ counts }: { counts: { waiting: number; inFlight: number; finished: number } }): boolean =>
  counts.waiting + counts.inFlight + counts.finished > 0;

/**
 * The factories the picker offers after All factories, from what is read so far: none while `factories` is unread, and none while no
 * factory is named and `held`, the default factory's light answer, is unread — whether the default is shown is not known before it;
 * else `pickerFactories`, the default among them only while its answer counts a run.
 */
export function pickerOffer(
  factories: readonly Factory[] | undefined,
  held: Parameters<typeof holdsRuns>[0] | undefined,
  picked: string | undefined,
): PickerFactory[] {
  if (factories === undefined) return [];
  const unnamed = factories.every((f) => f.default);
  if (unnamed && held === undefined) return [];
  return pickerFactories(factories, held !== undefined && holdsRuns(held), picked);
}

/** How many runs are in flight, in words: `none in flight`, `1 in flight`, with `runs` named for every factory's (`5 runs in flight`). */
export function inFlightWords(count: number, runs: boolean): string {
  if (count === 0) return 'none in flight';
  return runs ? `${count} ${count === 1 ? 'run' : 'runs'} in flight` : `${count} in flight`;
}

/** How many runs of the light answer `open` are in flight in the factory `name`, a run of the default factory naming none. */
const inFlightIn = (open: OpenRuns, name: string): number => open.inFlight.filter((row) => (row.factory ?? DEFAULT_NAME) === name).length;

/** What the trigger's title says of the factory picked: its repositories whole, one a line, and why its file does not read. */
const aboutOf = (factory: Factory | undefined): string | undefined =>
  factory && [...factory.repos, ...(factory.error ? [`Its file does not read: ${factory.error}`] : [])].join('\n');

/**
 * What a factory's item says under its name: its runs in flight, that the api lists no factory by that name, or that its file does not
 * read.
 */
export function supportOf(item: PickerFactory, open: OpenRuns | undefined): string | undefined {
  if (!item.factory) return 'no such factory';
  if (item.factory.error) return 'its file does not read';
  return open && inFlightWords(inFlightIn(open, item.name), false);
}

/**
 * The top bar's factory switcher, the kit's `Select` labelled Factory, of the page at `path` with `search`: `picked`, the address's
 * (`pickedOf`), else All factories, then each factory with its runs in flight (`GET /api/runs-open`) under its name. Its title holds the
 * factory's repositories whole and why its file does not read. It reads the factories, and whether the default factory holds a run;
 * nothing but All factories is offered while an answer it needs is missing. A pick goes where `pickTo` says, or nowhere.
 */
export function FactoryPicker({ path, search, picked }: { path: string; search: Record<string, unknown>; picked: string | undefined }) {
  const navigate = useNavigate();
  const factories = useQuery(factoriesQuery);
  const open = useQuery(openRunsQuery());
  const unnamed = factories.data !== undefined && factories.data.every((f) => f.default);
  const held = useQuery({ ...openRunsQuery(DEFAULT_NAME), refetchInterval: false, enabled: unnamed });
  const items = pickerOffer(factories.data, held.data, picked);
  const shown = items.find((item) => item.name === picked);
  const choose = (key: Key | null) => {
    const target = pickTo(path, search, key === ALL || key === null ? undefined : String(key));
    if (target) void navigate(target);
  };
  return (
    <div data-factory-picker title={aboutOf(shown?.factory)} className="w-60 shrink-0 max-md:w-full">
      <Select aria-label="Factory" label="Factory" value={picked ?? ALL} onChange={choose} className="w-full">
        <SelectItem
          id={ALL}
          label="All factories"
          supportingText={open.data && inFlightWords(open.data.counts.inFlight, true)}
          data-factory-all
        />
        {items.map((item) => (
          <SelectItem
            key={item.name}
            id={item.name}
            label={item.name}
            supportingText={supportOf(item, open.data)}
            data-factory={item.name}
          />
        ))}
      </Select>
    </div>
  );
}
