/**
 * The runners of the store's pause: `nemia pause` (`server.pause`; with `--now` and no `--yes`, what a pause at once would cut, read off
 * `server.pauseNow` and the pause that stands, `server.paused`, and nothing written), `nemia resume` (`server.resume`) and `nemia
 * pause-timeout` (`server.pauseTimeout` bare, `server.setPauseTimeout` given one). Their words are the orchestrator's pause's, ported word
 * for word, as `src/reads/standing.ts` ports the pause `nemia ls` says.
 */
import {
  type Args,
  type Interrupt,
  PAUSE_TIMEOUT_WORDS,
  PAUSE_WORDS,
  type Pause,
  type PauseAnswer,
  type PauseTimeoutAnswer,
  RESUME_WORDS,
} from 'objects';
import { asked } from '../../objects.ts';
import { said, switchArg, textArg } from '../requests.ts';

/** The command that lifts the pause. */
const RESUME_LINE = 'nemia resume';

/** How `nemia pause --now` acts once it is shown what it stops. */
const NOW_LINE = 'nemia pause --now --yes';

/** Since when and by whom a pause was put, and why where it says. */
const sinceWords = ({ at, by, why }: Pause): string =>
  `since ${at || 'a time its file no longer says'} by ${by || 'someone its file no longer names'}${why ? `: ${why}` : ''}`;

/** What the pause does, in words, by its timeout: at once, at each call's end, or never cut. */
const pauseDoes = ({ timeoutMs }: Pause): string =>
  timeoutMs === 0
    ? 'nothing new starts, and each working session is cut at once and parks'
    : timeoutMs !== undefined
      ? 'nothing new starts, and each working session stops when its current tool call ends, cut once the timeout passes'
      : 'nothing new starts, and each working session runs on to its end';

/** A task a pause at once cuts, in words: its run, its step, and what of it is cut. */
const interruptWords = ({ run, step, kind }: Interrupt): string =>
  `${run}'s ${step}: ${kind === 'session' ? 'its session, its call cut, going on as the same try' : 'its check, run again'}`;

/** What `nemia pause` prints of what it did: the pause put; or, at once, what it cut, left at work, and what that costs. */
export const pauseLines = (answer: PauseAnswer, cost: string): string[] => {
  if (!('kept' in answer))
    return [`the store is paused ${sinceWords(answer.pause)} — ${pauseDoes(answer.pause)}; ${RESUME_LINE} resumes it`];
  const { pause, kept, interrupted, skipped } = answer;
  return [
    kept
      ? `the store's pause stands as it was put, ${sinceWords(pause)}; now what runs is cut`
      : `the store is paused at once ${sinceWords(pause)} — what runs is cut, and a landing finishes; ${RESUME_LINE} resumes it`,
    interrupted.length
      ? `cut ${interrupted.length}, each going on at ${RESUME_LINE}:`
      : 'nothing outside a landing was at work: nothing was stopped',
    ...interrupted.map((i) => `   ${interruptWords(i)}`),
    ...skipped.map((i) => `   ${interruptWords(i)} — left at work: a try of it is asked for already`),
    ...(interrupted.length ? [cost] : []),
  ];
};

/** What `nemia pause --now` says before it acts: that it would pause or keep the pause that stands, what it would cut, and the cost. */
export const nowLines = (interrupts: readonly Interrupt[], standing: boolean, cost: string): string[] => {
  const pausing = standing ? "would keep the store's pause as it stands" : 'would pause the store';
  return [
    interrupts.length
      ? `nemia pause --now ${pausing} and cut ${interrupts.length} at work, each going on at ${RESUME_LINE}:`
      : `nemia pause --now ${pausing}; nothing outside a landing is at work, so it stops nothing.`,
    ...interrupts.map((i) => `   ${interruptWords(i)}`),
    `${cost} A landing that checks or merges is left to finish.`,
    `${NOW_LINE} does it.`,
  ];
};

/**
 * `nemia pause [--why] [--by] [--timeout <d> | --now [--yes]]`: the store paused; `--now` without `--yes` says what it would cut, and
 * writes nothing.
 */
export async function pause(args: Args): Promise<number> {
  const command = PAUSE_WORDS.name;
  const now = switchArg(args, 'now') ? await asked(command, (c) => c.server.pauseNow()) : undefined;
  if (now !== undefined && !switchArg(args, 'yes')) {
    const standing = (await asked(command, (c) => c.server.paused())).pause !== null;
    said(nowLines(now.interrupts, standing, now.cost));
    return 0;
  }
  const why = textArg(args, 'why');
  const by = textArg(args, 'by');
  const timeout = textArg(args, 'timeout');
  const payload = {
    ...(why !== undefined ? { why } : {}),
    ...(by !== undefined ? { by } : {}),
    ...(timeout !== undefined ? { timeout } : {}),
    ...(now !== undefined ? { now: true } : {}),
  };
  said(pauseLines(await asked(command, (c) => c.server.pause({ payload })), now?.cost ?? ''));
  return 0;
}

/** `nemia resume`: the store's pause lifted. */
export async function resume(): Promise<number> {
  await asked(RESUME_WORDS.name, (c) => c.server.resume());
  said(['the store is resumed — the next pass files what waits']);
  return 0;
}

/** A timeout in words, by its largest whole unit: `10m`, `90s`, `2h`. */
const timeoutWords = (ms: number): string =>
  ms % 3_600_000 === 0 ? `${ms / 3_600_000}h` : ms % 60_000 === 0 ? `${ms / 60_000}m` : `${Math.round(ms / 1_000)}s`;

/** What `nemia pause-timeout` prints: the timeout written, or the one in force and since when. */
export const timeoutLines = ({ timeout, wrote }: PauseTimeoutAnswer): string[] => [
  wrote
    ? `the store's pause timeout is now ${timeoutWords(timeout.ms)}: each pause, restart and upgrade gives a call in flight ${timeoutWords(timeout.ms)} before it is cut`
    : `the store's pause timeout is ${timeoutWords(timeout.ms)}${timeout.set ? (timeout.at ? `, set ${timeout.at}` : '') : ' (the default)'}`,
];

/** `nemia pause-timeout [<d>]`: the store's pause timeout, read bare, written given one. */
export async function pauseTimeout(args: Args): Promise<number> {
  const timeout = textArg(args, 'timeout');
  const answer = await asked(PAUSE_TIMEOUT_WORDS.name, (c) =>
    timeout === undefined ? c.server.pauseTimeout() : c.server.setPauseTimeout({ payload: { timeout } }),
  );
  said(timeoutLines(answer));
  return 0;
}
