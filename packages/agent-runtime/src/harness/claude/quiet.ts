/**
 * When the `claude --bg` runner first saw a working session's transcript at its current mtime, on the monotonic clock
 * (`core/clock.ts`), recorded per attempt under `root`: `{ mtimeMs, boot, ms }`. The kernel stamps a transcript's mtime on the
 * wall clock and nothing reads the write on the monotonic one, so this sighting is how long the transcript has stood unchanged
 * as a clock that only goes forward tells it — a bound a wall clock stepped forward cannot inflate.
 *
 * One writer, the runner's look (`bg.ts`), which rewrites the file only when the mtime or the boot differs, through a file of its own
 * renamed into place; cleared by the spawn under the same name; read fresh on every look by every process that looks, so a
 * restart in the same boot keeps it, and never kept between passes.
 */
import { Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import type { Monotonic } from '../../core/clock.ts';
import { readText } from '../../core/engine/tally.ts';

const isSighted = Schema.is(Schema.Struct({ mtimeMs: Schema.Number, boot: Schema.String, ms: Schema.Number }));

/** Where the sighting of the session under `name` is recorded under `root`, its name folded as an MCP config's is. */
export const quietFileOf = (root: string, name: string): string => path.join(root, 'quiet', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);

/**
 * When the transcript was first seen at `mtimeMs`, on the monotonic clock of `mono`'s boot: the reading `file` records when it
 * names the same mtime and boot, else `mono` itself, written to `file` as a first sighting. A file that is missing, not JSON or of
 * another shape is a first sighting too, and one that cannot be written is a first sighting on every look, so quiet is never
 * reported early. `undefined` with no `mono`: a machine that does not say its boot has only the wall clock.
 */
export const sightingOf = (file: string, mtimeMs: number, mono: Monotonic | undefined): Monotonic | undefined => {
  if (!mono) return undefined;
  const kept = sightedIn(file);
  if (kept && kept.mtimeMs === mtimeMs && kept.boot === mono.boot) return { boot: kept.boot, ms: kept.ms };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const own = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(own, JSON.stringify({ mtimeMs, boot: mono.boot, ms: mono.ms }));
    fs.renameSync(own, file);
  } catch {
    return mono;
  }
  return mono;
};

/** Clears the sighting `file`, so a spawn under a name used before inherits none. Throws when it cannot. */
export const clearSighting = (file: string): void => fs.rmSync(file, { force: true });

/** What `file` records, or `undefined` when it is not there, not JSON, or of another shape. */
const sightedIn = (file: string): { mtimeMs: number; boot: string; ms: number } | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(file));
  } catch {
    return undefined;
  }
  return isSighted(parsed) ? parsed : undefined;
};
