/**
 * One attached Claude Code session, run by the Agent SDK's `query()` in this process: its prompt a stream the brief and a person's words
 * are pushed on, its Claude Code spawned in a process group of its own, every message a reader reads appended to its capture as it
 * comes, and its run file rewritten as its facts change (`attached-file.ts`). A new call waits at its `PreToolUse` hook while this
 * process holds back the session's calls (`Held`), and a call that belongs to a call already in flight — one of the session's own
 * calls in flight, or a sub-agent's, which the SDK marks with `agent_id` — is never held, or the call it belongs to could never end;
 * a call that would ask a person is answered here: where the session's task says a person can be asked (`config.mayAsk`), a question
 * is held open while it waits on one and let through with their answers, and a call Claude Code would prompt for is held the same way
 * as a permission (`permission.ts`) and run or refused as they answer; denied otherwise, as no person is there.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { query, type CanUseTool, type HookCallbackMatcher, type HookEvent, type SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import { attachedOptions } from './session-options.ts';
import { alive } from '../../process/alive.ts';
import {
  appendAsk,
  childFacts,
  cutAsks,
  filesOf,
  readAnswers,
  writeRun,
  type AskLine,
  type AttachedRun,
  type AttachedState,
} from './attached-file.ts';
import { bridgeDue, bridgeStateOf, enableBridge } from './session-bridge.ts';
import { bridgeAsked } from './vocabulary.ts';
import { callStarted, firstCall, HOOK_HOLD_S, inside, type CallsInFlight } from './job-hold.ts';
import { claudeStreamKept, initLineKept } from '../detached/output.ts';
import type { InitRead } from '../../../contracts/capture.contract.ts';
import { ASK_CUT, permissionAnswered, permissionAskOf } from './permission.ts';
import type { SpawnRequest } from '../seam.ts';
import type { AskOption, AskQuestion } from '../../core/index.ts';
import { own } from '../../core/own.ts';
import { cutWords } from '../../core/restart.ts';
import { cgroupMemoryOf } from '../cgroup.ts';
import { scopeFor, type ScopeAt } from '../scope.ts';

/** What a verb refuses, thrown where it is read: nothing the harness can do will take it, and asking again will not change that. */
export class Refusal extends Error {}

/** What a session's new calls ask before they start: whether this process holds back a new call of `live` now. */
export type Held = (live: Live) => boolean;

/** A user message on the session's input, as stream-json takes it, under a `uuid` of its own that the result answering it names. */
type UserLine = {
  type: 'user';
  uuid: ReturnType<typeof randomUUID>;
  message: { role: 'user'; content: string };
  parent_tool_use_id: null;
  session_id: string;
};

