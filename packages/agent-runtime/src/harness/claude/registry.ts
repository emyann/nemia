/**
 * Claude Code's registry as it enters the runtime: the rows `claude agents --all --json` prints, decoded by `RegistryRowSchema`
 * where they are read. Only a row of ours is decoded — an object named `ae/` with its own `state` key; a row with no `state` is an
 * interactive session, and another program's row, or an element that is no object, is skipped unread.
 *
 * The listing is refused as a whole when it is no JSON array, or when one row of ours does not decode: the registry is another
 * program's, shared by every session, and a row it lists otherwise says its format moved under every row. A refused listing is
 * no absence: whoever reads it holds each background session it expected as unread. A row's `state` is said in A2A's names by
 * `claudeStateOf`.
 */
import { Result, Schema, SchemaIssue } from 'effect';
import type { SessionState } from '../../core/index.ts';

const orNone = <S extends Schema.Top>(s: S) => Schema.optional(Schema.NullOr(s));

/**
 * A row of ours, in what the runtime reads of it; every other key is not checked. `null` on an optional field is read as absent.
 * A field the runtime starts reading is added here.
 */
export const RegistryRowSchema = Schema.Struct({
  name: Schema.String,
  sessionId: Schema.NonEmptyString,
  state: Schema.NonEmptyString,
  status: orNone(Schema.String),
  waitingFor: orNone(Schema.String),
  startedAt: orNone(Schema.Finite),
  pid: orNone(Schema.Int.check(Schema.isGreaterThan(0))),
});

/** A row of ours as `RegistryRowSchema` decodes it. */
export type RegistryRow = typeof RegistryRowSchema.Type;

const decodeRow = Schema.decodeUnknownResult(RegistryRowSchema);

const formatter = SchemaIssue.makeFormatterStandardSchemaV1();

const COMMAND = '`claude agents --all --json`';

const UNREAD =
  'Every background session of ours stays unread, neither there nor gone, until the listing decodes: run a Claude Code whose' +
  ' listing this runtime reads, or a runtime whose `RegistryRowSchema` (`harness/claude/registry.ts`) reads this one.';

/** `value` as JSON, cut to 60 characters. */
const shown = (value: unknown): string => {
  const text = JSON.stringify(value) ?? 'undefined';
  return text.length > 60 ? `${text.slice(0, 60)}…` : text;
};

type Ours = Record<string, unknown> & { name: string };

const isOurs = (row: unknown): row is Ours =>
  typeof row === 'object' &&
  row !== null &&
  typeof (row as { name?: unknown }).name === 'string' &&
  (row as { name: string }).name.startsWith('ae/') &&
  Object.hasOwn(row, 'state');

/** What Claude Code lists in each field `RegistryRowSchema` reads, in words. */
const LISTS: Record<string, string> = {
  name: 'a string',
  sessionId: 'a non-empty string',
  state: 'a non-empty string',
  status: 'a string, or nothing',
  waitingFor: 'a string, or nothing',
  startedAt: 'a finite number, or nothing',
  pid: 'an integer greater than 0, or nothing',
};

/** The first field of `row` the schema refused, what is there or that nothing is, and what Claude Code lists there, in words. */
const rowWords = (row: Ours, error: Schema.SchemaError): string => {
  const [first] = formatter(error.issue).issues;
  const key = String((first?.path ?? []).map((p) => (typeof p === 'object' && p !== null && 'key' in p ? p.key : p))[0]);
  const found = first?.message === 'Missing key' ? 'is missing' : `is ${shown(row[key])}`;
  return `${COMMAND} lists \`${row.name}\`, a session of ours, and its \`${key}\` ${found}, where Claude Code lists ${LISTS[key] ?? 'another value'}. ${UNREAD}`;
};

/**
 * The rows of ours in what `claude agents --all --json` printed, decoded, in the order it lists them; or why the listing is
 * refused (`wrong`, a message that names the row, its field and the fix, and quotes at most 60 characters of what it found).
 */
export const registryOf = (out: string): { rows: RegistryRow[] } | { wrong: string } => {
  let listed: unknown;
  try {
    listed = JSON.parse(out);
  } catch {
    listed = out;
  }
  if (!Array.isArray(listed)) return { wrong: `${COMMAND} printed no JSON list of sessions: it reads ${shown(out.trim())}. ${UNREAD}` };
  const rows: RegistryRow[] = [];
  for (const row of listed.filter(isOurs)) {
    const decoded = decodeRow(row);
    if (Result.isFailure(decoded)) return { wrong: rowWords(row, decoded.failure) };
    rows.push(decoded.success);
  }
  return { rows };
};

/**
 * A `waitingFor` that names signing in, in Claude Code's words: `auth`, `authenticate` and its forms, `log in`, `login`,
 * `sign in`, `sign-in` — whole words only, so `author`, `authority` and `oauth-proxy` are not it. `authorize` and
 * `authorization` are left out on purpose: a tool call authorised is a permission, which a person gives with words
 * (`input-required`), not an identity. Written from words, not from a wait Claude Code is known to word so: one worded
 * otherwise reads `input-required` — a wait on a person all the same.
 */
export const AUTH_WAIT = /\b(?:auth|authenticat(?:e|es|ed|ing|ion)|log[ -]?in|sign[ -]?in)\b/i;

/**
 * A `claude agents --json` row's `state`, in A2A's names — translated here, once, as the registry is parsed:
 *
 *   working  → working         at work; `status` says whether it computes (`busy`)
 *   blocked  → auth-required   when what it waits for names signing in (`AUTH_WAIT`), since that is A2A's word for it
 *            → input-required  otherwise: a permission prompt, a question — a person's words
 *   done     → completed       ended on its own
 *   failed   → failed
 *   stopped  → canceled        stopped under it (`claude stop`, or a person at its side)
 *
 * Any other word is `failed`: a state this runner has no reading of is no session it can wait on, and a pass then ends the
 * attempt as the harness's failure, writing the journal's word, never the harness's raw one.
 */
export const claudeStateOf = (word: string, waitingFor?: string): SessionState => {
  switch (word) {
    case 'working':
      return 'working';
    case 'blocked':
      return waitingFor !== undefined && AUTH_WAIT.test(waitingFor) ? 'auth-required' : 'input-required';
    case 'done':
      return 'completed';
    case 'stopped':
      return 'canceled';
    default:
      return 'failed';
  }
};
