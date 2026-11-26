/**
 * Where a repository's result branches stood when the tick last read them: `$WF_ROOT/standing.json`, the tick's alone to write
 * (`writeStanding`), each repository, place and base branch a pass asked the place's `standing` of with what it answered, or the words it
 * was not read with, and when (`StoodRead`). Read back by `readStanding`, decoded by its schema.
 *
 * Beneath the controllers, on the place (`place.store.ts`), whose answer it keeps as the place's schema decodes it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Option, Result, Schema } from 'effect';
import { firstRefusal } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { StandingSchema } from '../place/place.store.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';

/**
 * `$WF_ROOT/standing.json`, where the tick keeps what its last pass read of where the branches stand.
 * @param home The store's root.
 */
export const standingFile = (home: string) => path.join(home, 'standing.json');

const Rest = [Schema.Record(Schema.String, Schema.Unknown)] as const;

const Where = { repo: Schema.String, base: Schema.String, at: Schema.String };

/** A repository, place and base branch the place answered for. */
const StoodAnswer = Schema.Struct({ ...Where, answer: StandingSchema });

/** A repository, place and base branch the place was not read on, and why. */
const StoodUnread = Schema.Struct({ ...Where, unread: Schema.String });

/**
 * One repository, place and base branch as a pass read where its branches stand: the place's answer, or why there is none — the place
 * refused or was not heard — in words, and when it was read.
 * Taken from the two members' own Structs, not from `StoodReadSchema`, whose rest keys would give it an index signature that undoes the
 * `'answer' in` narrowing its readers do.
 */
export type StoodRead = typeof StoodAnswer.Type | typeof StoodUnread.Type;

const StoodReadSchema = Schema.Union([Schema.StructWithRest(StoodAnswer, Rest), Schema.StructWithRest(StoodUnread, Rest)]);

/** `standing.json` as the tick writes it: its version, when the pass read it, and each repository, place and base branch it read. */
const StandingFileFields = Schema.Struct({ v: Schema.Literal(1), at: Schema.String, places: Schema.Array(StoodReadSchema) });

/** `standing.json` as the tick writes it, its keys alone: a newer tick's rest left out of the type, as `StoodRead`'s is. */
export type StandingFile = Omit<typeof StandingFileFields.Type, 'places'> & { readonly places: readonly StoodRead[] };

/** `standing.json`, decoded: a newer tick's keys kept where it wrote any. */
const StandingFileSchema = Schema.StructWithRest(StandingFileFields, Rest);

/** What to do about a `standing.json` that does not read. */
const REWRITTEN =
  'only the tick writes it, and its next pass writes it whole: if a newer nemia wrote it, read the store with that nemia; else remove it.';

/**
 * What the last pass read of where the branches stand (`standingFile`), or undefined before any pass wrote it. Refused (`Invalid`), naming
 * the file and its first wrong field, where it does not decode as `StandingFileSchema`: a file half written is never one, since it is
 * written whole and renamed.
 * @param home The store's root.
 */
export function readStanding(home: string) {
  let text: string;
  try {
    text = fs.readFileSync(standingFile(home), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined satisfies StandingFile | undefined as StandingFile | undefined;
    throw err;
  }
  const parsed = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(text);
  if (Option.isNone(parsed)) throw new Invalid({ message: `${standingFile(home)} is not JSON: ${REWRITTEN}` });
  const json = parsed.value;
  const decoded = Schema.decodeUnknownResult(StandingFileSchema)(json);
  if (Result.isSuccess(decoded)) return decoded.success satisfies StandingFile | undefined as StandingFile | undefined;
  const { path: at, words } = firstRefusal(StandingFileSchema, json);
  throw new Invalid({ message: `${standingFile(home)}: ${at.length ? `its ${at.join('.')} ` : ''}${words}: ${REWRITTEN}` });
}

/**
 * When the tick's last pass read where the branches stand (`at`, `readStanding`'s), or that no pass has (`none`): what `nemia ls` words
 * how old what it shows of them is by (`standingLine`). Refused as `readStanding` refuses a file that does not read.
 * @param home The store's root.
 */
export const listedStanding = (home: string) => {
  const file = readStanding(home);
  return (file ? { at: file.at } : { none: true }) satisfies { at: string } | { none: true };
};

/**
 * What a pass read of where the branches stand written down, through a hidden file renamed over the last, so a reader never reads half of
 * it. Throws node's error where the store cannot be written.
 * @param home The store's root.
 * @param at When the pass read them, an ISO time.
 * @param places What the pass read of each repository, place and base.
 */
export function writeStanding(home: string, at: string, places: readonly StoodRead[]) {
  const file: StandingFile = { v: 1, at, places };
  fs.mkdirSync(home, { recursive: true });
  writeWhole(standingFile(home), JSON.stringify(file));
}
