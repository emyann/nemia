/**
 * A card's start in a factory, on the Inbox page — the one it names (`factory:`), or, for a card that names none, the one a person picks
 * first: the workflow among those the factory offers, by name; the repository the factory wires for it, shown, never picked; the
 * workflow read there with its hires; and `StartRun` sending the start, as a start of the card in a factory from the command line does.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Select, SelectItem, Skeleton } from '@/components/ui/ds';
import { factoriesQuery, type Factory } from '../../lib/api/factories.ts';
import { factoryWorkflowsQuery, type Place, type Started } from '../../lib/api/workflows.ts';
import { storeQuery } from '../../lib/api/store.ts';
import { type InboxEntry } from '../../lib/api/inbox.ts';
import { startRepo } from '../../lib/factories';
import { cardPlace, factoriesOffered, startPlace, type CardPlace } from '../../lib/inbox';
import { StartRun } from '../run/StartRun';
import { WorkflowsUnread } from '../workflow/WorkflowOptions';
import { Reading, ReadingLines } from '@/components/look';

const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;

/** What a card's start is told: a start the api took, and a refusal to show, null when the start is asked again. */
type Told = { onStarted: (started: Started) => void; onRefused: (message: string | null) => void };

/**
 * The start of a card that names its factory, in its place among the factories (`cardPlace`, `Placed`): why it cannot start, for a
 * factory not listed or one whose file does not read; else its workflows and the repository it wires for the one picked.
 */
export function FactoryCardStart({ entry, onStarted, onRefused }: { entry: InboxEntry } & Told) {
  const factories = useQuery(factoriesQuery);
  const { data: store } = useQuery(storeQuery);
  const place = factories.data && store ? cardPlace(entry, factories.data, store.fileFactory) : null;

  return (
    <div data-start-card className="space-y-3 border-t border-outline-variant pt-4">
      {factories.error ? (
        <p className="text-body-small text-failure">Could not read the factories to start it in: {factories.error.message}</p>
      ) : !place ? (
        <Reading label="Reading the factory…" className="flex flex-col gap-1.5">
          <Skeleton className="w-20 text-label-medium" />
          <Skeleton shape="rectangle" className="h-9 max-w-xs rounded-none" />
        </Reading>
      ) : (
        <Placed entry={entry} place={place} onStarted={onStarted} onRefused={onRefused} />
      )}
    </div>
  );
}

/**
 * The start of a card that names no factory: a Factory list, nothing picked, among the factories that can take it (`factoriesOffered`);
 * then, in the one picked, the card's start as a card naming it has (`startPlace`, `Placed`). No start form is drawn before a factory is
 * picked: a start names its factory. A store with no factory to offer says so, with the line that files one.
 */
export function UnassignedStart({ entry, onStarted, onRefused }: { entry: InboxEntry } & Told) {
  const factories = useQuery(factoriesQuery);
  const { data: store } = useQuery(storeQuery);
  const [picked, setPicked] = useState('');
  const offered = factoriesOffered(factories.data ?? []);
  const place = factories.data && store ? startPlace(entry, picked, factories.data, store.fileFactory) : null;

  return (
    <div data-start-card data-start-unassigned className="space-y-3 border-t border-outline-variant pt-4">
      {factories.error ? (
        <p className="text-body-small text-failure">Could not read the factories to start it in: {factories.error.message}</p>
      ) : !factories.data || !store ? (
        <Reading label="Reading the factories…" className="flex flex-col gap-1.5">
          <Skeleton className="w-20 text-label-medium" />
          <Skeleton shape="rectangle" className="h-9 max-w-xs rounded-none" />
        </Reading>
      ) : offered.length === 0 ? (
        <p data-no-factory className="text-body-small text-yours">
          A card starts in a factory, and the store has none yet: file one with {code(store.fileFactory)}.
        </p>
      ) : (
        <Select
          label="Factory"
          placeholder="Pick the factory it runs in"
          value={picked || null}
          onChange={(key) => setPicked(key === null ? '' : String(key))}
          supportingText="The card names no factory, and a run starts in one."
          data-pick-factory
          className="@md/page:max-w-xs"
        >
          {offered.map((f) => (
            <SelectItem key={f.name} id={f.name} label={f.name} />
          ))}
        </Select>
      )}
      {place && <Placed key={picked} entry={entry} place={place} onStarted={onStarted} onRefused={onRefused} />}
    </div>
  );
}

/**
 * A card's start in `place`: why it cannot start there (`data-unplaced`); else the Workflow list, the factory's offered workflows by
 * name, preset to the card's where the factory offers it; then, for the one picked, the repository the factory wires for it
 * (`startRepo`), said and never picked, or why it gives none, naming the attach (`data-unwired`); and the workflow read there (`OnRepo`).
 */
