/**
 * Resolving a run's kinds now, and the person's ask to take the new ones.
 *
 * `pinsOf` reads the four kinds a run resolves — its workflow folder, each step's agent, each skill those agents are given, and its
 * factory's rules — digests each as the package already digests it, gives each its number in the ledger (`appendRevision`) and answers with
 * the run's pins. `resolvedNow` does that for a run that has filed nothing, reading the folder again so an edit made while the run waited
 * reaches its first step; `refreshedNow` does it for a run that has filed, keeping the step set it already names — on a person's ask, or
 * where the run's factory follows revisions (`revisions: follow`) and a filing is due (`followPass`). `refreshRun` is
 * `nemia refresh <run>`: it writes a person's ask that the next pass re-pins on. `driftNow` is what the run's next filing would take,
 * against its pins, read and numbered without a write: the board's band, and, for a pinned run, the feed's `revisions behind`
 * (`behindNow`).
 *
 * A controller: it gathers digests from four stores, which only a controller may do (`CONTROLLER` in `test/boundary.test.ts`).
 */
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { Cache, Cause, Effect } from 'effect';
import { AGENTS_FOLDER, type Workflow } from '../step/step.ts';
import { stepSetRefusal, unallowedRefusal } from '../workflow/index.ts';
import { lookupRoots, type Places } from '../skills/read.store.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { writeAgentFiles } from '../agents/agents.store.ts';
import { workflowVersion } from '../folder/version.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { WorkflowDir } from '../folder/folder.model.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { factoryFills, rulesVersion } from '../rules/rules.store.ts';
import { DEFAULT_FACTORY, revisionsOf, type Factory } from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import { runStore } from '../record/files.store.ts';
import { within, withinEffect } from '../meter/tally.store.ts';
import { stepsOf } from '../record/steps.store.ts';
import { hasStarted } from '../wait/wait.ts';
import { Conflict } from '../refusal/refusal.ts';
import type { SkillsFound } from '../agents/agents.ts';
import type { Run } from '../record/record.ts';
import { repoAllows, type Allows } from '../trust/allows.verb.ts';
import { appendRevision, ledgerOf } from './revisions.store.ts';
import { kindsDrift, revisionNow, stepsDrift, type Drift, type KindName, type Pin, type Revision, type RevisionKind } from './revisions.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { firstPiece } from '../piece/piece.ts';

/** What a run resolved on a pass: the steps it now holds, and the revision of each kind they were read at. */
export type Resolved = { steps: Workflow[]; pins: Pin[] };

/** Why a pass took nothing of the world and the run keeps what it froze, in one line, for the note the pass says. */
export type Kept = { kept: string };

/** A refusal's or an error's first line, which is what a note on the feed has room for. */
const firstLine = (said: string): string => firstPiece(said, '\n');

/** The factory a run was started in, read; none for the default factory, which is no file. */
const factoryOf = (run: Pick<Run, 'factory'>): Factory | undefined =>
  run.factory === undefined || run.factory === DEFAULT_FACTORY ? undefined : readFactory(run.factory);

/** The name a workflow folder is known by, within its kind: the folder's own, as a factory attaches it. */
const workflowName = (dir: string): string => path.basename(path.resolve(dir));

/**
 * The run's workflow folder read now through the Workflow door, with its factory's hires and rules filled in as `nemia start` filled
 * them (`factoryFills`). The folder is the run's stored record's, which names it as it was resolved at the start.
 *
 * Lenient where `nemia start` refuses: a folder whose factory no longer attaches the workflow, or whose rules file has stopped reading, is
 * loaded with what reads, since nothing is being started here — a run that has already frozen a workflow keeps it, and this is only read to
 * see whether the content moved. A folder that does not load at all fails, and its caller keeps the freeze.
 */
