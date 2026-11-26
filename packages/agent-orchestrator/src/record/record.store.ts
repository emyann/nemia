/**
 * The run store under `$WF_ROOT`: a run's id and its record, the files a person owns beside it — its cancellation, its pruning, each ask,
 * approval and acceptance — and the directories a step's check stderr, artifacts and inputs are kept in, outside every workspace.
 *
 * Beneath the controllers, as `retry/retry-ask.ts` is beneath `retry/retry.ts`: this file imports neither the engine nor a controller,
 * `runner.ts` re-exports what the package exports of it, and no pure file imports it (`test/boundary.test.ts`). Every path here is
 * under the store's root its caller hands it (`home`): a program reads it from `StoreRoot`, and no module reads one as it loads.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Option, Result, Schema, type Effect } from 'effect';
import { Actor, refusedIn } from 'objects';
import {
  BY_CAP,
  CARDS_FOLDER,
  oneLine,
  WHY_CAP,
  type Acceptance,
  type Approval,
  type Hold,
  type Run,
  type Unheld,
  type Released,
  type Assignee,
  type AssigneeEnd,
  type Unassigned,
  type Pruned,
} from './record.ts';
import { workStands, type RoundAsk } from '../status/status.ts';
import { personRoutes, unrouted, withRoutes } from '../route/index.ts';
import { personConditions, unconditioned, withConditions } from '../condition/condition.ts';

import { RETRY_MODES, TRY_CAUSES, upgradeAsk, upgradeTries, type RetryAsk } from '../retry/index.ts';
import { asNamed } from '../workflow.ts';
import { keptDeclared } from '../pinned/pinned.ts';
import { FrozenStepSchema } from '../folder/folder.store.ts';
import { inputsRoot } from './places.store.ts';
import type { AsksRead, SaidBefore } from './record.ts';
import { Invalid } from '../refusal/refusal.ts';
import { Pins } from '../revisions/revisions.store.ts';
import { countRead, countRecord, within, withinEffect } from '../meter/tally.store.ts';
import { isFilePath } from '../artifacts/artifacts.ts';

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

/** A struct of `fields` that keeps every key it does not name, so a record written back loses none. */
const Kept = <const F extends Schema.Struct.Fields>(fields: F) => Schema.StructWithRest(Schema.Struct(fields), Rest);

const Strings = Schema.mutable(Schema.Array(Schema.String));

/**
 * A try a step had before the one it is on (`EarlierTry`), as any version of the tick writes one: its `cause` written under the former
 * `then` by an older tick is read under `cause` (`upgradeTries`) before this reads it, so a try with neither is refused at its `cause`.
 */
const EarlierTrySchema = Kept({
  taskId: Schema.String,
  check: Schema.optional(Kept({ taskId: Schema.String })),
  cause: Schema.Literals(TRY_CAUSES),
  model: Schema.optional(Schema.String),
  budget: Schema.optional(Schema.Finite),
  paused: Schema.optional(Schema.Literal(true)),
  retried: Schema.optional(Schema.Literal(true)),
});

const Aborted = { aborted: Schema.String, refusedOn: Schema.optional(Schema.String) };
const LandedSchema = Schema.Union([Kept({ commit: Schema.String }), Kept(Aborted), Kept({ untouched: Schema.String })]);

const StepRecordSchema = Kept({
  taskId: Schema.NullOr(Schema.String),
  workspace: Schema.optional(Schema.String),
  branch: Schema.optional(Schema.String),
  check: Schema.optional(Kept({ taskId: Schema.String })),
  tries: Schema.optional(Schema.mutable(Schema.Array(EarlierTrySchema))),
  handedOff: Schema.optional(Schema.String),
  landed: Schema.optional(LandedSchema),
  filesRead: Schema.optional(Kept({ taskId: Schema.String, lacked: Schema.Record(Schema.String, Schema.String) })),
  pinned: Pins,
  closeoutHash: Schema.optional(Schema.String),
  declared: Schema.optional(Strings),
});

/**
 * A run's record as any version of the tick writes it: `Run`, with the person's files composed on read (`approvals`, `acceptances`,
 * `pruned`, `hold`, `labels`, `saidBefore`) left to their own readers. Every key it does not name is kept, so a key a newer or an older
 * `nemia` wrote survives `rewriteRun`.
 */
const runBase = {
  id: Schema.String,
  workspace: Schema.String,
  brief: Schema.String,
  workflowDir: Schema.String,
  workflow: Schema.optional(Schema.mutable(Schema.Array(FrozenStepSchema))),
  pinned: Pins,
  after: Schema.optional(Strings),
  context: Schema.optional(Strings),
  inputs: Schema.optional(Strings),
  cards: Schema.optional(Strings),
  from: Schema.optional(Schema.StructWithRest(Schema.Struct({ inbox: Schema.String }), Rest)),
  scheduled: Schema.optional(Kept({ factory: Schema.String, workflow: Schema.String, due: Schema.String })),
  gates: Schema.optional(Strings),
  models: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  factory: Schema.optional(Schema.String),
  mounts: Schema.optional(Schema.mutable(Schema.Array(Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean })))),
  volumes: Schema.optional(Schema.mutable(Schema.Array(Schema.Struct({ path: Schema.String, readOnly: Schema.Boolean })))),
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

