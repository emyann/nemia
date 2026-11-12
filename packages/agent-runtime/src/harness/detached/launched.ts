/**
 * Who a detached run's worker is: the process the spawn launched, by its pid, when that process started and the boot it ran in,
 * written beside the run (`<name>.launched`) by the spawn the moment it has launched it (`writeLaunched`), and looked for on a look
 * that finds the run's beat stale (`workerSeen`). The run file is the worker's to write once it runs, so the spawn writes this file
 * of its own instead. The pid is the worker's own: `systemd-run --scope` runs the worker as itself (`scopeArgv`).
 */
import fs from 'node:fs';
import { Option, Schema } from 'effect';
import { alive, processStart } from '../../process/alive.ts';
import { monoNow } from '../../core/engine/now.ts';
import { readText } from '../../core/engine/tally.ts';
import type { WorkerSeen } from './run-file.ts';

/** The `.launched` file: the worker's pid, its start (`processStart`) and its boot's id, each absent where the machine cannot say. */
const LaunchedSchema = Schema.Struct({
  pid: Schema.Finite,
  start: Schema.optional(Schema.String),
  boot: Schema.optional(Schema.String),
});

const decodeLaunched = Schema.decodeUnknownOption(LaunchedSchema);

/** Writes `file` naming the process `pid`, launched now, by its start and this boot. */
export const writeLaunched = (file: string, pid: number): void => {
  const start = processStart(pid);
  const boot = monoNow()?.boot;
  fs.writeFileSync(file, JSON.stringify({ pid, ...(start ? { start } : {}), ...(boot ? { boot } : {}) }));
};

/**
 * What a look finds of the worker `file` names (`WorkerSeen`), read on each look, never kept:
 *
 * - `gone`: it ran in another boot, its pid is no process, or its pid is a process that started at another time (taken since);
 * - `running`: its pid is a process that started when it did, in this boot;
 * - `unknown`: no file, one that does not decode, no pid above 0, or no boot or start to tell it by (no `/proc`), so the clock alone
 *   judges, as it did for a run spawned before this file was written.
 */
export const workerSeen = (file: string): WorkerSeen => {
  let text: string;
  try {
    text = readText(file);
  } catch {
    return 'unknown';
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'unknown';
  }
  const decoded = decodeLaunched(parsed);
  if (Option.isNone(decoded)) return 'unknown';
  const { pid, start, boot } = decoded.value;
  const here = monoNow()?.boot;
  if (!Number.isInteger(pid) || pid <= 0 || boot === undefined || here === undefined || start === undefined) return 'unknown';
  if (boot !== here || !alive(pid)) return 'gone';
  const now = processStart(pid);
  if (now === undefined) return alive(pid) ? 'unknown' : 'gone';
  return now === start ? 'running' : 'gone';
};
