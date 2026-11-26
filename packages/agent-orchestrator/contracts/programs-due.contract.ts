/**
 * What the programs' controller does on a beat (agent-orchestrator, src/program/program.ts, `programsDue`): from the tasks the
 * factories' templates declare now and the tasks of programs the engine holds, which to file and which to stop. Level-triggered: it
 * reads both on every beat and carries nothing between beats, as a Deployment's controller reconciles its Pods.
 *
 * A declared task's id is derived from its factory, its program's name and a digest of what it runs (its line and the factory's
 * generation), so a program whose declaration or factory changed is a new id: the old one is stopped, the new one filed. Restarting a
 * program whose process ended is the runtime's (`restartPolicy: 'Always'`), never this controller's: a task filed is never filed again
 * under its id, and one the runtime settled (its spawn refused, or stopped) is said down until its declaration changes.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A program's task as the engine holds it: its id, whether it settled, and whether a stop was asked of it. */
export type FiledProgram = { readonly id: string; readonly settled: boolean; readonly stopRequested: boolean };

/** What the beat does: the ids it files, and the ids it asks to stop. */
export type ProgramsDue = { readonly file: readonly string[]; readonly stop: readonly string[] };

/** Whether `ids` holds `id`. */
const holds = (ids: readonly string[], id: string) => ids.some((one) => one === id);

/** Whether the engine holds a task under `id`, settled or not. */
const filedAs = (filed: readonly FiledProgram[], id: string) => filed.some((f) => f.id === id);

/** Whether the task `f` still runs, or will run again, and nobody asked it to stop. */
const live = (f: FiledProgram) => !f.settled && !f.stopRequested;

const programsDueSpec = spec<(declared: readonly string[], filed: readonly FiledProgram[]) => ProgramsDue>({
  /** Each id is declared once, and the engine holds each id once. */
  requires: ({ input: [declared, filed] }) =>
    declared.every((a, i) => declared.every((b, j) => i === j || a !== b)) &&
    filed.every((a, i) => filed.every((b, j) => i === j || a.id !== b.id)),
  ensures: {
    filesWhatIsDeclaredAndNotHeld: {
      description: 'A declared program is filed exactly when the engine holds no task under its id',
      condition: ({ input: [declared, filed], output }) =>
        output.file.every((id) => holds(declared, id) && !filedAs(filed, id)) &&
        declared.every((id) => filedAs(filed, id) || holds(output.file, id)),
    },
    stopsWhatIsNoLongerDeclared: {
      description:
        'A live program task is asked to stop exactly when its id is no longer declared: its factory went, or its declaration changed',
      condition: ({ input: [declared, filed], output }) =>
        output.stop.every((id) => filed.some((f) => f.id === id && live(f)) && !holds(declared, id)) &&
        filed.every((f) => !live(f) || holds(declared, f.id) || holds(output.stop, f.id)),
    },
  },
});

/** `programsDue`'s type, which `src/program/program.ts` takes. */
export type ProgramsDueOf = Implementation<typeof programsDueSpec>;
