/**
 * A template packed as one archive, and unpacked: a ustar tar, gzipped, of one top folder named for the template and a regular file
 * entry per file of it, sorted by path in code-unit order, each with its mode and nothing of the machine it was packed on (uid, gid
 * and mtime 0). Its digest is of the content, the tar before gzip, so the same files give the same digest whatever zlib packed them.
 * Unpacking reads what pack writes and plain files from a hand-made tar, and refuses every entry that is not one: a path that leaves
 * the folder, a link, a device, an extended header, a name given twice.
 */
import { createHash } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { SKILL_NAME } from '../keys/index.ts';
import { Invalid } from '../refusal/refusal.ts';

/** A file of a template's tree: its path from the template's folder with `/` between parts, its mode's permission bits, its bytes. */
export type TreeFile = { path: string; mode: number; bytes: Uint8Array };

/** The largest tar, in bytes, an archive unpacks to or is packed from: 256 MiB, so a gzip bomb stops at the bound. */
export const ARCHIVE_LIMIT = 256 * 1024 * 1024;

/** A tar's block, in bytes. */
const BLOCK = 512;

/** What a refused entry says: the entry as the archive names it, and why. */
type EntryRefusal = { entry: string; why: string };

/** The bytes of `text` in UTF-8. */
const byteLength = (text: string): number => Buffer.byteLength(text, 'utf8');

/** `path` cut into ustar's prefix (155 bytes) and name (100 bytes) at a `/`, the shortest prefix that fits; or null where none does. */
function splitPath(path: string): { prefix: string; name: string } | null {
  if (byteLength(path) <= 100) return { prefix: '', name: path };
  for (let at = path.indexOf('/'); at > 0; at = path.indexOf('/', at + 1)) {
    const prefix = path.slice(0, at);
    const name = path.slice(at + 1);
    if (byteLength(prefix) > 155) return null;
    if (name && byteLength(name) <= 100) return { prefix, name };
  }
  return null;
}

/** `value` written in octal into `field` bytes of `block` at `at`, zero-padded, ending with a NUL. */
function octal(block: Buffer, at: number, field: number, value: number): void {
  block.write(`${value.toString(8).padStart(field - 1, '0')}\0`, at, field, 'ascii');
}

/** The sum of a header's bytes, its checksum field counted as eight spaces. */
function checksumOf(block: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += i >= 148 && i < 156 ? 0x20 : block[i];
  return sum;
}