const stepsNow = (
  run: Pick<Run, 'workflowDir' | 'repo' | 'factory'>,
  places: Places,
  factory: Factory | undefined,
): Effect.Effect<Workflow[], Refusal> =>
  Effect.gen(function* () {
    const fills = factory ? factoryFills(factory, workflowName(run.workflowDir)).fills : undefined;
    return yield* (yield* WorkflowDoor).workflows.read(WorkflowDir.read(run.workflowDir), places, fills);
  });

/** The agents and skills `steps` name, each once, in the order the steps run. */
function kindsIn(run: Pick<Run, 'workflowDir' | 'factory'>, steps: readonly Workflow[]): KindName[] {
  const named: KindName[] = [{ kind: 'workflow', name: workflowName(run.workflowDir) }];
  for (const step of steps) {
    const agent = step.agent;
    if (!agent) continue;
    named.push({ kind: 'agent', name: agent.name });
    for (const skill of agent.skills ?? []) named.push({ kind: 'skill', name: skill });
  }
  if (run.factory !== undefined && run.factory !== DEFAULT_FACTORY) named.push({ kind: 'rules', name: run.factory });
  return named.filter((k, i) => named.findIndex((o) => o.kind === k.kind && o.name === k.name) === i);
}

/**
 * The digest of one kind and name as the package already takes it, read through the doors: a workflow folder's files, agents and added
 * skills (`workflowVersion`), an agent's file and its skills, counted as found beside the workflow (the Agent door's `there`), a skill's
 * folder (the Skill door's `there`), a factory's rules (`rulesVersion`). Null for a kind that is not there — an agent no root holds, a
 * skill folder no skill is in, a factory with no rules — which is pinned at no revision and left out of the run's pins.
 */
const digestFor = (
  of: KindName,
  run: Pick<Run, 'workflowDir' | 'factory'>,
  places: Places,
  factory: Factory | undefined,
  found: SkillsFound,
): Effect.Effect<string | null, Refusal> =>
  Effect.gen(function* () {
    if (of.kind === 'workflow') return yield* workflowVersion(run.workflowDir, places);
    if (of.kind === 'rules') return factory ? rulesVersion(factory) : null;
    if (of.kind === 'skill') {
      const at = found.at.get(of.name);
      if (typeof at !== 'string') return null;
      const there = yield* (yield* SkillDoor).skills.there(SkillName.read(path.basename(at)), path.dirname(at));
      return there.kind === 'held' ? there.version : null;
    }
    const agents = yield* AgentDoor;
    for (const root of lookupRoots(run.workflowDir, places)) {
      const there = yield* agents.agents.there(AgentName.read(of.name), { dir: path.join(root, AGENTS_FOLDER), skills: found });
      if (there.kind === 'held') return there.version;
    }
    return null;
  });

/** A folder's run, as every memo of a pass's reader is keyed on it: the folder, the repository it looks beside, and its factory. */
type FolderRun = Pick<Run, 'workflowDir' | 'repo' | 'factory'>;

/**
 * `f` read once for each `key`, its outcome kept — a throw included, kept and thrown again — and each read of the world charged to the
 * `revisions` phase while a pass is metered (`within`): the memo of the pass's synchronous reads, the factory, the allow rules and the
 * ledger's numbers, whose stores are not yet behind a door this reader yields. The reads through a door are `Cache`s (`passRevisions`). A
 * key is exactly what its `f` reads, so a memo never answers for a world it did not read; `key` is given the same arguments as `f`, and
 * may take fewer than it, leaving out those `f` does not read by (a stamp).
 */
function once<A extends unknown[], T>(f: (...args: A) => T, key: (...args: A) => string): (...args: A) => T {
  const held = new Map<string, { value: T } | { thrown: unknown }>();
  return (...args: A): T => {
    const k = key(...args);
    let had = held.get(k);
    if (!had) {
      try {
        had = { value: within('revisions', () => f(...args)) };
      } catch (err) {
        had = { thrown: err };
      }
      held.set(k, had);
    }
    if ('thrown' in had) throw had.thrown;
    return had.value;
  };
}