const fieldOf = (value: unknown, key: PropertyKey) =>
  (typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined) as unknown;

/** `text` cut to its first 60 characters and marked `…` where it was cut, as the runtime quotes a value it refuses. */
const shown = (text: string) => (text.length > 60 ? `${text.slice(0, 60)}…` : text);

/**
 * The first thing `schema` refuses in `value`: the path to it, and what is there in place of what the tick writes. It decodes `value`
 * itself, keeping the value it refuses (`reportInput`), and reads the refusal by its `_tag` (objects' `refusedIn`): a missing key `is
 * missing`; anything else is the value found there, then the message the schema declared or the type it expected.
 * @param schema The schema the value is read by.
 * @param value The value the schema was given.
 */
export function firstRefusal(schema: Schema.ConstraintDecoder<unknown>, value: unknown) {
  const decoded = Schema.decodeUnknownResult(schema)(value, { reportInput: true });
  const place = Result.isFailure(decoded) ? refusedIn(decoded.failure.issue)[0] : undefined;
  if (place === undefined) return { path: [], words: 'is not what nemia writes' };
  const words =
    place._tag === 'MissingKey'
      ? 'is missing'
      : `is ${shown(JSON.stringify(place.input) ?? 'undefined')}, where ${place.message ?? `nemia writes ${place.expected}`}`;
  return { path: place.path, words };
}

