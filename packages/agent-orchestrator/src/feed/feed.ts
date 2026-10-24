/**
 * The workflow layer's feed: one line for each change in what the tick judged of a run or of a step, one from each daemon once it has
 * taken the store (`startedLine`), and one for each pause of the store put and lifted (`storeOnce`), appended to `$WF_ROOT/feed.jsonl`,
 * and read by `nemia watch`.
 *
 * The engine keeps a feed of what happened to its tasks (`engine/feed.jsonl`: filed, started, ended, settled). What the workflow layer
 * decides on top of it — a step at its gate, one that signed off blocked, a loop out of rounds, a run waiting on another, a person's
 * approval — is a pass's judgement, gone with the pass. This is where it is written down, as it changes, so a watcher reads it here
 * rather than asking again.
 *
 * **A report, never an input.** The daemon is its one writer — its tick, and `up` once it holds the store — and nothing reads it to
 * decide: every pass judges from the world (`assess`), and a feed deleted by hand costs the history, not a decision.
 *
 * **What a pass compares against is the feed itself**, folded (`foldFeed`): not a copy of the last words kept in memory, which a
 * restarted daemon would not have, and not the run's record, which `nemia show` prints and the tick would then rewrite on every change. A
 * process keeps the fold it has read so far with the byte it read to (`FeedMemo`), so a pass reads only the lines written since —
 * its own and any other writer's — and a process with no fold reads the whole feed once. So a restart writes nothing for what did not
 * change, and a `nemia tick` typed beside `nemia up` is read by the daemon's next pass rather than said again. A run at rest whose words
 * stand writes nothing when only its notes are worded anew, so a new wording does not say again every run long finished.
 *
 * **The cursor is the engine's**: a byte offset of complete lines, 0 or one a read handed out, that never expires, since the feed only
 * grows. A read stops at the last newline, so it never passes a line half written. Unlike the engine's, a cursor that is not at the start
 * of a line, or is past the end, is refused by name (`feedCursorRefusal`): read on from there and every line after it would be misread.
 *
 * Pure: the line, the fold, what a pass owes and what it judged of a run in the feed's words (`feedWords`). The file — read, appended to
 * and followed — is `feed.store.ts`'s, and the controllers hand the rest of the package what it needs.
 */
import { onYouWords, shownStatus, type ListedPhase, type Listing } from '../list/list.ts';
import type { EnginePhase } from '../views/views-words.ts';
import { oneLine, type Run } from '../record/record.ts';
import type { Assessment } from '../tick/assess.ts';
import type { Closeout } from '../closeout/index.ts';
import { holdWord } from '../wait/wait.ts';
import { SLOT_WAIT, slotWord } from '../cap/cap.ts';
import { takeoverLine, type DaemonStanding } from '../daemon/daemon.ts';
import {
  DAEMON_STARTED,
  DENIED,
  isOnce,
  messageOf,
  reasonOf,
  REMOVED,
  LINE_WORDS,
  sourceOf,
  typeOf,
  waitsOf,
  type InvolvedKind,
  type Reason,
  type LineSource,
  type LineType,
} from './reason.ts';

export { DAEMON_STARTED, REMOVED, LINE_WORDS };
export type { InvolvedKind, Reason, LineSource, LineType };

/** The version every line this `nemia` writes is stamped with; a line with none is upgraded on read (`upgraded`). */
export const FEED_VERSION = 'nemia/v1';

/** What a signal is about: a run by its id, one of its steps (`<run>/<step>`), a daemon by its pid, or the store (`STORE`). */
export type Involved = { kind: InvolvedKind; name: string };

/**
 * The labels a line carries, as a filing's do (`stepLabels`): the run, its factory and its workflow, and on a step's line the step and
 * its agent. A daemon's line is of no run and carries none.
 */
export type FeedLabels = { run?: string; factory?: string; workflow?: string; step?: string; agent?: string };

/**
 * What a v1 line says besides the four fields it keeps for one release: its version, what it is about (`involved`), its labels, the
 * `reason` a machine selects on, how serious it is (`type`), whether it waits on a person (`waits`), who wrote it (`source`) and the
 * `message` a person reads. And, on a `ToolDenied` one-shot alone, the `call` the harness denied, as `denialText` spells it, and `try`,
 * the step's try it belongs to, from 1 — the two fields a selector matches a denial by, and the two the tick counts the denials already
 * written by.
 *
 * Every one is optional on the type, because a line read off a feed written by an older `nemia` has none: `upgraded` is the one door
 * that fills them in, and every reader downstream of it sees them all.
 */
type Line = {
  apiVersion?: typeof FEED_VERSION;
  involved?: Involved;
  labels?: FeedLabels;
  reason?: Reason;
  type?: LineType;
  waits?: 'person';
  source?: LineSource;
  message?: string;
  call?: string;
  try?: number;
};

