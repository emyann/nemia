/**
 * What the Factory works out about the runs, without React Flow: which are in flight, what a card
 * says, where a card goes, and how many cells an open card takes. Pure.
 */
import { judged, type AtWork, type RunToDecide, type UnjudgedRun } from './api/judged.ts';
import type { RunView } from './api/judged.ts';
import type { EdgeState } from './canvas.ts';
import { durationWords } from './duration.ts';
import { instantWhole } from './instant.ts';
import { layers, type Point } from './layout.ts';
import { ENDED, STANDING } from './words.ts';
import type { Frozen } from './frozen.ts';

/**
 * Whether a run is in flight, and so on the Factory by default: `assess` has it `running`, or it still moves — the engine holds a task of
 * it, or a tick would still file one (the api's `moving`).
 *
 * Nothing here reads a step's words. The status alone is not enough: `assess` reads a fan-out as failed once one step is final without
 * letting its followers run, while a sibling's session still works. A run is finished once it has stopped moving without running:
 * succeeded; failed at a refused check or a step signed off blocked, whose followers read `pending` and will never be filed; or cancelled,
 * its stop took effect. A run such a stop leaves waiting on a person stays on the Factory all the same (`floorRuns`); the rest are under
 * "Show
 * finished", or on Runs.
 *
 * A run started `--after` runs that have not succeeded is in flight while each may still succeed: it moves, since the tick files its
 * roots when
 * they do, and its card is a ghost until it starts (`waitsOnRuns`). Not once one never will without a person (`waiting.waitingOnYou`) — no
 * such run, a failed or cancelled one — though `assess`, which knows nothing of the gate, still calls it running: nothing of it moves
 * until a person acts, and it waits on them.
 *
 * So is a run a person holds until runs succeed (the CLI's `hold`), and on the same terms. `assess` calls a held run running whatever its
 * steps say, and the tick lifts the hold when those runs succeed, though nothing of it is filed before then. Not once only a person
 * lifts it
 * (`holding.waitingOnYou`): then it waits on them (`waitsOnYou`). A listing without `holding` is read as holding nothing.
 *
 * So is a run that asks something of a person (`asksOfAPerson`) that someone has in hand (`assignee`): it is theirs, not the person's.
 * @param run The run: its status, whether it moves, what it waits on, who holds it, what it asks and who has it in hand, where the
 * listing says them.
 */
export const inFlight = (run: Frozen<Pick<RunView, 'status' | 'moving'> & Held & { waitingOnYou?: RunView['waitingOnYou'] }>) =>
  run.moving ||
  (Boolean(run.assignee) && asksOfAPerson({ ...run, cancelledAt: run.cancelledAt ?? null, waitingOnYou: run.waitingOnYou ?? [] })) ||
  (run.status === 'running' && !run.waiting?.waitingOnYou && !run.holding?.waitingOnYou);

/**
 * The runs of the light answer as one list: those that wait on a person, then those in flight, each run once. Every run the board calls
 * in flight (`inFlight`) is among them, a run at its gate that still moves with the waiting.
 * @param open The light answer's rows: those that wait on a person, and those in flight.
 */
export const openRows = <T>(open: { waiting: readonly T[]; inFlight: readonly T[] }) => [...open.waiting, ...open.inFlight];

/** What `inFlight` and `waitsOnYou` read beside their own fields, each read as absent where a listing lacks it. */
type Held = {
  waiting?: RunView['waiting'];
  holding?: RunView['holding'];
  assignee?: RunView['assignee'];
  cancelledAt?: string | null;
};

/**
 * What a person has to decide about the run's result, off the api's `toDecide`: a step's gate, or a branch nobody merged. Null
 * while there is nothing — and for a listing without `toDecide`, read tolerantly as `onYouOf` is, since the Factory polls the list and a
 * refusal would take the whole floor down for a word.
 * @param run The run, by the api's `toDecide`; absent or null where there is nothing to decide.
 */
export const toDecideOf = (run: { toDecide?: Frozen<RunToDecide> | null }) => run.toDecide ?? null;

/**
 * Whether what is to decide about the run is the person's move: there is something (`toDecideOf`) and nobody has the run in hand
 * (`assignee`), as `waitsOnYou` says of what the run asks. The yellow of a card, its count and its chip follow this, never
 * `toDecideOf` alone.
 * @param run The run, by the api's `toDecide` and its `assignee`.
 */
export const toDecideOfYou = (run: { toDecide?: Frozen<RunToDecide> | null; assignee?: unknown }) =>
  toDecideOf(run) !== null && !run.assignee;

/**
 * Whether anything of the run is asked of a person, whoever has it in hand: a step does (`waitingOnYou`) — at its gate anywhere in
 * the run, or signed off blocked — or a run it waits on never succeeds without one — what the CLI's `ls` prints `→ waiting on you` for,
 * either way — or a hold on it only a person lifts (`holding.waitingOnYou`: a run it is held until is cancelled, gone, or not there).
 * Not once it is cancelled: a cancelled run waits on nobody, whatever its steps last said.
 * @param run The run: the steps that wait on you, when it was called off, and what it waits on and who holds it.
 */
