/**
 * The factory pane's switcher: each factory the Overview lists, with its runs in flight, the one the page sits in among them, then New
 * factory, to come; a pick goes where `pickTo` says.
 */
import { useQuery } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import type { Key } from 'react';
import { Select, SelectItem } from '@/components/ui/ds/components/Select';
import { factoriesQuery, type Factory } from '@/lib/api/factories';
import { openRunsQuery, type OpenRuns } from '@/lib/api/runs';
import { DEFAULT_NAMESPACE } from 'objects';
import { factoriesShown, holdsRuns, namespaceOf } from '@/lib/factories';
import { daemonQuery } from '@/lib/api/daemon';
import { pauseQuery } from '@/lib/api/pause';
import { repoName } from '@/lib/factory';
import { pickTo } from '../nav/nav';

/** A factory the picker offers: its name, and what the api says of it, none for a name the api lists no factory by. */
type PickerFactory = { name: string; factory?: Factory };

/**
 * The factories the picker offers, from what the api answered: those Home lists (`factoriesShown`), in its order, the
 * default one among them only while it holds a run (`held`), and `picked`, the address's, after them when they leave it out — the default
 * factory once one is filed, or a name no factory has.
 *
 * @param factories the factories the api listed
 * @param held whether the default factory holds a run
 * @param picked the factory the page sits in, none at the store's level
 */
export function pickerFactories(factories: readonly Factory[], held: boolean, picked: string | undefined): PickerFactory[] {
  const listed: PickerFactory[] = factoriesShown(factories, held).map((factory) => ({ name: factory.name, factory }));
  if (picked === undefined || listed.some((item) => item.name === picked)) return listed;
  return [...listed, { name: picked, factory: factories.find((f) => f.name === picked) }];
}

/**
 * The factories the picker offers, from what is read so far: none while `factories` is unread, and none while no
 * factory is named and `held`, the default factory's light answer, is unread — whether the default is shown is not known before it;
 * else `pickerFactories`, the default among them only while its answer counts a run.
 *
 * @param factories the factories the api listed, undefined while they are unread
 * @param held the default factory's light answer, undefined while it is unread
 * @param picked the factory the page sits in, none at the store's level
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

/**
 * How many runs are in flight, in words: `none in flight`, `1 in flight`, with `runs` named for every factory's (`5 runs in flight`).
 *
 * @param count how many runs are in flight
 * @param runs whether to name the word runs, as for every factory's count
 */
export function inFlightWords(count: number, runs: boolean): string {
  if (count === 0) return 'none in flight';
  return runs ? `${count} ${count === 1 ? 'run' : 'runs'} in flight` : `${count} in flight`;
}

/** How many runs of the light answer `open` are in flight in the factory `name`, a run of the default factory naming none. */
const inFlightIn = (open: OpenRuns, name: string): number => open.inFlight.filter((row) => namespaceOf(row.factory) === name).length;

/** What the trigger's title says of the factory picked: its repositories whole, one a line, and why its file does not read. */
const aboutOf = (factory: Factory | undefined): string | undefined =>
  factory && [...factory.worksOn, ...(factory.error ? [`Its file does not read: ${factory.error}`] : [])].join('\n');

/**
 * What a factory's item says under its name: its runs in flight, that the api lists no factory by that name, or that its file does not
 * read.
 *
 * @param item the factory item the picker offers
 * @param open the runs in flight, undefined while they are unread
 */
export function supportOf(item: PickerFactory, open: OpenRuns | undefined): string | undefined {
  if (!item.factory) return 'no such factory';
  if (item.factory.error) return 'its file does not read';
  return open && inFlightWords(inFlightIn(open, item.name), false);
}

/** The key of the item that files a new factory, which is to come. */
const NEW_FACTORY = 'new-factory';

/**
 * What the switcher says of a factory under its name, on one line: its repository (the first, and how many more), its template and the
 * version wanted, and whether the store ticks or is paused, each where it is known.
 *
 * @param factory the factory the switcher shows
 * @param tick whether the store's daemon ticks or its factories are paused, none while unread
 */
export function switcherLine(factory: Factory | undefined, tick: 'ticking' | 'paused' | 'not ticking' | undefined): string {
  const repos = factory?.worksOn ?? [];
  const repo = repos[0] === undefined ? 'no volume to work on' : `${repoName(repos[0])}${repos.length > 1 ? ` +${repos.length - 1}` : ''}`;
  const template = factory?.template ? `${repoName(factory.template.source)}@${factory.template.version}` : undefined;
  return [repo, template, tick].filter((part) => part !== undefined).join(' · ');
}

/**
 * The factory pane's switcher, the kit's `Select` labelled Factory, of the page at `path` with `search`: `picked`, the factory the page
 * sits in (`seatOf`), its initial beside it and under it its repository, its template and whether the store ticks (`switcherLine`); then
 * each factory with its runs in flight (`GET /api/runs?fieldSelector=status.state!=finished`) under its name, and New factory, to come,
 * which takes no press. Its title holds the factory's repositories whole and why its file does not read. It reads the factories, and
 * whether the default factory holds a run; no factory is offered while an answer it needs is missing. A pick goes where `pickTo` says.
 */
export function FactoryPicker({ path, search, picked }: { path: string; search: Record<string, unknown>; picked: string | undefined }) {
  const router = useRouter();
  const factories = useQuery(factoriesQuery);
  const open = useQuery(openRunsQuery());
  const daemon = useQuery(daemonQuery);
  const pause = useQuery(pauseQuery);
  const unnamed = factories.data !== undefined && factories.data.every((f) => f.default);
  const held = useQuery({ ...openRunsQuery(DEFAULT_NAMESPACE), refetchInterval: false, enabled: unnamed });
  const items = pickerOffer(factories.data, held.data, picked);
  const shown = items.find((item) => item.name === picked);
  const tick = pause.data?.pause ? 'paused' : daemon.data === undefined ? undefined : daemon.data.ticking ? 'ticking' : 'not ticking';
  const choose = (key: Key | null) => {
    if (key === null || key === NEW_FACTORY || key === picked) return;
    void router.navigate({ href: pickTo(path, search, String(key)) });
  };
  return (
    <div data-factory-picker title={aboutOf(shown?.factory)} className="flex w-full min-w-0 items-start gap-3">
      {picked !== undefined && (
        <span
          aria-hidden
          data-factory-initial
          className="mt-2 flex size-10 shrink-0 items-center justify-center rounded-shape-medium bg-surface-container-highest text-title-medium text-on-surface"
        >
          {picked.slice(0, 1).toUpperCase()}
        </span>
      )}
      <Select
        aria-label="Factory"
        label="Factory"
        value={picked ?? null}
        onChange={choose}
        disabledKeys={[NEW_FACTORY]}
        supportingText={
          picked !== undefined && (
            <span data-factory-line className="font-mono text-body-small break-all">
              {switcherLine(shown?.factory, tick)}
            </span>
          )
        }
        className="min-w-0 flex-1"
      >
        {[
          ...items.map((item) => (
            <SelectItem
              key={item.name}
              id={item.name}
              label={item.name}
              supportingText={supportOf(item, open.data)}
              data-factory={item.name}
            />
          )),
          <SelectItem key={NEW_FACTORY} id={NEW_FACTORY} label="New factory · to come" data-new-factory-to-come />,
        ]}
      </Select>
    </div>
  );
}
