/**
 * Whether a call of a tool of the MCP port is answered as an MCP task (apps/api, src/mcp/tasks.ts, `taskAnswerOf`): MCP's tasks extension
 * (`io.modelcontextprotocol/tasks`) lets a server answer a `tools/call` with a task in place of its result, at its own discretion, but
 * never to a request that did not declare the extension in its own per-request capabilities. The port answers a task
 * where the request is of the modern era (the one that carries per-request capabilities), declares the extension, and the tool's link
 * says how it answers as one (`LinkTask` in `objects`' command table): a link that follows what the call started is always a task; one the
 * port asks again and holds in its memory is a task while fewer than the most it holds are live, and its call is answered as today
 * otherwise. Every other call is answered as today. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The era a request of `/mcp` speaks, as the SDK tells the port: `modern` (its capabilities on each request) or `legacy`. */
export type TaskEra = 'modern' | 'legacy';

/**
 * How the tool's link answers as a task: `follow`, the call starts something the port then reads by another endpoint; `again`, the port
 * asks the endpoint again from the cursor its answer gives and holds the task in its memory; `none`, the link declares no task.
 */
export type TaskKind = 'follow' | 'again' | 'none';

/**
 * What the decision reads: the request's era, whether its capabilities declare the tasks extension, how the tool's link answers as a
 * task, how many tasks the port holds live now, and the most it holds.
 */
export type TaskAsked = {
  readonly era: TaskEra;
  readonly declared: boolean;
  readonly kind: TaskKind;
  readonly held: number;
  readonly most: number;
};

/** How the call is answered: `task`, a task the caller reads with `tasks/get`; `plain`, the tool's result, as today. */
export type TaskAnswer = 'task' | 'plain';

/** Whether the request may be answered a task at all: of the modern era, and declaring the extension. */
const mayTask = (asked: TaskAsked) => asked.era === 'modern' && asked.declared;

const taskAnswerSpec = spec<(asked: TaskAsked) => TaskAnswer>({
  requires: ({ input: [asked] }) => Number.isInteger(asked.held) && asked.held >= 0 && Number.isInteger(asked.most) && asked.most >= 0,
  ensures: {
    neverToACallerThatDidNotDeclare: {
      description: 'A request that does not declare the tasks extension is never answered a task',
      condition: ({ input: [asked], output }) => output === 'plain' || asked.declared,
    },
    neverOnTheLegacyEra: {
      description: 'A request of the legacy era, which carries no per-request capabilities, is never answered a task',
      condition: ({ input: [asked], output }) => output === 'plain' || asked.era === 'modern',
    },
    neverForALinkWithNoTask: {
      description: 'A tool whose link declares no task is never answered as one',
      condition: ({ input: [asked], output }) => output === 'plain' || asked.kind !== 'none',
    },
    heldTasksStayWithinTheMost: {
      description: 'A task the port holds in its memory is made only while it holds fewer than the most',
      condition: ({ input: [asked], output }) => output === 'plain' || asked.kind !== 'again' || asked.held < asked.most,
    },
    aFollowedCallIsATaskWhereDeclared: {
      description: 'A modern request that declares the extension, of a tool that follows what it started, is answered a task',
      condition: ({ input: [asked], output }) => !(mayTask(asked) && asked.kind === 'follow') || output === 'task',
    },
    aHeldCallIsATaskWhileThereIsRoom: {
      description: 'A modern request that declares the extension, of a tool the port asks again, is a task while there is room',
      condition: ({ input: [asked], output }) =>
        !(mayTask(asked) && asked.kind === 'again' && asked.held < asked.most) || output === 'task',
    },
  },
});

/** `taskAnswerOf`'s type, which `src/mcp/tasks.ts` takes. */
export type TaskAnswerOf = Implementation<typeof taskAnswerSpec>;
