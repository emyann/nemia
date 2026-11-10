/**
 * `nemia factory volume add` and `volume rm`: a folder of the person's machine given to a factory's runs as a volume, marked `:ro` or
 * `:rw`, and taken back. Written into the factory's own file through the Factory door, whether or not it is made from a template: a volume
 * is the person's, never the template's.
 */
import path from 'node:path';
import { Effect } from 'effect';
import type { Args, Spec } from '../../command/command.ts';
import type { Command } from '../../command/entry.verb.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { FactoryDoor, filedFactory, refuseName } from '../door/factories.store.ts';
import { tried } from '../../runtime-client.ts';
import { Invalid, Missing } from '../../refusal/refusal.ts';
import { isDirectory } from '../../record/record.store.ts';
import { factoryVolumes, volumeMark, type Volume } from '../factory.ts';
import { volumeOf, volumeRefusal, withVolume } from './volume.ts';

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string): string => (typeof args[key] === 'string' ? args[key] : '');

/** Why the api does not write a volume: the board lists them and writes none. */
const ONLY_HERE = { side: 'cli', why: 'the board lists volumes and writes none: nemia factory volume writes them' } as const;

/** What a writable volume is not, said wherever a person reads one. */
export const NOT_THE_WORKSPACE = "a step's writes there are not the run's workspace: nothing commits, lands or reverts them";

const ADD_USAGE = '<factory> <path>:ro|:rw';

/** The forms of `nemia factory volume`, as `nemia factory --help` lists them beside the factory's others. */
export const VOLUME_FORMS = `nemia factory volume add <factory> <path>:ro|:rw  (nemia factory volume add --help)
nemia factory volume rm <factory> <path>`;

/** `nemia factory volume add --help`: what a volume is, and what it is not. */
const VOLUME_HELP = `${VOLUME_FORMS}

A volume is a folder of this machine a factory mounts for every local step of its runs, beside its
repositories, as a container is given one: <path>:ro read-only, <path>:rw writable. The mark is
required, since a volume left unmarked would be writable without anyone having said so.

A writable volume is writable only for a step whose fence writes, and read-only for every other. It is
not the run's workspace: nothing commits, lands or reverts what a step writes there, and every run of
the factory reaches it at once. A volume never makes the factory work on its folder: where a start, a
card or a schedule lands is unchanged.

Kept in the factory's own file (factories/<name>.json, "volumes"), never in a template, and kept by
nemia factory adopt and upgrade. Copied onto a run at its start, so a run in flight keeps what it began
with. A second add of one path replaces it; nemia factory lists them under the factory.

Refused, and nothing written: no :ro or :rw, a folder that is no directory, one of the factory's
repositories, a writable folder inside one or holding one, a folder at or inside the store, a
writable one holding the store, the default factory, and a volume rm of a path it does not mount.
A start is refused where a step's harness cannot hold a volume's mount, as one that holds only
read-only mounts cannot hold a writable one.`;

