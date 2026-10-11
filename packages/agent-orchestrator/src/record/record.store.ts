/**
 * The run store under `$WF_ROOT`: a run's id and its record, the files a person owns beside it — its cancellation, its pruning, each ask,
 * approval and acceptance — and the directories a step's check stderr, artifacts and inputs are kept in, outside every workspace.
 *
 * Beneath the controllers, as `retry/retry-ask.ts` is beneath `retry/retry.ts`: this file imports neither the engine nor a controller,
 * `runner.ts` re-exports what the package exports of it, and no pure file imports it (`test/boundary.test.ts`). `HOME` is read as this
 * file loads, which is when the package loads, and a `WF_ROOT` that is not an absolute path is refused then (`wfRoot`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema, SchemaIssue } from 'effect';
import { BY_CAP, oneLine, WHY_CAP, type Acceptance, type Approval, type Hold, type Pruned, type Run } from './record.ts';
import { spentAcceptances, spentApprovals, type RoundAsk } from '../status/status.ts';
import { spentRoundAsks } from '../round/round.ts';
import { spentAsks, type RetryAsk } from '../retry/index.ts';
import { asNamed } from '../workflow.ts';
import { FrozenStepSchema } from '../folder/folder.store.ts';
import { inputsRoot } from './places.store.ts';
import type { AsksRead, MergeAskHeld } from './record.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { wfRoot } from '../config/config.store.ts';
import { countRecord, readText, within } from '../meter/tally.store.ts';

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/** A struct of `fields` that keeps every key it does not name, so a record written back loses none. */
const Kept = <const F extends Schema.Struct.Fields>(fields: F) => Schema.StructWithRest(Schema.Struct(fields), Rest);

const Strings = Schema.mutable(Schema.Array(Schema.String));

/** A try a step had before the one it is on (`EarlierTry`), as any version of the tick writes one. */
const EarlierTrySchema = Kept({
  taskId: Schema.String,
  check: Schema.optional(Kept({ taskId: Schema.String })),
  then: Schema.Literals(['retries', 'signoff', 'nudge', 'fresh', 'recheck', 'round', 'merge', 'back']),
  model: Schema.optional(Schema.String),
  budget: Schema.optional(Schema.Finite),
  paused: Schema.optional(Schema.Literal(true)),
});

const LandedSchema = Schema.Union([
  Schema.StructWithRest(Schema.Struct({ commit: Schema.String }), Rest),
  Schema.StructWithRest(Schema.Struct({ aborted: Schema.String, refusedOn: Schema.optional(Schema.String) }), Rest),
  Schema.StructWithRest(Schema.Struct({ untouched: Schema.String }), Rest),
]);

const StepRecordSchema = Kept({
  taskId: Schema.NullOr(Schema.String),
  workspace: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  check: Schema.optional(Kept({ taskId: Schema.String })),
  tries: Schema.optional(Schema.mutable(Schema.Array(EarlierTrySchema))),
  handedOff: Schema.optional(Schema.String),
  landed: Schema.optional(LandedSchema),
  filesRead: Schema.optional(Kept({ taskId: Schema.String, lacked: Schema.Record(Schema.String, Schema.String) })),
});

/**
 * A run's record as any version of the tick writes it: `Run`, with the person's files it composes on read
 * (`approvals`, `acceptances`, `pruned`, `hold`) left to their own readers. Every key it does not name is kept, so a key a newer or an
 * older `nemia` wrote survives `rewriteRun`.
 */
const runBase = {
  id: Schema.String,
  workspace: Schema.String,
  brief: Schema.String,
  workflowDir: Schema.String,
  workflow: Schema.optional(Schema.mutable(Schema.Array(FrozenStepSchema))),
  after: Schema.optional(Strings),
  context: Schema.optional(Strings),
  inputs: Schema.optional(Strings),
  from: Schema.optional(Schema.StructWithRest(Schema.Struct({ inbox: Schema.String }), Rest)),
  scheduled: Schema.optional(Kept({ factory: Schema.String, workflow: Schema.String, due: Schema.String })),
  gates: Schema.optional(Strings),
  factory: Schema.optional(Schema.String),
  mounts: Schema.optional(Schema.mutable(Schema.Array(Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean })))),
  slotHeldAt: Schema.optional(Schema.String),
  gatesTimed: Schema.optional(Schema.mutable(Schema.Array(Schema.Struct({ step: Schema.String, try: Schema.Number })))),
  deniedCounted: Schema.optional(Schema.mutable(Schema.Array(Schema.Struct({ task: Schema.String, attempts: Schema.Number })))),
  settlesCounted: Schema.optional(Strings),
  runTimed: Schema.optional(Schema.Boolean),
  tips: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  cancelledAt: Schema.optional(Schema.String),
  steps: Schema.Record(Schema.String, StepRecordSchema),
  createdAt: Schema.String,
};

