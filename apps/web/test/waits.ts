/**
 * An in-process wait a test makes on the event it counts, never on a length of time (`until`), a bell its source rings (`bell`), and the
 * one bound such a test takes, the runner's (`WAITED`). The one copy: a test of this package reads it through `src/waits/index.ts`, a
 * test of a layer above through `agent-runtime/testing`, and the board, which imports no package, keeps a copy held to this file.
 *
 * A wait has no deadline of its own: a machine under load makes any picked length a guess. It asks again when its event's source rings,
 * or at a pace where the event is a state read off disk or a worker, and it ends when its test's signal aborts, as the runner aborts it
 * at the test's `timeout`, saying what never came beside the runner's `test timed out`.
 */
/** The timers as the module loaded, so a test that mocks the clock's timers still has its wait asked at its pace. */
const later = globalThis.setTimeout;
const unlater = globalThis.clearTimeout;
const every = globalThis.setInterval;
const unevery = globalThis.clearInterval;

/** The longest delay a timer takes: what a pending wait holds the event loop open with, never a bound. */
const LONGEST_DELAY_MS = 2 ** 31 - 1;

/** The options of a test that waits: the runner's timeout alone bounds it, at 120 s. */
export const WAITED = { timeout: 120_000 } as const;

/** What a condition answers that ends a wait: anything but a falsy value. */
export type Truthy<T> = Exclude<T, false | 0 | 0n | '' | null | undefined>;

/** What a source rings when its event comes (`ring`), and what a wait hears it with (`hear`, which answers how to stop hearing). */
export type Bell = { ring: () => void; hear: (look: () => void) => () => void };

/** What `until` reads of a test: the signal the runner aborts at its timeout, and where it says what never came. */
export type Waiter = { signal: AbortSignal; diagnostic: (message: string) => void };

/**
 * A bell: each `ring` asks every wait that hears it again.
 *
 * @returns the bell, heard by no wait yet
 */
export function bell(): Bell {
  const lookers = new Set<() => void>();
  return {
    ring: () => {
      for (const look of lookers) look();
    },
    hear: (look) => {
      lookers.add(look);
      return () => lookers.delete(look);
    },
  };
}

/**
 * What a wait waited for, as its test is told when it fails: `what` itself, or what it answers when asked now; a function that throws
 * still has the wait fail, saying so.
 */
const told = (what: string | (() => string)): string => {
  if (typeof what === 'string') return what;
  try {
    return what();
  } catch (err) {
    return `(the wait could not say what: ${err instanceof Error ? err.message : String(err)})`;
  }
};

/**
 * Waits until `ok` answers truthy: asks it at once, again on each ring of `bell`, and every `everyMs` where a pace is given, one ask at a
 * time. The pace says how often to look, never how long to wait. A pending wait holds the event loop open, so a wait that never comes
 * ends at its test's timeout, never as a loop gone idle; one that cannot read its test's signal fails at once, holding nothing open.
 *
 * @param t the test that waits: its signal ends the wait, and its diagnostics say what never came
 * @param ok the condition, sync or async; what it throws fails the wait, so an assert inside it surfaces
 * @param what the event waited for, as a person reads it after `never came: `; or a function that says it, with the state the wait is
 *   stuck in, asked once, when the wait fails
 * @param how `bell`, rung by the event's source, and `everyMs`, the pace of a read where the event is a state
 * @returns the first truthy answer of `ok`
 * @throws `never came: <what>` once `t.signal` aborts, said also as a diagnostic of the test; or what `ok` threw
 */
export function until<T>(
  t: Waiter,
  ok: () => T | PromiseLike<T>,
  what: string | (() => string),
  how: { bell?: Bell; everyMs?: number } = {},
): Promise<Truthy<T>> {
  return new Promise<Truthy<T>>((resolve, reject) => {
    let settled = false;
    let asking = false;
    let again = false;
    let paced: ReturnType<typeof setTimeout> | undefined;
    let held: ReturnType<typeof setInterval> | undefined;
    let deaf: () => void = () => undefined;
    const settle = (end: () => void) => {
      if (settled) return;
      settled = true;
      unlater(paced);
      unevery(held);
      deaf();
      t.signal.removeEventListener('abort', abort);
      end();
    };
    const abort = () => {
      if (settled) return;
      const missed = `never came: ${told(what)}`;
      t.diagnostic(missed);
      settle(() => reject(new Error(missed)));
    };
    const ask = async (): Promise<void> => {
      if (settled) return;
      if (asking) {
        again = true;
        return;
      }
      asking = true;
      unlater(paced);
      try {
        const answer = await ok();
        if (answer) return settle(() => resolve(answer as Truthy<T>));
      } catch (err) {
        return settle(() => reject(err));
      } finally {
        asking = false;
      }
      if (again) {
        again = false;
        return ask();
      }
      if (how.everyMs !== undefined && !settled) paced = later(() => void ask(), how.everyMs);
    };
    if (t.signal.aborted) return abort();
    t.signal.addEventListener('abort', abort, { once: true });
    deaf = how.bell?.hear(() => void ask()) ?? deaf;
    held = every(() => undefined, LONGEST_DELAY_MS);
    void ask();
  });
}