/** The session's input: lines pushed on it are read in order, and it ends once closed. */
const inputOf = () => {
  const items: UserLine[] = [];
  let wake: (() => void) | undefined;
  let closed = false;
  const ring = () => {
    wake?.();
    wake = undefined;
  };
  return {
    push: (content: string): UserLine['uuid'] => {
      const uuid = randomUUID();
      items.push({ type: 'user', uuid, message: { role: 'user', content }, parent_tool_use_id: null, session_id: '' });
      ring();
      return uuid;
    },
    close: () => {
      closed = true;
      ring();
    },
    get closed() {
      return closed;
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<UserLine> {
      for (;;) {
        for (let item = items.shift(); item !== undefined; item = items.shift()) yield item;
        if (closed) return;
        await new Promise<void>((r) => (wake = r));
      }
    },
  };
};

/**
 * A session at work in this process, as its holder keeps it: what it runs, its calls in flight by id, and how it ends. `open` says the
 * session outlives its turns (a long-lived request): its input stays open and a result that leaves `unanswered` empty writes `idle`.
 * `unanswered` is the words pushed on its input that no result has named yet. `q` is the SDK's query object, kept so the holder can end
 * a turn through it (`interrupt`). `pushed` is given every message the session gives, in order, for whoever follows it live
 * (`attached-follow.ts`).
 */
export type Live = {
  run: AttachedRun;
  abort: AbortController;
  input: ReturnType<typeof inputOf>;
  calls: CallsInFlight;
  letGo: boolean;
  waiting: number;
  open: boolean;
  unanswered: Set<string>;
  /** The calls of this session's that are waiting on a person now, by the call's id: what keeps one ask written down once. */
  asking: Set<string>;
  q?: { interrupt?: () => Promise<void> };
  /** Since when a new call of the main thread is held at its hook (ISO), while one is: the run file's `hold`. */
  holding?: string;
  /** The main-thread call that ended last, kept by its `PostToolUse` or `PostToolUseFailure` hook: what a hold says it came after. */
  after?: { tool: string };
  done: Promise<void>;
  pushed?: (m: SDKMessage) => void;
  /** What the `init` lines this process captured say to a reader of its capture (`initLineKept`): none before the first. */
  initRead?: InitRead;
  /** Run under a memory limit, in a scope of its own: each rewrite reads what Claude Code's cgroup says of its memory. */
  limited?: true;
};

/**
 * Ends the turn of the session `live` through the SDK's control request, which only a session on streaming input takes: it leaves the
 * session answering under the same id, its turn ending with a result of its own. Answers whether the request was sent at all.
 */
export const interruptTurn = async (live: Live | undefined): Promise<boolean> => {
  const ask = live?.q?.interrupt;
  if (ask === undefined || live === undefined || live.letGo) return false;
  await ask.call(live.q);
  return true;
};

/** How often a call held at its hook reads whether it is still held, in milliseconds, where its session is given no other. */
export const HELD_POLL_MS = 250;

/** How often a wait for a process to be gone reads whether it is, in milliseconds, where it is given no other. */
export const GONE_POLL_MS = 50;

/**
 * A session's hold at its `PreToolUse` hook, as a held session and a held job both keep one: whether a new call is held now
 * (`held`), whether the session is being ended (`over`, and `ends`, a signal that says so beside the call's own), what a call that
 * begins and ends its wait is told (`waits`, `waited`, by when it began), what each read of a held call does (`polled`), how often it
 * reads (`pollMs`), and the session's calls in flight (`calls`).
 */
export type HookHold = {
  readonly held: () => boolean;
  readonly over: () => boolean;
  readonly ends?: AbortSignal;
  readonly waits: (since: string) => void;
  readonly waited: (since: string) => void;
  readonly polled?: () => void;
  readonly pollMs: number;
  readonly calls: CallsInFlight;
};

/**
 * The call a `PreToolUse` hook was given (`input`, `id`, its `signal`) through `hold`: a call of the main thread waits while it is held,
 * read every `pollMs`, until it is not, its signal aborts, or the session is being ended. A call that belongs to a call in flight — a
 * sub-agent's, which the SDK marks with `agent_id` (`inside`) — is never held, or the call it belongs to could never end.
 *
 * Answers what the hook answers a main-thread call that comes, or waited, as its session is ended: nothing, once its signal or `ends`
 * says it is over — the end interrupts the turn with this call unanswered, as Claude Code leaves it; let through, the call would run
 * while the session is being ended. Otherwise the call is written in flight (`callStarted`) and `undefined` answered: the hook's own.
 */
export const heldAtHook = async (
  hold: HookHold,
  input: unknown,
  id: string | undefined,
  signal: AbortSignal,
): Promise<object | undefined> => {
  if (!inside(input)) {
    if (hold.held()) {
      const since = new Date().toISOString();
      hold.waits(since);
      try {
        while (hold.held() && !hold.over() && !signal.aborted) {
          hold.polled?.();
          await new Promise((r) => setTimeout(r, hold.pollMs));
        }
      } finally {
        hold.waited(since);
      }
    }
    if (hold.over()) return await cutWhileHeld(signal, hold.ends);
  }
  callStarted(hold.calls, id, input);
  return undefined;
};

/** Nothing, once the call's `signal` or the session's end (`ends`) says it is over. */
const cutWhileHeld = (signal: AbortSignal, ends: AbortSignal | undefined): Promise<object> =>
  new Promise((resolve) => {
    const over = () => resolve({});
    if (signal.aborted || ends?.aborted) return over();
    signal.addEventListener('abort', over, { once: true });
    ends?.addEventListener('abort', over, { once: true });
  });

/** The tool a session calls to ask a person a question, as Claude Code names it. */
export const ASK_TOOL = 'AskUserQuestion';

/** How often a held ask reads whether the person's answer has been written, in milliseconds. */
const ASK_EVERY_MS = 250;

/** What a call that would ask a person is told where no answer reached it, declared beside the permission's own words. */
export { ASK_CUT };

/** What the hook says of a call it let through: the person answered it, and their answer is in the call's own input. */
export const ASK_ANSWERED = 'The person answered this question where it was shown, and their answer is in the call.';

/** One choice of a question, as the call's input gave it: nothing where it names no label. */
const optionOf = (raw: unknown): AskOption[] => {
  const o = (raw ?? {}) as { label?: unknown; description?: unknown; preview?: unknown };
  if (typeof o.label !== 'string' || o.label === '') return [];
  return [
    {
      label: o.label,
      description: typeof o.description === 'string' ? o.description : '',
      ...(typeof o.preview === 'string' ? { preview: o.preview } : {}),
    },
  ];
};

/**
 * The questions of an `AskUserQuestion` call's input, as the harness gave them: none where the input holds no question with a text and
 * a choice, so a call this runtime cannot draw is never written down as an ask a person could answer.
 */
const questionsOf = (input: unknown): AskQuestion[] => {
  const asked = (input as { questions?: unknown })?.questions;
  if (!Array.isArray(asked)) return [];
  return asked.flatMap((raw) => {
    const q = (raw ?? {}) as { question?: unknown; header?: unknown; options?: unknown; multiSelect?: unknown };
    const options = Array.isArray(q.options) ? q.options.flatMap(optionOf) : [];
    if (typeof q.question !== 'string' || q.question === '' || options.length === 0) return [];
    return [
      {
        question: q.question,
        header: typeof q.header === 'string' ? q.header : '',
        options,
        multiSelect: q.multiSelect === true,
      } satisfies AskQuestion,
    ];
  });
};

/**
 * The person's answers to the call that `line` opens an ask for, waited for: the ask written down once (`appendAsk`), then the
 * session's answers file read every `ASK_EVERY_MS` until a line names the call, which is written down as closed and answered; nothing
 * where the call's signal aborted, the holder let the session go, or the turn ended first, which leaves the ask open — and the layer
 * above then owes the answer as words. A question and a permission share it: they differ only in the line they write.
 *
 * A turn's end is read off `live.asking`, which `took` clears as it cuts every open ask of the session: from then on `answerOn`
 * refuses an answer for this call, so a wait that read on would read the answers file for the rest of the holder's life. The SDK
 * promises nothing of the call's signal on an interrupt — it documents it only as signalled "if the operation should be aborted" —
 * and the call is told what every cut call is told (`ASK_CUT`), which names the turn's end among its causes.
 */
const heldFor = async (root: string, live: Live, line: AskLine, signal: AbortSignal): Promise<Record<string, string> | undefined> => {
  const { id } = line;
  if (!live.asking.has(id)) {
    live.asking.add(id);
    appendAsk(root, live.run.name, line);
  }
  for (;;) {
    const given = readAnswers(root, live.run.name).find((a) => a.id === id);
    if (given !== undefined) {
      const at = new Date().toISOString();
      appendAsk(root, live.run.name, { id, at, closed: at, how: 'taken' });
      live.asking.delete(id);
      return given.answers;
    }
    if (signal.aborted || live.letGo || !live.asking.has(id)) return undefined;
    await new Promise((r) => setTimeout(r, ASK_EVERY_MS));
  }
};

/**
 * The person's answers to the `AskUserQuestion` call `id`, held for them (`heldFor`), with the questions its input asked; nothing where
 * the input holds no question this runtime can draw, or no answer came.
 */
const askedOf = async (
  root: string,
  live: Live,
  id: string,
  input: unknown,
  signal: AbortSignal,
): Promise<{ questions: AskQuestion[]; answers: Record<string, string> } | undefined> => {
  const questions = questionsOf(input);
  if (questions.length === 0) return undefined;
  const answers = await heldFor(root, live, { id, at: new Date().toISOString(), questions }, signal);
  return answers === undefined ? undefined : { questions, answers };
};

/**
 * What a `PreToolUse` hook answers a question's call with: let through (`allow`) with the person's answers in its input where they
 * answered, so the call's own result carries their answer to the session; denied, naming what happens instead (`ASK_CUT`), where none
 * came — the holder let the session go, or the turn was ended, and the answer is owed to the session as words.
 */
export const askHookOutput = (given: { questions: AskQuestion[]; answers: Record<string, string> } | undefined) => ({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse' as const,
    ...(given === undefined
      ? { permissionDecision: 'deny' as const, permissionDecisionReason: ASK_CUT }
      : {
          permissionDecision: 'allow' as const,
          permissionDecisionReason: ASK_ANSWERED,
          updatedInput: { questions: given.questions, answers: given.answers },
        }),
  },
});

