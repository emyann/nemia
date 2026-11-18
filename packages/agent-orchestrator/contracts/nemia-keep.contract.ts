/**
 * What the keeper owes Nemia's session on a beat (agent-orchestrator, src/nemia/nemia.ts): `nemiaDue`, the one place it is decided
 * whether her session is filed, kept operating a factory, kept talking with the person, put to rest, or left stopped; and `quietOf`,
 * whether the conversation has been quiet long enough for her to rest. Its gatherer, `keepOnce` (`src/nemia/keep.verb.ts`), reads the
 * levels, her task off the engine, her subscription, her chat's files and the keeper's record of her session (`session.json`), and acts
 * on what this answers, in order.
 *
 * Two roles, one session. **Operating**: while some factory's level is above `manual` she is kept, subscribed to the feed with her floor,
 * and never rests. **Conversation**: at any level, a word of the person's in her chat starts her where no task of hers is open, and at
 * `manual` she rests — her task stopped, the runtime's one end of a long-lived session — once the conversation has been quiet; the next
 * word files a new task that continues her last session (`resumeFrom`). A task that ended with no rest of the keeper's (stopped from
 * outside, or refused at its start) is filed again only on a word of the person's that came after the keeper saw it end.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What the keeper reads of her current task: whether it settled, and whether a stop was asked. Absent where none is filed. */
export type HerTask = { settled: boolean; stopRequested: boolean };

/**
 * What the keeper reads of her subscription: the task it tells, whether it carries her floor, and whether it carries her selectors as
 * they ship.
 */
export type HerSubscription = { task: string; scoped: boolean; selected: boolean };

/**
 * What the keeper reads on a beat. `above`: some factory, the default one included, is above `manual` now. `task`: her current task's
 * id, the last of the keeper's record. `trusted`: her harness trusts her folder (absent for a harness that keeps no trust, read as
 * trusted). `rested`: the keeper's record marks her current task put to rest by the keeper. `stoppedMarked`: the record marks it seen
 * ended with no rest of the keeper's. `heard`: a word of the person's — a chat entry, an answer, or a level set — was written after that
 * mark. `idle`: her session is open between turns (the runtime's phase `idle`). `idleMarked` and `quiet`: what `quietOf` answers of the
 * record's idle mark. `stale`: the person's custom words are not those she was filed or told with. `up`: her session hears what is said
 * to it. `owed`: her chat holds an entry not yet said to her. `asking`: her session holds a question open on the person. `closing`: the
 * chat holds an ask whose mark no longer says what became of its call. `answered`: the chat holds an answer of the person's not yet
 * carried to her. Each flag left out reads as false.
 */
export type Keeping = {
  above: boolean;
  task?: string;
  trusted?: boolean;
  rested?: boolean;
  stoppedMarked?: boolean;
  heard?: boolean;
  idle?: boolean;
  idleMarked?: boolean;
  quiet?: boolean;
  stale?: boolean;
  up?: boolean;
  owed?: boolean;
  asking?: boolean;
  closing?: boolean;
  answered?: boolean;
};

/**
 * What the keeper does: give her harness's trust to her folder (`trust`); file a new task, continuing her last session where she had
 * one (`file`); subscribe it to the feed (`subscribe`); drop her subscription (`drop`); put her to rest, the record marked before her
 * task is stopped (`rest`); mark her task seen ended with no rest (`markStopped`); mark her session seen idle (`markIdle`); say the
 * person's custom words (`sayCustom`); say the chat's words (`sayOutbox`); write down her open questions (`record`); carry the person's
 * answers (`answer`).
 */
export type NemiaAct =
  | 'trust'
  | 'file'
  | 'subscribe'
  | 'drop'
  | 'rest'
  | 'markStopped'
  | 'markIdle'
  | 'sayCustom'
  | 'sayOutbox'
  | 'record'
  | 'answer';

/** Her task is open: filed, not settled, and no stop asked. */
const isOpen = (t: HerTask | undefined): boolean => t !== undefined && !t.settled && !t.stopRequested;

/** Someone wants her: a factory above `manual`, or a word of the person's in her chat waiting for her. */
const wanted = (k: Keeping): boolean => k.above || k.owed === true || k.answered === true;

/**
 * A new task of hers may be filed: none is open, she is wanted, and either she never had one, the last was put to rest by the keeper,
 * or the person spoke after it ended with no rest.
 */
const mayFile = (k: Keeping, t: HerTask | undefined): boolean =>
  !isOpen(t) && wanted(k) && (t === undefined || k.rested === true || k.heard === true);

