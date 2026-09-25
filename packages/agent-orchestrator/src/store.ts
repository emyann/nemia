/**
 * The run store under `$WF_ROOT`: a run's id and its record, the files a person owns beside it — its cancellation, its pruning, each ask, approval
 * and acceptance — and the directories a step's check stderr, artifacts and inputs are kept in, outside every workspace.
 *
 * Beneath the controllers, as `retry.ts` is beneath `run.ts`: this file imports neither the engine nor a controller, `runner.ts` re-exports
 * what it exported of this before, and no pure file imports it (`test/boundary.test.ts`). `HOME` is read as this file loads, which is when
 * the package loads.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spentAcceptances, spentApprovals, spentRoundAsks, type Acceptance, type Approval, type Hold, type Pruned, type RoundAsk, type Run } from './run.ts';
import { spentAsks, type RetryAsk } from './retry.ts';
import { asNamed, asRan, orderSteps, withFormerNames, type Workflow } from './workflow.ts';
import { loadWorkflows } from './workflow-store.ts';
import { inputsRoot } from './places.ts';
import { countRecord, readText, within } from './tally.ts';

export const HOME = process.env.WF_ROOT ?? path.join(os.homedir(), '.agent-workflows');

export const runsDir = () => path.join(HOME, 'runs');
export const runFile = (id: string) => path.join(runsDir(), `${id}.json`);

/**
 * The inbox: cards before they are started, one `<name>.md` per card (`parseInboxCard` in inbox.ts), in the store beside `runs/` — not in a
 * repository, since a card's `repo:` says which one the idea is about.
 */
export const inboxDir = (): string => path.join(HOME, 'inbox');

/**
 * A cancellation gets its OWN file, and this is the whole reason it does.
 *
 * The run's json has one writer that rewrites it constantly — a tick reads the record, spends
 * seconds observing sessions and cutting worktrees, then writes back what it filed. `wf cancel` is
 * a second writer, and it exists to be used while that daemon is running: that is the point of the
 * verb. Two writers doing read-modify-write on one file is a lost update, and it was: a cancel
 * landing mid-pass was overwritten by the tick's stale copy, the mark vanished, and the run went
 * on filing steps. Re-reading before writing only narrows that window; it does not close it.
 *
 * So the two writers are given two files and never touch each other's. The tick owns the run's
 * steps, a person owns the cancellation, and `readRun` composes them. No lock, and nothing to get
 * wrong under a crash: the file exists or it does not.
 */
export const cancelFile = (id: string) => path.join(runsDir(), `${id}.cancelled`);

/**
 * That `wf prune` removed the run's worktrees: when, and each it removed with what it held on disk — a person's fact, in a file of its own
 * for the reason `cancelFile` is. Written by `prune` alone, before it removes anything, so a pass that reads the run while the worktrees
 * go files nothing more (`advance`), and composed onto the run on read (`readRun`) as `pruned`. `wf rm` removes it with the run.
 */
export const pruneFile = (id: string) => path.join(runsDir(), `${id}.pruned`);

/** The prune marker, read: undefined for a run never pruned, and for a marker that no longer reads as one, whose run is taken as pruned all the same. */
function readPruned(id: string): Pruned | undefined {
  let text: string;
  try { text = readText(pruneFile(id)); } catch { return undefined; }
  try {
    const { at, worktrees } = JSON.parse(text) as Partial<Pruned>;
    return { at: typeof at === 'string' ? at : '', worktrees: Array.isArray(worktrees) ? worktrees.filter((w) => typeof w?.path === 'string' && typeof w?.bytes === 'number') : [] };
  } catch {
    return { at: '', worktrees: [] };
  }
}

/**
 * That a person holds the run until other runs ship (`wf hold`): `{ at, until }`, a person's fact in a file of its own for the reason
 * `cancelFile` is. Written by `hold` alone, exclusively; removed by `wf hold --off`, by the tick once every run it names has shipped
 * (`removeHold`), and by `wf rm` with the run. Composed onto the run on read as `hold`.
 */
export const holdFile = (id: string) => path.join(runsDir(), `${id}.hold`);

/**
 * The hold, read: undefined for a run nobody holds. A file that no longer reads as a hold still holds the run, on no run named: the tick
 * never lifts a hold that names nothing, so only `wf hold --off` lifts it, and the run files nothing while the file is there (`advance`).
 */