/**
 * What one pass reads once for every run whose kinds it resolves: the factory a run is in, its workflow folder loaded, the skills found
 * beside that folder (the Skill door's `found`), the allow rules that folder's repository grants a session, the digest of one kind and
 * name (through the Agent, Skill and Workflow doors), and a kind's entry in the ledger — appended where the content is new (`revision`),
 * or only read (`looked`), which writes nothing. Ten runs waiting on one folder read and digest that folder once a pass between them, not
 * ten times, and the reads are charged to the `revisions` phase.
 *
 * It shares a read of the world, never a judgement: what stays per run is judged per run — `stepSetRefusal` on the run's own `isolate`,
 * `refreshedNow`'s intersection with the step set the run already names, the `rules` kind named by the run's own factory, and the steps
 * each run is handed, which are its own copy. A read that fails is kept as the failure it was (a `Cache` keeps the `Exit`), so a folder
 * that has stopped reading costs one read a pass and every run on it still says `unread` for itself.
 *
 * Made by the pass and dropped with it (`PassRead`): nothing is carried between passes, and a one-off verb that is handed none reads the
 * world for itself.
 */
export type PassRevisions = {
  readonly factory: (run: Pick<Run, 'factory'>) => Factory | undefined;
  readonly skills: (run: FolderRun) => Effect.Effect<SkillsFound, Refusal>;
  readonly steps: (run: FolderRun) => Effect.Effect<Workflow[], Refusal>;
  readonly allows: (run: FolderRun) => Allows;
  readonly digest: (of: KindName, run: FolderRun) => Effect.Effect<string | null, Refusal>;
  readonly revision: Numbering;
  readonly looked: Numbering;
};

/** How a digest is given its number in the ledger: appended where it is new (`appendRevision`), or read only (`revisionNow`). */
type Numbering = (kind: RevisionKind, name: string, hash: string, at: string) => Revision;

/** The number `hash` stands at for `kind` and `name`, read off the ledger and never appended: the next number for a content it lacks. */
const lookedUp: Numbering = (kind, name, hash, at) => revisionNow(ledgerOf(kind, name), hash, at);

/** As many keys as one pass's `Cache` holds: more than a pass can name, so nothing a pass read is let go before the pass is. */
const PASS_KEYS = Number.MAX_SAFE_INTEGER;

/** The run a folder's key names (`where`, JSON), read back for the lookup: the folder, its repository and its factory. */
const runOfKey = (key: string): FolderRun => {
  const [workflowDir, repo, factory] = JSON.parse(key) as [string, string | null, string | null];
  return { workflowDir, ...(repo !== null && { repo }), ...(factory !== null && { factory }) };
};

/**
 * A pass's one reader of what a resolve reads (`PassRevisions`), holding nothing yet: a program, since each read through a door is a
 * `Cache` of that pass, keyed by what it reads and holding the `Exit`, so a concurrent miss waits on the one lookup and a failure is kept.
 */
