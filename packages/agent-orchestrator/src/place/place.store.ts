/**
 * A place skill's verbs, run and heard (`place.ts` holds the contract): `runPlaceVerb` runs one verb's script from a skill's folder and
 * decodes what it prints into one of three outcomes, and `readPlaceJson` decodes the skill's `place.json`. What a script prints is read
 * by a schema per answer, each held to its type in `place.ts`: a field missing or of another type is no answer, and a field the contract
 * does not name is dropped. `openPlace` is a start's use of a place, and `placeDirOf` the one answer to where a run's place runs from.
 */
import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema, SchemaIssue } from 'effect';
import {
  PLACE_CONTRACT,
  PLACE_DEADLINE_MS,
  PLACE_VERBS,
  type Changes,
  type HandedOff,
  type Inventory,
  type Landed,
  type Made,
  missingVerbsRefusal,
  type Opened,
  type PlaceAnswers,
  type PlaceDeclared,
  type PlaceOutcome,
  type PlaceRequests,
  type PlaceVerb,
  type Removed,
  type Standing,
  type Status,
  type Trials,
} from './place.ts';
import { Invalid } from '../refusal/refusal.ts';
import { skillVersion } from '../folder/folder.store.ts';
import type { GitRun } from '../record/record.ts';

const Strings = Schema.Array(Schema.String);
const Count = Schema.NullOr(Schema.Int);

const OpenedSchema = Schema.Struct({ repo: Schema.String, baseRef: Schema.String, branch: Schema.String }) satisfies Schema.Schema<Opened>;

const MadeSchema = Schema.Struct({
  workspace: Schema.String,
  branch: Schema.String,
  conflicts: Strings,
  notes: Strings,
}) satisfies Schema.Schema<Made>;

const HandedOffSchema = Schema.Struct({ commit: Schema.NullOr(Schema.String) }) satisfies Schema.Schema<HandedOff>;

const ChangedFileSchema = Schema.Struct({
  path: Schema.String,
  from: Schema.optionalKey(Schema.String),
  status: Schema.String,
  added: Count,
  removed: Count,
});

const TrialMergeSchema = Schema.Union([
  Schema.Struct({ clean: Schema.Literal(true) }),
  Schema.Struct({ clean: Schema.Literal(false), conflicts: Strings }),
  Schema.Struct({ unknown: Schema.String }),
]);

const ChangesSchema = Schema.Struct({
  at: Schema.Struct({ baseRef: Schema.String, onto: Schema.String, tips: Schema.Record(Schema.String, Schema.String) }),
  files: Schema.Record(Schema.String, Schema.Array(ChangedFileSchema)),
  diffs: Schema.Record(Schema.String, Schema.String),
  merges: Schema.Record(Schema.String, TrialMergeSchema),
  present: Schema.Record(Schema.String, Schema.Literals(['file', 'directory', 'absent'])),
  atBase: Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
}) satisfies Schema.Schema<Changes>;

const StandingSchema = Schema.Struct({
  heads: Schema.Record(Schema.String, Schema.String),
  branches: Schema.Array(
    Schema.Struct({
      branch: Schema.String,
      tip: Schema.NullOr(Schema.String),
      onBase: Schema.Literals(['yes', 'no', 'unknown']),
      pastBase: Schema.NullOr(Schema.Boolean),
      ahead: Count,
    }),
  ),
}) satisfies Schema.Schema<Standing>;

const TrialsSchema = Schema.Struct({
  at: Schema.Record(Schema.String, Schema.NullOr(Schema.String)),
  trials: Schema.Array(TrialMergeSchema),
}) satisfies Schema.Schema<Trials>;

const StatusSchema = Schema.Struct({
  merging: Schema.Literals(['ours', 'other', 'none']),
  conflicted: Schema.Boolean,
  missing: Strings,
  head: Schema.optionalKey(Schema.String),
}) satisfies Schema.Schema<Status>;

const LandedSchema = Schema.Union([
  Schema.Struct({ commit: Schema.String }),
  Schema.Struct({ aborted: Schema.Literal(true) }),
]) satisfies Schema.Schema<Landed>;

const InventorySchema = Schema.Struct({
  workspaces: Schema.Array(
    Schema.Struct({
      path: Schema.String,
      step: Schema.optionalKey(Schema.String),
      branch: Schema.optionalKey(Schema.String),
      head: Schema.optionalKey(Schema.String),
      detached: Schema.Boolean,
      locked: Schema.optionalKey(Schema.String),
      prunable: Schema.Boolean,
      clean: Schema.NullOr(Schema.Boolean),
      onBranch: Schema.Boolean,
    }),
  ),
  branches: Schema.Array(Schema.Struct({ branch: Schema.String, merged: Schema.Boolean })),
}) satisfies Schema.Schema<Inventory>;

