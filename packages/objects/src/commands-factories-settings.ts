/**
 * The words of what a factory's own file keeps for its runs, beside its wiring: a folder mounted for them (`nemia factory volume add|rm`),
 * a harness setting given their sessions (`nemia factory setting set|rm`) and a workflow's cost line (`nemia factory cost-line set|rm`),
 * each with its long help and the forms `nemia factory --help` lists. Pure.
 */
import { type Args, type CommandWords, dollarsOf, type Spec } from './command.ts';

/**
 * The harness whose settings a factory gives, and the settings it may give: what the orchestrator's `SETTINGS_HARNESS` and `SETTABLE`
 * say, held equal to them by its test, spelled here for the help a person reads.
 */
export const FACTORY_SETTINGS_HARNESS = 'claude';
export const FACTORY_SETTABLE = ['attribution', 'includeGitInstructions', 'language'] as const;

/** What a writable volume is not, said wherever a person reads one. */
export const NOT_THE_WORKSPACE = "a step's writes there are not the run's workspace: nothing commits, lands or reverts them";

/**
 * Why the command line takes a volume's write by its arguments: the api serves it as the Factory's `addVolume` and `removeVolume`,
 * calling these handlers with a path of the machine it runs on.
 */
const VOLUME_HERE = {
  side: 'cli',
  why: "the api serves it as the Factory's `addVolume` and `removeVolume` of `objects`' Api, calling this handler: a volume is a folder of the machine the store runs on, named there by its whole path",
} as const;

const VOLUME_ADD_USAGE = '<factory> <path>:ro|:rw';
const VOLUME_RM_USAGE = '<factory> <path>';

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

/** `nemia factory volume add`: a folder mounted for every local step of a factory's runs, read-only or writable. */
export const FACTORY_VOLUME_ADD_WORDS = {
  name: 'factory volume add',
  served: [{ endpoint: 'factories.addVolume' }],
  usage: VOLUME_ADD_USAGE,
  help: [
    "mount a folder of this machine for every local step of a factory's runs,",
    "read-only (:ro) or writable (:rw); a writable one is not a run's workspace",
  ],
  spec: {
    positionals: [
      { key: 'factory', takes: 'required', kind: 'name' },
      { key: 'volume', takes: 'required', kind: 'name' },
    ],
    flags: [],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory volume add does not take ${arg}: nemia factory volume add ${VOLUME_ADD_USAGE}.`
        : `nemia factory volume add takes one volume, and ${arg} is a second: nemia factory volume add ${VOLUME_ADD_USAGE}, once per volume.`,
    missing: `nemia factory volume add takes the factory, then the folder and its mark: nemia factory volume add ${VOLUME_ADD_USAGE}. Nothing was changed.`,
    flagFirst: true,
  },
  manual: VOLUME_HELP,
  writes: true,
  class: 'ask',
  only: VOLUME_HERE,
} as const satisfies CommandWords;

/** `nemia factory volume rm`: a volume taken off a factory, by its path. */
export const FACTORY_VOLUME_RM_WORDS = {
  name: 'factory volume rm',
  served: [{ endpoint: 'factories.removeVolume' }],
  usage: VOLUME_RM_USAGE,
  help: ['take a volume off a factory, by its path'],
  spec: {
    positionals: [
      { key: 'factory', takes: 'required', kind: 'name' },
      { key: 'path', takes: 'required', kind: 'name' },
    ],
    flags: [],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory volume rm does not take ${arg}: nemia factory volume rm ${VOLUME_RM_USAGE}.`
        : `nemia factory volume rm takes one path, and ${arg} is a second: nemia factory volume rm ${VOLUME_RM_USAGE}, once per volume.`,
    missing: `nemia factory volume rm takes the factory, then the volume's path: nemia factory volume rm ${VOLUME_RM_USAGE}. Nothing was removed.`,
    flagFirst: true,
  },
  writes: true,
  class: 'ask',
  only: VOLUME_HERE,
} as const satisfies CommandWords;

