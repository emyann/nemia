import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Milestone } from 'objects';
import { CutButton, PageName, RadioTile, RadioTileGroup, Reading, ReadingLines } from '@/components/look';
import { Button } from '@/components/ui/ds';
import { addVolumeUntrusted, factoryNamesQuery, factoryViewQuery, trustFactory, type Factory } from '@/lib/api/factories';
import { makeRepository, newRepository } from '@/lib/api/folders';
import { milestonesQuery } from '@/lib/api/readiness';
import { MILESTONE_LINKS, MILESTONE_NAMES } from '@/lib/gettingStarted';
import { heldOf, volumeStepOf, type NotRepository, type VolumeWay } from '@/lib/volumeStep';
import { FactoryTrust } from '../factory/FactoryTrust';
import { AddressPick } from './AddressPick';
import { FolderPick, InitOffer } from './FolderPick';
import { NewRepository } from './NewRepository';
import { VolumeWays } from './VolumeWays';

/** How a volume is given: writable, a repository the factory works on, or read-only, a folder its steps read. */
type Mode = 'rw' | 'ro';

/** The volume this page added, as the api answered it: its folder (a clone's, for an address) and whether it is read-only. */
type Added = { readonly path: string; readonly readOnly: boolean };

/** The words of a write refused, as the api said them. */
const refusedOf = (error: Error | null): string | undefined => (error === null ? undefined : error.message);

/**
 * The welcome's volume step, "Where is the work?", at `/welcome/volume`, and the same body opened again from a factory's Settings at
 * `/factories/<factory>/volume` (`again`): three ways to give the factory its work (a folder of this machine, a repository by its
 * address, a new one) and a skip on every screen; a folder that is no repository offered `git init`; the volume added writable, then its
 * trust asked in the words the factory's Settings say it, "Not now" leaving the factory waiting. What it shows is `volumeStepOf`, over
 * the factory as the api reads it now and what this page wrote. At the welcome its factory is the store's (a choice where it holds
 * several); opened again, where the factory holds a trusted writable volume already, each way offers read-only first.
 */
