/**
 * `node probe.ts <verb>` — the one door through which a step of this team starts a Claude Code session of its own to measure something,
 * a probe, and the check that none is left running when the step signs off.
 *
 * - `start <label> [--answer "<what to press>"] [--settings <file or json>] -- <prompt>` starts a background session named
 *   `<run>-probe-<label>`, the run read from the branch (`wf/<run>/<step>`), in the machinery's folder `$WF_ROOT/probes` (`WF_ROOT`
 *   `~/.agent-workflows` by default). Its first message opens with `[nemia probe] run <run>:` and says `no action needed`, or, with
 *   `--answer`, what the person must press. Remote Control, which reaches the person's phone, is given only with `--answer`; the step
 *   then stops `blocked` on the `needs` line it prints. `--settings` is passed to the session, so a measurement of rules or hooks edits
 *   no folder's settings.
 * - `list` prints this run's probes and their state; `stop [label]` stops this run's live probes, or the one named.
 * - `check`, for a run's check: refuses while a probe named for `WF_RUN` is live, naming `stop`. No `claude` on the PATH is no probe.
 *
 * Refuses, exit 1 on stderr with what to do next: a branch that is not `wf/<run>/<step>`, a label that is not lower-case letters and
 * digits, a probe folder Claude Code has not trusted (trust is read from its `.claude.json`, never written: a person runs `claude` there
 * once), and a listing `claude agents` cannot give.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** A reason the verb is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** What a probe's label may be: no `-`, so a run's probes are told from those of a run whose id starts with its id. */
const LABEL = /^[a-z0-9]+$/;

/** The command that lists every background session, ended ones included. */
const LISTING = ['agents', '--all', '--json'];

/** The states of a listed session that has ended: a session that failed is over too, and `claude stop` leaves it as it is. */
const ENDED = new Set(['done', 'stopped', 'failed']);

/** How long a call of `claude` may take, in milliseconds. */
const BOUND = 60_000;

/** A row of `claude agents --json`, as far as a probe reads it. */
type Row = { name: string; id: string; state: string; waitingFor?: string };

/** The machinery's folder probes run in: `$WF_ROOT/probes`. */
const probesDir = (): string => path.join(process.env.WF_ROOT || path.join(os.homedir(), '.agent-workflows'), 'probes');

/** Claude Code's own `.claude.json`: in `CLAUDE_CONFIG_DIR` when it is set, else in the home folder. */
const claudeConfigFile = (): string =>
  process.env.CLAUDE_CONFIG_DIR ? path.join(process.env.CLAUDE_CONFIG_DIR, '.claude.json') : path.join(os.homedir(), '.claude.json');

/** Whether Claude Code's `.claude.json` says a person trusted `dir`; false for a file that is not there or does not read so. */
function trusted(dir: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(claudeConfigFile(), 'utf8'));
  } catch {
    return false;
  }
  const projects = (parsed as { projects?: Record<string, { hasTrustDialogAccepted?: unknown } | undefined> } | null)?.projects;
  return typeof projects === 'object' && projects !== null && projects[path.resolve(dir)]?.hasTrustDialogAccepted === true;
}

/** The run this workspace's branch is of, `wf/<run>/<step>`; refuses any other branch. */
function runOfBranch(): string {
  const head = spawnSync('git', ['symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const branch = head.status === 0 ? head.stdout.trim() : '';
  const run = /^wf\/([^/]+)\/[^/]+$/.exec(branch)?.[1];
  if (!run)
    throw new Refusal(
      `the branch here is ${branch ? `\`${branch}\`` : 'none'}, not a run's \`wf/<run>/<step>\`: start a probe from the step's own workspace`,
    );
  return run;
}

/** The name of `run`'s probe `label`. */
const probeName = (run: string, label: string): string => `${run}-probe-${label}`;

/** Whether `name` is the name of one of `run`'s probes. */
const isProbeOf = (run: string, name: string): boolean =>
  name.startsWith(`${run}-probe-`) && LABEL.test(name.slice(`${run}-probe-`.length));

/** Run `claude` with `args`, bounded; its exit, streams, and whether no `claude` was found. */
function claude(args: string[], cwd?: string): { status: number | null; out: string; err: string; missing: boolean } {
  const r = spawnSync('claude', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: BOUND });
  const missing = r.error !== undefined && 'code' in r.error && r.error.code === 'ENOENT';
  return { status: r.status, out: r.stdout ?? '', err: (r.stderr ?? '') || (r.error?.message ?? ''), missing };
}

/** A listed row read as a probe reads it, or undefined for one that does not read so. */
function rowOf(value: unknown): Row | undefined {
  const r = value as Record<string, unknown> | null;
  if (typeof r?.name !== 'string' || typeof r.state !== 'string') return undefined;
  const id = typeof r.id === 'string' ? r.id : typeof r.sessionId === 'string' ? r.sessionId.split('-')[0] : undefined;
  if (!id) return undefined;
  return { name: r.name, id, state: r.state, ...(typeof r.waitingFor === 'string' ? { waitingFor: r.waitingFor } : {}) };
}

/** `run`'s probes as `claude agents` lists them; none when no `claude` is on the PATH; refuses a listing it cannot read. */
function probesOf(run: string): Row[] {
  const listed = claude(LISTING);
  if (listed.missing) return [];
  let parsed: unknown;
  try {
    if (listed.status !== 0) throw new Error(`exit ${listed.status}: ${listed.err.trim()}`);
    parsed = JSON.parse(listed.out);
  } catch (err) {
    throw new Refusal(`cannot tell which probes are live: \`claude ${LISTING.join(' ')}\` gave no list (${(err as Error).message})`);
  }
  const rows = Array.isArray(parsed) ? parsed.map(rowOf) : [];
  return rows.filter((row): row is Row => row !== undefined && isProbeOf(run, row.name));
}