/**
 * A run's line of the feed: when, which run, which step of it (none for the run's own line), the word the tick judged, and the note beside
 * it — and what a v1 line signs it with (`Line`).
 */
export type RunLine = { at: string; run: string; step?: string; word: string; note?: string } & Line;

/** A daemon's line of the feed: when, its pid, that it started, and how the daemon before it ended. */
export type DaemonLine = { at: string; daemon: number; word: typeof DAEMON_STARTED; note?: string } & Line;

/**
 * The one name a line of the store carries (`involved {kind: 'Store', name: 'store'}`): the feed is one store's, so there is one store to
 * be about.
 */
export const STORE = 'store';

/**
 * The store's line of the feed: when, which store (`STORE`), the word — its pause put or lifted (`storeOnce`) — and the note beside it, the
 * moment the pause was put. Of no run, so it carries no run's labels, and a subscription scoped to a factory is handed it as it is handed a
 * daemon's.
 */
export type StoreLine = { at: string; store: string; word: string; note?: string } & Line;

/** One line of the feed: a run's (`RunLine`), a daemon's (`DaemonLine`), or the store's (`StoreLine`). */
export type FeedLine = RunLine | DaemonLine | StoreLine;

/** Whether `line` is a run's line, which the fold, a subscription's scope and the board's events read by its run. */
export const isRunLine = (line: FeedLine): line is RunLine => 'run' in line;

/** Whether `line` is the store's (`StoreLine`): its pause put or lifted. */
export const isStoreLine = (line: FeedLine): line is StoreLine => 'store' in line;

/**
 * What `line` is about, read off its `involved` where it has one and derived from its `run` and `step` where it has not, so a v0 line and
 * the v1 line of the same thing come to the same thing: a run by its id, a step as `<run>/<step>`, a daemon by its pid, the store by its
 * name. Pure.
 */
export const involvedOf = (line: FeedLine): Involved =>
  line.involved ??
  (isRunLine(line)
    ? line.step === undefined
      ? { kind: 'Run', name: line.run }
      : { kind: 'Step', name: `${line.run}/${line.step}` }
    : isStoreLine(line)
      ? { kind: 'Store', name: line.store }
      : { kind: 'Daemon', name: String(line.daemon) });

/** The labels `line` carries, its own where it has them, else what a v0 line says: its run, and its step where it names one. */
const labelsOf = (line: FeedLine): FeedLabels =>
  line.labels ?? (isRunLine(line) ? { run: line.run, ...(line.step !== undefined ? { step: line.step } : {}) } : {});

/**
 * `line` as a v1 signal: a line already stamped `nemia/v1` as it is, and any other with its version, what it is about, its labels, its
 * reason, its type, whether it waits, its source and its message filled in from the word and the note it was written with. Pure, and
 * nothing on disk is rewritten — this is read, never written back.
 *
 * It is also the one stamp a new line gets: `feedChanges`, `startedLine` and `onceLines` build the fields a line is written with and
 * hand them here, so a line written and a line upgraded say the same reason, type, wait and message. A line's `source` is the reason's by
 * the table (`sourceOf`), unless the offer named one of its own: a hold the tick lifted is the tick's deed under a reason a person's verb
 * usually writes, and nothing but the pass that lifted it can know that.
 *
 * A line that carries an `apiVersion` is trusted as written, whatever version it names. A `nemia` newer than this one may name a reason
 * this table does not have, or mark as waiting a reason this one does not: re-deriving either would answer for its writer, and a line is
 * a report of what its writer judged. Only a line with no version at all — one written before the feed was signed — is read off its word
 * and its note, and even then the fold reaches what it needs through `involvedOf` and the table where a key is still missing.
 */
export function upgraded(line: FeedLine): FeedLine {
  if (line.apiVersion !== undefined) return line;
  const involved = involvedOf(line);
  const reason = reasonOf(line, involved.kind);
  return {
    ...line,
    apiVersion: FEED_VERSION,
    involved,
    labels: labelsOf(line),
    reason,
    type: typeOf(reason),
    ...(waitsOf(reason, line.note) ? { waits: 'person' as const } : {}),
    source: line.source ?? sourceOf(reason),
    message: messageOf(line),
  };
}

/**
 * A line as a store decoded it off disk, upgraded to a v1 signal (`upgraded`): the one door between the loose shape the JSON held — a
 * string where this version writes a literal, so a line a newer `nemia` wrote is never dropped — and the typed line every reader works
 * with. The schemas that decode a line (`FeedLineSchema`, and the digest the deliverer keeps) read through here and nowhere else.
 */
export const lineAsRead = (line: Readonly<Record<string, unknown>>): FeedLine => upgraded(line as unknown as FeedLine);

