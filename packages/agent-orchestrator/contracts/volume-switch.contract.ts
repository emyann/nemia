/**
 * A volume's switches set (agent-orchestrator, src/factory/volume/volume.ts): `nemia factory volume set <factory> <volume> --claude-md
 * on|off --skills on|off`, and the Volume's PATCH the board sends, set one volume's two switches without giving it again. `volumeSwitched`
 * decides, from the factory's volumes as they are named on read (`factoryVolumesNamed`), the volume's name and the switches given, what
 * the verb writes: the volume with the switches given and every other part kept (`switched`), or why nothing is written — no switch given
 * (`unasked`), or no volume of the factory holds that name (`missing`). A switch not given keeps what the volume had, as a second
 * `volume add` keeps it; the volume's path, mark, origin and name never move, so a run's mounts and a link to it stay.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A factory's volume as it is named on read: its name, its folder, its mark, the URL it was cloned from and its two switches. */
export type NamedSwitchable = {
  readonly name: string;
  readonly path: string;
  readonly readOnly: boolean;
  readonly origin?: string;
  readonly claudeMd?: boolean;
  readonly skills?: boolean;
};

/** The switches a person sets, each absent where it is not given. */
export type VolumeSwitches = { readonly claudeMd?: boolean; readonly skills?: boolean };

/** What the verb writes, or why it writes nothing. */
export type VolumeSwitch =
  | { readonly kind: 'switched'; readonly volume: NamedSwitchable }
  | { readonly kind: 'unasked' }
  | { readonly kind: 'missing' };

/** The volume of `volumes` named `name`, the first where two were. */
const namedIn = (volumes: readonly NamedSwitchable[], name: string) => volumes.find((v) => v.name === name);

/** Whether `switches` gives either switch. */
const asked = (switches: VolumeSwitches) => switches.claudeMd !== undefined || switches.skills !== undefined;

const volumeSwitchedSpec = spec<(volumes: readonly NamedSwitchable[], name: string, switches: VolumeSwitches) => VolumeSwitch>({
  ensures: {
    unaskedExactly: {
      description: 'Nothing is written, and the person is told to give a switch, exactly when neither switch is given',
      condition: ({ input: [, , switches], output }) => (output.kind === 'unasked') === !asked(switches),
    },
    missingExactly: {
      description: 'A switch given for a volume the factory does not hold is refused, exactly then',
      condition: ({ input: [volumes, name, switches], output }) =>
        (output.kind === 'missing') === (asked(switches) && namedIn(volumes, name) === undefined),
    },
    sameVolume: {
      description: 'The volume written is the one named, its name, folder, mark and origin as they were: only what it gives sessions moves',
      condition: ({ input: [volumes, name], output }) => {
        if (output.kind !== 'switched') return true;
        const was = namedIn(volumes, name);
        return (
          was !== undefined &&
          output.volume.name === was.name &&
          output.volume.path === was.path &&
          output.volume.readOnly === was.readOnly &&
          output.volume.origin === was.origin
        );
      },
    },
    claudeMdGivenIsSet: {
      description: "A CLAUDE.md switch given is the volume's after",
      condition: ({ input: [, , switches], output }) =>
        output.kind !== 'switched' || switches.claudeMd === undefined || output.volume.claudeMd === switches.claudeMd,
    },
    skillsGivenIsSet: {
      description: "A skills switch given is the volume's after",
      condition: ({ input: [, , switches], output }) =>
        output.kind !== 'switched' || switches.skills === undefined || output.volume.skills === switches.skills,
    },
    claudeMdNotGivenKept: {
      description: 'A CLAUDE.md switch not given keeps what the volume had',
      condition: ({ input: [volumes, name, switches], output }) =>
        output.kind !== 'switched' || switches.claudeMd !== undefined || output.volume.claudeMd === namedIn(volumes, name)?.claudeMd,
    },
    skillsNotGivenKept: {
      description: 'A skills switch not given keeps what the volume had',
      condition: ({ input: [volumes, name, switches], output }) =>
        output.kind !== 'switched' || switches.skills !== undefined || output.volume.skills === namedIn(volumes, name)?.skills,
    },
  },
});

/** `volumeSwitched`'s type, which `src/factory/volume/volume.ts` takes. */
export type VolumeSwitched = Implementation<typeof volumeSwitchedSpec>;
