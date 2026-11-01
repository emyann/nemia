/**
 * The factories on disk: `<home>/factories/<name>.json`, one file per factory, holding `{ "repos": [...], "workflows": [...], "hires":
 * {...} }` — read (`readFactoriesAt`, `readFactoryAt`), filed (`addFactoryAt`, `createFactoryAt`), written back (`rewriteFactoryAt`),
 * given workflows and relieved of them (`attachWorkflowAt`, `detachWorkflowAt`), hired into and fired from (`hireAgentAt`,
 * `fireAgentAt`), told where its instruction is kept (`setInstructionAt`) and whether its runs follow merged revisions
 * (`setRevisionsAt`), and removed (`removeFactoryAt`). Each takes the store's root, `home`, first: the Factory door's files layer
 * (`factories.store.ts`) is over them. A person's verbs are their one writer; the judgement is `factory.ts`'s words and `wiring.ts`'s
 * decision.
 *
 * The old spellings, which take no root (`readFactory`, `hireAgent`, …), are each the function `At` the module's root (`atHome`), for the
 * callers not yet on the Factory door (`test/factory-door.baseline.ts`).
 *
 * Beneath the controllers, beside `record.store.ts`, the one store file it imports; `runner.ts` re-exports what the package exports of it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Result, Schema } from 'effect';
import {
  ambiguousFactoryRefusal,
  takenFactoryRefusal,
  unhiredFireRefusal,
  unrenderedTreeRefusal,
  unscheduledRefusal,
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
  REVISIONS_POLICIES,
  workflowNameRefusal,
  type Factory,
  type FactoryListing,
  type FactoryTemplate,
  type FactoryWrite,
  type InstructionAt,
  type RevisionsPolicy,
  type Schedule,
} from './factory.ts';
import { firesOf } from '../schedule/schedule.store.ts';
import { frontmatterKey } from '../former/former.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { firstRefusal, HOME, isDirectory } from '../record/record.store.ts';
import { readStatusAt, readTreeWiringAt, treeDirAt, writeTreeWiringAt } from '../applied/applied.store.ts';
import { rewired, wiringRefusal, type WiringChange } from './wiring.ts';

/** Where the factories of the store `home` are: `<home>/factories`, beside `runs/` and `inbox/`. The default factory has no file there. */
export const factoriesDirAt = (home: string): string => path.join(home, 'factories');