const asksOfAPerson = (run: Frozen<Pick<RunView, 'waitingOnYou' | 'cancelledAt'> & Held>) =>
  !run.cancelledAt && (run.waitingOnYou.length > 0 || Boolean(run.waiting?.waitingOnYou) || Boolean(run.holding?.waitingOnYou));

/**
 * Whether the run waits on you, the package's one decider mirrored (`waitsOnYou`, the orchestrator's phase.ts): it asks something of a
 * person (`asksOfAPerson`) and nobody has it in hand (`assignee`). A run someone has in hand is in flight (`inFlight`), its asks still
 * offered to anyone who may answer them.
 * @param run The run: the steps that wait on you, when it was called off, what it waits on, who holds it and who has it in hand.
 */
export const waitsOnYou = (run: Frozen<Pick<RunView, 'waitingOnYou' | 'cancelledAt'> & Held>) => asksOfAPerson(run) && !run.assignee;

/**
 * Whether a run waits on runs, and on nothing else: started `--after` runs not succeeded, each of which may still succeed, with nothing
 * of it
 * filed yet (the api's `waiting`, null once a step is filed), and nobody to act (`waitsOnYou`). The floor draws such a run as a ghost, as
 * the queue lane draws a card not started, until it starts. Not a cancelled run, which waits on nobody.
 * @param run The run: the steps that wait on you, when it was called off, and what it waits on and who holds it.
 */
export const waitsOnRuns = (run: Pick<RunView, 'waitingOnYou' | 'cancelledAt'> & Held) =>
  !run.cancelledAt && Boolean(run.waiting) && !waitsOnYou(run);

/**
 * Who a run waits on, as the CLI's `ls` names them after `→ waiting on you:` — `approve plan` for a step at its gate — off the api's
 * `waitingOnYouWords`; and for a run given without `waitingOnYouWords`, the steps by name (`waitingOnYou`).
 *
 * Without the step whose gate the to-decide line already says, as the CLI's `ls` prints it (cli/main.ts): that line is above, it
 * names the step and the command, and the same step is not asked for twice. A run may then wait on you with nothing here to name — the
 * whole of what is asked is the decision — so a caller that says `waiting on you:` asks whether there is anything to say first.
 * @param run The run: the steps that wait on you, the api's words for them where it gave them, and what it has to decide.
 */
export const onYouOf = (
  run: Frozen<Pick<RunView, 'waitingOnYou'> & { waitingOnYouWords?: readonly string[]; toDecide?: RunToDecide | null }>,
) => {
  const said = run.waitingOnYouWords ?? run.waitingOnYou;
  const decide = toDecideOf(run);
  return decide?.kind === 'approve' ? said.filter((one) => one !== `approve ${decide.step}`) : said;
};

/**
 * Where a run stands, in a word (`STANDING`), as the start form offers it to wait on: cancelled; waiting, on you (`waitsOnYou`) — a run
 * that waits on a run that never succeeds is one, though it has filed nothing and is not in flight; running; or finished.
 * @param run The run as the api lists it.
 */
export const standingOf = (run: Pick<RunView, 'cancelledAt' | 'status' | 'moving' | 'waitingOnYou' | 'waiting'>) =>
  run.cancelledAt ? ENDED.cancelled.word : waitsOnYou(run) ? STANDING.waiting : inFlight(run) ? STANDING.running : STANDING.finished;

type Clocked = Frozen<
  Pick<RunView, 'createdAt' | 'startedAt' | 'cancelledAt'> & Held & { waitingOnYou?: RunView['waitingOnYou']; atWork?: AtWork | null }
>;

/**
 * How long a run waited before it started — created to its first filing — or null while nothing of it is filed.
 * @param run The run: when it was created, and when it started (null while nothing of it is filed).
 */
export const waitedMs = (run: Pick<RunView, 'createdAt' | 'startedAt'>) =>
  run.startedAt === null ? null : Math.max(0, Date.parse(run.startedAt) - Date.parse(run.createdAt));

/**
 * Whether a run's clock still counts, second by second: the time at work of a run a task of which still runs (`AtWork.since`), and the
 * wait of a run nothing of which is filed yet and nobody called off — `finished` on the floor for one that waits on a run that never
 * lands, and waiting all the same. A run without the api's time at work counts while it is in flight, as `finished` says.
 * @param run The run's times: created, started, called off, and its time at work where the api gives it.
 * @param finished Whether the floor reads the run as finished, not in flight.
 */
export const clockCounts = (run: Clocked, finished: boolean) => {
  if (run.startedAt === null) return run.cancelledAt === null;
  return run.atWork ? run.atWork.since !== null : !finished;
};

/** A run's time at work at `now`: what ran and ended (`AtWork.ms`), and the time since what still runs started. */
const atWorkMs = (atWork: AtWork, now: number) => atWork.ms + (atWork.since === null ? 0 : Math.max(0, now - Date.parse(atWork.since)));

/**
 * Whether a run is over, for its clock: nothing of it runs (`AtWork.since`), and it is called off, or `finished` and waiting on nobody
 * (`waitsOnYou`) — a run at a gate has only stopped until a person answers.
 */