const GitRecordSchema = Kept({
  ...runBase,
  place: Schema.optional(Schema.Undefined),
  repo: Schema.String,
  baseRef: Schema.String,
  branch: Schema.String,
  isolate: Schema.Boolean,
  placeSkill: Schema.optional(Schema.StructWithRest(Schema.Struct({ skill: Schema.String, version: Schema.String }), Rest)),
  stagedFile: Schema.optional(Schema.String),
});

/** Each of `keys` as a field a record of its kind never holds. */
const absent = <const K extends string>(...keys: K[]) =>
  Object.fromEntries(keys.map((k) => [k, Schema.optional(Schema.Undefined)])) as { [P in K]: Schema.optional<typeof Schema.Undefined> };

const FolderRecordSchema = Kept({
  ...runBase,
  place: Schema.StructWithRest(Schema.Struct({ kind: Schema.Literal('folder') }), Rest),
  ...absent('repo', 'baseRef', 'branch', 'isolate', 'placeSkill', 'stagedFile'),
});

const isRunRecord = Schema.is(Schema.Union([GitRecordSchema, FolderRecordSchema]));

const fieldOf = (value: unknown, key: PropertyKey): unknown =>
  typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;

/** `text` cut to its first 60 characters and marked `…` where it was cut, as the runtime quotes a value it refuses. */
const shown = (text: string): string => (text.length > 60 ? `${text.slice(0, 60)}…` : text);

/** The first thing `schema` refuses in `value`: the path to it, and what is there in place of what the tick writes. */
export function firstRefusal(value: unknown, error: Schema.SchemaError): { path: readonly PropertyKey[]; words: string } {
  const [first] = SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues;
  const path = (first?.path ?? []).map((p) => (typeof p === 'object' && p !== null && 'key' in p ? p.key : p));
  const found = path.reduce<unknown>((at, key) => fieldOf(at, key), value);
  const message = first?.message ?? 'is not what nemia writes';
  const words =
    message === 'Missing key'
      ? 'is missing'
      : `is ${shown(JSON.stringify(found) ?? 'undefined')}, where ${message.replace(/^Expected /, 'nemia writes ').replace(/ \| undefined$/, '')}`;
  return { path, words };
}