/** The live ones of `rows`. */
const live = (rows: Row[]): Row[] => rows.filter((row) => !ENDED.has(row.state));

/** A row as a line. */
const shown = (row: Row): string => `${row.name} ${row.state}${row.waitingFor ? ` (${row.waitingFor})` : ''} ${row.id}`;

/** The first message of a probe of `run`: whether the person must act, then the prompt. */
const framed = (run: string, prompt: string, answer: string | undefined): string =>
  answer === undefined
    ? `[nemia probe] run ${run}: no action needed. A step of this run started this session to measure something; ` +
      `it reads the result itself and stops the session before it signs off.\n\n${prompt}`
    : `[nemia probe] run ${run}: action needed — ${answer}. The step waits, blocked, until you do.\n\n${prompt}`;

/** The options of `start`: its label, what to press, a settings file, and the prompt after `--`. */
function startArgs(args: string[]): { label: string; answer?: string; settings?: string; prompt: string } {
  const dash = args.indexOf('--');
  const prompt = dash < 0 ? '' : args.slice(dash + 1).join(' ');
  const [label, ...rest] = dash < 0 ? args : args.slice(0, dash);
  const opts: { answer?: string; settings?: string } = {};
  for (let i = 0; i < rest.length; i += 2) {
    const [flag, value] = [rest[i], rest[i + 1]];
    if ((flag !== '--answer' && flag !== '--settings') || !value)
      throw new Refusal(`\`${flag}\` is not an option of start: give --answer "<what to press>" or --settings <file>, each with a value`);
    opts[flag === '--answer' ? 'answer' : 'settings'] = value;
  }
  if (!label || !LABEL.test(label)) throw new Refusal(`the label \`${label ?? ''}\` is not lower-case letters and digits: name the probe so`);
  if (!prompt.trim()) throw new Refusal('no prompt: give it after `--`, as `start <label> -- <prompt>`');
  return { label, prompt, ...opts };
}

/** `start`: the probe started, as asked, and what the step does next. */
function start(args: string[]): string[] {
  const { label, answer, settings, prompt } = startArgs(args);
  const run = runOfBranch();
  const dir = probesDir();
  fs.mkdirSync(dir, { recursive: true });
  if (!trusted(dir))
    throw new Refusal(
      `Claude Code has not trusted ${dir}, the folder probes run in, and a step never writes trust. ` +
        `A person runs, once: cd ${dir} && claude — and accepts its prompt. Until then, stop \`blocked\` with that in \`needs\`.`,
    );
  const name = probeName(run, label);
  const argv = ['--bg', ...(answer === undefined ? [] : ['--remote-control']), '--name', name];
  const started = claude([...argv, ...(settings ? ['--settings', settings] : []), framed(run, prompt, answer)], dir);
  if (started.status !== 0) throw new Refusal(`\`claude --bg\` did not start ${name} (exit ${started.status}): ${started.err.trim()}`);
  const said = started.out.trim() ? [started.out.trim()] : [];
  if (answer === undefined) return [...said, `${name} started, no Remote Control: read it with \`list\`, stop it with \`stop ${label}\``];
  return [
    ...said,
    `${name} started with Remote Control. Stop \`blocked\` now, with this in \`needs\`:`,
    `  Answer the probe session ${name} (claude.ai/code, or \`claude attach\`): ${answer}. Then retry the step.`,
  ];
}

/** `stop [label]`: each live probe of the run stopped, or the one named. */
function stop(args: string[]): string[] {
  const run = runOfBranch();
  const [label] = args;
  const rows = live(probesOf(run)).filter((row) => label === undefined || row.name === probeName(run, label));
  if (!rows.length) return [`no live probe of run ${run}${label === undefined ? '' : ` named ${label}`}`];
  return rows.map((row) => {
    const stopped = claude(['stop', row.id]);
    if (stopped.status !== 0) throw new Refusal(`\`claude stop ${row.id}\` did not stop ${row.name}: ${stopped.err.trim()}`);
    return `stopped ${row.name}`;
  });
}

/** `check`: refuses while a probe of `WF_RUN` is live. */
function check(): string[] {
  const run = process.env.WF_RUN;
  if (!run) throw new Refusal("WF_RUN is not set: probes are checked in a run's check, where it names the run");
  const left = live(probesOf(run));
  if (left.length)
    throw new Refusal(
      [
        `a probe of run ${run} is still live, and a step stops its probes before it signs off:`,
        ...left.map((row) => `  ${shown(row)}`),
        'Stop them with `node workflows/build/probe.ts stop`, then sign off again.',
      ].join('\n'),
    );
  return [`no live probe of run ${run}`];
}

/** The verbs, by name. */
const VERBS: Record<string, (args: string[]) => string[]> = {
  start,
  stop,
  check,
  list: () => {
    const rows = probesOf(runOfBranch());
    return rows.length ? rows.map(shown) : ['no probe of this run'];
  },
};

/** The whole run: exit 0 with what was done on stdout, 1 with the refusal on stderr. */
function main(): number {
  const [verb = '', ...args] = process.argv.slice(2);
  try {
    const act = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
    if (!act) throw new Refusal(`\`${verb}\` is no verb: give start, list, stop or check`);
    for (const line of act(args)) process.stdout.write(`wf probe: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`wf probe: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
