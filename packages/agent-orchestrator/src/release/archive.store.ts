/**
 * The disk and the network of an archive install. A published release is fetched from its download base (`source`, carried in the
 * running release's `release.json`): `<source>/download/<tag>/nemia-<tag>-<platform>.tar.gz` and that tag's `SHA256SUMS`, checked
 * against each other and unpacked (`tar -xzf`) into a build's folder; the newest is named by `<source>/latest/download/latest.json`.
 * A `file:` base is read from the disk, which Node's `fetch` refuses. Each request sends nothing but a generic client name
 * (`CLIENT_NAME`). Also the two records an archive install keeps beside its releases: the store's floor, `$WF_ROOT/store.json`
 * (`readableFrom`, raised by the daemon as it takes the store, `raiseStoreFloor`), and the newest release the release check read,
 * `$WF_ROOT/releases/latest.json` (its notes' address kept where it is an http(s) one), each written whole by a rename. Where an asset
 * answers 404, the release of its tag is read from GitHub's API (`releaseApiUrl`, no token), so a release published before its release
 * workflow attached the asset is told apart from no release at all (`awaitedAsset`).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Result, Schema } from 'effect';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { floorAfter, parseVersion, STORE_READABLE_FROM, versionTag, type Version } from './floor.ts';
import type { ReleasePlatform } from './release.ts';
import { ranInto, releasesDir, type Building } from './release.store.ts';

/** The name every request for a release says it comes from, and nothing else of the machine or the person. */
export const CLIENT_NAME = 'nemia';

/** The file of checksums a release publishes beside its archives, one `<sha256>  <asset>` line each. */
export const SUMS = 'SHA256SUMS';

/** The file that names the newest release, `{ tag, version }`, published with each release and read through `latest/download/`. */
export const LATEST = 'latest.json';

/** The archive of `tag` for `platform`. */
export const assetName = (tag: string, platform: ReleasePlatform): string => `nemia-${tag}-${platform}.tar.gz`;

/** A download base without its trailing slashes. */
const based = (source: string): string => source.replace(/\/+$/, '');

/** Where the asset `name` of `tag` is downloaded from. */
export const assetUrl = (source: string, tag: string, name: string): string => `${based(source)}/download/${tag}/${name}`;

/** Where the newest release's `latest.json` is read from. */
export const latestUrl = (source: string): string => `${based(source)}/latest/download/${LATEST}`;

/**
 * The bytes at `url`: a `file:` URL read from the disk, any other fetched, sending only `CLIENT_NAME`. Refused, led by `by`: nothing
 * there (`Missing`, the URL named); a fetch that fails or answers anything but success (`Conflict`, run it again).
 */
export async function fetched(url: string, by: string): Promise<Buffer> {
  if (url.startsWith('file:')) {
    try {
      return fs.readFileSync(fileURLToPath(url));
    } catch {
      throw new Missing({ message: `${by}: ${url} is not there: check the tag and the download base in release.json (source).` });
    }
  }
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'user-agent': CLIENT_NAME }, redirect: 'follow' });
  } catch (err) {
    throw new Conflict({ message: `${by}: ${url} could not be reached (${(err as Error).message}): check the network and run it again.` });
  }
  if (response.status === 404)
    throw new Missing({ message: `${by}: ${url} answered 404: no such release is published; check the tag, like nemia upgrade v1.3.0.` });
  if (!response.ok) throw new Conflict({ message: `${by}: ${url} answered ${response.status}: nothing changed; run it again.` });
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Where GitHub's API answers the release of `tag` in the repository whose download base is `source`, `<host>/<owner>/<repo>/releases`:
 * `api.github.com` for github.com, and the host's own `/api/v3` for any other (GitHub Enterprise Server's); undefined for a base of
 * another shape, a `file:` one among them.
 */
export function releaseApiUrl(source: string, tag: string): string | undefined {
  let url: URL;
  try {
    url = new URL(based(source));
  } catch {
    return undefined;
  }
  const repo = /^\/([^/]+)\/([^/]+)\/releases$/.exec(url.pathname);
  if ((url.protocol !== 'https:' && url.protocol !== 'http:') || repo === null) return undefined;
  const api = url.hostname === 'github.com' ? 'https://api.github.com' : `${url.origin}/api/v3`;
  return `${api}/repos/${repo[1]}/${repo[2]}/releases/tags/${encodeURIComponent(tag)}`;
}