/** Why a record does not read as a run: its first field that is not what the tick writes, read against the kind of run it says it is. */
function recordRefusal(raw: unknown) {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'is no run record: it holds no object';
  const kind = fieldOf(raw, 'place') === undefined ? GitRecordSchema : FolderRecordSchema;
  if (Result.isSuccess(Schema.decodeUnknownResult(kind)(raw))) return 'is no run record';
  const { path, words } = firstRefusal(kind, raw);
  return `does not read as a run: its ${path.length ? `\`${path.map(String).join('.')}\`` : 'shape'} ${words}`;
}

/**
 * A run record that is there and does not read as one: a person's or a program's edit, or a newer `nemia`'s. Said by `runRecord` with the
 * fix, and left out of `listRuns`, so one record nobody can read stops no other run.
 */
export class UnreadableRecord extends Invalid {
  constructor(where: string, id: string, why: string) {
    super({
      message: `run ${id}: its record, ${where}, ${why}. Only the tick writes a record: if a person or another program edited it, put it back as the tick wrote it; if a newer nemia wrote it, read this store with that nemia.`,
    });
  }
}

/** Each unreadable record said once a process: a daemon lists the runs every pass. */
const saidAlready = new Set<string>();
/**
 * Say `line` on stderr, once a process: a line said before is not said again.
 * @param line The line to say.
 */
export const sayOnce = (line: string) => {
  if (!saidAlready.has(line) && saidAlready.add(line)) process.stderr.write(`${line}\n`);
};

const isText = Schema.is(Schema.String);
const isAmount = Schema.is(Schema.Finite);
const isList = Schema.is(Schema.Array(Schema.Unknown));
/** A person's free words off a file, one line within `cap`: none for a value that is not text, or only blanks. */
const wordsOf = (value: unknown, cap: number) => (isText(value) && value.trim() ? oneLine(value, cap) : undefined);
const isPrunedWorktree = Schema.is(Schema.StructWithRest(Schema.Struct({ path: Schema.String, bytes: Schema.Finite }), Rest));

/** A marker's text as JSON, or undefined where it is not: each field is then read as missing, as a marker that does not read is. */
const jsonOr = (text: string) => Result.getOrUndefined(Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Unknown))(text));

/**
 * The actor a person's file names (objects' `Actor`), as a key to spread: none where the file names none — one written in-process, or
 * by code older than actors — or names one that does not read as an actor, which is left out rather than refusing what the file asks.
 * @param value What the file holds under its actor's key; undefined where it holds none.
 */
const actorIn = (value: unknown) => {
  const read = Result.getOrUndefined(Schema.decodeUnknownResult(Actor)(value));
  return read === undefined ? {} : { actor: read };
};

/**
 * The folder of every run's record and the files beside it: `runs/` under the store's root.
 * @param home The store's root folder.
 */
export const runsDir = (home: string) => path.join(home, 'runs');
/**
 * The file of a run's record: `runs/<id>.json`.
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const runFile = (home: string, id: string) => path.join(runsDir(home), `${id}.json`);

/**
 * The folder a store kept a run's asks in before they were records of its keyspace, `runs/<id>.asks`: what an import reads, then moves
 * aside (`runFilesOf`, runs/records.store.ts).
 * @param home The store's root folder.
 * @param id The run's id.
 */
export const asksDir = (home: string, id: string) => path.join(runsDir(home), `${id}.asks`);

/** An ask as the Run door hands it to a reader: its name (`retry-<step>-<n>`, …), what it holds, and where a person finds it, its key. */
export type AskEntry = { readonly name: string; readonly text: string; readonly where: string };

/**
 * A cancellation as its record's text reads: the time as text, or JSON of the time and the actor (`{ at, actor }`); a text that is neither
 * is read as the time.
 * @param text What the cancelled record holds.
 */
export function cancelledIn(text: string) {
  const trimmed = text.trim();
  const json = trimmed.startsWith('{') ? jsonOr(trimmed) : undefined;
  const at = fieldOf(json, 'at');
  if (!isText(at)) return { at: trimmed } satisfies { at: string; by?: Actor } as { at: string; by?: Actor };
  const { actor } = actorIn(fieldOf(json, 'actor'));
  return { at: at.trim(), ...(actor ? { by: actor } : {}) } satisfies { at: string; by?: Actor };
}

/**
 * The prune marker as its record's text reads. A text that does not read as one still says the run is pruned, and each field that does
 * not read is empty.
 * @param text What the pruned record holds.
 */
export function prunedIn(text: string) {
  const json = jsonOr(text);
  const [at, worktrees, artifacts] = [fieldOf(json, 'at'), fieldOf(json, 'worktrees'), fieldOf(json, 'artifacts')];
  const [artifactsAt, artifactsBytes] = [fieldOf(artifacts, 'at'), fieldOf(artifacts, 'bytes')];
  const pruned = { at: isText(at) ? at : '', worktrees: isList(worktrees) ? worktrees.filter(isPrunedWorktree) : [] };
  if (artifacts === undefined) return pruned satisfies Pruned as Pruned;
  return {
    ...pruned,
    artifacts: { at: isText(artifactsAt) ? artifactsAt : '', bytes: isAmount(artifactsBytes) ? artifactsBytes : 0 },
  } satisfies Pruned as Pruned;
}

/**
 * The hold as its record's text reads. A text that does not read as a hold still holds the run, on no run named: the tick never lifts a
 * hold that names nothing, so only `nemia hold --off` lifts it.
 * @param text What the hold record holds.
 */
export function holdIn(text: string) {
  const json = jsonOr(text);
  const [at, until] = [fieldOf(json, 'at'), fieldOf(json, 'until')];
  const [why, by] = [wordsOf(fieldOf(json, 'why'), WHY_CAP), wordsOf(fieldOf(json, 'by'), BY_CAP)];
  return {
    at: isText(at) ? at : '',
    until: isList(until) ? until.filter(isText) : [],
    ...(why ? { why } : {}),
    ...(by ? { by } : {}),
    ...actorIn(fieldOf(json, 'actor')),
  } satisfies Hold as Hold;
}

/**
 * Who lifted the run's last hold by hand, as its record's text reads: undefined where it does not read as one.
 * @param text What the unheld record holds.
 */
function unheldIn(text: string) {
  const json = jsonOr(text);
  const since = fieldOf(json, 'since');
  const { actor } = actorIn(fieldOf(json, 'actor'));
  return (isText(since) && actor ? { since, actor } : undefined) satisfies Unheld | undefined;
}

/**
 * The release of a run's waiters as its record's text reads: its moment and who wrote it; a text that does not read as one still
 * releases them, at no moment known.
 * @param text What the released record holds.
 */
function releasedIn(text: string) {
  const json = jsonOr(text);
  const at = fieldOf(json, 'at');
  return { at: isText(at) ? at : '', ...actorIn(fieldOf(json, 'actor')) } satisfies Released;
}

/** The longest time an assignee is read with, in milliseconds: 23 hours, as `--for` takes. */
const MOST_FOR_MS = 23 * 3_600_000;

/**
 * Who has the run in hand as its record's text reads. A text that does not read as one still has the run in someone's hand, put at no
 * instant for an hour, so only `nemia assign --off` or the run's end takes it away.
 * @param text What the assignee record holds.
 */
export function assigneeIn(text: string) {
  const json = jsonOr(text);
  const [at, forMs] = [fieldOf(json, 'at'), fieldOf(json, 'forMs')];
  const [name, why] = [wordsOf(fieldOf(json, 'name'), BY_CAP), wordsOf(fieldOf(json, 'why'), WHY_CAP)];
  return {
    at: isText(at) ? at : '',
    forMs: isAmount(forMs) && Number.isSafeInteger(forMs) && forMs >= 1_000 && forMs <= MOST_FOR_MS ? forMs : 3_600_000,
    ...(name ? { name } : {}),
    ...(why ? { why } : {}),
    ...actorIn(fieldOf(json, 'actor')),
  } satisfies Assignee;
}

/** The ways an assignee ends, as a receipt says them. */
const ENDS: readonly AssigneeEnd[] = ['given-back', 'lapsed', 'ended'];

/**
 * How the run's last assignee ended as its record's text reads: undefined where it does not read as a receipt.
 * @param text What the unassigned record holds.
 */
function unassignedIn(text: string) {
  const json = jsonOr(text);
  const [since, how] = [fieldOf(json, 'since'), fieldOf(json, 'how')];
  const end = ENDS.find((e) => e === how);
  return (isText(since) && end ? { since, how: end, ...actorIn(fieldOf(json, 'actor')) } : undefined) satisfies Unassigned | undefined;
}

/**
 * A run's labels as their record's text reads: undefined for none.
 * @param text What the labels record holds.
 */
export function labelsIn(text: string) {
  const json = Result.getOrUndefined(Schema.decodeUnknownResult(Schema.fromJsonString(Schema.Record(Schema.String, Schema.String)))(text));
  return json && !Array.isArray(json) && Object.keys(json).length ? json : undefined;
}

/** A word said to a step before it was filed, as its record holds it. */
const keptSaidIn = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ step: Schema.String, at: Schema.String, text: Schema.String })),
);

/**
 * Whether the text is a word kept for a step before it was filed, `{ step, at, text }`: what an import takes as one.
 * @param text What the file holds.
 */
export const isSaid = (text: string) => Option.isSome(keptSaidIn(text));

/**
 * What was said to each of the run's steps before it was filed, by step, in the order kept: undefined where nothing was.
 * @param words The texts of the run's said records, in the order kept.
 */
function saidIn(words: readonly string[]) {
  const byStep: Record<string, SaidBefore[]> = {};
  for (const text of words) {
    const kept = keptSaidIn(text);
    if (Option.isNone(kept)) continue;
    (byStep[kept.value.step] ??= []).push({ at: kept.value.at, text: kept.value.text });
  }
  return Object.keys(byStep).length ? byStep : undefined;
}

/**
 * A run's markers as its records hold them: each marker's text where the run has it, and the words said to its steps in the order kept.
 */
export type RunMarks = {
  readonly [K in 'cancelled' | 'pruned' | 'hold' | 'unheld' | 'released' | 'assignee' | 'unassigned' | 'labels']?: string;
} & {
  readonly said?: readonly string[];
};

/**
 * Who has the run in hand and how its last assignee ended, as the run's markers hold them, each where its record is there.
 * @param marks The run's markers.
 */
const assignedIn = (marks: RunMarks) => {
  const unassigned = marks.unassigned === undefined ? undefined : unassignedIn(marks.unassigned);
  return {
    ...(marks.assignee === undefined ? {} : { assignee: assigneeIn(marks.assignee) }),
    ...(unassigned ? { unassigned } : {}),
    ...(marks.released === undefined ? {} : { released: releasedIn(marks.released) }),
  } satisfies Pick<Run, 'assignee' | 'unassigned' | 'released'>;
};

/**
 * A run: its bare record (`recordIn`), with what people own beside it composed on read — the cancellation, its pruning, its hold, its
 * labels, what was said to its steps before each was filed (the markers, `RunMarks`), each approval at a gate and each loop a person ended
 * as it stands, and each person's route, off its asks. None of them is ever written into the record.
 * @param run The run's bare record.
 * @param asks The run's waiting asks.
 * @param marks The run's markers.
 */
export const composedRun = (run: Run, asks: readonly AskEntry[], marks: RunMarks) => {
  const [cancelled, pruned, hold, unheld, labels, saidBefore] = [
    marks.cancelled === undefined ? undefined : cancelledIn(marks.cancelled),
    marks.pruned === undefined ? undefined : prunedIn(marks.pruned),
    marks.hold === undefined ? undefined : holdIn(marks.hold),
    marks.unheld === undefined ? undefined : unheldIn(marks.unheld),
    marks.labels === undefined ? undefined : labelsIn(marks.labels),
    saidIn(marks.said ?? []),
  ];
  const { approvals, acceptances, routes, conditions } = within('asks', () => ({
    ...approvalsIn(asks),
    ...acceptancesIn(asks),
    routes: personRoutes(
      '',
      asks.map((a) => a.name),
      (name) => heldText(asks.find((a) => `/${a.name}` === name)?.text ?? ''),
    ),
    conditions: personConditions(
      asks.map((a) => a.name),
      (name) => heldText(asks.find((a) => a.name === name)?.text ?? ''),
    ),
  }));
  const standing = approvals.filter((a) => workStands(run, a));
  return {
    ...withConditions(withRoutes(run, routes), conditions),
    ...(labels ? { labels } : {}),
    ...(cancelled?.at ? { cancelledAt: cancelled.at } : {}),
    ...(cancelled?.at && cancelled.by ? { cancelledBy: cancelled.by } : {}),
    ...(pruned ? { pruned } : {}),
    ...(hold ? { hold } : {}),
    ...(unheld ? { unheld } : {}),
    ...assignedIn(marks),
    ...(saidBefore ? { saidBefore } : {}),
    ...(standing.length ? { approvals: standing } : {}),
    ...(acceptances.length ? { acceptances } : {}),
  } satisfies Run;
};

/**
 * A run's record as its text reads, bare: nothing a person owns beside it, and whatever it carries under their keys dropped, the store's
 * pause's, the run's labels and what was said before a step was filed (`pause`, `labels`, `saidBefore`, which the Run door composes)
 * with them. The frozen steps are read under the names their keys have now (`asNamed`), and written back under them, in their place among
 * the record's keys; a try's former `then` is read as its `cause` (`upgradeTries`), and a step's record written before `declared` was kept
 * is given it where its schema has not moved (`keptDeclared`). Counted as one record read (`countRecord`), its bytes as read (`countRead`).
 * Refused: a record that does not read as a run (`UnreadableRecord`).
 * @param id The run's id.
 * @param text The record's text.
 * @param where Where a person finds the record: its key.
 */
export const recordIn = (id: string, text: string, where: string) =>
  within('records', () => {
    countRecord();
    countRead(Buffer.byteLength(text, 'utf8'));
    let raw: unknown;
    try {
      raw = upgradeTries(JSON.parse(text));
    } catch (err) {
      if (!(err instanceof SyntaxError)) throw err;
      throw new UnreadableRecord(where, id, `is not JSON (${err.message})`);
    }
    if (!isRunRecord(raw)) throw new UnreadableRecord(where, id, recordRefusal(raw));
    const read = { ...raw };
    for (const key of [
      'approvals',
      'acceptances',
      'pruned',
      'hold',
      'unheld',
      'released',
      'assignee',
      'unassigned',
      'labels',
      'saidBefore',
      'pause',
      'cordon',
    ])
      delete read[key];
    const { workflow, ...unfrozen } = read;
    return (workflow ? keptDeclared({ ...read, workflow: workflow.map(asNamed) }) : unfrozen) satisfies Run;
  });

/**
 * A person's asks of a run, each a record of the keyspace under the run's asks (`askKey`, `src/runs/run-keys.ts`), named as its file was:
 * `retry-<step>-<n>` (`nemia retry`), `round-<step>-<round>` (`nemia retry --round`), `merge-<step>-<n>` (`nemia refresh --base`),
 * `approve-<step>-<n>` (`nemia approve` at a gate), `accept-<step>-<n>` (a loop a person ended as it stands) and `route-<step>-<n>`
 * (`nemia route`). The verb creates the ask, whole, and never touches it again; once the run's record answers it, the pass that writes the
 * record moves it under `done/` in the same transaction (`runs.settle`) — consumed, never edited. An approval and an acceptance stay while
 * they hold, read on every pass, until a later try of the step spends them (`spentApprovals`, `spentAcceptances`). Read here from what
 * each holds (`AskEntry`), and the readers take no path.
 */

/**
 * The approvals at a run's gates among its asks — each opens the gate of the try it names — and a line for each ask named as one that
 * cannot be read as one.
 * @param asks The run's waiting asks.
 */
export function approvalsIn(asks: readonly AskEntry[]) {
  const approvals: Approval[] = [];
  const notes: string[] = [];
  for (const { name, text, where } of asks) {
    const [, step, n] = /^approve-(.+)-(\d+)$/.exec(name) ?? [];
    if (step === undefined || n === undefined) continue;
    const read = approvalIn(text, step, Number(n));
    if (typeof read === 'string')
      notes.push(
        `${where}: ${read}, so it opens no gate — at the step's try now, take it back with nemia approve <runId> <step> --off and approve with nemia approve; one at any other key blocks no ask, and goes with the run (nemia rm)`,
      );
    else approvals.push(read);
  }
  return { approvals, notes };
}

