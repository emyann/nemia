/**
 * A factory made from a template, on disk, beside its file: `$WF_ROOT/factories/<name>/tree/`, the folder it runs from, today's format
 * (`treeDir`), the person's once seeded; `applied/`, the template as last rendered, read-only, the base an upgrade will merge from
 * (`appliedDir`); what the controller last observed is a record of the store (`/registry/applied/<name>`), read as its text (`statusOf`,
 * `statusText`). The tree's wiring, `factory.json`, is
 * read and written whole here (`readTreeWiring`, `writeTreeWiring`) for the factory's verbs; a folder is staged whole beside its place
 * and renamed onto it, so no reader sees half of one (`stageFolder`), and swapped whole for an upgrade (`swapTree`, `replaceBase`); the
 * person's choices for an upgrade's conflicts, and the proposals that resolve a workflow's, are `resolutions.json` (`readResolutions`,
 * `writeResolutions`). The card triggers a factory holds, its own over its template's by name, are read here too, beside the wiring that
 * holds the template's (`cardTriggersOf`, `everyCardTrigger`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Option, Result, Schema } from 'effect';
import { PROPOSAL_PHASES } from 'objects';
import {
  FACTORY_CONDITION_REASONS,
  FACTORY_CONDITION_STATUSES,
  FACTORY_CONDITION_TYPES,
  REVISIONS_POLICIES,
  type Factory,
} from '../factory.ts';
import { firstRefusal } from '../../record/record.store.ts';
import { choicesApply, ownerKey, ownerOfKey, type Conflict, type MergeAt } from '../upgrade/index.ts';
import { writeWhole } from '../../whole-file/whole-file.store.ts';

/** The folder the store `home` keeps a factory's own files in, beside its `<name>.json`. */
const folderAt = (home: string, name: string) => path.join(home, 'factories', name);

/**
 * The folder a templated factory runs from: today's format, seeded once from its base, then the person's.
 * @param home The store's root.
 * @param name The factory's name.
 */
export const treeDir = (home: string, name: string) => path.join(folderAt(home, name), 'tree');

/**
 * The template as the controller last rendered it into the factory: read-only, the base of an upgrade's merge.
 * @param home The store's root.
 * @param name The factory's name.
 */
export const appliedDir = (home: string, name: string) => path.join(folderAt(home, name), 'applied');

/** One file of a folder to stage: its path in it, its bytes, and its mode where it keeps one (an executable script of a skill). */
export type Entry = { path: string; bytes: Buffer; mode?: number };

