/**
 * `nemia factory`, each of its forms an entry of the command table: the store's factories listed — bare, which the api serves on its own
 * route, and `ls` — then filed, given workflows and relieved of them and removed, which the command line alone does; hired into and fired
 * from, which the api serves on a step's hire, `/api/factories/:factory/hires/:step`, the step as one segment, `build%2Fimplement`; and its
 * instruction's two verbs (instruction.verb.ts), which the api serves. Their handlers answer data, and the CLI prints it.
 */
import { Effect } from 'effect';
import { tried } from '../runtime-client.ts';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { factoryLines, type FactoryListing } from './factory.ts';
import {
  addFactory,
  attachWorkflow,
  detachWorkflow,
  factoriesDir,
  fireAgent,
  hireAgent,
  readFactories,
  removeFactory,
} from './factory.store.ts';
import { removeInstructionFolder } from './instruction.store.ts';
import { FACTORY_INSTRUCT, FACTORY_INSTRUCTION } from './instruction.verb.ts';
import { FACTORY_RULES } from '../rules/rules.verb.ts';
import { FACTORY_APPLY } from '../applied/applied.verb.ts';
import { FACTORY_PLAN, FACTORY_RESOLVE, FACTORY_UPGRADE } from '../upgrade/upgrade.verb.ts';
import { FACTORY_SCHEDULE, FACTORY_UNSCHEDULE } from '../schedule/schedule.verb.ts';
import { schedulesListed, type ScheduleRun, type ScheduleRuns } from '../schedule/listed.store.ts';
import type { ScheduleListed } from '../schedule/schedule.ts';
import { keptRuns } from '../record/files.store.ts';
import type { Run } from '../record/record.ts';
import { trustedLines, type PlaceTrust, type Untrusted } from '../trust/trust.ts';
import { FACTORY_TRUST, NO_TRUST, trustPlaces, untrustedPlaces } from '../trust/trust.verb.ts';
import { FACTORY_SERVER_ADD, FACTORY_SERVER_RM, FACTORY_SERVERS } from '../servers/servers.verb.ts';