/**
 * The ask files a person's verbs write (`nemia approve` at a gate and of a loop, `nemia retry` with `--round` and without), each checked
 * for what the verb refuses to write, in the order the verb checks it, so a file written by hand is held to the verb's word. `at` is read
 * leniently where the tick never reads it as a time (a round, a retry). A key none of them names is kept, as a newer `nemia` may write one.
 */
const Said = Schema.String.check(Schema.makeFilter((text: string) => text.trim() !== ''));
export const When = Schema.String.check(Schema.makeFilter((at: string) => !Number.isNaN(Date.parse(at))));
/** An amount an ask file may carry as its budget: dollars above zero, as `nemia retry --budget`, with `--round` or without, writes one. */
const Dollars = Schema.Finite.check(Schema.isGreaterThan(0));
const BUDGET_WORDS = 'its budget is not an amount of dollars above zero';

const Caps = Schema.Record(Schema.String, Dollars);
/** The tries of the work an ending's approval approved (`Approval.work`): a try is counted from 1. */
const Tries = Schema.Record(Schema.String, Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)));
const ApprovalFileSchema = Kept({
  at: When,
  message: Schema.optionalKey(Said),
  budgets: Schema.optionalKey(Caps),
  work: Schema.optionalKey(Tries),
});
const AcceptanceFileSchema = Kept({ at: When, message: Said });
const RoundAskFileSchema = Kept({ budget: Schema.optionalKey(Dollars), at: Schema.optionalKey(Schema.Unknown) });
const RetryAskFileSchema = Kept({
  mode: Schema.Literals(RETRY_MODES),
  model: Schema.optionalKey(Schema.NonEmptyString),
  message: Schema.optionalKey(Said),
  budget: Schema.optionalKey(Dollars),
  check: Schema.optionalKey(Schema.NonEmptyString),
  interrupted: Schema.optionalKey(Schema.NonEmptyString),
  at: Schema.optionalKey(Schema.Unknown),
});