/** Why a record does not read as a run: its first field that is not what the tick writes, read against the kind of run it says it is. */
function recordRefusal(raw: unknown): string {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'is no run record: it holds no object';
  const kind = fieldOf(raw, 'place') === undefined ? GitRecordSchema : FolderRecordSchema;
  const decoded = Schema.decodeUnknownResult(kind)(raw);
  if (Result.isSuccess(decoded)) return 'is no run record';
  const { path, words } = firstRefusal(raw, decoded.failure);
  return `does not read as a run: its ${path.length ? `\`${path.map(String).join('.')}\`` : 'shape'} ${words}`;
}

/**
 * A run record that is there and does not read as one: a person's or a program's edit, or a newer `nemia`'s. Said by `readRun` with the
 * fix, and left out of `listRuns`, so one record nobody can read stops no other run.
 */
export class UnreadableRecord extends Invalid {
  constructor(id: string, why: string) {
    super({
      message: `run ${id}: its record, ${runFile(id)}, ${why}. Only the tick writes a record: if a person or another program edited it, put it back as the tick wrote it; if a newer nemia wrote it, read this store with that nemia.`,
    });
  }
}

/** Each unreadable record said once a process: a daemon lists the runs every pass. */
const saidAlready = new Set<string>();
const sayOnce = (line: string): void => {
  if (!saidAlready.has(line) && saidAlready.add(line)) process.stderr.write(`${line}\n`);
};

const isText = Schema.is(Schema.String);
const isAmount = Schema.is(Schema.Finite);
const isList = Schema.is(Schema.Array(Schema.Unknown));
/** A person's free words off a file, one line within `cap`: none for a value that is not text, or only blanks. */
const wordsOf = (value: unknown, cap: number): string | undefined => (isText(value) && value.trim() ? oneLine(value, cap) : undefined);
const isPrunedWorktree = Schema.is(Schema.StructWithRest(Schema.Struct({ path: Schema.String, bytes: Schema.Finite }), Rest));

/** A marker's text as JSON, or undefined where it is not: each field is then read as missing, as a marker that does not read is. */
const jsonOr = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

/** A person's marker file, as JSON where it reads as JSON (`jsonOr`) — or undefined, when there is no such file to read. */
const markerOf = (file: string): { json: unknown } | undefined => {
  try {
    return { json: jsonOr(readText(file)) };
  } catch {
    return undefined;
  }
};

export const HOME = wfRoot();

export const runsDir = () => path.join(HOME, 'runs');
export const runFile = (id: string) => path.join(runsDir(), `${id}.json`);

/**
 * A cancellation, in a file of its own.
 *
 * The run's json has one writer that rewrites it constantly — a tick reads the record, spends
 * seconds observing sessions and cutting worktrees, then writes back what it filed. `nemia cancel` is
 * used while that daemon runs, and a second read-modify-write of the one file would lose an update:
 * a cancel landing mid-pass overwritten by the tick's stale copy, and the run filing steps on.
 * Re-reading before writing only narrows that window; it does not close it.
 *
 * So the two writers are given two files and never touch each other's. The tick owns the run's
 * steps, a person owns the cancellation, and `readRun` composes them. No lock, and nothing to get
 * wrong under a crash: the file exists or it does not.
 */
export const cancelFile = (id: string) => path.join(runsDir(), `${id}.cancelled`);

/**
 * That `nemia prune` removed the run's worktrees: when, and each it removed with what it held on disk, and, under `--artifacts`, when its
 * files directory went and what that freed — a person's fact, in a file of its own
 * for the reason `cancelFile` is. Written by `prune` alone, before it removes anything, so a pass that reads the run while the worktrees
 * go files nothing more (`advance`), and composed onto the run on read (`readRun`) as `pruned`. `nemia rm` removes it with the run.
 */
export const pruneFile = (id: string) => path.join(runsDir(), `${id}.pruned`);

/**
 * The prune marker, read: undefined for a run never pruned. A marker that does not read as one still says the run is pruned, and each
 * field that does not read is empty. Its files (`nemia prune --artifacts`) are pruned when the marker names them, at the time it says or
 * none.
 */
export function readPruned(id: string): Pruned | undefined {
  const marker = markerOf(pruneFile(id));
  if (!marker) return undefined;
  const [at, worktrees, artifacts] = [fieldOf(marker.json, 'at'), fieldOf(marker.json, 'worktrees'), fieldOf(marker.json, 'artifacts')];
  const [artifactsAt, artifactsBytes] = [fieldOf(artifacts, 'at'), fieldOf(artifacts, 'bytes')];
  return {
    at: isText(at) ? at : '',
    worktrees: isList(worktrees) ? worktrees.filter(isPrunedWorktree) : [],
    ...(artifacts === undefined
      ? {}
      : { artifacts: { at: isText(artifactsAt) ? artifactsAt : '', bytes: isAmount(artifactsBytes) ? artifactsBytes : 0 } }),
  };
}

/**
 * That a person holds the run until other runs ship (`nemia hold`): `{ at, until, why?, by? }`, a person's fact in a file of its own for
 * the reason `cancelFile` is. Written by `hold` alone, exclusively; removed by `nemia hold --off`, by the tick once every run it names has
 * shipped (`removeHold`), and by `nemia rm` with the run. Composed onto the run on read as `hold`, its `why` and `by` each one line within
 * its cap.
 */
export const holdFile = (id: string) => path.join(runsDir(), `${id}.hold`);

/**
 * The hold, read: undefined for a run nobody holds. A file that does not read as a hold still holds the run, on no run named: the tick
 * never lifts a hold that names nothing, so only `nemia hold --off` lifts it, and the run files nothing while the file is there
 * (`advance`).
 */
function readHold(id: string): Hold | undefined {
  const marker = markerOf(holdFile(id));
  if (!marker) return undefined;
  const [at, until] = [fieldOf(marker.json, 'at'), fieldOf(marker.json, 'until')];
  const [why, by] = [wordsOf(fieldOf(marker.json, 'why'), WHY_CAP), wordsOf(fieldOf(marker.json, 'by'), BY_CAP)];
  return { at: isText(at) ? at : '', until: isList(until) ? until.filter(isText) : [], ...(why ? { why } : {}), ...(by ? { by } : {}) };
}

/**
 * Write down that this run is held until `until` ship, with the person's `why` and who they are (`by`) when given, and answer with the
 * hold written — or null, when a hold already stands. `wx`, so a hold two people put at once is the first one's, whole, and a hold is
 * never edited: changing what it names or says is `--off` and a new hold.
 */
export const writeHold = (id: string, until: readonly string[], { why, by }: Pick<Hold, 'why' | 'by'> = {}): Hold | null => {
  fs.mkdirSync(runsDir(), { recursive: true });
  const hold: Hold = { at: new Date().toISOString(), until: [...until], ...(why ? { why } : {}), ...(by ? { by } : {}) };
  try {
    fs.writeFileSync(holdFile(id), JSON.stringify(hold, null, 2), { flag: 'wx' });
    return hold;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return null;
    throw err;
  }
};

/**
 * Lift a hold — the one put at `at`, and only while it still stands: false when the file is gone or holds a hold put since. The tick reads
 * the hold, spends seconds asking git and the engine whether its runs shipped, and lifts it; a person who lifted it and held the run again
 * in those seconds put a hold the tick never read, and it stays.
 */
export const removeHold = (id: string, at: string): boolean => {
  if (readHold(id)?.at !== at) return false;
  try {
    fs.rmSync(holdFile(id));
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
};

/**
 * A run: its record, with what people own beside it composed on read — the cancellation (`cancelFile`), its pruning (`pruneFile`), its
 * hold (`holdFile`), each approval at a gate (`readApprovals`), and each loop a person ended as it stands (`readAcceptances`), off one
 * listing of its asks directory. None of them is ever written into the record (`rewriteRun`), and whatever the record carries under their
 * keys is dropped, the store's pause's (`pause`, which `runStore` composes) with them. Counted as one record read (`countRecord`) under
 * `records` while a pass is metered.
 *
 * The frozen steps are read under the names their keys have now (`asNamed`), and written back under them (`recordText`), in their place
 * among the record's keys, so a record read and written back moves no line. Refused: an id with no record, as `no such run` naming
 * `nemia ls` (`Missing`), for every verb that takes one; and a record that does not read as a run (`UnreadableRecord`).
 */
export const readRun = (id: string): Run => within('records', () => readRecord(id));

const readRecord = (id: string): Run => {
  if (!fs.existsSync(runFile(id))) throw new Missing({ message: `no such run: ${id}  (try 'nemia ls')` });
  countRecord();
  let raw: unknown;
  try {
    raw = JSON.parse(readText(runFile(id)));
  } catch (err) {
    if (!(err instanceof SyntaxError)) throw err;
    throw new UnreadableRecord(id, `is not JSON (${err.message})`);
  }
  if (!isRunRecord(raw)) throw new UnreadableRecord(id, recordRefusal(raw));
  const read = { ...raw };
  for (const key of ['approvals', 'acceptances', 'pruned', 'hold', 'pause', 'cordon']) delete read[key];
  const { workflow, ...unfrozen } = read;
  const run = workflow ? { ...read, workflow: workflow.map(asNamed) } : unfrozen;
  const at = fs.existsSync(cancelFile(id)) ? readText(cancelFile(id)).trim() : '';
  const [pruned, hold] = [readPruned(id), readHold(id)];
  const { approvals, acceptances } = within('asks', () => {
    const names = fileNames(asksDir(id));
    return { ...readApprovalsNow(id, names), ...readAcceptancesNow(id, names) };
  });
  return {
    ...run,
    ...(at ? { cancelledAt: at } : {}),
    ...(pruned ? { pruned } : {}),
    ...(hold ? { hold } : {}),
    ...(approvals.length ? { approvals } : {}),
    ...(acceptances.length ? { acceptances } : {}),
  };
};

export { stepsOf } from './steps.store.ts';

/**
 * Write down that this run is cancelled, and answer with the time that now stands.
 *
 * `wx` so the FIRST cancellation is the one kept: two people calling the same run off should not
 * leave the record saying it happened at whichever moment the second one typed it.
 */
export const markCancelled = (id: string): string => {
  fs.mkdirSync(runsDir(), { recursive: true });
  const at = new Date().toISOString();
  try {
    fs.writeFileSync(cancelFile(id), at, { flag: 'wx' });
    return at;
  } catch {
    return readText(cancelFile(id)).trim() || at;
  }
};

/**
 * A person's `nemia retry`, in files of its own: `runs/<id>.asks/retry-<step>-<n>`, one per try asked for.
 *
 * For the reason a cancellation has its own file: the run's json has one writer, the tick, and a verb typed
 * while `nemia up` runs must not be a second. The verb creates the ask, whole and exclusively, and never touches
 * it again. Every pass reads the directory, and once the run's record holds the try an ask names, the tick
 * moves the file into `done/` — consumed, never edited. Naming the try is what makes an ask honoured once: a
 * pass that dies after filing the try and before consuming the ask files nothing more, because the next pass
 * finds the try on the board (`adoptTries`) or on the record (`spentAsks`).
 *
 * `nemia round` is the same, in `round-<step>-<n>`: the looping step, and the round it asks for (`adoptRounds`, `spentRoundAsks`); and
 * `nemia merge`, in `merge-<step>-<n>`, read and consumed beside the rest (`readMergeAsks`, `consumeMergeAsks`).
 *
 * `nemia approve` too, in `approve-<step>-<n>`: the gated step, and the try it approves. It is never consumed while it opens the gate — the
 * record holds no approval, and every pass reads the file (`readRun`) — only once a later try of the step spent it (`spentApprovals`).
 *
 * And `nemia accept`, in `accept-<step>-<n>`: the looping step whose loop a person ended as it stands, and the try they accepted. Read and
 * spent exactly as an approval is (`readAcceptances`, `spentAcceptances`) — every pass reads the file, so the loop stays ended after a
 * restart, and a later try of the step takes it back.
 */
export const asksDir = (id: string) => path.join(runsDir(), `${id}.asks`);
export const askFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `retry-${step}-${n}`);
export const roundAskFile = (id: string, step: string, round: number): string => path.join(asksDir(id), `round-${step}-${round}`);
export const approvalFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `approve-${step}-${n}`);
export const acceptFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `accept-${step}-${n}`);

/** The names of the files in `dir`, sorted; undefined where it cannot be listed, as when it was never made. */
export const fileNames = (dir: string): string[] | undefined => {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();
  } catch {
    return undefined;
  }
};

/**
 * The approvals at a run's gates, waiting in its asks directory — each opens the gate of the try it names — and a line for each file named
 * as one that cannot be read as one.
 */
export const readApprovals = (id: string): { approvals: Approval[]; notes: string[] } => within('asks', () => readApprovalsNow(id));

function readApprovalsNow(id: string, names = fileNames(asksDir(id))): { approvals: Approval[]; notes: string[] } {
  const approvals: Approval[] = [];
  const notes: string[] = [];
  if (!names) return { approvals, notes };
  for (const name of names) {
    const approved = /^approve-(.+)-(\d+)$/.exec(name);
    if (!approved) continue;
    const file = path.join(asksDir(id), name);
    const read = approvalIn(file, approved[1], Number(approved[2]));
    if (typeof read === 'string') notes.push(`${file}: ${read}, so it opens no gate — remove it, and approve with nemia approve`);
    else approvals.push(read);
  }
  return { approvals, notes };
}

/**
 * The ask files a person's verbs write (`nemia approve`, `nemia accept`, `nemia round`, `nemia retry`), each checked for what the verb
 * refuses to write, in the order the verb checks it, so a file written by hand is held to the verb's word. `at` is read leniently where the
 * tick never reads it as a time (a round, a retry). A key none of them names is kept, as a newer `nemia` may write one.
 */
const Said = Schema.String.check(Schema.makeFilter((text: string) => text.trim() !== ''));
export const When = Schema.String.check(Schema.makeFilter((at: string) => !Number.isNaN(Date.parse(at))));
/** An amount an ask file may carry as its budget: dollars above zero, as `nemia retry --budget` and `nemia round --budget` write one. */
const Dollars = Schema.Finite.check(Schema.isGreaterThan(0));
const BUDGET_WORDS = 'its budget is not an amount of dollars above zero';

const ApprovalFileSchema = Schema.StructWithRest(Schema.Struct({ at: When, message: Schema.optionalKey(Said) }), Rest);
const AcceptanceFileSchema = Schema.StructWithRest(Schema.Struct({ at: When, message: Said }), Rest);
const RoundAskFileSchema = Kept({ budget: Schema.optionalKey(Dollars), at: Schema.optionalKey(Schema.Unknown) });
const RetryAskFileSchema = Kept({
  mode: Schema.Literals(['nudge', 'fresh', 'recheck']),
  model: Schema.optionalKey(Schema.NonEmptyString),
  message: Schema.optionalKey(Said),
  budget: Schema.optionalKey(Dollars),
  interrupted: Schema.optionalKey(Schema.NonEmptyString),
  at: Schema.optionalKey(Schema.Unknown),
});

/** An ask file's JSON, or why it cannot be read. */
export function heldIn(file: string): { read: unknown } | { unreadable: string } {
  try {
    return { read: JSON.parse(readText(file)) };
  } catch (err) {
    return { unreadable: `unreadable (${err instanceof Error ? err.message : String(err)})` };
  }
}

/** `value` read with `schema`, or the first key it refuses (`''` for the value itself, which holds no object). */
export function readAs<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown): { read: S['Type'] } | { refused: string } {
  const decoded = Schema.decodeUnknownResult(schema)(value);
  if (Result.isSuccess(decoded)) return { read: decoded.success };
  const [key] = firstRefusal(value, decoded.failure).path;
  return { refused: key === undefined ? '' : String(key) };
}

/** Why a message is refused: one that is not text, or one with nothing in it. */
const messageWords = (held: unknown): string => (isText(fieldOf(held, 'message')) ? 'its message is empty' : 'its message is not text');

/** One approval file, read: the step and the try from its name, when and what was said from what it holds — or why it cannot be read. */
export function approvalIn(file: string, step: string, n: number): Approval | string {
  const held = heldIn(file);
  if ('unreadable' in held) return held.unreadable;
  const read = readAs(ApprovalFileSchema, held.read);
  if ('refused' in read) {
    if (read.refused === 'at') return 'it says no time it was given';
    if (read.refused === 'message') return messageWords(held.read);
    return 'it is not an approval nemia approve wrote';
  }
  const { at, message } = read.read;
  return { step, try: n, at, ...(message === undefined ? {} : { message }) };
}

/**
 * The acceptances of a run's loops, waiting in its asks directory — each ends the loop of the try it names — and a line for each file named
 * as one that cannot be read as one.
 */
export function readAcceptances(id: string): { acceptances: Acceptance[]; notes: string[] } {
  return within('asks', () => readAcceptancesNow(id));
}

function readAcceptancesNow(id: string, names = fileNames(asksDir(id))): { acceptances: Acceptance[]; notes: string[] } {
  const acceptances: Acceptance[] = [];
  const notes: string[] = [];
  if (!names) return { acceptances, notes };
  for (const name of names) {
    const took = /^accept-(.+)-(\d+)$/.exec(name);
    if (!took) continue;
    const file = path.join(asksDir(id), name);
    const read = acceptanceIn(file, took[1], Number(took[2]));
    if (typeof read === 'string') notes.push(`${file}: ${read}, so it ends no loop — remove it, and accept with nemia accept`);
    else acceptances.push(read);
  }
  return { acceptances, notes };
}

/**
 * One acceptance file, read: the looping step and the try from its name, when and what was said from what it holds — or why it cannot be
 * read. What `nemia accept` refuses to write is refused here too, so a file written by hand is held to the verb's word: an acceptance with
 * no words ends a loop with findings open and tells the steps after it nothing, which is the whole of what it is for.
 */
export function acceptanceIn(file: string, step: string, n: number): Acceptance | string {
  const held = heldIn(file);
  if ('unreadable' in held) return held.unreadable;
  const read = readAs(AcceptanceFileSchema, held.read);
  if ('refused' in read) {
    if (read.refused === 'at') return 'it says no time it was given';
    if (read.refused !== 'message') return 'it is not an acceptance nemia accept wrote';
    return isText(fieldOf(held.read, 'message'))
      ? 'its message is empty, and an acceptance is nothing but its reason'
      : 'it says nothing of why the work is good enough with its findings open';
  }
  const { at, message } = read.read;
  return { step, try: n, at, message };
}

/**
 * The asks waiting in a run's directory — tries and rounds — and a line for each file there that names one and cannot be read as one, and
 * for each approval and acceptance that cannot be read (`readApprovals`, `readAcceptances`), said on the pass as an ask's is. A file named
 * otherwise is no ask, the dot-named one a verb writes before linking it into place (`writeAsk`) among them. The directory is listed once,
 * and each file in it read once.
 */
export const readAsks = (id: string): AsksRead => within('asks', () => readAsksNow(id));

function readAsksNow(id: string): AsksRead {
  const read: AsksRead = { asks: [], rounds: [], notes: [] };
  const names = fileNames(asksDir(id));
  if (!names) return read;
  read.notes.push(...readApprovalsNow(id, names).notes, ...readAcceptancesNow(id, names).notes);
  for (const name of names) {
    const tried = /^retry-(.+)-(\d+)$/.exec(name);
    const again = /^round-(.+)-(\d+)$/.exec(name);
    const file = path.join(asksDir(id), name);
    if (tried) {
      const ask = askIn(file, tried[1], Number(tried[2]));
      if (typeof ask === 'string') read.notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with nemia retry`);
      else read.asks.push(ask);
    } else if (again) {
      const ask = roundAskIn(file, again[1], Number(again[2]));
      if (typeof ask === 'string') read.notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with nemia round`);
      else read.rounds.push(ask);
    }
  }
  return read;
}

/** One round ask file, read: the looping step and the round from its name, when from what it holds — or why it cannot be read. */
export function roundAskIn(file: string, step: string, round: number): RoundAsk | string {
  const held = heldIn(file);
  if ('unreadable' in held) return held.unreadable;
  const read = readAs(RoundAskFileSchema, held.read);
  if ('refused' in read) return read.refused === 'budget' ? BUDGET_WORDS : 'it is not an ask nemia round wrote';
  const { at, budget } = read.read;
  return { step, round, ...(budget === undefined ? {} : { budget }), at: isText(at) ? at : '' };
}

/** Why an ask file cannot be read, by the field its schema refused (`refused`) of what it holds (`held`). */
function askRefusal(refused: string, held: unknown): string {
  if (refused === 'model') return 'its model is not a name';
  if (refused === 'message') return messageWords(held);
  if (refused === 'budget') return BUDGET_WORDS;
  if (refused === 'interrupted') return 'the task it names as interrupted is not an id';
  return `it asks for no mode nemia retry knows (${JSON.stringify(fieldOf(held, 'mode'))})`;
}

/**
 * One ask file, read: the step and the try from its name, how, when and what was said from what it holds — or why it cannot be read.
 * A file with no message reads as an ask without one. What `nemia retry` refuses to write is refused here too, so a file written by hand is
 * held to the verb's word: a message that is not text or is empty, and a message on a recheck. A file that holds no object, or whose mode
 * is not one of the three, asks for no mode `nemia retry` knows.
 */
export function askIn(file: string, step: string, n: number): RetryAsk | string {
  const held = heldIn(file);
  if ('unreadable' in held) return held.unreadable;
  const read = readAs(RetryAskFileSchema, held.read);
  if ('refused' in read) return askRefusal(read.refused, held.read);
  const { mode, model, message, budget, interrupted, at } = read.read;
  if (message !== undefined && mode === 'recheck') return 'it carries a message and asks for a recheck, which files no session to read it';
  if (budget !== undefined && mode === 'recheck') return 'it carries a budget and asks for a recheck, which files no session to spend it';
  return {
    step,
    try: n,
    mode,
    ...(model === undefined ? {} : { model }),
    ...(message === undefined ? {} : { message }),
    ...(budget === undefined ? {} : { budget }),
    ...(interrupted === undefined ? {} : { interrupted }),
    at: isText(at) ? at : '',
  };
}

/**
 * Every ask that carried a message — still waiting, or consumed into `done/` — for what `nemia ls` and `nemia decide` say of a try that was
 * answered (`answerOf`). Composed on read, as the ask itself is: the run's record keeps no message. A file that cannot be read as an ask
 * is left out; the tick's own read (`readAsks`) says why.
 */
export function readAnswers(id: string): RetryAsk[] {
  return within('asks', () => readAnswersNow(id));
}

function readAnswersNow(id: string): RetryAsk[] {
  const answers: RetryAsk[] = [];
  for (const dir of [asksDir(id), path.join(asksDir(id), 'done')]) {
    const names = fileNames(dir) ?? [];
    for (const name of names) {
      const tried = /^retry-(.+)-(\d+)$/.exec(name);
      const ask = tried ? askIn(path.join(dir, name), tried[1], Number(tried[2])) : undefined;
      if (ask && typeof ask !== 'string' && ask.message !== undefined) answers.push(ask);
    }
  }
  return answers;
}

/**
 * Write a person's ask, whole and exclusively: into a file of its own, then linked to its name. `link` refuses a
 * name that exists, as `wx` does, and unlike `wx` leaves no moment in which the tick can read an ask that has
 * been created and not yet written. False when an ask for that try was already there.
 */
export function writeAsk(file: string, ask: RetryAsk | RoundAsk | Approval | Acceptance | MergeAskHeld): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const whole = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}`);
  fs.writeFileSync(whole, `${JSON.stringify(ask, null, 2)}\n`, { flag: 'wx' });
  try {
    fs.linkSync(whole, file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  } finally {
    fs.rmSync(whole, { force: true });
  }
}