export const FACTORY_HELP = `nemia factory [ls]
nemia factory add <name> --repo <path> [--repo <path> ...] [--no-trust]
nemia factory apply <name> --template <folder|archive> --repo <path> [--repo <path> ...] [--set <key>=<value> ...] [--no-trust]
nemia factory plan <name> --to <x.y.z> [--template <folder|archive>]
nemia factory upgrade <name> --to <x.y.z> [--template <folder|archive>] [--downgrade]
nemia factory resolve <name> <conflict> --ours|--theirs|--file <path>
nemia factory attach <factory> <workflow>
nemia factory detach <factory> <workflow>
nemia factory hire <factory> <agent> --step <workflow>/<step>
nemia factory fire <factory> --step <workflow>/<step>
nemia factory schedule <factory> <workflow> --cron <expr> --brief <text> [--repo <path>] [--tz <zone>]
nemia factory unschedule <factory> <workflow>
nemia factory servers <factory>
nemia factory server add <factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]
nemia factory server rm <factory> <server>
nemia factory rules <name> [--file <path>|- | --clear]
nemia factory instruction <name> [--path <path> | --store | --clear]
nemia factory instruct <name> --file <path>|- | --clear
nemia factory trust <name>
nemia factory rm <name>

A factory is a named grouping in the store: \${WF_ROOT:-~/.agent-workflows}/factories/, one <name>.json per
factory, naming the repositories its work is on, the workflows it offers and the agents it hires into their steps:

    { "repos": ["/home/me/code/app"], "workflows": ["build"], "hires": { "build/implement": "implementer" },
      "instruction": { "path": "docs/NEMIA.md" } }

  nemia factory     lists the default factory first — every run and card that names no factory; it is no file,
                 and is read, never written — then each factory by name with its repositories. A file that
                 does not read as a factory is listed with why, and a place a harness does not trust with
                 what is withheld there and the line that trusts it.
  nemia factory add files a factory: its name a lowercase slug (letters, digits, dashes; 40 at most), and one
                 --repo at least, each a directory, written as an absolute path and named once. Each place
                 is then trusted for every harness that keeps a trust of a folder, under the repository it
                 is in, so the place's own settings apply to the sessions of its steps: the place, what the
                 trust grants and how to take it back are printed, and nothing for a place already trusted.
                 --no-trust files the factory and trusts nothing. A trust that could not be given never
                 refuses the add: the line says why, and what repairs it.
  nemia factory apply files a factory made from a template that passes its check (nemia template check), its
                 parameters given with --set, typed as nemia.yaml declares them, a default filling one not
                 given. Its file names the template; the daemon renders the template into
                 factories/<name>/applied/, read-only, and seeds factories/<name>/tree/ from it once — the
                 workflows, agents, skills, wiring (factory.json) and NEMIA.md the factory runs from, yours to
                 change after — and writes factories/<name>/status.json: the version, the digest and the
                 conditions Applied and ConflictsPending. Its attach, detach, hire, fire and instruct write the
                 tree, and nemia workflows, agents and skills write into it with --factory <name>. Its places
                 are trusted as nemia factory add trusts them, unless --no-trust.
  nemia factory plan previews an upgrade of a templated factory to --to: the template, at its place or at --template,
                 rendered at that version with the factory's parameters and merged three ways — the base, your
                 tree, the render — each file whole first, factory.json by key, a step's frontmatter by key and
                 its body by line; what merges cleanly, and each conflict with its sides. It writes nothing.
  nemia factory upgrade writes --to, and --template where given, into the factory's file, and nothing else: the
                 daemon merges on its next pass, swapping the tree and then the base once each conflict has a
                 choice, and writes ConflictsPending into status.json while one waits. Refused: a template at
                 another version than --to, the version applied asked again, and a lower one without --downgrade.
                 A run in flight keeps the folders frozen on its record.
  nemia factory resolve writes your choice for one conflict, by the address nemia factory plan names: --ours keeps
                 your tree's side, --theirs the template's, --file <path> the text of a file. Kept in
                 factories/<name>/resolutions.json for the version wanted.
  nemia factory attach attaches a workflow, by its folder's name: the factory then offers it, and only the
                 workflows attached to it — none, until one is. Only the name is stored, and a step that
                 names its own agent is filled already; whether the workflow exists is judged at the start.
  nemia factory detach takes a workflow back, once the factory hires no one into its steps.
  nemia factory hire hires an agent into a step, <workflow>/<step> — the workflow by its folder's name, the step
                 by its file's, without .md: one agent a step, so a second hire replaces the first. Any agent
                 fills any step; it is found, when the run starts, where the step's own agent: would be.
                 A step whose own file names its agent: takes no hire.
  nemia factory fire takes a step's hire back.
  nemia factory schedule has the daemon start a run of an attached workflow at each fire of a cron (five or six
                 fields, read in --tz, the machine's zone when none), asked what --brief says, on --repo or the
                 factory's one repository, at every level; a pause stops it. A daemon that was down starts
                 what it missed once. A second schedule of the workflow replaces the first.
  nemia factory unschedule takes a workflow's schedule back.
  nemia factory rules prints the factory's rules and policies, writes them (--file <path>, - for stdin) or
                 removes them (--clear): words told to every agent hired into it, after its custom
                 instructions and before the step's own note, kept by the store in factories/<name>/RULES.md
                 beside its file (in its tree, for a factory made from a template), never in a repository.
                 Words only: a frontmatter block is refused. Read once at nemia start and frozen with the
                 run's steps, so a run in flight keeps the rules it was started with. A step on a remote
                 agent is not told them.
  nemia factory instruction says where the factory's instruction is kept, and prints it: what Nemia, who operates
                 the factory, is to know of it, read by her and told to no step. NEMIA.md in its first
                 folder — the first --repo it was filed with — unless its file names another path there
                 (--path <path>, relative, never climbing out), or the store (--store), in
                 factories/<name>/NEMIA.md beside its file. --clear goes back to NEMIA.md.
  nemia factory instruct writes the instruction the store keeps (--file <path>, - for stdin), or removes it
                 (--clear): only while the factory keeps its instruction in the store. A file in a
                 folder is edited there.
  nemia factory trust trusts a factory's places again, as nemia factory add does: for a factory filed before
                 places were trusted, one filed with --no-trust, or a trust taken back since.
  nemia factory rm  removes a factory's file, one that does not read included, then the instruction and the
                 rules the store keeps for it. A trust given to its places is left: its line said how to
                 take it back.

nemia start --factory <name> starts a run in a factory, of a workflow attached to it: each step its hires fill runs
as its agent, and the start is refused while a step names no agent and is hired none, or names its own agent
and is hired one too. Every run is started in a factory: with no --factory, in the one whose repository holds
--repo or the directory nemia start is typed in, and refused where none or two do; a card names its own, by its
factory: line or --factory. The default factory holds the history of runs and cards that named none, and an
agent's try; no start names it.

Refused by name, and nothing written: a name that is not a slug, the name default, an add with no --repo or
with a --repo that is not a directory, an add of a name already filed, an rm, trust, attach, detach, hire or fire of a
name with no factory, rules or an instruction of the default factory, rules that are blank or open with a
frontmatter block, two of --path, --store and --clear, a --path
that is empty, absolute or climbs out of the folder, an instruct of an instruction kept in a folder or of blank
words, a workflow's name that is empty, hidden, holds a slash or is agents or skills, a detach
of a workflow not attached, still hired into or scheduled, a schedule of a workflow not attached, of a cron or a zone
that does not read, or with an empty brief, an unschedule of a workflow not scheduled, a --step that is not <workflow>/<step>, a hire into a workflow
not attached or into a step whose file names its own agent:, and a fire of a step with no hire. A start in a factory of a workflow it has not attached is
refused, naming the attach.`;

