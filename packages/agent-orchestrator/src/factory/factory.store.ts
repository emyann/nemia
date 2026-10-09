/**
 * The factories on disk: `$WF_ROOT/factories/<name>.json`, one file per factory, holding `{ "repos": [...], "workflows": [...], "hires":
 * {...} }` — read (`readFactories`, `readFactory`), filed (`addFactory`), given workflows and relieved of them (`attachWorkflow`,
 * `detachWorkflow`), hired into and fired from (`hireAgent`, `fireAgent`), told where its instruction is kept (`setInstruction`) and
 * removed (`removeFactory`). A person's verbs are their one writer; the judgement is `factory.ts`'s.
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports; `runner.ts` re-exports what the package exports of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Result, Schema } from 'effect';
import {
  ambiguousFactoryRefusal,
  defaultFactoryRefusal,
  defaultStartRefusal,
  DEFAULT_FACTORY,
  factoriesHolding,
  factoryNameRefusal,
  hireRefusal,
  hireRefusalOf,
  instructionPathRefusal,
  noFactoryLine,
  noFactoryRefusal,
  unattachedHireRefusal,
  workflowNameRefusal,
  type Factory,
  type FactoryListing,
  type FactoryTemplate,
  type FactoryWrite,
  type InstructionAt,
  type Schedule,
} from './factory.ts';
import { firesOf } from '../schedule/schedule.store.ts';
import { frontmatterKey } from '../former/former.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { firstRefusal, HOME, isDirectory } from '../record/record.store.ts';
import { readStatus, readTreeWiring, treeDir, writeTreeWiring } from '../applied/applied.store.ts';

/** Where the factories are: `$WF_ROOT/factories`, beside `runs/` and `inbox/`. The default factory has no file there. */
export const factoriesDir = (): string => path.join(HOME, 'factories');