/**
 * `program`, a read of a run's asks, counted as one call of `asks` while a pass is metered, each ask it reads counted inside it: as their
 * folder's walk was counted.
 * @param program The read of the run's asks.
 */
export const asksCounted = <A, E, R>(program: Effect.Effect<A, E, R>) => withinEffect('asks', program);

/**
 * An ask's JSON, or why it cannot be read.
 * @param text What the ask holds.
 */
export function heldText(text: string) {
  try {
    countRead(Buffer.byteLength(text, 'utf8'));
    return { read: JSON.parse(text) } satisfies { read: unknown } | { unreadable: string } as { read: unknown } | { unreadable: string };
  } catch (err) {
    return { unreadable: `unreadable (${err instanceof Error ? err.message : String(err)})` } satisfies
      | { read: unknown }
      | { unreadable: string } as { read: unknown } | { unreadable: string };
  }
}

/**
 * `value` read with `schema`, or the first key it refuses (`''` for the value itself, which holds no object).
 * @param schema The schema the value is read with.
 * @param value The value read.
 */
export function readAs<S extends Schema.ConstraintDecoder<unknown>>(schema: S, value: unknown) {
  const decoded = Schema.decodeUnknownResult(schema)(value);
  if (Result.isSuccess(decoded))
    return { read: decoded.success } satisfies { read: S['Type'] } | { refused: string } as { read: S['Type'] } | { refused: string };
  const [key] = firstRefusal(schema, value).path;
  return { refused: key === undefined ? '' : String(key) } satisfies { read: S['Type'] } | { refused: string } as
    | { read: S['Type'] }
    | { refused: string };
}

