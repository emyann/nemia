/**
 * Nemia's releases: a pull request a workflow keeps open, and the tag and the GitHub release its merge makes (`README.md` beside this
 * file). The repository's own tool, never shipped; it imports nothing installed, and reaches git and GitHub only through `git` and
 * `gh`, each call bounded.
 *
 * - `check`: the `release-label` check. Exactly one of `LABELS` on the pull request, read from `LABELS` (a JSON array of names, the
 *   pull_request payload's) or, unset, from the open pull request whose head is `BRANCH`.
 * - `labels`: makes the five labels in the repository, and puts back the colour or description of one that drifted.
 * - `tag`: where the root `package.json` names a version `V` that has no tag `vV`, makes the GitHub release `vV` on the first-parent
 *   commit of main that set `V`, with the notes GitHub generates since the previous release.
 * - `pr`: keeps the release pull request (`release` into `main`) open while a pull request merged since the last release carries a label
 *   that releases, rebuilt from main when main moves, and dispatches `ci.yml` and `release-label.yml` on its head; closes it when
 *   nothing is to release.
 * - `proof`: waits, bounded, for the head's `ci` and `release-label` check runs and fails unless `ci` is green and required there.
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

/** The workflows the release pull request's head is dispatched, with the check run each reports. */
export const DISPATCHED = [
  { file: 'ci.yml', check: 'ci' },
  { file: 'release-label.yml', check: 'release-label' },
] as const;

/** How long `proof` waits for the head's check runs, and how often it asks: the shipped bounds, lowered for a test by the env below. */
export const PROOF_BOUND_MS = 40 * 60_000;
export const PROOF_INTERVAL_MS = 30_000;
export const PROOF_BOUND_ENV = 'RELEASE_PROOF_BOUND_MS';
export const PROOF_INTERVAL_ENV = 'RELEASE_PROOF_INTERVAL_MS';

/** The bound on one `git` or `gh` call: a stalled network fails the call, never the job's whole bound. */
const CALL_MS = 120_000;

/** Who commits the version on `release`: the workflow, as GitHub names its own token's user. */
const IDENTITY = ['-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];

/** The setting GitHub refuses the token's pull request without, and the merge box's button `proof` sends a person to. */
export const CREATE_SETTING = 'Allow GitHub Actions to create and approve pull requests';
export const APPROVE_BUTTON = 'Approve workflows to run';

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
  head?: { ref: string };
};

/** The open pull request whose head is `branch`, into main, or `undefined`. */
const openPull = (r: Reach, branch: string): Pull | undefined =>
  r.api<Pull[]>('GET', `repos/{owner}/{repo}/pulls?state=open&base=${BASE}&head={owner}:${branch}&per_page=100`)[0];

const releaseLabels = (labels: readonly string[]): string[] => labels.filter((name) => LABELS.some((label) => label.name === name));

const addCommand = (number: string | undefined): string =>
  `gh api -X POST repos/{owner}/{repo}/issues/${number ?? '<number>'}/labels -f 'labels[]=<label>'`;