const RemovedSchema = Schema.Struct({
  removed: Strings,
  left: Schema.Array(Schema.Struct({ path: Schema.String, said: Schema.String })),
  deleted: Strings,
  kept: Schema.Array(Schema.Struct({ branch: Schema.String, said: Schema.String })),
}) satisfies Schema.Schema<Removed>;

/** Each verb's answer, as its schema decodes it. */
const ANSWERS: { readonly [V in PlaceVerb]: Schema.Codec<PlaceAnswers[V], unknown> } = {
  open: OpenedSchema,
  make: MadeSchema,
  handoff: HandedOffSchema,
  report: ChangesSchema,
  standing: StandingSchema,
  trial: TrialsSchema,
  status: StatusSchema,
  land: LandedSchema,
  inventory: InventorySchema,
  remove: RemovedSchema,
};

const RefusedSchema = Schema.Struct({ refused: Schema.String });

const PlaceDeclaredSchema = Schema.Struct({
  v: Schema.Literal(PLACE_CONTRACT),
  verbs: Schema.Array(Schema.Literals(PLACE_VERBS)),
  denyWhileLanding: Strings,
  say: Schema.Struct({
    look: Strings,
    readResult: Schema.String,
    ship: Schema.String,
    drop: Schema.String,
    conflicts: Schema.String,
    unlock: Schema.String,
  }),
}) satisfies Schema.Schema<PlaceDeclared>;

/** The most of a script's words kept in `said`, and of a value quoted in it. */
const SAID_LINES = 4;
const QUOTED = 60;

/** A value quoted into a sentence, cut at `QUOTED` characters. */
const quoted = (text: string): string => (text.length > QUOTED ? `${text.slice(0, QUOTED)}…` : text);

/** The first field a value does not decode at, and why: `` `a.b` is missing `` or `` `a.b` is "x", where string is expected ``. */
function firstWrong(value: unknown, error: Schema.SchemaError): string {
  const [first] = SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues;
  const keys = (first?.path ?? []).map((p) => (typeof p === 'object' && p !== null && 'key' in p ? p.key : p));
  const found = keys.reduce<unknown>(
    (at, key) => (typeof at === 'object' && at !== null ? (at as Record<PropertyKey, unknown>)[key] : undefined),
    value,
  );
  const where = keys.length ? `\`${keys.map(String).join('.')}\`` : 'the whole';
  const message = first?.message ?? 'is not the contract';
  if (message === 'Missing key') return `${where} is missing`;
  return `${where} is ${quoted(JSON.stringify(found) ?? 'undefined')}, where ${message.replace(/^Expected /, '').replace(/ \| undefined$/, '')} is expected`;
}

/** How long a script's process group, stopped at its deadline, is given to end on SIGTERM before it is killed. */
const STOP_GRACE_MS = 2000;

/** How often a stopped group is asked whether it has ended. */
const STOP_POLL_MS = 20;

/** Signal the process group `pgid` leads; false when it has no process left, or cannot be signalled. */
function signalGroup(pgid: number, signal: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pgid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether the process group `pgid` leads has no process left within `STOP_GRACE_MS`, asked every `STOP_POLL_MS`. The grace is measured on
 * this process's monotonic clock (`performance.now()`), so a wall clock stepped forward never ends it early.
 */
function emptied(pgid: number): boolean {
  const pause = new Int32Array(new SharedArrayBuffer(4));
  const until = performance.now() + STOP_GRACE_MS;
  while (performance.now() < until) {
    if (!signalGroup(pgid, 0)) return true;
    Atomics.wait(pause, 0, 0, STOP_POLL_MS);
  }
  return !signalGroup(pgid, 0);
}

/**
 * Stop what is left of the process group `pgid` leads: SIGTERM, on which git takes its locks away; then, when a process of it is still
 * there after `STOP_GRACE_MS`, SIGKILL, and wait as long again for it to be gone. Returns whether it had to kill. Never throws.
 */
function stopGroup(pgid: number): boolean {
  if (!signalGroup(pgid, 'SIGTERM') || emptied(pgid)) return false;
  signalGroup(pgid, 'SIGKILL');
  emptied(pgid);
  return true;
}

/** The last lines a script wrote on stderr, joined for one line, or the empty string. */
function lastLines(stderr: string): string {
  return stderr
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-SAID_LINES)
    .join(' / ');
}

/** Whether a script was stopped at its deadline. */
const pastDeadline = (ran: SpawnSyncReturns<string>): boolean =>
  ran.error !== undefined && 'code' in ran.error && ran.error.code === 'ETIMEDOUT';

/**
 * Why a finished script gave no answer, or undefined when it exited 0 and its stdout is to be read. `killed` says a process it started
 * outlived SIGTERM at its deadline and was killed.
 */
