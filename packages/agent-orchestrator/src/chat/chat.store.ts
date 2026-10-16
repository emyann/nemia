/**
 * A chat's own files, in the folder `chat/` of the folder it is kept in: what the person wrote (`outbox.jsonl`, appended by the
 * person's verb alone), the keeper's marks of what it delivered (`delivered.jsonl`, appended by the delivery alone), and the person's
 * read mark (`read.json`, written whole by the person's verb alone). One writer each, composed on read; none is ever rewritten but the
 * read mark, which its one writer replaces.
 *
 * Beneath the controllers: it imports no runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { Invalid } from '../refusal/refusal.ts';
import type { DeliveredMark, OutboxEntry, ReadMark } from './chat.ts';

/** The chat's folder within `dir`. */
export const chatDir = (dir: string): string => path.join(dir, 'chat');

/** The person's words, one entry a line. */
export const outboxFile = (dir: string): string => path.join(chatDir(dir), 'outbox.jsonl');

/** The keeper's marks of what it delivered, one a line. */
export const deliveredFile = (dir: string): string => path.join(chatDir(dir), 'delivered.jsonl');

/** The person's read mark. */
export const readMarkFile = (dir: string): string => path.join(chatDir(dir), 'read.json');

const Moment = Schema.String.check(Schema.isNonEmpty());

const OutboxSchema = Schema.Struct({ id: Moment, at: Moment, text: Schema.String });
const DeliveredSchema = Schema.Struct({ id: Moment, said: Moment, attempt: Schema.Finite });
const ReadSchema = Schema.Struct({ through: Moment, at: Moment });

/** The text of `file`, or undefined where there is none. */
const textOf = (file: string): string | undefined => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
};

/** `raw` decoded by `schema`, or refused (`Invalid`) naming `where` and that the file is the chat's. */
function decoded<S extends Schema.Top>(schema: S, raw: unknown, where: string): S['Type'] {
  const read = Schema.decodeUnknownResult(schema as never)(raw) as Result.Result<S['Type'], unknown>;
  if (Result.isSuccess(read)) return read.success;
  throw new Invalid({ message: `${where} is not a line of the chat's record: move the file aside and the chat reads without it.` });
}

/**
 * The lines of a JSONL file, each decoded by `schema`: none where there is no file, and a last line not yet ended left out, as an append
 * still being written. Refused (`Invalid`) for a line that does not decode, naming the file and the line.
 */
function linesOf<S extends Schema.Top>(file: string, schema: S): S['Type'][] {
  const text = textOf(file);
  if (text === undefined) return [];
  const lines = text.split('\n').slice(0, -1);
  return lines.flatMap((line, i) => {
    if (line.trim() === '') return [];
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      raw = undefined;
    }
    return [decoded(schema, raw, `${file}:${i + 1}`)];
  });
}

/** Appends `value` as one line of `file`, its folder made first. */
const appendLine = (file: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
};

/** What the person wrote, oldest first. */
export const readOutbox = (dir: string): OutboxEntry[] => linesOf(outboxFile(dir), OutboxSchema).map((e) => ({ ...e }));

/** The keeper's marks of what it delivered, in the order it delivered them. */
export const readDelivered = (dir: string): DeliveredMark[] => linesOf(deliveredFile(dir), DeliveredSchema).map((m) => ({ ...m }));

/** The person's read mark, or undefined where they never set one. Refused (`Invalid`) where the file does not read as one. */
export function readReadMark(dir: string): ReadMark | undefined {
  const text = textOf(readMarkFile(dir));
  if (text === undefined) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = undefined;
  }
  return { ...decoded(ReadSchema, raw, readMarkFile(dir)) };
}

/** Appends what the person wrote to the outbox. The person's verb is its one writer. */
export const appendOutbox = (dir: string, entry: OutboxEntry): void => appendLine(outboxFile(dir), entry);

/** Appends the keeper's mark of an entry delivered. The delivery is its one writer. */
export const appendDelivered = (dir: string, mark: DeliveredMark): void => appendLine(deliveredFile(dir), mark);

/** Writes the person's read mark whole, through a hidden file renamed over it. The person's verb is its one writer. */
export function writeReadMark(dir: string, mark: ReadMark): void {
  fs.mkdirSync(chatDir(dir), { recursive: true });
  const hidden = path.join(chatDir(dir), `.read.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(mark)}\n`);
  fs.renameSync(hidden, readMarkFile(dir));
}