/** Why a message is refused: one that is not text, or one with nothing in it. */
const messageWords = (held: unknown) => (isText(fieldOf(held, 'message')) ? 'its message is empty' : 'its message is not text');

/** Why an approval file is refused, by the field refused: one written by hand where `nemia approve` would have refused it. */
const APPROVAL_WORDS: Record<string, string> = {
  at: 'it says no time it was given',
  budgets: 'its budgets are not dollars above zero',
  work: 'the tries of the work it approved are not counts from 1',
};
const NO_APPROVAL = 'it is not an approval nemia approve wrote';

/**
 * One approval file, read: the step and the try from its name, when and what was said from what it holds — or why it cannot be read.
 * @param text What the approval holds.
 * @param step The gated step, from the file's name.
 * @param n The try approved, from the file's name.
 */
export function approvalIn(text: string, step: string, n: number) {
  const held = heldText(text);
  if ('unreadable' in held) return held.unreadable;
  const read = readAs(ApprovalFileSchema, held.read);
  if ('refused' in read) return read.refused === 'message' ? messageWords(held.read) : (APPROVAL_WORDS[read.refused] ?? NO_APPROVAL);
  const { at, message, budgets, work } = read.read;
  return {
    step,
    try: n,
    at,
    ...(message === undefined ? {} : { message }),
    ...(budgets === undefined ? {} : { budgets: { ...budgets } }),
    ...(work === undefined ? {} : { work: { ...work } }),
    ...actorIn(fieldOf(held.read, 'actor')),
  };
}

/**
 * The acceptances of a run's loops among its asks — each ends the loop of the try it names — and a line for each ask named as one that
 * cannot be read as one.
 * @param asks The run's waiting asks.
 */
function acceptancesIn(asks: readonly AskEntry[]) {
  const acceptances: Acceptance[] = [];
  const notes: string[] = [];
  for (const { name, text, where } of asks) {
    const [, step, n] = /^accept-(.+)-(\d+)$/.exec(name) ?? [];
    if (step === undefined || n === undefined) continue;
    const read = acceptanceIn(text, step, Number(n));
    if (typeof read === 'string')
      notes.push(
        `${where}: ${read}, so it ends no loop — at the step's try now, take it back with nemia approve <runId> <step> --off and end the loop with nemia approve; one at any other key blocks no ask, and goes with the run (nemia rm)`,
      );
    else acceptances.push(read);
  }
  return { acceptances, notes };
}

/**
 * One acceptance file, read: the looping step and the try from its name, when and what was said from what it holds — or why it cannot be
 * read. What `nemia approve` refuses to write is refused here too, so a file written by hand is held to the verb's word: an acceptance with
 * no words ends a loop with findings open and tells the steps after it nothing, which is the whole of what it is for.
 * @param text What the acceptance holds.
 * @param step The looping step, from the file's name.
 * @param n The try accepted, from the file's name.
 */
export function acceptanceIn(text: string, step: string, n: number) {
  const held = heldText(text);
  if ('unreadable' in held) return held.unreadable satisfies Acceptance | string as Acceptance | string;
  const read = readAs(AcceptanceFileSchema, held.read);
  if ('refused' in read) {
    if (read.refused === 'at') return 'it says no time it was given' satisfies Acceptance | string as Acceptance | string;
    if (read.refused !== 'message')
      return 'it is not an acceptance nemia approve wrote' satisfies Acceptance | string as Acceptance | string;
    return (isText(fieldOf(held.read, 'message'))
      ? 'its message is empty, and an acceptance is nothing but its reason'
      : 'it says nothing of why the work is good enough with its findings open') satisfies Acceptance | string as Acceptance | string;
  }
  const { at, message } = read.read;
  return { step, try: n, at, message, ...actorIn(fieldOf(held.read, 'actor')) } satisfies Acceptance | string as Acceptance | string;
}