export const passRevisions = Effect.fn('passRevisions')(function* () {
  const where = (run: FolderRun): Array<string | null> => [
    path.resolve(run.workflowDir),
    run.repo === undefined ? null : path.resolve(run.repo),
    run.factory ?? null,
  ];
  const factory = once(factoryOf, (run) => String(run.factory ?? ''));
  const skillsCache = yield* Cache.make({
    capacity: PASS_KEYS,
    lookup: (key: string) =>
      Effect.gen(function* () {
        const [dir, repo] = JSON.parse(key) as [string, string | null];
        return yield* (yield* SkillDoor).skills.found({ dir, places: placesOf(repo ?? undefined) });
      }).pipe((read) => withinEffect('revisions', read)),
  });
  const skills = (run: FolderRun) => Cache.get(skillsCache, JSON.stringify(where(run).slice(0, 2)));
  const stepsCache = yield* Cache.make({
    capacity: PASS_KEYS,
    lookup: (key: string) => {
      const run = runOfKey(key);
      return Effect.suspend(() => stepsNow(run, placesOf(run.repo), factory(run))).pipe((read) => withinEffect('revisions', read));
    },
  });
  const steps = (run: FolderRun) => Cache.get(stepsCache, JSON.stringify(where(run)));
  const allows = once(
    (run: FolderRun) => repoAllows(run.repo, run.factory),
    (run) => JSON.stringify(where(run).slice(1)),
  );
  const digestCache = yield* Cache.make({
    capacity: PASS_KEYS,
    lookup: (key: string) => {
      const [kind, name, ...rest] = JSON.parse(key) as [KindName['kind'], string, ...Array<string | null>];
      const run = runOfKey(JSON.stringify(rest));
      return Effect.gen(function* () {
        return yield* digestFor({ kind, name }, run, placesOf(run.repo), factory(run), yield* skills(run));
      }).pipe((read) => withinEffect('revisions', read));
    },
  });
  const digest = (of: KindName, run: FolderRun) => Cache.get(digestCache, JSON.stringify([of.kind, of.name, ...where(run)]));
  const revision = once(appendRevision, (kind, name, hash) => JSON.stringify([kind, name, hash]));
  const looked = once(lookedUp, (kind, name, hash) => JSON.stringify([kind, name, hash]));
  return { factory, skills, steps, allows, digest, revision, looked } satisfies PassRevisions;
});

/** The pass's reader `read` where one was handed, else one made for this call alone. */
const readOr = (read: PassRevisions | undefined): Effect.Effect<PassRevisions> => (read ? Effect.succeed(read) : passRevisions());

/**
 * The pins of `steps` as the world holds them now, each given its number in the ledger by `number`: appended where the digest has moved
 * (`read.revision`, the default), or only read (`read.looked`). A kind that is not there is left out: a pin says what was resolved, and
 * nothing was.
 */
export const pinsOf = Effect.fn('pinsOf')(function* (
  run: FolderRun,
  steps: readonly Workflow[],
  at: string,
  given?: PassRevisions,
  numbering?: Numbering,
) {
  const read = yield* readOr(given);
  const number = numbering ?? read.revision;
  const pins: Pin[] = [];
  for (const of of kindsIn(run, steps)) {
    const hash = yield* read.digest(of, run);
    if (hash === null) continue;
    const { n } = number(of.kind, of.name, hash, at);
    pins.push({ kind: of.kind, name: of.name, n, hash });
  }
  return pins;
});

/**
 * The run's workflow folder as it stands now, read through `read` so a pass loads it once for every run on it, or undefined where it does
 * not load, so the run keeps the workflow it froze. Each run is handed its own copy of the steps, since `firstResolve` puts them on the
 * record and a write onto one run's must leave the other's alone.
 */
const folderNow = (run: FolderRun, read: PassRevisions): Effect.Effect<Workflow[] | undefined> =>
  read.steps(run).pipe(
    Effect.map((steps): Workflow[] | undefined => structuredClone(steps)),
    Effect.catchCause(() => Effect.succeed(undefined)),
  );

/**
 * The run's workflow folder and kinds resolved again, for a run that has filed nothing: the steps the folder holds now — new and removed
 * steps included, as a run that has filed nothing takes the folder's step set whole — and their pins.
 *
 * Undefined where the folder does not load. `kept`, with the reason's first line, where the folder loads but its steps are no set a run
 * may take (`stepSetRefusal`): `nemia start` refuses that folder, and a run taking it afresh keeps the set it froze rather than file a
 * step whose task id another step's check is read under. Judged on the run's own `isolate`, as `nemia start` judged it. `kept` too where
 * a step's `tools:` names a tool nothing its session would be allowed (`unallowedRefusal`), which `nemia start` refuses as well, judged
 * against the allow rules of the run's own repository, read once a pass for every run on it: a session that could never call what it is
 * given is not filed by an edit made while the run waited.
 */
