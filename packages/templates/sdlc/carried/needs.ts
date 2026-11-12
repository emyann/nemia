/**
 * `node needs.ts <verb>` — what the machine needs of `build` and `quick` run to put GitHub's side in place where the factory lands on
 * GitHub (`github` true): a need's check or its fix, as `node "$WF_CARRIED_FILES/needs.ts" <verb>`.
 *
 * - `install-gh` installs the latest release of gh, the GitHub CLI, for this machine, with no sudo: the release read from GitHub's API
 *   (`NEMIA_GH_RELEASE_URL` names another address of the latest release, for a test), its archive for this system and processor
 *   (`gh_<version>_linux_amd64.tar.gz`, `gh_<version>_linux_arm64.tar.gz`, `gh_<version>_macOS_amd64.zip` or
 *   `gh_<version>_macOS_arm64.zip`), its sha256 checked against
 *   the release's `gh_<version>_checksums.txt`, unpacked into `$NEMIA_TOOLS/gh/<version>`, and `$NEMIA_TOOLS/bin/gh` linked to its
 *   `bin/gh`. A version already unpacked is linked again, not fetched.
 * - `scope <scope>` exits 0 where gh is signed in to github.com with a token holding the scope (the `Token scopes:` line of `gh auth
 *   status`), 1 where it is signed out or the scope is missing, saying which.
 * - `identity` sets git's global name and email from the account gh is signed in to: its name (its login where it has none) and its
 *   noreply address, `<id>+<login>@users.noreply.github.com`, so a commit is made under the account without publishing an address.
 *
 * Refuses, exit 1 on stderr with what to do next: no `NEMIA_TOOLS`, a machine gh ships no archive for, a release or a download that
 * cannot be read, a sum that differs, gh missing or signed out. It imports Node's built-ins alone: the run freezes the carried folder
 * whole, and a fix runs it with the machine's `node`.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** A reason the verb is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** Where the latest release of gh is read from, unless `NEMIA_GH_RELEASE_URL` names another. */
const LATEST = 'https://api.github.com/repos/cli/cli/releases/latest';

/** Where a person installs gh by hand, for a machine this script has no archive for. */
const MANUAL = 'https://github.com/cli/cli#installation';

/** How long a call of `gh`, `git` or an unpacker may take, in milliseconds. */
const BOUND = 120_000;

/** The sign-in a refusal names: gh signed in to github.com in a browser, with the `workflow` scope a push of a CI file takes. */
const SIGN_IN = 'gh auth login --hostname github.com --web --git-protocol https --scopes workflow';

/** What a command printed: its exit, its streams, and whether there was no such command on the PATH. */
type Ran = { status: number | null; out: string; err: string; missing: boolean };

/** Run `cmd` with `args`, bounded, reading nothing from stdin. */
function run(cmd: string, args: string[]): Ran {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: BOUND });
  const missing = r.error !== undefined && 'code' in r.error && r.error.code === 'ENOENT';
  return { status: r.status, out: r.stdout ?? '', err: (r.stderr ?? '').trim() || (r.error?.message ?? ''), missing };
}

/** Run gh with `args`; refuses where gh is not on the PATH, naming the install. */
function gh(args: string[]): Ran {
  const ran = run('gh', args);
  if (ran.missing) throw new Refusal('gh is not on the PATH: install it with `node "$WF_CARRIED_FILES/needs.ts" install-gh`');
  return ran;
}

/** The archive gh ships for this machine, by its name's tail after `gh_<version>_`; refuses a machine it ships none for. */
function archiveTail(): string {
  const arch = { x64: 'amd64', arm64: 'arm64' }[process.arch as string];
  const system = { linux: { name: 'linux', ext: 'tar.gz' }, darwin: { name: 'macOS', ext: 'zip' } }[process.platform as string];
  if (arch === undefined || system === undefined)
    throw new Refusal(`gh ships no archive this script installs for ${process.platform} ${process.arch}: install gh by hand (${MANUAL})`);
  return `${system.name}_${arch}.${system.ext}`;
}

