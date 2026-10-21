/**
 * What a factory server's state means on the board: the harness's own word — `connected`, `needs-auth`, `failed`, `pending`,
 * `disabled` — or none read, drawn in the one meaning each carries. One writer, read by the factory's settings page and by
 * Capabilities, so the same word is the same colour on both.
 *
 * A colour means one of five things here: `needs-auth` is **yours**, the one state that waits on a person; `connected` is **alive**;
 * `failed` is **failure**; `pending` and `disabled` are **rest**, and so is a state that could not be read, which is a note and not a
 * caution — an absence read off a failed look is not an absence.
 */
import type { Hue } from './meaning.ts';

/** The word shown for a state, and the word for none read. */
export const UNREAD_STATE = 'unread';

/** A state's hue, and what its title says of it. */
type Drawn = { readonly hue: Hue; readonly title: string };

const STATES: Readonly<Record<string, Drawn>> = {
  connected: { hue: 'alive', title: 'Connected: the harness reached it and listed its tools' },
  'needs-auth': { hue: 'yours', title: 'Needs a sign-in: a session of it would reach no tool until the server is signed in' },
  failed: { hue: 'failure', title: 'Failed: the harness could not reach it' },
  pending: { hue: 'grey', title: 'Pending: the harness has not finished connecting' },
  disabled: { hue: 'grey', title: 'Disabled: the harness loads it for no session' },
};

/**
 * How the state `state` is drawn: its word, its hue and its title. `null`, and any word this board does not know — a newer harness
 * grew one — are drawn as unread, in rest: a word read as a state it is not would be worse than one read as nothing.
 */
export const stateDrawn = (state: string | null): { word: string } & Drawn => {
  const known = state === null ? undefined : STATES[state];
  if (known) return { word: state!, ...known };
  return {
    word: state ?? UNREAD_STATE,
    hue: 'grey',
    title:
      state === null
        ? 'Unread: the state could not be read, which is not an absence — press Read again'
        : `The harness says "${state}", which this board does not know: it is shown as read and nothing is concluded from it`,
  };
};

/** Whether `state` is the one state a person acts on: a server that waits on a sign-in, which holds back the steps that name it. */
export const waitsOnSignIn = (state: string | null): boolean => state === 'needs-auth';
