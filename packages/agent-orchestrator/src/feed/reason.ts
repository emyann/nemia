/**
 * The feed's closed vocabulary: the `reason` a line of it names, the kinds of thing it is written about, how serious it is (`type`),
 * whether it waits on a person (`waits`), and the message a person reads (`messageOf`).
 *
 * **A machine selects on the reason; a person reads the message.** The words themselves — `awaiting approval`, `failed ✗ check (exit 1)`,
 * `unverified · done` — are composed where each surface says them (`list.ts`, `cap.ts`, `wait.ts`, `ending.ts`, `assess.ts`) and are
 * free to be reworded; the code a watcher matches on is not. Every reason a line can name is named here: a selector written against it
 * keeps meaning what it meant when the prose moves. A run's and a step's line carry the code the listing judged them by (`Listing`'s
 * `reason`, `runCodes`), set where the word is built; this classifier reads a word only where no code came with it — a line written before
 * the feed was signed, and a one-shot offered by its word — and `feed.test.ts` and `test/assessed.ts` hold the codes the listing sets
 * to what it reads off the same word.
 *
 * **The codes are the owner's.** The 43 entries below — 17 of a run, 23 of a step, 1 of a daemon, 2 of the store, 32 distinct codes,
 * eleven of them shared between a run and a step — were named at their slices' design gates. A code renamed is still read under its
 * former name (`FORMER_REASONS`, below), on a line on disk and in a stored selector, so a rename breaks none.
 *
 * **Recognition is ordered** (`reasonOf`): the prefix `denied: ` of a one-shot before the bare `denied` of a check a person refused; the
 * suffix `· BLOCKED` before the word it is suffixed to, since a step that signed off blocked waits on a person whatever its session came
 * to; then the word itself, the part before the first ` · `, with `(pruned)` taken off a run's; then the suffixes `· closeout unreadable`
 * and `· done`, which say what a word of their own does not. `Unknown` is the catch-all, so the classifier is total: a reworded status
 * falls to it rather than to nothing, and `reason.test.ts` is what refuses that happening unseen.
 *
 * Pure, and importing no Effect: the feed's own half (`feed.ts`) stamps a line with what this answers, and `feed.store.ts` reads a line
 * with no `apiVersion` through it.
 */
import { SLOT_WAIT } from '../cap/cap.ts';
import { PAUSE_WAIT } from '../list/list.ts';
import { PERSON_WAITS, type AnswerVia, type WaitOn } from '../phase/phase.ts';

/**
 * The kinds of thing the feed writes a line about: a run, one of its steps, a daemon that took the store, or the store itself — its
 * pause, put by `nemia pause` and lifted by `nemia resume`, which is no run's and no daemon's.
 */
export type InvolvedKind = 'Run' | 'Step' | 'Daemon' | 'Store';

/** How serious a line is, as Kubernetes types an `Event`: routine news, or something gone wrong. */
export type LineType = 'Normal' | 'Warning';

/**
 * Who a line is the deed of: the tick's own judgement, the runtime's journal read through the client, a person's verb, or a daemon that
 * took the store. A property of the reason (`sourceOf`), since a machine selects on it — and so the table's, not a branch in the stamp.
 */
export const LINE_SOURCES = ['tick', 'runtime', 'person', 'daemon'] as const;

/** One of `LINE_SOURCES`. */
export type LineSource = (typeof LINE_SOURCES)[number];

/** What a line of the feed says of a thing, without its time: the word the tick judged, and the note beside it. */
export type Said = { word: string; note?: string };

/**
 * What the feed knows of one reason: the kinds it is written of, how serious it is, who it is the deed of
 * (`source`, the tick's where it names none) and whether it is a one-shot — a fact written exactly once per occurrence rather than a word
 * that stands until it changes, counted off the feed's own lines and never a thing's last word (`isOnce`, `foldFeed`).
 */
type Entry = { kinds: readonly InvolvedKind[]; type: LineType; source?: LineSource; once?: true };

/** The word a run's line says once its record is gone from the store (`nemia rm`): the fold forgets the run on reading it. */
export const REMOVED = 'removed';

/** The word of the line a daemon writes once it has taken the store (`startedLine`). */
export const DAEMON_STARTED = 'daemon started';

/** The prefix of a tool denial's word: the denied call follows it, as `denialText` spells the call. */
export const DENIED = 'denied: ';

/**
 * The word each of a person's acts, each of the two runtime faults, a step's closeout read and a pinned run behind its files say, the one
 * place it is spelled: the owner named the first six at their slice's design gate, `closed out` on its card and `revisions behind` at
 * its design's, and `reason.test.ts` holds each literally beside the rule below that reads it back.
 *
 * **None of them may carry a word a subscriber was woken by**: the retired prose match found its words anywhere inside a line's word, so
 * `failed`, `blocked` or `needs:` in one of these would have woken a subscriber for a fact the owner said waits on nobody — which is why a
 * refused spawn is `nothing started` and not `spawn failed`.
 */