const isOver = (run: Clocked & { atWork: AtWork }, finished: boolean) =>
  run.atWork.since === null && (run.cancelledAt !== null || (finished && !waitsOnYou({ ...run, waitingOnYou: run.waitingOnYou ?? [] })));

/** An ISO instant whole, as a clock's title says it in the browser's time zone (`instantWhole`). */
const whole = (iso: string) => instantWhole(new Date(iso));

/** The sentence a clock's title ends on for a run that waited a second or more before its first filing (`waitedMs`); else nothing. */
const waitedSentence = (run: Pick<RunView, 'createdAt' | 'startedAt'>) => {
  const waited = waitedMs(run) ?? 0;
  return waited >= 1000
    ? ` Created ${whole(run.createdAt)}, and waited ${durationWords(waited, 'second')} before its first step was filed.`
    : '';
};

/** The clock's title past the start: the time at work, the start, the end or that it still goes, the wall time, and the wait before. */
function workedTitle(run: Clocked & { startedAt: string; atWork: AtWork }, now: number, over: boolean) {
  const started = Date.parse(run.startedAt);
  const { endedAt } = run.atWork;
  const end = !over
    ? `still going: ${durationWords(now - started, 'second')} from start to now`
    : endedAt === null
      ? 'and no session or check of it ran'
      : `ended ${whole(endedAt)}: ${durationWords(Date.parse(endedAt) - started, 'second')} from start to end`;
  return `At work ${durationWords(atWorkMs(run.atWork, now), 'second')}. Started ${whole(run.startedAt)}, ${end}.${waitedSentence(run)}`;
}

/** Where a run's clock is drawn: on a card of the Factory's floor or a run's page, or in a row of the runs page's tables. */
type ClockPlace = 'card' | 'row';

/** What a run's clock says in a table's column, where there is room for one short fact: the time at work, to the minute. */
const rowWords = (run: Clocked, now: number) => {
  if (run.startedAt === null) return 'not started';
  return run.atWork ? durationWords(atWorkMs(run.atWork, now), 'minute') : 'not judged';
};

/**
 * What a run's clock says, wherever the board says how long a run has been going: `words` on the Factory's card, `at` the instant they
 * count from, and `title` the times in full. `finished` is the card's: not in flight. `place` is where the words are drawn — a card says
 * a sentence (`waiting for 56m`, `1h 05m at work`), a row of a table one short fact and nothing it says twice (`rowWords`): `1h 05m`,
 * `not started` for a run nothing of which is filed yet, whose minutes since it was created are not time at work and whose Created
 * column already says them, and `not judged` for a run the api gives no time at work of. Either way the `title` is the whole of it.
 *
 * Its time at work (`AtWork`), the api's: how long any session or check of it ran, two at once counted once, a wait at a gate, a hold or
 * a slot counted for nothing. A run that is over took it (`took 2h 10m`); any other is at work (`1h 05m at work`), the time since what
 * still runs started added as `now` moves. The title gives the start, the end or that it still goes, and the wall time between.
 *
 * Counted from when it started (`startedAt`, its first filing), never from when it was created: a run started `--after` runs is created,
 * then waits, doing nothing, until they succeed, and that wait is not time at work. Until it starts it says it is waiting, for as long
 * as it
 * has — what it waits on is the card's line above (`waiting.word`), and the title's — and a run called off before it started never did.
 * A run the api could not judge has no time at work, and says when it started.
 * @param run The run's times: created, started, called off, and its time at work where the api gives it.
 * @param now The instant the clock reads, in ms since the epoch.
 * @param finished Whether the floor reads the run as finished, not in flight.
 * @param place Where the words are drawn: on a card, the default, or in a row of a table.
 */
export function runClock(run: Clocked, now: number, finished: boolean, place: ClockPlace = 'card') {
  const said = (words: string) => (place === 'row' ? rowWords(run, now) : words);
  if (run.startedAt === null) {
    const created = `Created ${whole(run.createdAt)}.`;
    const since = durationWords(now - Date.parse(run.createdAt), 'second');
    return run.cancelledAt !== null
      ? { words: said(`created ${since} ago`), at: run.createdAt, title: `${created} Called off before anything of it was filed.` }
      : {
          words: said(`waiting for ${since}`),
          at: run.createdAt,
          title: `${created} Nothing of it is filed yet${run.waiting ? `: ${run.waiting.word}` : ''}.`,
        };
  }
  const { startedAt, atWork } = run;
  if (atWork) {
    const over = isOver({ ...run, atWork }, finished);
    const worked = durationWords(atWorkMs(atWork, now), 'second');
    return {
      words: said(over ? `took ${worked}` : `${worked} at work`),
      at: startedAt,
      title: workedTitle({ ...run, startedAt, atWork }, now, over),
    };
  }
  const since = durationWords(now - Date.parse(startedAt), 'second');
  const title = `Started ${whole(startedAt)}.${waitedSentence(run)}`;
  return { words: said(finished ? `started ${since} ago` : `${since} since it started`), at: startedAt, title };
}

type FloorRun = Pick<RunView, 'id' | 'createdAt' | 'status' | 'moving' | 'waiting' | 'after' | 'waitingOnYou' | 'cancelledAt'> & {
  toDecide?: RunToDecide | null;
  holdUntil?: readonly string[];
  holding?: RunView['holding'];
};

