/**
 * Where a repository's result branches stood when the tick last read them: `$WF_ROOT/standing.json`, the tick's alone to write
 * (`writeStanding`), each repository, place and base branch a pass asked the place's `standing` of with what it answered, or the words it
 * was not read with, and when (`StoodRead`). Read back by `readStanding`, decoded by its schema.
 *
 * Beneath the controllers, on the place (`place.store.ts`), whose answer it keeps as the place's schema decodes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { firstRefusal, HOME } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { StandingSchema } from '../place/place.store.ts';
import type { Standing } from '../place/place.ts';

/**
 * One repository, place and base branch as a pass read where its branches stand: the place's answer, or why there is none — the place
 * refused or was not heard — in words, and when it was read.
 */
export type StoodRead = { readonly repo: string; readonly base: string; readonly at: string } & (
  | { readonly answer: Standing }
  | { readonly unread: string }
);

/** `standing.json` as the tick writes it: its version, when the pass read it, and each repository, place and base branch it read. */
export type StandingFile = { readonly v: 1; readonly at: string; readonly places: readonly StoodRead[] };

/** `$WF_ROOT/standing.json`, where the tick keeps what its last pass read of where the branches stand. */
export const standingFile = (): string => path.join(HOME, 'standing.json');

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

const Where = { repo: Schema.String, base: Schema.String, at: Schema.String };

const StoodReadSchema = Schema.Union([
  Schema.StructWithRest(Schema.Struct({ ...Where, answer: StandingSchema }), Rest),
  Schema.StructWithRest(Schema.Struct({ ...Where, unread: Schema.String }), Rest),
]);

/** `standing.json`, decoded: a newer tick's keys kept where it wrote any. */
export const StandingFileSchema = Schema.StructWithRest(
  Schema.Struct({ v: Schema.Literal(1), at: Schema.String, places: Schema.Array(StoodReadSchema) }),
  Rest,
);

/** What to do about a `standing.json` that does not read. */
const REWRITTEN =
  'only the tick writes it, and its next pass writes it whole: if a newer nemia wrote it, read the store with that nemia; else remove it.';

/**
 * What the last pass read of where the branches stand (`standingFile`), or undefined before any pass wrote it. Refused (`Invalid`), naming
 * the file and its first wrong field, where it does not decode as `StandingFileSchema`: a file half written is never one, since it is
 * written whole and renamed.
 */
export function readStanding(): StandingFile | undefined {
  let text: string;
  try {
    text = fs.readFileSync(standingFile(), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Invalid({ message: `${standingFile()} is not JSON: ${REWRITTEN}` });
  }
  const decoded = Schema.decodeUnknownResult(StandingFileSchema)(json);
  if (Result.isSuccess(decoded)) return decoded.success;
  const { path: at, words } = firstRefusal(json, decoded.failure);
  throw new Invalid({ message: `${standingFile()}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${REWRITTEN}` });
}

/**
 * What a pass read of where the branches stand written down, through a hidden file renamed over the last, so a reader never reads half of
 * it. Throws node's error where the store cannot be written.
 */
export function writeStanding(at: string, places: readonly StoodRead[]): void {
  const file: StandingFile = { v: 1, at, places };
  const hidden = path.join(HOME, `.standing.json.${process.pid}`);
  fs.mkdirSync(HOME, { recursive: true });
  fs.writeFileSync(hidden, JSON.stringify(file));
  fs.renameSync(hidden, standingFile());
}