/** The body of `url`, refused with what was read where it cannot be. */
async function fetched(url: string, what: string): Promise<Buffer> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'user-agent': 'nemia-needs', accept: 'application/octet-stream, application/json' } });
  } catch (err) {
    throw new Refusal(`cannot read ${what} from ${url} (${(err as Error).message}): check the network, then run the fix again`);
  }
  if (!res.ok) throw new Refusal(`${url} answered ${res.status} for ${what}: run the fix again later, or install gh by hand (${MANUAL})`);
  return Buffer.from(await res.arrayBuffer());
}

/** The release as far as the install reads it: its tag and each asset's name and address. */
type Release = { tag_name?: unknown; assets?: Array<{ name?: unknown; browser_download_url?: unknown }> };

/** The address of the asset `name` of `release`; refuses one it does not hold. */
function assetUrl(release: Release, name: string): string {
  const url = release.assets?.find((asset) => asset.name === name)?.browser_download_url;
  if (typeof url !== 'string') throw new Refusal(`the latest gh release holds no ${name}: install gh by hand (${MANUAL})`);
  return url;
}

/** The sum `checksums` (lines of `<sha256>  <name>`) gives the file `name`; refuses where it gives none. */
function sumOf(checksums: string, name: string): string {
  const line = checksums.split('\n').find((l) => l.trim().split(/\s+/)[1] === name);
  const sum = line?.trim().split(/\s+/)[0];
  if (!sum) throw new Refusal(`the release's checksums name no ${name}: install gh by hand (${MANUAL})`);
  return sum.toLowerCase();
}

/** The archive `file` unpacked into the folder `into`, by `tar` or `unzip`; refuses where the unpacker fails. */
function unpacked(file: string, into: string): void {
  const ran = file.endsWith('.zip') ? run('unzip', ['-q', file, '-d', into]) : run('tar', ['-xzf', file, '-C', into]);
  if (ran.status !== 0) throw new Refusal(`cannot unpack ${path.basename(file)}: ${ran.err || ran.out} — install gh by hand (${MANUAL})`);
}

/** The `bin/gh` of the release unpacked in `dir`: at its root, or under its one top folder; refuses where there is none. */
function ghIn(dir: string): string {
  const tops = ['', ...fs.readdirSync(dir)];
  const found = tops.map((top) => path.join(dir, top, 'bin', 'gh')).find((file) => fs.existsSync(file));
  if (found === undefined) throw new Refusal(`the gh archive holds no bin/gh: install gh by hand (${MANUAL})`);
  return found;
}

/** `link` made to point at `target`, through a fresh link renamed over it, so a reader never sees it missing. */
function linked(target: string, link: string): void {
  fs.mkdirSync(path.dirname(link), { recursive: true });
  const fresh = `${link}.${process.pid}`;
  fs.rmSync(fresh, { force: true });
  fs.symlinkSync(target, fresh);
  fs.renameSync(fresh, link);
}

/** `install-gh`: the latest gh for this machine into `$NEMIA_TOOLS/gh/<version>`, its sum checked, and `$NEMIA_TOOLS/bin/gh` linked. */
async function installGh(): Promise<string[]> {
  const tools = process.env.NEMIA_TOOLS;
  if (!tools) throw new Refusal("NEMIA_TOOLS is not set: run this as a need's fix, `nemia readiness fix gh`, which names the tools folder");
  const tail = archiveTail();
  const url = process.env.NEMIA_GH_RELEASE_URL || LATEST;
  let release: Release;
  try {
    release = JSON.parse((await fetched(url, 'the latest gh release')).toString('utf8')) as Release;
  } catch (err) {
    if (err instanceof Refusal) throw err;
    throw new Refusal(`${url} answered no release: run the fix again later, or install gh by hand (${MANUAL})`);
  }
  const version = typeof release.tag_name === 'string' ? release.tag_name.replace(/^v/, '') : '';
  if (!/^[\w.-]+$/.test(version)) throw new Refusal(`the latest gh release names no version: install gh by hand (${MANUAL})`);
  const home = path.join(tools, 'gh', version);
  const link = path.join(tools, 'bin', 'gh');
  if (fs.existsSync(home)) {
    linked(ghIn(home), link);
    return [`gh ${version} was already in ${home}: linked ${link}`];
  }
  const name = `gh_${version}_${tail}`;
  const checksums = (await fetched(assetUrl(release, `gh_${version}_checksums.txt`), 'the release checksums')).toString('utf8');
  const want = sumOf(checksums, name);
  const archive = await fetched(assetUrl(release, name), name);
  const got = createHash('sha256').update(archive).digest('hex');
  if (got !== want)
    throw new Refusal(`${name} sums to ${got}, and the release's checksums say ${want}: nothing was installed; run the fix again`);
  fs.mkdirSync(path.join(tools, 'gh'), { recursive: true });
  const staging = fs.mkdtempSync(path.join(tools, 'gh', `.${version}-`));
  try {
    const file = path.join(staging, name);
    fs.writeFileSync(file, archive);
    const unpack = path.join(staging, 'unpacked');
    fs.mkdirSync(unpack);
    unpacked(file, unpack);
    ghIn(unpack);
    fs.renameSync(unpack, home);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  linked(ghIn(home), link);
  return [`gh ${version} installed into ${home}, linked ${link}`];
}

/** The scopes gh's `auth status` says its token holds, from its `Token scopes:` line, quoted or not; none where it says none. */
function scopesSaid(said: string): string[] | undefined {
  const line = /Token scopes:\s*(.*)$/m.exec(said)?.[1];
  if (line === undefined) return undefined;
  return line
    .split(',')
    .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean);
}