/** What a denied call is told: no person is there to ask, and what the fence allows is all it gets. */
export const DENIED_HERE =
  'No person is here to approve this call, so it is denied. Do what you can with the tools you are allowed, and say in your answer what you were denied.';

/**
 * The session's run file rewritten with `patch`, its earliest call in flight as `calling`, how many wait at their hook as `heldBack`,
 * and since when one is held there, after which call, as `hold`; nothing once the session is let go, its file its holder's last word
 * (`parked`).
 */
const rewrite = (root: string, live: Live, patch: Partial<AttachedRun> = {}): void => {
  if (live.letGo) return;
  const first = firstCall(live.calls);
  const { calling: _, heldBack: __, hold: ___, ...rest } = live.run;
  const hold = live.waiting && live.holding ? { since: live.holding, ...(live.after ? { after: live.after } : {}) } : undefined;
  const memory = live.limited && live.run.childPid !== undefined ? cgroupMemoryOf(live.run.childPid) : undefined;
  live.run = {
    ...rest,
    ...(memory ? { memory } : {}),
    ...patch,
    ...(first ? { calling: first } : {}),
    ...(live.waiting ? { heldBack: live.waiting } : {}),
    ...(hold ? { hold } : {}),
  };
  writeRun(root, live.run);
};

/**
 * The turn of `live` cut by the sessions' drain in its call to `tool`: the cut kept on its run file, then the SDK's interrupt sent
 * (`interruptTurn`), which ends the turn with a result of its own and leaves the session answering under its id, its input open
 * for the words it is told once the drain is lifted (`toldCut`). Nothing where the session is let go.
 */
