/**
 * What a step's status means for the person looking at it.
 *
 * The words are `wf ls`'s — what the run established, not only what the engine settled — and the board
 * shows them as they are; this only chooses the colour. `cancelled` is a fact about the run rather than
 * the step: a step that has not started on a run somebody called off never will, and a step the
 * cancellation stopped reads `stopped`.
 *
 * `held` is a fact about the run too: a person holds it until other runs ship (`wf hold`), so a step not filed will not be until the hold
 * lifts, and a step at a human gate asks nothing of anyone while it stands — every verb that would answer it is refused. The words stay
 * `wf ls`'s (`awaiting approval`, `succeeded · BLOCKED`); only the colour and the meaning say the run is held. A step at work, asking through
 * its harness (`needs-human`), checking, or settled keeps its state: what is in flight runs on, and a verdict is a verdict.
 */
export type StepState =
  | 'working'
  | 'needs-human'
  | 'checking'
  | 'verified'
  | 'unverified'
  | 'blocked'
  | 'awaiting-approval'
  | 'exhausted'
  | 'over-budget'
  | 'budget-exhausted'
  | 'denied'
  | 'unsigned'
  | 'failed'
  | 'failed-check'
  | 'waiting'
  | 'waiting-for-slot'
  | 'held'
  | 'cancelled'
  | 'unreadable'
  | 'unknown';

/**
 * `runHeld` has no default, on purpose: a caller that forgot the hold would draw a held run's gate as asking a person, and the compiler names
 * every caller that has to say it.
 */
export function stepState(status: string, runCancelled: boolean, runHeld: boolean): StepState {
  const state = wordState(status, runCancelled);
  return runHeld && !runCancelled && HELD_BY_A_HOLD.has(state) ? 'held' : state;
}

/** What a hold makes `held`: a step not filed yet, and one at a human gate (`isGate`), whose answer is refused while the hold stands. */
const HELD_BY_A_HOLD: ReadonlySet<StepState> = new Set([
  'waiting',
  'waiting-for-slot',
  'blocked',
  'awaiting-approval',
  'exhausted',
  'over-budget',
  'budget-exhausted',
]);

/** A step's state from its word alone, and whether the run was called off. */
function wordState(status: string, runCancelled: boolean): StepState {
  // `succeeded · BLOCKED`: the session ended cleanly, and the step is waiting on a person.
  const [word = '', said] = status.split(' · ');
  if (said === 'BLOCKED') return 'blocked';
  // The run's own verdict on a signed step: its check exited 0, is running, or did not exit 0.
  if (word === 'verified ✓') return 'verified';
  // At its gate: signed off — verified first, where it has a check — and nothing after it is filed until a person approves it or sends it back.
  if (word === 'awaiting approval') return 'awaiting-approval';
  // A loop out of rounds: its looping step asked for another round on the last one `rounds:` allows. Final, and a person decides.
  if (word === 'rounds exhausted') return 'exhausted';
  // Past its cap, with the amounts: its tries have cost its `budget:` or more and another session of it is the way on — `over budget $4.25 of
  // $3`, or on a looping step whose round would file one, `over budget — implement $4.25 of $3` — or its harness ended its session at the cap.
  // Final, and a person decides whether to spend more.
  if (word.startsWith('over budget ')) return 'over-budget';
  if (word === 'budget exhausted' || word.startsWith('budget exhausted ')) return 'budget-exhausted';
  if (word === 'checking') return 'checking';
  if (word.startsWith('failed ✗ check')) return 'failed-check';
  // Signed off, with no `check:` to run: nothing but its own word says it worked.
  if (word === 'unverified') return 'unverified';
  // Ended without the closeout it was asked for.
  if (word === 'unsigned') return 'unsigned';
  // Signed off, having been denied a call, on a step that says `denials: fail`: nothing after it is filed, and its check did not run.
  if (word === 'denied') return 'denied';
  if (word === 'needs-human') return 'needs-human';
  if (word === 'failed') return 'failed';
  if (word === 'stopped') return 'cancelled';
  // The engine's word for a session that ended, which is not work that was done: at most its own word.
  if (word === 'succeeded') return 'unverified';
  // A task held open whose turn signed, waiting for a person's word with nothing running: the run reads it as it signed. Its word beside
  // it says which — `input-required · BLOCKED` — and `wf ls` gives it that word or its own; alone it is a session that ended, as above.
  if (word === 'input-required') return 'unverified';
  if (word === 'unreadable') return 'unreadable';
  if (word === 'unknown') return 'unknown';
  // `waiting on a-1x2y (cancelled), b-3z4w`: a root of a run started `--after` runs that have not shipped. Not filed, as `waiting` is.
  // `waiting for a run slot (2 of 2 in flight)`, and on the feed without the count: a root of a run the cap on runs in flight holds.
  if (word === 'waiting for a run slot' || word.startsWith('waiting for a run slot ('))
    return runCancelled ? 'cancelled' : 'waiting-for-slot';
  if (word === 'waiting' || word.startsWith('waiting on ') || word === 'pending') return runCancelled ? 'cancelled' : 'waiting';
  // `running (working)`, `working (quiescent)`, `starting`, `between attempts` — and, on purpose, a word `wf ls` has
  // gained since this was written: a step the board cannot name is shown as still going, never as done or as needing you.
  return 'working';
}

