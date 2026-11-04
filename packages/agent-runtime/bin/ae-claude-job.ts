#!/usr/bin/env node
/**
 * A Claude Code job's own process: one session run on the Agent SDK's `query()`, whether or not a daemon holds the attached
 * sessions. The worker (`bin/ae-worker.ts`) spawns this as it spawns any harness — a command, a cwd, an exit code — and this is
 * the harness: it reads the spawn request the runner wrote for it (`HarnessSpec.needsRequest`), runs the session with the very
 * options an attached session is given (`attachedOptions`), and prints each of the SDK's messages as one JSON line on its stdout,
 * the stream every reader of a job reads (`claudeStreamOutput`, `claudeStreamKept`, `claudePartials`) — the same lines
 * `claude -p --output-format stream-json --verbose --include-partial-messages` printed for every run a former runtime stored.
 *
 * So the job keeps everything the layers above it read — its run file and lease, its capture, its live follow, its transcript, its
 * usage, `say`, `stop` and its denials — and gains the one translation of a task into a session this runtime has.
 *
 * Plain, like the worker, but for the one import that is the point of it: the runtime's own Claude translation. In particular:
 *
 * - Its input is the stdin the worker writes: the brief's line first, then each word a person says (`claudeJobSpec.input.line`),
 *   each pushed on the SDK's streaming prompt as a user message of its own. The prompt ends when stdin ends, which the worker does
 *   at the session's `result` line (`closesOn`), and the session ends with it — a job is one prompt.
 * - `permissionPrompts: 'none'` (`sdk.d.ts:2081`) is what `--permission-prompts none` was: nobody is here to ask, so a call that
 *   would prompt is denied at once and the session carries on, and Claude Code prints the `system`/`permission_denied` line the
 *   readers count as a denial. `canUseTool` is never called, so no decision of this process can be left in flight when it dies.
 * - The SDK is given no `spawnClaudeCodeProcess`: unlike a holder, which detaches its children so a let-go leaves a group to kill,
 *   this process must leave Claude Code in its own process group, which is the group the worker kills on a stop.
 * - `AE_CLAUDE_EXECUTABLE` is the Claude Code to run, where the engine names one (`EngineOptions.claudeExecutable`); absent, the
 *   SDK's own.
 * - Where the task asks for a bridge to claude.ai (`claude.remoteControl`), it is opened on the session's `system`/`init` message
 *   (`bridgeDue`), through the one door to the SDK's undeclared control request (`enableBridge`), with `keepSessionOnExit: false`:
 *   the job's claude.ai session ends with it. What it came to — the link and its facts, or why there is none — is written to the
 *   bridge file the runner named (`io.bridgeFile`), and each `bridge_state` the stream says after is written on it too
 *   (`bridgeStateOf`), so the runner's look reads the bridge off the file (`claudeCodeOps`), never off this process's memory. The
 *   request is awaited before the next message is printed: a job's one turn ends after its bridge is up, as measured on Agent SDK
 *   0.3.308 (`docs/harness.md`, *The claude.ai bridge*). No bridge never fails the job: the session runs on, and the file says why.
 *
 * Leaves 0 when the session's last result is no error, and 1 — with the reason on stderr, which the worker tees into the run's log
 * — when it is one, when the messages end with no result at all, when the request cannot be read, and when the options cannot be
 * built (`attachedOptions` refuses a flag given twice and the two prompt files together, in words that say what to do). It leaves
 * only once its stdout is on the worker's pipe: a line printed and dropped would be a session that said something nobody read.
 *
 * argv: <requestFile>  — JSON: { request: SpawnRequest, io: HarnessIO }
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import readline from 'node:readline';
import { query, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { attachedOptions } from '../src/harness/claude/attached-options.ts';
import { bridgeDue, bridgeStateOf, enableBridge, type AttachedBridge } from '../src/harness/claude/attached-bridge.ts';
import { bridgeAsked } from '../src/harness/claude/vocabulary.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';

/** Why the session cannot go on, thrown so that whatever is printed is flushed before the process leaves. */
class Refused extends Error {}

/**
 * The session's input: a user message per line the worker writes, read in order, ending when stdin ends. A line that is no user
 * message of the shape `claudeJobSpec.input.line` writes is passed over rather than taken for one: the worker writes nothing else
 * on it, and a line torn mid-write is no message.
 */