/** Her subscription tells her current task, with her floor and her selectors. */
const proper = (k: Keeping, s: HerSubscription | undefined): boolean =>
  s !== undefined && k.task !== undefined && s.task === k.task && s.scoped && s.selected;

/** She is operating: her open task, not put to rest, while some factory is above `manual`. */
const operating = (k: Keeping, t: HerTask | undefined): boolean => isOpen(t) && k.above && k.rested !== true;

/** The conversation is quiet: her session idle long enough since the last word, and nothing of the person's or hers waiting. */
const quietAll = (k: Keeping): boolean =>
  k.quiet === true && k.idle === true && k.owed !== true && k.answered !== true && k.asking !== true && k.closing !== true;

/** Her open task is to be put to rest: one the keeper already marked rested, or a quiet conversation at `manual`. */
const restDue = (k: Keeping, t: HerTask | undefined): boolean => isOpen(t) && (k.rested === true || (!k.above && quietAll(k)));

/** Her session is one the keeper speaks to: open, not being put to rest, and, while operating, subscribed as hers. */
const speaking = (k: Keeping, t: HerTask | undefined, s: HerSubscription | undefined): boolean =>
  isOpen(t) && !restDue(k, t) && (!k.above || proper(k, s));

/** Her task ended with no rest of the keeper's, and the person has said nothing since. */
const stoppedUnheard = (k: Keeping, t: HerTask | undefined): boolean =>
  t !== undefined && !isOpen(t) && k.rested !== true && k.heard !== true;

/** Whether `out` holds the act `a`. */
const has = (out: readonly NemiaAct[], a: NemiaAct): boolean => out.includes(a);

/** Whether `a` comes before `b` in `out`, both being there: the first of the two in `out` is `a`. */
const before = (out: readonly NemiaAct[], a: NemiaAct, b: NemiaAct): boolean => out.filter((x) => x === a || x === b).at(0) === a;

const nemiaDueSpec = spec<(keeping: Keeping, task: HerTask | undefined, subscribed: HerSubscription | undefined) => NemiaAct[]>({
  ensures: {
    fileExactlyWhenWantedAndNoneOpen: {
      description:
        'A task of hers is filed exactly when none is open, a factory is above manual or a word of the person’s waits for her, and her last task, if any, was put to rest or the person spoke after it ended',
      condition: ({ input: [k, t], output }) => has(output, 'file') === mayFile(k, t),
    },
    aMessageStartsHerAtAnyLevel: {
      description: 'On a store where she was never filed, a word of the person’s in her chat files her, whatever the levels say',
      condition: ({ input: [k, t], output }) => !(t === undefined && k.owed === true) || has(output, 'file'),
    },
    aStopFromOutsideHoldsUntilThePersonSpeaks: {
      description: 'A task of hers that ended with no rest of the keeper’s is followed by no filing until the person speaks after it',
      condition: ({ input: [k, t], output }) => !stoppedUnheard(k, t) || !has(output, 'file'),
    },
    trustOnlyBeforeAFiling: {
      description: 'Her folder is trusted exactly when a filing is due and her harness does not trust it, and before the filing',
      condition: ({ input: [k], output }) =>
        has(output, 'trust') === (has(output, 'file') && k.trusted === false) && (!has(output, 'trust') || before(output, 'trust', 'file')),
    },
    restExactlyWhenQuietAtManual: {
      description:
        'She is put to rest exactly when her task is open and either the keeper marked it rested or, with every factory at manual, the conversation is quiet',
      condition: ({ input: [k, t], output }) => has(output, 'rest') === restDue(k, t),
    },
    neverRestsWhileOperating: {
      description: 'While a factory is above manual, an open task the keeper never marked rested is never put to rest',
      condition: ({ input: [k], output }) => !(k.above && k.rested !== true) || !has(output, 'rest'),
    },
    subscribeExactlyWhenOperatingUnsubscribed: {
      description: 'Her subscription is put exactly when she operates and holds none that tells her task with her floor and selectors',
      condition: ({ input: [k, t, s], output }) => has(output, 'subscribe') === (operating(k, t) && !proper(k, s)),
    },
    dropExactlyWhenNotOperatingAsSubscribed: {
      description:
        'A subscription of hers is dropped exactly when there is one and she is not operating under it: every factory at manual, no task open, a rest, or one put for another task or without her floor or selectors',
      condition: ({ input: [k, t, s], output }) => has(output, 'drop') === (s !== undefined && !(operating(k, t) && proper(k, s))),
    },
    dropBeforeSubscribe: {
      description: 'A subscription left wrong is dropped before hers is put',
      condition: ({ output }) => !(has(output, 'drop') && has(output, 'subscribe')) || before(output, 'drop', 'subscribe'),
    },
    chatWordsSaidOnlyToASpeakingLiveSession: {
      description: 'The chat’s words are said to her exactly when some are owed, her session is up, and the keeper speaks to it',
      condition: ({ input: [k, t, s], output }) => has(output, 'sayOutbox') === (speaking(k, t, s) && k.owed === true && k.up === true),
    },
    answersCarriedOnlyToASpeakingLiveSession: {
      description: 'The person’s answers are carried exactly when one is owed, her session is up, and the keeper speaks to it',
      condition: ({ input: [k, t, s], output }) => has(output, 'answer') === (speaking(k, t, s) && k.answered === true && k.up === true),
    },
    questionsRecordedOnlyFromASpeakingLiveSession: {
      description:
        'Her questions are written down exactly when one is open or a mark is owed, her session is up, and the keeper speaks to it',
      condition: ({ input: [k, t, s], output }) =>
        has(output, 'record') === (speaking(k, t, s) && (k.asking === true || k.closing === true) && k.up === true),
    },
    customWordsSaidWhenStale: {
      description: 'The person’s custom words are said exactly when they changed and the keeper speaks to her session',
      condition: ({ input: [k, t, s], output }) => has(output, 'sayCustom') === (speaking(k, t, s) && k.stale === true),
    },
    idleMarkedOnce: {
      description: 'Her session is marked idle exactly when the keeper speaks to it, it is idle, and no mark since the last word says so',
      condition: ({ input: [k, t, s], output }) =>
        has(output, 'markIdle') === (speaking(k, t, s) && k.idle === true && k.idleMarked !== true),
    },
    endWithNoRestMarkedOnce: {
      description: 'A task of hers that ended with no rest is marked so exactly once, while the person has not spoken since',
      condition: ({ input: [k, t], output }) => has(output, 'markStopped') === (stoppedUnheard(k, t) && k.stoppedMarked !== true),
    },
    aFilingIsAllABeatDoes: {
      description: 'A beat that files her does nothing else but trust her folder and drop a subscription left over',
      condition: ({ output }) => !has(output, 'file') || output.every((a) => a === 'file' || a === 'trust' || a === 'drop'),
    },
    eachActOnce: {
      description: 'No act is owed twice on one beat',
      condition: ({ output }) => output.every((a) => output.filter((x) => x === a).length === 1),
    },
  },
});