/**
 * A factory's own MCP servers, kept beside it as `factories/<name>/servers.json`, not in its file: one entry per server, with the
 * server's wire facts and the facts of the OAuth client it signs in through, and never a secret. An agent's `mcp:` line resolves a
 * name against that record before the checkout's `.mcp.json`, and the record's servers are handed to a step's session inline, byte
 * for byte as `mcpServerOf` spells them, so the sign-in the harness filed is found. `nemia factory servers` lists them with the state
 * the harness reports; `server add` records a remote one and `server rm` takes one off (`servers/servers.verb.ts`).
 */

/** Why the api does not file, attach, detach or remove a factory: the board reads them, and the command line is their one writer. */
const WRITTEN_HERE = { side: 'cli', why: 'the board files, attaches to and removes no factory: nemia factory does' } as const;

/** The text under `key`: what the spec read there. */
const textOf = (args: Args, key: string): string => {
  const value = args[key];
  return typeof value === 'string' ? value : '';
};

/**
 * The listing every factory shares: those of the store, as `readFactories` reads them, their schedules as `schedulesListed` does, and
 * their places a harness does not trust now, as `untrustedPlaces` reads them.
 */
type Listed = { factories: FactoryListing[]; schedules: ScheduleListed[]; untrusted: Untrusted[] };

/** A run as a schedule's listing reads it: which fire of which schedule started it, and when the run was created. */
const scheduleRun = (run: Run): ScheduleRun => ({
  id: run.id,
  createdAt: run.createdAt,
  ...(run.scheduled === undefined ? {} : { scheduled: run.scheduled }),
});

/**
 * The store's factories, their schedules with the runs they started, and their places not trusted, each read now. A schedule reads of a
 * run only which fire started it and when (`scheduleRun`), so the records are read through `memo` where a caller that polls hands one
 * (`keptRuns`): a warm read of the board's factories reads no finished run's record. With none — the command line's — every record is
 * read, and the answer is the same.
 */
const listedNow = Effect.fn('listedNow')(function* (memo?: ScheduleRuns) {
  const { factories, schedules } = yield* tried(() => ({
    factories: readFactories(),
    schedules: schedulesListed(keptRuns(memo, scheduleRun)),
  }));
  return { factories, schedules, untrusted: yield* untrustedPlaces(factories) } satisfies Listed;
});

/** The lines `nemia factory` prints of the store's factories, and how to file one or remove one. */
const listed = ({ factories, schedules, untrusted }: Listed): string[] => [
  ...factoryLines(factories, schedules, Date.now(), untrusted),
  `\nfile one: nemia factory add <name> --repo <path> — remove one: nemia factory rm <name> — in ${factoriesDir()}`,
];