/**
 * The asks waiting among a run's — tries and rounds — and a line for each ask that names one and cannot be read as one, and for each
 * approval and acceptance that cannot be read (`approvalsIn`, `acceptancesIn`), said on the pass as an ask's is. Each read once.
 * @param asks The run's waiting asks.
 */
export function asksIn(asks: readonly AskEntry[]) {
  const read: AsksRead = { asks: [], rounds: [], notes: [] };
  read.notes.push(...approvalsIn(asks).notes, ...acceptancesIn(asks).notes);
  for (const { name, text, where } of asks) {
    const [, tried, triedN] = /^retry-(.+)-(\d+)$/.exec(name) ?? [];
    const [, again, againN] = /^round-(.+)-(\d+)$/.exec(name) ?? [];
    if (tried !== undefined && triedN !== undefined) {
      const ask = askIn(text, tried, Number(triedN));
      if (typeof ask === 'string')
        read.notes.push(
          `${where}: ${ask}, so it is not honoured — at the step's next try, take it back with nemia retry <runId> <step> --off and ask with nemia retry; one at any other key blocks no ask, and goes with the run (nemia rm)`,
        );
      else read.asks.push(ask);
    } else if (again !== undefined && againN !== undefined) {
      const ask = roundAskIn(text, again, Number(againN));
      if (typeof ask === 'string')
        read.notes.push(
          `${where}: ${ask}, so it is not honoured — at the loop's next round, take it back with nemia retry <runId> [<step>] --round --off and ask with nemia retry --round; one at any other key blocks no ask, and goes with the run (nemia rm)`,
        );
      else read.rounds.push(ask);
    }
  }
  return read;
}

/**
 * One round ask file, read: the looping step and the round from its name, when from what it holds — or why it cannot be read.
 * @param text What the round ask holds.
 * @param step The looping step, from the file's name.
 * @param round The round asked for, from the file's name.
 */
export function roundAskIn(text: string, step: string, round: number) {
  const held = heldText(text);
  if ('unreadable' in held) return held.unreadable satisfies RoundAsk | string as RoundAsk | string;
  const read = readAs(RoundAskFileSchema, held.read);
  if ('refused' in read)
    return (read.refused === 'budget' ? BUDGET_WORDS : 'it is not an ask nemia retry --round wrote') satisfies RoundAsk | string as
      | RoundAsk
      | string;
  const { at, budget } = read.read;
  return {
    step,
    round,
    ...(budget === undefined ? {} : { budget }),
    at: isText(at) ? at : '',
    ...actorIn(fieldOf(held.read, 'actor')),
  } satisfies RoundAsk | string as RoundAsk | string;
}