/**
 * The line a daemon of pid `pid` writes once it has taken the store, at `at`, saying how the holder it `replaced` ended: stopped (when),
 * gone without a stop (`takeoverLine`'s words, `now` the clock they measure by), or none before it. Pure.
 */
export function startedLine(pid: number, replaced: DaemonStanding, at: string, now: number): DaemonLine {
  const gone = takeoverLine(replaced, 'the store', now);
  const note =
    replaced.kind === 'none'
      ? 'first daemon on this store'
      : replaced.kind === 'stopped'
        ? `last stopped at ${replaced.file.stoppedAt}`
        : gone && `last gone without a stop: ${gone}`;
  return upgraded({
    at,
    daemon: pid,
    word: DAEMON_STARTED,
    ...(note ? { note } : {}),
    involved: { kind: 'Daemon', name: String(pid) },
    labels: {},
  }) as DaemonLine;
}

/**
 * What the feed has said last of each thing it has not said is removed (`said`, keyed by what the line is about), and how many one-shots
 * it holds of each step's try (`shots`): a one-shot is counted and never becomes a step's last word, or the next pass would say the
 * step's real word again.
 */
export type FeedFold = { said: Map<string, FeedSaid>; shots: Map<string, number> };

/** A fold of nothing. */
export const freshFold = (): FeedFold => ({ said: new Map(), shots: new Map() });

/**
 * A process's fold of the feed, as far as it has read it: the byte it read to (`cursor`), and the file it read (`ino`), so a feed
 * replaced or truncated under it is read again from the start instead of compared against a fold of another file.
 */
export type FeedMemo = { cursor: number; ino?: number; fold: FeedFold };

/** A fold of nothing: what a process that has read no feed starts from. */
export const freshMemo = (): FeedMemo => ({ cursor: 0, fold: freshFold() });

/** Where the fold keeps what a line is about, derived the same from a v0 line and a v1 one. */
const foldKey = (involved: Involved): string => `${involved.kind}/${involved.name}`;

/**
 * Where the fold counts one occurrence of a one-shot: the reason its word names, what the line is about (`foldKey`'s shape, so `forget`
 * reads the run off it), the try it belongs to, and the note that tells one occurrence from another — the note last, so `holdOnce` reads
 * it back off the key. A run id and a step name are slugs and carry no `#`, so the note is what follows the second one.
 */
const onceKey = (involved: Involved, reason: Reason, tried: number | undefined, note: string | undefined): string =>
  `${reason} ${involved.kind}/${involved.name}#${tried ?? 0}#${note ?? ''}`;

/** What a one-shot of `run`, of its step `step` where it is of one, is about: the same `Involved` a line of it carries. */
const onceInvolved = (run: string, step: string | undefined): Involved =>
  step === undefined ? { kind: 'Run', name: run } : { kind: 'Step', name: `${run}/${step}` };

/** What a one-shot's key says the line is about, as `onceKey` joined it after the reason. */
const onceAbout = (key: string): string => key.slice(key.indexOf(' ') + 1);

/** The reason `line` names, its own where it has one, else the word's by the table. */
const reasonOfLine = (line: FeedLine, involved: Involved): Reason => line.reason ?? reasonOf(line, involved.kind);

/** A run and every step and one-shot of it taken out of the fold: what a `removed` line says the store no longer has. */
function forget(fold: FeedFold, run: string): void {
  fold.said.delete(foldKey({ kind: 'Run', name: run }));
  for (const key of fold.said.keys()) if (key.startsWith(`Step/${run}/`)) fold.said.delete(key);
  for (const key of fold.shots.keys())
    if (onceAbout(key).startsWith(`Run/${run}#`) || onceAbout(key).startsWith(`Step/${run}/`)) fold.shots.delete(key);
}

/** Counts one occurrence of the one-shot `line` says, under its key (`onceKey`). */
const counted = (fold: FeedFold, line: FeedLine, involved: Involved, reason: Reason): void => {
  const key = onceKey(involved, reason, line.try, line.note);
  fold.shots.set(key, (fold.shots.get(key) ?? 0) + 1);
};

/**
 * Each run's line folded onto what came before, keyed by what it is about (`involvedOf`), so a feed of v0 lines and one of v1 lines fold
 * to the same state: the last word said of each run and step wins, a `removed` forgets a run and everything of it, and a one-shot goes to
 * its own count and never to a step's last word. The store's one-shots are counted as a run's are (`storeOnce` reads them back), and a
 * `removed` leaves them, being of no run; a store line that is no one-shot of ours — a code a newer `nemia` names — is no word the fold
 * keeps. A daemon's line is no run's. Pure.
 */
