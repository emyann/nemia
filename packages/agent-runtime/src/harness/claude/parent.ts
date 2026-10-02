/**
 * The last StructuredOutput call a resumed `claude --bg` session's parent made, recorded by the session's spawn under `root`: the
 * call's `tool_use` id, or `null` for a parent that made none and a session resumed from nothing. A resumed transcript carries its
 * parent's calls under the ids the parent made them with, and each call the session makes gets a new one, so a statement with this id
 * is inherited and one with another is the session's own. No record where the spawn could not tell — a parent whose transcript is not
 * found or does not decode, a call with no id — and then the statement's time is all there is to judge it by.
 *
 * One writer, the spawn (`bg.ts`), before `claude` runs, through a file of its own renamed into place; read fresh on every look by
 * every process that looks, and never kept between passes.
 */
import { Schema } from 'effect';
import fs from 'node:fs';
import path from 'node:path';
import { readText } from '../../core/engine/tally.ts';

/** What a spawn records of its session's parent: the id of the parent's last StructuredOutput call, or `null` for none. */
export type ParentCall = { lastCall: string | null };

const isParentCall = Schema.is(Schema.Struct({ lastCall: Schema.NullOr(Schema.String) }));

/** Where the parent's last call of the session under `name` is recorded under `root`, its name folded as an MCP config's is. */
export const parentFileOf = (root: string, name: string): string =>
  path.join(root, 'parent', `${name.replace(/[^a-zA-Z0-9]+/g, '_')}.json`);

/**
 * The parent's last call of a session resumed from `resumeFrom`, recorded in `file`: `null` with no `resumeFrom`, else what `read`
 * says of that session. Where `read` answers nothing or throws, `file` is cleared instead, so a spawn under a name never leaves
 * another attempt's parent to judge by. Throws when `file` cannot be written or cleared.
 */
export const recordParent = async (
  file: string,
  resumeFrom: string | undefined,
  read: (sessionId: string) => Promise<ParentCall | undefined>,
): Promise<void> => {
  const parent = resumeFrom === undefined ? { lastCall: null } : await read(resumeFrom).catch(() => undefined);
  if (!parent) {
    fs.rmSync(file, { force: true });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const own = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(own, JSON.stringify({ lastCall: parent.lastCall }));
  fs.renameSync(own, file);
};

/** What `file` records of a session's parent, or `undefined` when it is not there, not JSON, or of another shape. */
export const parentOf = (file: string): ParentCall | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readText(file));
  } catch {
    return undefined;
  }
  return isParentCall(parsed) ? { lastCall: parsed.lastCall } : undefined;
};

/**
 * Whose a statement with the call id `id` is, by the parent's last call `parent`: `inherited` with that id, `own` with another,
 * and `timed` with no record or no id, where only its time can tell.
 */
export const whoseCall = (id: string | undefined, parent: ParentCall | undefined): 'inherited' | 'own' | 'timed' =>
  parent === undefined || id === undefined ? 'timed' : id === parent.lastCall ? 'inherited' : 'own';
