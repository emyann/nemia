/**
 * A process, as a harness: the program a task's `config.command` names, run to its end in the task's folder, its stdout and its
 * stderr each kept whole, its exit code the verdict.
 */
import { spawnSync } from 'node:child_process';
import type { HarnessSpec } from '../detached/detached.ts';

/** The arguments of a task the command harness reads; any other is refused (`commandHarness.refuses`). */
const OWN: readonly string[] = ['command', 'env', 'niceness'];

/** Whether `ionice -c3` runs under `nice`, asked once a process, by running the two as a command would. */
let idleIoRuns: boolean | undefined;

/**
 * Whether a command run at `niceness` can be put in the idle IO class too: `nice -n <niceness> ionice -c3 true`, the form the
 * command is run in, exits 0. Asked once a process; a machine without `ionice`, or one that refuses the class, answers false.
 */
const idleIoProbe = (niceness: number): boolean => {
  idleIoRuns ??= spawnSync('nice', ['-n', String(niceness), 'ionice', '-c3', 'true'], { stdio: 'ignore' }).status === 0;
  return idleIoRuns;
};

/**
 * The command harness. A task names its process as `config.command`, the program first, and may give `config.env`, laid over
 * the worker's environment, and `config.niceness`, from 0 to 19. Its argv:
 *
 * - `config.command` as it is, at niceness 0 or none;
 * - `nice -n <niceness>` before it above 0, and `ionice -c3` after that where the machine runs it (`idleIoProbe`): a process
 *   given a lower priority is given the idle IO class too.
 *
 * The brief is not read: the command is the work. A task without `config.command` is refused at `file()`, and at spawn; one
 * that carries an argument of another harness is refused at `file()`.
 */
export const commandHarness: HarnessSpec = {
  name: 'command',
  commandArgs: true,
  streams: true,
  prepare: (r) => {
    const command = r.config?.command;
    if (!command?.length) throw new Error(`\`${r.name}\` names no \`config.command\`: the command harness runs only the one a task gives.`);
    const niceness = r.config?.niceness ?? 0;
    return niceness > 0 && idleIoProbe(niceness) ? { idleIo: true } : {};
  },
  command: (r, io) => {
    const [cmd = '', ...args] = r.config?.command ?? [];
    const niceness = r.config?.niceness ?? 0;
    const env = r.config?.env ? { env: r.config.env } : {};
    if (niceness === 0) return { cmd, args, ...env };
    const idle = io?.idleIo ? ['ionice', '-c3'] : [];
    return { cmd: 'nice', args: ['-n', String(niceness), ...idle, cmd, ...args], ...env };
  },
  refuses: (task) => {
    if (!task.config?.command) {
      return 'A task on the command harness names its process: give `config.command`, the program and its arguments as a list of strings, like ["sh", "-c", "npm test"].';
    }
    if (task.closeoutSchema) {
      return 'A command writes no closing statement: its exit code is its verdict. Leave `closeoutSchema` off a command task.';
    }
    if (task.resumeFrom !== undefined) {
      return `\`resumeFrom: ${task.resumeFrom}\` continues a session, and a command keeps none: file the command again to run it again.`;
    }
    const other = Object.keys(task.config).find(
      (key) => !OWN.includes(key) && task.config?.[key as keyof typeof task.config] !== undefined,
    );
    if (other !== undefined) {
      return `\`${other}\` is an argument of an agent's harness, and the command harness runs a process, not an agent: it reads \`command\`, \`env\` and \`niceness\` alone. Leave \`${other}\` off a command task.`;
    }
    return undefined;
  },
  noChannel:
    'A command reads nothing while it runs: there is no channel into a running process. Stop the task and file another with the command you want run.',
};