export function foldFeed(fold: FeedFold, lines: readonly FeedLine[]): FeedFold {
  for (const l of lines) {
    if (isStoreLine(l)) {
      const involved = involvedOf(l);
      const reason = reasonOfLine(l, involved);
      if (isOnce(reason)) counted(fold, l, involved, reason);
      continue;
    }
    if (!isRunLine(l)) continue;
    const involved = involvedOf(l);
    const reason = reasonOfLine(l, involved);
    if (isOnce(reason)) {
      counted(fold, l, involved, reason);
      continue;
    }
    if (reason === 'Removed' && involved.kind === 'Run') {
      forget(fold, involved.name);
      continue;
    }
    fold.said.set(foldKey(involved), { word: l.word, ...(l.note !== undefined ? { note: l.note } : {}) });
  }
  return fold;
}

/**
 * Whether the feed owes no line for `b`, having said `a` of it last: the same word and the same note — or, of a run at rest, the same word,
 * whatever the note, since a note moving on a run nothing moves is a change of wording.
 */
const same = (a: FeedSaid | undefined, b: FeedSaid, atRest: boolean): boolean =>
  a !== undefined && a.word === b.word && (atRest || a.note === b.note);

/** The word and the note of a said, as a line carries them. */
const saidKeys = (said: FeedSaid): { word: string; note?: string } => ({
  word: said.word,
  ...(said.note !== undefined ? { note: said.note } : {}),
});

/**
 * A one-shot the pass offers the feed: a fact written exactly once per occurrence rather than a word that stands until it changes — a call
 * a harness denied, a person's act, a spawn refused, a session lost. The word and the note it says, the step it is of where it is of one,
 * the `call` a denial names and the `try` it belongs to where it has them, and a `source` over the reason's own where the deed is not the
 * one the reason implies (`upgraded`).
 *
 * **The reason is the word's, through the one classifier** (`reasonOf`): an offer carries no reason of its own, so the key an offer is
 * counted under and the key the line read back is counted under cannot drift apart and write the fact on every pass.
 *
 * What identifies one occurrence is its reason, what it is of, its try and its note (`onceKey`) — and, where several share all four, its
 * place among them: nothing in the runtime's journal stamps a denial, and two attempts of one try lost are told apart only by being two.
 */
export type Once = { step?: string; word: string; note?: string; call?: string; try?: number; source?: LineSource };

/** What a one-shot offered is about: the run it is of, or its step, as `onceInvolved` says it — or the store, for `storeOnce`'s. */
type About = (o: Once) => Involved;

/**
 * The one-shots of `offers` the feed does not hold already, in the order they were offered. Pure.
 *
 * **The count is read off the feed, not remembered.** The fold counts the lines written under each occurrence's key (`shots`), and this
 * takes the rest. Two offers that come to one key are two occurrences, counted by their place among them, so a second denial of the same
 * call in the same try, or a second attempt of it lost, gets its own line and a repeat of the first gets none. So a pass writes a fact
 * once however many passes read it, and a restarted daemon, which reads the whole feed, writes it neither again nor never.
 *
 * **One occurrence is offered once.** Nothing here can tell two offers of one occurrence from two occurrences — that is what counting by
 * place means — so whoever offers is what keeps them apart: `holdOnce` leaves the absence rule silent about the hold the pass itself
 * lifted, rather than offering the same lift twice and trusting this to notice.
 */
function oncePast(fold: FeedFold, about: About, offers: readonly Once[]): Once[] {
  const walked = new Map<string, number>();
  const out: Once[] = [];
  for (const o of offers) {
    const involved = about(o);
    const key = onceKey(involved, reasonOf(o, involved.kind), o.try, o.note);
    const nth = walked.get(key) ?? 0;
    walked.set(key, nth + 1);
    if (nth < (fold.shots.get(key) ?? 0)) continue;
    out.push(o);
  }
  return out;
}

/** The note a hold's put and its lift both carry: the moment the hold was put, which is what tells one hold of a run from the next. */
const holdSince = (at: string): string => `since ${at}`;

/**
 * The one-shots a run's hold owes the feed: the put, for the hold the pass read on the record (`held`, its `at`) or lifted itself
 * (`lifted`), and the lift — the pass's own, and one for each put the feed holds that is no longer the hold on the record. A put or a
 * lift already written is no concern of this: each is an offer like any other, and `oncePast` holds it to one line. Pure.
 *
 * **The put is offered from the hold the pass lifted too.** `liftHold` takes the hold off the record before the pass is worded, so a pass
 * that reads a hold and lifts it in one go — a parent that shipped before the daemon's next pass, or a daemon restarted after it — sees
 * only `lifted`. Offering the put from `held ?? lifted` is what keeps the person's own `nemia hold` from losing its line there; on a pass
 * that had already written the put, `oncePast` drops the second offer.
 *
 * **A fact a person deleted is answered by the pair, not by a key.** `nemia hold <run> --off` takes the hold's file away, so the next pass
 * reads only its absence; the feed holds the put, so the lift is due, and once written the pair is matched and no pass says it again. A
 * hold put, lifted and put again is two puts and two lifts, each told apart by the moment its hold was put (`holdSince`).
 *
 * The tick lifts a hold itself once every run it names has shipped (`liftHold`), and by then the hold is already off the record, so the
 * absence rule would read the tick's own deed as a person's. The pass that lifted it says so (`lifted`), and that one put is the
 * absence rule's exception: exactly one lift either way, sourced by whoever took the hold off.
 */
