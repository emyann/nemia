/**
 * What `landing.ts` and `pull-request.ts` both do to run a command and wait on GitHub, said once: the refusal they are both refused by,
 * a bounded call of `git` or `gh`, the wait's bounds on CI and its sleep, and the two reads of `gh` they make the same way. Each script
 * keeps beside its own code what it does differently on purpose (its `gh`, how it parses a read, its `origin`, its pull requests). It
 * imports `node:child_process` alone: the run freezes the carried folder whole (`$WF_CARRIED_FILES`), so it is beside them wherever
 * they run.
 */
import { spawnSync } from 'node:child_process';

/** A reason the verb is refused: said on stderr, exit 1, under the script's own tag. */
export class Refusal extends Error {}

/**
 * What a script exits with for a refusal only a person answers — no change to the branch does: the code sdlc's `checkFailurePolicy:`
 * names on `implement` (`FailStep`, `onExitCodes: In [78]`), so the run files no try of the step on it and waits on the person. 78,
 * sysexits' EX_CONFIG, lies outside what a test runner, a compiler or a linter usually exits with, so a check command of the
 * repository's chained beside the scripts rarely says it; one that did would be read as a person's refusal.
 */
export const PERSONS_EXIT = 78;

/** How long a call of `git` or `gh` may take, in milliseconds. */
export const BOUND = 120_000;

/** The most bytes a command may print before it is cut off: a test job's whole log runs past `spawnSync`'s default of 1 MiB. */
const OUTPUT_BYTES = 64 * 1024 * 1024;

/**
 * How long the CI context has to be reported at all, in seconds: on the pull request's head, a queue longer than this is a refusal a
 * `--recheck` answers; at the merge commit, a context never reported is most often a CI that does not run on pushes to the base.
 * `WF_CI_START_SECONDS` lowers it for a test, on its own, so the two stages of the wait are told apart by a fixture.
 */
export const START_SECONDS = 1800;

/**
 * How long the whole wait on CI may take, in seconds, the start included (and, on the head, the one re-run of a red, sharing this one
 * clock); `WF_CI_WAIT_SECONDS` lowers it for a test. It must stay well under the deadline of the check that runs the wait — the round
 * check's, which the clauses before it share, or the landing check's — or the engine would kill the wait and the person would get no
 * refusal in words.
 */
export const WHOLE_SECONDS = 2400;

/** How long the wait sleeps between two reads of the checks, in seconds; `WF_CI_POLL_SECONDS` lowers it for a test. */
export const POLL_SECONDS = 15;

/** What a command printed: its exit, its streams, and whether there was no such command on the PATH. */
export type Ran = { status: number | null; out: string; err: string; missing: boolean };

/** Run `cmd` with `args`, bounded in time and in what it prints, reading nothing from stdin. */
export function run(cmd: string, args: string[]): Ran {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: BOUND, maxBuffer: OUTPUT_BYTES });
  const missing = r.error !== undefined && 'code' in r.error && r.error.code === 'ENOENT';
  return { status: r.status, out: r.stdout ?? '', err: (r.stderr ?? '').trim() || (r.error?.message ?? ''), missing };
}

/** What git printed for `args`, trimmed; refuses, saying what could not be told, when git fails. */
export function git(what: string, ...args: string[]): string {
  const ran = run('git', args);
  if (ran.status !== 0) throw new Refusal(`cannot tell ${what}, since \`git ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** The number of seconds `name` holds, or `fallback` where it holds no number. */
export function seconds(name: string, fallback: number): number {
  const said = Number(process.env[name]);
  return Number.isFinite(said) && said >= 0 ? said : fallback;
}

/** Sleep `secs` seconds, the thread held, so the poll is one process and no timer outlives it. */
export function sleep(secs: number): void {
  if (secs <= 0) return;
  const held = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(held, 0, 0, secs * 1000);
}

/** The refusal where there is no `gh`, `act` the script's act that GitHub's CLI does: what a person types to have it. */
export const noGh = (act: string): string =>
  `no \`gh\` on the PATH, and ${act} is GitHub's CLI's. Install it (https://cli.github.com) and run \`gh auth login\``;

/**
 * `gh auth status` passing; refuses with the one command a person types when it does not, as `refused`: `pull-request.ts` passes its
 * person's refusal, which exits `PERSONS_EXIT` so the run tries the step no more on it, and `landing.ts`, which has no tries of its
 * own, the plain one.
 */
export function authed(act: string, refused: typeof Refusal = Refusal): void {
  const status = run('gh', ['auth', 'status']);
  if (status.missing) throw new refused(noGh(act));
  if (status.status !== 0) throw new refused(`\`gh\` is not authenticated here: run \`gh auth login\`. It said: ${status.err}`);
}

/**
 * The remote's default branch, which a run's pull request is based on and which the checkout lands on, read through `ask`, the script's
 * own `gh`; `of` names what it is the base of, for the refusal where GitHub names none.
 */
export function base(of: string, ask: (...args: string[]) => string): string {
  const said = ask('repo', 'view', '--json', 'defaultBranchRef');
  let name: string | undefined;
  try {
    name = (JSON.parse(said) as { defaultBranchRef?: { name?: string } }).defaultBranchRef?.name;
  } catch {
    name = undefined;
  }
  if (!name) throw new Refusal(`\`gh repo view --json defaultBranchRef\` named no default branch: the base of ${of} is unknown`);
  return name;
}