/**
 * Move each ask the run's record already answers into `done/`, and each one of `voided` — an ask `nemia pause --now` wrote that the pass
 * found void (`pauseAskVoid`) — and each approval a later try of its step spent (`spentApprovals`), and
 * each acceptance one spent (`spentAcceptances`). The tick's one touch on a person's file, and never an edit. `done/` is made inside the
 * run's asks directory, never the directory itself, which `nemia rm` may remove mid-pass; an ask already moved by a pass beside this one,
 * or removed with its run, is passed over.
 */
export function consumeAsks(run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[], voided: readonly RetryAsk[] = []): void {
  within('act', () =>
    doneWith(run.id, [
      ...[...new Set([...spentAsks(run, asks), ...voided])].map((a) => askFile(run.id, a.step, a.try)),
      ...spentRoundAsks(run, rounds).map((a) => roundAskFile(run.id, a.step, a.round)),
      ...spentApprovals(run).map((a) => approvalFile(run.id, a.step, a.try)),
      ...spentAcceptances(run).map((a) => acceptFile(run.id, a.step, a.try)),
    ]),
  );
}

/** Move each of a run's ask files `spent` into `done/` in its asks directory, passing over one already moved or removed with its run. */
export function doneWith(id: string, spent: readonly string[]): void {
  for (const file of spent) {
    const done = path.join(asksDir(id), 'done', path.basename(file));
    try {
      fs.mkdirSync(path.dirname(done));
    } catch {}
    try {
      fs.renameSync(file, done);
    } catch {}
  }
}

