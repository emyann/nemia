/**
 * A factory made from a template, on disk, beside its file: `$WF_ROOT/factories/<name>/tree/`, the folder it runs from, today's format
 * (`treeDir`), the person's once seeded; `applied/`, the template as last rendered, read-only, the base an upgrade will merge from
 * (`appliedDir`); and `status.json`, what the controller last observed (`readStatus`, `writeStatus`). The tree's wiring, `factory.json`, is
 * read and written whole here (`readTreeWiring`, `writeTreeWiring`) for the factory's verbs; a folder is staged whole beside its place and
 * renamed onto it, so no reader sees half of one (`stageFolder`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { Result, Schema } from 'effect';
import { firstRefusal, HOME } from '../record/record.store.ts';

/** The folder the store keeps a factory's own files in, beside its `<name>.json`. */
const folderOf = (name: string): string => path.join(HOME, 'factories', name);

/** The folder a templated factory runs from: today's format, seeded once from its base, then the person's. */
export const treeDir = (name: string): string => path.join(folderOf(name), 'tree');

/** The template as the controller last rendered it into the factory: read-only, the base of an upgrade's merge. */
export const appliedDir = (name: string): string => path.join(folderOf(name), 'applied');

/** What the controller last observed of a templated factory, written by it alone. */
export const statusFile = (name: string): string => path.join(folderOf(name), 'status.json');

/** One file of a folder to stage: its path in it, its bytes, and its mode where it keeps one (an executable script of a skill). */
export type Entry = { path: string; bytes: Buffer; mode?: number };

/** The wiring a templated factory's tree holds in `factory.json`: its workflows and its hires; a key a later `nemia` writes is kept. */
const TreeWiringSchema = Schema.StructWithRest(
  Schema.Struct({ workflows: Schema.Array(Schema.String), hires: Schema.Record(Schema.String, Schema.String) }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A tree's wiring as it reads. */
export type TreeWiring = typeof TreeWiringSchema.Type;

/** The file of a tree's wiring. */
const wiringFile = (name: string): string => path.join(treeDir(name), 'factory.json');

/**
 * The wiring of the factory `name`'s tree: what its `factory.json` holds, none (`absent`) while the tree is not rendered, or why it does
 * not read (`error`), naming the fix.
 */
export function readTreeWiring(name: string): { wiring: TreeWiring } | { absent: true } | { error: string } {
  const file = wiringFile(name);
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { absent: true };
    return { error: `${file} is not JSON (${(err as Error).message}): fix it by hand, as {"workflows": [...], "hires": {...}}.` };
  }
  const decoded = Schema.decodeUnknownResult(TreeWiringSchema)(raw);
  if (Result.isSuccess(decoded)) return { wiring: decoded.success };
  const { path: where, words } = firstRefusal(raw, decoded.failure);
  const field = where.length ? `\`${where.map(String).join('.')}\`` : 'the whole';
  return { error: `${file} does not read as a tree's wiring: ${field} ${words}. Fix it by hand.` };
}

/** `content` written whole onto `file`: to a hidden file beside it first, then renamed onto it, so no reader sees half a file. */
function writeWhole(file: string, content: string): void {
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    fs.writeFileSync(hidden, content);
    fs.renameSync(hidden, file);
  } finally {
    fs.rmSync(hidden, { force: true });
  }
}

/** The tree's wiring of the factory `name` written whole, `workflows` kept sorted. */
export const writeTreeWiring = (name: string, wiring: TreeWiring): void =>
  writeWhole(wiringFile(name), `${JSON.stringify({ ...wiring, workflows: [...wiring.workflows].sort() }, null, 2)}\n`);

/** A condition of a templated factory, as Kubernetes words one: its type, `True` or `False`, a reason in one word, and a sentence. */
const ConditionSchema = Schema.Struct({
  type: Schema.String,
  status: Schema.Literals(['True', 'False']),
  reason: Schema.String,
  message: Schema.String,
});

/**
 * What the controller observed of a templated factory: the template's version its base holds, the base's digest, the parameters it was
 * rendered with, and its conditions, `Applied` and `ConflictsPending`; a key a later `nemia` writes is kept.
 */
const StatusSchema = Schema.StructWithRest(
  Schema.Struct({
    version: Schema.NullOr(Schema.String),
    digest: Schema.NullOr(Schema.String),
    params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
    conditions: Schema.Array(ConditionSchema),
  }),
  [Schema.Record(Schema.String, Schema.Unknown)],
);

/** A templated factory's status. */
export type Status = typeof StatusSchema.Type;

/** A condition of a templated factory's status. */
export type Condition = typeof ConditionSchema.Type;

/** The status of the factory `name`, or none where the controller wrote none yet or it does not read: the next pass writes it again. */
export function readStatus(name: string): Status | undefined {
  try {
    const decoded = Schema.decodeUnknownResult(StatusSchema)(JSON.parse(fs.readFileSync(statusFile(name), 'utf8')));
    return Result.isSuccess(decoded) ? decoded.success : undefined;
  } catch {
    return undefined;
  }
}

/** The status of the factory `name` written whole, only where it differs from what is there; whether it was written. */
export function writeStatus(name: string, status: Status): boolean {
  const text = `${JSON.stringify(status, null, 2)}\n`;
  const file = statusFile(name);
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeWhole(file, text);
  return true;
}

/** The sha256 of `entries`: each path and its bytes, in the order of their paths, so one folder digests the same wherever it is. */
export function digestOf(entries: readonly Entry[]): string {
  const hash = createHash('sha256');
  for (const entry of [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    hash.update(`${entry.path}\0${entry.bytes.length}\0`);
    hash.update(entry.bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

/** Every file of the folder `dir`, by its path in it with `/`, its bytes and its mode; none where there is no folder. A link is skipped. */
export function entriesIn(dir: string, under = ''): Entry[] {
  let names: string[];
  try {
    names = fs.readdirSync(path.join(dir, under)).sort();
  } catch {
    return [];
  }
  return names.flatMap((name) => {
    const rel = under ? `${under}/${name}` : name;
    const stat = fs.lstatSync(path.join(dir, rel));
    if (stat.isDirectory()) return entriesIn(dir, rel);
    if (!stat.isFile()) return [];
    return [{ path: rel, bytes: fs.readFileSync(path.join(dir, rel)), mode: stat.mode & 0o777 }];
  });
}

/**
 * The folder `dir` made of `entries`, staged whole in a hidden folder beside it and renamed onto it, each file with its mode, made
 * read-only where `readOnly`; false, nothing changed, where `dir` is there already, so a pass that lost the race leaves the winner's.
 */
export function stageFolder(dir: string, entries: readonly Entry[], readOnly: boolean): boolean {
  if (fs.existsSync(dir)) return false;
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const hidden = path.join(path.dirname(dir), `.${path.basename(dir)}.${process.pid}.${randomBytes(4).toString('hex')}`);
  try {
    for (const entry of entries) {
      const at = path.join(hidden, entry.path);
      fs.mkdirSync(path.dirname(at), { recursive: true });
      fs.writeFileSync(at, entry.bytes);
      const mode = entry.mode ?? 0o644;
      fs.chmodSync(at, readOnly ? mode & 0o555 : mode | 0o200);
    }
    fs.mkdirSync(hidden, { recursive: true });
    fs.renameSync(hidden, dir);
    return true;
  } catch (err) {
    if (fs.existsSync(dir)) return false;
    throw err;
  } finally {
    fs.rmSync(hidden, { recursive: true, force: true });
  }
}
