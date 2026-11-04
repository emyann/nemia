/**
 * Nemia's releases: a pull request a workflow keeps open, and the tag and the GitHub release its merge makes (`README.md` beside this
 * file). The repository's own tool, never shipped; it imports nothing installed, and reaches git and GitHub only through `git` and
 * `gh`, each call bounded.
 *
 * - `check`: the `release-label` check. Exactly one of `LABELS` on the pull request, read from `LABELS` (a JSON array of names, the
 *   pure entry a test drives) or, unset, from the pull request numbered `PR_NUMBER` as it is now, as the workflow passes it. Given a
 *   `HEAD_SHA` (a dispatched run's commit), it refuses a pull request whose head is another commit.
 * - `labels`: makes the five labels in the repository, and puts back the colour or description of one that drifted.
 * - `tag`: where the root `package.json` names a version that has no tag `v<version>`, makes that GitHub release on the first-parent
 *   commit of main that set the version, with the notes GitHub generates since the previous release.
 * - `pr`: keeps the release pull request (`release` into `main`) open while a pull request merged since the last release carries a label
 *   that releases, rebuilt from main when main moves, and dispatches `DISPATCHED` on its head where the head has no such run pending or
 *   green: the runs that report main's required checks with no person's approval. Closes it when nothing is to release.
 *
 * Only a tag `v<x.y.z>` is a release (`releaseTag`): `v1-final`, `legacy/v1-final` and the operator's local `nemia-*` tags are not.
 * Exit codes: 0 done, 1 refused or failed (the line says what to do), 2 a verb it does not have.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** A version's bump: what a label releases. */
export type Bump = 'major' | 'minor' | 'patch' | 'none';

export type Label = { name: string; bump: Bump; color: string; description: string };

/** The release labels, in their order: every pull request into main carries exactly one. `.github/release.yml` holds a category each. */
export const LABELS: readonly Label[] = [
  { name: 'breaking', bump: 'major', color: 'b60205', description: 'Releases a major version: a change that breaks what a user had' },
  { name: 'feature', bump: 'minor', color: '0e8a16', description: 'Releases a minor version: something a user can do that they could not' },
  { name: 'fix', bump: 'patch', color: 'd93f0b', description: 'Releases a patch: something that was wrong works' },
  { name: 'docs', bump: 'patch', color: '0075ca', description: 'Releases a patch: the documentation a user reads changed' },
  { name: 'internal', bump: 'none', color: 'cfd3d7', description: 'Releases nothing: the repository changed, not what a user gets' },
];

/** The first release: no version is below it, whatever the last tag says (the last today is v0.3.0). */
export const FIRST = '1.0.0';

/** A release tag, anchored: nothing before the `v`, nothing after the patch. */
const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;

/** The branch the release pull request comes from, the workflow's own, and the branch it goes into. */
export const BRANCH = 'release';
export const BASE = 'main';

/**
 * The workflows `pr` dispatches on the release branch's head, each with the check it reports there by the name main requires, and
 * whether it is given the pull request's number (its `pr` input).
 */
export const DISPATCHED = [
  { file: 'ci.yml', check: 'ci', pr: false },
  { file: 'release-label.yml', check: 'release-label', pr: true },
] as const;

/** The bound on one `git` or `gh` call: a stalled network fails the call, never the job's whole bound. */
const CALL_MS = 120_000;

/** Who commits the version on `release`: the workflow, as GitHub names its own token's user. */
const IDENTITY = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];

/** The setting GitHub refuses the token's pull request without. */
export const CREATE_SETTING = 'Allow GitHub Actions to create and approve pull requests';

/** The pages of merged pull requests read at most: 100 each, far past the repository's count. */
const MAX_PAGES = 200;

/** GitHub's bound on a pull request's body. */
const BODY_MAX = 65_000;

/** The version a tag releases, or `undefined` for a tag that is no release. */
export const releaseTag = (tag: string): string | undefined => {
  const m = TAG.exec(tag);
  return m ? `${Number(m[1])}.${Number(m[2])}.${Number(m[3])}` : undefined;
};

