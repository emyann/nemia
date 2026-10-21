/**
 * A chat's own files, in the folder `chat/` of the folder it is kept in: what the person wrote (`outbox.jsonl`, appended by the
 * person's verb alone), the keeper's marks of what it delivered (`delivered.jsonl`, appended by the delivery alone), the turns the
 * person stopped (`stops.jsonl`, appended by `chatStop` alone), and the person's
 * read mark (`read.json`, written whole by the person's verb alone), the questions of hers the keeper saw waiting on the person
 * (`asks.jsonl`, appended by the keeper's record alone), their answers to them (`answers.jsonl`, appended by the person's verb alone)
 * the keeper's marks of each answer owed no longer (`answers-done.jsonl`, appended by the delivery alone) and its marks of an ask
 * whose call is gone or asking again (`asks-closed.jsonl`, appended by the keeper's record alone). One writer each,
 * composed on read; none is ever rewritten but the read mark, which its one writer replaces.
 *
 * Beneath the controllers: it imports no runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Result, Schema } from 'effect';
import { Invalid } from '../refusal/refusal.ts';
import type { AnswerMark, Ask, AskAnswer, AskClose, DeliveredMark, OutboxEntry, ReadMark, SourceStop } from './chat.ts';

/** The chat's folder within `dir`. */
export const chatDir = (dir: string): string => path.join(dir, 'chat');

/** The person's words, one entry a line. */
export const outboxFile = (dir: string): string => path.join(chatDir(dir), 'outbox.jsonl');

/** The keeper's marks of what it delivered, one a line. */
export const deliveredFile = (dir: string): string => path.join(chatDir(dir), 'delivered.jsonl');

/** The turns the person stopped, one a line. */
export const stopsFile = (dir: string): string => path.join(chatDir(dir), 'stops.jsonl');

/** The person's read mark. */
export const readMarkFile = (dir: string): string => path.join(chatDir(dir), 'read.json');

/** The questions of hers the keeper saw waiting on the person, one ask a line. */
export const asksFile = (dir: string): string => path.join(chatDir(dir), 'asks.jsonl');

/** The person's answers to them, one a line. */
export const answersFile = (dir: string): string => path.join(chatDir(dir), 'answers.jsonl');

/** The keeper's marks of the answers owed no longer, one a line. */
export const answersDoneFile = (dir: string): string => path.join(chatDir(dir), 'answers-done.jsonl');

/**
 * The keeper's marks of an ask whose call is no longer waiting on the person (`cut`), and of one whose words a call of hers is
 * asking again (`again`), one a line, the latest of an ask's marks the one that holds. An ask is never rewritten, so what became of
 * its call is a mark of its own.
 */
export const asksClosedFile = (dir: string): string => path.join(chatDir(dir), 'asks-closed.jsonl');

const Moment = Schema.String.check(Schema.isNonEmpty());

const OutboxSchema = Schema.Struct({ id: Moment, at: Moment, text: Schema.String });
const DeliveredSchema = Schema.Struct({ id: Moment, said: Moment, attempt: Schema.Finite });
const ReadSchema = Schema.Struct({ through: Moment, at: Moment });

const OptionSchema = Schema.Struct({ label: Schema.String, description: Schema.String, recommended: Schema.Boolean });

const QuestionSchema = Schema.Struct({
  question: Moment,
  header: Schema.String,
  options: Schema.mutable(Schema.Array(OptionSchema)),
  multiSelect: Schema.Boolean,
});

const AskSchema = Schema.Struct({ id: Moment, at: Moment, questions: Schema.mutable(Schema.Array(QuestionSchema)) });
const AnswerSchema = Schema.Struct({ id: Moment, at: Moment, answers: Schema.Record(Schema.String, Schema.String) });
const AnswerDoneSchema = Schema.Struct({ id: Moment, how: Schema.Literals(['return', 'words', 'mark']), at: Moment });
const AskCloseSchema = Schema.Struct({ id: Moment, how: Schema.Literals(['cut', 'again']), at: Moment, call: Schema.optionalKey(Moment) });

/** One turn the person stopped: when they stopped it, and which attempt of the task was answering. */
export const StopSchema = Schema.Struct({ at: Moment, attempt: Schema.Finite });

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

/** The turns the person stopped, oldest first. */
export const readStops = (dir: string): SourceStop[] => linesOf(stopsFile(dir), StopSchema).map((s) => ({ ...s }));

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

/** The questions of hers the keeper saw waiting, oldest first. */
export const readAsks = (dir: string): Ask[] => linesOf(asksFile(dir), AskSchema).map((a) => ({ ...a }));

/** The person's answers to them, oldest first. */
export const readAnswers = (dir: string): AskAnswer[] => linesOf(answersFile(dir), AnswerSchema).map((a) => ({ ...a }));

/** The keeper's marks of the answers owed no longer, in the order it made them. */
export const readAnswersDone = (dir: string): AnswerMark[] => linesOf(answersDoneFile(dir), AnswerDoneSchema).map((m) => ({ ...m }));

/** The keeper's marks of what became of each ask's call, in the order it made them: the last of an ask's is what holds. */
export const readAsksClosed = (dir: string): AskClose[] => linesOf(asksClosedFile(dir), AskCloseSchema).map((m) => ({ ...m }));

/** Appends a question of hers the keeper saw waiting. The keeper's record is its one writer. */
export const appendAsk = (dir: string, ask: Ask): void => appendLine(asksFile(dir), ask);

/** Appends the person's answer to one. The person's verb is its one writer. */
export const appendAnswer = (dir: string, answer: AskAnswer): void => appendLine(answersFile(dir), answer);

/** Appends the keeper's mark of an answer owed no longer. The delivery is its one writer. */
export const appendAnswerDone = (dir: string, mark: AnswerMark): void => appendLine(answersDoneFile(dir), mark);

/** One mark of what became of an ask's call, appended by the keeper's record alone. */
export const appendAskClosed = (dir: string, mark: AskClose): void => appendLine(asksClosedFile(dir), mark);

/** Appends what the person wrote to the outbox. The person's verb is its one writer. */
export const appendOutbox = (dir: string, entry: OutboxEntry): void => appendLine(outboxFile(dir), entry);

/** Appends the keeper's mark of an entry delivered. The delivery is its one writer. */
export const appendDelivered = (dir: string, mark: DeliveredMark): void => appendLine(deliveredFile(dir), mark);

/** Appends a turn the person stopped. `chatStop` is its one writer. */
export const appendStop = (dir: string, stop: SourceStop): void => appendLine(stopsFile(dir), stop);

/** Writes the person's read mark whole, through a hidden file renamed over it. The person's verb is its one writer. */
export function writeReadMark(dir: string, mark: ReadMark): void {
  fs.mkdirSync(chatDir(dir), { recursive: true });
  const hidden = path.join(chatDir(dir), `.read.json.${process.pid}`);
  fs.writeFileSync(hidden, `${JSON.stringify(mark)}\n`);
  fs.renameSync(hidden, readMarkFile(dir));
}
