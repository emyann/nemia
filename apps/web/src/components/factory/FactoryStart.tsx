/**
 * A run's start: the rail's FAB that opens it in the frame's side sheet (`BarPanel`), and what the bar then shows — with no
 * factory yet, the factories to start it in; then the repository the run starts on — the factory's one, or, where it has several, the
 * one its wiring gives the workflow picked (`startRepo`), said and never picked — the workflows the factory offers there, each that
 * cannot start saying why, and `StartRun` in the factory for the one picked, as the CLI's `start --factory` starts it.
 */
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import KitButton from '@/components/ui/ds/components/Button';
import { PlusIcon } from '@/components/ui/ds/icons';
import { factoriesQuery, type Factory } from '@/lib/api/factories';
import { factoryWorkflowsQuery, type Place, type WorkflowListing } from '@/lib/api/workflows';
import { floorPlace, startRepo, whyNotStarted } from '@/lib/factories';
import { workflowKey } from '@/lib/inbox';
import { useBar } from '@/lib/useBar';
import { BarPanel } from '../frame/BarPanel';
import { StartRun } from '../run/StartRun';
import { FIELD } from '../workflow/WorkflowOptions';

const code = (text: string) => <code className="font-mono text-body-small">{text}</code>;
const path = (text: string) => <code className="font-mono text-body-small break-all">{text}</code>;

/** The factory a run is started in from the rail with `name` picked: the picked one when its floor starts runs, else none yet. */
function startIn(factories: readonly Factory[] | undefined, name: string | undefined): string | null {
  const factory = factories?.find((f) => f.name === name);
  return factory && floorPlace(factory) ? factory.name : null;
}

/**
 * The rail's FAB, 'Start a run': the kit's FAB, its plus alone on a closed rail and named in words beside it on an open one (`isExtended`).
 * A press opens the bar on the start of a run in the factory `name`, or, where the picked factory starts none from its floor or none is
 * picked, on the question which; it runs `onPress` first.
 */
export function StartFab({ name, isExtended, onPress }: { name?: string; isExtended: boolean; onPress?: () => void }) {
  const factories = useQuery(factoriesQuery);
  const { open, show } = useBar();
  const factory = startIn(factories.data, name);
  const press = () => {
    onPress?.();
    show({ kind: 'start', factory });
  };
  const expanded = open?.kind === 'start' && open.factory === factory;
  return isExtended ? (
    <KitButton variant="fab" icon={PlusIcon} aria-expanded={expanded} onPress={press}>
      Start a run
    </KitButton>
  ) : (
    <KitButton variant="fab" icon={PlusIcon} aria-label="Start a run" aria-expanded={expanded} onPress={press} />
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
    <BarPanel
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
    </BarPanel>
  );
}

/** The bar on the start of a run in no factory yet: which factory, read once the factories are. */
function AskFactory() {
  const factories = useQuery(factoriesQuery);
  return (
    <BarPanel title="Start a run" description="A run starts in a factory: pick the one it starts in, then its repository and workflow.">
      {factories.error ? (
        <p className="text-body-medium text-failure">Could not read the factories: {factories.error.message}</p>
      ) : !factories.data ? (
        <p className="text-body-small text-muted-foreground">Reading the factories…</p>
      ) : (
        <FactoryChoice factories={factories.data} />
      )}
    </BarPanel>
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

/**
 * The repository a run starts on in `place`'s factory, fixed when it has one; then its workflows there. Where it has several, the
 * workflow is picked first, by name among those the factory offers, and the repository is the one its wiring gives it (`startRepo`),
 * said and never picked, or why it gives none, naming the attach (`data-unwired`): the api places the run there whatever it is sent.
 */
function OnRepo({ place }: { place: { factory: string; repos: string[]; repo: string | null } }) {
  const factory = useQuery(factoriesQuery).data?.find((f) => f.name === place.factory);
  if (place.repo !== null)
    return (
      <>
        <p data-repo className="text-body-medium">
          On {path(place.repo)}
        </p>
        <Workflows key={place.repo} place={{ factory: place.factory, repo: place.repo }} />
      </>
    );
  return factory === undefined ? null : <Unfixed factory={factory} repos={place.repos.length} />;
}

/** The start in `factory`, of `repos` repositories: the workflow picked by name, then the repository its wiring gives it. */
function Unfixed({ factory, repos }: { factory: Factory; repos: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const field = useId();
  const offered = factory.workflows ?? [];
  const on = picked === null ? null : startRepo(factory, picked);
  return (
    <>
      <div className="space-y-1.5">
        <label htmlFor={field} className="block text-body-medium font-medium">
          Workflow
        </label>
        {offered.length === 0 ? (
          <p data-no-workflow className="text-body-small text-yours">
            The factory {code(factory.name)} offers no workflow yet: attach one with {code(factory.commands.attach)}.
          </p>
        ) : (
          <select
            id={field}
            value={picked ?? ''}
            onChange={(event) => setPicked(event.target.value)}
            className={`${FIELD} @md/page:max-w-xs`}
          >
            <option value="" disabled>
              Pick what runs
            </option>
            {offered.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <p className="text-body-small text-muted-foreground">
          The factory {code(factory.name)} works on {repos} repositories: its wiring says which one each workflow runs on.
        </p>
      </div>
      {on !== null && 'why' in on && (
        <p data-unwired={on.refused} className="text-body-small break-words text-yours">
          {on.why}
        </p>
      )}
      {on !== null && picked !== null && 'repo' in on && (
        <>
          <p data-repo className="text-body-medium">
            On {path(on.repo)}, where the factory runs {code(picked)}
          </p>
          <Workflows key={`${picked}:${on.repo}`} place={{ factory: factory.name, repo: on.repo }} only={picked} />
        </>
      )}
    </>
  );
}

/**
 * The workflows `place`'s factory offers on its repository, read with its hires, one a radio: one that cannot start says why, in the
 * package's words (`whyNotStarted`), and cannot be picked. Then `StartRun` in the factory for the one picked. Where it offers none there,
 * the line that attaches one, as the api answers it on the factory (`commands.attach`). With `only`, the workflow of that name alone.
 */
function Workflows({ place, only }: { place: Place; only?: string }) {
  const read = useQuery(factoryWorkflowsQuery(place));
  const workflows = { ...read, data: only === undefined ? read.data : read.data?.filter((w) => w.name === only) };
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
