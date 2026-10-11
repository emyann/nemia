/**
 * A render's stack held up for a step with a browser: the same container, seed and slot, kept after the pictures are written, for a
 * bounded time. A detached reaper (`reap.ts`) removes it by its name when the bound ends; `--stop <name>` removes it sooner.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { handTo, stopCommand, type Lock } from './lock.ts';
import { addressOf } from './panels.ts';
import type { Picks } from './seed.ts';
import { NAME, refusal, remove } from './stack.ts';

/** How long a stack is held when `--hold` says no length, and the longest it may be, in seconds. */
export const HOLD_DEFAULT = 600;
export const HOLD_MOST = 1800;

/** The seconds `--hold` asks for: `HOLD_DEFAULT` when it says none; refuses anything but a whole number from 1 to `HOLD_MOST`. */
export function boundOf(arg: string | undefined): number {
  if (arg === undefined) return HOLD_DEFAULT;
  const seconds = Number(arg);
  if (!/^\d+$/.test(arg) || seconds < 1 || seconds > HOLD_MOST)
    throw refusal(
      `--hold ${arg}: a stack is held a whole number of seconds from 1 to ${HOLD_MOST}; say --hold ${HOLD_DEFAULT}, or --hold alone`,
    );
  return seconds;
}

/**
 * `name`, once it is a render's own name and the stack `lock` records as held. Refuses any other: the live stack, a pattern, a render
 * still in flight, or a stack that has already ended.
 */
export function heldName(name: string, lock: Lock | undefined): string {
  if (!NAME.test(name))
    throw refusal(`--stop ${name}: not a render's container (nemia-render-<pid>-<random>); only a held render is stopped here`);
  if (lock?.name !== name || lock.held !== true)
    throw refusal(
      `--stop ${name}: no stack is held under that name${lock ? ` (the slot is ${lock.name}'s)` : ''}; it has ended, or was never held`,
    );
  return name;
}

/** What a hold prints: the container and when it ends, how to stop it, where Grafana listens, and each dashboard's address. */
export function heldLines(
  name: string,
  until: Date,
  grafana: string,
  dashboards: readonly { name: string; uid: string }[],
  picks: Picks,
): string[] {
  return [
    `held: ${name}, until ${until.toISOString()}`,
    `stop it with: ${stopCommand(name)}`,
    `Grafana listens on ${grafana} (no login)`,
    ...dashboards.map((dashboard) => `${dashboard.name}  ${addressOf(grafana, dashboard.uid, picks)}`),
  ];
}

/**
 * Hand the container `name` to a reaper of its own, detached so it outlives this command, which removes it after `seconds`; the slot
 * is rewritten to the reaper. Answers when the hold ends.
 */
export function handOver(name: string, seconds: number): Date {
  const reaper = spawn(process.execPath, [path.join(import.meta.dirname, 'reap.ts'), name, String(seconds)], {
    detached: true,
    stdio: 'ignore',
  });
  if (reaper.pid === undefined) throw new Error(`the reaper of ${name} did not start, so the stack is not held`);
  reaper.unref();
  const until = new Date(Date.now() + seconds * 1000);
  handTo(name, reaper.pid, until);
  return until;
}

/** Stop the held stack `name`: its container removed by that name, once `heldName` lets it through. Its reaper lets the slot go. */
export function stop(name: string, lock: Lock | undefined): void {
  remove(heldName(name, lock));
}
