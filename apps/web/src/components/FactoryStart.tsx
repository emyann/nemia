/**
 * A run's start: the sidebar's button that opens it in the frame's floating bar (`FloatingBar`), and what the bar then shows — with no
 * factory yet, the factories to start it in; then the repository the run starts on, the factory's one or picked among its several, the
 * workflows the factory offers there, each that cannot start saying why, and `StartRun` in the factory for the one picked, as
 * the CLI's `start --factory` starts it.
 */
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { factoriesQuery, factoryWorkflowsQuery, type Factory, type Place, type WorkflowListing } from '@/lib/api';
import { floorPlace, whyNotStarted } from '@/lib/factories';
import { workflowKey } from '@/lib/inbox';
import { useBar } from '@/lib/useBar';
import { RepoPicker } from './FactoryCardStart';
import { FloatingBar } from './FloatingBar';
import { StartRun } from './StartRun';

const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;
const path = (text: string) => <code className="font-mono text-body-small break-all">{text}</code>;

/**
 * The sidebar's 'Start a run' in the factory `name`, or in none yet, which asks which first, that opens the bar on its start, pressed while
 * it is open on its start or not, and runs `onPress`. Nothing is drawn for a name the api lists no factory by, nor for the default
 * factory, whose floor starts no run (`floorPlace`), nor before the factories are read, unless it names none.
 */
export function FactoryStart({ name, onPress }: { name?: string; onPress?: () => void }) {
  const factories = useQuery(factoriesQuery);
  const { open, show } = useBar();
  const factory = factories.data?.find((f) => f.name === name);
  const place = factory ? floorPlace(factory) : null;
  if (name !== undefined && !place) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      aria-expanded={open?.kind === 'start' && open.factory === (name ?? null)}
      onPress={() => {
        onPress?.();
        show({ kind: 'start', factory: name ?? null });
      }}
      className="w-full justify-start"
    >
      <Play data-icon="inline-start" />
      Start a run
    </Button>
  );
}

/**
 * The bar on the start of a run in the factory `factory`, which the address can name whatever factories there are: once they are read, a
 * factory the api lists by no such name, or the default one, starts no run from here and says so. With no factory yet, it asks which
 * (`FactoryChoice`).
 */
export function StartBar({ factory: name }: { factory: string | null }) {
  if (name === null) return <AskFactory />;
  return <StartIn name={name} />;
}

/** The bar on the start of a run in the factory `name`. */
function StartIn({ name }: { name: string }) {
  const factories = useQuery(factoriesQuery);
  const factory = factories.data?.find((f) => f.name === name);
  const place = factory ? floorPlace(factory) : null;
  return (
    <FloatingBar
      title={<>Start a run in {name}</>}
      description="A run of one of the workflows the factory offers, with its hires, on one of its repositories; it shows on its floor."
    >
      {factories.error ? (
        <p className="text-body-medium text-failure">Could not read the factories: {factories.error.message}</p>
      ) : !factories.data ? (
        <p className="text-body-small text-muted-foreground">Reading the factories…</p>
      ) : place === null ? (
        <p data-unplaced className="text-body-medium text-yours">
          {factory ? 'The default factory starts no run from here: start one from the Workflows page.' : `No factory is named ${name}.`}
        </p>
      ) : 'why' in place ? (
        <p data-unplaced className="text-body-medium text-yours">
          {place.why}
        </p>
      ) : (
        <OnRepo place={place} />
      )}
    </FloatingBar>
  );
}

/** The bar on the start of a run in no factory yet: which factory, read once the factories are. */
function AskFactory() {
  const factories = useQuery(factoriesQuery);
  return (
    <FloatingBar title="Start a run" description="A run starts in a factory: pick the one it starts in, then its repository and workflow.">
      {factories.error ? (
        <p className="text-body-medium text-failure">Could not read the factories: {factories.error.message}</p>
      ) : !factories.data ? (
        <p className="text-body-small text-muted-foreground">Reading the factories…</p>
      ) : (
        <FactoryChoice factories={factories.data} />
      )}
    </FloatingBar>
  );
}