export const LINE_WORDS = {
  Approved: 'approved',
  CancelAsked: 'cancel asked',
  HoldPut: 'hold put',
  HoldLifted: 'hold lifted',
  SpawnFailed: 'nothing started',
  SessionLost: 'session lost',
  ClosedOut: 'closed out',
  StorePaused: 'store paused',
  StoreResumed: 'store resumed',
  RevisionsBehind: 'revisions behind',
} as const satisfies Partial<Record<keyof typeof REASONS, string>>;

/**
 * Every reason a line of the feed names, with the kinds it belongs to, its type, whose deed it is (`source`) and whether it is a
 * one-shot (`once`). Whether it waits on a person is no entry's: it is the phases' (`PERSON_WAITS`, `waitsOf`). Closed: a word this
 * table does not recognise is `Unknown`, never a new code, and a code is added only by the owner naming it. A code it no longer names
 * is read through `FORMER_REASONS`, below.
 */
export const REASONS = {
  Running: { kinds: ['Run', 'Step'], type: 'Normal' },
  Succeeded: { kinds: ['Run', 'Step'], type: 'Normal' },
  Failed: { kinds: ['Run', 'Step'], type: 'Warning' },
  Cancelled: { kinds: ['Run'], type: 'Normal' },
  AwaitingApproval: { kinds: ['Run', 'Step'], type: 'Normal' },
  AwaitingAnswer: { kinds: ['Run', 'Step'], type: 'Normal' },
  AwaitingRound: { kinds: ['Run', 'Step'], type: 'Warning' },
  Removed: { kinds: ['Run'], type: 'Normal' },
  Pending: { kinds: ['Step'], type: 'Normal' },
  Waiting: { kinds: ['Run', 'Step'], type: 'Normal' },
  Checking: { kinds: ['Step'], type: 'Normal' },
  CheckPassed: { kinds: ['Step'], type: 'Normal' },
  CheckFailed: { kinds: ['Step'], type: 'Warning' },
  Denied: { kinds: ['Run', 'Step'], type: 'Warning' },
  BudgetExhausted: { kinds: ['Run', 'Step'], type: 'Warning' },
  OverBudget: { kinds: ['Run', 'Step'], type: 'Warning' },
  Stopped: { kinds: ['Step'], type: 'Warning' },
  Unsigned: { kinds: ['Run', 'Step'], type: 'Warning' },
  UnreadableCloseout: { kinds: ['Step'], type: 'Warning' },
  ToolDenied: { kinds: ['Step'], type: 'Warning', source: 'runtime', once: true },
  Approved: { kinds: ['Step'], type: 'Normal', source: 'person', once: true },
  CancelAsked: { kinds: ['Run'], type: 'Normal', source: 'person', once: true },
  HoldPut: { kinds: ['Run'], type: 'Normal', source: 'person', once: true },
  HoldLifted: { kinds: ['Run'], type: 'Normal', source: 'person', once: true },
  SpawnFailed: { kinds: ['Step'], type: 'Warning', source: 'runtime', once: true },
  SessionLost: { kinds: ['Step'], type: 'Warning', source: 'runtime', once: true },
  ClosedOut: { kinds: ['Step'], type: 'Normal', once: true },
  RevisionsBehind: { kinds: ['Run'], type: 'Warning', once: true },
  Unknown: { kinds: ['Step'], type: 'Warning' },
  DaemonStarted: { kinds: ['Daemon'], type: 'Normal', source: 'daemon' },
  StorePaused: { kinds: ['Store'], type: 'Normal', source: 'person', once: true },
  StoreResumed: { kinds: ['Store'], type: 'Normal', source: 'person', once: true },
} as const satisfies Record<string, Entry>;

/** One of the feed's reasons, the code a machine selects on. */
export type Reason = keyof typeof REASONS;

/** Every reason by name, for a reader that lists them and for the tests that hold the table whole. */
export const REASON_CODES = Object.keys(REASONS) as readonly Reason[];

/** What the table says of one reason, read as the one shape every entry has. */
const entryOf = (reason: Reason): Entry => REASONS[reason];

/** How serious a reason is, by the table: what a line's `type` says. */
export const typeOf = (reason: Reason): LineType => entryOf(reason).type;

/** The kinds a reason is written of, by the table: what a line's `involved.kind` may be where it names that reason. */
export const kindsOf = (reason: Reason): readonly InvolvedKind[] => entryOf(reason).kinds;