/** `scope <s>`: whether gh is signed in to github.com with a token holding `s`. */
function scope([wanted]: string[]): string[] {
  if (!wanted) throw new Refusal('no scope named: give one, `node needs.ts scope workflow`');
  const ran = gh(['auth', 'status', '--hostname', 'github.com']);
  const said = `${ran.out}\n${ran.err}`;
  if (ran.status !== 0) throw new Refusal(`gh is not signed in to github.com: sign in with \`${SIGN_IN}\``);
  const scopes = scopesSaid(said);
  if (scopes === undefined) throw new Refusal(`gh auth status names no token scopes: sign in again with \`${SIGN_IN}\``);
  if (!scopes.includes(wanted))
    throw new Refusal(
      `gh's token holds ${scopes.join(', ') || 'no scope'}, not ${wanted}: add it with \`gh auth refresh --hostname github.com --scopes ${wanted}\``,
    );
  return [`gh is signed in to github.com with the ${wanted} scope`];
}

/** `identity`: git's global name and email set from the account gh is signed in to. */
function identity(): string[] {
  const ran = gh(['api', 'user']);
  if (ran.status !== 0)
    throw new Refusal(
      `gh cannot read the account (${ran.err}): sign in with \`${SIGN_IN}\`, or set git's name and email by hand with git config --global`,
    );
  let user: { login?: unknown; id?: unknown; name?: unknown };
  try {
    user = JSON.parse(ran.out) as typeof user;
  } catch {
    throw new Refusal('gh api user answered no account: sign in again, then run the fix again');
  }
  const { login, id, name } = user;
  if (typeof login !== 'string' || !login || (typeof id !== 'number' && typeof id !== 'string'))
    throw new Refusal('gh api user answered no login or id: sign in again, then run the fix again');
  const shown = typeof name === 'string' && name.trim() ? name.trim() : login;
  const email = `${id}+${login}@users.noreply.github.com`;
  for (const [key, value] of [
    ['user.name', shown],
    ['user.email', email],
  ]) {
    const set = run('git', ['config', '--global', key, value]);
    if (set.status !== 0) throw new Refusal(`cannot set git's ${key} (${set.err}): set it by hand, git config --global ${key}`);
  }
  return [`git commits as ${shown} <${email}>`];
}

/** The verbs, by name. */
const VERBS: Record<string, (args: string[]) => string[] | Promise<string[]>> = { 'install-gh': installGh, scope, identity };

/** The whole run: exit 0 with what was done on stdout, 1 with the refusal on stderr. */
async function main(): Promise<number> {
  const [verb = '', ...args] = process.argv.slice(2);
  try {
    const act = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
    if (!act) throw new Refusal(`\`${verb}\` is no verb: give install-gh, scope <scope> or identity`);
    for (const line of await act(args)) process.stdout.write(`nemia needs: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`nemia needs: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = await main();