const ORDER: readonly Bump[] = ['none', 'patch', 'minor', 'major'];

/** The bump of a set of labels: the highest any gives, `none` where none releases. */
export const bump = (labels: readonly string[]): Bump =>
  labels.reduce<Bump>((high, name) => {
    const given = LABELS.find((label) => label.name === name)?.bump ?? 'none';
    return ORDER.indexOf(given) > ORDER.indexOf(high) ? given : high;
  }, 'none');

const parts = (version: string): number[] => version.split('.').map(Number);

/** Whether version `a` is below `b`. */
const below = (a: string, b: string): boolean => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
};

/** The version after `last` (`undefined`: no release yet) for `by`, never below `FIRST`; `undefined` when `by` releases nothing. */
export const nextVersion = (last: string | undefined, by: Bump): string | undefined => {
  if (by === 'none') return undefined;
  if (last === undefined) return FIRST;
  const [major, minor, patch] = parts(last);
  const next = by === 'major' ? `${major + 1}.0.0` : by === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`;
  return below(next, FIRST) ? FIRST : next;
};

/** A refusal: its message says what to do, and the verb exits 1 with it. */
class Refusal extends Error {}

type Out = (line: string) => void;
type Env = Record<string, string | undefined>;

/** What a call answered. */
type Ran = { status: number | null; stdout: string; stderr: string };

const spawn = (command: string, args: string[], env: Env, input?: string): Ran => {
  const ran = spawnSync(command, args, { encoding: 'utf8', timeout: CALL_MS, env, input, maxBuffer: 256 << 20 });
  if (ran.error) throw new Refusal(`${command} ${args[0]} did not finish (${ran.error.message}): re-run the job once ${command} answers`);
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr };
};

/** The tool's reach into git and GitHub, under one environment. */
const reach = (env: Env) => {
  const git = (...args: string[]): string => {
    const ran = spawn('git', args, env);
    if (ran.status !== 0) throw new Refusal(`git ${args.join(' ')} failed: ${ran.stderr.trim()}`);
    return ran.stdout.trim();
  };
  const gitMaybe = (...args: string[]): string | undefined => {
    const ran = spawn('git', args, env);
    return ran.status === 0 ? ran.stdout.trim() : undefined;
  };
  const gh = (args: string[], input?: string): string => {
    const ran = spawn('gh', args, env, input);
    if (ran.status !== 0)
      throw new Refusal(`gh ${args.slice(0, 3).join(' ')} failed: ${ran.stderr.trim()} — check GH_TOKEN and the job's permissions`);
    return ran.stdout;
  };
  const api = <T>(method: string, endpoint: string, fields: string[] = []): T => {
    const out = gh(['api', '-X', method, endpoint, ...fields.flatMap((field) => ['-f', field])]);
    return (out.trim() === '' ? null : JSON.parse(out)) as T;
  };
  return { git, gitMaybe, gh, api };
};

type Reach = ReturnType<typeof reach>;

type Pull = {
  number: number;
  title: string;
  body?: string | null;
  labels: { name: string }[];
  merged_at?: string | null;
  merge_commit_sha?: string | null;
  head?: { ref: string; sha?: string };
};

/** The open pull request whose head is `branch`, into main, or `undefined`. */
const openPull = (r: Reach, branch: string): Pull | undefined =>
  r.api<Pull[]>('GET', `repos/{owner}/{repo}/pulls?state=open&base=${BASE}&head={owner}:${branch}&per_page=100`)[0];

const releaseLabels = (labels: readonly string[]): string[] => labels.filter((name) => LABELS.some((label) => label.name === name));

const addCommand = (number: string | undefined): string =>
  `gh api -X POST repos/{owner}/{repo}/issues/${number ?? '<number>'}/labels -f 'labels[]=<label>'`;

