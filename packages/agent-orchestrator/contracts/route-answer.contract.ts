/**
 * A script condition's answer (agent-orchestrator, src/route/route.ts, `scriptRoute`): what a condition whose eval is a script reads, off
 * its task's attempt — the exit verdict (`attemptVerdict`, check.ts) and the answer file the runtime kept at exit (the attempt's
 * terminationMessage), decoded strictly in a `*.store.ts` before it reaches here — as a route, or as one of the step's own words.
 *
 * Only a clean exit with an answer naming a declared route is a route. Every other case has one word, each already a `StepStatus` the
 * pass reads: a script that never finished is `stopped`, one that exited non-zero `failed`, one that exited 0 with no answer the run can
 * use `unsigned`, and one that says it is unsure `blocked`, with its words, for a person to answer (`nemia route`, `nemia retry`).
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A check's and a script's verdict: the exit code, or `unfinished` when the attempt has none (`Verdict`, check.ts). */
export type ScriptVerdict = number | 'unfinished';

/**
 * The answer file, decoded (RouteAnswer in the design, §2): a route, with why; or `unsure`, with the words a person reads. Absent where
 * the runtime kept no file, or what it kept does not decode — both a route and `unsure`, neither, or more than its cap.
 */
export type ScriptAnswer =
  | { readonly kind: 'route'; readonly route: string; readonly why?: string }
  | { readonly kind: 'unsure'; readonly unsure: string };

/** What a script condition reads as: a route, or the word its step reads instead. */
export type ScriptRead =
  | { readonly kind: 'route'; readonly route: string }
  | { readonly kind: 'blocked'; readonly unsure: string }
  | { readonly kind: 'unsigned' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'stopped' };

const scriptRouteSpec = spec<(verdict: ScriptVerdict, answer: ScriptAnswer | undefined, routes: readonly string[]) => ScriptRead>({
  ensures: {
    unfinishedIsStopped: {
      description: 'A script that did not finish — timed out, killed, stopped — said nothing: its condition reads stopped',
      condition: ({ input: [verdict], output }) => verdict !== 'unfinished' || output.kind === 'stopped',
    },
    aNonZeroExitFails: {
      description: 'A script that exited non-zero ran and said nothing the run can use: its condition reads failed',
      condition: ({ input: [verdict], output }) => verdict === 'unfinished' || verdict === 0 || output.kind === 'failed',
    },
    aRouteNeedsACleanExit: {
      description: 'A route is read only off a clean exit whose answer names it, and only a route the condition declares',
      condition: ({ input: [verdict, answer, routes], output }) =>
        output.kind !== 'route' ||
        (verdict === 0 && answer !== undefined && answer.kind === 'route' && answer.route === output.route && routes.includes(output.route)),
    },
    aCleanAnswerRoutes: {
      description: 'A clean exit whose answer names a declared route takes that route',
      condition: ({ input: [verdict, answer, routes], output }) =>
        !(verdict === 0 && answer !== undefined && answer.kind === 'route' && routes.includes(answer.route)) ||
        (output.kind === 'route' && output.route === answer.route),
    },
    unsureIsAPersonsWord: {
      description: 'A clean exit that says it is unsure reads blocked, with its words, and is never a route',
      condition: ({ input: [verdict, answer], output }) =>
        !(verdict === 0 && answer !== undefined && answer.kind === 'unsure') ||
        (output.kind === 'blocked' && output.unsure === answer.unsure),
    },
    noUsableAnswerIsUnsigned: {
      description:
        'A clean exit with no answer, or one naming a route the condition does not declare, is unsigned: never the first route, never a default',
      condition: ({ input: [verdict, answer, routes], output }) =>
        !(verdict === 0 && (answer === undefined || (answer.kind === 'route' && !routes.includes(answer.route)))) ||
        output.kind === 'unsigned',
    },
  },
});

/** The function's type, which the code takes: it then imports nothing of tsverify. */
export type ScriptRoute = Implementation<typeof scriptRouteSpec>;