const inputOf = () => {
  const items: string[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const ring = () => {
    wake?.();
    wake = undefined;
  };
  const lines = readline.createInterface({ input: process.stdin });
  lines.on('line', (text) => {
    let said: unknown;
    try {
      said = JSON.parse(text);
    } catch {
      return;
    }
    const content = (said as { type?: unknown; message?: { content?: unknown } })?.message?.content;
    if ((said as { type?: unknown }).type !== 'user' || typeof content !== 'string') return;
    items.push(content);
    ring();
  });
  lines.on('close', () => {
    closed = true;
    ring();
  });
  return {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        for (let content = items.shift(); content !== undefined; content = items.shift()) {
          yield {
            type: 'user' as const,
            uuid: randomUUID(),
            message: { role: 'user' as const, content },
            parent_tool_use_id: null,
            session_id: '',
          };
        }
        if (closed) return;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
};

/** What the runner wrote for this job at its spawn: the request whole, and the files it named for it (`HarnessIO`). */
type Requested = { request: SpawnRequest; io: { bridgeFile?: string } };

/** The spawn request the runner wrote at `at`, whole, and the bridge file it named, where it named one. */
const requestAt = (at: string | undefined): Requested => {
  if (!at)
    throw new Refused('no spawn request file was given. The runner writes one for a spec with `needsRequest` and names it on the argv.');
  try {
    const read = JSON.parse(fs.readFileSync(at, 'utf8')) as { request: SpawnRequest; io?: { bridgeFile?: unknown } };
    const bridgeFile = read.io?.bridgeFile;
    return { request: read.request, io: typeof bridgeFile === 'string' ? { bridgeFile } : {} };
  } catch (e) {
    throw new Refused(`${at} is not a spawn request this runtime reads (${(e as Error).message}).`);
  }
};

/** Writes `bridge` whole on `file`, through a file beside it renamed over it, so a look never reads half of it. */
const writeBridge = (file: string, bridge: AttachedBridge): void => {
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(bridge));
  fs.renameSync(temp, file);
};

/**
 * The job's bridge, as the session's messages bring it: opened on the message `bridgeDue` names, once, and its state kept from each
 * `bridge_state` after. Nothing where the task asked for none, or the runner named no file to write it on.
 */
const bridgeOf = (request: SpawnRequest, file: string | undefined) => {
  if (!bridgeAsked(request) || file === undefined) return async (_q: unknown, _m: unknown): Promise<void> => {};
  let bridge: AttachedBridge | undefined;
  return async (q: unknown, m: unknown): Promise<void> => {
    if (bridge === undefined && bridgeDue(m)) {
      bridge = await enableBridge(q, request.name, { keepSessionOnExit: false });
      writeBridge(file, bridge);
      return;
    }
    const state = bridgeStateOf(m);
    if (bridge?.url !== undefined && state !== undefined) {
      bridge = { ...bridge, state };
      writeBridge(file, bridge);
    }
  };
};

/** Writes `text` and answers once it is on the pipe, so nothing printed is dropped by the exit after it. */
const flushed = (to: NodeJS.WriteStream, text: string): Promise<void> =>
  new Promise((done) => {
    to.write(text, () => done());
  });

/** The session run to its end; answers whether its last result was an error. Throws `Refused` in words for anything else. */
const ran = async ({ request, io }: Requested): Promise<boolean> => {
  const abort = new AbortController();
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => abort.abort());
  const executable = process.env.AE_CLAUDE_EXECUTABLE;
  let given;
  try {
    given = attachedOptions(request);
  } catch (e) {
    throw new Refused((e as Error).message);
  }
  const session = query({
    prompt: inputOf(),
    options: {
      ...given,
      permissionPrompts: 'none',
      abortController: abort,
      ...(executable ? { pathToClaudeCodeExecutable: executable } : {}),
    },
  });
  const bridged = bridgeOf(request, io.bridgeFile);
  let failed: boolean | undefined;
  try {
    for await (const m of session as AsyncIterable<SDKMessage>) {
      await flushed(process.stdout, `${JSON.stringify(m)}\n`);
      await bridged(session, m);
      if (m.type === 'result') failed = m.is_error === true;
    }
  } catch (e) {
    if (failed === undefined) throw new Refused(`the session ended in an error: ${(e as Error).message}`);
  }
  if (failed === undefined) throw new Refused('the session ended with no result line, so nothing says how it went.');
  return failed;
};

try {
  process.exitCode = (await ran(requestAt(process.argv[2]))) ? 1 : 0;
} catch (e) {
  await flushed(process.stderr, `[ae-claude-job] ${e instanceof Refused ? e.message : String(e)}\n`);
  process.exitCode = 1;
}
process.exit(process.exitCode);