/**
 * The labels `check` judges: `LABELS` parsed where it is set, else the pull request numbered `PR_NUMBER` as it is now. A dispatched run
 * passes `HEAD_SHA`, the commit it reports on, and the pull request's head must be that commit: a dispatch elsewhere cannot borrow a
 * labelled pull request's number.
 */
const labelsToCheck = (env: Env, r: Reach): unknown => {
  const number = env.PR_NUMBER;
  const head = env.HEAD_SHA ?? '';
  if (env.LABELS !== undefined) {
    if (head !== '') throw new Refusal('release-label: HEAD_SHA is compared with the live pull request: unset LABELS, and pass PR_NUMBER');
    try {
      return JSON.parse(env.LABELS);
    } catch {
      return undefined;
    }
  }
  if (!number || !/^\d+$/.test(number))
    throw new Refusal(
      'release-label: set PR_NUMBER to the pull request number (github.event.pull_request.number), or LABELS to its labels as a JSON array',
    );
  const pull = r.api<Pull>('GET', `repos/{owner}/{repo}/pulls/${number}`);
  if (head !== '' && pull.head?.sha !== head)
    throw new Refusal(
      `release-label: pull request #${number}'s head is ${pull.head?.sha ?? 'unknown'}, not ${head}, the commit this run checks. ` +
        `Check its head with gh workflow run release-label.yml --ref ${pull.head?.ref ?? '<its head branch>'} -f pr=${number}`,
    );
  return pull.labels.map((label) => label.name);
};

/**
 * `check`: exactly one release label. The labels are read live by `PR_NUMBER`, so a run that starts after the pull request was
 * labelled reads the label it has then, never the payload of the event that started it.
 */
const check = (env: Env, out: Out, r: Reach): number => {
  const number = env.PR_NUMBER;
  const labels = labelsToCheck(env, r);
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string'))
    throw new Refusal('release-label: LABELS is no JSON array of names: unset it, and pass PR_NUMBER so the labels are read live');
  const given = releaseLabels(labels as string[]);
  if (given.length === 1) {
    out(`release-label: ${given[0]} (${bump(given)})`);
    return 0;
  }
  const names = LABELS.map((label) => `${label.name} (${label.bump === 'none' ? 'no release' : label.bump})`).join(', ');
  throw new Refusal(
    `release-label: the pull request carries ${given.length === 0 ? 'no release label' : `${given.length} release labels (${given.join(', ')})`}, and needs exactly one of ${names}. ` +
      `Add one with ${addCommand(number)}${given.length > 1 ? `, and take the others off with gh api -X DELETE repos/{owner}/{repo}/issues/${number ?? '<number>'}/labels/<label>` : ''}.`,
  );
};

/** `labels`: the five labels exist, with their colour and description. */
const labels = (out: Out, r: Reach): number => {
  const have: { name: string; color: string; description: string | null }[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const got = r.api<typeof have>('GET', `repos/{owner}/{repo}/labels?per_page=100&page=${page}`);
    have.push(...got);
    if (got.length < 100) break;
  }
  for (const label of LABELS) {
    const found = have.find((each) => each.name === label.name);
    const fields = [`color=${label.color}`, `description=${label.description}`];
    if (!found) {
      r.api('POST', 'repos/{owner}/{repo}/labels', [`name=${label.name}`, ...fields]);
      out(`labels: made ${label.name}`);
    } else if (found.color.toLowerCase() !== label.color || (found.description ?? '') !== label.description) {
      r.api('PATCH', `repos/{owner}/{repo}/labels/${label.name}`, fields);
      out(`labels: put ${label.name}'s colour and description back`);
    }
  }
  return 0;
};

/** The releases among the tags merged into `ref`, highest first. */
const releasesIn = (r: Reach, ref: string): { tag: string; version: string }[] =>
  r
    .git('tag', '--merged', ref)
    .split('\n')
    .flatMap((tag) => {
      const version = releaseTag(tag.trim());
      return version ? [{ tag: tag.trim(), version }] : [];
    })
    .sort((a, b) => (below(a.version, b.version) ? 1 : below(b.version, a.version) ? -1 : 0));

