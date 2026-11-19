/**
 * A chat's own files, in the folder `chat/` of the folder it is kept in: what the person wrote (`outbox.jsonl`, appended by the
 * person's verb alone), the keeper's marks of what it delivered (`delivered.jsonl`, appended by the delivery alone), the turns the
 * person stopped (`stops.jsonl`, appended by `chatStop` alone), and the person's
 * read mark (`read.json`, written whole by the person's verb alone), the questions of hers the keeper saw waiting on the person
 * (`asks.jsonl`, appended by the keeper's record alone), their answers to them (`answers.jsonl`, appended by the person's verb alone)
 * the keeper's marks of each answer owed no longer (`answers-done.jsonl`, appended by the delivery alone) and its marks of an ask
 * whose call is gone or asking again (`asks-closed.jsonl`, appended by the keeper's record alone). One writer each, composed on read;
 * none is ever rewritten but the read mark, which its one writer replaces. The names the person once allowed an agent to speak under
 * (`speakers.json`) are read no more, an agent speaking with a token of its own: the file is left where it is, unread.
 *
 * Beneath the controllers: it imports no runtime.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Option, Schema } from 'effect';
import { Invalid } from '../refusal/refusal.ts';
import type { AnswerMark, Ask, AskAnswer, AskClose, DeliveredMark, OutboxEntry, ReadMark, SourceStop } from './chat.ts';
import { writeWhole } from '../whole-file/whole-file.store.ts';

/**
 * The chat's folder within `dir`.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const chatDir = (dir: string) => path.join(dir, 'chat');

/**
 * The person's words, one entry a line.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const outboxFile = (dir: string) => path.join(chatDir(dir), 'outbox.jsonl');

/**
 * The keeper's marks of what it delivered, one a line.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const deliveredFile = (dir: string) => path.join(chatDir(dir), 'delivered.jsonl');

/**
 * The turns the person stopped, one a line.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const stopsFile = (dir: string) => path.join(chatDir(dir), 'stops.jsonl');

/**
 * The person's read mark.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readMarkFile = (dir: string) => path.join(chatDir(dir), 'read.json');

/**
 * The asks the keeper saw waiting on the person — her questions and her session's permissions — one ask a line.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const asksFile = (dir: string) => path.join(chatDir(dir), 'asks.jsonl');

/**
 * The person's answers to them, one a line.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const answersFile = (dir: string) => path.join(chatDir(dir), 'answers.jsonl');

/**
 * The keeper's marks of the answers owed no longer, one a line.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const answersDoneFile = (dir: string) => path.join(chatDir(dir), 'answers-done.jsonl');

/**
 * The keeper's marks of an ask whose call is no longer waiting on the person (`cut`), and of one whose words a call of hers is
 * asking again (`again`), one a line, the latest of an ask's marks the one that holds. An ask is never rewritten, so what became of
 * its call is a mark of its own.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const asksClosedFile = (dir: string) => path.join(chatDir(dir), 'asks-closed.jsonl');

const Moment = Schema.String.check(Schema.isNonEmpty());

/** Who wrote an entry: a line written with none is the person's. */
const SpeakerSchema = Schema.Union([
  Schema.Struct({ kind: Schema.Literal('agent'), name: Moment }),
  Schema.Struct({ kind: Schema.Literal('person') }),
]);
const OutboxSchema = Schema.Struct({ id: Moment, at: Moment, text: Schema.String, from: Schema.optionalKey(SpeakerSchema) });
const DeliveredSchema = Schema.Struct({ id: Moment, said: Moment, attempt: Schema.Finite });
const ReadSchema = Schema.Struct({ through: Moment, at: Moment });

const OptionSchema = Schema.Struct({ label: Schema.String, description: Schema.String, recommended: Schema.Boolean });

const QuestionSchema = Schema.Struct({
  question: Moment,
  header: Schema.String,
  options: Schema.mutable(Schema.Array(OptionSchema)),
  multiSelect: Schema.Boolean,
});

const PermissionSchema = Schema.Struct({
  tool: Schema.String,
  command: Schema.optionalKey(Schema.String),
  title: Schema.optionalKey(Schema.String),
  displayName: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  decisionReason: Schema.optionalKey(Schema.String),
  blockedPath: Schema.optionalKey(Schema.String),
  always: Schema.Boolean,
  defaultToNo: Schema.Boolean,
});

/** An ask's line: a line that says no kind is a question, as every line written before a permission was an ask. */
const AskSchema = Schema.Struct({
  id: Moment,
  at: Moment,
  kind: Schema.optionalKey(Schema.Literals(['question', 'permission'])),
  questions: Schema.mutable(Schema.Array(QuestionSchema)),
  permission: Schema.optionalKey(PermissionSchema),
});
const AnswerSchema = Schema.Struct({ id: Moment, at: Moment, answers: Schema.Record(Schema.String, Schema.String) });
const AnswerDoneSchema = Schema.Struct({ id: Moment, how: Schema.Literals(['return', 'words', 'mark']), at: Moment });
const AskCloseSchema = Schema.Struct({ id: Moment, how: Schema.Literals(['cut', 'again']), at: Moment, call: Schema.optionalKey(Moment) });

/** One turn the person stopped: when they stopped it, which attempt was answering, and of which task (absent on an older line). */
export const StopSchema = Schema.Struct({ at: Moment, attempt: Schema.Finite, task: Schema.optionalKey(Schema.String) });

/** The text of `file`, or undefined where there is none. */
const textOf = (file: string) => {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
};