/**
 * The runs on the Factory's floor, oldest first: every run when finished runs are asked for; otherwise every run in flight, every run
 * nobody has decided (`toDecideOf`), every run that waits on a person (`waitsOnYou`), and each finished run that a run in flight still
 * waits on (`liveWaits`), so the edge into it leaves from a card. A run read as context (`context`) brings no card: nothing waits on it.
 *
 * A run to decide stays on the floor whatever "Show finished" says, and until it is decided. Nothing of it moves, so `inFlight` has it
 * finished and the switch would hide it: a run that finished with its ending waiting for a word, or its branch waiting for a merge, would
 * step off the board the moment it wanted a person most. Level-triggered, as the api reads it:
 * the card goes when the approval or the merge is given, with nothing told to the board.
 *
 * So does a run that waits on a person anywhere else: a step at its gate in the middle of the run, or one that signed off blocked and
 * asks something. The api reads such a run `failed` — a step stops its followers and nothing runs — with nothing to decide about its
 * result, so neither `inFlight` nor `toDecideOf` keeps it, and it would vanish the moment its plan reached its gate. It stays until the
 * approval or the answer is given; a cancelled run waits on nobody, and is not kept by this. The header's `waiting on you` counts the
 * same runs (`waitsOnYou`), so each one it counts has its card on the floor.
 *
 * The finished card, and not a stub: it is dimmed as a finished card is, it says what the run was for and whether it succeeded or was
 * called off, and it opens into the run's steps — a stub would say only an id, and send a person to Runs to learn the rest. One level: a
 * finished parent brings none of its own parents onto the floor, since it waits on nothing any more.
 * @param runs The runs the floor may draw, each judged.
 * @param showFinished Whether "Show finished" is on: every run is then on the floor.
 */
export function floorRuns<T extends FloorRun>(runs: readonly T[], showFinished: boolean) {
  const waitedOn = new Set(runs.filter(inFlight).flatMap(liveWaits));
  return byAge(runs).filter((run) => showFinished || inFlight(run) || toDecideOf(run) !== null || waitsOnYou(run) || waitedOn.has(run.id));
}

/**
 * The runs the floor reads by id beside the light answer: each a row in flight still waits on (`liveWaits`), and each a row reads as
 * context (its chip names it by its title, `readsLines`), that is no row of it — a finished run, since the light answer holds every run
 * of the factory not finished, or a run of another factory. Each once, the waits first, in the order the rows name them; a row the list
 * could not judge names nothing. One level, as `floorRuns` draws them; a run read only for its title is no card unless it is finished
 * and Show finished is on.
 * @param rows The light answer's rows, in their order; a row the list could not judge among them.
 */
export function parentsWanted(rows: readonly ((FloorRun & Pick<RunView, 'context'>) | UnjudgedRun)[]) {
  const listed = new Set(rows.map((row) => row.id));
  const judgedRows = rows.filter((row): row is FloorRun & Pick<RunView, 'context'> => judged(row));
  const waits = judgedRows.filter(inFlight).flatMap(liveWaits);
  const reads = judgedRows.flatMap((row) => row.context);
  return [...new Set([...waits, ...reads])].filter((id) => !listed.has(id));
}

/**
 * The rows the floor is drawn from (`floorRuns` picks its cards): the light answer's waiting, then its in flight, then the parents read
 * by id (`parentsWanted`), then the finished runs nobody decided (`undecided`), then the page of the finished runs while Show finished is
 * on, each run once, the first read of it kept.
 * @param open The light answer's rows: those that wait on a person, and those in flight.
 * @param parents The runs read by id beside the light answer (`parentsWanted`).
 * @param undecided The finished runs nobody decided.
 * @param finished The page of the finished runs; empty while Show finished is off.
 */
export function floorRowsOf<T extends { id: string }>(
  open: { waiting: readonly T[]; inFlight: readonly T[] },
  parents: readonly T[],
  undecided: readonly T[],
  finished: readonly T[],
) {
  const seen = new Set<string>();
  return [...openRows(open), ...parents, ...undecided, ...finished].filter((row) => !seen.has(row.id) && Boolean(seen.add(row.id)));
}

/** What a card's live waits are read off: the runs its roots still wait on, and a person's hold. */
type Waits = Pick<RunView, 'id' | 'waiting'> & { holding?: RunView['holding'] };

/**
 * The runs a card still waits on, each once: those its roots wait on before anything is filed (`waiting`, the CLI's `--after`), then each
 * a person holds it until that has not succeeded (`holding`). None once the run has started and nobody holds it: a wait it was started with
 * is over, and a run it reads as context is never one.
 */
const liveWaits = (run: Waits) => [
  ...new Set([...(run.waiting?.runs ?? []).map((w) => w.run), ...(run.holding?.runs ?? []).filter((h) => !h.released).map((h) => h.run)]),
];

/**
 * An edge between two cards on the Factory: from a run to one that still waits on it (`after:`), or that a person holds until it succeeds
 * (`hold:`). Always dashed, to come: a wait that is over draws nothing.
 */
type RunEdge = { id: string; source: string; target: string; state: Extract<EdgeState, 'to-come'> };

