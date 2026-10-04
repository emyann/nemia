/**
 * The sidebar's factory picker: All factories first, then each factory Home lists, with the repositories it works on and why its file does
 * not read, the one the address picks among them; a pick goes where `pickTo` says.
 */
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Factory as FactoryIcon } from 'lucide-react';
import type { Key } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { factoriesQuery, runsQuery, type Factory } from '@/lib/api';
import { factoryBlocks } from '@/lib/factories';
import { repoName } from '@/lib/factory';
import { pickTo } from './nav';

/** The choice of every factory: a number, where every factory's name is a string. */
const ALL = 0;

/** A factory the picker offers: its name, and what the api says of it, none for a name the api lists no factory by. */
export type PickerFactory = { name: string; factory?: Factory };

/**
 * The factories the picker offers after All factories, from what the api answered: those Home lists (`factoryBlocks`), in its order, and
 * `picked`, the address's, after them when they leave it out — the default factory once one is filed, or a name no factory has.
 */
export function pickerFactories(
  factories: readonly Factory[],
  runs: Parameters<typeof factoryBlocks>[1],
  picked: string | undefined,
): PickerFactory[] {
  const listed: PickerFactory[] = factoryBlocks(factories, runs).map((block) => ({
    name: block.name,
    factory: factories.find((f) => f.name === block.name),
  }));
  if (picked === undefined || listed.some((item) => item.name === picked)) return listed;
  return [...listed, { name: picked, factory: factories.find((f) => f.name === picked) }];
}

/** What a factory's item says under its name: the repositories it works on by their folders' names, or that it is on none. */
const reposOf = (factory: Factory): string => (factory.repos.length ? `on ${factory.repos.map(repoName).join(', ')}` : 'on no repository');

/** What the trigger's tooltip says of the factory picked: its repositories whole, one a line, and why its file does not read. */
const aboutOf = (factory: Factory | undefined): string | undefined =>
  factory && [...factory.repos, ...(factory.error ? [`Its file does not read: ${factory.error}`] : [])].join('\n');

/**
 * One factory in the picker's list: its name, then the repositories it works on, and why its file does not read; a name the api lists no
 * factory by says so.
 */
export function FactoryItemBody({ item }: { item: PickerFactory }) {
  return (
    <span className="flex min-w-0 flex-col" data-factory={item.name}>
      <span className="truncate font-medium">{item.name}</span>
      {item.factory ? (
        <span className="truncate text-xs text-muted-foreground" title={item.factory.repos.join('\n')}>
          {reposOf(item.factory)}
        </span>
      ) : (
        <span className="truncate text-xs text-muted-foreground">no such factory</span>
      )}
      {item.factory?.error && (
        <span data-error className="truncate text-xs text-destructive" title={item.factory.error}>
          Its file does not read: {item.factory.error}
        </span>
      )}
    </span>
  );
}

/**
 * The picker of the factory the page at `path` with `search` shows: `picked`, the address's (`pickedOf`), else All factories. Its trigger
 * holds the factory's repositories whole and why its file does not read in its tooltip. It reads the factories, and the runs without
 * polling them, as Home's list does; nothing but All factories is offered while either has no answer. A pick runs `onPick`, then goes
 * where `pickTo` says, or nowhere.
 */
export function FactoryPicker({
  path,
  search,
  picked,
  onPick,
}: {
  path: string;
  search: Record<string, unknown>;
  picked: string | undefined;
  onPick?: () => void;
}) {
  const navigate = useNavigate();
  const factories = useQuery(factoriesQuery);
  const runs = useQuery({ ...runsQuery, refetchInterval: false });
  const items = factories.data && runs.data ? pickerFactories(factories.data, runs.data, picked) : [];
  const shown = items.find((item) => item.name === picked);
  const choose = (key: Key | null) => {
    const target = pickTo(path, search, key === ALL || key === null ? undefined : String(key));
    onPick?.();
    if (target) void navigate(target);
  };
  return (
    <Select aria-label="Factory" value={picked ?? ALL} onChange={choose} data-factory-picker className="w-full">
      <SelectTrigger className="h-9!">
        <span className="flex min-w-0 flex-1 items-center gap-2" title={aboutOf(shown?.factory)}>
          <FactoryIcon className="size-4 text-muted-foreground" />
          <SelectValue className="min-w-0 truncate">{() => picked ?? 'All factories'}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent className="min-w-56">
        <SelectItem id={ALL} textValue="All factories">
          All factories
        </SelectItem>
        {items.map((item) => (
          <SelectItem
            key={item.name}
            id={item.name}
            textValue={item.name}
            className="[&>span:first-child]:min-w-0 [&>span:first-child]:shrink"
          >
            <FactoryItemBody item={item} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