const ReleaseSchema = Schema.Struct({ assets: Schema.Array(Schema.Struct({ name: Schema.String })) });

/**
 * The names of the assets attached to the release of `tag` at `source`, as GitHub's API answers them with no token; undefined where it
 * answers no such release (a draft among them, which it shows to no one without one), cannot be reached, or answers anything else.
 */
export async function releaseAssets(source: string, tag: string): Promise<readonly string[] | undefined> {
  const url = releaseApiUrl(source, tag);
  if (url === undefined) return undefined;
  try {
    const response = await fetch(url, { headers: { 'user-agent': CLIENT_NAME } });
    if (!response.ok) return undefined;
    const decoded = Schema.decodeUnknownResult(ReleaseSchema)(await response.json());
    return Result.isFailure(decoded) ? undefined : decoded.success.assets.map((asset) => asset.name);
  } catch {
    return undefined;
  }
}

/**
 * The asset `name` of `tag` at `source`, fetched (`fetched`). Where it answers 404 and the release of `tag` is published without it
 * (`releaseAssets`), refused `Conflict`: the release workflow attaches it a few minutes after the tag, so the same upgrade goes through
 * then. Where there is no such release, or it cannot be read, refused as `fetched` refuses.
 */
async function awaitedAsset(source: string, tag: string, name: string, by: string): Promise<Buffer> {
  try {
    return await fetched(assetUrl(source, tag, name), by);
  } catch (err) {
    if (!(err instanceof Missing)) throw err;
    const attached = await releaseAssets(source, tag);
    if (attached === undefined || attached.includes(name)) throw err;
    throw new Conflict({
      message: `${by}: ${tag} is published, but ${name} is not attached to it yet: its release workflow attaches the archives a few minutes after the tag; upgrade again then, like nemia upgrade ${tag}.`,
    });
  }
}

/** The checksum `sums` (a `SHA256SUMS` file) gives the asset `name`, in lowercase hex, or undefined where it names none. */
export function sumOf(sums: string, name: string): string | undefined {
  for (const line of sums.split('\n')) {
    const read = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim());
    if (read?.[2] === name) return read[1]?.toLowerCase();
  }
  return undefined;
}

/**
 * What `latest.json` says of the newest release: its tag, its version, and the address of its release notes where it gives one that is
 * an http(s) URL (`notes`).
 */
export type LatestFile = { readonly tag: string; readonly version: string; readonly notes?: string };

const LatestSchema = Schema.Struct({ tag: Schema.String, version: Schema.String, notes: Schema.optionalKey(Schema.Unknown) });

/** `notes` where it is the address of a page a browser opens over http(s), else undefined: any other value is dropped, never shown. */
function notesOf(notes: unknown): string | undefined {
  if (typeof notes !== 'string') return undefined;
  try {
    const url = new URL(notes);
    return url.protocol === 'https:' || url.protocol === 'http:' ? notes : undefined;
  } catch {
    return undefined;
  }
}

/** `text` read as a `latest.json` whose tag is a version, its notes kept where they are an http(s) address (`notesOf`), or undefined. */
export function latestOf(text: string): LatestFile | undefined {
  try {
    const decoded = Schema.decodeUnknownResult(LatestSchema)(JSON.parse(text));
    if (Result.isFailure(decoded) || parseVersion(decoded.success.tag) === null) return undefined;
    const notes = notesOf(decoded.success.notes);
    return { tag: decoded.success.tag, version: decoded.success.version, ...(notes === undefined ? {} : { notes }) };
  } catch {
    return undefined;
  }
}

/** The newest release published at `source`; refused (`Invalid`) where its `latest.json` does not read as one, and as `fetched` refuses. */
export async function fetchLatest(source: string, by: string): Promise<LatestFile> {
  const url = latestUrl(source);
  const latest = latestOf((await fetched(url, by)).toString('utf8'));
  if (latest === undefined)
    throw new Invalid({
      message: `${by}: ${url} does not read as { "tag": "v1.2.3", "version": "1.2.3" }: name the tag, like nemia upgrade v1.3.0.`,
    });
  return latest;
}

