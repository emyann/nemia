/**
 * A call's admission, decided off the command table and the runs' state: whether a shell line an agent is about to run answers what waits
 * on the person (`admissionOf`), and the table's commands it types (`typedIn`). Pure: the caller reads the state (`admit.verb.ts`).
 */
import type { AdmissionAnswer, AdmissionCall } from 'agent-runtime/vocabulary';
import type { CommandClass } from './class.ts';

/** An entry of the table as admission reads it: its name, its class, and the side it is served on. */
type Entry = { readonly name: string; readonly nemia: CommandClass; readonly only?: { readonly side: 'cli' | 'api' } };

/** A command of the table typed on a shell line: its name, its class, and the words after its name. */
export type Typed = { name: string; nemia: CommandClass; args: string[] };

/**
 * A shell line's words and the separators between its commands. A quote splits words and is dropped, so a line run through `bash -c '…'`
 * is read as the line it quotes; a `$(`, a backtick, `;`, `&`, `|` and a line break each end a command.
 */
const PARTS = /[;&|()\n`]+|[^\s;&|()`'"]+/g;

/** Whether a part of a shell line ends a command. */
const ends = (part: string): boolean => /^[;&|()\n`]/.test(part);

/** The programs the table is typed under: the command, by any path, and its former name. */
const PROGRAMS = ['nemia', 'wf'];

/**
 * Each command of `table` typed on the shell line `line`, in order: a word naming the program (`nemia`, by any path, or `wf`), anywhere
 * on the line, then the longest name of a command the command line serves, word for word, and the words after it up to the command's end.
 */
export function typedIn(line: string, table: readonly Entry[]): Typed[] {
  const parts = line.match(PARTS) ?? [];
  const served = table.filter((e) => e.only?.side !== 'api').map((e) => ({ entry: e, words: e.name.split(' ') }));
  const typed: Typed[] = [];
  parts.forEach((part, at) => {
    if (!PROGRAMS.includes(part.slice(part.lastIndexOf('/') + 1))) return;
    const rest = parts.slice(at + 1);
    const words = rest.slice(0, rest.findIndex(ends) === -1 ? rest.length : rest.findIndex(ends));
    const named = served.filter((s) => s.words.every((w, i) => words[i] === w)).sort((a, b) => b.words.length - a.words.length)[0];
    if (named) typed.push({ name: named.entry.name, nemia: named.entry.nemia, args: words.slice(named.words.length) });
  });
  return typed;
}

/** Whether a command's words raise a step's cap. */
const raises = (args: readonly string[]): boolean => args.some((a) => a === '--budget' || a.startsWith('--budget='));

/**
 * Why a typed answer is asked of the person, or undefined where it waits on no one. A retry asks where it raises a cap (`--budget`), names
 * no run and step, or tries a step `waitOf` says waits on the person; any other answer always asks, since it only answers what waits.
 */
function askedOf({ name, args }: Typed, waitOf: (runId: string, step: string) => string | undefined): string | undefined {
  const line = ['nemia', name, ...args].join(' ');
  if (name !== 'retry') return `${line} answers what waits on you: it is yours to give.`;
  if (raises(args)) return `${line} raises a step's cap: a budget is yours to raise.`;
  const [runId, step] = args.filter((a) => !a.startsWith('-'));
  if (runId === undefined || step === undefined) return `${line} names no run and step, so admission cannot read what it tries.`;
  const waits = waitOf(runId, step);
  return waits === undefined ? undefined : `${line} answers what waits on you: ${step} of ${runId} ${waits}.`;
}

/**
 * Admission's answer for a call: `ask`, saying why in the person's words, where the call is a shell line that types an `answers` command
 * of `table` that waits on the person (`askedOf`); else none, and the call meets the session's own rules. `waitOf` says why a step waits
 * on the person — at its gate, on its question, out of rounds, at its cap, or not there to read — or undefined where it waits on no one.
 */
export function admissionOf(
  call: AdmissionCall,
  table: readonly Entry[],
  waitOf: (runId: string, step: string) => string | undefined,
): AdmissionAnswer | undefined {
  const line = call.input.command;
  if (call.tool !== 'Bash' || typeof line !== 'string') return undefined;
  for (const typed of typedIn(line, table).filter((t) => t.nemia === 'answers')) {
    const why = askedOf(typed, waitOf);
    if (why !== undefined) return { decision: 'ask', reason: why };
  }
  return undefined;
}
