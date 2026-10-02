/**
 * A run's start from a factory's floor: the root header's button that opens it in the frame's floating bar (`FloatingBar`), and what the
 * bar then shows — the repository the run starts on, the factory's one or picked among its several, the workflows the factory offers
 * there, each that cannot start saying why, and `StartRun` in the factory for the one picked, as `wf start --factory` starts it.
 */
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { factoriesQuery, factoryWorkflowsQuery, type Place, type WorkflowListing } from '@/lib/api';
import { floorPlace, whyNotStarted } from '@/lib/factories';
import { workflowKey } from '@/lib/inbox';
import { useBar } from '@/lib/useBar';
import { RepoPicker } from './FactoryCardStart';
import { FloatingBar } from './FloatingBar';
import { StartRun } from './StartRun';

const code = (text: string) => <code className="font-mono text-xs">{text}</code>;
const path = (text: string) => <code className="font-mono text-xs break-all">{text}</code>;

/**
 * The header's 'Start a run' in the factory `name`, which opens the bar on its start, pressed while it is open on its start or not. Nothing
 * is drawn before the factories are read, for a name the api lists no factory by, or for the default factory, whose floor starts no run
 * (`floorPlace`).
 */
export function FactoryStart({ name }: { name: string }) {
  const factories = useQuery(factoriesQuery);
  const { open, show } = useBar();
  const factory = factories.data?.find((f) => f.name === name);
  const place = factory ? floorPlace(factory) : null;
  if (!place) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      aria-label="Start a run"
      aria-expanded={open?.kind === 'start' && open.factory === name}
      onPress={() => show({ kind: 'start', factory: name })}
      className="ml-auto shrink-0"
    >
      <Play data-icon="inline-start" />
      <span className="hidden sm:inline">Start a run</span>
    </Button>
  );
}

/**
 * The bar on the start of a run in the factory `factory`, which the address can name whatever factories there are: once they are read, a
 * factory the api lists by no such name, or the default one, starts no run from here and says so.
 */
export function StartBar({ factory: name }: { factory: string }) {
  const factories = useQuery(factoriesQuery);
  const factory = factories.data?.find((f) => f.name === name);
  const place = factory ? floorPlace(factory) : null;
  return (
    <FloatingBar
      title={<>Start a run in {name}</>}
      description="A run of one of the workflows the factory offers, with its hires, on one of its repositories; it shows on its floor."
    >
      {factories.error ? (
        <p className="text-sm text-red-700 dark:text-red-400">Could not read the factories: {factories.error.message}</p>
      ) : !factories.data ? (
        <p className="text-xs text-neutral-500">Reading the factories…</p>
      ) : place === null ? (
        <p data-unplaced className="text-sm text-amber-700 dark:text-amber-400">
          {factory ? 'The default factory starts no run from here: start one from the Workflows page.' : `No factory is named ${name}.`}
        </p>
      ) : 'why' in place ? (
        <p data-unplaced className="text-sm text-amber-700 dark:text-amber-400">
          {place.why}
        </p>
      ) : (
        <OnRepo place={place} />
      )}
    </FloatingBar>
  );
}

/** The repository a run starts on in `place`'s factory, fixed when it has one, else a person's pick; then its workflows there. */
function OnRepo({ place }: { place: { factory: string; repos: string[]; repo: string | null } }) {
  const [picked, setPicked] = useState<string | null>(null);
  const repo = place.repo ?? picked;
  return (
    <>
      {place.repo === null ? (
        <RepoPicker
          repos={place.repos}
          picked={picked}
          onPick={setPicked}
          note={
            <>
              The factory {code(place.factory)} works on {place.repos.length}: the run starts on the one picked.
            </>
          }
        />
      ) : (
        <p data-repo className="text-sm">
          On {path(place.repo)}
        </p>
      )}
      {repo !== null && <Workflows key={repo} place={{ factory: place.factory, repo }} />}
    </>
  );
}

/**
 * The workflows `place`'s factory offers on its repository, read with its hires, one a radio: one that cannot start says why, in the
 * package's words (`whyNotStarted`), and cannot be picked. Then `StartRun` in the factory for the one picked.
 */
function Workflows({ place }: { place: Place }) {
  const workflows = useQuery(factoryWorkflowsQuery(place));
  const [picked, setPicked] = useState<string | null>(null);
  const legend = useId();
  const workflow = workflows.data?.find((w) => whyNotStarted(w) === null && workflowKey(w) === picked) ?? null;

  return (
    <>
      <fieldset aria-labelledby={legend} className="space-y-1.5">
        <legend id={legend} className="text-sm font-medium">
          Workflow
        </legend>
        {workflows.error ? (
          <p className="text-xs text-red-700 dark:text-red-400">
            Could not list the workflows of the factory {code(place.factory)}: {workflows.error.message}
          </p>
        ) : !workflows.data ? (
          <p className="text-xs text-neutral-500">Reading the workflows…</p>
        ) : !workflows.data.length ? (
          <p className="text-xs text-neutral-500">
            No workflow the factory attaches is on {path(place.repo)}: attach one there with{' '}
            {code(`wf factory attach ${place.factory} <workflow>`)}.
          </p>
        ) : (
          <ul className="divide-y divide-neutral-200 rounded border border-neutral-300 dark:divide-neutral-800 dark:border-neutral-700">
            {workflows.data.map((w) => (
              <WorkflowRow key={workflowKey(w)} workflow={w} group={legend} picked={picked} onPick={setPicked} />
            ))}
          </ul>
        )}
      </fieldset>
      {workflow && <StartRun workflow={workflow} repo={place.repo} place={place} />}
    </>
  );
}

/** One workflow the factory offers, a radio in the group `group`: its name, whether it is yours, its description, why it cannot start. */
function WorkflowRow({
  workflow,
  group,
  picked,
  onPick,
}: {
  workflow: WorkflowListing;
  group: string;
  picked: string | null;
  onPick: (key: string) => void;
}) {
  const key = workflowKey(workflow);
  const why = whyNotStarted(workflow);
  return (
    <li data-workflow={key}>
      <label
        className={`flex items-baseline gap-2 px-2 py-1.5 text-sm ${why ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-900'}`}
      >
        <input
          type="radio"
          name={group}
          value={key}
          checked={picked === key}
          disabled={why !== null}
          onChange={() => onPick(key)}
          className="translate-y-0.5 self-start"
        />
        <span className="min-w-0 flex-1 space-y-0.5">
          <span className={`block font-medium ${why ? 'text-neutral-500' : ''}`}>
            {workflow.name}
            {workflow.from === 'yours' && <span className="font-normal text-neutral-500"> (yours)</span>}
          </span>
          {workflow.description && <span className="block text-xs text-neutral-500">{workflow.description}</span>}
          {why && (
            <span data-why-not className="block text-xs whitespace-pre-wrap break-words text-amber-700 dark:text-amber-400">
              {why}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