/**
 * Who a line of `reason` is the deed of, by the table: the tick's where the table names none, so a reason added without a source is the
 * tick's judgement, which is what every word it judges is.
 */
export const sourceOf = (reason: Reason): LineSource => entryOf(reason).source ?? 'tick';

/**
 * Whether `reason` is a one-shot: a fact written exactly once per occurrence — a call denied, a person's act, a spawn refused, a session
 * lost — rather than a word that stands until it changes. A one-shot is counted off the feed (`foldFeed`'s `shots`) and never becomes a
 * thing's last word, or the next pass would say the thing's real word again.
 *
 * **The reason this is asked of is a line's own, as its writer wrote it** (`reasonOfLine`), so it may be a code a newer `nemia` names and
 * this table does not have: such a line is no one-shot of ours and folds as a word does. The type says the code is one of ours; the line
 * came off a journal, which does not. Every other reader of the table is handed what `reasonOf` classified, which is total.
 */
export const isOnce = (reason: Reason): boolean => (REASONS as Partial<Record<string, Entry>>)[reason]?.once === true;

/** Where the parts of a note are joined, and where a message joins a word to its note. */
const PART = ' · ';

/** What a step's word is suffixed with when its closeout says it signed off blocked, is unreadable, or is done (`listing`). */
const BLOCKED_END = `${PART}BLOCKED`;
const UNREADABLE_END = `${PART}closeout unreadable`;
const DONE_END = `${PART}done`;

/** What `nemia ls` adds to a pruned run's word, and the feed with it: a decoration of the message, and no reason of its own. */
const PRUNED = ' (pruned)';

/**
 * A reason with what qualifies it, as a line carries it: `on`, what a `Waiting` line waits on, and `via`, where an `AwaitingAnswer`
 * line's answer is asked. The feed's loose form of the phases' `QualifiedStep`, since a line of any kind carries it.
 */
export type Codes = { reason: Reason; on?: WaitOn; via?: AnswerVia };

/** How one word is recognised: the whole of it (`is`), or its beginning (`starts`), which carries what varies after it. */
type Rule = ({ is: string; starts?: never } | { starts: string; is?: never }) & { reason: Reason; on?: WaitOn; via?: AnswerVia };

/**
 * A run's words, in the order they are tried: `assess`'s six statuses, `blocked`, an older feed's word for `waiting`, and the word of a
 * run the store no longer has.
 */
const RUN_WORDS: readonly Rule[] = [
  { is: 'running', reason: 'Running' },
  { is: 'succeeded', reason: 'Succeeded' },
  { is: 'cancelled', reason: 'Cancelled' },
  { is: 'awaiting approval', reason: 'AwaitingApproval' },
  { is: 'waiting', reason: 'AwaitingAnswer' },
  { is: 'blocked', reason: 'AwaitingAnswer' },
  { is: REMOVED, reason: 'Removed' },
  { is: LINE_WORDS.CancelAsked, reason: 'CancelAsked' },
  { is: LINE_WORDS.HoldPut, reason: 'HoldPut' },
  { is: LINE_WORDS.HoldLifted, reason: 'HoldLifted' },
  { is: LINE_WORDS.RevisionsBehind, reason: 'RevisionsBehind' },
  { starts: 'failed', reason: 'Failed' },
];

/**
 * A step's words, in the order they are tried: what `nemia ls` prints beside a step (`shownStatus`), the cap's and the pause's waits, and
 * the engine's word for its task as the feed keeps it (`feedPhase`). The narrower word comes first — the checkout's and the pause's wait
 * before a wait on a run, a check's failure before a task's — so a prefix never swallows a word of its own.
 */
const STEP_WORDS: readonly Rule[] = [
  { is: 'pending', reason: 'Pending' },
  { is: 'running', reason: 'Running' },
  { starts: SLOT_WAIT, reason: 'Waiting', on: 'limit' },
  { is: PAUSE_WAIT, reason: 'Waiting', on: 'pause' },
  { starts: 'waiting on the checkout', reason: 'Waiting', on: 'checkout' },
  { is: 'waiting', reason: 'Pending' },
  { starts: 'waiting on ', reason: 'Waiting', on: 'run' },
  { starts: 'needs-human', reason: 'AwaitingAnswer', via: 'session' },
  { is: 'awaiting approval', reason: 'AwaitingApproval' },
  { is: 'rounds exhausted', reason: 'AwaitingRound' },
  { is: 'checking', reason: 'Checking' },
  { is: 'verified ✓', reason: 'CheckPassed' },
  { starts: 'failed ✗ check', reason: 'CheckFailed' },
  { is: 'denied', reason: 'Denied' },
  { starts: 'budget exhausted', reason: 'BudgetExhausted' },
  { starts: 'over budget', reason: 'OverBudget' },
  { is: 'blocked', reason: 'AwaitingAnswer', via: 'closeout' },
  { is: 'succeeded', reason: 'Succeeded' },
  { starts: 'failed', reason: 'Failed' },
  { is: 'stopped', reason: 'Stopped' },
  { is: 'unsigned', reason: 'Unsigned' },
  { is: LINE_WORDS.Approved, reason: 'Approved' },
  { is: LINE_WORDS.SpawnFailed, reason: 'SpawnFailed' },
  { is: LINE_WORDS.SessionLost, reason: 'SessionLost' },
  { is: LINE_WORDS.ClosedOut, reason: 'ClosedOut' },
  { is: 'unknown', reason: 'Unknown' },
];