function unheard(ran: SpawnSyncReturns<string>, deadlineMs: number, killed: boolean): string | undefined {
  const words = lastLines(ran.stderr ?? '');
  const tail = words ? `: ${words}` : '';
  const kill = killed
    ? `, and a process it started outlived SIGTERM for ${STOP_GRACE_MS / 1000} s and was killed, so a lock it held may be left`
    : '';
  if (pastDeadline(ran)) return `it gave no answer within ${deadlineMs / 1000} s, its deadline, and was stopped${kill}${tail}`;
  if (ran.error) return `it could not be run: ${ran.error.message}`;
  if (ran.signal) return `it was ended by ${ran.signal}${tail}`;
  if (ran.status !== 0) return words || `it exited ${ran.status ?? 'with no status'}`;
  return undefined;
}

/** What a script that exited 0 printed, read as the verb's answer or a refusal; the reason it reads as neither, as a string. */
function heard<V extends PlaceVerb>(verb: V, stdout: string): { readonly answer: PlaceAnswers[V] } | { readonly refused: string } | string {
  let printed: unknown;
  try {
    printed = JSON.parse(stdout);
  } catch {
    return stdout.trim() ? `its answer is not JSON: ${quoted(stdout.trim())}` : 'it printed no answer';
  }
  const refused = Schema.decodeUnknownResult(RefusedSchema)(printed);
  if (Result.isSuccess(refused)) return { refused: refused.success.refused };
  const schema: Schema.Codec<PlaceAnswers[V], unknown> = ANSWERS[verb];
  const answer = Schema.decodeUnknownResult(schema)(printed);
  if (Result.isSuccess(answer)) return { answer: answer.success };
  return `its answer does not read as ${verb}'s: ${firstWrong(printed, answer.failure)}`;
}

/**
 * Run `verb` of the place skill in `skillDir`: `node <skillDir>/scripts/<verb>.ts` in `skillDir`, `request` on stdin with `v` added, within
 * the verb's deadline (`PLACE_DEADLINE_MS`) unless `deadlineMs` says another, in `env` (this process's when none is given).
 *
 * Returns the verb's decoded answer; `{ refused }` when the script refused at exit 0; or `{ unread }`, with its last stderr lines or the
 * reason, for anything else — no script, a non-zero exit, a signal, the deadline passed, or a stdout that does not decode. Never throws for
 * what the script did. The script leads a process group of its own; past its deadline it is killed, and what it started (git, git's hooks
 * and filters) is sent SIGTERM, so git takes its locks away, then SIGKILL after `STOP_GRACE_MS`. A process that leaves the group is not
 * stopped.
 */
export function runPlaceVerb<V extends PlaceVerb>(
  skillDir: string,
  verb: V,
  request: PlaceRequests[V],
  options: { readonly deadlineMs?: number; readonly env?: NodeJS.ProcessEnv } = {},
): PlaceOutcome<V> {
  const unread = (said: string): PlaceOutcome<V> => ({ unread: { verb, said, at: new Date().toISOString() } });
  const script = path.join(skillDir, 'scripts', `${verb}.ts`);
  if (!fs.existsSync(script)) return unread(`the place has no script for ${verb}: ${script} is not there`);
  const deadlineMs = options.deadlineMs ?? PLACE_DEADLINE_MS[verb];
  const spawned: SpawnSyncOptionsWithStringEncoding & { readonly detached: boolean } = {
    cwd: skillDir,
    input: JSON.stringify({ ...request, v: PLACE_CONTRACT }),
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: deadlineMs,
    killSignal: 'SIGKILL',
    maxBuffer: 256 * 1024 * 1024,
    env: options.env ?? process.env,
    detached: true,
  };
  const ran = spawnSync(process.execPath, [script], spawned);
  const killed = pastDeadline(ran) && ran.pid > 0 && stopGroup(ran.pid);
  const why = unheard(ran, deadlineMs, killed);
  if (why !== undefined) return unread(why);
  const answer = heard(verb, ran.stdout);
  return typeof answer === 'string' ? unread(answer) : answer;
}

/**
 * The place skill in `skillDir` as its `place.json` declares it, decoded strictly. Refuses (`Invalid`, naming the file and the fix) a
 * file that is not there or not JSON, one whose first wrong field does not read as contract `v` 1 — an unknown verb, a `say` key missing —
 * and a declared verb with no script in `scripts/`.
 */