function readHold(id: string): Hold | undefined {
  let text: string;
  try { text = readText(holdFile(id)); } catch { return undefined; }
  try {
    const { at, until } = JSON.parse(text) as Partial<Hold>;
    return { at: typeof at === 'string' ? at : '', until: Array.isArray(until) ? until.filter((u): u is string => typeof u === 'string') : [] };
  } catch {
    return { at: '', until: [] };
  }
}

/**
 * Write down that this run is held until `until` ship, and answer with the hold written — or null, when a hold already stands. `wx`, so a
 * hold two people put at once is the first one's, whole, and a hold is never edited: changing what it names is `--off` and a new hold.
 */
export const writeHold = (id: string, until: readonly string[]): Hold | null => {
  fs.mkdirSync(runsDir(), { recursive: true });
  const hold: Hold = { at: new Date().toISOString(), until: [...until] };
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
 * A run: its record, with what people own beside it composed on read — the cancellation (`cancelFile`), its pruning (`pruneFile`), its hold (`holdFile`), each
 * approval at a gate (`readApprovals`), and each loop a person ended as it stands (`readAcceptances`). None of them is ever written into
 * the record (`rewriteRun`).
 */
/** A run record read, counted as one (`countRecord`) under `records` while a pass is metered. */
export const readRun = (id: string): Run => within('records', () => readRecord(id));

const readRecord = (id: string): Run => {
  // A mistyped run id is the commonest way to reach this, and `ENOENT: no such file or directory,
  // open '/home/.../runs/r-xzy.json'` answers a question nobody asked. Every verb that takes an
  // id comes through here, so saying it once covers all of them.
  if (!fs.existsSync(runFile(id))) throw new Error(`no such run: ${id}  (try 'wf ls')`);
  countRecord();
  const { approvals: _, acceptances: __, pruned: ___, hold: ____, ...read } = JSON.parse(readText(runFile(id))) as Run;
  // A run frozen before a step key was renamed is read under the names the keys have now (`asNamed`), and written back under both (`recordText`).
  const run = read.workflow ? { ...read, workflow: read.workflow.map(asNamed) } : read;
  const at = fs.existsSync(cancelFile(id)) ? readText(cancelFile(id)).trim() : '';
  const pruned = readPruned(id);
  const hold = readHold(id);
  const { approvals } = readApprovals(id);
  const { acceptances } = readAcceptances(id);
  return {
    ...run, ...(at ? { cancelledAt: at } : {}), ...(pruned ? { pruned } : {}), ...(hold ? { hold } : {}),
    ...(approvals.length ? { approvals } : {}), ...(acceptances.length ? { acceptances } : {}),
  };
};

/**
 * The run's steps: the workflow it froze at `wf start`, in the order they run (`orderSteps`).
 *
 * The folder is read only for a record from before the run froze its workflow — and a run started
 * today never reaches that branch, so nothing written into the folder after `wf start` reaches it.
 * Ordered on the way out too, so a record frozen before steps were ordered — in the folder's order,
 * alphabetical — reads in the order its steps run, as one written since does. And each step as it ran then (`asRan`): a step bridged to
 * claude.ai before steps were jobs is the background session it was.
 */
export const stepsOf = (run: Run): Workflow[] => orderSteps((run.workflow ?? loadWorkflows(run.workflowDir)).map(asRan));

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
 * A person's `wf retry`, in files of its own: `runs/<id>.asks/retry-<step>-<n>`, one per try asked for.
 *
 * For the reason a cancellation has its own file: the run's json has one writer, the tick, and a verb typed
 * while `wf up` runs must not be a second. The verb creates the ask, whole and exclusively, and never touches
 * it again. Every pass reads the directory, and once the run's record holds the try an ask names, the tick
 * moves the file into `done/` — consumed, never edited. Naming the try is what makes an ask honoured once: a
 * pass that dies after filing the try and before consuming the ask files nothing more, because the next pass
 * finds the try on the board (`adoptTries`) or on the record (`spentAsks`).
 *
 * `wf round` is the same, in `round-<step>-<n>`: the looping step, and the round it asks for (`adoptRounds`, `spentRoundAsks`).
 *
 * `wf approve` too, in `approve-<step>-<n>`: the gated step, and the try it approves. It is never consumed while it opens the gate — the
 * record holds no approval, and every pass reads the file (`readRun`) — only once a later try of the step spent it (`spentApprovals`).
 *
 * And `wf accept`, in `accept-<step>-<n>`: the looping step whose loop a person ended as it stands, and the try they accepted. Read and
 * spent exactly as an approval is (`readAcceptances`, `spentAcceptances`) — every pass reads the file, so the loop stays ended after a
 * restart, and a later try of the step takes it back.
 */
export const asksDir = (id: string) => path.join(runsDir(), `${id}.asks`);
export const askFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `retry-${step}-${n}`);
export const roundAskFile = (id: string, step: string, round: number): string => path.join(asksDir(id), `round-${step}-${round}`);
export const approvalFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `approve-${step}-${n}`);
export const acceptFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `accept-${step}-${n}`);