/** The refusal of what `where` holds, which does not read: it names the place, and that the file is the chat's. */
const unreadLine = (where: string) =>
  new Invalid({ message: `${where} is not a line of the chat's record: move the file aside and the chat reads without it.` });

/**
 * The lines of a JSONL file, each decoded by `schema`: none where there is no file, and a last line not yet ended left out, as an append
 * still being written. Refused (`Invalid`) for a line that does not decode, naming the file and the line.
 */
function linesOf<S extends Schema.Decoder<unknown>>(file: string, schema: S) {
  const text = textOf(file);
  if (text === undefined) return [];
  const lines = text.split('\n').slice(0, -1);
  return lines.flatMap((line, i) => {
    if (line.trim() === '') return [];
    const read = Schema.decodeUnknownOption(Schema.fromJsonString(schema))(line);
    if (Option.isNone(read)) throw unreadLine(`${file}:${i + 1}`);
    return [read.value];
  });
}

/** Appends `value` as one line of `file`, its folder made first. */
const appendLine = (file: string, value: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
};

/**
 * What was written to the chat, oldest first: an entry carries who wrote it where an agent did.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readOutbox = (dir: string) =>
  linesOf(outboxFile(dir), OutboxSchema).map<OutboxEntry>(({ from, ...e }) =>
    from === undefined ? { ...e } : { ...e, from: { ...from } },
  );

/**
 * The keeper's marks of what it delivered, in the order it delivered them.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readDelivered = (dir: string) => linesOf(deliveredFile(dir), DeliveredSchema).map((m) => ({ ...m }));

/**
 * The turns the person stopped, oldest first.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readStops = (dir: string) => linesOf(stopsFile(dir), StopSchema).map((s) => ({ ...s }));

/**
 * The person's read mark, or undefined where they never set one. Refused (`Invalid`) where the file does not read as one.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export function readReadMark(dir: string) {
  const text = textOf(readMarkFile(dir));
  if (text === undefined) return undefined;
  const read = Schema.decodeUnknownOption(Schema.fromJsonString(ReadSchema))(text);
  if (Option.isNone(read)) throw unreadLine(readMarkFile(dir));
  return { ...read.value };
}

/**
 * The asks the keeper saw waiting, oldest first: a permission where its line says so and carries the call's facts, a question
 * otherwise, which is how every line written before a permission was an ask reads.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readAsks = (dir: string) =>
  linesOf(asksFile(dir), AskSchema).map(({ kind, permission, ...a }) =>
    kind === 'permission' && permission !== undefined ? { ...a, kind, permission: { ...permission } } : { ...a, kind: 'question' },
  ) satisfies Ask[];

/**
 * The person's answers to them, oldest first.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readAnswers = (dir: string) => linesOf(answersFile(dir), AnswerSchema).map((a) => ({ ...a }));

/**
 * The keeper's marks of the answers owed no longer, in the order it made them.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readAnswersDone = (dir: string) => linesOf(answersDoneFile(dir), AnswerDoneSchema).map((m) => ({ ...m }));

/**
 * The keeper's marks of what became of each ask's call, in the order it made them: the last of an ask's is what holds.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 */
export const readAsksClosed = (dir: string) => linesOf(asksClosedFile(dir), AskCloseSchema).map((m) => ({ ...m }));

/**
 * Appends a question of hers the keeper saw waiting. The keeper's record is its one writer.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param ask The ask, a question or a permission, as the keeper saw it.
 */
export const appendAsk = (dir: string, ask: Ask) => appendLine(asksFile(dir), ask);

/**
 * Appends the person's answer to one. The person's verb is its one writer.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param answer The person's answer, by the ask's id.
 */
export const appendAnswer = (dir: string, answer: AskAnswer) => appendLine(answersFile(dir), answer);

/**
 * Appends the keeper's mark of an answer owed no longer. The delivery is its one writer.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param mark The mark: the ask's id, how the answer was delivered, and when.
 */
export const appendAnswerDone = (dir: string, mark: AnswerMark) => appendLine(answersDoneFile(dir), mark);

/**
 * One mark of what became of an ask's call, appended by the keeper's record alone.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param mark The mark: the ask's id, `cut` or `again`, and when.
 */
export const appendAskClosed = (dir: string, mark: AskClose) => appendLine(asksClosedFile(dir), mark);

/**
 * Appends what was written to the chat to the outbox. `chatSay` is its one writer.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param entry The entry: its id, when, the text, and who wrote it where an agent did.
 */
export const appendOutbox = (dir: string, entry: OutboxEntry) => appendLine(outboxFile(dir), entry);

/**
 * Appends the keeper's mark of an entry delivered. The delivery is its one writer.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param mark The mark: the entry's id, when it was delivered, and to which attempt.
 */
export const appendDelivered = (dir: string, mark: DeliveredMark) => appendLine(deliveredFile(dir), mark);

/**
 * Appends a turn the person stopped. `chatStop` is its one writer.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param stop When the person stopped the turn, and which attempt was answering.
 */
export const appendStop = (dir: string, stop: SourceStop) => appendLine(stopsFile(dir), stop);

/**
 * Writes the person's read mark whole, through a hidden file renamed over it. The person's verb is its one writer.
 * @param dir The folder the chat is kept in, which holds its folder `chat/`.
 * @param mark The newest entry the person read through, and when.
 */
export function writeReadMark(dir: string, mark: ReadMark) {
  fs.mkdirSync(chatDir(dir), { recursive: true });
  writeWhole(readMarkFile(dir), `${JSON.stringify(mark)}\n`);
}