export const resolvedNow = Effect.fn('resolvedNow')(function* (
  run: Pick<Run, 'workflowDir' | 'repo' | 'factory' | 'isolate'>,
  at: string,
  given?: PassRevisions,
) {
  const read = yield* readOr(given);
  const steps = yield* folderNow(run, read);
  if (!steps) return undefined;
  const allows = read.allows(run);
  const refused = stepSetRefusal(steps, run.isolate ?? true) ?? unallowedRefusal(steps, allows.rules, allows.untrusted);
  return refused ? ({ kept: firstLine(refused) } satisfies Kept) : ({ steps, pins: yield* pinsOf(run, steps, at, read) } satisfies Resolved);
});

/**
 * The run's steps and kinds resolved again for a run that has filed, on a person's ask: the folder's copy of each step the run already
 * names, in the order the run has them, and a step the folder no longer has kept as the run froze it — the verb takes new content, never a
 * new step set. Undefined where the folder does not load, so the run keeps what it froze and its pins.
 */
export const refreshedNow = Effect.fn('refreshedNow')(function* (run: Run, at: string, given?: PassRevisions) {
  const read = yield* readOr(given);
  const steps = yield* refreshedSteps(run, read);
  return steps && ({ steps, pins: yield* pinsOf(run, steps, at, read) } satisfies Resolved);
});

/** The steps a filed run's next filing would take (`refreshedNow`'s): undefined where the folder does not load. */
const refreshedSteps = (run: Run, read: PassRevisions): Effect.Effect<Workflow[] | undefined> =>
  Effect.map(folderNow(run, read), (found) => {
    if (!found) return undefined;
    const byName = new Map(found.map((s) => [s.name, s]));
    return stepsOf(run).map((s) => byName.get(s.name) ?? s);
  });

/**
 * What the run's next filing would take that its pins and its filed steps' pins are not (`kindsDrift`, `stepsDrift`): the kinds resolved
 * as `refreshedNow` resolves them, compared by digest, and numbered off the ledger without a write (`read.looked`) — a content nobody has
 * resolved reads as the next number, and the ledger stays as it was. So an edit later reverted is no drift, and a revert to an older
 * content is, its `now` that older number.
 *
 * `[]` for a run that has filed nothing, which takes the folder afresh at its first filing anyway; for a record that pinned nothing; and
 * where the folder does not load or a kind does not read, since there is then nothing a filing would take.
 */
export const driftNow = Effect.fn('driftNow')(function* (run: Run, given?: PassRevisions) {
  const now = yield* pinsNow(run, yield* readOr(given));
  const ran = Object.entries(run.steps).map(([name, record]) => [name, record.pinned] as const);
  return [...kindsDrift(run.pinned, now), ...stepsDrift(ran, run.pinned, now)] satisfies Drift[];
});

/** The pins the run's next filing would take, numbered without a write (`driftNow`'s): none where nothing would be filed or read. */
const pinsNow = (run: Run, read: PassRevisions): Effect.Effect<Pin[]> =>
  !hasStarted(run) || !run.pinned?.length
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const steps = yield* refreshedSteps(run, read);
        return steps ? yield* pinsOf(run, steps, new Date().toISOString(), read, read.looked) : [];
      }).pipe(Effect.catchCause(() => Effect.succeed<Pin[]>([])));

/** One kind a pinned run is behind on (`behindNow`): its drift, and the digest of what the files hold now, which tells two edits apart. */
export type Behind = Drift & { hash: string };

/**
 * The run's own pins its next filing would not take (`driftNow`'s, without the steps that already ran), for a run whose factory keeps its
 * revisions until a refresh: what the feed says as `revisions behind` (`behindOf`). Each carries the digest of what the files hold, since
 * two edits nobody has resolved read as the one next number. `[]` for a run that follows revisions, whose next filing takes the files
 * whatever they hold, and for a run that will file nothing again — one that succeeded (`succeeded`, the pass's own judgement), one called
 * off, one pruned. A run that failed or waits at a gate keeps it: a retry or an approval files again. Read every pass, never written.
 */