/** The approvals at a run's gates, waiting in its asks directory — each opens the gate of the try it names — and a line for each file named as one that cannot be read as one. */
export function readApprovals(id: string): { approvals: Approval[]; notes: string[] } {
  return within('asks', () => readApprovalsNow(id));
}

function readApprovalsNow(id: string): { approvals: Approval[]; notes: string[] } {
  const approvals: Approval[] = [];
  const notes: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(asksDir(id), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  } catch { return { approvals, notes }; }
  for (const name of names) {
    const approved = /^approve-(.+)-(\d+)$/.exec(name);
    if (!approved) continue;
    const file = path.join(asksDir(id), name);
    const read = approvalIn(file, approved[1]!, Number(approved[2]));
    if (typeof read === 'string') notes.push(`${file}: ${read}, so it opens no gate — remove it, and approve with wf approve`);
    else approvals.push(read);
  }
  return { approvals, notes };
}

/** One approval file, read: the step and the try from its name, when and what was said from what it holds — or why it cannot be read. */
export function approvalIn(file: string, step: string, n: number): Approval | string {
  let held: unknown;
  try { held = JSON.parse(readText(file)); } catch (err) { return `unreadable (${(err as Error).message})`; }
  if (!held || typeof held !== 'object' || Array.isArray(held)) return 'it is not an approval wf approve wrote';
  const { at, message } = held as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return 'it says no time it was given';
  if (message !== undefined && typeof message !== 'string') return 'its message is not text';
  if (typeof message === 'string' && !message.trim()) return 'its message is empty';
  return { step, try: n, at, ...(typeof message === 'string' ? { message } : {}) };
}

/** The acceptances of a run's loops, waiting in its asks directory — each ends the loop of the try it names — and a line for each file named as one that cannot be read as one. */
export function readAcceptances(id: string): { acceptances: Acceptance[]; notes: string[] } {
  return within('asks', () => readAcceptancesNow(id));
}

function readAcceptancesNow(id: string): { acceptances: Acceptance[]; notes: string[] } {
  const acceptances: Acceptance[] = [];
  const notes: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(asksDir(id), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  } catch { return { acceptances, notes }; }
  for (const name of names) {
    const took = /^accept-(.+)-(\d+)$/.exec(name);
    if (!took) continue;
    const file = path.join(asksDir(id), name);
    const read = acceptanceIn(file, took[1]!, Number(took[2]));
    if (typeof read === 'string') notes.push(`${file}: ${read}, so it ends no loop — remove it, and accept with wf accept`);
    else acceptances.push(read);
  }
  return { acceptances, notes };
}

/**
 * One acceptance file, read: the looping step and the try from its name, when and what was said from what it holds — or why it cannot be
 * read. What `wf accept` refuses to write is refused here too, so a file written by hand is held to the verb's word: an acceptance with no
 * words ends a loop with findings open and tells the steps after it nothing, which is the whole of what it is for.
 */
export function acceptanceIn(file: string, step: string, n: number): Acceptance | string {
  let held: unknown;
  try { held = JSON.parse(readText(file)); } catch (err) { return `unreadable (${(err as Error).message})`; }
  if (!held || typeof held !== 'object' || Array.isArray(held)) return 'it is not an acceptance wf accept wrote';
  const { at, message } = held as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return 'it says no time it was given';
  if (typeof message !== 'string') return 'it says nothing of why the work is good enough with its findings open';
  if (!message.trim()) return 'its message is empty, and an acceptance is nothing but its reason';
  return { step, try: n, at, message };
}

/** The asks waiting in a run's directory — tries and rounds — and a line for each file there that names one and cannot be read as one. */
export function readAsks(id: string): { asks: RetryAsk[]; rounds: RoundAsk[]; notes: string[] } {
  return within('asks', () => readAsksNow(id));
}

