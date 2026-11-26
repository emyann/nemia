/**
 * The programs a factory's template declares (`programs/<name>/program.yaml`), as the daemon keeps them: a task of the runtime's command
 * harness, long-lived (`restartPolicy: 'Always'`), one for each factory and program, which the runtime restarts when its process ends.
 * What is pure of that: the task's id, which says what it runs, and what a beat files and stops, proved by
 * `contracts/programs-due.contract.ts`.
 */
import { createHash } from 'node:crypto';
import type { ProgramsDueOf } from '../../contracts/programs-due.contract.ts';
import type { Program as ProgramObject } from 'objects';
import type { Program } from '../factory/factory.ts';

/** The id every program's task begins with, which the record of the controller and a person's `nemia ls` tell it by. */
const PROGRAM_PREFIX = 'program-';

/**
 * The id of the task that runs `program` of `factory`: the factory's name, the program's, and a digest of the line it runs, the
 * conditions it writes, the factory's generation and its tree, so a program whose declaration or factory changed is a new task and the old
 * one is stopped.
 * @param factory The factory's name.
 * @param name The program's name.
 * @param program The program as the template declares it.
 * @param generation The factory's generation, or undefined where its file holds none.
 * @param tree The folder the factory runs from.
 */
export const programTaskId = (factory: string, name: string, program: Program, generation: number | undefined, tree: string) => {
  const digest = createHash('sha256')
    .update(JSON.stringify([program.run, program.writes, generation ?? 1, tree]))
    .digest('hex')
    .slice(0, 8);
  return `${PROGRAM_PREFIX}${factory}-${name}-${digest}`;
};

/**
 * What a beat does: each declared id the engine holds no task under is filed, and each live task the engine holds whose id is no longer
 * declared is asked to stop. A task a runtime settled is not filed again under its id.
 * @param declared The ids the factories' templates declare now.
 * @param filed The tasks of programs the engine holds.
 */
export const programsDue: ProgramsDueOf = (declared, filed) => ({
  file: declared.filter((id) => !filed.some((f) => f.id === id)),
  stop: filed.filter((f) => !f.settled && !f.stopRequested && !declared.some((id) => id === f.id)).map((f) => f.id),
});

/** What a program's task is, as far as its status reads it: when it was filed, whether the runtime settled it, and its attempts. */
export type ProgramHeld = {
  readonly filedAt?: string | undefined;
  readonly settled: string | null;
  readonly attempts: readonly { readonly startedAt: string; readonly endedAt: string | null }[];
};

/** The status of a factory's program, as its object carries it. */
type ProgramStatus = NonNullable<ProgramObject['status']>;

/**
 * What a person reads of a program whose task the runtime settled: that it will not be started again, and what to type so it runs.
 * @param id The program's task id.
 */
export const programDownMessage = (id: string) =>
  `The program task ${id} is down and the runtime will not restart it: change its \`run:\` in programs/<name>/program.yaml and apply the template again (nemia factory upgrade), or restart the daemon.`;

/**
 * Where a factory's program runs, read off its task: Pending where the engine holds none filed, Down where the runtime settled it (its
 * `message` says what to type), and Running otherwise, its restarts the attempts after the first and `since` the start of the latest.
 * @param held The program's task as the engine holds it, or undefined where it holds none.
 * @param id The task's id, which the message of a Down program names.
 */
export const programStatus = (held: ProgramHeld | undefined, id: string) => {
  if (held?.filedAt === undefined) return { phase: 'Pending', restarts: 0 } satisfies ProgramStatus;
  const last = held.attempts.at(-1);
  const restarts = Math.max(0, held.attempts.length - 1);
  if (held.settled === null) return { phase: 'Running', restarts, since: last?.startedAt ?? held.filedAt } satisfies ProgramStatus;
  return {
    phase: 'Down',
    restarts,
    since: last?.endedAt ?? last?.startedAt ?? held.filedAt,
    message: programDownMessage(id),
  } satisfies ProgramStatus;
};

/** A factory's program as a waiting step reads it: its name, the conditions it writes and the phase of its task. */
export type ProgramStanding = {
  readonly name: string;
  readonly writes: readonly string[];
  readonly phase: NonNullable<ProgramObject['status']>['phase'];
};

/** The program that writes a condition and where its task stands, or null where no program of the run's factory writes it. */
export type ConditionWriter = { readonly program: string; readonly phase: ProgramStanding['phase'] } | null;

/**
 * Who writes each condition of a factory, off its programs' standing: the first program that names it.
 * @param programs The factory's programs and where their tasks stand.
 */
export const writerOfIn = (programs: readonly ProgramStanding[]) => (condition: string) => {
  const found = programs.find((p) => p.writes.includes(condition));
  return (found === undefined ? null : { program: found.name, phase: found.phase }) satisfies ConditionWriter;
};