/** The file the factory `name` is kept in, in the store `home`, whether or not it is there. */
const fileAt = (home: string, name: string): string => path.join(factoriesDirAt(home), `${name}.json`);

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
 * or the store, when it says; whether its runs follow merged revisions, `follow` or `pinned`, when it says (a templated factory says it
 * in its tree's wiring, and this key is not read); and the template it was made from, when it was (`nemia factory apply`): its folder,
 * its version and the parameters given. A key a later `nemia` writes beside them is kept, not refused.
 */
const FactoryFileSchema = Schema.StructWithRest(
  Schema.Struct({
    repos: Schema.NonEmptyArray(Schema.String),
    workflows: Schema.optionalKey(Schema.Array(Schema.String)),
    hires: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    schedules: Schema.optionalKey(Schema.Record(Schema.String, ScheduleSchema)),
    instruction: Schema.optionalKey(Schema.Union([Schema.Struct({ path: Schema.String }), Schema.Struct({ store: Schema.Literal(true) })])),
    revisions: Schema.optionalKey(Schema.Literals(REVISIONS_POLICIES)),
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
function factoryFile(home: string, name: string): FileRead {
  const file = fileAt(home, name);
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

/**
 * The workflows, hires and revisions policy of a templated factory `name`: its tree's, none while the tree is not rendered, or why they
 * do not read.
 */
function treeWiringOf(home: string, name: string): Pick<Factory, 'workflows' | 'hires' | 'revisions'> | { error: string } {
  const read = readTreeWiringAt(home, name);
  if ('absent' in read) return { workflows: [], hires: {} };
  if ('error' in read) return read;
  const { workflows, hires, revisions } = read.wiring;
  return { workflows, hires, ...(revisions === undefined ? {} : { revisions }) };
}

/**
 * The factory `name` its file's `content` says: none attached, hired or scheduled when the file names none, and where its instruction is
 * kept and whether its runs follow merged revisions only when the file says. A factory made from a template reads its workflows, hires
 * and revisions policy from its tree (`tree`), or why they do not read; its schedules, from its file.
 */
function factoryOf(home: string, name: string, content: FactoryFile): Factory | { error: string } {
  const template = content.template;
  const own = content.revisions === undefined ? {} : { revisions: content.revisions };
  const wiring =
    template === undefined ? { workflows: content.workflows ?? [], hires: content.hires ?? {}, ...own } : treeWiringOf(home, name);
  if ('error' in wiring) return wiring;
  return {
    name,
    repos: content.repos,
    ...wiring,
    schedules: content.schedules ?? {},
    ...(content.instruction === undefined ? {} : { instruction: content.instruction }),
    ...(template === undefined ? {} : { template, tree: treeDirAt(home, name) }),
  };
}

/**
 * One entry of the folder as `nemia factory ls` lists it: the factory its file says, with what the controller last observed of it where it
 * is made from a template (`readStatus`), or why the file does not read as one.
 */
function factoryAt(home: string, file: string): FactoryListing {
  const name = file.slice(0, -'.json'.length);
  const read = factoryFile(home, name);
  const factory = 'error' in read ? read : factoryOf(home, name, read.content);
  if ('error' in factory) return { name, file: read.file, error: factory.error };
  if (factory.template === undefined) return { ...factory, file: read.file };
  const status = readStatusAt(home, name);
  return { ...factory, file: read.file, status: { applied: status?.version ?? null, conditions: status?.conditions ?? [] } };
}

/**
 * `nemia factory ls`: every factory in the store, its `.json` files by name — a hidden file, such as one `addFactory` is writing, left out
 * — each read as a factory or listed with why, so one bad file hides no other. None when there is no folder yet.
 */
export function readFactoriesAt(home: string): FactoryListing[] {
  let names: string[];
  try {
    names = fs.readdirSync(factoriesDirAt(home));
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json') && !n.startsWith('.'))
    .sort()
    .map((file) => factoryAt(home, file));
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
export function refuseName(name: string, verb: FactoryWrite): void {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  if (name === DEFAULT_FACTORY) throw new Conflict({ message: defaultFactoryRefusal(verb) });
}

/**
 * `nemia factory add`, and `nemia factory apply` with the `template` it is made from: a factory filed in the store `home` as
 * `<name>.json` (`createFactoryAt`). Refused before anything is written: the name (`refuseName`) and the repositories (`factoryRepos`);
 * and, the file already there, `Conflict`, the file left as it was.
 */
export function addFactoryAt(
  home: string,
  opts: { name: string; repos: readonly string[]; template?: FactoryTemplate },
): { factory: Factory; file: string } {
  refuseName(opts.name, 'add');
  const repos = factoryRepos(opts.name, opts.repos);
  const template = opts.template;
  const made = template === undefined ? {} : { template, tree: treeDirAt(home, opts.name) };
  const factory: Factory = { name: opts.name, repos, workflows: [], hires: {}, schedules: {}, ...made };
  return { factory, file: createFactoryAt(home, factory) };
}

/**
 * The factory `factory` filed in the store `home`, its file written whole to a hidden file first and linked onto its name, which fails
 * when the name is taken: no reader sees half a file, and two creates of one name file one. Its file holds what the factory says, a
 * workflow, hire or schedule key only where it names one. Refused: a name taken (`Conflict`, the file left as it was), and a templated
 * factory given workflows, hires or a revisions policy, which its tree holds and is not rendered yet (`Conflict`). The name and the
 * factory's invariants are its caller's to check.
 */
export function createFactoryAt(home: string, factory: Factory): string {
  if (factory.template !== undefined && (factory.workflows.length || Object.keys(factory.hires).length || factory.revisions !== undefined))
    throw new Conflict({ message: unrenderedTreeRefusal(factory.name, treeDirAt(home, factory.name), 'Nothing was filed.') });
  fs.mkdirSync(factoriesDirAt(home), { recursive: true });
  const file = fileAt(home, factory.name);
  const hidden = path.join(factoriesDirAt(home), `.${factory.name}.json.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, `${JSON.stringify(fileContentOf(undefined, factory), null, 2)}\n`);
    fs.linkSync(hidden, file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    throw new Conflict({ message: takenFactoryRefusal(factory.name, file) });
  } finally {
    fs.rmSync(hidden, { force: true });
  }
  return file;
}

/**
 * What the file of `factory` holds, written over `content`, what it held, every key the model does not name kept where it was: its
 * repositories; its workflows, hires and schedules where the file named the key or the factory names one (made from a template, its
 * workflows, hires and revisions policy are its tree's, and the file's are left as they were); where its instruction is kept and its
 * revisions policy where it says, the key gone where it does not; and its template, the keys a later `nemia` wrote beside it kept.
 */
function fileContentOf(content: FactoryFile | undefined, factory: Factory): FactoryFile {
  const next: Record<string, unknown> = { ...content, repos: factory.repos };
  const named = (key: string, value: unknown, some: boolean) => {
    if (some || (content !== undefined && key in content)) next[key] = value;
  };
  const kept = (key: string, value: unknown) => {
    if (value === undefined) delete next[key];
    else next[key] = value;
  };
  if ((content?.template ?? factory.template) === undefined) {
    named('workflows', factory.workflows, factory.workflows.length > 0);
    named('hires', factory.hires, Object.keys(factory.hires).length > 0);
    kept('revisions', factory.revisions);
  }
  named('schedules', factory.schedules, Object.keys(factory.schedules).length > 0);
  kept('instruction', factory.instruction);
  kept('template', factory.template === undefined ? undefined : { ...content?.template, ...factory.template });
  return next as FactoryFile;
}

/** That the store has no factory `name`, naming those it has: `Missing`, with what was not done. */
const noFactory = (home: string, name: string, notDone: string): Missing =>
  new Missing({
    message: `${noFactoryLine(
      name,
      readFactoriesAt(home).map((f) => f.name),
    )} ${notDone}`,
  });

/**
 * `nemia factory rm`: a factory's file removed, one that does not read included, since removing it is its fix. Refused: the name
 * (`refuseName`), and a name with no factory (`Missing`), naming those there are.
 */
export function removeFactoryAt(home: string, name: string): { file: string } {
  refuseName(name, 'rm');
  const file = fileAt(home, name);
  try {
    fs.rmSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw noFactory(home, name, 'Nothing was removed.');
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
export function readFactoryAt(home: string, name: string, notDone = 'Nothing was started.'): Factory {
  const bad = factoryNameRefusal(name);
  if (bad) throw new Invalid({ message: bad });
  const read = factoryFile(home, name);
  if (!fs.existsSync(read.file)) throw noFactory(home, name, notDone);
  if ('error' in read) throw new Invalid({ message: `the factory ${name}: ${read.file} ${read.error}` });
  const factory = factoryOf(home, name, read.content);
  if ('error' in factory) throw new Invalid({ message: `the factory ${name}: ${factory.error}` });
  return factory;
}

/**
 * The tree of the factory `name`, made from a template, for `who` to write into. Refused: the factory (`readFactory`); one not made from a
 * template (`Invalid`, naming yours); and a tree not rendered yet (`Conflict`, naming the daemon).
 */
export function templatedTreeAt(home: string, name: string, who: string): string {
  const factory = readFactoryAt(home, name, 'Nothing was written.');
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
export function treeOfAt(home: string, name: string | undefined): string | undefined {
  if (name === undefined || factoryNameRefusal(name)) return undefined;
  const read = factoryFile(home, name);
  return 'error' in read || read.content.template === undefined ? undefined : treeDirAt(home, name);
}

/**
 * Whether a start may go to the default factory when it names none and no factory holds its folder, or when it starts a card that names
 * none: only with `WF_DEFAULT_FACTORY_STARTS=1`, which the package's and the api's tests set for the starts they make in scratch folders.
 * Unset, by default, every such start is refused.
 */
export const defaultStartsAllowed = (): boolean => process.env.WF_DEFAULT_FACTORY_STARTS === '1';

/** The store's factories that read, and the names of those whose file does not. */
function readable(home: string): { factories: Factory[]; unread: string[] } {
  const listing = readFactoriesAt(home);
  return {
    factories: listing.flatMap((f) => ('error' in f ? [] : [f])),
    unread: listing.flatMap((f) => ('error' in f ? [f.name] : [])),
  };
}

/** The names of the store's factories that read, as a refusal offers them. */
export const factoryNamesAt = (home: string): string[] => readable(home).factories.map((f) => f.name);

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
export function startFactoryAt(home: string, named: string | undefined, at: string, fix: string): { factory?: Factory; repo?: string } {
  if (named === DEFAULT_FACTORY) throw new Invalid({ message: defaultStartRefusal(fix, factoryNamesAt(home)) });
  if (named !== undefined) return { factory: readFactoryAt(home, named) };
  const { factories, unread } = readable(home);
  const holding = factoriesHolding(factories, at);
  const [only] = holding;
  if (holding.length === 1 && only !== undefined) return only;
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
  revisions: 'changed',
  schedule: 'scheduled',
  unschedule: 'unscheduled',
  upgrade: 'upgraded',
} as const;

/** A verb that writes a factory back. */
type Rewrite = keyof typeof DONE;

/** `content` written whole onto `file`: to a hidden file beside it first, then renamed onto it, so no reader sees half a file. */
function writeWhole(file: string, content: unknown): void {
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, `${JSON.stringify(content, null, 2)}\n`);
    fs.renameSync(hidden, file);
  } finally {
    fs.rmSync(hidden, { force: true });
  }
}

/** The wiring a factory's tree holds, as its workflows, hires and revisions policy, for telling whether a rewrite changes it. */
const wiringKey = (wiring: Pick<Factory, 'workflows' | 'hires' | 'revisions'>): string =>
  JSON.stringify([[...wiring.workflows].sort(), wiring.hires, wiring.revisions ?? null]);

/** The file a factory's wiring is kept in: its tree's `factory.json` where it is made from a template, else its own file. */
const wiringFileAt = (home: string, factory: Factory): string =>
  factory.template === undefined ? fileAt(home, factory.name) : path.join(treeDirAt(home, factory.name), 'factory.json');

/**
 * The factory `factory` written back into the store `home`, the file it was read from: its file, every key the model does not name
 * kept (`fileContentOf`), and, made from a template, its workflows, hires and revisions policy into its tree's wiring (`factory.json`),
 * every other key of that kept. A file or a wiring that says what it said already is not written again. Returns the file of what
 * changed: the tree's wiring where that did, else the factory's file. Refused: a factory with no file (`Missing`, then `notDone`), a
 * file or a tree's wiring that does not read (`Invalid`), and a tree's wiring to change before the tree is rendered (`Conflict`). The
 * name and the factory's invariants are its caller's to check.
 */
export function rewriteFactoryAt(home: string, factory: Factory, notDone = 'Nothing was written.'): string {
  const { name } = factory;
  const read = factoryFile(home, name);
  if (!fs.existsSync(read.file)) throw noFactory(home, name, notDone);
  if ('error' in read)
    throw new Invalid({ message: `the factory ${name}: ${read.file} ${read.error} It was left as it is, and nothing was changed.` });
  const content = read.content;
  let changed = read.file;
  if ((content.template ?? factory.template) !== undefined) {
    const tree = readTreeWiringAt(home, name);
    if ('error' in tree) throw new Invalid({ message: `the factory ${name}: ${tree.error} ${notDone}` });
    const was = 'absent' in tree ? { workflows: [], hires: {} } : tree.wiring;
    const { revisions: _was, ...rest } = was;
    const next = {
      ...rest,
      workflows: factory.workflows,
      hires: factory.hires,
      ...(factory.revisions === undefined ? {} : { revisions: factory.revisions }),
    };
    if (wiringKey(was) !== wiringKey(next)) {
      if ('absent' in tree) throw new Conflict({ message: unrenderedTreeRefusal(name, treeDirAt(home, name), notDone) });
      writeTreeWiringAt(home, name, next);
      changed = path.join(treeDirAt(home, name), 'factory.json');
    }
  }
  const after = fileContentOf(content, factory);
  if (JSON.stringify(after) !== JSON.stringify(content)) writeWhole(read.file, after);
  return changed;
}

/**
 * The factory `name` of the store `home`, as `verb` changes it. Refused: the name (`refuseName`), and the factory (`readFactoryAt`,
 * `notDone` naming the verb).
 */
function toChange(home: string, name: string, verb: Rewrite): Factory {
  refuseName(name, verb);
  return readFactoryAt(home, name, `Nothing was ${DONE[verb]}.`);
}

/**
 * The folders whose `workflows/<workflow>/` a start in `factory` reads a step's own file from, in the store `home`: its repositories and
 * `home`; made from a template, the first of its tree, its repositories and `home` that holds the workflow, as a start reads it by name.
 */
function rootsOf(home: string, factory: Factory, workflow: string): readonly string[] {
  if (factory.tree === undefined) return [...factory.repos, home];
  const holder = [factory.tree, ...factory.repos, home].find((root) => fs.existsSync(path.join(path.resolve(root), 'workflows', workflow)));
  return holder === undefined ? [] : [holder];
}

/**
 * The first file of the step `step` of `workflow` that names its own agent, and the agent it names: in each of `roots`' `workflows/`,
 * where a start in the factory reads a workflow by its name. A file that is not there or does not read names none.
 */
export function ownAgentOf(roots: readonly string[], workflow: string, step: string): { named: string; file: string } | undefined {
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
 * The refusal a hire into `step` meets on disk, where its own file, in a folder a start in `factory` reads, names its agent: `Conflict`,
 * in `hireRefusalOf`'s words, then the file. What `wiringRefusal` cannot judge, since it reads no disk.
 */
export function ownAgentRefusal(home: string, factory: Factory, step: string): Conflict | undefined {
  const workflow = step.slice(0, step.indexOf('/'));
  const own = ownAgentOf(rootsOf(home, factory, workflow), workflow, step.slice(workflow.length + 1));
  if (own === undefined) return undefined;
  return new Conflict({ message: `${hireRefusalOf(factory, workflow, own.named)} ${own.file} names it. Nothing was hired.` });
}

/**
 * What a change of the wiring of the factory `name` is refused by before the factory is read, each `Invalid` in the words
 * `wiringRefusal` says it, or the default factory a `Conflict`: a step or an agent that cannot be a hire, a workflow's name that cannot
 * be one, and a factory's name (`refuseName`).
 */
export function wiringNamesRefused(name: string, change: WiringChange): void {
  if (change.verb !== 'fire') {
    const bad = change.verb === 'hire' ? hireRefusal(change.step, change.agent) : workflowNameRefusal(change.workflow);
    if (bad) throw new Invalid({ message: `${bad} Nothing was ${DONE[change.verb]}.` });
  }
  refuseName(name, change.verb);
}

/**
 * `factory` after `change`, refused before anything is written: a templated factory's tree not rendered yet, where the change is to
 * its workflows or hires (`Conflict`); what `wiringRefusal` refuses; and what `onDisk` refuses of it — a fact of the disk or the clock.
 */
export function wiringChecked(
  factory: Factory,
  change: WiringChange,
  onDisk: (factory: Factory) => Error | undefined = () => undefined,
): Factory {
  const tree = factory.tree;
  if (tree !== undefined && change.verb !== 'schedule' && change.verb !== 'unschedule' && !fs.existsSync(path.join(tree, 'factory.json')))
    throw new Conflict({ message: unrenderedTreeRefusal(factory.name, tree, `Nothing was ${DONE[change.verb]}.`) });
  const judged = wiringRefusal(factory, change);
  if (judged) throw judged.kind === 'Missing' ? new Missing({ message: judged.message }) : new Invalid({ message: judged.message });
  const bad = onDisk(factory);
  if (bad) throw bad;
  return rewired(factory, change);
}

/**
 * The factory `name` of the store `home`, changed by `change` and written back: what it was, what it is, and the file written. Refused
 * before anything is written: the names (`wiringNamesRefused`), the factory (`readFactoryAt`), and what `wiringChecked` refuses.
 */
function wiredAt(
  home: string,
  name: string,
  change: WiringChange,
  onDisk?: (factory: Factory) => Error | undefined,
): { was: Factory; now: Factory; file: string } {
  wiringNamesRefused(name, change);
  const notDone = `Nothing was ${DONE[change.verb]}.`;
  const was = readFactoryAt(home, name, notDone);
  const now = wiringChecked(was, change, onDisk);
  if (now === was) return { was, now, file: wiringFileAt(home, was) };
  return { was, now, file: rewriteFactoryAt(home, now, notDone) };
}

/**
 * `nemia factory hire`: the agent `agent` hired by the factory `factory` into the step `step`, `<workflow>/<step>` — the one agent of that
 * step, replacing an earlier hire, which is returned (`replaced`). Every other key of the file is kept. Refused before anything is written:
 * a step or an agent that is not one (`hireRefusal`, `Invalid`), the factory (`toChange`), a step of a workflow the factory has not
 * attached (`wiringRefusal`, `Invalid`), and a step whose own file names its agent in a repository of the factory's or in the store
 * `home`'s `workflows/` (`ownAgentRefusal`, `Conflict`). Whether the workflow, its step and the agent exist is judged when a run starts in
 * the factory: a step with no file there takes a hire.
 */
export function hireAgentAt(
  home: string,
  opts: { factory: string; agent: string; step: string; home?: string },
): { file: string; replaced?: string } {
  const { was, file } = wiredAt(home, opts.factory, { verb: 'hire', step: opts.step, agent: opts.agent }, (factory) =>
    ownAgentRefusal(opts.home ?? home, factory, opts.step),
  );
  const replaced = was.hires[opts.step];
  return { file, ...(replaced !== undefined && replaced !== opts.agent ? { replaced } : {}) };
}

/**
 * `nemia factory fire`: the hire of the factory `factory` into the step `step` taken back, every other key of the file kept; returns the
 * agent it hired. Refused: the factory (`toChange`), and a step it hires no one into (`Missing`, naming its hires).
 */
export function fireAgentAt(home: string, opts: { factory: string; step: string }): { file: string; fired: string } {
  const { was, file } = wiredAt(home, opts.factory, { verb: 'fire', step: opts.step });
  const fired = was.hires[opts.step];
  if (fired === undefined) throw new Missing({ message: unhiredFireRefusal(opts.factory, opts.step, was.hires) });
  return { file, fired };
}

/**
 * `nemia factory attach`: the workflow whose folder is named `workflow` attached to the factory `factory`, which then offers it; the file's
 * workflows kept sorted, each named once, and every other key kept. One already attached is not written again (`already`). Only the name
 * is stored: whether the workflow exists is judged when a run starts in the factory. Refused before anything is written: the name
 * (`workflowNameRefusal`, `Invalid`) and the factory (`toChange`).
 */
export function attachWorkflowAt(home: string, opts: { factory: string; workflow: string }): { file: string; already?: true } {
  const { was, now, file } = wiredAt(home, opts.factory, { verb: 'attach', workflow: opts.workflow });
  return now === was ? { file, already: true } : { file };
}

/**
 * `nemia factory detach`: the workflow `workflow` taken from the factory `factory`, which then offers it no more; every other key kept.
 * Refused before anything is written: the name (`Invalid`), the factory (`toChange`), and what `wiringRefusal` refuses — a workflow it
 * has not attached (`Missing`), one it still hires into or schedules (`Invalid`) — so no hire nor schedule outlives its workflow.
 */
export function detachWorkflowAt(home: string, opts: { factory: string; workflow: string }): { file: string } {
  return { file: wiredAt(home, opts.factory, { verb: 'detach', workflow: opts.workflow }).file };
}

/**
 * `nemia factory instruction`: where the instruction of the factory `factory` is kept, written into its file — a path in its first folder,
 * kept as `path.normalize` spells it, or the store — or, `at` undefined, the key removed, so the factory reads `NEMIA.md` in its first
 * folder again. Every other key of the file is kept. Refused before anything is written: a path that is not one (`instructionPathRefusal`,
 * `Invalid`), the factory (`toChange`), and one made from a template, whose instruction is its tree's (`Invalid`).
 */
export function setInstructionAt(home: string, opts: { factory: string; at: InstructionAt | undefined }): { file: string } {
  const at = opts.at;
  if (at !== undefined && 'path' in at) {
    const bad = instructionPathRefusal(at.path);
    if (bad) throw new Invalid({ message: `${bad} Nothing was changed.` });
  }
  const factory = toChange(home, opts.factory, 'instruction');
  if (factory.template !== undefined)
    throw new Invalid({
      message: `${opts.factory} is made from a template, and its instruction is its tree's NEMIA.md, at ${path.join(treeDirAt(home, opts.factory), 'NEMIA.md')}: write it with nemia factory instruct ${opts.factory} --file <path>. Nothing was changed.`,
    });
  const { instruction: _was, ...rest } = factory;
  const kept = at === undefined ? undefined : 'path' in at ? { path: path.normalize(at.path) } : { store: true as const };
  return { file: rewriteFactoryAt(home, kept === undefined ? rest : { ...rest, instruction: kept }, 'Nothing was changed.') };
}

/**
 * `nemia factory revisions`: whether the runs of the factory `factory` follow merged revisions (`follow`) or keep what they resolved
 * until `nemia refresh` (`pinned`), written into its file, every other key kept; or, made from a template, into its tree's wiring
 * (`factory.json`), which is the person's once seeded, as its hires are. Read by every pass after, so a run in flight takes it at its
 * next filing. Refused before anything is written: the factory (`toChange`); a templated one whose tree is not rendered yet
 * (`Conflict`, naming the daemon) or whose wiring does not read (`Invalid`).
 */
export function setRevisionsAt(
  home: string,
  opts: { factory: string; revisions: RevisionsPolicy },
): { file: string; was: RevisionsPolicy | undefined } {
  const factory = toChange(home, opts.factory, 'revisions');
  const file = rewriteFactoryAt(home, { ...factory, revisions: opts.revisions }, 'Nothing was changed.');
  return { file: factory.template === undefined ? file : wiringFileAt(home, factory), was: factory.revisions };
}

/**
 * Why the schedule `opts` cannot be written into `factory`, or undefined, beyond what `wiringRefusal` judges: a cron or zone `Cron` does
 * not read, or a cron that never fires, quoting it (`firesOf`); an empty brief; a repository that is not one of the factory's; and none
 * named in a factory of two or more, where a scheduled start would not know which.
 */
export function scheduleRefusal(
  factory: Factory,
  opts: { workflow: string; cron: string; brief: string; repo?: string; tz?: string },
): string | undefined {
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
 * Refused before anything is written: the name (`workflowNameRefusal`, `Invalid`), the factory (`toChange`), a workflow it does not
 * offer (`wiringRefusal`, `Invalid`), and what `scheduleRefusal` refuses (`Invalid`).
 */
export function setScheduleAt(
  home: string,
  opts: { factory: string; workflow: string; cron: string; brief: string; repo?: string; tz?: string },
): { file: string; schedule: Schedule; replaced?: Schedule } {
  const schedule: Schedule = {
    cron: opts.cron,
    brief: opts.brief,
    ...(opts.repo === undefined ? {} : { repo: path.resolve(opts.repo) }),
    ...(opts.tz === undefined ? {} : { tz: opts.tz }),
    since: new Date().toISOString(),
  };
  const { was, file } = wiredAt(home, opts.factory, { verb: 'schedule', workflow: opts.workflow, schedule }, (factory) => {
    const bad = scheduleRefusal(factory, opts);
    return bad === undefined ? undefined : new Invalid({ message: `${bad} Nothing was scheduled.` });
  });
  const replaced = was.schedules[opts.workflow];
  return { file, schedule, ...(replaced ? { replaced } : {}) };
}

/**
 * `nemia factory unschedule`: the schedule of the workflow `workflow` taken from the factory `factory`'s file, every other key kept.
 * Refused before anything is written: the name (`Invalid`), the factory (`toChange`), and a workflow it does not schedule (`Missing`,
 * naming those it does).
 */
export function clearScheduleAt(home: string, opts: { factory: string; workflow: string }): { file: string; cleared: Schedule } {
  const { was, file } = wiredAt(home, opts.factory, { verb: 'unschedule', workflow: opts.workflow });
  const cleared = was.schedules[opts.workflow];
  if (cleared === undefined) throw new Missing({ message: unscheduledRefusal(opts.factory, opts.workflow, Object.keys(was.schedules)) });
  return { file, cleared };
}

/**
 * The template the factory `name` wants retargeted to `version`, and to `source` where given, its parameters and every other key kept, its
 * file written whole: what `nemia factory upgrade` files, and the daemon merges. Refused: the factory (`toChange`), and one not made
 * from a template (`Invalid`).
 */
export function retargetTemplateAt(home: string, name: string, to: { version: string; source?: string }): { file: string } {
  const factory = toChange(home, name, 'upgrade');
  const template = factory.template;
  if (template === undefined)
    throw new Invalid({ message: `${name} is not made from a template, so it has none to upgrade. Nothing was upgraded.` });
  const retargeted = { ...template, version: to.version, source: to.source ?? template.source };
  return { file: rewriteFactoryAt(home, { ...factory, template: retargeted }, 'Nothing was upgraded.') };
}

/**
 * A function of this file taking the store's root first, as the old spelling that takes none: `at` the module's root, `HOME`. The one
 * line of this file that reads a root of its own (`test/global-roots.baseline.ts`); each spelling below is called by code not yet on the
 * Factory door (`test/factory-door.baseline.ts`).
 */
const atHome =
  <A extends unknown[], R>(at: (home: string, ...args: A) => R) =>
  (...args: A): R =>
    at(HOME, ...args);

/** `factoriesDirAt` the module's root. */
export const factoriesDir = atHome(factoriesDirAt);
/** `readFactoriesAt` the module's root. */
export const readFactories = atHome(readFactoriesAt);
/** `addFactoryAt` the module's root. */
export const addFactory = atHome(addFactoryAt);
/** `removeFactoryAt` the module's root. */
export const removeFactory = atHome(removeFactoryAt);
/** `readFactoryAt` the module's root. */
export const readFactory = atHome(readFactoryAt);
/** `templatedTreeAt` the module's root. */
export const templatedTree = atHome(templatedTreeAt);
/** `treeOfAt` the module's root. */
export const treeOf = atHome(treeOfAt);
/** `factoryNamesAt` the module's root. */
export const factoryNames = atHome(factoryNamesAt);
/** `startFactoryAt` the module's root. */
export const startFactory = atHome(startFactoryAt);
/** `hireAgentAt` the module's root. */
export const hireAgent = atHome(hireAgentAt);
/** `fireAgentAt` the module's root. */
export const fireAgent = atHome(fireAgentAt);
/** `attachWorkflowAt` the module's root. */
export const attachWorkflow = atHome(attachWorkflowAt);
/** `detachWorkflowAt` the module's root. */
export const detachWorkflow = atHome(detachWorkflowAt);
/** `setInstructionAt` the module's root. */
export const setInstruction = atHome(setInstructionAt);
/** `setRevisionsAt` the module's root. */
export const setRevisions = atHome(setRevisionsAt);
/** `setScheduleAt` the module's root. */
export const setSchedule = atHome(setScheduleAt);
/** `clearScheduleAt` the module's root. */
export const clearSchedule = atHome(clearScheduleAt);
/** `retargetTemplateAt` the module's root. */
export const retargetTemplate = atHome(retargetTemplateAt);