/** A schedule as a factory's file holds it (`Schedule`), a key a later `nemia` writes beside its own kept. */
const ScheduleSchema = Schema.StructWithRest(
  Schema.Struct({
    cron: Schema.String,
    brief: Schema.String,
    repo: Schema.optionalKey(Schema.String),
    tz: Schema.optionalKey(Schema.String),
    since: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/**
 * A factory's file: at least one repository, each a string; the workflows attached to it, each by its folder's name, its hires, a
 * step's `<workflow>/<step>` to an agent's name, and its schedules, by workflow, when it has any, and where its instruction is kept, a path
 * or the store, when it says; and the template it was made from, when it was (`nemia factory apply`): its folder, its version and the
 * parameters given. A key a later `nemia` writes beside them is kept, not refused.
 */
const FactoryFileSchema = Schema.StructWithRest(
  Schema.Struct({
    repos: Schema.NonEmptyArray(Schema.String),
    workflows: Schema.optionalKey(Schema.Array(Schema.String)),
    hires: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    schedules: Schema.optionalKey(Schema.Record(Schema.String, ScheduleSchema)),
    instruction: Schema.optionalKey(Schema.Union([Schema.Struct({ path: Schema.String }), Schema.Struct({ store: Schema.Literal(true) })])),
    template: Schema.optionalKey(
      Schema.StructWithRest(
        Schema.Struct({
          source: Schema.String,
          version: Schema.String,
          params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
        }),
        [Schema.Record(Schema.String, Schema.Unknown)],
      ),
    ),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A factory's file as it reads, every key it holds kept, so a verb that writes it back drops none. */
type FactoryFile = typeof FactoryFileSchema.Type;

/** A factory's file where it is: what it holds, or why it does not read as a factory (`error`). */
type FileRead = { file: string } & ({ content: FactoryFile } | { error: string });

/**
 * The file of the factory `name`, read — or why it does not read as one: a name that is no slug, and `default.json`, since the default
 * factory is no file, are each to be removed by hand.
 */
function factoryFile(name: string): FileRead {
  const file = path.join(factoriesDir(), `${name}.json`);
  const badName = factoryNameRefusal(name);
  if (badName) return { file, error: `${badName} Remove the file by hand.` };
  if (name === DEFAULT_FACTORY)
    return {
      file,
      error: 'is no factory: the default factory is no file, and nemia factory rm does not take it. Remove this file by hand.',
    };
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return { file, error: `is not JSON (${(err as Error).message}): nemia factory rm ${name}, then add it again.` };
  }
  const decoded = Schema.decodeUnknownResult(FactoryFileSchema)(raw);
  if (Result.isSuccess(decoded)) return { file, content: decoded.success };
  const { path: where, words } = firstRefusal(raw, decoded.failure);
  const field = where.length ? `\`${where.map(String).join('.')}\`` : 'the whole';
  return { file, error: `does not read as a factory: ${field} ${words}. nemia factory rm ${name}, then add it again.` };
}

/** The workflows and hires of a templated factory `name`: its tree's, none while the tree is not rendered, or why they do not read. */
function treeWiringOf(name: string): Pick<Factory, 'workflows' | 'hires'> | { error: string } {
  const read = readTreeWiring(name);
  if ('absent' in read) return { workflows: [], hires: {} };
  return 'error' in read ? read : { workflows: read.wiring.workflows, hires: read.wiring.hires };
}

/**
 * The factory `name` its file's `content` says: none attached, hired or scheduled when the file names none, and where its instruction is
 * kept only when the file says. A factory made from a template reads its workflows and hires from its tree (`tree`), or why they do not
 * read; its schedules, from its file.
 */
function factoryOf(name: string, content: FactoryFile): Factory | { error: string } {
  const template = content.template;
  const wiring = template === undefined ? { workflows: content.workflows ?? [], hires: content.hires ?? {} } : treeWiringOf(name);
  if ('error' in wiring) return wiring;
  return {
    name,
    repos: content.repos,
    ...wiring,
    schedules: content.schedules ?? {},
    ...(content.instruction === undefined ? {} : { instruction: content.instruction }),
    ...(template === undefined ? {} : { template, tree: treeDir(name) }),
  };
}

/**
 * One entry of the folder as `nemia factory ls` lists it: the factory its file says, with what the controller last observed of it where it
 * is made from a template (`readStatus`), or why the file does not read as one.
 */
function factoryAt(file: string): FactoryListing {
  const name = file.slice(0, -'.json'.length);
  const read = factoryFile(name);
  const factory = 'error' in read ? read : factoryOf(name, read.content);
  if ('error' in factory) return { name, file: read.file, error: factory.error };
  if (factory.template === undefined) return { ...factory, file: read.file };
  const status = readStatus(name);
  return { ...factory, file: read.file, status: { applied: status?.version ?? null, conditions: status?.conditions ?? [] } };
}

/**
 * `nemia factory ls`: every factory in the store, its `.json` files by name — a hidden file, such as one `addFactory` is writing, left out
 * — each read as a factory or listed with why, so one bad file hides no other. None when there is no folder yet.
 */
export function readFactories(): FactoryListing[] {
  let names: string[];
  try {
    names = fs.readdirSync(factoriesDir());
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
    .sort()
    .map(factoryAt);
}

/**
 * The repositories a factory is given, each resolved from where `nemia` is typed, as `nemia start --repo` records one, and named once.
 * Refused, `Invalid`: none given, and any that is not a directory, every one named. A directory is enough: git is never asked.
 */
export function factoryRepos(name: string, given: readonly string[]): string[] {
  if (!given.length)
    throw new Invalid({
      message: `A factory names one repository at least, and none was given: nemia factory add ${name} --repo <path> [--repo <path> ...]. Nothing was filed.`,
    });
  const repos = [...new Set(given.map((r) => path.resolve(r)))];
  const missing = repos.filter((r) => !isDirectory(r));
  if (missing.length)
    throw new Invalid({
      message: `--repo names a directory, and ${missing.join(', ')} ${missing.length > 1 ? 'are not directories' : 'is not a directory'}. Give the path to each repository's directory. Nothing was filed.`,
    });
  return repos;
}

/** A name a verb that writes a factory refuses: not a slug (`Invalid`), or the default factory (`Conflict`). */
function refuseName(name: string, verb: FactoryWrite): void {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  if (name === DEFAULT_FACTORY) throw new Conflict({ message: defaultFactoryRefusal(verb) });
}

/**
 * `nemia factory add`, and `nemia factory apply` with the `template` it is made from: a factory filed as `<name>.json`, written whole to a
 * hidden file first and linked onto its name, which fails when the name is taken: no reader sees half a file, and two adds of one name
 * file one. Refused before anything is written: the name (`refuseName`) and the repositories (`factoryRepos`); and, the file already
 * there, `Conflict`, the file left as it was.
 */
export function addFactory(opts: { name: string; repos: readonly string[]; template?: FactoryTemplate }): {
  factory: Factory;
  file: string;
} {
  refuseName(opts.name, 'add');
  const repos = factoryRepos(opts.name, opts.repos);
  const template = opts.template;
  fs.mkdirSync(factoriesDir(), { recursive: true });
  const file = path.join(factoriesDir(), `${opts.name}.json`);
  const hidden = path.join(factoriesDir(), `.${opts.name}.json.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, `${JSON.stringify({ repos, ...(template === undefined ? {} : { template }) }, null, 2)}\n`);
    fs.linkSync(hidden, file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    throw new Conflict({
      message: `There is a factory ${opts.name} already, at ${file}, and it was left as it was. See it with nemia factory ls; to name other repositories, nemia factory rm ${opts.name}, then add it again.`,
    });
  } finally {
    fs.rmSync(hidden, { force: true });
  }
  const made = template === undefined ? {} : { template, tree: treeDir(opts.name) };
  return { factory: { name: opts.name, repos, workflows: [], hires: {}, schedules: {}, ...made }, file };
}

/** That the store has no factory `name`, naming those it has: `Missing`, with what was not done. */
const noFactory = (name: string, notDone: string): Missing =>
  new Missing({
    message: `${noFactoryLine(
      name,
      readFactories().map((f) => f.name),
    )} ${notDone}`,
  });

/**
 * `nemia factory rm`: a factory's file removed, one that does not read included, since removing it is its fix. Refused: the name
 * (`refuseName`), and a name with no factory (`Missing`), naming those there are.
 */
export function removeFactory(name: string): { file: string } {
  refuseName(name, 'rm');
  const file = path.join(factoriesDir(), `${name}.json`);
  try {
    fs.rmSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw noFactory(name, 'Nothing was removed.');
    throw Object.assign(
      new Error(
        `nemia factory rm: ${file} could not be removed — ${(err as Error).message}. Nothing was removed: remove the file by hand, or fix what stops it and remove it again.`,
      ),
      { exitCode: 1 },
    );
  }
  return { file };
}

/**
 * The factory `name`, as a run started in it reads it. Refused: a name that is no slug (`Invalid`), a name with no file (`Missing`, naming
 * the factories there are, then `notDone`, what the caller did not do), and a file that does not read as a factory (`Invalid`, quoting
 * why). The default factory is no file, and is never asked for here.
 */
export function readFactory(name: string, notDone = 'Nothing was started.'): Factory {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  const read = factoryFile(name);
  if (!fs.existsSync(read.file)) throw noFactory(name, notDone);
  if ('error' in read) throw new Invalid({ message: `the factory ${name}: ${read.file} ${read.error}` });
  const factory = factoryOf(name, read.content);
  if ('error' in factory) throw new Invalid({ message: `the factory ${name}: ${factory.error}` });
  return factory;
}

/**
 * The tree of the factory `name`, made from a template, for `who` to write into. Refused: the factory (`readFactory`); one not made from a
 * template (`Invalid`, naming yours); and a tree not rendered yet (`Conflict`, naming the daemon).
 */
export function templatedTree(name: string, who: string): string {
  const factory = readFactory(name, 'Nothing was written.');
  if (factory.tree === undefined)
    throw new Invalid({
      message: `${who}: the factory ${name} is not made from a template, so it has no tree to write; its workflows are its repositories' and yours. Write yours: \`${who} yours …\`. Nothing was written.`,
    });
  if (!fs.existsSync(factory.tree))
    throw new Conflict({
      message: `${who}: ${name} is made from a template, and its tree is not rendered yet, at ${factory.tree}: start the daemon, nemia up, and try again once nemia factory ls shows it applied. Nothing was written.`,
    });
  return factory.tree;
}

/**
 * The tree the factory `name` runs from, where it is made from a template (`treeDir`): where a bare workflow name is looked for first.
 * None for no name, an untemplated factory, and one that is not there or does not read: what is wrong with it is the start's to say.
 */
export function treeOf(name: string | undefined): string | undefined {
  if (name === undefined || factoryNameRefusal(name)) return undefined;
  const read = factoryFile(name);
  return 'error' in read || read.content.template === undefined ? undefined : treeDir(name);
}

/**
 * Whether a start may go to the default factory when it names none and no factory holds its folder, or when it starts a card that names
 * none: only with `WF_DEFAULT_FACTORY_STARTS=1`, which the package's and the api's tests set for the starts they make in scratch folders.
 * Unset, as shipped, every such start is refused.
 */
export const defaultStartsAllowed = (): boolean => process.env.WF_DEFAULT_FACTORY_STARTS === '1';

/** The store's factories that read, and the names of those whose file does not. */
function readable(): { factories: Factory[]; unread: string[] } {
  const listing = readFactories();
  return {
    factories: listing.flatMap((f) => ('error' in f ? [] : [f])),
    unread: listing.flatMap((f) => ('error' in f ? [f.name] : [])),
  };
}

/** The names of the store's factories that read, as a refusal offers them. */
export const factoryNames = (): string[] => readable().factories.map((f) => f.name);

/**
 * The factory a start of a workflow is made in, and, when it was found from the folder, the repository there (`repo`): the factory
 * `named`, read as a run reads it (`readFactory`), else the one factory of the store a repository of which holds the folder `at`
 * (`factoriesHolding`), with that repository; none, the default factory, only when none holds it and `defaultStartsAllowed`. `fix` is the
 * start's words for naming one, `<name>` in them: `--factory <name>`, or `?factory=<name>`.
 *
 * Refused, `Invalid`, before anything is written: the default factory named, whatever the environment (`defaultStartRefusal`); two or more
 * factories holding the folder (`ambiguousFactoryRefusal`); and none holding it (`noFactoryRefusal`). A factory whose file does not read is
 * not looked at, and the refusal of none names it.
 */
export function startFactory(named: string | undefined, at: string, fix: string): { factory?: Factory; repo?: string } {
  if (named === DEFAULT_FACTORY) throw new Invalid({ message: defaultStartRefusal(fix, factoryNames()) });
  if (named !== undefined) return { factory: readFactory(named) };
  const { factories, unread } = readable();
  const holding = factoriesHolding(factories, at);
  if (holding.length === 1) return holding[0];
  if (holding.length > 1) throw new Invalid({ message: ambiguousFactoryRefusal(at, holding, fix) });
  if (defaultStartsAllowed()) return {};
  throw new Invalid({
    message: noFactoryRefusal(
      at,
      factories.map((f) => f.name),
      fix,
      unread,
    ),
  });
}

/** What each verb that changes a factory's file does, as its refusals say it was not done. */
const DONE = {
  attach: 'attached',
  detach: 'detached',
  hire: 'hired',
  fire: 'fired',
  instruction: 'changed',
  instruct: 'written',
  schedule: 'scheduled',
  unschedule: 'unscheduled',
} as const;

/**
 * The file of the factory `name`, to be written back by `verb`. Refused: the name (`refuseName`), a name with no file (`Missing`), and a
 * file that does not read (`Invalid`), left as it is.
 */
function fileToChange(name: string, verb: Exclude<FactoryWrite, 'add' | 'rm'>): FileRead & { content: FactoryFile } {
  refuseName(name, verb);
  const read = factoryFile(name);
  if (!fs.existsSync(read.file)) throw noFactory(name, `Nothing was ${DONE[verb]}.`);
  if ('error' in read)
    throw new Invalid({ message: `the factory ${name}: ${read.file} ${read.error} It was left as it is, and nothing was changed.` });
  return read;
}

/** `content` written whole onto `file`: to a hidden file beside it first, then renamed onto it, so no reader sees half a file. */
function writeWhole(file: string, content: FactoryFile): void {
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, `${JSON.stringify(content, null, 2)}\n`);
    fs.renameSync(hidden, file);
  } finally {
    fs.rmSync(hidden, { force: true });
  }
}

/**
 * What a verb reads of a factory's wiring and how it writes it back: its file's, or, made from a template, its tree's; the folders
 * whose `workflows/<workflow>/` a start reads a step's own file from (`rootsOf`); and its schedules, its file's either way.
 */
type WiringChange = {
  file: string;
  rootsOf: (workflow: string) => readonly string[];
  wiring: Pick<Factory, 'workflows' | 'hires'>;
  schedules: Factory['schedules'];
  write: (wiring: Partial<Pick<Factory, 'workflows' | 'hires'>>) => void;
};

/**
 * The wiring of the factory `name`, to be written back by `verb`, with the folders a start reads its workflows from (`rootsOf`): its
 * file's, every other key kept; or, made from a template, its tree's `factory.json`, and the first of its tree, its repositories and
 * `home` that holds the workflow, as a start reads it by name. Refused: the factory (`fileToChange`); a tree not rendered yet
 * (`Conflict`, naming the daemon); and a tree's wiring that does not read (`Invalid`).
 */
function wiringToChange(name: string, verb: 'attach' | 'detach' | 'hire' | 'fire', home: string): WiringChange {
  const { file, content } = fileToChange(name, verb);
  if (content.template === undefined) {
    const wiring = { workflows: content.workflows ?? [], hires: content.hires ?? {} };
    const roots = [...content.repos, home];
    return { file, rootsOf: () => roots, wiring, schedules: content.schedules ?? {}, write: (w) => writeWhole(file, { ...content, ...w }) };
  }
  const read = readTreeWiring(name);
  const tree = treeDir(name);
  if ('absent' in read)
    throw new Conflict({
      message: `${name} is made from a template, and its tree is not rendered yet, at ${tree}: start the daemon, nemia up, and try again once nemia factory ls shows it applied. Nothing was ${DONE[verb]}.`,
    });
  if ('error' in read) throw new Invalid({ message: `the factory ${name}: ${read.error} Nothing was ${DONE[verb]}.` });
  const write = (w: Partial<Pick<Factory, 'workflows' | 'hires'>>) => writeTreeWiring(name, { ...read.wiring, ...w });
  const rootsOf = (workflow: string) => {
    const holder = [tree, ...content.repos, home].find((root) => fs.existsSync(path.join(path.resolve(root), 'workflows', workflow)));
    return holder === undefined ? [] : [holder];
  };
  return { file: path.join(tree, 'factory.json'), rootsOf, wiring: read.wiring, schedules: content.schedules ?? {}, write };
}

/**
 * The first file of the step `step` of `workflow` that names its own agent, and the agent it names: in each of `roots`' `workflows/`,
 * where a start in the factory reads a workflow by its name. A file that is not there or does not read names none.
 */
function ownAgentOf(roots: readonly string[], workflow: string, step: string): { named: string; file: string } | undefined {
  for (const root of roots) {
    const file = path.join(path.resolve(root), 'workflows', workflow, `${step}.md`);
    let named: string | undefined;
    try {
      named = frontmatterKey(fs.readFileSync(file, 'utf8'), 'agent');
    } catch {
      continue;
    }
    if (named !== undefined) return { named, file };
  }
  return undefined;
}

/**
 * `nemia factory hire`: the agent `agent` hired by the factory `factory` into the step `step`, `<workflow>/<step>` — the one agent of that
 * step, replacing an earlier hire, which is returned (`replaced`). Every other key of the file is kept. Refused before anything is written:
 * the factory (`fileToChange`), a step or an agent that is not one (`hireRefusal`, `Invalid`), a step of a workflow the factory has not
 * attached (`Invalid`, naming the attach), and a step whose own file names its agent in a repository of the factory's or in the store
 * `home`'s `workflows/` (`Conflict`, in `hireRefusalOf`'s words, then the file). Whether the workflow, its step and the agent exist is
 * judged when a run starts in the factory: a step with no file there takes a hire.
 */
export function hireAgent(opts: { factory: string; agent: string; step: string; home?: string }): { file: string; replaced?: string } {
  const bad = hireRefusal(opts.step, opts.agent);
  if (bad) throw new Invalid({ message: `${bad} Nothing was hired.` });
  const { file, rootsOf, wiring, write } = wiringToChange(opts.factory, 'hire', opts.home ?? HOME);
  const workflow = opts.step.slice(0, opts.step.indexOf('/'));
  if (!wiring.workflows.includes(workflow))
    throw new Invalid({ message: `${unattachedHireRefusal(opts.factory, workflow)} Nothing was hired.` });
  const own = ownAgentOf(rootsOf(workflow), workflow, opts.step.slice(workflow.length + 1));
  if (own)
    throw new Conflict({
      message: `${hireRefusalOf({ name: opts.factory, workflows: wiring.workflows }, workflow, own.named)} ${own.file} names it. Nothing was hired.`,
    });
  const replaced = wiring.hires[opts.step];
  write({ hires: { ...wiring.hires, [opts.step]: opts.agent } });
  return { file, ...(replaced !== undefined && replaced !== opts.agent ? { replaced } : {}) };
}

/**
 * `nemia factory fire`: the hire of the factory `factory` into the step `step` taken back, every other key of the file kept; returns the
 * agent it hired. Refused: the factory (`fileToChange`), and a step it hires no one into (`Missing`, naming its hires).
 */
export function fireAgent(opts: { factory: string; step: string }): { file: string; fired: string } {
  const { file, wiring, write } = wiringToChange(opts.factory, 'fire', HOME);
  const hires = { ...wiring.hires };
  const fired = hires[opts.step];
  if (fired === undefined) {
    const there = Object.keys(hires).sort();
    throw new Missing({
      message: `${opts.factory} hires no agent into ${opts.step}. ${there.length ? `It hires into: ${there.join(', ')}.` : 'It hires none.'} Nothing was fired.`,
    });
  }
  delete hires[opts.step];
  write({ hires });
  return { file, fired };
}

/** The workflow name `workflow` a verb is given, refused (`Invalid`) when it cannot name one (`workflowNameRefusal`). */
function refuseWorkflowName(workflow: string, verb: 'attach' | 'detach' | 'schedule' | 'unschedule'): void {
  const bad = workflowNameRefusal(workflow);
  if (bad) throw new Invalid({ message: `${bad} Nothing was ${DONE[verb]}.` });
}

/**
 * `nemia factory attach`: the workflow whose folder is named `workflow` attached to the factory `factory`, which then offers it; the file's
 * workflows kept sorted, each named once, and every other key kept. One already attached is not written again (`already`). Only the name
 * is stored: whether the workflow exists is judged when a run starts in the factory. Refused before anything is written: the name
 * (`workflowNameRefusal`, `Invalid`) and the factory (`fileToChange`).
 */
export function attachWorkflow(opts: { factory: string; workflow: string }): { file: string; already?: true } {
  refuseWorkflowName(opts.workflow, 'attach');
  const { file, wiring, write } = wiringToChange(opts.factory, 'attach', HOME);
  const workflows = wiring.workflows;
  if (workflows.includes(opts.workflow)) return { file, already: true };
  write({ workflows: [...workflows, opts.workflow].sort() });
  return { file };
}

/**
 * `nemia factory detach`: the workflow `workflow` taken from the factory `factory`, which then offers it no more; every other key kept.
 * Refused before anything is written: the name (`Invalid`), the factory (`fileToChange`), a workflow it has not attached (`Missing`, naming
 * those it has), one it still hires into (`Invalid`, naming the fire of each hire), and one it schedules (`Invalid`, naming the
 * unschedule), so no hire nor schedule outlives its workflow in the file.
 */
export function detachWorkflow(opts: { factory: string; workflow: string }): { file: string } {
  refuseWorkflowName(opts.workflow, 'detach');
  const { file, wiring, schedules, write } = wiringToChange(opts.factory, 'detach', HOME);
  const workflows = wiring.workflows;
  if (!workflows.includes(opts.workflow))
    throw new Missing({
      message: `${opts.factory} has not attached ${opts.workflow}. ${workflows.length ? `It offers: ${workflows.join(', ')}.` : 'It offers none.'} Nothing was detached.`,
    });
  const hired = Object.keys(wiring.hires)
    .filter((step) => step.startsWith(`${opts.workflow}/`))
    .sort();
  if (hired.length)
    throw new Invalid({
      message: `${opts.factory} hires into ${opts.workflow}'s steps: ${hired.join(', ')}. Fire each first — ${hired.map((step) => `nemia factory fire ${opts.factory} --step ${step}`).join('; ')} — then detach it. Nothing was detached.`,
    });
  if (schedules[opts.workflow])
    throw new Invalid({
      message: `${opts.factory} schedules ${opts.workflow}: unschedule it first — nemia factory unschedule ${opts.factory} ${opts.workflow} — then detach it. Nothing was detached.`,
    });
  write({ workflows: workflows.filter((w) => w !== opts.workflow) });
  return { file };
}

/**
 * `nemia factory instruction`: where the instruction of the factory `factory` is kept, written into its file — a path in its first folder,
 * kept as `path.normalize` spells it, or the store — or, `at` undefined, the key removed, so the factory reads `NEMIA.md` in its first
 * folder again. Every other key of the file is kept. Refused before anything is written: a path that is not one (`instructionPathRefusal`,
 * `Invalid`) and the factory (`fileToChange`).
 */
export function setInstruction(opts: { factory: string; at: InstructionAt | undefined }): { file: string } {
  const at = opts.at;
  if (at !== undefined && 'path' in at) {
    const bad = instructionPathRefusal(at.path);
    if (bad) throw new Invalid({ message: `${bad} Nothing was changed.` });
  }
  const { file, content } = fileToChange(opts.factory, 'instruction');
  if (content.template !== undefined)
    throw new Invalid({
      message: `${opts.factory} is made from a template, and its instruction is its tree's NEMIA.md, at ${path.join(treeDir(opts.factory), 'NEMIA.md')}: write it with nemia factory instruct ${opts.factory} --file <path>. Nothing was changed.`,
    });
  const { instruction: _was, ...rest } = content;
  const kept = at === undefined ? undefined : 'path' in at ? { path: path.normalize(at.path) } : { store: true as const };
  writeWhole(file, kept === undefined ? rest : { ...rest, instruction: kept });
  return { file };
}

/**
 * Why the schedule `opts` cannot be written into `factory`, or undefined: a workflow it has not attached, naming the attach; a cron or zone
 * `Cron` does not read, or a cron that never fires, quoting it (`firesOf`); an empty brief; a repository that is not one of the factory's;
 * and none named in a factory of two or more, where a scheduled start would not know which.
 */
function scheduleRefusal(
  factory: Factory,
  opts: { workflow: string; cron: string; brief: string; repo?: string; tz?: string },
): string | undefined {
  if (!factory.workflows.includes(opts.workflow))
    return `${factory.name} does not offer the workflow ${opts.workflow}, so it schedules none of its runs. Attach it first — nemia factory attach ${factory.name} ${opts.workflow} — then schedule it.`;
  const fires = firesOf(opts, Date.now());
  if ('error' in fires) return `--cron ${JSON.stringify(opts.cron)}${opts.tz ? ` --tz ${opts.tz}` : ''}: ${fires.error}.`;
  if (!opts.brief.trim()) return 'A scheduled run is asked what --brief says, and it is empty: give the brief its runs start with.';
  const repos = factory.repos.map((r) => path.resolve(r)).sort();
  if (opts.repo === undefined ? repos.length > 1 : !repos.includes(path.resolve(opts.repo)))
    return `${opts.repo === undefined ? '' : `${opts.repo}: `}${factory.name} works on ${repos.join(', ')}: name the one its scheduled runs work on with --repo.`;
  return undefined;
}

/**
 * `nemia factory schedule`: the schedule of the workflow `workflow` written into the factory `factory`'s file, stamped with when it was
 * written (`since`), so it starts nothing until its next fire; one already there is replaced (`replaced`), and every other key kept.
 * Refused before anything is written: the name (`workflowNameRefusal`, `Invalid`), the factory (`fileToChange`), a templated one whose
 * tree's wiring does not read (`Invalid`), and what `scheduleRefusal` refuses (`Invalid`).
 */
export function setSchedule(opts: { factory: string; workflow: string; cron: string; brief: string; repo?: string; tz?: string }): {
  file: string;
  schedule: Schedule;
  replaced?: Schedule;
} {
  refuseWorkflowName(opts.workflow, 'schedule');
  const { file, content } = fileToChange(opts.factory, 'schedule');
  const factory = factoryOf(opts.factory, content);
  if ('error' in factory) throw new Invalid({ message: `the factory ${opts.factory}: ${factory.error} Nothing was scheduled.` });
  const bad = scheduleRefusal(factory, opts);
  if (bad) throw new Invalid({ message: `${bad} Nothing was scheduled.` });
  const schedule: Schedule = {
    cron: opts.cron,
    brief: opts.brief,
    ...(opts.repo === undefined ? {} : { repo: path.resolve(opts.repo) }),
    ...(opts.tz === undefined ? {} : { tz: opts.tz }),
    since: new Date().toISOString(),
  };
  const replaced = content.schedules?.[opts.workflow];
  writeWhole(file, { ...content, schedules: { ...content.schedules, [opts.workflow]: schedule } });
  return { file, schedule, ...(replaced ? { replaced } : {}) };
}

/**
 * `nemia factory unschedule`: the schedule of the workflow `workflow` taken from the factory `factory`'s file, every other key kept.
 * Refused before anything is written: the name (`Invalid`), the factory (`fileToChange`), and a workflow it does not schedule (`Missing`,
 * naming those it does).
 */
export function clearSchedule(opts: { factory: string; workflow: string }): { file: string; cleared: Schedule } {
  refuseWorkflowName(opts.workflow, 'unschedule');
  const { file, content } = fileToChange(opts.factory, 'unschedule');
  const { [opts.workflow]: cleared, ...schedules } = content.schedules ?? {};
  if (!cleared) {
    const names = Object.keys(schedules).sort();
    throw new Missing({
      message: `${opts.factory} does not schedule ${opts.workflow}. ${names.length ? `It schedules: ${names.join(', ')}.` : 'It schedules none.'} Nothing was unscheduled.`,
    });
  }
  writeWhole(file, { ...content, schedules });
  return { file, cleared };
}