export function VolumeStep({ factory: given, again = false }: { factory?: string; again?: boolean }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const names = useQuery({ ...factoryNamesQuery, enabled: given === undefined });
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const name = given ?? picked ?? names.data?.[0];
  const view = useQuery({ ...factoryViewQuery(name ?? ''), enabled: name !== undefined });
  const milestones = useQuery(milestonesQuery);
  const [way, setWay] = useState<VolumeWay | undefined>(undefined);
  const [folder, setFolder] = useState<{ path: string; notRepository: NotRepository } | undefined>(undefined);
  const [added, setAdded] = useState<Added | undefined>(undefined);
  const [later, setLater] = useState(false);
  const [modeChosen, setMode] = useState<Mode | undefined>(undefined);
  const held = view.data !== undefined && heldOf(view.data);
  const mode: Mode = modeChosen ?? (again && held ? 'ro' : 'rw');
  const readAgain = async () => {
    if (name !== undefined) await queryClient.refetchQueries({ queryKey: factoryViewQuery(name).queryKey });
    void queryClient.invalidateQueries({ queryKey: ['readiness'] });
  };
  const add = useMutation({
    mutationFn: async (target: string) => {
      if (name === undefined) throw new Error('No factory is chosen: make a factory first, then give it its work.');
      const answer = await addVolumeUntrusted(name, `${target}:${mode}`);
      await readAgain();
      return answer;
    },
    onSuccess: (answer) => setAdded({ path: answer.volume.path, readOnly: answer.volume.readOnly }),
  });
  const init = useMutation({
    mutationFn: (path: string) => makeRepository(path),
    onSuccess: (made) => add.mutate(made.path),
  });
  const made = useMutation({
    mutationFn: (repository: string) => newRepository(repository),
    onSuccess: (repository) => add.mutate(repository.path),
  });
  const trust = useMutation({
    mutationFn: async () => {
      if (name === undefined) return;
      await trustFactory(name);
      await readAgain();
    },
  });
  const trusted =
    added !== undefined && (added.readOnly || (view.data !== undefined && !view.data.untrusted.some((u) => u.place === added.path)));
  const screen = volumeStepOf({
    again,
    held,
    way,
    notRepository: folder?.notRepository,
    added: added === undefined ? undefined : { trusted },
    later,
  });
  const next: Milestone | undefined = milestones.data?.milestones.find(
    (m) => m.name !== 'harness' && m.name !== 'factory' && m.name !== 'volume' && m.state !== 'done',
  )?.name;
  const nextLink = next === undefined ? undefined : MILESTONE_LINKS[next];
  const startOver = () => {
    add.reset();
    setAdded(undefined);
    setLater(false);
    setFolder(undefined);
    setWay(undefined);
  };
  const noFactory = given === undefined && names.data !== undefined && names.data.length === 0;
  return (
    <article data-volume-step={noFactory ? 'no-factory' : screen} className="mx-auto flex max-w-3xl flex-col gap-8 px-3 py-6 @lg/page:px-6">
      <header className="flex flex-col gap-1">
        <PageName>Where is the work?</PageName>
        <p className="text-body-medium text-on-surface-variant">
          {name === undefined
            ? "A factory's runs work in a git repository: its volume."
            : `${name}'s runs work in a git repository: give it one as its volume.`}
        </p>
      </header>
      {noFactory ? (
        <p data-volume-no-factory className="m-0 text-body-medium text-on-surface-variant">
          The store holds no factory yet: make one first, then give it its work.
        </p>
      ) : name === undefined || view.data === undefined ? (
        <Reading label="Reading the factory">
          <ReadingLines widths={['w-2/3', 'w-1/2', 'w-3/5']} className="gap-3" />
        </Reading>
      ) : (
        <>
          {given === undefined && (names.data?.length ?? 0) > 1 && screen !== 'done' && added === undefined && (
            <RadioTileGroup label="Which factory?" layout="column" value={name} onChange={(chosen) => setPicked(String(chosen))}>
              {(names.data ?? []).map((n) => (
                <RadioTile key={n} value={n} data-volume-factory={n} title={n} description="Give this factory its work." />
              ))}
            </RadioTileGroup>
          )}
          <StepBody
            screen={screen}
            factory={view.data}
            way={way}
            folder={folder}
            added={added}
            again={again && held}
            mode={mode}
            onMode={setMode}
            onWay={(chosen) => {
              add.reset();
              setFolder(undefined);
              setWay(chosen);
            }}
            add={{ onAdd: (target) => add.mutate(target), pending: add.isPending, refused: refusedOf(add.error) }}
            onFolder={(path, repository) => {
              if (repository === false && mode === 'rw') setFolder({ path, notRepository: 'offered' });
              else add.mutate(path);
            }}
            init={{
              onYes: () => folder !== undefined && init.mutate(folder.path),
              onNo: () => folder !== undefined && setFolder({ ...folder, notRepository: 'declined' }),
              onAnother: () => setFolder(undefined),
              pending: init.isPending || add.isPending,
              refused: refusedOf(init.error) ?? refusedOf(add.error),
            }}
            made={{
              onMake: (repository) => made.mutate(repository),
              pending: made.isPending || add.isPending,
              refused: refusedOf(made.error) ?? refusedOf(add.error),
            }}
            trust={{
              onTrust: () => trust.mutate(),
              onLater: () => setLater(true),
              trusting: trust.isPending,
              refused: refusedOf(trust.error),
            }}
            onAnother={startOver}
          />
        </>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Button
          variant="text"
          size="small"
          data-welcome-skip
          onPress={() =>
            void (again && given !== undefined
              ? navigate({ to: '/factories/$factory/settings', params: { factory: given } })
              : navigate({ to: '/' }))
          }
        >
          {screen === 'done' ? (again ? 'Back to its Settings' : 'Leave for the board') : 'Skip, set it later'}
        </Button>
        {noFactory && <CutButton to="/welcome/factory">Make a factory</CutButton>}
        {screen === 'done' && !again && (
          <CutButton data-welcome-next to={nextLink ?? '/'}>
            {next === undefined ? 'On to the board' : `Next: ${MILESTONE_NAMES[next].toLowerCase()}`}
          </CutButton>
        )}
      </footer>
    </article>
  );
}

/** What the step's body is told: the screen, the factory, what was chosen and added, and what each press does. */
type BodyProps = {
  screen: ReturnType<typeof volumeStepOf>;
  factory: Factory;
  way: VolumeWay | undefined;
  folder: { path: string; notRepository: NotRepository } | undefined;
  added: Added | undefined;
  again: boolean;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onWay: (way: VolumeWay) => void;
  add: { onAdd: (target: string) => void; pending: boolean; refused: string | undefined };
  onFolder: (path: string, repository: boolean | undefined) => void;
  init: { onYes: () => void; onNo: () => void; onAnother: () => void; pending: boolean; refused: string | undefined };
  made: { onMake: (name: string) => void; pending: boolean; refused: string | undefined };
  trust: { onTrust: () => void; onLater: () => void; trusting: boolean; refused: string | undefined };
  onAnother: () => void;
};

/** The step's body for its screen: the tiles and the chosen way's panel, the offer to make a repository, the trust, or the work in place. */
function StepBody(props: BodyProps) {
  const { screen, factory, way, folder, added, again, mode, onMode, onWay, add, init, made, trust, onAnother } = props;
  if (screen === 'done')
    return (
      <section data-volume-done aria-label="The work in place" className="flex flex-col items-start gap-2">
        <p className="m-0 text-body-large text-on-surface">
          {added === undefined
            ? `${factory.name} has its work: a writable volume, trusted.`
            : `${added.path} is ${factory.name}'s ${added.readOnly ? 'read-only volume' : 'work, writable and trusted'}.`}
        </p>
        {again && (
          <Button variant="text" data-volume-another onPress={onAnother}>
            Add another
          </Button>
        )}
      </section>
    );
  if (screen === 'trust' || screen === 'waiting') {
    const asked = { ...factory, untrusted: factory.untrusted.filter((u) => u.place === added?.path) };
    return (
      <section data-volume-trust={screen} aria-label="Trust the volume" className="flex flex-col gap-3">
        {screen === 'waiting' ? (
          <p data-volume-waiting className="m-0 text-body-medium text-on-surface-variant">
            {factory.name} waits on your trust: its runs do not start in {added?.path} until a harness trusts it. Trust it here, or later
            from its Settings ({factory.commands.trust}); Getting started says so meanwhile.
          </p>
        ) : (
          <p className="m-0 text-body-medium text-on-surface-variant">{added?.path} is added. Before a run works in it, trust it:</p>
        )}
        <FactoryTrust
          factory={asked}
          onTrust={trust.onTrust}
          trusting={trust.trusting}
          {...(screen === 'trust' ? { onLater: trust.onLater } : {})}
        />
        {trust.refused !== undefined && (
          <p role="alert" data-trust-refused className="m-0 text-body-small break-words text-failure">
            {trust.refused}
          </p>
        )}
      </section>
    );
  }
  if ((screen === 'init' || screen === 'declined') && folder !== undefined)
    return <InitOffer path={folder.path} declined={screen === 'declined'} {...init} />;
  return (
    <>
      <VolumeWays value={way} onChange={onWay} />
      {again && screen !== 'choose' && (
        <RadioTileGroup label="How is it given?" layout="column" value={mode} onChange={(chosen) => onMode(chosen === 'rw' ? 'rw' : 'ro')}>
          <RadioTile
            value="ro"
            data-volume-mode="ro"
            title="Read-only"
            description="Its steps read it; runs work in the factory's writable one."
          />
          <RadioTile
            value="rw"
            data-volume-mode="rw"
            title="Writable"
            description="A repository the factory works on, besides the one it has."
          />
        </RadioTileGroup>
      )}
      {screen === 'folder' && (
        <section data-volume-panel="folder">
          <FolderPick onUse={props.onFolder} pending={add.pending} refused={add.refused} />
        </section>
      )}
      {screen === 'address' && (
        <section data-volume-panel="address">
          <AddressPick factory={factory.name} onClone={add.onAdd} pending={add.pending} refused={add.refused} />
        </section>
      )}
      {screen === 'new' && (
        <section data-volume-panel="new">
          <NewRepository onMake={made.onMake} pending={made.pending} refused={made.refused} />
        </section>
      )}
    </>
  );
}