/** The root `package.json`'s version at `ref`, or `undefined`. */
const versionAt = (r: Reach, ref: string): string | undefined => {
  const text = r.gitMaybe('show', `${ref}:package.json`);
  if (text === undefined) return undefined;
  const version = (JSON.parse(text) as { version?: unknown }).version;
  return typeof version === 'string' ? version : undefined;
};

const fetchMain = (r: Reach): string => {
  r.git('fetch', '--quiet', '--tags', 'origin', `+refs/heads/${BASE}:refs/remotes/origin/${BASE}`);
  return r.git('rev-parse', `origin/${BASE}`);
};

/** The notes GitHub generates for `tag` at `target` since `previous`, by `.github/release.yml`'s categories. */
const notes = (r: Reach, tag: string, target: string, previous: string | undefined): string =>
  r.api<{ body: string }>('POST', 'repos/{owner}/{repo}/releases/generate-notes', [
    `tag_name=${tag}`,
    `target_commitish=${target}`,
    ...(previous ? [`previous_tag_name=${previous}`] : []),
  ]).body;

/** `tag`: the release of the version main names, on the commit that set it. */
const tag = (out: Out, r: Reach): number => {
  fetchMain(r);
  const version = versionAt(r, `origin/${BASE}`);
  if (version === undefined) {
    out('tag: the root package.json names no version: nothing to release');
    return 0;
  }
  const name = `v${version}`;
  if (r.git('ls-remote', '--tags', 'origin', `refs/tags/${name}`) !== '') {
    out(`tag: ${name} is released already`);
    return 0;
  }
  const touched = r.git('log', '--first-parent', '--format=%H', `origin/${BASE}`, '--', 'package.json').split('\n').filter(Boolean);
  const setter = touched.find((sha) => versionAt(r, sha) === version && versionAt(r, `${sha}^1`) !== version);
  if (!setter) throw new Refusal(`tag: no first-parent commit of ${BASE} sets version ${version}: set it through the release pull request`);
  const previous = releasesIn(r, `origin/${BASE}`).find((each) => below(each.version, version))?.tag;
  const body = notes(r, name, setter, previous);
  r.gh(['release', 'create', name, '--target', setter, '--title', name, '--notes-file', '-'], body);
  out(`tag: released ${name} on ${setter}`);
  return 0;
};

/** `obj` with `version` set, in npm's place for it: after `name`. */
const withVersion = (obj: Record<string, unknown>, version: string): Record<string, unknown> => {
  if ('version' in obj) return { ...obj, version };
  const entries = Object.entries(obj);
  const at = entries.findIndex(([key]) => key === 'name') + 1;
  return Object.fromEntries([...entries.slice(0, at), ['version', version], ...entries.slice(at)]);
};

const writeJson = (file: string, value: unknown): void => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

/** Writes `version` into the root `package.json` and the lockfile's root, in the working tree at `root`. */
const writeVersion = (root: string, version: string): void => {
  const pkg = path.join(root, 'package.json');
  writeJson(pkg, withVersion(JSON.parse(fs.readFileSync(pkg, 'utf8')) as Record<string, unknown>, version));
  const lock = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lock)) return;
  const tree = JSON.parse(fs.readFileSync(lock, 'utf8')) as Record<string, unknown> & {
    packages?: Record<string, Record<string, unknown>>;
  };
  const top = withVersion(tree, version) as typeof tree;
  if (top.packages?.['']) top.packages = { ...top.packages, '': withVersion(top.packages[''], version) };
  writeJson(lock, top);
};