const SETTING_SET_USAGE = '<factory> <harness>.<key> <json>';
const SETTING_RM_USAGE = '<factory> <harness>.<key>';

/** The forms of `nemia factory setting`, as `nemia factory --help` lists them beside the factory's others. */
export const SETTING_FORMS = `nemia factory setting set ${SETTING_SET_USAGE}  (nemia factory setting set --help)
nemia factory setting rm ${SETTING_RM_USAGE}`;

/** `nemia factory setting set --help`: what a harness setting is, which a factory may set, and why. */
const SETTING_HELP = `${SETTING_FORMS}

A harness setting is a setting of a harness a factory gives every session of its runs' steps on that
harness, on top of the repository's own settings, as a container is given its configuration by its
Pod: the Agent SDK's settings option, never a file written into the repository. Its value is
JSON: nemia factory setting set f ${FACTORY_SETTINGS_HARNESS}.attribution '{"commit":"","pr":""}' writes no
Co-Authored-By trailer and no pull request line. A step's own agent's settings win a key both name.

A factory sets these alone: ${FACTORY_SETTABLE.map((k) => `${FACTORY_SETTINGS_HARNESS}.${k}`).join(', ')}.
Each changes what a session writes or says, and none what it may reach or run. Every other key is
refused, those that widen a fence (permissions, hooks, MCP servers, the sandbox, env) or run a
program among them: each keeps its own field or fence, which the refusal names.

Kept in the factory's own file (factories/<name>.json, "harnessSettings"), never in a template, and
kept by nemia factory adopt and upgrade. Frozen on a run at its start, so a run in flight keeps what
it began with; a key written into the file by hand that a factory may not set refuses the start.
nemia factory lists them under the factory.

Refused, and nothing written: a key that is not <harness>.<key>, a harness other than the default
one (${FACTORY_SETTINGS_HARNESS}), a key or a value a factory may not set, a value that is not JSON, the default
factory, and a setting rm of a key it does not set.`;