function holdOnce(fold: FeedFold, run: string, held: string | undefined, lifted: string | undefined): Once[] {
  const involved = onceInvolved(run, undefined);
  const standing = held === undefined ? undefined : holdSince(held);
  const lifting = lifted === undefined ? undefined : holdSince(lifted);
  const since = standing ?? lifting;
  const out: Once[] = [
    ...(since !== undefined ? [{ word: LINE_WORDS.HoldPut, note: since }] : []),
    ...(lifting !== undefined ? [{ word: LINE_WORDS.HoldLifted, note: lifting, source: 'tick' as const }] : []),
  ];
  const puts = onceKey(involved, 'HoldPut', undefined, '');
  for (const key of fold.shots.keys()) {
    if (!key.startsWith(puts)) continue;
    const note = key.slice(puts.length);
    if (note === standing || note === lifting) continue;
    out.push({ word: LINE_WORDS.HoldLifted, note });
  }
  return out;
}

/** What the store's one-shots are about: the store, by its one name. */
const STORE_INVOLVED: Involved = { kind: 'Store', name: STORE };

/**
 * The store's pause as a pass read it (`readPause`): the moment it was put while one stands, `null` when none does. A caller that did not
 * read it passes nothing, and the feed then offers nothing of the store — no absence read where nobody looked.
 */
export type FeedPause = { at: string } | null;

/**
 * The one-shots the store's pause owes the feed: the put, while a pause stands, and a lift for each put the feed holds that is not the one
 * standing. Both are a person's deed — only `nemia pause` puts the file and only `nemia resume` takes it away — so neither names a source
 * over the table's. A put or a lift already written is no concern of this: `oncePast` holds each to one line. Pure.
 *
 * **The lift is read off an absence**, as a hold's is (`holdOnce`): `nemia resume` deletes the file, so the next pass reads only that none
 * stands; the feed holds the put, so the lift is due, and once written the pair is matched. A pause put, lifted and put again is two puts
 * and two lifts, told apart by the moment each was put (`holdSince`); `nemia pause --now` on a store already paused keeps the standing
 * moment, and so writes no second put. A pause put and lifted between two passes leaves no line: a pass reads what stands.
 */
function storeOnce(fold: FeedFold, pause: FeedPause): Once[] {
  const standing = pause === null ? undefined : holdSince(pause.at);
  const out: Once[] = standing !== undefined ? [{ word: LINE_WORDS.StorePaused, note: standing }] : [];
  const puts = onceKey(STORE_INVOLVED, 'StorePaused', undefined, '');
  for (const key of fold.shots.keys()) {
    if (!key.startsWith(puts)) continue;
    const note = key.slice(puts.length);
    if (note !== standing) out.push({ word: LINE_WORDS.StoreResumed, note });
  }
  return out;
}

/** The store's lines a pass owes the feed (`storeOnce`), each written once per occurrence (`oncePast`), stamped through `upgraded`. */
const storeLines = (fold: FeedFold, at: string, pause: FeedPause): StoreLine[] =>
  oncePast(fold, () => STORE_INVOLVED, storeOnce(fold, pause)).map(
    (o) =>
      upgraded({
        at,
        store: STORE,
        word: o.word,
        ...(o.note !== undefined ? { note: o.note } : {}),
        involved: STORE_INVOLVED,
        labels: {},
      }) as StoreLine,
  );

/** One call a step's sessions were denied, as the one-shot the feed writes of it: the call in its word and as a field of its own. */
const denialOnce = (d: FeedDenial): Once => ({
  step: d.step,
  word: `${DENIED}${d.call}`,
  note: `try ${d.try}`,
  call: d.call,
  try: d.try,
});

/**
 * The one-shot a step's closeout read says: `closed out`, its note the try it is of. The note is all the line carries of it — the closeout
 * itself is in the log record `emitFeed` writes beside the line (`FeedCloseout`), never in the feed.
 */
const closeoutOnce = (c: FeedCloseout): Once => ({
  step: c.step,
  word: LINE_WORDS.ClosedOut,
  note: `try ${c.try}`,
  try: c.try,
});