/** The store's words: its pause put and lifted, each a person's verb, said once per pause (`storeOnce`). */
const STORE_WORDS: readonly Rule[] = [
  { is: LINE_WORDS.StorePaused, reason: 'StorePaused' },
  { is: LINE_WORDS.StoreResumed, reason: 'StoreResumed' },
];

/** Whether `rule` recognises `word`: the whole word, or its beginning. */
const matches = (rule: Rule, word: string): boolean => (rule.is !== undefined ? word === rule.is : word.startsWith(rule.starts));

/**
 * Whether a run's note is a hold's (`holdWord`), which every wording of one begins with: a held run's word is `running`, and `Waiting` on
 * `run` is what tells it from a run with work in flight. Read only off a line written before the feed was signed.
 */
const isHeld = (note: string | undefined): boolean => note !== undefined && note.startsWith('held');

/** The codes a rule names: its reason, and what qualifies it where it says. */
const codesOfRule = ({ reason, on, via }: Rule): Codes => ({ reason, ...(on ? { on } : {}), ...(via ? { via } : {}) });

/**
 * The codes `said` names, of a thing of `kind`, read off its word: for a line that carries no reason of its own — a v0 line, upgraded on
 * read, and a one-shot offered by its word (`oncePast`). A run's and a step's word are never read back here: their line carries the code
 * the listing set (`feedWords`). Total: a word no rule recognises is `Unknown`, so a word reworded somewhere else in the package costs a
 * selector its meaning and never costs the feed a line. Pure.
 *
 * A daemon says one word and the type system holds it to that word (`startedLine`), so a daemon's line is `DaemonStarted`.
 */
export function codesOf(said: Said, kind: InvolvedKind): Codes {
  if (kind === 'Daemon') return { reason: 'DaemonStarted' };
  const { word } = said;
  if (kind === 'Store') return { reason: STORE_WORDS.find((rule) => matches(rule, word))?.reason ?? 'Unknown' };
  if (word.startsWith(DENIED)) return { reason: 'ToolDenied' };
  if (word.endsWith(BLOCKED_END)) return { reason: 'AwaitingAnswer', via: 'closeout' };
  const said0 = word.split(PART)[0];
  const base = kind === 'Run' && said0.endsWith(PRUNED) ? said0.slice(0, -PRUNED.length) : said0;
  if (kind === 'Run' && base === 'running' && isHeld(said.note)) return { reason: 'Waiting', on: 'run' };
  const found = (kind === 'Run' ? RUN_WORDS : STEP_WORDS).find((rule) => matches(rule, base));
  if (found) return codesOfRule(found);
  if (word.endsWith(UNREADABLE_END)) return { reason: 'UnreadableCloseout' };
  if (word.endsWith(DONE_END)) return { reason: 'Succeeded' };
  return { reason: 'Unknown' };
}

/** The reason `said` names, of a thing of `kind`, read off its word: `codesOf`'s, without what qualifies it. Pure. */
export const reasonOf = (said: Said, kind: InvolvedKind): Reason => codesOf(said, kind).reason;

/**
 * Whether a line of `reason` waits on a person: exactly the reasons of `PERSON_WAITS` — every reason of phase `waiting`, and `Failed`
 * and `CheckFailed` — and never a word of its note. Pure.
 *
 * A watcher's guarantee: no stop wakes fewer people than the retired wake words woke, which `reason.test.ts` holds as a superset over
 * every word the package writes (`FORMER_DEFAULT_WAKE`, and the selectors `selectorsOfWake` converts it to).
 */
export const waitsOf = (reason: Reason): boolean => PERSON_WAITS.has(reason);

/**
 * What a person reads of `said`: the word, and the note after it — `awaiting approval · approve it: nemia approve r-1 plan`. The one
 * writer of a line's `message`, for a v1 line stamped and for a v0 line upgraded on read alike, so both say the same sentence. Pure.
 */
export const messageOf = (said: Said): string =>
  said.note === undefined || said.note === '' ? said.word : `${said.word}${PART}${said.note}`;
