/**
 * The words of the verbs that put a template onto a factory, in the order `nemia`'s help lists them: make one from it (`nemia factory
 * apply`), take a hand-made one over by it (`adopt`), preview an upgrade or a takeover (`diff`), upgrade one, and resolve an upgrade's
 * conflict (`resolve`). A template travels to the api by a builtin's name or packed, and a choice's file by its text. Pure.
 */
import { type CommandWords, type Flag, type Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';

/** `--no-trust`, on `nemia factory add` and `apply`: the factory filed, and no place of it trusted. */
export const NO_TRUST: Flag = { flag: '--no-trust', kind: 'switch', key: 'noTrust' };

/** What `nemia factory apply` takes after its verb, said by its usage and by `nemia factory add`'s refusal of a `--template`. */
export const APPLY_USAGE =
  '<name> --template <name|folder|archive> --repo <path|url> [--repo <path|url> ...] [--set <key>=<value> ...] [--no-trust]';

/** Why the command line takes a verb of a template by its arguments: the api serves it, a template traveling by its name or packed. */
const servedAs = (endpoints: string): { readonly side: 'cli'; readonly why: string } => ({
  side: 'cli',
  why: `the api serves it as the Factory's ${endpoints} of \`objects\`' Api, calling this handler: a template travels there packed, or by a builtin template's name`,
});

/** `--set <key>=<value>`, once per parameter of the template. */
const SET: Flag = {
  flag: '--set',
  kind: 'text',
  key: 'sets',
  many: true,
  takes: '--set takes a parameter of the template and its value: --set <key>=<value>',
};

/** `nemia factory apply`'s spec: the factory's name, its template, a `--repo` or more, a `--set` a parameter, and `--no-trust`. */
const APPLY_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [
    {
      flag: '--template',
      kind: 'text',
      key: 'template',
      takes:
        "--template takes the name of a builtin template, a template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote: nemia factory apply <name> --template <name|folder|archive>",
      twice: 'nemia factory apply takes --template once: a factory is made from one template.',
    },
    {
      flag: '--repo',
      kind: 'text',
      key: 'repos',
      many: true,
      takes:
        "--repo takes a repository's directory or its git URL: nemia factory apply <name> --template <name|folder|archive> --repo <path|url> [--repo <path|url> ...]",
    },
    SET,
    NO_TRUST,
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory apply does not take ${arg}. It takes the name, --template <name|folder|archive>, --repo <path|url> once per repository, --set <key>=<value> once per parameter, and --no-trust.`
      : `nemia factory apply makes one factory, and ${arg} is a second name: nemia factory apply <name> --template <name|folder|archive> --repo <path>.`,
  missing:
    "nemia factory apply takes the new factory's name: nemia factory apply <name> --template <name|folder|archive> --repo <path> [--set <key>=<value> ...].",
};

/** `nemia factory apply`: a factory filed from a template, its places then trusted unless `--no-trust`; the daemon renders its tree. */
export const FACTORY_APPLY_WORDS = {
  name: 'factory apply',
  served: [{ endpoint: 'factories.apply' }],
  usage: APPLY_USAGE,
  help: ['make a factory from a template that passes its check, its parameters', 'given with --set; the daemon renders its tree'],
  spec: APPLY_SPEC,
  check: (args) => leftOut(APPLY_SPEC, args),
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: servedAs('`apply`'),
} as const satisfies CommandWords;

/** `nemia factory adopt --help`: the takeover's manual. */
const ADOPT_HELP = `nemia factory diff <name> --template <name|folder|archive> [--set <key>=<value> ...]
nemia factory adopt <name> --template <name|folder|archive> [--set <key>=<value> ...] --plan <digest>

nemia factory adopt takes a factory you made by hand over by a template, in place, as nemia factory diff
<name> --template <name|folder|archive> [--set ...] previewed it: --plan carries the digest the
preview printed, and a plan that changed since — the factory's file, the template, its version,
its parameters or its render — is refused. It writes the render into factories/<name>/applied/
and tree/, then names the template in the factory's file: the tree's workflows, hires and
revisions policy are read from then on, the file's own left in it, unread. Its name,
repositories, schedules, instruction, cards, runs and stats stay; a run in flight keeps the
workflow frozen on its record. The store's RULES.md is no longer read: the preview prints the
nemia factory rules line that writes it into the tree. Refused: a factory made from a template
already (upgrade it), a card filed and not started or a schedule naming a workflow the
template does not offer, and a base or tree already there that is not the render.
`;

/** `nemia factory adopt`'s spec: the factory, `--template`, a `--set` per parameter, and `--plan`. */
const ADOPT_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [
    {
      flag: '--template',
      kind: 'text',
      key: 'template',
      takes:
        "--template takes a builtin template's name, the template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote",
      twice: 'take --template once: a factory is taken over by one template.',
    },
    SET,
    {
      flag: '--plan',
      kind: 'text',
      key: 'plan',
      takes: '--plan takes the digest nemia factory diff printed for the takeover: --plan sha256:<hex>',
      twice: 'take --plan once: a takeover carries the one plan it was previewed by.',
    },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory adopt does not take ${arg}. It takes the factory, --template <name|folder|archive>, --set <key>=<value> once per parameter, and --plan <digest>.`
      : `nemia factory adopt takes one factory over, and ${arg} is a second: nemia factory adopt <name> --template <name|folder|archive> --plan <digest>.`,
  missing:
    'nemia factory adopt takes the factory to take over: nemia factory diff <name> --template <name|folder|archive> previews it, then nemia factory adopt <name> --template <name|folder|archive> --plan <digest>.',
};

/** `nemia factory adopt`: a hand-made factory taken over in place by the template whose takeover `nemia factory diff` previewed. */
export const FACTORY_ADOPT_WORDS = {
  name: 'factory adopt',
  served: [{ endpoint: 'factories.adopt' }],
  usage: '<name> --template <name|folder|archive> [--set <key>=<value> ...] --plan <digest>',
  help: [
    'take a hand-made factory over by a template, in place, as nemia factory',
    'diff previewed it: its name, cards, runs and stats stay',
  ],
  spec: ADOPT_SPEC,
  manual: ADOPT_HELP,
  check: (args) => leftOut(ADOPT_SPEC, args),
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: servedAs('`adopt`'),
} as const satisfies CommandWords;

/** Why the command line takes a preview, an upgrade and a choice by their arguments, a choice's file sent by its text. */
const UPGRADE_HERE = {
  side: 'cli',
  why: "the api serves it as the Factory's diff, upgrade or resolve of `objects`' Api, calling this handler: a template travels there packed, or by a builtin template's name, and a file by its text",
} as const;

/** `--to`, the version an upgrade is to. */
const TO: Flag = {
  flag: '--to',
  kind: 'text',
  key: 'to',
  takes: '--to takes the version to upgrade to, three numbers: --to <x.y.z>',
  twice: 'take --to once: a factory is upgraded to one version.',
};

/** `--template`, where the template is at another place than the one the factory names. */
const FROM_TEMPLATE: Flag = {
  flag: '--template',
  kind: 'text',
  key: 'template',
  takes:
    "--template takes the name of a builtin template, a template's folder, the one that holds its nemia.yaml, or an archive nemia template pack wrote",
  twice: 'take --template once: a factory is made from one template.',
};

/** `nemia factory diff`'s spec: the factory, `--to`, `--template`, and a `--set` per parameter. */
const PLAN_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [TO, FROM_TEMPLATE, SET],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory diff does not take ${arg}. It takes the factory, --to <x.y.z>, --template <name|folder|archive> and --set <key>=<value> once per parameter.`
      : `nemia factory diff previews one factory, and ${arg} is a second: nemia factory diff <name> --to <x.y.z>.`,
  missing:
    'nemia factory diff takes the factory to preview: nemia factory diff <name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...], or, made by hand, nemia factory diff <name> --template <name|folder|archive> [--set <key>=<value> ...].',
};

/** `nemia factory diff`: a templated factory's upgrade previewed, or a hand-made one's takeover; nothing written. */
export const FACTORY_DIFF_WORDS = {
  name: 'factory diff',
  served: [{ endpoint: 'factories.diff' }],
  usage:
    '<name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] | <name> --template <name|folder|archive> [--set <key>=<value> ...]',
  help: [
    "preview a templated factory's upgrade: what merges cleanly, and each",
    'conflict with its sides; onto a template of another name, a switch',
    "with no common base; or a hand-made factory's takeover by a",
    'template, and the plan nemia factory adopt takes; nothing is written.',
    'To change a parameter alone: --to the version applied, and',
    '--set <key>=<value> for each; it prints the line that files it',
  ],
  spec: PLAN_SPEC,
  check: (args) => leftOut(PLAN_SPEC, args),
  writes: false,
  class: 'read',
  only: UPGRADE_HERE,
} as const satisfies CommandWords;

/** `nemia factory upgrade`'s spec: the factory, `--to`, `--template`, a `--set` per parameter, `--plan` and `--downgrade`. */
const UPGRADE_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [
    TO,
    FROM_TEMPLATE,
    SET,
    {
      flag: '--plan',
      kind: 'text',
      key: 'plan',
      takes: '--plan takes the digest nemia factory diff printed for this upgrade: --plan sha256:<hex>',
      twice: 'take --plan once: an upgrade files one plan.',
    },
    { flag: '--downgrade', kind: 'switch', key: 'downgrade' },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory upgrade does not take ${arg}. It takes the factory, --to <x.y.z>, --template <name|folder|archive>, --set <key>=<value> once per parameter, --plan <digest> and --downgrade.`
      : `nemia factory upgrade upgrades one factory, and ${arg} is a second: nemia factory upgrade <name> --to <x.y.z>.`,
  missing:
    'nemia factory upgrade takes the factory to upgrade: nemia factory upgrade <name> --to <x.y.z> [--template <name|folder|archive>].',
};

