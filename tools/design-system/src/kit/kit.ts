/**
 * The kit's own stories, which its registry does not ship and the board does not vendor: taken from the kit's public repository at the
 * tag of the release the board holds (`v<version>`, the version `apps/web/src/components/ui/ds/RELEASE.json` names), as GitHub's
 * tarball of that tag, read by Node's zlib and the small tar reader below, and kept under the cache by version, so a build fetches
 * them once per release. `GITHUB_TOKEN`, when set, is sent with the request, as CI's runners share an address and its limit.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { CACHE, SRC, readJson, writeIn } from '../paths.ts';

/** The kit's repository on GitHub. */
export const KIT_REPOSITORY = 'french-tech-homies/design-system';

/** One file of an archive: its path inside the archive and its bytes. */
export type Entry = { readonly name: string; readonly bytes: Buffer };

const BLOCK = 512;

/** The text of a header's field, up to its first NUL. */
const field = (header: Buffer, at: number, length: number) => {
  const raw = header.subarray(at, at + length);
  const end = raw.indexOf(0);
  return raw.subarray(0, end < 0 ? length : end).toString('utf8');
};

/** The `path` a pax extended header gives the entry after it, if any. */
const paxPath = (body: Buffer) => /(?:^|\n)\d+ path=([^\n]*)\n/.exec(body.toString('utf8'))?.[1];

/**
 * The regular files of a tar archive (ustar, with pax and GNU long names), by their paths; the global pax header and every entry but a
 * file are left out.
 * @param tar the archive's bytes, unzipped.
 */
export const tarEntries = (tar: Buffer) => {
  const entries: Entry[] = [];
  let longName: string | undefined;
  for (let at = 0; at + BLOCK <= tar.length;) {
    const header = tar.subarray(at, at + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = Number.parseInt(field(header, 124, 12).trim() || '0', 8);
    const type = field(header, 156, 1);
    const body = tar.subarray(at + BLOCK, at + BLOCK + size);
    at += BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (type === 'x') longName = paxPath(body);
    else if (type === 'L') longName = field(body, 0, body.length);
    else if (type === '0' || type === '') {
      const prefix = field(header, 345, 155);
      const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
      entries.push({ name, bytes: Buffer.from(body) });
      longName = undefined;
    } else longName = undefined;
  }
  return entries;
};

/** The version of the kit the board holds, from its `RELEASE.json`. */
export const kitVersion = () => readJson<{ version: string }>(path.join(SRC, 'components', 'ui', 'ds', 'RELEASE.json')).version;

/**
 * The address of the kit's tarball at the tag of `version`.
 * @param version the kit's release, `0.11.0`.
 */
export const tarballOf = (version: string) => `https://api.github.com/repos/${KIT_REPOSITORY}/tarball/v${version}`;

/** Fetches the kit's tarball at `version`'s tag, refused with what to do when GitHub answers otherwise than with it. */
const fetchTarball = async (version: string) => {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'design-system-producer' };
  if (token) headers.authorization = `Bearer ${token}`;
  const answer = await fetch(tarballOf(version), { headers, redirect: 'follow' });
  if (!answer.ok)
    throw new Error(
      `the kit's stories at v${version} could not be fetched (${answer.status} from ${tarballOf(version)}): check that ${KIT_REPOSITORY} ` +
        `tags its release v${version}, and set GITHUB_TOKEN where GitHub limits the requests`,
    );
  return Buffer.from(await answer.arrayBuffer());
};

/**
 * The folder holding the kit's `stories/` at `version`, fetched and written into the cache on the first build of that version.
 * @param version the kit's release.
 */
export const kitStories = async (version: string) => {
  const folder = path.join(CACHE, `kit-${version}`);
  if (fs.existsSync(path.join(folder, 'stories'))) return folder;
  const entries = tarEntries(gunzipSync(await fetchTarball(version)));
  const kept = entries.filter((entry) => /^[^/]+\/stories\//.test(entry.name));
  if (kept.length === 0) throw new Error(`the kit's tarball at v${version} holds no stories/ folder: read where its stories moved`);
  const staging = `${folder}.part`;
  fs.rmSync(staging, { recursive: true, force: true });
  for (const entry of kept) writeIn(path.join(staging, entry.name.replace(/^[^/]+\//, '')), entry.bytes);
  fs.rmSync(folder, { recursive: true, force: true });
  fs.renameSync(staging, folder);
  return folder;
};