/** Why an ask file cannot be read, by the field its schema refused (`refused`) of what it holds (`held`). */
function askRefusal(refused: string, held: unknown) {
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
 * @param text What the ask holds.
 * @param step The step, from the file's name.
 * @param n The try asked for, from the file's name.
 */
export function askIn(text: string, step: string, n: number) {
  const held = heldText(text);
  if ('unreadable' in held) return held.unreadable satisfies RetryAsk | string as RetryAsk | string;
  const read = readAs(RetryAskFileSchema, upgradeAsk(held.read));
  if ('refused' in read) return askRefusal(read.refused, held.read) satisfies RetryAsk | string as RetryAsk | string;
  const { mode, model, message, budget, check, interrupted, at } = read.read;
  if (check !== undefined && mode !== 'recheck')
    return 'it names a check and asks for no recheck: only a recheck runs one check again' satisfies RetryAsk | string as RetryAsk | string;
  if (message !== undefined && mode === 'recheck')
    return 'it carries a message and asks for a recheck, which files no session to read it' satisfies RetryAsk | string as
      | RetryAsk
      | string;
  if (budget !== undefined && mode === 'recheck')
    return 'it carries a budget and asks for a recheck, which files no session to spend it' satisfies RetryAsk | string as
      | RetryAsk
      | string;
  return {
    step,
    try: n,
    mode,
    ...(model === undefined ? {} : { model }),
    ...(message === undefined ? {} : { message }),
    ...(budget === undefined ? {} : { budget }),
    ...(check === undefined ? {} : { check }),
    ...(interrupted === undefined ? {} : { interrupted }),
    at: isText(at) ? at : '',
    ...actorIn(fieldOf(held.read, 'actor')),
  } satisfies RetryAsk | string as RetryAsk | string;
}

/**
 * Every ask that carried a message — still waiting, or consumed under `done/` — for what `nemia ls` and `nemia decide` say of a try that
 * was answered (`answerOf`). Composed on read, as the ask itself is: the run's record keeps no message. An ask that cannot be read is left
 * out; the tick's own read (`asksIn`) says why. An ask a person took back (`takenBack`) is no answer, and is left out too.
 * @param asks The run's asks, waiting and spent, each by its name, a spent one's under `done/`.
 */
export function answersIn(asks: readonly AskEntry[]) {
  const answers: RetryAsk[] = [];
  for (const { name, text } of asks) {
    const [, step, n] = /^(?:done\/)?retry-(.+)-(\d+)(?:\.\d+)?$/.exec(name) ?? [];
    const ask = step !== undefined && n !== undefined && !takenBackIn(text) ? askIn(text, step, Number(n)) : undefined;
    if (ask && typeof ask !== 'string' && ask.message !== undefined) answers.push(ask);
  }
  return answers;
}

/** Whether an ask's text says a person took it back (`takenBack`): its words were never told to a step, so are no answer. */
function takenBackIn(text: string) {
  const held = heldText(text);
  return 'read' in held && held.read !== null && typeof held.read === 'object' && 'takenBack' in held.read;
}

/**
 * A record as the keyspace holds it: compact JSON, without what a person owns beside it (the approvals, acceptances, pruning, hold and a
 * person's routes and the conditions written for its steps a read composed onto it, `unrouted`, `unconditioned`), nor the pause, labels and
 * words said before a step was filed the Run door did. It
 * takes the run as a pass or `nemia start` writes it.
 */
export const recordValue = ({
  approvals: _,
  acceptances: __,
  pruned: ___,
  hold: ____,
  labels: ______,
  pause: _____,
  saidBefore: _______,
  ...run
}: Run) => JSON.stringify(unconditioned(unrouted(run)));

/**
 * The directory the run makes for a step's files: screenshots, logs, reports — for the steps after it
 * and the person who decides.
 *
 * Beside the run's record, outside every workspace: a file written
 * into a worktree is committed by the next hand-off and rides the branch, and a gitignored one never
 * reaches the next step's worktree at all. `advance` makes it before it files the step, tells the step in
 * its brief (`artifactsContract`), and hands it to the step's check as `WF_ARTIFACTS`.
 * @param home The store's root folder.
 * @param run The run, by its id.
 * @param step The step's name.
 */
export const artifactsDir = (home: string, run: Pick<Run, 'id'>, step: string) => path.join(runsDir(home), run.id, 'artifacts', step);

/**
 * The directory `nemia start --input` copies a run's files into: the run's own, beside its artifacts and outside every workspace, so a file
 * a person gave the run reaches each step without riding a branch. Named on each brief (`inputsLine`) with the names on the record.
 *
 * Outside every workspace is what a folder run's steps cannot reach: they run in `dontAsk`, fenced to their own folder. So a folder run
 * copies this directory into each folder it makes (`folderPlace.make`), and their briefs name that copy. The path itself is
 * `places.store.ts`'s (`inputsRoot`), as that is where the copy is read from.
 * @param home The store's root folder.
 * @param run The run, by its id.
 */
export const inputsDir = (home: string, run: Pick<Run, 'id'>) => inputsRoot(runsDir(home), run.id);

/**
 * The directory `nemia start --card` copies each card a run is handed into, as `<name>.md`: `cards/` under its inputs (`inputsDir`).
 * @param home The store's root folder.
 * @param run The run, by its id.
 */
export const cardsDir = (home: string, run: Pick<Run, 'id'>) => path.join(inputsDir(home, run), CARDS_FOLDER);

/**
 * What is at a path, its link not followed: undefined where nothing is.
 * @param p The path.
 */
export const lstatOf = (p: string) => fs.lstatSync(p, { throwIfNoEntry: false });

/**
 * The regular file at `rel` under `dir`, looked at without following a link (`lstat`), each folder on the way a folder of its own and
 * no link: a link, to a file or a folder, may lead out of `dir`, and what it leads to is not under it. Undefined for a path
 * `isFilePath` refuses, a file not there, a folder, or a link anywhere on the way.
 * @param dir The folder.
 * @param rel The file's path under it.
 */
export function statUnder(dir: string, rel: string) {
  if (!isFilePath(rel)) return undefined;
  const parts = rel.split('/');
  let at = dir;
  for (const [i, part] of parts.entries()) {
    at = path.join(at, part);
    const stat = fs.lstatSync(at, { throwIfNoEntry: false });
    if (i === parts.length - 1) return stat?.isFile() ? stat : undefined;
    if (!stat?.isDirectory()) return undefined;
  }
  return undefined;
}

/**
 * Whether a path is a directory, a link to one followed: false where nothing is there.
 * @param at The path.
 */
export const isDirectory = (at: string) => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/**
 * A run id a person can read.
 *
 * The engine lets the caller choose task ids, and a session's name is built from one — so the id
 * IS what a human sees in `claude agents`. `t-mtxvs3nw-f4763a59` tells them nothing;
 * `add-split-workflow-8imz` tells them which piece of work they are looking at, and the step
 * suffix tells them which part of it. The random tail keeps two runs of the same request apart.
 * @param brief The run's brief, whose words the id is made of.
 */
export const runId = (brief: string) => {
  const slug = brief
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28)
    .replace(/-$/, '');
  return `${slug || 'run'}-${Math.random().toString(36).slice(2, 6)}`;
};