/**
 * The edges between the cards on the floor that are live waits: one from each run a card's roots still wait on (`waiting`), and one from
 * each run a person holds it until that has not succeeded (`holding`), where none already joins the two — each only when both cards are on
 * the floor. A run that has started draws none from its waits, and a run it reads as context none at all (`contextEdges`).
 *
 * Reduced transitively: an edge u→w is dropped when another path u→…→w joins the two among the edges drawn, since the chain says it.
 * @param runs The runs on the floor, each with what its roots wait on and a person's hold on it.
 */
export function runEdges(runs: readonly Waits[]) {
  const floor = new Set(runs.map((run) => run.id));
  const edges = runs.flatMap((child) => {
    const onTheFloor = (parent: string) => floor.has(parent) && parent !== child.id;
    const waited = [...new Set((child.waiting?.runs ?? []).map((w) => w.run))].filter(onTheFloor);
    const held = liveWaits(child).filter((parent) => onTheFloor(parent) && !waited.includes(parent));
    return [
      ...waited.map(
        (parent) => ({ id: `after:${parent}->${child.id}`, source: parent, target: child.id, state: 'to-come' }) satisfies RunEdge,
      ),
      ...held.map(
        (parent) => ({ id: `hold:${parent}->${child.id}`, source: parent, target: child.id, state: 'to-come' }) satisfies RunEdge,
      ),
    ];
  });
  return edges.filter((edge) => !reachesAround(edges, edge)) satisfies RunEdge[];
}

/** Whether `edge`'s target is reached from its source by a path of two edges or more among `edges`. */
function reachesAround(edges: readonly RunEdge[], edge: RunEdge) {
  const seen = new Set<string>();
  const next = edges.filter((e) => e.source === edge.source && e.target !== edge.target).map((e) => e.target);
  while (next.length) {
    const at = next.pop()!;
    if (at === edge.target) return true;
    if (seen.has(at)) continue;
    seen.add(at);
    next.push(...edges.filter((e) => e.source === at).map((e) => e.target));
  }
  return false;
}

/**
 * The lines of what the focused card reads: one from each run in its `context` that is on the floor, to it. None without a focus — the
 * card hovered, else the one selected — so the floor draws only its waits until a person looks at a card.
 * @param runs The runs on the floor, each with the runs it reads as context.
 * @param focus The id of the focused card's run, or null where no card is focused.
 */
export function contextEdges(runs: ReadonlyArray<Pick<RunView, 'id' | 'context'>>, focus: string | null) {
  const card = runs.find((run) => run.id === focus);
  if (!card) return [];
  const floor = new Set(runs.map((run) => run.id));
  return [...new Set(card.context)]
    .filter((source) => floor.has(source) && source !== card.id)
    .map((source) => ({ id: `read:${source}->${card.id}`, source, target: card.id }));
}

/**
 * A card's title: the brief's first line with words on it, without a heading's hashes; else the run id.
 * @param run The run, by its id and its brief.
 */