/**
 * The lines a pass owes the feed for the one-shots `words` carries: each call its steps were denied, each act a person took on the run
 * (`acts`), its hold's put and lift (`holdOnce`), each fault the runtime journalled (`faults`) and each closeout its steps gave
 * (`closeouts`) — each written once per occurrence (`oncePast`), stamped through the one door (`upgraded`). Pure.
 */
function onceLines(fold: FeedFold, at: string, run: string, words: FeedWords): RunLine[] {
  const runLabels = words.labels ?? { run };
  const offers = [
    ...(words.denials ?? []).map(denialOnce),
    ...(words.acts ?? []),
    ...holdOnce(fold, run, words.held, words.lifted),
    ...(words.faults ?? []),
    ...(words.closeouts ?? []).map(closeoutOnce),
  ];
  return oncePast(fold, (o) => onceInvolved(run, o.step), offers).map(
    (o) =>
      upgraded({
        at,
        run,
        ...(o.step !== undefined ? { step: o.step } : {}),
        word: o.word,
        ...(o.note !== undefined ? { note: o.note } : {}),
        involved: onceInvolved(run, o.step),
        labels: o.step === undefined ? runLabels : (words.steps.find((s) => s.name === o.step)?.labels ?? { ...runLabels, step: o.step }),
        ...(o.call !== undefined ? { call: o.call } : {}),
        ...(o.try !== undefined ? { try: o.try } : {}),
        ...(o.source !== undefined ? { source: o.source } : {}),
      }) as RunLine,
  );
}

/**
 * The lines a pass owes the feed: one for each run and each step whose word or note is not what the feed said of it last — a run the feed
 * has never named says each of its words once — one line for each one-shot the feed does not hold yet (`onceLines`), one `removed`
 * for each run the feed still names that the store no longer has, and the store's pause put or lifted (`storeLines`) where the pass read
 * it (`pause`; nothing of the store where it is not given). Pure.
 *
 * A run the pass found at rest (`FeedWords.atRest`) owes a line only where a word moved: a note that moved alone, as a new wording of
 * the listing moves every finished run's, is not news of the run, and the feed keeps the note it said last.
 *
 * `now` is every run in the store, as the pass read it: a run not in it is a run that is gone — but for one of `unjudged`, which the pass
 * read and could not judge, and of which it says nothing. A removed run's steps get no line of their own.
 */
export function feedChanges(
  fold: FeedFold,
  now: ReadonlyMap<string, FeedWords>,
  at: string,
  unjudged: ReadonlySet<string> = new Set(),
  pause?: FeedPause,
): Array<RunLine | StoreLine> {
  const line = (run: string, step: string | undefined, said: FeedSaid, labels: FeedLabels): RunLine =>
    upgraded({
      at,
      run,
      ...(step !== undefined ? { step } : {}),
      ...saidKeys(said),
      involved: step === undefined ? { kind: 'Run', name: run } : { kind: 'Step', name: `${run}/${step}` },
      labels,
    }) as RunLine;
  const out: Array<RunLine | StoreLine> = [];
  for (const [id, words] of now) {
    const atRest = words.atRest === true;
    const runLabels = words.labels ?? { run: id };
    if (!same(fold.said.get(`Run/${id}`), words.run, atRest)) out.push(line(id, undefined, words.run, runLabels));
    for (const s of words.steps)
      if (!same(fold.said.get(`Step/${id}/${s.name}`), s, atRest))
        out.push(line(id, s.name, s, s.labels ?? { ...runLabels, step: s.name }));
    out.push(...onceLines(fold, at, id, words));
  }
  for (const key of fold.said.keys()) {
    const id = key.startsWith('Run/') ? key.slice('Run/'.length) : undefined;
    if (id !== undefined && !now.has(id) && !unjudged.has(id)) out.push(line(id, undefined, { word: REMOVED }, { run: id }));
  }
  if (pause !== undefined) out.push(...storeLines(fold, at, pause));
  return out;
}

/**
 * What one line of the feed says, without its time: `r-1  plan  awaiting approval  · approve it: …`, a daemon's `pid 4242  daemon
 * started  · …`, or the store's `store  —  store paused  · since …`; the message `emitFeed` logs.
 */
export const feedSaidWords = (l: FeedLine): string =>
  `${isRunLine(l) ? `${l.run}  ${l.step ?? '—'}` : isStoreLine(l) ? `${l.store}  —` : `pid ${l.daemon}`}  ${l.word}${l.note ? `  · ${l.note}` : ''}`;

/**
 * One line of the feed, for a person: `10:02:13  r-1  plan  awaiting approval  · approve it: …`: what `nemia watch` prints of it.
 */
export const feedLineWords = (l: FeedLine): string => `${l.at.slice(11, 19)}  ${feedSaidWords(l)}`;

/**
 * A line of the feed as its writer publishes it to the live readers in its process (`FeedHub`): the line, and the bytes it was written
 * at, from `from` to `to`, the cursor just after its newline.
 */