/** What the keeper owes on a beat, in the order it acts. */
export type NemiaDue = Implementation<typeof nemiaDueSpec>;

/**
 * What `quietOf` reads, each a whole number of milliseconds, a moment on the wall clock since the epoch: `idleSince`, the keeper's idle mark of her current task (null
 * where none); `lastSaid`, the latest word the runtime journalled as said to it (null where none); `now`; and `restAfterMs`, how long a
 * quiet conversation lasts before she rests (`NEMIA_REST_AFTER`).
 */
export type IdleRead = { idleSince: number | null; lastSaid: number | null; now: number; restAfterMs: number };

/** Whether the idle mark stands since the last word said to her (`marked`), and whether it is old enough for her to rest (`quiet`). */
export type Quiet = { marked: boolean; quiet: boolean };

const quietOfSpec = spec<(read: IdleRead) => Quiet>({
  requires: ({ input: [r] }) =>
    Number.isSafeInteger(r.restAfterMs) &&
    r.restAfterMs > 0 &&
    Number.isSafeInteger(r.now) &&
    r.now >= 0 &&
    (r.idleSince === null || (Number.isSafeInteger(r.idleSince) && r.idleSince >= 0)) &&
    (r.lastSaid === null || (Number.isSafeInteger(r.lastSaid) && r.lastSaid >= 0)),
  ensures: {
    markedExactlyWhenIdleSeenSinceTheLastWord: {
      description: 'The idle mark stands exactly when there is one and no word was said to her after it',
      condition: ({ input: [r], output }) => output.marked === (r.idleSince !== null && (r.lastSaid === null || r.idleSince >= r.lastSaid)),
    },
    quietExactlyWhenTheMarkIsOldEnough: {
      description: 'The conversation is quiet exactly when the idle mark stands and is at least the rest’s length old',
      condition: ({ input: [r], output }) =>
        output.quiet === (output.marked && r.idleSince !== null && r.now - r.idleSince >= r.restAfterMs),
    },
  },
});

/** Whether the conversation is quiet enough for her to rest. */
export type QuietOf = Implementation<typeof quietOfSpec>;