/**
 * The factories a run can be started in, one a button, the default factory left out, since its floor starts none: one that cannot start
 * says why (`floorPlace`) and cannot be pressed. A press opens the bar on the start in that factory, which the address then names; moving
 * through the list with the keyboard picks none.
 */
export function FactoryChoice({ factories }: { factories: readonly Factory[] }) {
  const { show } = useBar();
  const legend = useId();
  const places = factories.flatMap((factory) => {
    const place = floorPlace(factory);
    return place ? [{ name: factory.name, why: 'why' in place ? place.why : null }] : [];
  });
  return (
    <fieldset aria-labelledby={legend} className="space-y-1.5">
      <legend id={legend} className="text-body-medium font-medium">
        Factory
      </legend>
      {!places.length ? (
        <p className="text-body-small text-muted-foreground">
          No factory is filed to start a run in: a run in none starts from the Workflows page.
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded border border-outline">
          {places.map(({ name, why }) => (
            <li key={name} data-start-factory={name} className="px-1 py-1">
              <Button
                variant="ghost"
                isDisabled={why !== null}
                aria-describedby={why ? `${legend}-${name}` : undefined}
                onPress={() => show({ kind: 'start', factory: name })}
                className="h-auto w-full justify-start px-2 py-1"
              >
                {name}
              </Button>
              {why && (
                <span
                  id={`${legend}-${name}`}
                  data-why-not
                  className="block px-2 pb-1 text-body-small whitespace-pre-wrap break-words text-yours"
                >
                  {why}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </fieldset>
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
        <p data-repo className="text-body-medium">
          On {path(place.repo)}
        </p>
      )}
      {repo !== null && <Workflows key={repo} place={{ factory: place.factory, repo }} />}
    </>
  );
}

/**
 * The workflows `place`'s factory offers on its repository, read with its hires, one a radio: one that cannot start says why, in the
 * package's words (`whyNotStarted`), and cannot be picked. Then `StartRun` in the factory for the one picked. Where it offers none there,
 * the line that attaches one, as the api answers it on the factory (`commands.attach`).
 */
function Workflows({ place }: { place: Place }) {
  const workflows = useQuery(factoryWorkflowsQuery(place));
  const { data: factories } = useQuery(factoriesQuery);
  const attach = factories?.find((f) => f.name === place.factory)?.commands.attach;
  const [picked, setPicked] = useState<string | null>(null);
  const legend = useId();
  const workflow = workflows.data?.find((w) => whyNotStarted(w) === null && workflowKey(w) === picked) ?? null;

  return (
    <>
      <fieldset aria-labelledby={legend} className="space-y-1.5">
        <legend id={legend} className="text-body-medium font-medium">
          Workflow
        </legend>
        {workflows.error ? (
          <p className="text-body-small text-failure">
            Could not list the workflows of the factory {code(place.factory)}: {workflows.error.message}
          </p>
        ) : !workflows.data ? (
          <p className="text-body-small text-muted-foreground">Reading the workflows…</p>
        ) : !workflows.data.length ? (
          <p className="text-body-small text-muted-foreground">
            No workflow the factory attaches is on {path(place.repo)}: attach one there{attach ? <> with {code(attach)}</> : null}.
          </p>
        ) : (
          <ul className="divide-y divide-outline-variant rounded border border-outline">
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
        className={`flex items-baseline gap-2 px-2 py-1.5 text-body-medium ${why ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-accent'}`}
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
          <span className={`block font-medium ${why ? 'text-muted-foreground' : ''}`}>
            {workflow.name}
            {workflow.from === 'yours' && <span className="font-normal text-muted-foreground"> (yours)</span>}
          </span>
          {workflow.description && <span className="block text-body-small text-muted-foreground">{workflow.description}</span>}
          {why && (
            <span data-why-not className="block text-body-small whitespace-pre-wrap break-words text-yours">
              {why}
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