/** The pull requests merged into main whose merge commit is in `commits`, read a page at a time. */
const mergedIn = (r: Reach, commits: Set<string>): Pull[] => {
  const found: Pull[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const got = r.api<Pull[]>('GET', `repos/{owner}/{repo}/pulls?state=closed&base=${BASE}&per_page=100&page=${page}`);
    found.push(...got.filter((pull) => pull.merged_at && pull.merge_commit_sha && commits.has(pull.merge_commit_sha)));
    if (got.length < 100) break;
  }
  return found.sort((a, b) => a.number - b.number);
};

/** The release branch's head once it is main plus one commit writing `version`: rebuilt and force-pushed only where it is not. */
const rebuilt = (out: Out, r: Reach, root: string, main: string, version: string): string => {
  const title = `release: v${version}`;
  const remote = r.git('ls-remote', 'origin', `refs/heads/${BRANCH}`);
  if (remote !== '') r.git('fetch', '--quiet', 'origin', `+refs/heads/${BRANCH}:refs/remotes/origin/${BRANCH}`);
  if (remote !== '' && r.gitMaybe('rev-parse', `origin/${BRANCH}^1`) === main && versionAt(r, `origin/${BRANCH}`) === version) {
    out(`pr: ${BRANCH} is ${BASE} plus v${version} already`);
    return r.git('rev-parse', `origin/${BRANCH}`);
  }
  r.git('checkout', '--quiet', '-B', BRANCH, `origin/${BASE}`);
  writeVersion(root, version);
  r.git('add', 'package.json', ...(fs.existsSync(path.join(root, 'package-lock.json')) ? ['package-lock.json'] : []));
  r.git(...IDENTITY, 'commit', '--quiet', '-m', title);
  r.git('push', '--quiet', '--force', 'origin', `HEAD:refs/heads/${BRANCH}`);
  out(`pr: rebuilt ${BRANCH} as ${BASE} plus v${version}`);
  return r.git('rev-parse', 'HEAD');
};

/**
 * What a person does with the release pull request, first in its body so `BODY_MAX`'s cut never reaches it: merge once the dispatched
 * checks are green. The token's push also starts pull_request runs that wait for approval; main's protection counts the dispatched ones.
 */
const TO_RELEASE = [
  `**To release:** merge once ${DISPATCHED.map(({ check }) => `\`${check}\``).join(' and ')} are green on this head. The release workflow`,
  'dispatched both here, so nothing needs approving: leave the runs that wait for approval as they are. A rebuild, when main moves,',
  'dispatches them again on the new head. A check missing or failed on the head: gh workflow run release.yml.',
].join('\n');

/** The release pull request's body: what a person does, GitHub's notes, then the pull requests no label counted, within GitHub's bound. */
const bodyOf = (generated: string, unlabelled: Pull[]): string => {
  let body = `${TO_RELEASE}\n\n${generated}\n`;
  if (unlabelled.length) body += `\n## Not labelled, counted for no bump\n\n${unlabelled.map((pull) => `#${pull.number}`).join(', ')}\n`;
  return body.length > BODY_MAX
    ? `${body.slice(0, BODY_MAX)}\n\n… cut at GitHub's bound on a body; the release's own notes are whole.\n`
    : body;
};

/** Opens the release pull request with `gh pr create`: its number, or the refusal naming the setting GitHub wants. */
const opened = (env: Env, title: string, body: string): number => {
  const ran = spawn('gh', ['pr', 'create', '--base', BASE, '--head', BRANCH, '--title', title, '--body-file', '-'], env, body);
  if (ran.status !== 0 && /not permitted to create or approve pull requests/i.test(ran.stderr))
    throw new Refusal(
      `pr: GitHub refused the workflow's token a pull request. Turn on "${CREATE_SETTING}" (Settings → Actions → General → Workflow permissions), then run gh workflow run release.yml`,
    );
  if (ran.status !== 0) throw new Refusal(`pr: gh pr create failed: ${ran.stderr.trim()} — check GH_TOKEN and the pr job's permissions`);
  const m = /\/pull\/(\d+)/.exec(ran.stdout);
  if (!m) throw new Refusal(`pr: gh pr create printed no pull request URL (${ran.stdout.trim()}): run gh workflow run release.yml again`);
  return Number(m[1]);
};