function Placed({ entry, place, onStarted, onRefused }: { entry: InboxEntry; place: CardPlace } & Told) {
  const [picked, setPicked] = useState<string | null>(null);
  if ('why' in place) {
    return (
      <p data-unplaced className="text-body-small text-yours">
        {place.why}
      </p>
    );
  }
  const { factory } = place;
  const offered = factory.workflows ?? [];
  const workflow = picked ?? place.workflow;
  const on = workflow === null ? null : startRepo(factory, workflow);
  return (
    <>
      {offered.length === 0 ? (
        <div className="space-y-1.5">
          <p className="text-body-medium font-medium">Workflow</p>
          <p data-no-workflow className="text-body-small text-yours">
            The factory {code(factory.name)} offers no workflow yet: attach one with {code(factory.commands.attach)}.
          </p>
          <p className="text-body-small text-muted-foreground">The workflows the factory {code(factory.name)} offers.</p>
        </div>
      ) : (
        <Select
          label="Workflow"
          placeholder="Pick what runs it"
          value={workflow}
          onChange={(key) => setPicked(key === null ? null : String(key))}
          supportingText={<>The workflows the factory {code(factory.name)} offers.</>}
          data-pick-workflow
          className="@md/page:max-w-xs"
        >
          {offered.map((name) => (
            <SelectItem key={name} id={name} label={name} />
          ))}
        </Select>
      )}
      {on !== null && workflow !== null && <Wired factory={factory} workflow={workflow} on={on} />}
      {on !== null && workflow !== null && 'repo' in on && (
        <OnRepo
          key={`${workflow}:${on.repo}`}
          entry={entry}
          workflow={workflow}
          place={{ factory: factory.name, repo: on.repo }}
          onStarted={onStarted}
          onRefused={onRefused}
        />
      )}
    </>
  );
}

/**
 * The repository `factory` wires for `workflow`, as text a person reads and never a pick: the factory alone places a card's run. Or why
 * it gives none, with the attach that fixes it (`startRepo`).
 */
function Wired({ factory, workflow, on }: { factory: Pick<Factory, 'name'>; workflow: string; on: ReturnType<typeof startRepo> }) {
  if ('why' in on) {
    return (
      <p data-unwired={on.refused} className="text-body-small break-words text-yours">
        {on.why}
      </p>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-body-medium font-medium">Repository</p>
      <p data-factory-repo className="font-mono text-body-small break-all text-muted-foreground">
        {on.repo}
      </p>
      <p className="text-body-small text-muted-foreground">
        Where the factory {code(factory.name)} runs {code(workflow)}: its wiring decides, never the card.
      </p>
    </div>
  );
}

/**
 * The workflow `workflow` as the factory offers it on `place`'s repository, read with its hires, and `StartRun` in the factory. One
 * that does not read, or whose steps the factory's hires leave with no agent, says so in place of the start, in the package's words.
 */
function OnRepo({ entry, workflow, place, onStarted, onRefused }: { entry: InboxEntry; workflow: string; place: Place } & Told) {
  const workflows = useQuery(factoryWorkflowsQuery(place));
  const listed = workflows.data?.filter((w) => w.name === workflow) ?? [];
  const read = listed.find((w) => w.error === null) ?? null;
  const unread = read === null && listed.some((w) => w.error !== null);

  if (workflows.error) {
    return (
      <p className="text-body-small text-failure">
        Could not read the workflow {code(workflow)} of the factory {code(place.factory)}: {workflows.error.message}
      </p>
    );
  }
  if (!workflows.data)
    return (
      <Reading label="Reading the workflow…" className="flex flex-col gap-2">
        <ReadingLines widths={['w-2/3']} className="text-body-small" />
        <Skeleton shape="rectangle" className="h-10 w-28 rounded-none" />
      </Reading>
    );
  if (unread) return <WorkflowsUnread workflows={listed} />;
  return read?.unfilled ? (
    <p data-unfilled className="text-body-small whitespace-pre-wrap break-words text-yours">
      {read.unfilled}
    </p>
  ) : read === null ? (
    <p data-not-offered className="text-body-small text-yours">
      The factory {code(place.factory)} lists no workflow {code(workflow)} on {code(place.repo)}.
    </p>
  ) : (
    <StartRun
      workflow={read}
      card={{ name: entry.name, factory: entry.factory, body: entry.body ?? '' }}
      repo={place.repo}
      place={place}
      onStarted={onStarted}
      onRefused={onRefused}
    />
  );
}
