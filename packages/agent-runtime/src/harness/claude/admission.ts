/**
 * A task's admission as Claude Code runs it: a `PreToolUse` hook, matched to the tools admission sees, merged into the session's
 * `--settings`, whose command is the runtime's own adapter (`ae admission -- <command…>`); and the adapter, which turns Claude Code's
 * hook input into the call admission reads and its answer into the hook's decision (`admissionHook`). Loads no engine, so `bin/ae.ts`
 * runs the hook through this file alone and a call pays one small process.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ADMISSION_DECISIONS, type Admission, type AdmissionAnswer, type AdmissionCall } from '../admission.ts';
import type { SpawnRequest } from '../seam.ts';
import { withoutTelemetry } from '../telemetry.ts';
import { settingsObject, type ClaudeFlags } from './vocabulary.ts';

/** The runtime's own CLI, run by the node that runs this runtime: the hook's command, whatever the session's `PATH` holds. */
const AE = [process.execPath, path.join(import.meta.dirname, '..', '..', '..', 'bin', 'ae.ts')];

/** How long admission's command may take, in milliseconds, before the adapter answers `ask` for it. */
export const ADMISSION_BOUND_MS = 20_000;

/** How long Claude Code waits on the hook, in seconds: past the adapter's own bound, so the adapter always answers first. */
const HOOK_SECONDS = 30;

/** A word as a POSIX shell reads it back unchanged: in single quotes, each quote of its own closed, escaped and reopened. */
const quoted = (word: string): string => `'${word.replaceAll("'", `'\\''`)}'`;

/** The hook's command line: the adapter, then admission's command after `--`, every word quoted. */
export const admissionHookCommand = (admission: Admission): string =>
  [...AE, 'admission', '--', ...admission.command].map(quoted).join(' ');

/**
 * A task's Claude Code flags with its admission merged into `settings`: a `PreToolUse` hook matched to admission's tools alone, after
 * any the caller's settings already hold. The flags as given where the task has no admission.
 */
export const admittedFlags = (config: SpawnRequest['config']): ClaudeFlags | undefined => {
  const admission = config?.callAdmission;
  if (admission === undefined) return config?.claude;
  const settings = settingsObject(config?.claude?.settings ?? '{}') ?? {};
  const hooks = (settings.hooks ?? {}) as Record<string, unknown>;
  const before = Array.isArray(hooks.PreToolUse) ? hooks.PreToolUse : [];
  const hook = {
    matcher: admission.tools.join('|'),
    hooks: [{ type: 'command', command: admissionHookCommand(admission), timeout: HOOK_SECONDS }],
  };
  return {
    ...config?.claude,
    settings: JSON.stringify({ ...settings, hooks: { ...hooks, PreToolUse: [...before, hook] } }),
  };
};

/** What a run of admission's command gave: its exit status, what it printed, and whether it ran past its bound or did not start. */
export type AdmissionRun = { status: number | null; stdout: string; failed: boolean };

/** Runs admission's command with the call on its stdin, bounded (`ADMISSION_BOUND_MS`). */
const runAdmission = (command: string[], call: string): AdmissionRun => {
  const [program, ...args] = command;
  if (program === undefined) return { status: null, stdout: '', failed: true };
  const ran = spawnSync(program, args, {
    input: call,
    encoding: 'utf8',
    timeout: ADMISSION_BOUND_MS,
    env: withoutTelemetry(process.env),
  });
  return { status: ran.status, stdout: ran.stdout ?? '', failed: ran.error !== undefined };
};

/** The hook's output for a decision, as Claude Code reads a `PreToolUse` hook's. */
const hookOutput = (answer: AdmissionAnswer): string =>
  JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: answer.decision, permissionDecisionReason: answer.message },
  });

/**
 * Admission's printed answer, or undefined where it printed what is no answer; `retired` where its sentence came under `reason`,
 * the spelling `message` took the place of, which a command written before the rename still prints.
 */
const answerOf = (printed: string): { answer: AdmissionAnswer; retired: boolean } | undefined => {
  try {
    const read = JSON.parse(printed) as (Partial<AdmissionAnswer> & { reason?: unknown }) | null;
    if (read === null || !ADMISSION_DECISIONS.includes(read.decision as never)) return undefined;
    const decision = read.decision as AdmissionAnswer['decision'];
    if (typeof read.message === 'string') return { answer: { decision, message: read.message }, retired: false };
    return typeof read.reason === 'string' ? { answer: { decision, message: read.reason }, retired: true } : undefined;
  } catch {
    return undefined;
  }
};

/** Asks the person, saying why admission could not answer. */
const askFor = (why: string): string => hookOutput({ decision: 'ask', message: `admission could not decide: ${why}` });

/**
 * The hook's output for Claude Code's hook input: the call handed to admission's `command` as an `AdmissionCall`, and its answer as
 * the hook's decision; nothing where admission printed nothing, for no opinion. Asks the person where the input is no call, and where
 * admission did not start, ran past its bound, exited but 0, or printed what is no answer. An answer that says its sentence as
 * `reason` is read as its `message`, and `warn` is handed the fix.
 */
export const admitCall = (
  hookInput: string,
  command: string[],
  run: typeof runAdmission = runAdmission,
  warn: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): string => {
  let given: { tool_name?: unknown; tool_input?: unknown; cwd?: unknown };
  try {
    given = JSON.parse(hookInput) as typeof given;
  } catch {
    return askFor('the call was not JSON');
  }
  if (typeof given?.tool_name !== 'string') return askFor('the call names no tool');
  const input = typeof given.tool_input === 'object' && given.tool_input !== null ? (given.tool_input as Record<string, unknown>) : {};
  const call: AdmissionCall = { tool: given.tool_name, input, cwd: typeof given.cwd === 'string' ? given.cwd : '' };
  const ran = run(command, JSON.stringify(call));
  if (ran.failed) return askFor(`${command[0]} did not start or ran past ${ADMISSION_BOUND_MS / 1000}s`);
  if (ran.status !== 0) return askFor(`${command[0]} exited ${ran.status ?? 'on a signal'}`);
  if (ran.stdout.trim() === '') return '';
  const read = answerOf(ran.stdout.trim());
  if (read === undefined) return askFor(`${command[0]} printed no answer`);
  if (read.retired)
    warn(`${command[0]} printed its answer's sentence as \`reason\`, read as its \`message\`: print { "decision", "message" } instead.`);
  return hookOutput(read.answer);
};

/**
 * `ae admission -- <command…>`: reads the hook's input on stdin, hands the call to admission's command (`admitCall`), and prints the
 * hook's output. Refused, exit 2, where no command follows `--`.
 */
export function admissionHook(argv: string[]): void {
  const command = argv.indexOf('--') === -1 ? [] : argv.slice(argv.indexOf('--') + 1);
  if (command.length === 0)
    throw Object.assign(new Error('ae admission needs its command after --: ae admission -- my-admit --strict'), { exitCode: 2 });
  const out = admitCall(fs.readFileSync(0, 'utf8'), command);
  if (out !== '') process.stdout.write(`${out}\n`);
}