/**
 * Every run in the store. A record `nemia rm` removed after the directory was read is no run, and no reason to fail every other run's pass;
 * nor is a record that does not read as a run (`UnreadableRecord`), which is left out and said, once a process, on `said` — stderr unless
 * given — with its fix. `nemia <verb> <that id>` refuses in the same words. A run `kept` answers for an id is listed as given, its record
 * neither read nor counted; an id it answers nothing for is read.
 */
export const listRuns = (said: (line: string) => void = sayOnce, kept?: (id: string) => Run | undefined): Run[] =>
  within('records', () =>
    fs.existsSync(runsDir())
      ? fs
          .readdirSync(runsDir())
          .filter((f) => f.endsWith('.json'))
          .flatMap((f) => {
            const id = path.basename(f, '.json');
            try {
              return [kept?.(id) ?? readRun(id)];
            } catch (err) {
              if (err instanceof UnreadableRecord) said(`left out: ${err.message}`);
              else if (fs.existsSync(runFile(id))) throw err;
              return [];
            }
          })
          .sort((a, b) => a.id.localeCompare(b.id))
      : [],
  );

/**
 * Each run's files in the store, stamped: what the tick's memo of runs at rest (`rest.ts`) compares, so that a run whose files are as they
 * were is not read again off the engine or git. One `readdir` of the store, and a `stat` of every file named `<id>.<anything>` — the
 * record, `.cancelled`, `.pruned`, `.hold`, and any other marker, as every name of that form is stamped — and of every
 * entry of a directory so named and of the directories in it: the asks, with the approvals and acceptances among them, and `done/`, where
 * each goes once it is spent. Its inode, size and modification time to the nanosecond, so a file written in place, moved, or removed and
 * made again moves its run's stamp. The run's own directory (`<id>/`: its files and inputs) is no input of a pass, and is left out.
 *
 * A stamp is taken before the pass reads the records: a file changed between the two is read as changed by the next pass, never missed.
 * While a run's stamp holds, a pass does not read its record again: the memo hands its run to `listRuns`.
 */