/** `nemia factory`: the default factory, then each in the store; a word it does not take is refused naming its nine forms. */
export const FACTORY: Command<Listed> = {
  name: 'factory',
  usage: '',
  help: [
    "the store's factories: the default first — every run and card that",
    'names no factory, read, never written — then each by name with its',
    'repositories (nemia factory --help)',
  ],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) =>
      `nemia factory does not take ${arg}. It lists the factories — nemia factory ls — files one with nemia factory add <name> --repo <path>, trusts its places again with nemia factory trust <name>, attaches a workflow with nemia factory attach <factory> <workflow>, detaches it with nemia factory detach <factory> <workflow>, hires an agent into a step with nemia factory hire <factory> <agent> --step <workflow>/<step>, fires it with nemia factory fire <factory> --step <workflow>/<step>, schedules a workflow's runs with nemia factory schedule <factory> <workflow> --cron <expr> --brief <text>, takes the schedule back with nemia factory unschedule <factory> <workflow>, writes the rules its agents are told with nemia factory rules <name> --file <path>, says where Nemia's instruction for it is kept with nemia factory instruction <name>, writes it with nemia factory instruct <name> --file <path>, and removes one with nemia factory rm <name> (nemia factory --help).`,
  },
  writes: false,
  nemia: 'read',
  route: { method: 'GET', path: '/api/factories', status: 200 },
  manual: FACTORY_HELP,
  handler: (_args, _env, _home, kept) => listedNow(kept?.records?.factories),
  print: listed,
};

/** `nemia factory ls`: the same listing, by its name. */
const FACTORY_LS: Command<Listed> = {
  name: 'factory ls',
  usage: '',
  help: ['the same, by its name'],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `nemia factory ls takes nothing, and was given ${arg}: nemia factory ls lists every factory.`,
  },
  writes: false,
  nemia: 'read',
  only: { side: 'cli', why: "the api lists the factories on nemia factory's route: ls is the command line's second name for it" },
  handler: (_args, _env, _home, kept) => listedNow(kept?.records?.factories),
  print: listed,
};

/** `--repo <path>`, once per repository a factory is filed with. */
const REPOS: Flag = {
  flag: '--repo',
  kind: 'text',
  key: 'repos',
  many: true,
  takes: "--repo takes a repository's directory: nemia factory add <name> --repo <path> [--repo <path> ...]",
};

/** `nemia factory add`'s spec: the factory's name, then `--repo` once per repository, and `--no-trust`. */
const ADD_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [REPOS, NO_TRUST],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory add does not take ${arg}. It takes the factory's name, then --repo <path>, once per repository, and --no-trust.`
      : `nemia factory add files one factory, and ${arg} is a second: nemia factory add <name> --repo <path>, once per factory.`,
  apart: () => REPOS.takes!,
  missing:
    "nemia factory add takes the factory's name, first: nemia factory add <name> --repo <path> [--repo <path> ...]. Nothing was filed.",
};

/**
 * `nemia factory add`: one factory filed, and where; then, unless `--no-trust`, each of its places trusted for the harnesses that keep
 * a trust (`trustPlaces`), and what was done of it.
 */
const FACTORY_ADD: Command<{ name: string; repos: readonly string[]; file: string; trusts: readonly PlaceTrust[] }> = {
  name: 'factory add',
  usage: '<name> --repo <path> [--repo <path> ...] [--no-trust]',
  help: ['file a factory: a lowercase slug naming one or more directories,', 'each trusted for its steps unless --no-trust'],
  spec: ADD_SPEC,
  check: (args) => leftOut(ADD_SPEC, args),
  writes: true,
  nemia: 'prompts',
  only: WRITTEN_HERE,
  handler: (args) =>
    Effect.gen(function* () {
      const repos = Array.isArray(args.repos) ? args.repos : [];
      const { factory, file } = yield* tried(() => addFactory({ name: textOf(args, 'name'), repos }));
      const trusts = args.noTrust === true ? [] : yield* trustPlaces(factory.repos);
      return { name: factory.name, repos: factory.repos, file, trusts };
    }),
  print: ({ name, repos, file, trusts }) => [`${name}  ${repos.join(', ')}`, `filed: ${file}`, ...trustedLines(name, trusts)],
};