export const titleOf = (run: Pick<RunView, 'id' | 'brief'>) =>
  run.brief
    .split('\n')
    .map((line) => line.replace(/^\s*#+\s*/, '').trim())
    .find(Boolean) ?? run.id;

/**
 * What a card's chip of the runs it reads says on hover: a line per run in its `context`, its id and its title where `runs` has it, its
 * id alone where it does not.
 * @param run The card's run, by the runs it reads as context.
 * @param runs The runs the board holds, whose titles name those it reads.
 */
export const readsLines = (run: Frozen<Pick<RunView, 'context'>>, runs: ReadonlyArray<Pick<RunView, 'id' | 'brief'>>) => {
  const byId = new Map(runs.map((source) => [source.id, source]));
  return run.context.map((id) => {
    const source = byId.get(id);
    return source ? `${id} — ${titleOf(source)}` : id;
  });
};

/**
 * The repo by its folder's name, which is what a person calls it; the full path is for machines.
 * @param repo The repository's path.
 */
export const repoName = (repo: string) =>
  repo
    .split(/[\\/]+/)
    .filter(Boolean)
    .at(-1) ?? repo;

/**
 * Oldest first, so a run that starts takes the next free cell and moves no card already down.
 * @param runs The runs, by their ids and when each was created; ties go by id.
 */
export const byAge = <T extends Pick<RunView, 'id' | 'createdAt'>>(runs: readonly T[]) =>
  [...runs].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

/** A cell on the Factory's grid: room for one card and the gap beside and below it. Cards are drawn to fit. */
export const CELL_WIDTH = 384;
/**
 * A cell holds a card at rest and the gap under it, as its width holds a card and the gap beside it. A card's steps do not make it
 * taller: they are its graph (`StepGraph`), a node a step, never more than `RAIL_LANES` lanes whatever the run, and an open card takes as
 * many cells down as its panel needs (`openSpan`). What makes a card at rest tall is what it asks of a person — a line per ask and per step
 * blocked (`needsOf`, two lines each), a gate's line and its buttons. Of the cards the e2e seeds, the tallest is the gate's in
 * `factory-gate-long-names`, 262; then a card with its cost and an ask, 228; most stand about 190. At 320 the tallest keeps about 60 under
 * it, more than the gap beside every card (`CELL_WIDTH` less `CARD_WIDTH`, 32), and most keep about 130. Every card pays for the room:
 * Fit view draws a floor of three rows a little smaller than a lower cell would.
 *
 * Names cost no height: the card cuts a long name to its line (the title, the gate's line), and the rail cuts a step's name to its pill,
 * whole on hover. Counts do, and nothing here makes the cell a bound on them: a run whose steps each ask outgrows any cell, and the card
 * beneath is under its foot. The board takes that over capping the card, which would cut what a person has to act on — the ask itself —
 * and the cards that outgrow it are the rare ones. `expectClearOfEachOther` in the e2e measures the floor it seeds against this number;
 * it does not stand for a bound there is none of.
 */
export const CELL_HEIGHT = 320;
export const GRID_COLUMNS = 4;
/** How wide a card is drawn (`w-88`, room for four pills of its rail): the rest of its cell is the gap to the next card. */
export const CARD_WIDTH = 352;
/** The gap a card leaves beside it in its cell, and the one an open card keeps under it. */
const GAP = CELL_WIDTH - CARD_WIDTH;
/**
 * The room an open card's panel takes (`Run` at xl): as wide as its graph names its steps, each a column of `STEP_ROOM` pixels with the
 * panel's padding around them, never under `width`; and as tall as the tallest panel staged, its gate's lines and chips under it.
 */
export const RUN_PANEL = { width: 480, height: 680 };

/** How wide the panel's graph draws each step it names, and the panel's padding and edge either side of it. */
const STEP_ROOM = 104;
const PANEL_FRAME = 2 * 28 + 2;

/** The cells a run takes, from its card's cell: across, and down. A closed card takes its one. */
export type Span = { columns: number; rows: number };
export const ONE_CELL: Span = { columns: 1, rows: 1 };

/**
 * How wide an open run's panel is drawn: `RUN_PANEL`'s width, or room for each step under its graph and the panel's frame where that is
 * wider. From the count of its steps alone, so the card and the cells it claims (`openSpan`) agree.
 * @param steps How many steps the run has.
 */
export const panelWidth = (steps: number) => Math.max(RUN_PANEL.width, steps * STEP_ROOM + PANEL_FRAME);

/**
 * The cells an open run takes: its panel's (`RUN_PANEL`, `panelWidth`), as many to the right as its width reaches and as many rows down as
 * its height, with a gap's room past them. From the count of its steps alone, never their words, so a refetch that moves a status moves no
 * card. Never less than the card's own cell.
 * @param steps How many steps the run has.
 */
export function openSpan(steps: number) {
  const width = panelWidth(steps);
  return {
    columns: Math.max(1, Math.ceil((width + GAP) / CELL_WIDTH)),
    rows: Math.max(1, Math.ceil((RUN_PANEL.height + GAP) / CELL_HEIGHT)),
  };
}

/**
 * The Factory's open runs after a click on one: closed if it was open, else open, and opened last.
 * @param open The ids of the open runs, the one opened last at the end.
 * @param id The id of the run clicked.
 */
export const toggleOpen = (open: readonly string[], id: string) =>
  open.includes(id) ? open.filter((other) => other !== id) : [...open, id];

/**
 * The open cards opening on the floor on this pass — `placeRuns`' `unfolding` — and what to remember for the next. A card opens
 * when it is drawn open and was not on the last pass: opened by a click, or brought back onto the floor open, finished runs shown
 * again or a run in flight waiting on it. A card drawn open on the last pass is not opening, however its panel grew — a step added
 * to a run moves no card. `drawn` is what the last pass remembered, and `spans` the cards drawn open now. The floor starts with the
 * cards left open on the last visit remembered, so they are not taken for cards opening over the ones a person left around them.
 * @param drawn The ids of the cards drawn open on the last pass.
 * @param spans The cards drawn open now, each with the cells it takes.
 */
export function unfoldingNow(drawn: ReadonlySet<string>, spans: ReadonlyMap<string, Span>) {
  return { unfolding: new Set([...spans.keys()].filter((id) => !drawn.has(id))), drawn: new Set(spans.keys()) };
}

/**
 * Where each run's card goes, for the runs on the floor, oldest first. `spans` holds the runs drawn open
 * and the cells each takes (`openSpan`), the run a person opened last first; a run not in it takes one cell.
 * `unfolding` holds the open cards opening now — drawn open since the floor was last laid out
 * (`unfoldingNow`) — and only those move a card aside: every open run by default.
 *
 * Claims are made open runs first, the one opened last first, then closed cards oldest first — so the run
 * a person just opened is never the one moved aside. In order of claim:
 *
 * 1. A card on the floor now stays where it is: a person put it there, or is looking at it. Unless a run
 *    opening that claimed before it is in any of its cells — a card growing over the cards beside it —
 *    and then it takes a free place (3). Nothing else moves a card on the floor: not a card or a step
 *    dropped over it, nor an open card that grew when its run gained a step, even stacked — that is the person's
 *    layout, as in a modeller where each piece moves alone.
 * 2. A card coming onto the floor goes back where it was left (`saved`), unless a card placed before
 *    it is in any of those cells. An open one opening as it comes claims before (1), when no card on the
 *    floor is in its own cell, and moves the cards beside it aside as a card opened there would. The cells were free while this card was
 *    off the floor — finished and hidden, say — and a run that started meanwhile took one; putting both there would hide one under
 *    the other, so the card coming back takes a free place instead.
 * 3. Any other card takes the first free place, row by row: the first cell from which every cell it
 *    takes is free. An open run wider than the grid starts a row, and its card runs past the grid's edge.
 *    Closed cards joined by `after` — each run's parents on the floor — are placed together, the first time
 *    one of them comes up: layered as a run's steps are (`layers`), each a column right of every card it
 *    waits on and level with the middle of them, so a diamond reads as one; and the whole at the first free
 *    place right of every card already down that one of them waits on, and left of every one that waits on it
 *    — or, where no column keeps both, right of what it waits on. Cards whose `after` go round in a cycle,
 *    which only a record edited by hand could have, are each placed on their own.
 *    When some of a group are down and others are not, the group is laid out again together if an open card moved
 *    one of them aside — moved a card at a time, it would be layered over the cards that moved alone — and the
 *    others go in among the cards down, which a person is looking at, if they are coming onto the floor. Each
 *    only where every edge still points right — a group that waits on an open run and that the open run waits
 *    on too has no such column when the two are also joined directly — the other way if that one cannot, and
 *    the cards down kept where they are, the others given way, if neither can.
 *
 * A card is in the cell nearest its corner — both rows, for one the layering puts halfway down a row — and
 * an open run in the cells its span covers from there, beyond the grid's edges as well as on the grid, so a
 * card opening past the edge moves a card a person parked there; only (3) keeps to the grid. A card off the
 * floor holds no cell: finished runs pile up, and holding their cells would leave holes that never close.
 * @param ids The ids of the runs on the floor, oldest first.
 * @param onFloor Where each card on the floor now stands.
 * @param saved Where each card was last left, or null where nothing is saved.
 * @param spans The runs drawn open and the cells each takes, the one opened last first; none by default.
 * @param after Each run's parents, the runs it waits on (`after`); none by default.
 * @param unfolding The open cards opening now (`unfoldingNow`); every open run by default.
 */
export function placeRuns(
  ids: readonly string[],
  onFloor: ReadonlyMap<string, Point>,
  saved: ReadonlyMap<string, Point> | null,
  spans: ReadonlyMap<string, Span> = new Map(),
  after: ReadonlyMap<string, readonly string[]> = new Map(),
  unfolding: ReadonlySet<string> = new Set(spans.keys()),
) {
  const floor = new Set(ids);
  const order = [...[...spans.keys()].filter((id) => floor.has(id)), ...ids.filter((id) => !spans.has(id))];
  const spanOfId = (id: string) => spans.get(id) ?? ONE_CELL;
  const parents = new Map(ids.map((id) => [id, [...new Set(after.get(id) ?? [])].filter((p) => floor.has(p) && p !== id)]));
  const children = new Map(ids.map((id) => [id, ids.filter((child) => parents.get(child)!.includes(id))]));
  const at = new Map<string, Point>();
  const taken = new Set<string>();
  const unfolded = new Set<string>();
  const mark = (id: string, point: Point) => {
    for (const cell of cellsOf(point, spanOfId(id))) {
      taken.add(cell);
      if (spans.has(id) && unfolding.has(id)) unfolded.add(cell);
    }
  };
  const put = (id: string, point: Point) => {
    at.set(id, point);
    mark(id, point);
  };
  const unput = (gone: readonly string[]) => {
    for (const id of gone) at.delete(id);
    taken.clear();
    unfolded.clear();
    for (const [id, point] of at) mark(id, point);
  };
  const free = (point: Point, span: Span, of: ReadonlySet<string>) => cellsOf(point, span).every((cell) => !of.has(cell));
  const columnOf = (id: string) => Math.round(at.get(id)!.x / CELL_WIDTH);

  const standing = new Set(order.flatMap((id) => (onFloor.has(id) ? cellsOf(onFloor.get(id)!, spanOfId(id)) : [])));
  for (const id of order) {
    const left = saved?.get(id);
    if (unfolding.has(id) && spans.has(id) && !onFloor.has(id) && left && free(left, ONE_CELL, standing) && free(left, spanOfId(id), taken))
      put(id, left);
  }
  for (const id of order) {
    const here = onFloor.get(id);
    if (!at.has(id) && here && free(here, spanOfId(id), unfolded)) put(id, here);
  }
  for (const id of order) {
    const left = saved?.get(id);
    if (!at.has(id) && left && free(left, spanOfId(id), taken)) put(id, left);
  }
  const groupOf = (id: string) => {
    if (spans.has(id)) return [id];
    const found = new Set([id]);
    for (const one of found) {
      for (const other of [...parents.get(one)!, ...children.get(one)!]) if (!spans.has(other)) found.add(other);
    }
    const group = ids.filter((other) => found.has(other));
    try {
      layers(group.map((name) => ({ name, after: parents.get(name)!.filter((p) => found.has(p)) })));
    } catch {
      return [id];
    }
    return group;
  };
  const shapeOf = (members: readonly string[]) => {
    const columns = layers(members.map((name) => ({ name, after: parents.get(name)!.filter((p) => members.includes(p)) })));
    const cells = columns.flatMap((column, c) => column.map((name, i) => [name, { x: c, y: i - (column.length - 1) / 2 }] as const));
    const top = Math.min(...cells.map(([, p]) => p.y));
    return new Map(cells.map(([name, p]) => [name, { x: p.x, y: p.y - top }]));
  };
  const placeTogether = (members: readonly string[], strict: boolean) => {
    const shape = shapeOf(members);
    const cell = (name: string) => shape.get(name)!;
    const first = Math.max(
      0,
      ...members.flatMap((m) =>
        parents
          .get(m)!
          .filter((p) => at.has(p))
          .map((p) => columnOf(p) + 1 - cell(m).x),
      ),
    );
    const cap = Math.min(
      Infinity,
      ...members.flatMap((m) =>
        children
          .get(m)!
          .filter((c) => at.has(c))
          .map((c) => columnOf(c) - 1 - cell(m).x),
      ),
    );
    if (cap < first && strict) return false;
    const width = Math.max(...members.map((m) => cell(m).x + spanOfId(m).columns));
    const last = Math.min(Math.max(first, GRID_COLUMNS - Math.min(width, GRID_COLUMNS)), cap < first ? Infinity : cap);
    for (let row = 0; ; row++) {
      for (let column = first; column <= last; column++) {
        const points = members.map((m) => [m, { x: (column + cell(m).x) * CELL_WIDTH, y: (row + cell(m).y) * CELL_HEIGHT }] as const);
        if (points.every(([m, point]) => free(point, spanOfId(m), taken))) {
          for (const [m, point] of points) put(m, point);
          return true;
        }
      }
    }
  };

  for (const id of order) {
    if (at.has(id)) continue;
    const group = groupOf(id);
    const loose = group.filter((m) => !at.has(m));
    const down = group.filter((m) => at.has(m));
    if (!down.length) {
      placeTogether(group, false);
      continue;
    }
    const amongDown = () => placeTogether(loose, true);
    const again = () => {
      const were = down.map((m) => [m, at.get(m)!] as const);
      unput(down);
      if (placeTogether(group, true)) return true;
      for (const [m, point] of were) put(m, point);
      return false;
    };
    const movedAside = loose.some((m) => onFloor.has(m));
    if (!(movedAside ? again() || amongDown() : amongDown() || again())) placeTogether(loose, false);
  }
  return new Map(ids.map((id) => [id, at.get(id)!]));
}

/**
 * The cells a card at `point` is in, as `row:column`: `span` across, from the column nearest its corner, and down every row it reaches.
 *
 * A card between two rows is in both of them, since a card is drawn up to a cell tall (`CELL_HEIGHT`): the layering puts a card halfway
 * down a row, level with the middle of the two beside it, and a person drags a card wherever they like. Rounded to the nearest row, the
 * row a card hangs a little way into would be free, and a card placed there would be drawn over its foot.
 *
 * Across it still rounds: cards are narrower than their cell by the gap between them, so two columns' cards never touch.
 */
function cellsOf({ x, y }: Point, span: Span) {
  const column = Math.round(x / CELL_WIDTH);
  const top = Math.floor(y / CELL_HEIGHT);
  const bottom = Math.ceil(y / CELL_HEIGHT + span.rows) - 1;
  const cells: string[] = [];
  for (let r = top; r <= bottom; r++) {
    for (let c = column; c < column + span.columns; c++) cells.push(`${r}:${c}`);
  }
  return cells;
}

/** How wide a cell is in an arrangement saved on a narrow grid, which puts its cards this far apart (`widenLayout`). */
export const NARROW_CELL_WIDTH = 320;

/**
 * An arrangement saved with cells `NARROW_CELL_WIDTH` wide, on the grid of cells `CELL_WIDTH` wide: each card as many cells across as it
 * was, and as far into its cell, so a card on the third column is on the third column still. Read unchanged, the cards would stand
 * `NARROW_CELL_WIDTH` apart, each on a cell of its own by `placeRuns`' rounding, and every card would cover the right of the one beside it.
 * Down is unchanged: a cell is as tall in both.
 * @param saved The arrangement saved on the narrow grid, each card's point by its run's id, or null where none is saved.
 */
export function widenLayout(saved: ReadonlyMap<string, Point> | null) {
  if (!saved) return null;
  return new Map([...saved].map(([id, { x, y }]) => [id, { x: (x * CELL_WIDTH) / NARROW_CELL_WIDTH, y }]));
}

/**
 * What to save: every card where it was last left — the ones on the floor now over what was saved —
 * and nothing for a run the store no longer lists.
 * @param saved What was saved, each card's point by its run's id, or null where nothing is.
 * @param now Where each card on the floor stands now.
 * @param known The ids of the runs the store lists.
 */
export function keepLayout(saved: ReadonlyMap<string, Point> | null, now: ReadonlyMap<string, Point>, known: ReadonlySet<string>) {
  return new Map([...(saved ?? []), ...now].filter(([id]) => known.has(id)));
}