/** `check`: exactly one release label. */
const check = (env: Env, out: Out, r: Reach): number => {
  let labels: unknown;
  let number = env.PR_NUMBER;
  if (env.LABELS !== undefined) {
    try {
      labels = JSON.parse(env.LABELS);
    } catch {
      labels = undefined;
    }
  } else {
    const branch = env.BRANCH;
    if (!branch)
      throw new Refusal(
        'release-label: set LABELS to the pull request labels as a JSON array, or BRANCH to the head branch of an open pull request into main',
      );
    const pull = openPull(r, branch);
    if (!pull)
      throw new Refusal(
        `release-label: no open pull request into ${BASE} has head ${branch}: open it, then dispatch this workflow again on ${branch}`,
      );
    labels = pull.labels.map((label) => label.name);
    number = String(pull.number);
  }
  if (!Array.isArray(labels) || labels.some((label) => typeof label !== 'string'))
    throw new Refusal('release-label: LABELS is no JSON array of names: pass toJSON(github.event.pull_request.labels.*.name) through env');
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

/** The release pull request's body: GitHub's generated notes, then the pull requests no label counted, within GitHub's bound. */
const bodyOf = (generated: string, unlabelled: Pull[]): string => {
  let body = `${generated}\n`;
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

/** Dispatches each of `DISPATCHED` on the release branch where `head` has no dispatched run of it yet. */
const dispatch = (out: Out, r: Reach, head: string): void => {
  for (const { file } of DISPATCHED) {
    const runs = r.api<{ total_count: number }>(
      'GET',
      `repos/{owner}/{repo}/actions/workflows/${file}/runs?head_sha=${head}&event=workflow_dispatch&per_page=1`,
    );
    if (runs.total_count > 0) continue;
    r.gh(['workflow', 'run', file, '--ref', BRANCH]);
    out(`pr: dispatched ${file} on ${BRANCH} at ${head}`);
  }
};

const labelsOf = (pull: Pull): string[] => pull.labels.map((label) => label.name);

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
  dispatch(out, r, head);
  return 0;
};

type CheckRun = { __typename?: string; name?: string; status?: string; conclusion?: string | null; isRequired?: boolean };
type Proof = {
  data?: {
    repository?: {
      pullRequest?: {
        headRefOid: string;
        mergeStateStatus: string;
        commits: { nodes: { commit: { oid: string; statusCheckRollup: { contexts: { nodes: CheckRun[] } } | null } }[] };
      };
    };
  };
};

const PROOF_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      headRefOid
      mergeStateStatus
      commits(last: 1) { nodes { commit { oid statusCheckRollup { contexts(first: 100) { nodes {
        __typename
        ... on CheckRun { name status conclusion isRequired(pullRequestNumber: $number) }
      } } } } } }
    }
  }
}`;

const boundOf = (env: Env, key: string, shipped: number): number => {
  const given = Number(env[key]);
  return env[key] !== undefined && Number.isFinite(given) && given > 0 ? given : shipped;
};

/** The release pull request's head as GraphQL reads it: its completed `ci` and `release-label` check runs, and its merge state. */
const headOf = (r: Reach, number: number) => {
  const answer = JSON.parse(
    r.gh(['api', 'graphql', '-f', `query=${PROOF_QUERY}`, '-F', 'owner={owner}', '-F', 'name={repo}', '-F', `number=${number}`]),
  ) as Proof;
  const pull = answer.data?.repository?.pullRequest;
  const commit = pull?.commits.nodes[0]?.commit;
  const runs = commit?.statusCheckRollup?.contexts.nodes ?? [];
  const done = (name: string) => runs.filter((run) => run.name === name && run.status === 'COMPLETED');
  return { oid: commit?.oid ?? '', merge: pull?.mergeStateStatus ?? 'UNKNOWN', ci: done('ci'), label: done('release-label') };
};

/** Judges a completed `ci`: 0 where one is green and required, else the refusal naming the merge box's button. */
const judged = (out: Out, number: number, head: ReturnType<typeof headOf>): number => {
  const green = head.ci.find((run) => run.conclusion === 'SUCCESS');
  const required = (green ?? head.ci[0]).isRequired === true;
  out(
    `proof: #${number} at ${head.oid}: ci ${green ? 'SUCCESS' : head.ci[0].conclusion}, ${required ? 'required' : 'not required'}; ` +
      `release-label ${head.label[0]?.conclusion ?? 'not yet'}; mergeStateStatus ${head.merge}`,
  );
  if (green && required) return 0;
  throw new Refusal(
    `proof: the dispatched ci on #${number}'s head is ${green ? "green but not counted by main's protection" : 'not green'}. ` +
      `Open the pull request and press "${APPROVE_BUTTON}" in its merge box, which runs the waiting pull_request ci that counts`,
  );
};

/** `proof`: the dispatched `ci` is green and required on the release pull request's head, asked until both checks complete or the bound. */
const proof = async (env: Env, out: Out, r: Reach): Promise<number> => {
  const bound = boundOf(env, PROOF_BOUND_ENV, PROOF_BOUND_MS);
  const interval = boundOf(env, PROOF_INTERVAL_ENV, PROOF_INTERVAL_MS);
  const deadline = performance.now() + bound;
  for (;;) {
    const open = openPull(r, BRANCH);
    if (!open) {
      out('proof: no release pull request is open: nothing to prove');
      return 0;
    }
    const head = headOf(r, open.number);
    const late = performance.now() >= deadline;
    if (head.ci.length && (head.label.length || late)) return judged(out, open.number, head);
    if (late)
      throw new Refusal(
        `proof: no completed ci check run on #${open.number}'s head ${head.oid} within ${Math.round(bound / 60_000)} minutes: ` +
          `run gh workflow run ci.yml --ref ${BRANCH}, or press "${APPROVE_BUTTON}" in the pull request's merge box`,
      );
    await new Promise((resolve) => setTimeout(resolve, interval));
  }
};

const USAGE = 'usage: node tools/release/release.ts check | labels | tag | pr | proof';

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
      case 'proof':
        return await proof(env, out, r);
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