export const cutTurn = async (root: string, live: Live, tool: string): Promise<boolean> => {
  if (live.letGo) return false;
  rewrite(root, live, { cut: { tool, since: new Date().toISOString() } });
  return interruptTurn(live);
};

/**
 * The session `live`, cut by the sessions' drain, told so once the drain is lifted: `cutWords` of the call it cut pushed on its input
 * as words it must answer, a turn of their own, and the cut cleared. Nothing where it stands uncut or is let go; a session whose
 * input has closed has the cut cleared alone, as there is no one to tell.
 */
export const toldCut = (root: string, live: Live): void => {
  const cut = live.run.cut;
  if (cut === undefined || live.letGo) return;
  const { cut: _, ...rest } = live.run;
  live.run = rest;
  if (live.input.closed) return rewrite(root, live);
  live.unanswered.add(live.input.push(cutWords(cut.tool)));
  rewrite(root, live, { state: 'working' });
};

/** The hooks that keep the call in flight, a new one held while `held` says so, read every `pollMs` (`heldAtHook`). */
const hooksOf = (
  root: string,
  live: Live,
  held: Held,
  mayAsk: boolean,
  pollMs: number,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> => {
  const hold: HookHold = {
    held: () => held(live),
    over: () => live.letGo,
    ends: live.abort.signal,
    waits: (since) => {
      live.waiting++;
      live.holding ??= since;
      rewrite(root, live);
    },
    waited: () => {
      live.waiting--;
      if (live.waiting === 0) delete live.holding;
    },
    pollMs,
    calls: live.calls,
  };
  const ended = async (input: unknown, id: string | undefined) => {
    const call = id === undefined ? undefined : live.calls.get(id);
    if (call && !inside(input)) live.after = { tool: call.tool };
    if (id && live.calls.delete(id)) rewrite(root, live);
    return {};
  };
  return {
    PreToolUse: [
      {
        timeout: HOOK_HOLD_S,
        hooks: [
          async (input, id, { signal }) => {
            const cut = await heldAtHook(hold, input, id, signal);
            if (cut) return cut;
            rewrite(root, live);
            if ((input as { tool_name?: unknown }).tool_name !== ASK_TOOL || !mayAsk || id === undefined) return {};
            return askHookOutput(await askedOf(root, live, id, (input as { tool_input?: unknown }).tool_input, signal));
          },
        ],
      },
    ],
    PostToolUse: [{ hooks: [ended] }],
    PostToolUseFailure: [{ hooks: [ended] }],
  };
};

/**
 * Appends `line` to the session's capture, as a reader of a job's stream reads it: an `init` line only where it changes what the
 * process's earlier ones said (`initLineKept`, folding `live.initRead`), every other line as `claudeStreamKept` keeps it.
 */
const capture = (root: string, live: Live, line: object): void => {
  const text = JSON.stringify(line);
  const init = initLineKept(text, live.initRead);
  if (init) live.initRead = init.read;
  const kept = init ? init.kept : claudeStreamKept(text);
  if (kept) fs.appendFileSync(filesOf(root, live.run.name).out, `${kept}\n`);
};

/**
 * A call that would ask a person, answered.
 *
 * Where the session's task says a person can be asked through it (`config.mayAsk`), an `AskUserQuestion` call is held open while the
 * question waits on one and let through with their answers in its input, as the SDK's own page documents the flow: the call's result
 * then carries their answer to the session as if it had asked a person at a terminal. Any other call reaches here only where Claude
 * Code would prompt for it, and it is held the same way, as a permission (`permissionAskOf`): one question, its choices allow once,
 * always allow and deny, answered by the person's choice or their own words (`permissionAnswered`), and cut as a question is. In a
 * session whose task says no person can be asked, every call here is denied: no person is there. A denial is written to the capture
 * as it happens.
 *
 * A question is held at the session's `PreToolUse` hook too (`hooksOf`), which runs before the rest of the flow: whichever of the two
 * the installed CLI consults, the ask is written down once (`heldFor`) and answered the same way. A permission is not: the hook runs
 * before Claude Code checks its rules, so it cannot know a call will prompt, and held there every call would wait on a person.
 */
const decidedHere =
  (root: string, live: Live, mayAsk: boolean): CanUseTool =>
  async (tool, input, { toolUseID, signal, ...offer }) => {
    const denied = (message: string) => {
      capture(root, live, { type: 'system', subtype: 'permission_denied', tool_name: tool, tool_use_id: toolUseID });
      return { behavior: 'deny' as const, message };
    };
    if (mayAsk && tool === ASK_TOOL) {
      const given = await askedOf(root, live, toolUseID, input, signal);
      if (given !== undefined) return { behavior: 'allow', updatedInput: { questions: given.questions, answers: given.answers } };
      return denied(ASK_CUT);
    }
    if (!mayAsk) return denied(DENIED_HERE);
    const ask = permissionAskOf(toolUseID, new Date().toISOString(), tool, input, offer);
    const question = ask.questions[0]?.question ?? tool;
    const answers = await heldFor(root, live, ask, signal);
    const answer = permissionAnswered(
      { input, always: ask.permission.always, suggestions: offer.suggestions ?? [] },
      answers === undefined ? undefined : (own(answers, question) ?? ''),
    );
    return answer.behavior === 'deny' ? denied(answer.message) : answer;
  };

/** The ids of the calls a message says are over: a tool's result, or a denial. */
const callsEndedBy = (m: SDKMessage): string[] => {
  const line = m as { type: string; subtype?: string; tool_use_id?: string; message?: { content?: unknown } };
  if (line.type === 'system' && line.subtype === 'permission_denied') return line.tool_use_id ? [line.tool_use_id] : [];
  if (line.type !== 'user' || !Array.isArray(line.message?.content)) return [];
  return (line.message.content as { type?: string; tool_use_id?: string }[]).flatMap((b) =>
    b.type === 'tool_result' && b.tool_use_id ? [b.tool_use_id] : [],
  );
};

/**
 * Takes off `live.unanswered` the words the result `m` says it consumed: `user_message_uuids`, which lists the message the turn took and
 * every one folded into it as it ran; the single `user_message_uuid` where a producer lists only that; and all of them where it names
 * none, so a producer that says nothing leaves no session answering for words no result will ever name.
 */
const answered = (live: Live, m: SDKMessage): void => {
  const said = m as { user_message_uuids?: unknown; user_message_uuid?: unknown };
  const named = Array.isArray(said.user_message_uuids)
    ? said.user_message_uuids
    : typeof said.user_message_uuid === 'string'
      ? [said.user_message_uuid]
      : undefined;
  if (named === undefined) {
    live.unanswered.clear();
    return;
  }
  for (const id of named) if (typeof id === 'string') live.unanswered.delete(id);
};

/**
 * One message of the session, taken: captured, its session id and its end written, the calls it ends cleared.
 *
 * A turn's end is not a session's end for a long-lived request (`live.open`): the calls clear, the run file is written `idle` with the
 * session id, and the input stays open so the next words said are heard in the same session. An `is_error` result — an interrupted
 * turn's `error_during_execution` among them — ends the turn and never fails the session.
 *
 * A turn the sessions' drain cut (`cutTurn`) ends neither: its session is written `working`, its input open, and waits for the drain's
 * lift, when it is told the cut (`toldCut`).
 *
 * It is `idle` only once every word pushed on its input has been answered (`answered`): words pushed while a turn runs are sometimes
 * worked as a turn of their own and sometimes folded into the one running, so a result is read for the messages it names, never counted.
 *
 * `live.pushed` is called first, with every message and before the capture's guard, so whoever follows the session live is given its
 * `stream_event` lines too — the pieces of the text it is writing — which the capture goes on dropping.
 */
const took = (root: string, live: Live, m: SDKMessage): void => {
  live.pushed?.(m);
  if (m.type !== 'user' && m.type !== 'stream_event') capture(root, live, m);
  const over = callsEndedBy(m).filter((id) => live.calls.delete(id));
  const bridged = bridgeStateOf(m);
  if (m.type === 'system' && m.subtype === 'init' && m.session_id !== live.run.sessionId) rewrite(root, live, { sessionId: m.session_id });
  else if (bridged !== undefined) rewrite(root, live, { bridge: { ...live.run.bridge, state: bridged } });
  else if (m.type === 'result') turnEnded(root, live, m);
  else if (over.length) rewrite(root, live);
};

/** The turn of `live` ended by its result `m`: its calls and asks cleared, and the session written as `took` says. */
const turnEnded = (root: string, live: Live, m: Extract<SDKMessage, { type: 'result' }>): void => {
  live.calls.clear();
  live.asking.clear();
  cutAsks(root, live.run.name);
  answered(live, m);
  if (live.run.cut) return rewrite(root, live, { state: 'working', sessionId: m.session_id });
  if (live.open) return rewrite(root, live, { state: live.unanswered.size ? 'working' : 'idle', sessionId: m.session_id });
  live.input.close();
  rewrite(root, live, { state: m.is_error ? 'failed' : 'completed', sessionId: m.session_id });
};

/**
 * Hands the session the words said to it since it last heard (its say file, past `heard`), each a user message on its input, and
 * writes how far it heard. Nothing once its input is closed or it is let go: the next holder hears them.
 *
 * Words pushed on an open session's input begin a turn, so its run file is written `working` with them: a session that heard and stayed
 * `idle` would be read as waiting on a person while it answers, and no turn of it could be ended.
 */
export const hear = (root: string, live: Live): void => {
  if (live.input.closed || live.letGo) return;
  let said: Buffer;
  try {
    said = fs.readFileSync(filesOf(root, live.run.name).say);
  } catch {
    return;
  }
  const from = live.run.heard ?? 0;
  const end = said.lastIndexOf(10) + 1;
  if (end <= from) return;
  for (const line of said.subarray(from, end).toString('utf8').split('\n').filter(Boolean))
    live.unanswered.add(live.input.push((JSON.parse(line) as { text: string }).text));
  rewrite(root, live, { heard: end, ...(live.open ? { state: 'working' as const } : {}) });
};

/** Waits until the process `pid` is gone, read every `everyMs`. */
export const gone = async (pid: number | undefined, everyMs: number = GONE_POLL_MS): Promise<void> => {
  for (;;) {
    if (pid === undefined || !alive(pid)) return;
    await new Promise((r) => setTimeout(r, everyMs));
  }
};

/** Kills the process group `pid` leads, and whatever is left of it: nothing when it is gone. */
export const killGroup = (pid: number | undefined): void => {
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    return;
  }
};