/** `nemia factory attach`'s and `detach`'s spec: the factory, then the workflow, and no flag, refused as one wherever it stands. */
const workflowSpec = (verb: 'attach' | 'detach'): Spec => ({
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'workflow', takes: 'required', kind: 'name' },
  ],
  flags: [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory ${verb} does not take ${arg}. It takes the factory, then the workflow: nemia factory ${verb} <factory> <workflow>.`
      : `nemia factory ${verb} takes one workflow, and ${arg} is a second: nemia factory ${verb} <factory> <workflow>, once per workflow.`,
  missing: `nemia factory ${verb} takes the factory, then the workflow, by its folder's name: nemia factory ${verb} <factory> <workflow>. Nothing was ${verb}ed.`,
  flagFirst: true,
});

/** `nemia factory attach`: one workflow attached to one factory, or said to be attached already. */
const FACTORY_ATTACH: Command<{ file: string; already: boolean }> = {
  name: 'factory attach',
  usage: '<factory> <workflow>',
  help: ["offer a workflow in a factory, by its folder's name: a factory offers", 'only the workflows attached to it'],
  spec: workflowSpec('attach'),
  writes: true,
  nemia: 'prompts',
  only: WRITTEN_HERE,
  handler: (args) =>
    tried(() => {
      const { file, already } = attachWorkflow({ factory: textOf(args, 'factory'), workflow: textOf(args, 'workflow') });
      return { file, already: already === true };
    }),
  print: ({ file, already }, args) => [
    `${textOf(args, 'factory')}  ${already ? 'already attached' : 'attached'} ${textOf(args, 'workflow')}`,
    `${already ? 'unchanged' : 'attached'}: ${file}`,
  ],
};

/** `nemia factory detach`: one workflow taken from one factory. */
const FACTORY_DETACH: Command<{ file: string }> = {
  name: 'factory detach',
  usage: '<factory> <workflow>',
  help: ['take a workflow back, once no hire fills its steps'],
  spec: workflowSpec('detach'),
  writes: true,
  nemia: 'prompts',
  only: WRITTEN_HERE,
  handler: (args) => tried(() => detachWorkflow({ factory: textOf(args, 'factory'), workflow: textOf(args, 'workflow') })),
  print: ({ file }, args) => [`${textOf(args, 'factory')}  detached ${textOf(args, 'workflow')}`, `detached: ${file}`],
};