/** Final, and a follower may be filed on it — `satisfiesAfter` in agent-orchestrator: verified, or done on its own word. */
export const satisfiesAfter = (state: StepState): boolean => state === 'verified' || state === 'unverified';

/**
 * A human gate: final, and the run goes no further until a person decides — a step that signed off blocked, a step waiting at its gate
 * for an approval (`wf approve`), a loop out of rounds (`wf round`), or a step past its budget, over it or ended at it (`--budget`), whose
 * way on is a person's word to spend more. What `wf decide` calls a blocked outcome, on the step's own word. Not a refused check nor an
 * unsigned step, which wait on you too but are work to try again (`wf retry`). On a run somebody called off, nobody is waiting for the
 * answer any more.
 */
export const isGate = (state: StepState, runCancelled: boolean): boolean =>
  (state === 'blocked' ||
    state === 'awaiting-approval' ||
    state === 'exhausted' ||
    state === 'over-budget' ||
    state === 'budget-exhausted') &&
  !runCancelled;

/** What each state means, for a person who hovers over a chip. */
export const stateMeaning: Record<StepState, string> = {
  working: 'working: its session is running',
  'needs-human': 'needs a person: its session is asking',
  checking: 'checking: it signed off, and the run is running its check',
  verified: 'verified: its check exited 0',
  unverified: 'unverified: it signed off and has no check, so only its own word says it worked',
  blocked: 'blocked: it signed off without finishing, and needs a person',
  'awaiting-approval':
    'awaiting approval: it signed off at its gate, and nothing after it is filed until a person approves it — wf approve — or sends it back — wf retry --message',
  exhausted:
    'rounds exhausted: the reviewer asked for another round on the last one rounds: allows; a person decides — wf round for another, or wf accept to go on with what is there',
  'over-budget':
    'over budget: its tries have cost its budget: or more, and the run spends nothing more on it until a person raises the cap — wf retry --budget, wf round --budget',
  'budget-exhausted':
    'budget exhausted: its harness ended its session at its budget:, and nothing more is filed for it until a person raises the cap — wf retry --budget',
  unsigned: 'unsigned: it ended without the closeout it was asked for',
  denied:
    "denied: its harness denied its try a call, and the step says denials: fail — nothing after it is filed until a person tries it again, and a new run's allowedTools: is where the call is let through",
  failed: 'failed: its session failed',
  'failed-check': 'failed its check: the command the run judges it by did not exit 0',
  waiting: 'waiting: not filed yet',
  'waiting-for-slot':
    'waiting for a run slot: not filed yet — the cap on runs in flight (WF_MAX_RUNS) holds the run, and the tick files it once a run in flight settles, oldest held first',
  held: 'held: a person holds the run until other runs ship (wf hold), so nothing of it is filed and nothing is asked of you until the hold lifts',
  cancelled: 'cancelled: the run was called off',
  unreadable:
    "unreadable: its task's journal holds an entry no runtime wrote, so the run is not judged and the tick does not advance it until the journal reads again — the run says which entry",
  unknown: 'unknown: the engine has no record of its task',
};

export const stateClass: Record<StepState, string> = {
  working: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  'needs-human': 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300',
  checking: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
  verified: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  // Neutral, not green: nothing checked it. `StatusChip` marks it too, so it does not pass for a step still to do.
  unverified:
    'bg-neutral-100 text-neutral-700 ring-1 ring-neutral-300 ring-inset dark:bg-neutral-800 dark:text-neutral-200 dark:ring-neutral-600',
  blocked: 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  // Waiting on a person, as `blocked` is: the work is signed off, and a person's word is what files what follows.
  'awaiting-approval': 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  // Waiting on a person, as `blocked` is: nothing broke, and the loop goes no further until somebody decides.
  exhausted: 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  // Waiting on a person too: whether to spend more is a decision, and the amounts beside the word say what was spent.
  'over-budget': 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  'budget-exhausted': 'bg-amber-100 font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-300',
  unsigned: 'bg-amber-50 text-amber-800 ring-1 ring-amber-400 ring-inset dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-700',
  // As `unsigned`: work to try again, not a question — it signed off, and what it did without the call is a person's to weigh.
  denied: 'bg-amber-50 text-amber-800 ring-1 ring-amber-400 ring-inset dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-700',
  failed: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  'failed-check':
    'bg-red-100 font-semibold text-red-800 ring-1 ring-red-300 ring-inset dark:bg-red-950 dark:text-red-300 dark:ring-red-800',
  waiting: 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  'waiting-for-slot': 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
  // Nobody is asked, as with `waiting`, and not grey: a person's word stops it, not the order of the steps.
  held: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300',
  cancelled: 'bg-neutral-100 text-neutral-500 line-through dark:bg-neutral-900 dark:text-neutral-500',
  unreadable: 'border border-dashed border-red-400 text-red-800 dark:border-red-700 dark:text-red-300',
  unknown: 'border border-dashed border-neutral-300 text-neutral-500 dark:border-neutral-700',
};