export const restStamps = (): Map<string, string> =>
  within('records', () => {
    const stamps = new Map<string, string[]>();
    let names: string[];
    try {
      names = fs.readdirSync(runsDir());
    } catch {
      return new Map();
    }
    const stat = (at: string, depth: number): string => {
      const s = fs.statSync(at, { bigint: true, throwIfNoEntry: false });
      if (!s) return 'gone';
      const own = `${s.ino}:${s.size}:${s.mtimeNs}`;
      if (!s.isDirectory() || depth > 1) return own;
      let inside: string[];
      try {
        inside = fs.readdirSync(at).sort();
      } catch {
        return `${own}:gone`;
      }
      return `${own}[${inside.map((n) => `${n}=${stat(path.join(at, n), depth + 1)}`).join(',')}]`;
    };
    for (const name of names.sort()) {
      const dot = name.indexOf('.');
      if (dot <= 0) continue;
      const id = name.slice(0, dot);
      const parts = stamps.get(id) ?? [];
      stamps.set(id, [...parts, `${name}=${stat(path.join(runsDir(), name), 0)}`]);
    }
    return new Map([...stamps].map(([id, parts]) => [id, parts.join(';')]));
  });

/** A record as it is written, by both writers: its frozen steps under the names their keys have now. */
const recordText = (run: Omit<Run, 'approvals' | 'acceptances' | 'pruned' | 'hold' | 'pause'>): string => JSON.stringify(run, null, 2);