/** `nemia factory hire`'s and `fire`'s spec: `shape`, their positional arguments, then `--step <workflow>/<step>` once. */
function stepSpec(verb: 'hire' | 'fire', shape: string, missing: string): Spec {
  const step: Flag = {
    flag: '--step',
    kind: 'text',
    key: 'step',
    takes: `--step takes the step, as <workflow>/<step>: nemia factory ${verb} ${shape} --step build/implement`,
    twice: `nemia factory ${verb} takes --step once: one step at a time.`,
  };
  return {
    positionals: shape.split(' ').map((p) => ({ key: p.slice(1, -1), takes: 'required', kind: 'name' })),
    flags: [step],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory ${verb} does not take ${arg}. It takes ${shape}, then --step <workflow>/<step>.`
        : `nemia factory ${verb} takes ${shape}, and ${arg} is one more: nemia factory ${verb} ${shape} --step <workflow>/<step>, once per step.`,
    apart: () => step.takes!,
    missing,
  };
}

/** The refusal of `nemia factory hire` or `fire` given no step, or a step's value left out. */
const stepCheck =
  (verb: 'hire' | 'fire', shape: string, spec: Spec) =>
  (args: Args): string | null =>
    args.step === undefined
      ? `nemia factory ${verb} names the step with --step: nemia factory ${verb} ${shape} --step <workflow>/<step>. Nothing was ${verb}d.`
      : leftOut(spec, args);

const HIRE_SPEC = stepSpec(
  'hire',
  '<factory> <agent>',
  'nemia factory hire takes the factory, then the agent: nemia factory hire <factory> <agent> --step <workflow>/<step>. Nothing was hired.',
);

/** `nemia factory hire`: one agent hired into one step, and the agent it replaced, if any. */
const FACTORY_HIRE: Command<{ file: string; replaced: string | null }> = {
  name: 'factory hire',
  usage: '<factory> <agent> --step <workflow>/<step>',
  help: ["hire an agent into a workflow's step: one a step, a second replaces it"],
  spec: HIRE_SPEC,
  check: stepCheck('hire', '<factory> <agent>', HIRE_SPEC),
  writes: true,
  nemia: 'prompts',
  route: { method: 'PUT', path: '/api/factories/:factory/hires/:step', status: 200 },
  handler: (args, _env, home) =>
    tried(() => {
      const { file, replaced } = hireAgent({
        factory: textOf(args, 'factory'),
        agent: textOf(args, 'agent'),
        step: textOf(args, 'step'),
        ...(home !== undefined && { home }),
      });
      return { file, replaced: replaced ?? null };
    }),
  print: ({ file, replaced }, args) => [
    `${textOf(args, 'factory')}  ${textOf(args, 'step')} ← ${textOf(args, 'agent')}${replaced === null ? '' : ` (was ${replaced})`}`,
    `hired: ${file}`,
  ],
};

const FIRE_SPEC = stepSpec(
  'fire',
  '<factory>',
  'nemia factory fire takes the factory first: nemia factory fire <factory> --step <workflow>/<step>. Nothing was fired.',
);

/** `nemia factory fire`: one step's hire taken back. */
const FACTORY_FIRE: Command<{ file: string; fired: string }> = {
  name: 'factory fire',
  usage: '<factory> --step <workflow>/<step>',
  help: ["take a step's hire back"],
  spec: FIRE_SPEC,
  check: stepCheck('fire', '<factory>', FIRE_SPEC),
  writes: true,
  nemia: 'prompts',
  route: { method: 'DELETE', path: '/api/factories/:factory/hires/:step', status: 200 },
  handler: (args) => tried(() => fireAgent({ factory: textOf(args, 'factory'), step: textOf(args, 'step') })),
  print: ({ file, fired }, args) => [`${textOf(args, 'factory')}  ${textOf(args, 'step')}  fired ${fired}`, `fired: ${file}`],
};

/**
 * `nemia factory rm`: one factory's file removed, then the instruction the store keeps for it, its folder whole (`instruction`, null for
 * none). Refused as `removeFactory` refuses, before the folder is touched.
 */
const FACTORY_RM: Command<{ file: string; instruction: string | null }> = {
  name: 'factory rm',
  usage: '<name>',
  help: ["remove a factory's file, and the instruction and the rules the store", 'keeps for it'],
  spec: {
    positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia factory rm removes one factory, and ${arg} is a second: nemia factory rm <name>, once per factory.`,
    missing: 'nemia factory rm takes the name of the factory to remove, as nemia factory ls lists it: nemia factory rm <name>.',
  },
  writes: true,
  nemia: 'prompts',
  only: WRITTEN_HERE,
  handler: (args) =>
    tried(() => {
      const name = textOf(args, 'factory');
      const { file } = removeFactory(name);
      return { file, instruction: removeInstructionFolder(name) };
    }),
  print: ({ file, instruction }, args) => [
    `${textOf(args, 'factory')}  removed — ${file}`,
    ...(instruction === null ? [] : [`instruction removed: ${instruction}`]),
  ],
};

/** `nemia factory`'s entries, in the order `nemia`'s help lists them. */
export const FACTORIES: readonly Command[] = [
  FACTORY,
  FACTORY_LS,
  FACTORY_ADD,
  FACTORY_APPLY,
  FACTORY_PLAN,
  FACTORY_UPGRADE,
  FACTORY_RESOLVE,
  FACTORY_ATTACH,
  FACTORY_DETACH,
  FACTORY_HIRE,
  FACTORY_FIRE,
  FACTORY_SCHEDULE,
  FACTORY_UNSCHEDULE,
  FACTORY_SERVERS,
  FACTORY_SERVER_ADD,
  FACTORY_SERVER_RM,
  FACTORY_RULES,
  FACTORY_INSTRUCTION,
  FACTORY_INSTRUCT,
  FACTORY_TRUST,
  FACTORY_RM,
] as readonly Command[];