/**
 * The archive of `tag` for `platform` downloaded from `source` into the build's folder, checked against its tag's `SHA256SUMS`, and
 * unpacked into the build's `tree`. Refused, before anything is unpacked: an asset or a sums file not attached yet to a published
 * release (`Conflict`, `awaitedAsset`) or not there, or one `SHA256SUMS` names
 * no checksum of, or another (`Invalid`); and a `tar` that fails, naming the log.
 */
export async function unpackedArchive(
  source: string,
  tag: string,
  platform: ReleasePlatform,
  building: Building,
  by: string,
): Promise<void> {
  const name = assetName(tag, platform);
  const bytes = await awaitedAsset(source, tag, name, by);
  const sums = (await awaitedAsset(source, tag, SUMS, by)).toString('utf8');
  const expected = sumOf(sums, name);
  if (expected === undefined)
    throw new Invalid({ message: `${by}: ${tag}'s ${SUMS} names no checksum of ${name}, so it cannot be checked: nothing changed.` });
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected)
    throw new Invalid({
      message: `${by}: ${name} does not match its checksum in ${SUMS} (${actual.slice(0, 12)}…, ${expected.slice(0, 12)}… expected): the download is damaged or not the release's, so nothing changed; run it again.`,
    });
  const file = path.join(building.dir, name);
  fs.writeFileSync(file, bytes);
  fs.mkdirSync(building.tree, { recursive: true });
  const exit = ranInto(['tar', '-xzf', file, '-C', building.tree], building.dir, process.env, building.log);
  if (exit !== 0)
    throw new Invalid({ message: `${by}: tar could not unpack ${name} (exit ${exit}), so nothing changed: read ${building.log}.` });
}

/** Writes `text` to `file` whole: a file beside it, renamed over it, so no reader meets half of it. */
function writtenWhole(file: string, text: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const hidden = path.join(path.dirname(file), `.${path.basename(file)}-${process.pid}`);
  fs.writeFileSync(hidden, text);
  fs.renameSync(hidden, file);
}

/** The store's record of its floor. */
export const storeFile = (home: string): string => path.join(home, 'store.json');

const StoreFileSchema = Schema.Struct({ readableFrom: Schema.String });

/** The oldest release that can read the store at `home`, as `store.json` records it; null where it records none, or none that reads. */
export function readStoreFloor(home: string): Version | null {
  let text: string;
  try {
    text = fs.readFileSync(storeFile(home), 'utf8');
  } catch {
    return null;
  }
  try {
    const decoded = Schema.decodeUnknownResult(StoreFileSchema)(JSON.parse(text));
    return Result.isFailure(decoded) ? null : parseVersion(decoded.success.readableFrom);
  } catch {
    return null;
  }
}

/** Records `floor` as the oldest release that can read the store at `home`. */
export const writeStoreFloor = (home: string, floor: Version): void =>
  writtenWhole(storeFile(home), `${JSON.stringify({ readableFrom: versionTag(floor) }, null, 2)}\n`);

/**
 * The store's floor raised to `own`, what this release writes for (`STORE_READABLE_FROM`), where the record is lower or absent, and never
 * lowered (`floorAfter`); written only where it changes. Answers the floor the store now records.
 */
export function raiseStoreFloor(home: string, own: Version = STORE_READABLE_FROM): Version {
  const record = readStoreFloor(home);
  const after = floorAfter(record, own);
  if (record === null || versionTag(record) !== versionTag(after)) writeStoreFloor(home, after);
  return after;
}

/** Where the release check keeps the newest release it read. */
export const latestFile = (home: string): string => path.join(releasesDir(home), LATEST);

/** The newest release the store's release check last read, or undefined where it read none or the file does not read. */
export function readLatest(home: string): LatestFile | undefined {
  try {
    return latestOf(fs.readFileSync(latestFile(home), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Keeps `latest`, as fetched, as the newest release the store knows of. */
export const writeLatest = (home: string, latest: LatestFile): void =>
  writtenWhole(latestFile(home), `${JSON.stringify(latest, null, 2)}\n`);
