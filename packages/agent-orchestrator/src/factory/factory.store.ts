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
  type FactoryWrite,
  type InstructionAt,
} from './factory.ts';
import { frontmatterKey } from '../former/former.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { firstRefusal, HOME, isDirectory } from '../record/record.store.ts';

/** Where the factories are: `$WF_ROOT/factories`, beside `runs/` and `inbox/`. The default factory has no file there. */
export const factoriesDir = (): string => path.join(HOME, 'factories');

/**
 * A factory's file: at least one repository, each a string; the workflows attached to it, each by its folder's name, its hires, a
 * step's `<workflow>/<step>` to an agent's name, when it has any, and where its instruction is kept, a path or the store, when it says;
 * a key a later `nemia` writes beside them is kept, not refused.
 */
const FactoryFileSchema = Schema.StructWithRest(
  Schema.Struct({
    repos: Schema.NonEmptyArray(Schema.String),
    workflows: Schema.optionalKey(Schema.Array(Schema.String)),
    hires: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    instruction: Schema.optionalKey(Schema.Union([Schema.Struct({ path: Schema.String }), Schema.Struct({ store: Schema.Literal(true) })])),
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

/**
 * The factory `name` its file's `content` says: none attached and none hired when the file names none, and where its instruction is kept
 * only when the file says.
 */
const factoryOf = (name: string, content: FactoryFile): Factory => ({
  name,
  repos: content.repos,
  workflows: content.workflows ?? [],
  hires: content.hires ?? {},
  ...(content.instruction === undefined ? {} : { instruction: content.instruction }),
});

/** One entry of the folder as `nemia factory ls` lists it: the factory its file says, or why the file does not read as one. */
function factoryAt(file: string): FactoryListing {
  const name = file.slice(0, -'.json'.length);
  const read = factoryFile(name);
  if ('error' in read) return { name, file: read.file, error: read.error };
  return { ...factoryOf(name, read.content), file: read.file };
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
function factoryRepos(name: string, given: readonly string[]): string[] {
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
 * `nemia factory add`: a factory filed as `<name>.json`, written whole to a hidden file first and linked onto its name, which fails when
 * the name is taken: no reader sees half a file, and two adds of one name file one. Refused before anything is written: the name
 * (`refuseName`) and the repositories (`factoryRepos`); and, the file already there, `Conflict`, the file left as it was.
 */
export function addFactory(opts: { name: string; repos: readonly string[] }): { factory: Factory; file: string } {
  refuseName(opts.name, 'add');
  const repos = factoryRepos(opts.name, opts.repos);
  fs.mkdirSync(factoriesDir(), { recursive: true });
  const file = path.join(factoriesDir(), `${opts.name}.json`);
  const hidden = path.join(factoriesDir(), `.${opts.name}.json.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, `${JSON.stringify({ repos }, null, 2)}\n`);
    fs.linkSync(hidden, file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    throw new Conflict({
      message: `There is a factory ${opts.name} already, at ${file}, and it was left as it was. See it with nemia factory ls; to name other repositories, nemia factory rm ${opts.name}, then add it again.`,
    });
  } finally {
    fs.rmSync(hidden, { force: true });
  }
  return { factory: { name: opts.name, repos, workflows: [], hires: {} }, file };
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
  return factoryOf(name, read.content);
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
 * The first file of the step `step` of `workflow` that names its own agent, and the agent it names: in each of `repos`' `workflows/`, then
 * in the store `home`'s, where a start in the factory reads a workflow by its name. A file that is not there or does not read names none.
 */
function ownAgentOf(repos: readonly string[], home: string, workflow: string, step: string): { named: string; file: string } | undefined {
  for (const root of [...repos, home]) {
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
  const { file, content } = fileToChange(opts.factory, 'hire');
  const workflow = opts.step.slice(0, opts.step.indexOf('/'));
  if (!content.workflows?.includes(workflow))
    throw new Invalid({ message: `${unattachedHireRefusal(opts.factory, workflow)} Nothing was hired.` });
  const own = ownAgentOf(content.repos, opts.home ?? HOME, workflow, opts.step.slice(workflow.length + 1));
  if (own)
    throw new Conflict({
      message: `${hireRefusalOf({ name: opts.factory, workflows: content.workflows }, workflow, own.named)} ${own.file} names it. Nothing was hired.`,
    });
  const replaced = content.hires?.[opts.step];
  writeWhole(file, { ...content, hires: { ...content.hires, [opts.step]: opts.agent } });
  return { file, ...(replaced !== undefined && replaced !== opts.agent ? { replaced } : {}) };
}

/**
 * `nemia factory fire`: the hire of the factory `factory` into the step `step` taken back, every other key of the file kept; returns the
 * agent it hired. Refused: the factory (`fileToChange`), and a step it hires no one into (`Missing`, naming its hires).
 */
export function fireAgent(opts: { factory: string; step: string }): { file: string; fired: string } {
  const { file, content } = fileToChange(opts.factory, 'fire');
  const hires = { ...content.hires };
  const fired = hires[opts.step];
  if (fired === undefined) {
    const there = Object.keys(hires).sort();
    throw new Missing({
      message: `${opts.factory} hires no agent into ${opts.step}. ${there.length ? `It hires into: ${there.join(', ')}.` : 'It hires none.'} Nothing was fired.`,
    });
  }
  delete hires[opts.step];
  writeWhole(file, { ...content, hires });
  return { file, fired };
}

/** The workflow name `workflow` a verb is given, refused (`Invalid`) when it cannot name one (`workflowNameRefusal`). */
function refuseWorkflowName(workflow: string, verb: 'attach' | 'detach'): void {
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
  const { file, content } = fileToChange(opts.factory, 'attach');
  const workflows = content.workflows ?? [];
  if (workflows.includes(opts.workflow)) return { file, already: true };
  writeWhole(file, { ...content, workflows: [...workflows, opts.workflow].sort() });
  return { file };
}

/**
 * `nemia factory detach`: the workflow `workflow` taken from the factory `factory`, which then offers it no more; every other key kept.
 * Refused before anything is written: the name (`Invalid`), the factory (`fileToChange`), a workflow it has not attached (`Missing`, naming
 * those it has), and one it still hires into (`Invalid`, naming the fire of each hire), so no hire outlives its workflow in the file.
 */
export function detachWorkflow(opts: { factory: string; workflow: string }): { file: string } {
  refuseWorkflowName(opts.workflow, 'detach');
  const { file, content } = fileToChange(opts.factory, 'detach');
  const workflows = content.workflows ?? [];
  if (!workflows.includes(opts.workflow))
    throw new Missing({
      message: `${opts.factory} has not attached ${opts.workflow}. ${workflows.length ? `It offers: ${workflows.join(', ')}.` : 'It offers none.'} Nothing was detached.`,
    });
  const hired = Object.keys(content.hires ?? {})
    .filter((step) => step.startsWith(`${opts.workflow}/`))
    .sort();
  if (hired.length)
    throw new Invalid({
      message: `${opts.factory} hires into ${opts.workflow}'s steps: ${hired.join(', ')}. Fire each first — ${hired.map((step) => `nemia factory fire ${opts.factory} --step ${step}`).join('; ')} — then detach it. Nothing was detached.`,
    });
  writeWhole(file, { ...content, workflows: workflows.filter((w) => w !== opts.workflow) });
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
  const { instruction: _was, ...rest } = content;
  const kept = at === undefined ? undefined : 'path' in at ? { path: path.normalize(at.path) } : { store: true as const };
  writeWhole(file, kept === undefined ? rest : { ...rest, instruction: kept });
  return { file };
}