export const behindNow = Effect.fn('behindNow')(function* (run: Run, succeeded: boolean, given?: PassRevisions) {
  if (succeeded || run.cancelledAt || run.pruned || !hasStarted(run)) return [];
  const read = yield* readOr(given);
  if (follows(run, read)) return [];
  const now = yield* pinsNow(run, read);
  return kindsDrift(run.pinned, now).flatMap((d): Behind[] => {
    const at = now.find((p) => p.kind === d.kind && p.name === d.name);
    return at ? [{ ...d, hash: at.hash }] : [];
  });
});

/** Render the steps' agent files again (`writeAgentFiles`), so a pin the run took reaches the prompt its next filing is given. */
export const renderAgain = Effect.fn('renderAgain')(function* (run: Run, steps: readonly Workflow[], given?: PassRevisions) {
  const found = yield* (yield* readOr(given)).skills(run);
  yield* Effect.try({ try: () => within('act', () => writeAgentFiles(run, steps, found)), catch: (err) => err });
});

/** What one pass did about the run's revisions: whether it changed the record, what to say, and whether a refresh ask is spent. */
export type PinnedPass = { wrote: boolean; notes: string[]; lift: boolean };

const NOTHING: PinnedPass = { wrote: false, notes: [], lift: false };

/**
 * Resolve the run's kinds for this pass, before the pass reads anything of it, and write what moved onto the record it will write.
 *
 * Level-triggered, and read from the world on every pass: a run that has filed nothing — one waiting `--after`, which may sit for hours —
 * takes the workflow folder as it stands now, step set and all, so an edit made while it waited reaches its first step; a run that has
 * filed keeps its frozen workflow, and re-pins only where a person asked (`nemia refresh`) — or, its factory following revisions, once
 * the pass has a filing due (`followPass`) — neither of which adds or removes a step. Nothing is carried between passes: what has moved
 * is the digests against the run's own pins.
 *
 * Writes nothing where no digest moved, so a run resolved twice with no edit leaves the record alone and the ledger empty of a second
 * entry. A run a person called off is left alone: it files nothing, so there is nothing for a revision to reach. The steps' agent files are
 * rendered again wherever the pins moved (`renderAgain`), since a pin the board shows and a prompt the session reads must be the one
 * content.
 *
 * One run's world stops that run alone: a resolve that throws leaves it the revisions, the step set and the prompts it had and says why
 * (`unread`), and so does a folder whose steps are a set no run may take (`stepSetRefusal`), which `nemia start` refuses too — the pass
 * judges every other run either way.
 *
 * @param read What this pass reads once for every run it resolves (`PassRevisions`), so ten runs on one workflow folder read and digest
 *   it once between them. A one-off verb that hands none — `advanceRun`, `nemia refresh`, `nemia start` — reads the world for itself.
 */
export const pinPass = Effect.fn('pinPass')(function* (run: Run, at: string, given?: PassRevisions) {
  if (run.cancelledAt || run.pruned) return NOTHING;
  const filed = hasStarted(run);
  const read = yield* readOr(given);
  return yield* (filed ? refreshDue(run, at, read) : firstResolve(run, at, read)).pipe(
    Effect.catchCause((cause) => Effect.sync(() => unread(Cause.squash(cause), filed && runStore.refresh.stands(run.id)))),
  );
});

/**
 * What the pass says where resolving the world threw — a skill folder a person renamed or deleted between passes, which `writeAgentFiles`
 * refuses, a digest of a file that has stopped reading, a ledger the store could not write — and the run keeps the revisions and the
 * workflow it had: a kind that stopped reading stops this run's resolve, never the pass, which judges every other run.
 *
 * The record is changed last, after the one write of the pass that can throw (`renderAgain`), so a run that keeps its revisions keeps its
 * prompts too. A person's refresh ask is spent all the same, as it is where the folder does not load: an ask nothing acts on is an ask the
 * tick reads for ever.
 */
