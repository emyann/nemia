/**
 * A card's start in a factory, on the Inbox page — the one it names (`factory:`), or, for a card that names none, the one a person picks
 * first: the repository it starts on, the workflow among those the factory offers there, read with its hires, and `StartRun` sending
 * both, as a start of the card in a factory from the command line does.
 */
import { useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { factoriesQuery, factoryWorkflowsQuery, storeQuery, type InboxEntry, type Place, type Started } from '../lib/api';
import { cardPlace, factoriesOffered, presetOf, startPlace, workflowKey, type CardPlace } from '../lib/inbox';
import { StartRun } from './StartRun';
import { FIELD, WorkflowOptions, WorkflowsUnread } from './WorkflowOptions';

const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

/** What a card's start is told: a start the api took, and a refusal to show, null when the start is asked again. */
type Told = { onStarted: (started: Started) => void; onRefused: (message: string | null) => void };

/**
 * The start of a card that names its factory, in its place among the factories (`cardPlace`, `Placed`): why it cannot start, for a
 * factory not listed or one whose file does not read; else its repository and its workflows.
 */
export function FactoryCardStart({ entry, onStarted, onRefused }: { entry: InboxEntry } & Told) {
  const factories = useQuery(factoriesQuery);
  const { data: store } = useQuery(storeQuery);
  const place = factories.data && store ? cardPlace(entry, factories.data, store.fileFactory) : null;

  return (
    <div data-start-card className="space-y-3 border-t border-outline-variant pt-4">
      {factories.error ? (
        <p className="text-xs text-failure">Could not read the factories to start it in: {factories.error.message}</p>
      ) : !place ? (
        <p className="text-xs text-muted-foreground">Reading the factory…</p>
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
  const field = useId();

  return (
    <div data-start-card data-start-unassigned className="space-y-3 border-t border-outline-variant pt-4">
      {factories.error ? (
        <p className="text-xs text-failure">Could not read the factories to start it in: {factories.error.message}</p>
      ) : !factories.data || !store ? (
        <p className="text-xs text-muted-foreground">Reading the factories…</p>
      ) : offered.length === 0 ? (
        <p data-no-factory className="text-xs text-yours">
          A card starts in a factory, and the store has none yet: file one with {code(store.fileFactory)}.
        </p>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor={field} className="block text-sm font-medium">
            Factory
          </label>
          <select id={field} value={picked} onChange={(event) => setPicked(event.target.value)} className={`${FIELD} sm:max-w-xs`}>
            <option value="" disabled>
              Pick the factory it runs in
            </option>
            {offered.map((f) => (
              <option key={f.name} value={f.name}>
                {f.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">The card names no factory, and a run starts in one.</p>
        </div>
      )}
      {place && <Placed key={picked} entry={entry} place={place} onStarted={onStarted} onRefused={onRefused} />}
    </div>
  );
}

/**
 * A card's start in `place`: why it cannot start there (`data-unplaced`); else a picker of the factory's repositories, when the card
 * names none of several, and the workflows the factory offers on the one it starts on (`InFactory`).
 */
function Placed({ entry, place, onStarted, onRefused }: { entry: InboxEntry; place: CardPlace } & Told) {
  const [picked, setPicked] = useState<string | null>(null);
  if ('why' in place) {
    return (
      <p data-unplaced className="text-xs text-yours">
        {place.why}
      </p>
    );
  }
  const repo = place.repo ?? picked;
  return (
    <>
      {place.repo === null && (
        <RepoPicker
          repos={place.repos}
          picked={picked}
          onPick={setPicked}
          note={
            <>
              The card names no repository, and the factory {code(place.factory)} works on {place.repos.length}.
            </>
          }
        />
      )}
      {repo !== null && (
        <InFactory key={repo} entry={entry} place={{ factory: place.factory, repo }} onStarted={onStarted} onRefused={onRefused} />
      )}
    </>
  );
}

/** A factory's repositories to start a run on, when it has several: a person picks one; `note` says, under it, why the pick is theirs. */
export function RepoPicker({
  repos,
  picked,
  onPick,
  note,
}: {
  repos: readonly string[];
  picked: string | null;
  onPick: (repo: string) => void;
  note: ReactNode;
}) {
  const field = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={field} className="block text-sm font-medium">
        Repository
      </label>
      <select id={field} value={picked ?? ''} onChange={(event) => onPick(event.target.value)} className={`${FIELD} sm:max-w-md`}>
        <option value="" disabled>
          Pick where it runs
        </option>
        {repos.map((repo) => (
          <option key={repo} value={repo}>
            {repo}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

/**
 * The workflows `place`'s factory offers on its repository, preset from the card as on any card's start, and `StartRun` in the factory. A
 * workflow whose steps the factory's hires leave with no agent says so in place of the start, in the package's words (`unfilled`).
 */
function InFactory({ entry, place, onStarted, onRefused }: { entry: InboxEntry; place: Place } & Told) {
  const workflows = useQuery(factoryWorkflowsQuery(place));
  const [picked, setPicked] = useState<string | null>(null);
  const preset = workflows.data ? presetOf(entry.workflow, entry.repo, place.repo, workflows.data) : null;
  const key = picked ?? (preset ? workflowKey(preset) : '');
  const workflow = workflows.data?.find((w) => w.error === null && workflowKey(w) === key) ?? null;
  const field = useId();

  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={field} className="block text-sm font-medium">
          Workflow
        </label>
        {workflows.error ? (
          <p className="text-xs text-failure">
            Could not list the workflows of the factory {code(place.factory)}: {workflows.error.message}
          </p>
        ) : !workflows.data ? (
          <p className="text-xs text-muted-foreground">Reading the workflows…</p>
        ) : (
          <select id={field} value={key} onChange={(event) => setPicked(event.target.value)} className={`${FIELD} sm:max-w-xs`}>
            <option value="" disabled>
              Pick what runs it
            </option>
            <WorkflowOptions workflows={workflows.data} />
          </select>
        )}
        {workflows.data && <WorkflowsUnread workflows={workflows.data} />}
        <p className="text-xs text-muted-foreground">
          The workflows the factory {code(place.factory)} offers on {code(place.repo)}, with its hires.
        </p>
      </div>
      {workflow?.unfilled ? (
        <p data-unfilled className="text-xs whitespace-pre-wrap break-words text-yours">
          {workflow.unfilled}
        </p>
      ) : (
        workflow && (
          <StartRun
            workflow={workflow}
            card={{ name: entry.name, body: entry.body ?? '' }}
            repo={place.repo}
            place={place}
            onStarted={onStarted}
            onRefused={onRefused}
          />
        )
      )}
    </>
  );
}
