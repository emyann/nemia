/**
 * The programs a factory's template declares (`programs/<name>/program.yaml`), as the daemon keeps them: a task of the runtime's command
 * harness, long-lived (`restartPolicy: 'Always'`), one for each factory and program, which the runtime restarts when its process ends.
 * What is pure of that: the task's id, which says what it runs, and what a beat files and stops, proved by
 * `contracts/programs-due.contract.ts`.
 */
import { createHash } from 'node:crypto';
import type { ProgramsDueOf } from '../../contracts/programs-due.contract.ts';
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