const unread = (err: unknown, lift: boolean): PinnedPass => ({
  wrote: false,
  notes: [`the run keeps the revisions it had, since resolving them did not read: ${firstLine(String((err as Error)?.message ?? err))}`],
  lift,
});

/** The run's workflow and pins taken afresh, for a run that has filed nothing: `run` is changed where anything moved, and last. */
const firstResolve = Effect.fnUntraced(function* (run: Run, at: string, read: PassRevisions) {
  const resolved = yield* resolvedNow(run, at, read);
  if (!resolved) return NOTHING;
  if ('kept' in resolved)
    return { wrote: false, notes: [`the run keeps the step set it froze: ${resolved.kept}`], lift: false } satisfies PinnedPass;
  const names = resolved.steps.map((s) => s.name);
  const moved = !isDeepStrictEqual([...(run.pinned ?? [])], resolved.pins) || !isDeepStrictEqual(Object.keys(run.steps), names);
  if (!moved) return NOTHING;
  yield* renderAgain(run, resolved.steps, read);
  run.workflow = resolved.steps;
  run.pinned = resolved.pins;
  run.steps = Object.fromEntries(names.map((name) => [name, run.steps[name] ?? { taskId: null }]));
  return { wrote: true, notes: [`took the revisions of ${resolved.pins.length} kinds: nothing of it is filed yet`], lift: false };
});

/**
 * Whether the run's factory follows revisions (`revisions: follow`), read through the pass's memo of it. A factory that no longer reads —
 * its file removed or broken since the run started — follows nothing: the run keeps what it resolved, as a pinned run does, and the
 * factory's refusal is the start's and the verbs' to say, not every pass's.
 */
function follows(run: Run, read: PassRevisions): boolean {
  try {
    return revisionsOf(read.factory(run)) === 'follow';
  } catch {
    return false;
  }
}

/**
 * The run's steps and pins taken again on a person's ask (`nemia refresh`), for a run that has filed: the ask is spent either way. The ask
 * is read off its own file every pass (`runStore.refresh.stands`), never off the record, which never holds it. A filed run nobody asked
 * resolves nothing here: a resolve is every `.md` of the folder and a digest of every agent and skill file it names, which a pass may not
 * pay per run for a number nothing files on. A run whose factory follows revisions is resolved by `followPass`, once the pass knows it
 * has something to file. So a pinned run's edit after a filing is numbered when something resolves that content — another run's filing,
 * or this run's `nemia refresh`, which resolves to answer.
 */
const refreshDue = Effect.fnUntraced(function* (run: Run, at: string, read: PassRevisions) {
  if (!runStore.refresh.stands(run.id)) return NOTHING;
  const resolved = yield* refreshedNow(run, at, read);
  if (!resolved)
    return {
      wrote: false,
      notes: ["nemia refresh: the run's workflow folder does not load, so it keeps the revisions it had"],
      lift: true,
    } satisfies PinnedPass;
  yield* renderAgain(run, resolved.steps, read);
  run.workflow = resolved.steps;
  run.pinned = resolved.pins;
  return { wrote: true, notes: ['nemia refresh: every filing after this takes the new revisions'], lift: true } satisfies PinnedPass;
});

/**
 * Follow (`revisions: follow`): a filed run whose pass has a filing due — a step, a retry, a round (`filing`) — takes its kinds as the
 * files hold them now, as `nemia refresh` would, before anything of it is filed. The pass that re-pins files nothing, and the next one,
 * which the record's write wakes, files on the new pins, its brief and prompt read from them; so every filing is filed on the files as
 * they stood when it was due, and what was already filed is not run again.
 *
 * A run with nothing due is never resolved: a finished run, or one stopped on a person, keeps the pins and the prompts its steps were
 * given, whatever reaches it a full pass (a restarted daemon, a stamp moved), and a run at rest acts on no pass a memo would have
 * skipped. Level-triggered: it reads the factory, the files and the run's pins on the pass, and writes only where the pins moved, so a
 * due filing with no edit is filed on that pass. A folder that does not load, and a factory that no longer reads (`follows`), leave the
 * run what it had, unsaid, since it would be said on every pass.
 */