const labelsOf = (pull: Pull): string[] => pull.labels.map((label) => label.name);

type WorkflowRun = { status: string; conclusion: string | null };

/** Whether a dispatched run stands for its check on its head: still to finish, or green. A failed or cancelled one is tried again. */
const standing = (run: WorkflowRun): boolean => run.status !== 'completed' || run.conclusion === 'success';

/**
 * Dispatches each of `DISPATCHED` on the release branch where `head` has no dispatched run of it that stands, `release-label.yml` given
 * the pull request's number. Read from the head's runs every pass, whoever pushed it: a rerun with nothing changed dispatches nothing.
 */
const dispatch = (out: Out, r: Reach, head: string, number: number): void => {
  for (const { file, pr } of DISPATCHED) {
    const { workflow_runs: runs } = r.api<{ workflow_runs: WorkflowRun[] }>(
      'GET',
      `repos/{owner}/{repo}/actions/workflows/${file}/runs?head_sha=${head}&event=workflow_dispatch&per_page=100`,
    );
    if (runs.some(standing)) continue;
    r.gh(['workflow', 'run', file, '--ref', BRANCH, ...(pr ? ['-f', `pr=${number}`] : [])]);
    out(`pr: dispatched ${file} on ${BRANCH} at ${head}`);
  }
};

/** `pr`: the release pull request, as main and the merged pull requests are now. */
const pr = (env: Env, out: Out, r: Reach, root: string): number => {
  const main = fetchMain(r);
  const last = releasesIn(r, `origin/${BASE}`)[0];
  const range = r.git('rev-list', last ? `${last.tag}..origin/${BASE}` : `origin/${BASE}`);
  const merged = mergedIn(r, new Set(range.split('\n').filter(Boolean)));
  const version = nextVersion(last?.version, bump(merged.flatMap(labelsOf)));
  const open = openPull(r, BRANCH);
  if (version === undefined) {
    out(`pr: ${merged.length} pull request(s) merged since ${last?.tag ?? 'the start'}, none released: nothing to release`);
    if (open) {
      r.api('PATCH', `repos/{owner}/{repo}/pulls/${open.number}`, ['state=closed']);
      out(`pr: closed #${open.number}, which nothing released any more`);
    }
    return 0;
  }
  const title = `release: v${version}`;
  const head = rebuilt(out, r, root, main, version);
  const unlabelled = merged.filter((pull) => releaseLabels(labelsOf(pull)).length === 0);
  const body = bodyOf(notes(r, `v${version}`, head, last?.tag), unlabelled);
  const number = open ? open.number : opened(env, title, body);
  if (open && (open.title !== title || (open.body ?? '') !== body))
    r.api('PATCH', `repos/{owner}/{repo}/pulls/${number}`, [`title=${title}`, `body=${body}`]);
  out(`pr: #${number} is ${title}`);
  if (!open?.labels.some((label) => label.name === 'internal'))
    r.api('POST', `repos/{owner}/{repo}/issues/${number}/labels`, ['labels[]=internal']);
  dispatch(out, r, head, number);
  return 0;
};

const USAGE = 'usage: node tools/release/release.ts check | labels | tag | pr';

/** Runs a verb in the repository at the working directory: its exit code. */
export const main = async (argv: string[], env: Env = process.env, out: Out = console.log): Promise<number> => {
  const r = reach(env);
  try {
    switch (argv[0]) {
      case 'check':
        return check(env, out, r);
      case 'labels':
        return labels(out, r);
      case 'tag':
        return tag(out, r);
      case 'pr':
        return pr(env, out, r, r.git('rev-parse', '--show-toplevel'));
      default:
        out(USAGE);
        return 2;
    }
  } catch (error) {
    if (!(error instanceof Refusal)) throw error;
    out(error.message);
    return 1;
  }
};

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
