/**
 * The runners of the run's verbs that act on one run as it stands, or wait on the feed: `nemia cancel`, `nemia hold` (its lift, `--off`,
 * the Run's `unhold`), `nemia route`, `nemia refresh` and `nemia wait`. Each asks its endpoint in the run's namespace (`namespaceOfRun`)
 * and prints the lines the old path printed, from what the api answers.
 */
import {
  type Args,
  CANCEL_WORDS,
  type Event,
  type FeedWait,
  HOLD_WORDS,
  REFRESH_WORDS,
  ROUTE_WORDS,
  type RunCancelled,
  type RunHeld,
  type RunRefreshed,
  type RunRouted,
  WAIT_WORDS,
} from 'objects';
import { asked } from '../../objects.ts';
import { listArg, namespaceOfRun, said, selectorQuery, switchArg, textArg } from '../requests.ts';

/** The run a line names first, under `runId`: the parser fills it, its spec requiring it. */
export const runOf = (args: Args): string => textArg(args, 'runId') ?? '';

/** What `nemia cancel` prints of what it did: that it stopped what was in flight, or why there was nothing to. */
export const cancelLines = ({ id, plan }: RunCancelled): string[] => {
  if (plan.kind === 'finished') return [`${id}  already ${plan.status} — nothing to stop`];
  const head = plan.kind === 'already-cancelled' ? `${id}  already cancelled at ${plan.at}` : `${id}  cancelled`;
  if (plan.stop.length)
    return [head, `   asked to stop: ${plan.stop.map((s) => s.name).join(', ')}  (the engine stops it on its next tick)`];
  return plan.kind === 'cancel' ? [head, `   nothing was in flight — no further steps will be filed`] : [head];
};

/** `nemia cancel <runId>`: what the run has in flight asked to stop, and nothing more filed. */
export async function cancel(args: Args): Promise<number> {
  const name = runOf(args);
  const namespace = await namespaceOfRun(CANCEL_WORDS.name, name);
  said(cancelLines(await asked(CANCEL_WORDS.name, (c) => c.runs.cancel({ params: { namespace, name } }))));
  return 0;
}

/** Runs named in a sentence: `a`, `a and b`, `a, b and c`. */
const runList = (ids: readonly string[]): string => (ids.length > 1 ? `${ids.slice(0, -1).join(', ')} and ${ids.at(-1)}` : (ids[0] ?? ''));

/** A hold as `nemia hold` says it: the runs it waits on to land, or a person's lift, and why and by whom where it says. */
const holdWords = ({ until, why, by }: RunHeld['hold']): string => {
  const parts = [...(why ? [`why: ${why}`] : []), ...(by ? [`by ${by}`] : [])];
  const words = parts.length ? ` (${parts.join('; ')})` : '';
  return until.length
    ? `held until ${runList(until)} ${until.length === 1 ? 'lands' : 'land'}${words}`
    : `held until a person lifts it${words}`;
};

/** What `nemia hold` prints of a hold put or lifted. */
export const holdLines = ({ id, lifted, hold }: RunHeld): string[] => [
  lifted
    ? `${id}  hold lifted — the next tick goes on, and what its steps ask is asked`
    : `${id}  ${holdWords(hold)} — nothing more of it is filed, and nothing is asked of you, until then; ${hold.until.length ? 'the next tick lifts the hold' : `no tick lifts it: nemia hold ${id} --off`}`,
];

/** `nemia hold <runId> [--until <runId> ...] [--why] [--by]`, or `--off`: the hold put (`runs.hold`), or lifted (`runs.unhold`). */
export async function hold(args: Args): Promise<number> {
  const name = runOf(args);
  const namespace = await namespaceOfRun(HOLD_WORDS.name, name);
  const why = textArg(args, 'why');
  const by = textArg(args, 'by');
  const until = listArg(args, 'until');
  const payload = {
    ...(until.length ? { until } : {}),
    ...(why !== undefined ? { why } : {}),
    ...(by !== undefined ? { by } : {}),
  };
  const held = await asked(HOLD_WORDS.name, (c) =>
    switchArg(args, 'off') ? c.runs.unhold({ params: { namespace, name } }) : c.runs.hold({ params: { namespace, name }, payload }),
  );
  said(holdLines(held));
  return 0;
}