export type FeedPublished = { from: number; to: number; line: FeedLine };

/**
 * Where an append put its bytes, as its writer measured them (`recordFeed`): the file's size before it (`before`) and after it (`after`),
 * the lines it wrote, and `leading`, the newline it wrote first to end a line a writer died in, or `''`.
 */
export type FeedAppended = { lines: FeedLine[]; before: number; after: number; leading: string };

/**
 * Each line of an append with the bytes it was written at, for the live readers to take without reading the file (`FeedPublished`) — or
 * none, when the file grew by more than the append wrote: another writer appended between the size read before and the one after, and
 * where in that range this append's lines landed is not known, so nothing is vouched for and a reader reads the file. Pure.
 */
export function publishedOf({ lines, before, after, leading }: FeedAppended): FeedPublished[] {
  const sizes = lines.map((l) => Buffer.byteLength(`${JSON.stringify(l)}\n`));
  const written = Buffer.byteLength(leading) + sizes.reduce((a, b) => a + b, 0);
  if (after !== before + written) return [];
  let at = before + Buffer.byteLength(leading);
  return lines.map((line, i) => {
    const from = at;
    at += sizes[i];
    return { from, to: at, line };
  });
}

/** A word the feed keeps, and the note beside it, when there is one: what one line of it says of a run or of a step. */
export type FeedSaid = { word: string; note?: string };

/**
 * What a pass judged of one run, in the words the feed keeps (`feedWords`): the run's, and each step's in the order they run; and
 * `atRest` when the pass found the run at rest (`atRest` in rest.ts), whose notes moving alone owe the feed no line (`feedChanges`).
 *
 * Beside the words, the one-shots the pass read of the run, each written once per occurrence and no part of any word: the calls its
 * steps were denied (`denials`), the acts a person took on it (`acts`, from `actsOf`), the faults the runtime journalled (`faults`, from
 * `faultsOf`), the closeouts its steps' current turns gave (`closeouts`, from `closeoutsOf`), the moment the hold on its record was put
 * (`held`) and the moment of the hold this pass lifted itself (`lifted`), which `holdOnce` pairs into a put and a lift.
 */
export type FeedWords = {
  run: FeedSaid;
  steps: Array<FeedSaid & { name: string; labels?: FeedLabels }>;
  atRest?: true;
  labels?: FeedLabels;
  denials?: readonly FeedDenial[];
  acts?: readonly Once[];
  faults?: readonly Once[];
  closeouts?: readonly FeedCloseout[];
  held?: string;
  lifted?: string;
};

/**
 * A closeout a step's current turn gave, as the pass read it off the task's view: the step, the try it is of (from 1), what came back
 * (`said`) and what the run read of it (`read`: the closeout, or why it could not — `parseCloseout`'s error). A `closed out` one-shot is
 * written of it once (`closeoutOnce`); the closeout rides beside that line only as far as its log record (`emitFeed`), and the feed's file
 * keeps the line alone, so a review's findings or a spec's body costs `feed.jsonl` nothing.
 */
export type FeedCloseout = { step: string; try: number; said: unknown; read: Closeout | { error: string } };

/**
 * One call a step's sessions were denied, as a pass read it off the task's view: the step, the try it belongs to (from 1, as the task's
 * attempts are ordered), and the call in the runtime's words (`denialText`). What a `ToolDenied` one-shot is written from
 * (`denialLines`), in the order the runtime journalled them.
 */
export type FeedDenial = { step: string; try: number; call: string };

/**
 * The engine's word for a task, as the feed keeps it: every word of a session at work — `starting`, `working`, `quiescent`, `ending`,
 * `between-attempts` — is `running`, and every other word is itself. Total over the engine's words, so a word the runtime adds fails the
 * typecheck here until the feed says what it keeps of it.
 *
 * A session's live state moves between those words on its own, many times a step, and nothing of the run's judgement moves with it: a
 * feed that wrote each would write a line every few passes for every step at work, and a watcher waiting for a gate would read through
 * them. `ae watch` is where a session's own life is followed. `pending` (filed, waiting for a session slot), `needs-human`,
 * `input-required`, `idle`, `restarting` and the settled words are kept: each is something the run decides on, or a word the feed has
 * always kept as itself, so no line already in `feed.jsonl` changes meaning.
 */
const FEED_WORD: Record<EnginePhase | 'unknown', ListedPhase> = {
  pending: 'pending',
  starting: 'running',
  working: 'running',
  quiescent: 'running',
  'needs-human': 'needs-human',
  'input-required': 'input-required',
  idle: 'idle',
  restarting: 'restarting',
  'between-attempts': 'running',
  ending: 'running',
  succeeded: 'succeeded',
  failed: 'failed',
  stopped: 'stopped',
  unknown: 'unknown',
};

