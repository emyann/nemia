/**
 * The volume step's state and writes (`VolumeStep`, `components/welcome/`): the factory it gives a volume (the one the path names, else
 * the one the person picks of the store's, else the first), the factory as the api reads it now, the person's presses, and the writes —
 * a volume added writable and untrusted, a folder made a repository, a new one made in the store, the factory's places trusted — each
 * reading the factory again before the screen moves on, so what the step shows is the store's word (`volumeStepOf`).
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Milestone } from 'objects';
import { addVolumeUntrusted, factoryNamesQuery, factoryViewQuery, trustFactory } from './api/factories.ts';
import { makeRepository, newRepository } from './api/folders.ts';
import { milestonesQuery } from './api/readiness.ts';
import { MILESTONE_LINKS } from './gettingStarted.ts';
import { heldOf, volumeStepOf, type NotRepository, type VolumeWay } from './volumeStep.ts';

/** How a volume is given: writable, a repository the factory works on, or read-only, a folder its steps read. */
export type Mode = 'rw' | 'ro';

/** The volume this page added, as the api answered it: its folder (a clone's, for an address) and whether it is read-only. */
export type Added = { readonly path: string; readonly readOnly: boolean };

/** The words of a write refused, as the api said them. */
const refusedOf = (error: Error | null): string | undefined => (error === null ? undefined : error.message);

/**
 * The writes the step makes for the factory `name`, each reading the factory again once it is answered: a volume added in `mode`, then
 * `onAdded` told it; a folder made a repository, or a new one, then added; the factory's places trusted.
 */
function useVolumeWrites(name: string | undefined, mode: Mode, onAdded: (added: Added) => void) {
  const queryClient = useQueryClient();
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
    onSuccess: (answer) => onAdded({ path: answer.volume.path, readOnly: answer.volume.readOnly }),
  });
  const init = useMutation({ mutationFn: (path: string) => makeRepository(path), onSuccess: (made) => add.mutate(made.path) });
  const made = useMutation({ mutationFn: (repository: string) => newRepository(repository), onSuccess: (r) => add.mutate(r.path) });
  const trust = useMutation({
    mutationFn: async () => {
      if (name === undefined) return;
      await trustFactory(name);
      await readAgain();
    },
  });
  return { add, init, made, trust };
}

/**
 * The volume added here as the step judges it: trusted where it is read-only, or no harness withholds its trust from its folder now.
 */
const addedOf = (added: Added | undefined, untrusted: readonly { place: string }[] = []) =>
  added === undefined ? undefined : { trusted: added.readOnly || !untrusted.some((u) => u.place === added.path) };

/** The milestone after the volume not done yet, with the page that does it: where the step's Next leads. */
const nextOf = (milestones: readonly { name: Milestone; state: string }[] | undefined) => {
  const name = milestones?.find((m) => m.name === 'landed' && m.state !== 'done')?.name;
  return name === undefined ? undefined : { name, link: MILESTONE_LINKS[name] };
};

/** What the step holds of the person's choices, and the setters of each. */
type Chosen = { way: VolumeWay | undefined; folder: Folder | undefined; added: Added | undefined; again: boolean; mode: Mode };

/** The folder chosen that is no repository, and whether the person said no to making it one. */
type Folder = { path: string; notRepository: NotRepository };

/** The setters of what the step holds. */
type Setters = {
  setMode: (mode: Mode) => void;
  setWay: (way: VolumeWay | undefined) => void;
  setFolder: (folder: Folder | undefined) => void;
  setAdded: (added: Added | undefined) => void;
  setLater: (later: boolean) => void;
};

/** The body's props: what was chosen and added, and what each press does with the writes. */
function bodyOf(chosen: Chosen, set: Setters, { add, init, made, trust }: ReturnType<typeof useVolumeWrites>) {
  const { folder, mode } = chosen;
  const adding = add.isPending;
  return {
    ...chosen,
    onMode: set.setMode,
    onWay: (way: VolumeWay) => {
      add.reset();
      set.setFolder(undefined);
      set.setWay(way);
    },
    add: { onAdd: (target: string) => add.mutate(target), pending: adding, refused: refusedOf(add.error) },
    onFolder: (path: string, repository: boolean | undefined) =>
      repository === false && mode === 'rw' ? set.setFolder({ path, notRepository: 'offered' }) : add.mutate(path),
    init: {
      onYes: () => folder !== undefined && init.mutate(folder.path),
      onNo: () => folder !== undefined && set.setFolder({ ...folder, notRepository: 'declined' }),
      onAnother: () => set.setFolder(undefined),
      pending: init.isPending || adding,
      refused: refusedOf(init.error) ?? refusedOf(add.error),
    },
    made: {
      onMake: (r: string) => made.mutate(r),
      pending: made.isPending || adding,
      refused: refusedOf(made.error) ?? refusedOf(add.error),
    },
    trust: { onTrust: () => trust.mutate(), onLater: () => set.setLater(true), trusting: trust.isPending, refused: refusedOf(trust.error) },
    onAnother: () => {
      add.reset();
      set.setAdded(undefined);
      set.setLater(false);
      set.setFolder(undefined);
      set.setWay(undefined);
    },
  };
}

/**
 * The step's state for the factory `given` (none at the welcome), opened again from Settings where `again`.
 * @param given The factory the path names; none at the welcome.
 * @param again Whether the step was opened again from the factory's Settings.
 */
export function useVolumeStep(given: string | undefined, again: boolean) {
  const names = useQuery({ ...factoryNamesQuery, enabled: given === undefined });
  const [picked, setPicked] = useState<string | undefined>(undefined);
  const name = given ?? picked ?? names.data?.[0];
  const view = useQuery({ ...factoryViewQuery(name ?? ''), enabled: name !== undefined });
  const milestones = useQuery(milestonesQuery);
  const [way, setWay] = useState<VolumeWay | undefined>(undefined);
  const [folder, setFolder] = useState<Folder | undefined>(undefined);
  const [added, setAdded] = useState<Added | undefined>(undefined);
  const [later, setLater] = useState(false);
  const [modeChosen, setMode] = useState<Mode | undefined>(undefined);
  const held = view.data !== undefined && heldOf(view.data);
  const mode: Mode = modeChosen ?? (again && held ? 'ro' : 'rw');
  const { add, init, made, trust } = useVolumeWrites(name, mode, setAdded);
  const notRepository = folder?.notRepository;
  const screen = volumeStepOf({ again, held, way, notRepository, added: addedOf(added, view.data?.untrusted), later });
  const body = bodyOf(
    { way, folder, added, again: again && held, mode },
    { setMode, setWay, setFolder, setAdded, setLater },
    { add, init, made, trust },
  );
  return {
    name,
    names: names.data ?? [],
    noFactory: given === undefined && names.data !== undefined && names.data.length === 0,
    factory: name === undefined ? undefined : view.data,
    pick: setPicked,
    screen,
    next: nextOf(milestones.data?.milestones),
    body,
  };
}

/** What the step's body is told of the page's choices and writes. */
export type VolumeBody = ReturnType<typeof bodyOf>;