/** A card trigger as a factory's file or its tree's wiring holds it (`CardTrigger`), a key a later `nemia` writes beside its own kept. */
export const CardTriggerSchema = Schema.StructWithRest(
  Schema.Struct({
    selector: Schema.String,
    target: Schema.Struct({ kind: Schema.Literal('Workflow'), name: Schema.String }),
    since: Schema.String,
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/**
 * The wiring a templated factory's tree holds in `factory.json`: its workflows, its hires, whether its runs follow merged revisions
 * when it says, and the repository each workflow works on by folder name, where a person named one (`nemia factory attach … --repo`):
 * written into the tree, as an attach is, so an upgrade of the template merges it as it merges the rest; a key a later `nemia` writes is
 * kept.
 */
const TreeWiringSchema = Schema.StructWithRest(
  Schema.Struct({
    workflows: Schema.Array(Schema.String),
    hires: Schema.Record(Schema.String, Schema.String),
    revisions: Schema.optionalKey(Schema.Literals(REVISIONS_POLICIES)),
    workflowRepos: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    triggers: Schema.optionalKey(Schema.Record(Schema.String, CardTriggerSchema)),
    labelValues: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String))),
    programs: Schema.optionalKey(Schema.Record(Schema.String, Schema.Struct({ run: Schema.String, writes: Schema.Array(Schema.String) }))),
    radius: Schema.optionalKey(
      Schema.Struct({
        agentFacing: Schema.Array(Schema.String),
        checkAffecting: Schema.Array(Schema.String),
        lessons: Schema.Array(Schema.String),
      }),
    ),
    firstWorkflow: Schema.optionalKey(Schema.String),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A tree's wiring as it reads. */
export type TreeWiring = typeof TreeWiringSchema.Type;

/** The file of a tree's wiring. */
const wiringFile = (home: string, name: string) => path.join(treeDir(home, name), 'factory.json');

/**
 * The wiring of the factory `name`'s tree: what its `factory.json` holds, none (`absent`) while the tree is not rendered, or why it does
 * not read (`error`), naming the fix.
 * @param home The store's root.
 * @param name The factory's name.
 */
export const readTreeWiring = (home: string, name: string) => {
  const read: { wiring: TreeWiring } | { absent: true } | { error: string } = wiringIn(wiringFile(home, name));
  return read;
};

/**
 * The names of the card triggers the tree at `tree` renders onto `workflow`: those of its template, read from its `factory.json`; none
 * where it is not rendered or does not read.
 * @param tree The factory's tree, its rendered folder.
 * @param workflow The workflow the triggers send to.
 */
export function treeTriggersOn(tree: string, workflow: string) {
  const read: { wiring: TreeWiring } | { absent: true } | { error: string } = wiringIn(path.join(tree, 'factory.json'));
  const triggers = 'wiring' in read ? (read.wiring.triggers ?? {}) : {};
  return Object.keys(triggers).filter((name) => triggers[name]?.target.name === workflow);
}

/** The wiring a tree's `file` holds, none while it is not there, or why it does not read. */
function wiringIn(file: string) {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT')
      return { absent: true } satisfies { wiring: TreeWiring } | { absent: true } | { error: string };
    return { error: `${file} is not JSON (${(err as Error).message}): fix it by hand, as {"workflows": [...], "hires": {...}}.` } satisfies
      | { wiring: TreeWiring }
      | { absent: true }
      | { error: string };
  }
  return wiringOfText(file, text) satisfies { wiring: TreeWiring } | { absent: true } | { error: string };
}

/**
 * The wiring a render's `entries` hold in their `factory.json`, as a tree seeded from them would read it: none where they hold none, or
 * why it does not read.
 * @param entries The files of a render, by their paths in it.
 */
export function treeWiringOf(entries: readonly Entry[]) {
  const entry = entries.find((e) => e.path === 'factory.json');
  const read: { wiring: TreeWiring } | { absent: true } | { error: string } =
    entry === undefined ? { absent: true } : wiringOfText("the render's factory.json", entry.bytes.toString('utf8'));
  return read;
}

/** The wiring `text`, read at `file`, holds, or why it does not read. */
function wiringOfText(file: string, text: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return { error: `${file} is not JSON (${(err as Error).message}): fix it by hand, as {"workflows": [...], "hires": {...}}.` };
  }
  const decoded = Schema.decodeUnknownResult(TreeWiringSchema)(raw);
  if (Result.isSuccess(decoded)) return { wiring: decoded.success };
  const { path: where, words } = firstRefusal(TreeWiringSchema, raw);
  const field = where.length ? `\`${where.map(String).join('.')}\`` : 'the whole';
  return { error: `${file} does not read as a tree's wiring: ${field} ${words}. Fix it by hand.` };
}

/**
 * The tree's wiring of the factory `name` written whole, `workflows` kept sorted.
 * @param home The store's root.
 * @param name The factory's name.
 * @param wiring The wiring to write, its `workflows` in any order.
 */
export const writeTreeWiring = (home: string, name: string, wiring: TreeWiring) => wiringWritten(wiringFile(home, name), wiring);

/** `wiring` written whole onto a tree's `file`, `workflows` kept sorted. */
const wiringWritten = (file: string, wiring: TreeWiring) =>
  writeWhole(file, `${JSON.stringify({ ...wiring, workflows: [...wiring.workflows].sort() }, null, 2)}\n`);

/**
 * A condition of a templated factory, as Kubernetes words one: its type, `True` or `False`, a reason in one word, a sentence, and when its
 * status last moved (`transitionedAt`), absent on a status written before the field.
 */
const ConditionSchema = Schema.Struct({
  type: Schema.Literals(FACTORY_CONDITION_TYPES),
  status: Schema.Literals(FACTORY_CONDITION_STATUSES),
  reason: Schema.Literals(FACTORY_CONDITION_REASONS),
  message: Schema.String,
  lastTransitionTime: Schema.optionalKey(Schema.String),
});

/** A side of a conflict as the status keeps it: its text, cut, or null where that side has none. */
const SideSchema = Schema.NullOr(Schema.String);

/** The proposal a conflict's resolution waits on: its name, and its phase as the pass read it, null where the store holds it no more. */
const ConflictProposalSchema = Schema.Struct({ name: Schema.String, phase: Schema.NullOr(Schema.Literals(PROPOSAL_PHASES)) });

/**
 * An upgrade waiting on the person: the version it is from and to, and each conflict still without a choice, its sides cut, with the
 * proposal its resolution waits on where one was made (a text file directly in a workflow's folder).
 */
const UpgradeSchema = Schema.Struct({
  from: Schema.String,
  to: Schema.String,
  conflicts: Schema.Array(
    Schema.Struct({
      at: Schema.String,
      base: SideSchema,
      ours: SideSchema,
      theirs: SideSchema,
      message: Schema.optionalKey(Schema.String),
      proposal: Schema.optionalKey(ConflictProposalSchema),
    }),
  ),
});

/**
 * What the controller observed of a templated factory: the template's version its base holds, and its name where the controller has
 * named it (a status written before names were recorded has none, until a pass names it); the base's digest, the parameters it was
 * rendered with, its conditions, `Applied` and `ConflictsPending`, and the upgrade waiting on the person's choices, where one does; the
 * factory's generation the pass read (`observedGeneration`), absent on a status written before the field; a key a later `nemia` writes is
 * kept.
 */
const StatusSchema = Schema.StructWithRest(
  Schema.Struct({
    version: Schema.NullOr(Schema.String),
    template: Schema.optionalKey(Schema.String),
    digest: Schema.NullOr(Schema.String),
    params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
    conditions: Schema.Array(ConditionSchema),
    upgrade: Schema.optionalKey(UpgradeSchema),
    observedGeneration: Schema.optionalKey(Schema.Number),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A templated factory's status. */
export type Status = typeof StatusSchema.Type;

/** A condition of a templated factory's status. */
export type Condition = typeof ConditionSchema.Type;

/**
 * The status a record's `text` holds, or none where there is none or it does not read: the next pass writes it again.
 * @param text What the factory's status record holds, or undefined where there is none.
 */
export const statusOf = (text: string | undefined) =>
  (text === undefined ? undefined : Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(StatusSchema))(text))) satisfies
    | Status
    | undefined;

/**
 * The text of a status record: what the pass observed, written whole.
 * @param status The status the pass observed.
 */
export const statusText = (status: Status) => `${JSON.stringify(status, null, 2)}\n`;

/**
 * The sha256 of `entries`: each path and its bytes, in the order of their paths, so one folder digests the same wherever it is.
 * @param entries The files of a folder, in any order.
 */
export function digestOf(entries: readonly Entry[]) {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(`${entry.path}\0${entry.bytes.length}\0`);
    hash.update(entry.bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

/**
 * Every file of the folder `dir`, by its path in it with `/`, its bytes and its mode; none where there is no folder. A link is skipped.
 * @param dir The folder to read.
 * @param under The path inside `dir` to read from, with `/`; empty, the default, for the whole folder.
 */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- it returns its own call, whose type inference cannot give
export function entriesIn(dir: string, under = ''): Entry[] {
  let names: string[];
  try {
    names = fs.readdirSync(path.join(dir, under)).sort();
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const rel = under ? `${under}/${name}` : name;
    const stat = fs.lstatSync(path.join(dir, rel));
    if (stat.isDirectory()) return entriesIn(dir, rel);
    if (!stat.isFile()) return [];
    return [{ path: rel, bytes: fs.readFileSync(path.join(dir, rel)), mode: stat.mode & 0o777 }];
  });
}

/** `entries` written into a hidden folder beside `dir`, each file with its mode, made read-only where `readOnly`; the hidden folder. */
function hiddenFolder(dir: string, entries: readonly Entry[], readOnly: boolean) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const hidden = path.join(path.dirname(dir), `.${path.basename(dir)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  for (const entry of entries) {
    const at = path.join(hidden, entry.path);
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.writeFileSync(at, entry.bytes);
    const mode = entry.mode ?? 0o644;
    fs.chmodSync(at, readOnly ? mode & 0o555 : mode | 0o200);
  }
  fs.mkdirSync(hidden, { recursive: true });
  return hidden;
}

/**
 * The folder `dir` made of `entries`, staged whole in a hidden folder beside it and renamed onto it, each file with its mode, made
 * read-only where `readOnly`; false, nothing changed, where `dir` is there already, so a pass that lost the race leaves the winner's.
 * @param dir The folder to make.
 * @param entries The files to write into it.
 * @param readOnly Whether each file is made read-only.
 */
export function stageFolder(dir: string, entries: readonly Entry[], readOnly: boolean) {
  if (fs.existsSync(dir)) return false;
  let hidden: string | undefined;
  try {
    hidden = hiddenFolder(dir, entries, readOnly);
    fs.renameSync(hidden, dir);
    return true;
  } catch (err) {
    if (fs.existsSync(dir)) return false;
    throw err;
  } finally {
    if (hidden) fs.rmSync(hidden, { recursive: true, force: true });
  }
}

/**
 * The folder `dir` there now replaced by one made of `entries`: staged whole beside it, the old one renamed aside, the new one renamed in,
 * the old one removed once the new one is in place. Where `unless` is given, nothing is changed, and false is said, if `dir` no longer
 * digests to it by then: a write made since it was read is never lost. Where the new one cannot be renamed in, the old one is renamed
 * back; where it cannot be either, it is kept aside, and the error names where.
 */
function swapFolder(dir: string, entries: readonly Entry[], readOnly: boolean, unless?: string) {
  const hidden = hiddenFolder(dir, entries, readOnly);
  const aside = `${hidden}.old`;
  try {
    if (unless !== undefined && digestOf(entriesIn(dir)) !== unless) return false;
    fs.renameSync(dir, aside);
    try {
      fs.renameSync(hidden, dir);
    } catch (err) {
      putBack(aside, dir, err as Error);
      throw err;
    }
    fs.rmSync(aside, { recursive: true, force: true });
    return true;
  } finally {
    fs.rmSync(hidden, { recursive: true, force: true });
  }
}

/** The folder set `aside` renamed back onto `dir` after `failed`, or, where it cannot be, an error naming where it is kept. */
function putBack(aside: string, dir: string, failed: Error) {
  try {
    fs.renameSync(aside, dir);
  } catch (err) {
    throw new Error(
      `${dir} could not be replaced (${failed.message}), nor put back (${(err as Error).message}): what it held is kept in ${aside}; move it back onto ${dir} by hand.`,
      { cause: err },
    );
  }
}

/**
 * The tree of the factory `name` replaced by `entries`, unless it no longer digests to `read`, what the merge read: whether it was.
 * @param home The store's root.
 * @param name The factory's name.
 * @param entries The files of the new tree.
 * @param read The digest of the tree the merge read (`digestOf`).
 */
export const swapTree = (home: string, name: string, entries: readonly Entry[], read: string) =>
  swapFolder(treeDir(home, name), entries, false, read);

/**
 * The base of the factory `name` replaced by `entries`, read-only: the template as now applied.
 * @param home The store's root.
 * @param name The factory's name.
 * @param entries The files of the template as rendered now.
 */
export const replaceBase = (home: string, name: string, entries: readonly Entry[]) =>
  void swapFolder(appliedDir(home, name), entries, true);

/**
 * The person's choices for an upgrade's conflicts: the version they are for, the name of the template they were made for (none where
 * written before names were recorded), the digest of the base they were made against (none where written before it was recorded), a
 * choice by address, and, by workflow, the proposal that resolves its conflicts (`proposals`), made by `nemia factory resolve` once each
 * of them has a choice: for a workflow's conflicts the choices are the draft that proposal was composed from, never the merge itself.
 */
const ResolutionsSchema = Schema.StructWithRest(
  Schema.Struct({
    to: Schema.String,
    template: Schema.optionalKey(Schema.String),
    base: Schema.optionalKey(Schema.String),
    choices: Schema.Record(Schema.String, Schema.Union([Schema.Literals(['ours', 'theirs']), Schema.Struct({ text: Schema.String })])),
    proposals: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
    seen: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** The person's choices for an upgrade, as they read. */
export type Resolutions = typeof ResolutionsSchema.Type;

/**
 * The file of the person's choices for the factory `name`'s upgrade, written by `nemia factory resolve` alone.
 * @param home The store's root.
 * @param name The factory's name.
 */
export const resolutionsFile = (home: string, name: string) => path.join(folderAt(home, name), 'resolutions.json');

/**
 * The person's choices for the factory `name`'s upgrade, or none where there are none or they do not read.
 * @param home The store's root.
 * @param name The factory's name.
 */
export function readResolutions(home: string, name: string) {
  try {
    const text = fs.readFileSync(resolutionsFile(home, name), 'utf8');
    return Option.getOrUndefined(Schema.decodeUnknownOption(Schema.fromJsonString(ResolutionsSchema))(text));
  } catch {
    return undefined;
  }
}

/**
 * The choices of `resolutions` that apply to the merge `merge` (`choicesApply`): those made for its version, its template or one no name
 * was recorded for, and its base; none else, so a choice made for one template is never applied to another's merge, nor one made before
 * a merge since made to the next change at the same version.
 * @param resolutions The person's choices as read, or undefined where there are none.
 * @param merge The merge the choices are asked for: its version, template and base.
 */
export const choicesFor = (resolutions: Resolutions | undefined, merge: MergeAt) =>
  (resolutions !== undefined && choicesApply(resolutions, merge) ? resolutions.choices : {}) satisfies Resolutions['choices'];

/**
 * The digest of a conflict's three sides: what a choice was made against, so that it holds only while the conflict reads the same.
 * @param conflict The conflict: its address and its three sides, whole.
 */
export const conflictDigest = (conflict: Conflict) =>
  createHash('sha256')
    .update(JSON.stringify([conflict.at, conflict.base, conflict.ours, conflict.theirs]))
    .digest('hex');

/**
 * The choices that still hold: those whose conflict is one of `conflicts` and whose side texts read now as they did when the choice was
 * made (`seen`, the digest recorded for each). A choice with no digest recorded does not hold, and is asked again.
 * @param choices The person's choices that apply to the merge, by a conflict's address.
 * @param seen The digest of each conflict's sides when its choice was made (`conflictDigest`), by its address.
 * @param conflicts The conflicts of the merge now.
 */
export const choicesHeld = (
  choices: Resolutions['choices'],
  seen: Readonly<Record<string, string>> | undefined,
  conflicts: readonly Conflict[],
) =>
  Object.fromEntries(
    Object.entries(choices).filter(([at]) => {
      const conflict = conflicts.find((c) => c.at === at);
      return conflict !== undefined && seen?.[at] === conflictDigest(conflict);
    }),
  ) satisfies Resolutions['choices'];

/**
 * The proposals of `resolutions`, by the key of the owner each resolves (`ownerKey`), that resolve the merge `merge`: those recorded
 * beside the choices that apply to it (`choicesApply`); none else. A bare key, as a store written before any owner but a workflow had a
 * proposal names one, is that Workflow's (`ownerOfKey`).
 * @param resolutions The person's choices as read, or undefined where there are none.
 * @param merge The merge the proposals are asked for: its version, template and base.
 */
export const proposalsFor = (resolutions: Resolutions | undefined, merge: MergeAt) =>
  (resolutions !== undefined && choicesApply(resolutions, merge)
    ? Object.fromEntries(Object.entries(resolutions.proposals ?? {}).map(([key, name]) => [ownerKey(ownerOfKey(key)), name]))
    : {}) satisfies Readonly<Record<string, string>> as Readonly<Record<string, string>>;

/**
 * The person's choices for the factory `name`'s upgrade written whole.
 * @param home The store's root.
 * @param name The factory's name.
 * @param resolutions The choices to write.
 */
export const writeResolutions = (home: string, name: string, resolutions: Resolutions) =>
  writeWhole(resolutionsFile(home, name), `${JSON.stringify(resolutions, null, 2)}\n`);

/** A card trigger as it is defined: its factory, its name, its selector, its target, when it was set, and where it is defined. */
export type TriggerDefined = {
  readonly factory: string;
  readonly name: string;
  readonly selector: string;
  readonly target: { readonly kind: 'Workflow'; readonly name: string };
  readonly since: string;
  readonly from: 'factory' | 'template';
};

/**
 * The card triggers of `factory`: its template's, from its tree's wiring where it reads, then its own over them by name, sorted by name.
 * @param home The store's root.
 * @param factory The factory as read.
 */
export function cardTriggersOf(home: string, factory: Pick<Factory, 'name' | 'template' | 'triggers'>) {
  const byName = new Map<string, TriggerDefined>();
  const tree = factory.template === undefined ? undefined : readTreeWiring(home, factory.name);
  const rendered = tree !== undefined && 'wiring' in tree ? (tree.wiring.triggers ?? {}) : {};
  for (const [name, t] of Object.entries(rendered))
    byName.set(name, { factory: factory.name, name, selector: t.selector, target: t.target, since: t.since, from: 'template' });
  for (const [name, t] of Object.entries(factory.triggers ?? {}))
    byName.set(name, { factory: factory.name, name, selector: t.selector, target: t.target, since: t.since, from: 'factory' });
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Every card trigger of `factories`, the store's that read as the Factory door lists them.
 * @param home The store's root.
 * @param factories The store's factories that read.
 */
export function everyCardTrigger(home: string, factories: Iterable<Pick<Factory, 'name' | 'template' | 'triggers'>>) {
  return [...factories].flatMap((f) => cardTriggersOf(home, f));
}