/** The engine's word for a task as the feed keeps it (`FEED_WORD`). Pure. */
export const feedPhase = (word: EnginePhase | 'unknown'): ListedPhase => FEED_WORD[word];

/**
 * What the feed says of a run as a pass judged it: the listing `nemia ls` prints (`listing`, handed the engine's words through
 * `feedPhase`), in the feed's words. Pure.
 *
 * Each step's word is its status as `nemia ls` prints it (`shownStatus`), and its note the note beside it there — the try due or on, the
 * gate and what answers it, how many times it was said to — which is where a person's writes show. Not its cost, which moves while nothing
 * is decided. A step that signed off blocked puts what it needs before that note (`needsNote`). The run's word is `assess`'s status —
 * `awaiting approval` at a gate, as `nemia decide` says it, and `failed` only where a step broke —
 * `(pruned)` beside it as `nemia ls` says it, and its note who it waits on you for (`onYouWords`) — or, on a held run, what it is held
 * until (`holdWord`), and nobody is waited on.
 *
 * One more departure from `nemia ls`: a root the cap on runs in flight holds says `waiting for a run slot`, without the count in flight,
 * which moves with every other run's start and end while nothing of this one does.
 *
 * What a step's sessions were denied is no part of its word: each denial is a one-shot signal of its own (`denialLines`), written once
 * per denial, and `labelled.denials` is what the pass read of them.
 *
 * @param closeoutOf How each step signed off, as `listing` was handed it: a step that signed off blocked says what it needs beside its
 *   word.
 * @param labelled The labels of the run and of each of its steps, from the one source a filing's labels come from (`stepLabels`), and the
 *   one-shots the pass read of the run beside them — the calls its steps were denied, a person's acts, the runtime's faults, the closeouts
 *   its steps gave, and the two moments a hold is paired by (`FeedWords`). The labels have one writer, the pass that files the steps:
 *   nothing here decides what a label is.
 */
export function feedWords(
  l: Listing,
  run: Pick<Run, 'pruned' | 'hold'>,
  { status }: Pick<Assessment, 'status'>,
  closeoutOf: (step: string) => Closeout | { error: string } | undefined = () => undefined,
  labelled: {
    run?: FeedLabels;
    step?: (step: string) => FeedLabels;
    denials?: readonly FeedDenial[];
    acts?: readonly Once[];
    faults?: readonly Once[];
    closeouts?: readonly FeedCloseout[];
    held?: string;
    lifted?: string;
  } = {},
): FeedWords {
  const onYou = onYouWords(l);
  return {
    ...(labelled.run ? { labels: labelled.run } : {}),
    ...(labelled.denials?.length ? { denials: labelled.denials } : {}),
    ...(labelled.acts?.length ? { acts: labelled.acts } : {}),
    ...(labelled.faults?.length ? { faults: labelled.faults } : {}),
    ...(labelled.closeouts?.length ? { closeouts: labelled.closeouts } : {}),
    ...(labelled.held !== undefined ? { held: labelled.held } : {}),
    ...(labelled.lifted !== undefined ? { lifted: labelled.lifted } : {}),
    run: {
      word: `${status}${run.pruned ? ' (pruned)' : ''}`,
      ...(run.hold && status !== 'cancelled'
        ? { note: holdWord(l.holding ?? [], run.hold) }
        : onYou.length
          ? { note: `waiting on you: ${onYou.join(', ')}` }
          : {}),
    },
    steps: l.steps.map((s) => {
      const note = [needsNote(closeoutOf(s.name)), s.note].filter(Boolean).join(' · ');
      const labels = labelled.step?.(s.name);
      return {
        name: s.name,
        word: l.slot && s.status === slotWord(l.slot) ? SLOT_WAIT : shownStatus(s),
        ...(note ? { note } : {}),
        ...(labels ? { labels } : {}),
      };
    }),
  };
}

/**
 * The longest `needs` the feed carries. A feed line is one line of `nemia watch`, and a step's `needs` is the agent's, of any length: past
 * this it is clipped, and `nemia decide` has it whole.
 */
const NEEDS_CAP = 200;

/**
 * What a step that signed off blocked needs, for its line in the feed: `needs: <its closeout's needs>`, one line (`oneLine`) — or nothing,
 * for a step that did not sign off blocked or said nothing it needs. Its word says `BLOCKED` already (`listing`); this is the question, so
 * a watcher does not have to run `nemia decide` to read it. Pure.
 */
const needsNote = (c: Closeout | { error: string } | undefined): string => {
  const needs = c && !('error' in c) && c.outcome === 'blocked' && typeof c.needs === 'string' ? oneLine(c.needs, NEEDS_CAP) : '';
  return needs ? `needs: ${needs}` : '';
};
