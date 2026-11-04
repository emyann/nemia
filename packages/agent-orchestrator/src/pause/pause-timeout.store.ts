/**
 * The store's pause timeout on disk, `$WF_ROOT/pause-timeout.json` (`{"timeout": "10m"}`): how long a person's pause, a restart and an
 * upgrade give each call in flight before it is cut, read the same way by every process and set by `nemia pause-timeout <d>`. Absent, the
 * timeout is ten minutes (`DEFAULT_TIMEOUT_MS`). Read and written whole, through a hidden file renamed over it.
 *
 * The store's root is no module's to read: every function here takes it as a required `home: string`, as `servers.store.ts` does.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Invalid } from '../refusal/refusal.ts';
import { DEFAULT_TIMEOUT_MS, timeoutOf, timeoutRefusal } from './pause.ts';

/** The store's timeout file. */
export const timeoutFile = (home: string): string => path.join(home, 'pause-timeout.json');

const isTimeoutFile = Schema.is(Schema.Struct({ timeout: Schema.String, at: Schema.optional(Schema.String) }));

/** The timeout in force: its milliseconds, whether the file set it, and since when where it says. */
export type TimeoutAt = { ms: number; set: boolean; at?: string };

/**
 * The timeout in force on the store at `home`: the file's, or ten minutes where there is none. A file that does not read, or holds no
 * timeout, is refused `Invalid`, naming the file and the verb that writes it again.
 */
export function timeoutAt(home: string): TimeoutAt {
  const file = timeoutFile(home);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { ms: DEFAULT_TIMEOUT_MS, set: false };
  }
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch {
    read = undefined;
  }
  const ms = isTimeoutFile(read) ? timeoutOf(read.timeout) : undefined;
  if (!isTimeoutFile(read) || ms === undefined)
    throw new Invalid({
      message: `${file} does not hold a timeout (${isTimeoutFile(read) ? timeoutRefusal(read.timeout) : 'expected {"timeout": "10m"}'}): set it again with nemia pause-timeout <d>, as nemia pause-timeout 10m, or remove the file for the default`,
    });
  return { ms, set: true, ...(read.at ? { at: read.at } : {}) };
}

/** The timeout `text` written as the store's, stamped `now`; refused `Invalid` where `timeoutRefusal` refuses it. */
export function putTimeout(home: string, text: string, now: Date = new Date()): TimeoutAt {
  const ms = timeoutOf(text);
  if (ms === undefined) throw new Invalid({ message: `${timeoutRefusal(text)}: type nemia pause-timeout <d>, as nemia pause-timeout 10m` });
  const file = timeoutFile(home);
  fs.mkdirSync(home, { recursive: true });
  const hidden = path.join(home, `.pause-timeout.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify({ timeout: text.trim(), at: now.toISOString() })}\n`);
  fs.renameSync(hidden, file);
  return { ms, set: true, at: now.toISOString() };
}