/** The ustar header of a regular file at `path`, of `size` bytes and the permission bits of `mode`. */
function header(path: { prefix: string; name: string }, mode: number, size: number): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(path.name, 0, 100, 'utf8');
  octal(block, 100, 8, mode & 0o777);
  octal(block, 108, 8, 0);
  octal(block, 116, 8, 0);
  octal(block, 124, 12, size);
  octal(block, 136, 12, 0);
  block.write('0', 156, 1, 'ascii');
  block.write('ustar\u000000', 257, 8, 'ascii');
  block.write(path.prefix, 345, 155, 'utf8');
  block.write(`${checksumOf(block).toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return block;
}

/** The files of `files` whose path under the folder `name` no ustar header holds: a part over 100 bytes, or a path that splits nowhere. */
export function pathRefusals(name: string, files: readonly TreeFile[]): Array<{ file: string; message: string }> {
  return files
    .filter((file) => splitPath(`${name}/${file.path}`) === null)
    .map((file) => ({
      file: file.path,
      message: `${name}/${file.path} is longer than an archive holds: 100 bytes after its last / that fits, 155 before it. Shorten it.`,
    }));
}

/** The tar of `files` under the folder `name`: sorted by path in code-unit order, each a regular file, two zero blocks at its end. */
function tarOf(name: string, files: readonly TreeFile[]): Buffer {
  const refused = pathRefusals(name, files);
  if (refused.length)
    throw new Invalid({ message: `${name} was not packed:\n${refused.map((r) => `  ${r.file}: ${r.message}`).join('\n')}` });
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const parts = sorted.flatMap((file) => {
    const split = splitPath(`${name}/${file.path}`) ?? { prefix: '', name: file.path };
    const padding = (BLOCK - (file.bytes.length % BLOCK)) % BLOCK;
    return [header(split, file.mode, file.bytes.length), Buffer.from(file.bytes), Buffer.alloc(padding)];
  });
  return Buffer.concat([...parts, Buffer.alloc(2 * BLOCK)]);
}

/** The digest of a tar: `sha256:` and its hex. */
const digestOfTar = (tar: Uint8Array): string => `sha256:${createHash('sha256').update(tar).digest('hex')}`;

/** The digest of the content of `files` under the folder `name`: of the tar `packArchive` gzips. Refused as `packArchive` refuses. */
export const contentDigest = (name: string, files: readonly TreeFile[]): string => digestOfTar(tarOf(name, files));

/**
 * The archive of `files` under the folder `name`, gzipped, and the digest of its content; the same files, in any order, give the same
 * bytes. Refused (Invalid): a path no ustar header holds, each by name, and a tar larger than `limit`.
 */
export function packArchive(name: string, files: readonly TreeFile[], limit = ARCHIVE_LIMIT): { archive: Buffer; digest: string } {
  const tar = tarOf(name, files);
  if (tar.length > limit)
    throw new Invalid({ message: `${name} was not packed: its tar is ${tar.length} bytes, over the ${limit} an archive holds.` });
  return { archive: gzipSync(tar), digest: digestOfTar(tar) };
}

/** The text of a header's field, up to its first NUL. */
function field(block: Uint8Array, at: number, length: number): string {
  const bytes = block.subarray(at, at + length);
  const end = bytes.indexOf(0);
  return Buffer.from(end === -1 ? bytes : bytes.subarray(0, end)).toString('utf8');
}

/** A header's octal field as a number, or NaN where it holds anything but octal digits and the spaces and NUL around them. */
function octalField(block: Uint8Array, at: number, length: number): number {
  const text = field(block, at, length).trim();
  return /^[0-7]+$/.test(text) ? Number.parseInt(text, 8) : Number.NaN;
}

/** An entry's header as read: its path, its type, its mode and the size of its body. */
type Header = { path: string; type: string; mode: number; size: number };

/** The header at `block`, or why it is no header: a magic that is not ustar's, a checksum that does not add up, a size not in octal. */
function readHeader(block: Uint8Array): Header | string {
  const magic = Buffer.from(block.subarray(257, 265)).toString('latin1');
  if (magic !== 'ustar\u000000' && magic !== 'ustar  \u0000') return 'is no ustar header';
  if (octalField(block, 148, 8) !== checksumOf(block)) return 'has a header whose checksum does not add up';
  const size = octalField(block, 124, 12);
  if (Number.isNaN(size)) return 'has a size that is not in octal';
  const prefix = field(block, 345, 155);
  const name = field(block, 0, 100);
  const type = String.fromCharCode(block[156] || 0x30);
  return { path: prefix ? `${prefix}/${name}` : name, type, mode: (octalField(block, 100, 8) || 0) & 0o777, size };
}

/** The types an entry may be, by its flag: a regular file and a folder. */
const FILE_TYPE = '0';
const FOLDER_TYPE = '5';

/** Why the entry `path` of type `type` is no file of a template, or null: a type but a file or a folder, a part that climbs or is empty. */
function entryRefusal(path: string, type: string): string | null {
  if (type !== FILE_TYPE && type !== FOLDER_TYPE)
    return `is of type ${JSON.stringify(type)}, and a template holds files and folders only: no link, device or extended header. Pack the folder with nemia template pack.`;
  if (path.includes('\\')) return 'holds a backslash, and a path in an archive is split by / alone';
  if (path.startsWith('/')) return 'is absolute, and every path of an archive stands under its folder';
  const parts = (type === FOLDER_TYPE ? path.replace(/\/$/, '') : path).split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..'))
    return 'has a part that is empty, . or .., and every path of an archive stands under its folder';
  if (type === FILE_TYPE && parts.length < 2) return "is a file beside the template's folder, and every file of an archive stands in it";
  return null;
}

/** An archive's entries, read: its files and folders by path from the archive's top, and every entry refused. */
type Entries = { files: Array<TreeFile & { entry: string }>; folders: string[]; refused: EntryRefusal[] };

/** The entries of `tar`, read up to its two zero blocks; a header that does not read, or a body cut short, ends the reading refused. */
function entriesOf(tar: Uint8Array): Entries {
  const read: Entries = { files: [], folders: [], refused: [] };
  for (let at = 0; at + BLOCK <= tar.length;) {
    const block = tar.subarray(at, at + BLOCK);
    if (block.every((byte) => byte === 0)) return read;
    const header = readHeader(block);
    if (typeof header === 'string') return { ...read, refused: [...read.refused, { entry: `the block at byte ${at}`, why: header }] };
    const body = at + BLOCK;
    if (body + header.size > tar.length)
      return {
        ...read,
        refused: [...read.refused, { entry: header.path, why: `is cut short: ${header.size} bytes, and the archive ends first` }],
      };
    const why = entryRefusal(header.path, header.type);
    if (why) read.refused.push({ entry: header.path, why });
    else if (header.type === FOLDER_TYPE) read.folders.push(header.path.replace(/\/$/, ''));
    else read.files.push({ entry: header.path, path: header.path, mode: header.mode, bytes: tar.slice(body, body + header.size) });
    at = body + Math.ceil(header.size / BLOCK) * BLOCK;
  }
  return { ...read, refused: [...read.refused, { entry: 'the archive', why: 'ends before its two zero blocks: it is cut short' }] };
}

/** The template's name, the one top folder every entry stands in; each entry under another, or a top that is no name, refused. */
function topOf(entries: Entries): string | undefined {
  const tops = new Set([...entries.folders, ...entries.files.map((f) => f.path)].map((p) => p.split('/')[0]));
  const [name] = [...entries.files.map((f) => f.path), ...entries.folders].map((p) => p.split('/')[0]);
  if (tops.size > 1)
    entries.refused.push({
      entry: [...tops].sort().join(', '),
      why: 'are two top folders or more, and an archive holds one: the template',
    });
  else if (name !== undefined && !SKILL_NAME.test(name))
    entries.refused.push({ entry: name, why: 'is the top folder, and is no name: lowercase words joined by dashes' });
  return tops.size === 1 && name !== undefined && SKILL_NAME.test(name) ? name : undefined;
}

/** Each file whose path another entry gives too, or another file stands under as a folder, refused by name. */
function clashes(entries: Entries): void {
  const files = new Set<string>();
  for (const file of entries.files) {
    if (files.has(file.path) || entries.folders.includes(file.path))
      entries.refused.push({ entry: file.entry, why: 'is given twice, and a path of an archive is one entry' });
    files.add(file.path);
  }
  const under = [...entries.files.map((f) => f.path), ...entries.folders];
  for (const file of files)
    if (under.some((p) => p.startsWith(`${file}/`)))
      entries.refused.push({ entry: file, why: 'is a file, and another entry stands under it as a folder' });
}

/** The tar inside `bytes`, gunzipped up to `limit`; refused where they are no gzip, or unpack to more. */
function gunzipped(bytes: Uint8Array, limit: number, source: string): Buffer {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b)
    throw new Invalid({ message: `${source} is no archive: its bytes are not gzip. Name an archive nemia template pack wrote.` });
  try {
    return gunzipSync(bytes, { maxOutputLength: limit });
  } catch (err) {
    const why = err instanceof RangeError ? `it unpacks to more than ${limit} bytes, the most an archive holds` : (err as Error).message;
    throw new Invalid({ message: `${source} does not unpack: ${why}. Name an archive nemia template pack wrote.` });
  }
}

/**
 * The template inside the archive `bytes`: its name, the top folder; its files, by path from it, sorted; and the digest of its content,
 * as `packArchive` gives it. Refused (Invalid), every entry at once, by name, as `source` names the archive: bytes that are no gzip or
 * unpack to more than `limit`, a header that does not read, a body cut short, an entry of a type but a file or a folder, a path that is
 * absolute, holds a backslash or a part empty, `.` or `..`, a second top folder or one that is no name, a path given twice, and a file
 * another entry stands under.
 */
export function unpackArchive(
  bytes: Uint8Array,
  limit = ARCHIVE_LIMIT,
  source = 'the archive',
): { name: string; files: TreeFile[]; digest: string } {
  const entries = entriesOf(gunzipped(bytes, limit, source));
  const name = topOf(entries);
  clashes(entries);
  if (!entries.refused.length && name === undefined) entries.refused.push({ entry: source, why: 'holds no file' });
  if (entries.refused.length || name === undefined)
    throw new Invalid({
      message: `${source} was refused, and nothing was written:\n${entries.refused.map((r) => `  ${r.entry}: ${r.why}`).join('\n')}`,
    });
  const files = entries.files
    .map(({ path, mode, bytes: body }) => ({ path: path.slice(name.length + 1), mode, bytes: body }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { name, files, digest: contentDigest(name, files) };
}