export const followPass = Effect.fn('followPass')(function* (run: Run, at: string, filing: boolean, given?: PassRevisions) {
  if (!filing || run.cancelledAt || run.pruned || !hasStarted(run)) return NOTHING;
  const read = yield* readOr(given);
  if (!follows(run, read)) return NOTHING;
  return yield* Effect.gen(function* () {
    const resolved = yield* refreshedNow(run, at, read);
    if (!resolved || isDeepStrictEqual([...(run.pinned ?? [])], resolved.pins)) return NOTHING;
    yield* renderAgain(run, resolved.steps, read);
    run.workflow = resolved.steps;
    run.pinned = resolved.pins;
    return { wrote: true, notes: ['the factory follows revisions: the next pass files on the new ones'], lift: false } satisfies PinnedPass;
  }).pipe(Effect.catchCause((cause) => Effect.succeed(unread(Cause.squash(cause), false))));
});

/**
 * `nemia refresh <run>`: write down that a person asked this run to take the new revisions, so every filing after it — a new step, a retry,
 * a round — is filed on them, and answers with the drift it was asked on.
 *
 * It resolves the kinds now to answer, which is what gives an edit its number in the ledger, and compares by digest, as the board's band
 * does (`driftNow`).
 *
 * Refused (`Conflict`): a run that has filed nothing, which resolves its kinds afresh at its first filing anyway; a run whose factory
 * follows revisions, whose every filing takes what the files hold with no ask; a run whose pins are
 * already the newest of every kind, since nothing would be taken, and an ask nothing acts on is an ask the tick reads for ever; and a run
 * whose folder does not load, which has no revision to take. A run with no record is refused `Missing` by the store's read.
 */
export const refreshRun = Effect.fn('refresh')(function* (id: string) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  if (!hasStarted(run))
    return yield* Effect.fail(
      new Conflict({
        message: `run ${id} has filed nothing yet: it resolves its kinds afresh at its first filing, so an edit made while it waits reaches its first step with no refresh. Nothing was written.`,
      }),
    );
  const read = yield* passRevisions();
  if (follows(run, read))
    return yield* Effect.fail(
      new Conflict({
        message: `run ${id} is in the factory ${run.factory}, which follows revisions: its every filing takes what the files hold, so there is nothing to refresh. To keep a run's revisions until a refresh, nemia factory revisions ${run.factory} pinned. Nothing was written.`,
      }),
    );
  const resolved = yield* refreshedNow(run, new Date().toISOString(), read);
  if (!resolved)
    return yield* Effect.fail(
      new Conflict({
        message: `run ${id}: its workflow folder, ${run.workflowDir}, does not load, so there is no revision to take. Mend the folder, and nemia refresh ${id} again. Nothing was written.`,
      }),
    );
  const drift = kindsDrift(run.pinned, resolved.pins);
  if (!drift.length)
    return yield* Effect.fail(
      new Conflict({
        message: `run ${id} is already on the newest revision of every kind it resolved: there is nothing to take. Edit a workflow, an agent, a skill or the factory's rules, and nemia refresh ${id} again. Nothing was written.`,
      }),
    );
  if (!(yield* (yield* RunDoor).refresh.put(RunId.read(id))))
    return yield* Effect.fail(new Conflict({ message: `run ${id} is already asked to refresh: the next pass takes the new revisions.` }));
  return drift;
});

/**
 * What a pass owes the store once it has decided: the record, written where this pass or the pins changed it, and then the refresh ask the
 * pins answered, lifted — in that order, so an ask is never spent on a record that was not written.
 */
export const pinsWritten = Effect.fn('pinsWritten')(function* (run: Run, took: PinnedPass, wrote: boolean) {
  const door = yield* RunDoor;
  if (wrote || took.wrote) yield* door.runs.rewrite(run);
  if (took.lift) yield* door.refresh.lift(RunId.read(run.id));
});