const ADD_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'volume', takes: 'required', kind: 'name' },
  ],
  flags: [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory volume add does not take ${arg}: nemia factory volume add ${ADD_USAGE}.`
      : `nemia factory volume add takes one volume, and ${arg} is a second: nemia factory volume add ${ADD_USAGE}, once per volume.`,
  missing: `nemia factory volume add takes the factory, then the folder and its mark: nemia factory volume add ${ADD_USAGE}. Nothing was changed.`,
  flagFirst: true,
};

/** A volume added: the factory's file written, the volume, and what one of its path was marked before (`null` for none). */
type Added = { file: string; volume: Volume; was: boolean | null };

/**
 * `nemia factory volume add`: a folder mounted for every local step of the factory's runs started after, read-only (`:ro`) or writable
 * (`:rw`), a second of one path replacing the first. Refused before anything is written: a spelling with no mark or another
 * (`volumeOf`), the default factory and a name with no factory, and a folder that is no directory, one of its repositories, or reaches
 * the store (`volumeRefusal`), each `Invalid`.
 */
export const FACTORY_VOLUME_ADD: Command<Added> = {
  name: 'factory volume add',
  usage: ADD_USAGE,
  help: [
    "mount a folder of this machine for every local step of a factory's runs,",
    "read-only (:ro) or writable (:rw); a writable one is not a run's workspace",
  ],
  spec: ADD_SPEC,
  manual: VOLUME_HELP,
  writes: true,
  class: 'ask',
  only: ONLY_HERE,
  handler: (args) => {
    const name = textOf(args, 'factory');
    return Effect.gen(function* () {
      const volume = volumeOf(textOf(args, 'volume'), process.cwd());
      if (typeof volume === 'string') return yield* Effect.fail(new Invalid({ message: volume }));
      yield* tried(() => refuseName(name, 'volume'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'volume');
      const refused = volumeRefusal(factory, volume, yield* StoreRoot, isDirectory);
      if (refused) return yield* Effect.fail(new Invalid({ message: refused }));
      const { volumes, was } = withVolume(factory, volume);
      const file = yield* door.factories.rewrite({ ...factory, volumes });
      return { file, volume, was };
    });
  },
  print: ({ file, volume, was }, args) => [
    `${textOf(args, 'factory')}  volume ${volume.path} ${volumeMark(volume)}${was === null || was === volume.readOnly ? '' : ` (was ${volumeMark({ readOnly: was })})`}`,
    ...(volume.readOnly ? [] : [`writable for each step whose fence writes; ${NOT_THE_WORKSPACE}`]),
    `changed: ${file} — runs started from now on mount it; a run in flight keeps what it was started with`,
  ],
};

const RM_USAGE = '<factory> <path>';

/** `nemia factory volume rm`: a volume taken off a factory, by its path; runs started after mount it no more. */
export const FACTORY_VOLUME_RM: Command<{ file: string; removed: string }> = {
  name: 'factory volume rm',
  usage: RM_USAGE,
  help: ['take a volume off a factory, by its path'],
  spec: {
    positionals: [
      { key: 'factory', takes: 'required', kind: 'name' },
      { key: 'path', takes: 'required', kind: 'name' },
    ],
    flags: [],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory volume rm does not take ${arg}: nemia factory volume rm ${RM_USAGE}.`
        : `nemia factory volume rm takes one path, and ${arg} is a second: nemia factory volume rm ${RM_USAGE}, once per volume.`,
    missing: `nemia factory volume rm takes the factory, then the volume's path: nemia factory volume rm ${RM_USAGE}. Nothing was removed.`,
    flagFirst: true,
  },
  writes: true,
  class: 'ask',
  only: ONLY_HERE,
  handler: (args) => {
    const name = textOf(args, 'factory');
    return Effect.gen(function* () {
      yield* tried(() => refuseName(name, 'volume'));
      const door = yield* FactoryDoor;
      const factory = yield* filedFactory(name, 'volume');
      const spelled = textOf(args, 'path');
      const unmarked = spelled.replace(/:(ro|rw)$/, '');
      const at = path.resolve(unmarked);
      const volumes = factoryVolumes(factory);
      if (!volumes.some((v) => v.path === at)) {
        const named = volumes.map((v) => v.path);
        return yield* Effect.fail(
          new Missing({
            message: `${name} mounts no volume ${at}: ${named.length ? `its volumes are ${named.join(', ')}` : 'it mounts none'}. Nothing was removed.`,
          }),
        );
      }
      const left = volumes.filter((v) => v.path !== at);
      const { volumes: _gone, ...rest } = factory;
      const file = yield* door.factories.rewrite(left.length ? { ...rest, volumes: left } : rest);
      return { file, removed: at };
    });
  },
  print: ({ file, removed }, args) => [`${textOf(args, 'factory')}  volume ${removed} removed`, `changed: ${file}`],
};

/** `nemia factory volume`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_VOLUMES: readonly Command[] = [FACTORY_VOLUME_ADD, FACTORY_VOLUME_RM] as readonly Command[];
