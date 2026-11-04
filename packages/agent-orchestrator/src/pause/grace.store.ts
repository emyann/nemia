/**
 * The store's pause grace on disk, `$WF_ROOT/pause-grace.json` (`{"grace": "10m"}`): how long a person's pause, a restart and an upgrade
 * give each call in flight before it is cut, read the same way by every process and set by `nemia grace <d>`. Absent, the grace is ten
 * minutes (`DEFAULT_GRACE_MS`). Read and written whole, through a hidden file renamed over it.
 *
 * The store's root is no module's to read: every function here takes it as a required `home: string`, as `servers.store.ts` does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Invalid } from '../refusal/refusal.ts';
import { DEFAULT_GRACE_MS, graceOf, graceRefusal } from './pause.ts';

/** The store's grace file. */
export const graceFile = (home: string): string => path.join(home, 'pause-grace.json');

const isGraceFile = Schema.is(Schema.Struct({ grace: Schema.String, at: Schema.optional(Schema.String) }));

/** The grace in force: its milliseconds, whether the file set it, and since when where it says. */
export type GraceAt = { ms: number; set: boolean; at?: string };

/**
 * The grace in force on the store at `home`: the file's, or ten minutes where there is none. A file that does not read, or holds no
 * grace, is refused `Invalid`, naming the file and the verb that writes it again.
 */
export function graceAt(home: string): GraceAt {
  const file = graceFile(home);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { ms: DEFAULT_GRACE_MS, set: false };
  }
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch {
    read = undefined;
  }
  const ms = isGraceFile(read) ? graceOf(read.grace) : undefined;
  if (!isGraceFile(read) || ms === undefined)
    throw new Invalid({
      message: `${file} does not hold a grace (${isGraceFile(read) ? graceRefusal(read.grace) : 'expected {"grace": "10m"}'}): set it again with nemia grace <d>, as nemia grace 10m, or remove the file for the default`,
    });
  return { ms, set: true, ...(read.at ? { at: read.at } : {}) };
}

/** The grace `text` written as the store's, stamped `now`; refused `Invalid` where `graceRefusal` refuses it. */
export function putGrace(home: string, text: string, now: Date = new Date()): GraceAt {
  const ms = graceOf(text);
  if (ms === undefined) throw new Invalid({ message: `${graceRefusal(text)}: type nemia grace <d>, as nemia grace 10m` });
  const file = graceFile(home);
  fs.mkdirSync(home, { recursive: true });
  const hidden = path.join(home, `.pause-grace.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify({ grace: text.trim(), at: now.toISOString() })}\n`);
  fs.renameSync(hidden, file);
  return { ms, set: true, at: now.toISOString() };
}