/** `nemia factory upgrade`: the version wanted written into the factory's file; the daemon merges it. */
export const FACTORY_UPGRADE_WORDS = {
  name: 'factory upgrade',
  served: [{ endpoint: 'factories.upgrade' }],
  usage: '<name> --to <x.y.z> [--template <name|folder|archive>] [--set <key>=<value> ...] [--plan <digest>] [--downgrade]',
  help: [
    'upgrade a templated factory: its file wants --to, and the daemon merges',
    "the template's change into its tree once each conflict is resolved;",
    'with --to the version applied and --set, a change of its parameters',
    'alone, filed with the --plan nemia factory diff printed for it',
  ],
  spec: UPGRADE_SPEC,
  check: (args) => leftOut(UPGRADE_SPEC, args),
  writes: true,
  ticks: true,
  class: 'ask',
  asksAlways: true,
  only: UPGRADE_HERE,
} as const satisfies CommandWords;

/** `nemia factory resolve`'s spec: the factory, the conflict's address, and one of `--ours`, `--theirs` and `--file`. */
const RESOLVE_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'conflict', takes: 'required', kind: 'name' },
  ],
  flags: [
    { flag: '--ours', kind: 'switch', key: 'ours', way: true },
    { flag: '--theirs', kind: 'switch', key: 'theirs', way: true },
    {
      flag: '--file',
      kind: 'text',
      key: 'file',
      way: true,
      takes: '--file takes the file that holds what the conflict becomes: nemia factory resolve <name> <conflict> --file <path>',
    },
  ],
  unknown: (arg) =>
    `nemia factory resolve does not take ${arg}. It takes the factory, the conflict as nemia factory diff names it, and one of --ours, --theirs and --file <path>.`,
  oneWay: 'nemia factory resolve takes one choice: --ours keeps your tree, --theirs takes the template, --file <path> gives the text.',
  missing:
    'nemia factory resolve takes the factory and the conflict, as nemia factory diff names it: nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>.',
};

/** `nemia factory resolve`: the person's choice for one conflict of an upgrade; an owner proposed once each of its conflicts has one. */
export const FACTORY_RESOLVE_WORDS = {
  name: 'factory resolve',
  served: [{ endpoint: 'factories.resolve' }],
  usage: '<name> <conflict> --ours|--theirs|--file <path>',
  help: [
    "choose for one conflict of a templated factory's upgrade or switch: your",
    'tree, the template (none: drop the file), or the text of a file; once',
    'each conflict of a workflow, an agent, a skill, a hire or the rules and',
    'instruction has one, that object is proposed as they compose it, to',
    'approve (nemia proposals approve <p> -n <name>); a carried file stays',
    'a choice; the daemon merges once each has one and each proposal applied',
  ],
  spec: RESOLVE_SPEC,
  check: (args) =>
    leftOut(RESOLVE_SPEC, args) ??
    (args.ours === true || args.theirs === true || args.file !== undefined ? null : (RESOLVE_SPEC.oneWay ?? null)),
  writes: true,
  ticks: true,
  class: 'ask',
  asksAlways: true,
  only: UPGRADE_HERE,
} as const satisfies CommandWords;