function readAsksNow(id: string): { asks: RetryAsk[]; rounds: RoundAsk[]; notes: string[] } {
  const asks: RetryAsk[] = [];
  const rounds: RoundAsk[] = [];
  const notes: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(asksDir(id), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  } catch { return { asks, rounds, notes }; }
  // An approval opens a gate, read with the run (`readRun`); one that cannot be read is said on the pass, as an ask is. An acceptance
  // ends a loop the same way, and is said the same way.
  notes.push(...readApprovals(id).notes, ...readAcceptances(id).notes);
  for (const name of names) {
    // Anything else is not an ask: the file the verb writes before linking it into place starts with a dot.
    const tried = /^retry-(.+)-(\d+)$/.exec(name);
    const again = /^round-(.+)-(\d+)$/.exec(name);
    const file = path.join(asksDir(id), name);
    if (tried) {
      const ask = askIn(file, tried[1]!, Number(tried[2]));
      if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with wf retry`);
      else asks.push(ask);
    } else if (again) {
      const ask = roundAskIn(file, again[1]!, Number(again[2]));
      if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with wf round`);
      else rounds.push(ask);
    }
  }
  return { asks, rounds, notes };
}

/** One round ask file, read: the looping step and the round from its name, when from what it holds — or why it cannot be read. */
export function roundAskIn(file: string, step: string, round: number): RoundAsk | string {
  let held: unknown;
  try { held = JSON.parse(readText(file)); } catch (err) { return `unreadable (${(err as Error).message})`; }
  if (!held || typeof held !== 'object' || Array.isArray(held)) return 'it is not an ask wf round wrote';
  const { at, budget } = held as Record<string, unknown>;
  if (budget !== undefined && !isDollars(budget)) return 'its budget is not an amount of dollars above zero';
  return { step, round, ...(isDollars(budget) ? { budget } : {}), at: typeof at === 'string' ? at : '' };
}

/** An amount an ask file may carry as its budget: dollars above zero, as `wf retry --budget` and `wf round --budget` write one. */
const isDollars = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * One ask file, read: the step and the try from its name, how, when and what was said from what it holds — or why it cannot be read.
 * A file from before asks carried a message has none, and reads as it did. What `wf retry` refuses to write is refused here too, so a
 * file written by hand is held to the verb's word: a message that is not text or is empty, and a message on a recheck.
 */
export function askIn(file: string, step: string, n: number): RetryAsk | string {
  let held: unknown;
  try { held = JSON.parse(readText(file)); } catch (err) { return `unreadable (${(err as Error).message})`; }
  const { mode, model, message, budget, at } = (held && typeof held === 'object' ? held : {}) as Record<string, unknown>;
  if (mode !== 'nudge' && mode !== 'fresh' && mode !== 'recheck') return `it asks for no mode wf retry knows (${JSON.stringify(mode)})`;
  if (model !== undefined && (typeof model !== 'string' || !model)) return 'its model is not a name';
  if (message !== undefined && typeof message !== 'string') return 'its message is not text';
  if (typeof message === 'string' && !message.trim()) return 'its message is empty';
  if (message !== undefined && mode === 'recheck') return 'it carries a message and asks for a recheck, which files no session to read it';
  if (budget !== undefined && !isDollars(budget)) return 'its budget is not an amount of dollars above zero';
  if (budget !== undefined && mode === 'recheck') return 'it carries a budget and asks for a recheck, which files no session to spend it';
  return {
    step, try: n, mode, ...(model ? { model: model as string } : {}), ...(typeof message === 'string' ? { message } : {}),
    ...(isDollars(budget) ? { budget } : {}), at: typeof at === 'string' ? at : '',
  };
}

/**
 * Every ask that carried a message — still waiting, or consumed into `done/` — for what `wf ls` and `wf decide` say of a try that was
 * answered (`answerOf`). Composed on read, as the ask itself is: the run's record keeps no message. A file that cannot be read as an ask
 * is left out; the tick's own read (`readAsks`) says why.
 */
export function readAnswers(id: string): RetryAsk[] {
  return within('asks', () => readAnswersNow(id));
}

