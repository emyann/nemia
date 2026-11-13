/**
 * What the daemon's sweep does with one process of this user, read against one run (agent-orchestrator,
 * src/forget/prune/left-behind.ts, `leftBehindOf`): a backstop behind the runtime, which ends a session's scope with the session. A
 * process that descends from one of the run's sessions — its environment names the run's own files, as every session's does — is the
 * run's, and once the run is finished nothing of it may run on: it is ended. A process of no session of the run's (a person's shell, an
 * editor, another run's) is never ended; where its working folder is in the run's worktree it holds that worktree, which is not freed
 * while it runs, and said. The daemon's own process is neither. A run not finished is none of the sweep's: its sessions may be at work.
 * The laws speak of the verdict, never of how the process is read.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** One process as the sweep read it: whether it is the daemon's own, the run its environment names if any, its working folder. */
export type LeftProcess = { readonly own: boolean; readonly runOf: string | undefined; readonly cwd: string | undefined };

/** One run as the sweep reads it: its id, whether it is finished and at rest, and its worktrees' folder. */
export type SweptRun = { readonly id: string; readonly finished: boolean; readonly worktree: string };

/** What the sweep does with a process: ends it, keeps the run's worktree for it, or nothing. */
export type LeftVerdict = 'end' | 'holds' | 'none';

/** Whether `cwd` is the folder `folder` or inside it: a folder named alike beside it (`<folder>2`) is not. */
const inFolder = (cwd: string | undefined, folder: string): boolean =>
  cwd !== undefined && (cwd === folder || cwd.startsWith(`${folder}/`));

const leftBehindSpec = spec<(p: LeftProcess, run: SweptRun) => LeftVerdict>({
  requires: ({ input: [, run] }) => run.id !== '' && run.worktree !== '' && !run.worktree.endsWith('/'),
  ensures: {
    theDaemonIsNone: {
      description: "The daemon's own process is never ended, and holds nothing",
      condition: ({ input: [p], output }) => (p.own ? output === 'none' : true),
    },
    anUnfinishedRunIsNone: {
      description: 'A run not finished and at rest is none of the sweep: its sessions may be at work',
      condition: ({ input: [, run], output }) => (!run.finished ? output === 'none' : true),
    },
    onlyTheRunsOwnEnd: {
      description: "Only a process the run's sessions started is ever ended: a person's shell or another run's process never is",
      condition: ({ input: [p, run], output }) => (output === 'end' ? p.runOf === run.id : true),
    },
    theRunsOwnEnd: {
      description: "A process a finished run's session started is ended, wherever it runs: nothing a session started outlives its run",
      condition: ({ input: [p, run], output }) => (!p.own && run.finished && p.runOf === run.id ? output === 'end' : true),
    },
    aForeignProcessInTheWorktreeHolds: {
      description: "Another process working in the finished run's worktree holds it: the worktree is not freed while it runs",
      condition: ({ input: [p, run], output }) =>
        !p.own && run.finished && p.runOf !== run.id && inFolder(p.cwd, run.worktree) ? output === 'holds' : true,
    },
    onlyTheWorktreeHolds: {
      description: "A process holds the run's worktree only while its working folder is in it, a folder named alike beside it not",
      condition: ({ input: [p, run], output }) => (output === 'holds' ? inFolder(p.cwd, run.worktree) : true),
    },
  },
});
/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type LeftBehindOf = Implementation<typeof leftBehindSpec>;