/** A new run's record: `start`'s, and the one writer that makes one. Without the store's pause, a person's file. */
export const writeRun = ({ pause: _, ...run }: Run) => {
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.writeFileSync(runFile(run.id), recordText(run));
};

/**
 * Write back the record a pass read — only while it is still there, and false when it is not.
 *
 * A pass reads a run, spends seconds on the engine and git, and writes the run back. `nemia rm` may remove the record in those seconds, and
 * a pass that wrote a whole new file would put it back: a run nobody can forget, pointing at worktrees that are gone. So the record is
 * opened `r+`, which never makes a file. Its existence is read at the moment of writing, and nothing is carried to decide it; a record
 * removed after it is opened takes the write with it.
 *
 * Without the approvals, acceptances, pruning and hold `readRun` composed onto it, nor the pause `runStore` did: they are a person's
 * files, and a copy in the record would outlive the file it was read from.
 */
export const rewriteRun = (run: Run): boolean => within('act', () => rewriteNow(run));

const rewriteNow = ({ approvals: _, acceptances: __, pruned: ___, hold: ____, pause: _____, ...run }: Run): boolean => {
  let fd: number;
  try {
    fd = fs.openSync(runFile(run.id), 'r+');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  try {
    fs.ftruncateSync(fd);
    fs.writeFileSync(fd, recordText(run));
  } finally {
    fs.closeSync(fd);
  }
  return true;
};

/**
 * The directory the run makes for a step's files: screenshots, logs, reports — for the steps after it
 * and the person who decides.
 *
 * Beside the run's record, outside every workspace: a file written
 * into a worktree is committed by the next hand-off and rides the branch, and a gitignored one never
 * reaches the next step's worktree at all. `advance` makes it before it files the step, tells the step in
 * its brief (`artifactsContract`), and hands it to the step's check as `WF_ARTIFACTS`.
 */
export const artifactsDir = (run: Pick<Run, 'id'>, step: string): string => path.join(runsDir(), run.id, 'artifacts', step);

/**
 * The directory `nemia start --input` copies a run's files into: the run's own, beside its artifacts and outside every workspace, so a file
 * a person gave the run reaches each step without riding a branch. Named on each brief (`inputsLine`) with the names on the record.
 *
 * Outside every workspace is what a folder run's steps cannot reach: they run in `dontAsk`, fenced to their own folder. So a folder run
 * copies this directory into each folder it makes (`folderPlace.make`), and their briefs name that copy. The path itself is
 * `places.store.ts`'s (`inputsRoot`), as that is where the copy is read from.
 */
export const inputsDir = (run: Pick<Run, 'id'>): string => inputsRoot(runsDir(), run.id);

export const lstatOf = (p: string) => fs.lstatSync(p, { throwIfNoEntry: false });

export const isDirectory = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * A run id a person can read.
 *
 * The engine lets the caller choose task ids, and a session's name is built from one — so the id
 * IS what a human sees in `claude agents`. `t-mtxvs3nw-f4763a59` tells them nothing;
 * `add-split-workflow-8imz` tells them which piece of work they are looking at, and the step
 * suffix tells them which part of it. The random tail keeps two runs of the same request apart.
 */
export const runId = (brief: string): string => {
  const slug = brief
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28)
    .replace(/-$/, '');
  return `${slug || 'run'}-${Math.random().toString(36).slice(2, 6)}`;
};