function readAnswersNow(id: string): RetryAsk[] {
  const answers: RetryAsk[] = [];
  for (const dir of [asksDir(id), path.join(asksDir(id), 'done')]) {
    let names: string[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
    } catch { continue; }
    for (const name of names) {
      const tried = /^retry-(.+)-(\d+)$/.exec(name);
      const ask = tried ? askIn(path.join(dir, name), tried[1]!, Number(tried[2])) : undefined;
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
export function writeAsk(file: string, ask: RetryAsk | RoundAsk | Approval | Acceptance): boolean {
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
 * Move each ask the run's record already answers into `done/` — and each approval a later try of its step spent (`spentApprovals`), and
 * each acceptance one spent (`spentAcceptances`). The tick's one touch on a person's file, and never an edit.
 */
export function consumeAsks(run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[]): void {
  within('act', () => consumeNow(run, asks, rounds));
}

function consumeNow(run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[]): void {
  const spent = [
    ...spentAsks(run, asks).map((a) => askFile(run.id, a.step, a.try)),
    ...spentRoundAsks(run, rounds).map((a) => roundAskFile(run.id, a.step, a.round)),
    ...spentApprovals(run).map((a) => approvalFile(run.id, a.step, a.try)),
    ...spentAcceptances(run).map((a) => acceptFile(run.id, a.step, a.try)),
  ];
  for (const file of spent) {
    const done = path.join(asksDir(run.id), 'done', path.basename(file));
    // Not `recursive`: `done/` is made inside the run's asks directory, never the directory itself, which `wf rm` may have removed mid-pass.
    try { fs.mkdirSync(path.dirname(done)); } catch { /* there already — or gone, with its run */ }
    try { fs.renameSync(file, done); } catch { /* already moved, by a pass beside this one — or removed, with its run */ }
  }
}

/** Every run in the store. A record `wf rm` removed after the directory was read is no run, and no reason to fail every other run's pass. */
export const listRuns = (): Run[] => within('records', () =>
  fs.existsSync(runsDir())
    ? fs.readdirSync(runsDir()).filter((f) => f.endsWith('.json')).flatMap((f) => {
      const id = path.basename(f, '.json');
      try {
        return [readRun(id)];
      } catch (err) {
        if (fs.existsSync(runFile(id))) throw err;
        return [];
      }
    }).sort((a, b) => a.id.localeCompare(b.id))
    : []);

/**
 * A record as it is written, by both writers: its frozen steps under each renamed key's name now and its former one (`withFormerNames`),
 * so a daemon older than the rename that ticks the run still files each step's rule lists.
 */
const recordText = (run: Omit<Run, 'approvals' | 'acceptances' | 'pruned' | 'hold'>): string =>
  JSON.stringify(run.workflow ? { ...run, workflow: run.workflow.map(withFormerNames) } : run, null, 2);

/** A new run's record: `start`'s, and the one writer that makes one. */
export const writeRun = (run: Run) => {
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.writeFileSync(runFile(run.id), recordText(run));
};

/**
 * Write back the record a pass read — only while it is still there, and false when it is not.
 *
 * A pass reads a run, spends seconds on the engine and git, and writes the run back. `wf rm` may remove the record in those seconds, and a
 * pass that wrote a whole new file would put it back: a run nobody can forget, pointing at worktrees that are gone. So the record is opened
 * `r+`, which never makes a file. Its existence is read at the moment of writing, and nothing is carried to decide it; a record removed
 * after it is opened takes the write with it.
 *
 * Without the approvals, acceptances, pruning and hold `readRun` composed onto it: they are a person's files, and a copy in the record would
 * outlive the file it was read from.
 */
export const rewriteRun = (run: Run): boolean => within('act', () => rewriteNow(run));

const rewriteNow = ({ approvals: _, acceptances: __, pruned: ___, hold: ____, ...run }: Run): boolean => {
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
 * Where a check's stderr goes: beside the run records, outside every workspace — a file inside one
 * would be committed by the next hand-off and ride the branch.
 */
export const checkStderr = (taskId: string): string => path.join(HOME, 'checks', `${taskId}.stderr`);

/**
 * The directory the run makes for a step's files: screenshots, logs, reports — for the steps after it
 * and the person who decides.
 *
 * Beside the run's record, outside every workspace, for the reason a check's stderr is: a file written
 * into a worktree is committed by the next hand-off and rides the branch, and a gitignored one never
 * reaches the next step's worktree at all. `advance` makes it before it files the step, tells the step in
 * its brief (`artifactsContract`), and hands it to the step's check as `WF_ARTIFACTS`.
 */
export const artifactsDir = (run: Pick<Run, 'id'>, step: string): string => path.join(runsDir(), run.id, 'artifacts', step);

/**
 * The directory `wf start --input` copies a run's files into: the run's own, beside its artifacts and outside every workspace, so a file a
 * person gave the run reaches each step without riding a branch. Named on each brief (`inputsLine`) with the names on the record.
 *
 * Outside every workspace is what a folder run's steps cannot reach: they run in `dontAsk`, fenced to their own folder. So a folder run
 * copies this directory into each folder it makes (`folderPlace.make`), and their briefs name that copy. The path itself is `places.ts`'s
 * (`inputsRoot`), since that is where the copy is read from.
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
  const slug = brief.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28).replace(/-$/, '');
  return `${slug || 'run'}-${Math.random().toString(36).slice(2, 6)}`;
};