export function readPlaceJson(skillDir: string): PlaceDeclared {
  const file = path.join(skillDir, 'place.json');
  const fix = `write it as contract v ${PLACE_CONTRACT} has it: { "v", "verbs", "denyWhileLanding", "say" }`;
  if (!fs.existsSync(file)) throw new Invalid({ message: `${file} is not there, and a place skill declares itself in it: ${fix}` });
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Invalid({ message: `${file} is not JSON (${(err as Error).message}): ${fix}` });
  }
  const decoded = Schema.decodeUnknownResult(PlaceDeclaredSchema)(raw);
  if (Result.isFailure(decoded))
    throw new Invalid({ message: `${file} does not read as a place's declaration: ${firstWrong(raw, decoded.failure)}; ${fix}` });
  const scriptless = decoded.success.verbs.filter((verb) => !fs.existsSync(path.join(skillDir, 'scripts', `${verb}.ts`)));
  if (scriptless.length)
    throw new Invalid({
      message: `${file} declares ${scriptless.join(', ')}, and scripts/ has no ${scriptless.map((v) => `${v}.ts`).join(', ')}: add the script, or take the verb off \`verbs\``,
    });
  return decoded.success;
}

/** The git place the package ships, run where a record names no place skill of its own. */
export const SHIPPED_PLACE = path.join(import.meta.dirname, '..', '..', 'place', 'git');

/** The name a record gives the package's place (`placeSkill.skill`): the one `place: git` resolves to. */
export const SHIPPED_PLACE_SKILL = 'git';

/**
 * The directory a git run's place verbs run from: the package's place (`SHIPPED_PLACE`) for a record that names none and for one that
 * names `SHIPPED_PLACE_SKILL`. Refuses (`Invalid`) a record that names another skill, which this nemia does not ship.
 */
export function placeDirOf(run: Pick<GitRun, 'id' | 'placeSkill'>): string {
  const skill = run.placeSkill?.skill;
  if (skill === undefined || skill === SHIPPED_PLACE_SKILL) return SHIPPED_PLACE;
  throw new Invalid({
    message: `run ${run.id} names the place skill ${skill}, and this nemia ships only ${SHIPPED_PLACE_SKILL}: read its store with the nemia that started it`,
  });
}

/** What `openPlace` answers: the repository `open` read, and the place skill it ran, as a record names it. */
export type OpenedPlace = { readonly opened: Opened; readonly placeSkill: { readonly skill: string; readonly version: string } };

/**
 * A git run's place, opened at `nemia start` on `root`: the skill in `skillDir` read (`readPlaceJson`), every verb of `needed` declared,
 * its version taken (`skillVersion`), and its `open` verb run. Refuses (`Invalid`) a `place.json` that does not read or leaves out a verb
 * of `needed` (`missingVerbsRefusal`), a folder with no SKILL.md, an `open` that refuses, in its own words, and one that is not heard,
 * with why.
 */
export function openPlace(skillDir: string, root: string, needed: readonly PlaceVerb[]): OpenedPlace {
  const declared = readPlaceJson(skillDir);
  const missing = missingVerbsRefusal(path.join(skillDir, 'place.json'), declared, needed);
  if (missing) throw new Invalid({ message: missing });
  const version = skillVersion(skillDir);
  if (version === null)
    throw new Invalid({ message: `${skillDir} has no SKILL.md, so it is no skill to run a place from: write its SKILL.md there` });
  const outcome = runPlaceVerb(skillDir, 'open', { root });
  if ('refused' in outcome) throw new Invalid({ message: outcome.refused });
  if ('unread' in outcome)
    throw new Invalid({ message: `the place's open was not heard: ${outcome.unread.said}. Nothing was started: start it again` });
  return { opened: outcome.answer, placeSkill: { skill: SHIPPED_PLACE_SKILL, version } };
}

/**
 * Whether each `{ onto, branch }` of `trials` merges in `repo`, as the place in `skillDir` answers its `trial` verb: each base's commit
 * now, and each trial in the order asked. Asks nothing for no trial. A refusal, an unread outcome, or an answer with another count of
 * trials than asked is never a verdict: every trial is then `{ unknown }` in words that say why, and every base's commit null.
 */
export function trialMerges(repo: string, trials: readonly { readonly onto: string; readonly branch: string }[], skillDir: string): Trials {
  if (!trials.length) return { at: {}, trials: [] };
  const outcome = runPlaceVerb(skillDir, 'trial', { repo, trials });
  if ('answer' in outcome && outcome.answer.trials.length === trials.length) return outcome.answer;
  const unknown =
    'refused' in outcome
      ? outcome.refused
      : 'unread' in outcome
        ? `the trial merge was not heard: ${outcome.unread.said}`
        : `the place answered ${outcome.answer.trials.length} trial${outcome.answer.trials.length === 1 ? '' : 's'} for the ${trials.length} asked`;
  return {
    at: Object.fromEntries(trials.map((t) => [t.onto, null])),
    trials: trials.map(() => ({ unknown })),
  };
}