/**
 * Starts the session `run` and answers it at once: `r` its spawn, `first` the first words on its input, `resume` the Claude Code session
 * it continues. `executable` is the Claude Code it runs, the SDK's own when absent, `pushed` is given every message it gives, and a call
 * held at its hook reads `held` every `holdPollMs`, `HELD_POLL_MS` where none is given. It ends `completed` or `failed` by its result,
 * `canceled` when aborted, `failed` when its messages end with none; a session let go (`letGo`) is left as its holder wrote it.
 *
 * The session's options are built before its run file is written: `attachedOptions` refuses a task whose prompt file cannot be read,
 * whose `config.claude` flag is given two values or whose checkout's `.mcp.json` is not JSON, and a spawn refused that way must leave
 * nothing behind — a run file saying `state: 'working'` with this holder's pid would be read by every later pass as a held, open
 * sighting of a session `query()` never started, which `releaseFinished` never takes because it never finishes.
 */
export const startSession = (
  root: string,
  r: SpawnRequest,
  run: AttachedRun,
  first: string,
  options: {
    held: Held;
    holdPollMs?: number;
    executable?: string;
    resume?: string;
    pushed?: (m: SDKMessage) => void;
    scope?: ScopeAt;
  },
): Live => {
  const abort = new AbortController();
  const open = r.restartPolicy === 'Always';
  const mayAsk = r.config?.mayAsk === true;
  const live: Live = {
    run,
    abort,
    input: inputOf(),
    calls: new Map(),
    letGo: false,
    waiting: 0,
    open,
    unanswered: new Set(),
    asking: new Set(),
    done: Promise.resolve(),
    ...(options.pushed ? { pushed: options.pushed } : {}),
  };
  const given = attachedOptions(r);
  const scope = scopeFor(r, options.scope ?? {});
  if (scope !== undefined && 'refused' in scope) throw new Refusal(scope.refused);
  if (scope) live.limited = true;
  writeRun(root, run);
  live.unanswered.add(live.input.push(first));
  const q = query({
    prompt: live.input,
    options: {
      ...given,
      ...(options.resume ? { resume: options.resume } : {}),
      abortController: abort,
      canUseTool: decidedHere(root, live, mayAsk),
      hooks: hooksOf(root, live, options.held, mayAsk, options.holdPollMs ?? HELD_POLL_MS),
      ...(options.executable ? { pathToClaudeCodeExecutable: options.executable } : {}),
      spawnClaudeCodeProcess: (o) => {
        const [command, ...args] = [...(scope?.argv ?? []), o.command, ...o.args];
        const child = spawn(command ?? o.command, args, { cwd: o.cwd, env: o.env, stdio: ['pipe', 'pipe', 'pipe'], detached: true });
        o.signal.addEventListener('abort', () => killGroup(child.pid), { once: true });
        if (child.pid !== undefined) rewrite(root, live, childFacts(child.pid));
        return child;
      },
    },
  });
  live.q = q as Live['q'];
  live.done = (async () => {
    let end: AttachedState = 'failed';
    let bridging = bridgeAsked(r);
    try {
      for await (const m of q) {
        took(root, live, m);
        if (bridging && bridgeDue(m)) {
          bridging = false;
          await bridgeOn(root, live, q, run.name);
        }
      }
    } catch {
      end = abort.signal.aborted ? 'canceled' : 'failed';
    }
    if (live.limited) rewrite(root, live);
    killGroup(live.run.childPid);
    if (abort.signal.aborted) end = 'canceled';
    if (!live.letGo && (live.run.state === 'working' || live.run.state === 'idle')) rewrite(root, live, { state: end });
  })();
  return live;
};

/**
 * Opens the session's claude.ai bridge on its first message (`bridgeDue`, its `system`/`init`), where its request asked for one, and
 * writes what came of it on the run file — the bridge's facts, or why there is none (`session-bridge.ts`). Asked once a session, and
 * awaited before its next message is taken, so the `bridge_state` messages the answer drives are written after it. A long-lived
 * session keeps its claude.ai session past this process (`keepSessionOnExit`), and a resume re-attaches the one its run file kept; a
 * job's claude.ai session ends with it, and re-attaches none.
 */
const bridgeOn = async (root: string, live: Live, q: unknown, name: string): Promise<void> => {
  if (live.letGo) return;
  const reattach = live.open ? live.run.bridge?.bridgeSessionId : undefined;
  const bridge = await enableBridge(q, name, { keepSessionOnExit: live.open, ...(reattach ? { reattach } : {}) });
  rewrite(root, live, { bridge });
};