/** What `nemia route` prints of the route written. */
export const routeLines = ({ step, try: n, route, file }: RunRouted, runId: string): string[] => [
  `${runId}  routed: try ${n} of ${step} takes ${route} — the next tick files what its when: names`,
  `   ${file}`,
];

/** `nemia route <runId> <condition> <route>`: a person's route for the condition's try. */
export async function route(args: Args): Promise<number> {
  const name = runOf(args);
  const step = textArg(args, 'step') ?? '';
  const namespace = await namespaceOfRun(ROUTE_WORDS.name, name);
  const routed = await asked(ROUTE_WORDS.name, (c) =>
    c.runs.route({ params: { namespace, name, step }, payload: { route: textArg(args, 'route') ?? '' } }),
  );
  said(routeLines(routed, name));
  return 0;
}

/** A kind the run was behind on, as `nemia refresh` says it: its name, the revision it ran on and the one now. */
const driftWords = (d: NonNullable<RunRefreshed['drift']>[number]): string =>
  `${d.kind} ${d.name}: ${d.step ? `${d.step} ran on rev ${d.pinned}` : `rev ${d.pinned}`}, now ${d.now}`;

/** What `nemia refresh` prints: the new revisions asked for and the kinds it was behind on, or, with `--base`, the merge it asked. */
export const refreshLines = ({ drift, said: merged, file }: RunRefreshed, runId: string, base: boolean): string[] =>
  base
    ? [`${runId}  ${merged ?? ''}`, `   ${file ?? ''}`]
    : [
        `${runId}  asked: the new revisions — the next tick takes them, and every filing after it is on them`,
        ...(drift ?? []).map((d) => `   ${driftWords(d)}`),
      ];

/** `nemia refresh <runId> [<step>] [--base]`: the run pinned to the new revisions, or its loop sent to merge its base. */
export async function refresh(args: Args): Promise<number> {
  const name = runOf(args);
  const base = switchArg(args, 'base');
  const step = textArg(args, 'step');
  const namespace = await namespaceOfRun(REFRESH_WORDS.name, name);
  const payload = { ...(base ? { base } : {}), ...(step !== undefined ? { step } : {}) };
  said(refreshLines(await asked(REFRESH_WORDS.name, (c) => c.runs.refresh({ params: { namespace, name }, payload })), name, base));
  return 0;
}

/** A line of the feed as `nemia wait` prints it: its time, what it is about — a run and its step — and what it says. */
const eventLine = ({ metadata, involved, message }: Event): string => {
  const at = (metadata.creationTimestamp ?? '').slice(11, 19);
  const [run, step] = involved.name.split('/');
  const about = involved.kind === 'Run' || involved.kind === 'Step' ? `${run ?? ''}  ${step ?? '—'}` : `${involved.name}  —`;
  return `${at}  ${about}  ${message}`;
};

/** How long `nemia wait` gives the api to answer: the longest a wait waits (270 s), and half a minute more for the answer. */
const WAIT_BOUND_MS = 300_000;

/** What `nemia wait` prints: each line it took, then the cursor to wait again from. */
export const waitLines = ({ lines, cursor }: FeedWait): string[] => [...lines.map(eventLine), `cursor: ${cursor}`];

/** `nemia wait [-l <key>=<value>]... [--from <cursor>] [--for <duration>]`: the feed's next lines `-l` takes, and the cursor after. */
export async function wait(args: Args): Promise<number> {
  const from = textArg(args, 'from');
  const bound = textArg(args, 'for');
  const query = { ...selectorQuery(args), ...(from !== undefined ? { from } : {}), ...(bound !== undefined ? { for: bound } : {}) };
  said(waitLines(await asked(WAIT_WORDS.name, (c) => c.server.wait({ query }), process.env, WAIT_BOUND_MS)));
  return 0;
}
