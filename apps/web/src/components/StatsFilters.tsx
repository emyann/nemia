import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type Key } from 'react';
import { LinkButton } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { statsKeysQuery } from '../lib/api';
import { apiQueryOf, FILTERS, PERIODS, repoWord, withFilter, withPeriod, type FilterKey, type StatsSearch } from '../lib/stats';
import { routeLink } from './routeLink';

/** A button to a route, as the router draws its links (`routeLink`). */
const RouterLinkButton = routeLink(LinkButton);

/** A key the page draws a picker for: every filter but the factory, which the sidebar's picker keeps. */
type PickedKey = Exclude<FilterKey, 'factory'>;

/** The keys the page draws a picker for, in the order of `FILTERS`. */
const PICKED = FILTERS.filter((key): key is PickedKey => key !== 'factory');

/** Each picker's name on the page. */
const FILTER_LABELS: Record<PickedKey, string> = {
  agent: 'Agent',
  step: 'Step',
  workflow: 'Workflow',
  repo: 'Repository',
};

/** The choice that keeps every value of a key: a number, where every value is a string. */
const ANY = 0;

/**
 * What the charts are over: the period, as a link each to the page with that period (`data-period`, `data-active` on the one shown), and a
 * picker per key the page can keep one value of (`StatsPicker`) but the factory, which the sidebar picks. `now` is the moment the page's
 * own read was asked as of.
 */
export function StatsFilters({ search, now }: { search: StatsSearch; now: Date }) {
  const shown = search.period ?? '28d';
  return (
    <section aria-label="What the charts are over" className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="space-y-1.5">
        <div className="text-xs font-medium">Period</div>
        <div className="flex gap-1">
          {PERIODS.map(({ id, label }) => (
            <RouterLinkButton
              key={id}
              to="/stats"
              search={withPeriod(search, id)}
              variant={id === shown ? 'secondary' : 'ghost'}
              size="sm"
              data-period={id}
              data-active={id === shown || undefined}
            >
              {label}
            </RouterLinkButton>
          ))}
        </div>
      </div>
      {PICKED.map((key) => (
        <StatsPicker key={key} filter={key} search={search} now={now} />
      ))}
    </section>
  );
}

/**
 * A picker of one value to keep for `filter` (`data-filter`, `data-kept` once one is kept). Its values are read once it is first opened:
 * the api's groups by that key over the same period and the other filters, the value kept shown before they come. Choosing one, or Any,
 * goes to the page with that search.
 */
function StatsPicker({ filter, search, now }: { filter: PickedKey; search: StatsSearch; now: Date }) {
  const [opened, setOpened] = useState(false);
  const navigate = useNavigate();
  const kept = search[filter];
  const { data, isPending } = useQuery({
    ...statsKeysQuery(apiQueryOf(withFilter(search, filter, null), now, filter)),
    enabled: opened,
  });
  const values = [...new Set([...(kept === undefined ? [] : [kept]), ...(data ?? [])])];
  const choose = (key: Key | null) =>
    void navigate({ to: '/stats', search: withFilter(search, filter, key === ANY || key === null ? null : String(key)) });
  return (
    <Select
      aria-label={FILTER_LABELS[filter]}
      value={kept ?? ANY}
      onChange={choose}
      onOpenChange={(open) => open && setOpened(true)}
      data-filter={filter}
      data-kept={kept === undefined ? undefined : ''}
      className="w-32 space-y-1.5"
    >
      <Label className="text-xs">{FILTER_LABELS[filter]}</Label>
      <SelectTrigger className="text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem id={ANY} textValue="any">
          <span className="text-muted-foreground">any</span>
        </SelectItem>
        {values.map((value) => (
          <SelectItem key={value} id={value} textValue={value} className="font-mono text-xs">
            <span title={value}>{filter === 'repo' ? repoWord(value) : value}</span>
          </SelectItem>
        ))}
        {opened && isPending && (
          <SelectItem id="reading" isDisabled textValue="reading">
            <span className="text-muted-foreground">reading…</span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