/** A spec of `nemia factory setting <verb>`: the factory, the setting, and its value where `valued`. */
const settingSpec = (verb: string, usage: string, valued: boolean): Spec => ({
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'setting', takes: 'required', kind: 'name' },
    ...(valued ? [{ key: 'value', takes: 'required', kind: 'text' } as const] : []),
  ],
  flags: [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory setting ${verb} does not take ${arg}: nemia factory setting ${verb} ${usage}.`
      : `nemia factory setting ${verb} takes one setting, and ${arg} is one more: nemia factory setting ${verb} ${usage}, once per setting (quote a JSON value).`,
  missing: `nemia factory setting ${verb} takes ${usage}. Nothing was changed.`,
  flagFirst: true,
});

/** `nemia factory setting set`: a harness setting given to every session on its harness of a factory's runs started after. */
export const FACTORY_SETTING_SET_WORDS = {
  name: 'factory setting set',
  served: [{ endpoint: 'factories.putSetting' }],
  usage: SETTING_SET_USAGE,
  help: [
    "give every session of a factory's runs on a harness one of its settings,",
    `${FACTORY_SETTINGS_HARNESS}.attribution among them; its value is JSON`,
  ],
  spec: settingSpec('set', SETTING_SET_USAGE, true),
  manual: SETTING_HELP,
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** `nemia factory setting rm`: a harness setting taken off a factory, by its key. */
export const FACTORY_SETTING_RM_WORDS = {
  name: 'factory setting rm',
  served: [{ endpoint: 'factories.deleteSetting' }],
  usage: SETTING_RM_USAGE,
  help: ['take a harness setting off a factory, by its key'],
  spec: settingSpec('rm', SETTING_RM_USAGE, false),
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

const COST_SET_USAGE = '<factory> <workflow> <usd>';
const COST_RM_USAGE = '<factory> <workflow>';

/** The forms of `nemia factory cost-line`, as `nemia factory --help` lists them beside the factory's others. */
export const COST_LINE_FORMS = `nemia factory cost-line set ${COST_SET_USAGE}  (nemia factory cost-line set --help)
nemia factory cost-line rm ${COST_RM_USAGE}`;

/** `nemia factory cost-line set --help`: what a cost line is, what it does and what it does not. */
const COST_LINE_HELP = `${COST_LINE_FORMS}

A cost line is what a run of a workflow may cost before its gate says so, in dollars, set per workflow
the factory offers: nemia factory cost-line set mill build 80. At each gate that sets budgets, the most
the run may cost under its caps — what it has spent, each step at the larger of its cap and its cost —
is read against the line; past it, the gate says so beside the caps, on the board and in nemia decide,
and no rule of auto approves that gate unasked. It cuts nothing: a step's cap still ends its session,
and a rule's under keeps its own amount of what the run has spent.

Kept in the factory's own file (factories/<name>.json, "costLines"), never in a template, and kept by
nemia factory adopt and upgrade. Frozen on a run at its start, so a run in flight keeps the line it
began with: a line set or taken back reaches the runs started after it. nemia factory lists them
under the factory. A workflow with a line is not detached until the line is taken back.

Refused, and nothing written: a workflow the factory does not offer, an amount that is not dollars above
zero, the default factory, a factory not in the store, and a cost-line rm of a workflow with no line.`;

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string): string => {
  const value = args[key];
  return typeof value === 'string' ? value : '';
};

/** A spec of `nemia factory cost-line <verb>`: the factory, the workflow, and the line where `valued`. */
const costSpec = (verb: string, usage: string, valued: boolean): Spec => ({
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'workflow', takes: 'required', kind: 'name' },
    ...(valued ? [{ key: 'usd', takes: 'required', kind: 'text' } as const] : []),
  ],
  flags: [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory cost-line ${verb} does not take ${arg}${valued ? ', and a line is dollars above zero' : ''}: nemia factory cost-line ${verb} ${usage}. Nothing was changed.`
      : `nemia factory cost-line ${verb} takes one workflow, and ${arg} is one more: nemia factory cost-line ${verb} ${usage}, once per workflow. Nothing was changed.`,
  missing: `nemia factory cost-line ${verb} takes ${usage}. Nothing was changed.`,
  flagFirst: true,
});

/** The command line's amount, refused before anything is read where it is not dollars above zero, in digits. */
const amountCheck = (args: Args): string | null => {
  const usd = args['usd'];
  if (typeof usd !== 'string' || dollarsOf(usd) !== undefined) return null;
  return `a cost line is dollars above zero, in digits, like 80 or 12.50, and ${usd} is not one: nemia factory cost-line set ${textOf(args, 'factory')} ${textOf(args, 'workflow')} <usd>. Nothing was changed.`;
};

/** `nemia factory cost-line set`: the cost line of a workflow in a factory, reaching the runs started after. */
export const FACTORY_COST_LINE_SET_WORDS = {
  name: 'factory cost-line set',
  served: [{ endpoint: 'factories.putCostLine' }],
  usage: COST_SET_USAGE,
  help: [
    'set what a run of a workflow may cost before its gate says so, in dollars:',
    'a gate whose caps pass it is said, and never approved unasked at auto',
  ],
  spec: costSpec('set', COST_SET_USAGE, true),
  check: amountCheck,
  manual: COST_LINE_HELP,
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** `nemia factory cost-line rm`: the cost line of a workflow taken off a factory. */
export const FACTORY_COST_LINE_RM_WORDS = {
  name: 'factory cost-line rm',
  served: [{ endpoint: 'factories.deleteCostLine' }],
  usage: COST_RM_USAGE,
  help: ["take a workflow's cost line off a factory"],
  spec: costSpec('rm', COST_RM_USAGE, false),
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;
