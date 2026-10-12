/**
 * A card's start in the factory it names (`factory:`), on the Inbox page: the repository it starts on, the workflow among those the
 * factory offers there, read with its hires, and `StartRun` sending both, as a start of the card in its factory from the command line does.
 */
import { useId, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { factoriesQuery, factoryWorkflowsQuery, storeQuery, type InboxEntry, type Place, type Started } from '../lib/api';
import { cardPlace, presetOf, workflowKey } from '../lib/inbox';
import { StartRun } from './StartRun';
import { FIELD, WorkflowOptions } from './WorkflowOptions';

const code = (text: string) => <code className="font-mono text-xs">{text}</code>;

/** What a card's start is told: a start the api took, and a refusal to show, null when the start is asked again. */
type Told = { onStarted: (started: Started) => void; onRefused: (message: string | null) => void };

/**
 * The card's place among the factories (`cardPlace`): why it cannot start, for a factory not listed or one whose file does not read; a
 * picker of the factory's repositories, when the card names none of several; then the workflows the factory offers on the one it starts on.
 */
export function FactoryCardStart({ entry, onStarted, onRefused }: { entry: InboxEntry } & Told) {
  const factories = useQuery(factoriesQuery);
  const { data: store } = useQuery(storeQuery);
  const [picked, setPicked] = useState<string | null>(null);
  const place = factories.data && store ? cardPlace(entry, factories.data, store.fileFactory) : null;
  const repo = place && 'repos' in place ? (place.repo ?? picked) : null;

  return (
    <div data-start-card className="space-y-3 border-t border-outline-variant pt-4">
      {factories.error ? (
        <p className="text-xs text-failure">Could not read the factories to start it in: {factories.error.message}</p>
      ) : !place ? (
        <p className="text-xs text-muted-foreground">Reading the factory…</p>
      ) : 'why' in place ? (
        <p data-unplaced className="text-xs text-yours">
          {place.why}
        </p>
      ) : (
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
      )}
    </div>
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
