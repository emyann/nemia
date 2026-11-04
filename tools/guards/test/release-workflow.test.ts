/**
 * The release's two workflows and GitHub's generated-notes configuration agree with the release tool (`tools/release/release.ts`).
 *
 * `.github/workflows/release.yml` keeps the release pull request and makes the release its merge asks for; `release-label.yml` is the
 * `release-label` check; `.github/release.yml` groups the notes by label. Nothing here can run them: their first real verdict is on
 * GitHub. What drifts is held instead — a job granted a write it does not make, a job outside the concurrency that keeps two runs from
 * writing the release branch at once, a check that takes the labels into its command line, a category for a label the tool no longer
 * has — each a pure function returning a sentence that names the fix, run once on the shipped files and broken once per clause on a
 * planted copy. The clauses every workflow of the repository keeps (GitHub's own actions, a bound on every job and network step, no
 * trigger that hands a fork a writable token) are `ci-workflow.ts`'s, the ones `ci-workflow.test.ts` holds `ci.yml` to.
 *
 * The files are under `.github/`, among the `guards#test` task's inputs in `turbo.json`, so an edit to one makes this suite due.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { actionDrift, stallDrift, targetDrift, type Workflow } from './ci-workflow.ts';
import { LABELS, type Label } from '../../release/release.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

const RELEASE = '.github/workflows/release.yml';
const LABEL_CHECK = '.github/workflows/release-label.yml';
const NOTES = '.github/release.yml';

const text = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const parse = (source: string): Workflow => yaml.load(source) as Workflow;

/** The command every job of the release runs, followed by its verb. */
const TOOL = 'node tools/release/release.ts';

/** What each job of the release is: the verb it runs, the jobs it waits for, its token's grants, and its concurrency. */
const JOBS: Record<string, { needs: string[]; permissions: Record<string, string>; group: string; cancel: boolean }> = {
  labels: { needs: [], permissions: { contents: 'read', issues: 'write' }, group: 'release', cancel: false },
  tag: { needs: ['labels'], permissions: { contents: 'write' }, group: 'release', cancel: false },
  pr: { needs: ['tag'], permissions: { contents: 'write', 'pull-requests': 'write' }, group: 'release', cancel: false },
};

/** The pull_request events that can change a pull request's labels or its head, each of which reruns the check. */
const TYPES = ['opened', 'reopened', 'synchronize', 'labeled', 'unlabeled'];

/** The check's job, by its id and by the name branch protection will require. */
const CHECK_JOB = 'release-label';

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const sortedKeys = (value: Record<string, string> | undefined) =>
  Object.fromEntries(Object.entries(value ?? {}).sort(([a], [b]) => a.localeCompare(b)));

/** Where a workflow takes an expression into a command line, rather than through env: a label or a branch name is anyone's to write. */
function interpolationDrift(workflow: Workflow, file: string): string[] {
  return Object.entries(workflow.jobs).flatMap(([name, job]) =>
    (job.steps ?? [])
      .filter((step) => step.run?.includes('${{') === true)
      .map(
        (step) =>
          `the step "${step.name ?? step.run}" of the ${name} job in ${file} interpolates an expression into its run: pass it through the step's env and read it from there`,
      ),
  );
}

/** The release workflow against `JOBS`: its triggers, its token, and each job's verb, wait, grants and concurrency. */
function releaseDrift(workflow: Workflow): string[] {
  const sentences: string[] = [];
  if (!same(workflow.on?.push?.branches, ['main']))
    sentences.push(`${RELEASE} does not run on a push to main: give it on.push.branches [main], so every landing is read`);
  if (workflow.on === undefined || !('workflow_dispatch' in workflow.on))
    sentences.push(`${RELEASE} has no workflow_dispatch trigger: add it, so a relabelled pull request is read again by hand`);
  if (!same(workflow.permissions, { contents: 'read' }))
    sentences.push(`${RELEASE}'s top-level permissions are not contents: read alone: write that, and grant each job its own writes`);
  for (const name of Object.keys(workflow.jobs))
    if (!(name in JOBS))
      sentences.push(`${RELEASE} has a job ${name} the release does not name: take it out, or add it to JOBS here with its grants`);
  for (const [name, want] of Object.entries(JOBS)) {
    const job = workflow.jobs[name];
    if (job === undefined) {
      sentences.push(`${RELEASE} has no ${name} job: add it, running ${TOOL} ${name}`);
      continue;
    }
    if (!(job.steps ?? []).some((step) => step.run?.trim() === `${TOOL} ${name}`))
      sentences.push(`the ${name} job in ${RELEASE} does not run ${TOOL} ${name}: give it the step that does`);
    if (!same(job.needs ?? [], want.needs))
      sentences.push(
        `the ${name} job in ${RELEASE} needs ${JSON.stringify(job.needs ?? [])}, not ${JSON.stringify(want.needs)}: write needs: ${JSON.stringify(want.needs)}`,
      );
    if (!same(sortedKeys(job.permissions), sortedKeys(want.permissions)))
      sentences.push(
        `the ${name} job in ${RELEASE} is granted ${JSON.stringify(job.permissions ?? {})}, not ${JSON.stringify(want.permissions)}: grant it what it uses and nothing more`,
      );
    if (job.concurrency?.group !== want.group || job.concurrency?.['cancel-in-progress'] !== want.cancel)
      sentences.push(
        `the ${name} job in ${RELEASE} is not in concurrency ${want.group} with cancel-in-progress: ${want.cancel}: write it so, or two runs write the release at once`,
      );
  }
  return sentences;
}

/** The `release-label` workflow: its events, its token, the job branch protection requires, and the check it runs. */
function labelDrift(workflow: Workflow): string[] {
  const sentences: string[] = [];
  const pr = workflow.on?.pull_request;
  if (!same([...(pr?.types ?? [])].sort(), [...TYPES].sort()))
    sentences.push(
      `${LABEL_CHECK} does not run on the pull_request types ${TYPES.join(', ')}: list them all, or a label change is never checked`,
    );
  if (!same(pr?.branches, ['main'])) sentences.push(`${LABEL_CHECK} does not run on pull requests into main alone: write branches: [main]`);
  if (workflow.on !== undefined && 'workflow_dispatch' in workflow.on)
    sentences.push(
      `${LABEL_CHECK} has a workflow_dispatch trigger: take it out, since a dispatched run never counts for a pull request's required check`,
    );
  if (!same(sortedKeys(workflow.permissions), { contents: 'read', 'pull-requests': 'read' }))
    sentences.push(
      `${LABEL_CHECK}'s permissions are not contents: read and pull-requests: read: it writes nothing, so grant that and no more`,
    );
  const job = workflow.jobs[CHECK_JOB];
  if (job === undefined || job.name !== CHECK_JOB)
    sentences.push(`${LABEL_CHECK} has no job ${CHECK_JOB} named ${CHECK_JOB}: add it, the context branch protection requires`);
  else {
    const checks = (job.steps ?? []).filter((step) => step.run?.trim() === `${TOOL} check`);
    const live = (env: Record<string, string> | undefined) =>
      env?.PR_NUMBER !== undefined && env.GH_TOKEN !== undefined && env.LABELS === undefined;
    if (checks.length === 0 || !checks.every((step) => live(step.env)))
      sentences.push(
        `the ${CHECK_JOB} job in ${LABEL_CHECK} does not run ${TOOL} check with env PR_NUMBER and GH_TOKEN and no LABELS: ` +
          'pass those, so an approved run reads the labels the pull request has then, not its payload',
      );
  }
  return sentences;
}

type Notes = { changelog?: { exclude?: { labels?: string[] }; categories?: { title?: string; labels?: string[] }[] } };

/** `.github/release.yml` against `LABELS`: a category for each label that releases, in order, `internal` left out, the catch-all last. */
function categoryDrift(config: Notes, labels: readonly Label[]): string[] {
  const sentences: string[] = [];
  const categories = config.changelog?.categories ?? [];
  const released = labels.filter((label) => label.bump !== 'none').map((label) => [label.name]);
  const given = categories.map((category) => category.labels ?? []);
  if (!same(given, [...released, ['*']]))
    sentences.push(
      `${NOTES}'s categories read ${JSON.stringify(given)}, not ${JSON.stringify([...released, ['*']])}: give each release label of LABELS a category in its order, and the catch-all '*' last`,
    );
  const silent = labels.filter((label) => label.bump === 'none').map((label) => label.name);
  if (!same(config.changelog?.exclude?.labels ?? [], silent))
    sentences.push(
      `${NOTES} excludes ${JSON.stringify(config.changelog?.exclude?.labels ?? [])}, not ${JSON.stringify(silent)}: exclude the labels that release nothing`,
    );
  return sentences;
}

/** Every clause, over a release workflow, a label workflow and a notes configuration, given as text. */
const drift = (release: string, label: string, notes: string, labels: readonly Label[] = LABELS): string[] => [
  ...releaseDrift(parse(release)),
  ...labelDrift(parse(label)),
  ...categoryDrift(yaml.load(notes) as Notes, labels),
  ...[
    [RELEASE, release],
    [LABEL_CHECK, label],
  ].flatMap(([file, source]) => [
    ...actionDrift(parse(source), file),
    ...stallDrift(parse(source), file),
    ...targetDrift(source, file),
    ...interpolationDrift(parse(source), file),
  ]),
];

test('the shipped release workflows and notes configuration agree with the release tool', () => {
  const release = parse(text(RELEASE));
  assert.ok(Object.keys(release).includes('on'), 'js-yaml reads the on: key as a string');
  assert.deepEqual(Object.keys(release.jobs), Object.keys(JOBS), 'the clauses read every job');
  assert.deepEqual(drift(text(RELEASE), text(LABEL_CHECK), text(NOTES)), []);
});

/** `sentences` refuse once, naming `token`. */
const refused = (sentences: string[], token: string, why: string): void => {
  assert.equal(sentences.length, 1, `${why}: ${sentences.join(' | ')}`);
  assert.ok(sentences[0].includes(token), `${why}: the sentence names ${token}`);
};

/** The shipped text of `file` with `from` replaced once by `to`, refusing a replacement that changed nothing. */
const planted = (file: string, from: string, to: string): string => {
  const source = text(file);
  assert.ok(source.includes(from), `${file} holds ${JSON.stringify(from)} today`);
  return source.replace(from, to);
};

test("REFUSED: a third party's action, a job with no bound, a network step with none, and the trigger that hands a fork a writable token", () => {
  const all = (release: string, label = text(LABEL_CHECK)) => drift(release, label, text(NOTES));
  refused(
    all(planted(RELEASE, 'actions/setup-node@v7', ['a', 'third', 'party'].join('-') + '/setup-node@v1')),
    'third-party',
    'a third party',
  );
  refused(all(planted(RELEASE, '    timeout-minutes: 15\n', '')), 'the pr job', 'a job with no bound');
  refused(all(planted(RELEASE, '        timeout-minutes: 10\n', '')), 'Keep the release pull request', 'the pr step with no bound');
  const target = ['pull', 'request', 'target'].join('_');
  refused(
    all(text(RELEASE), planted(LABEL_CHECK, '    branches: [main]\n', `    branches: [main]\n  ${target}:\n`)),
    target,
    'the writable trigger',
  );
});

test('REFUSED: a missing release-label job, a dispatch trigger on the check, labels from the payload, labels interpolated into a command, and a type unlisted', () => {
  const all = (label: string, release = text(RELEASE)) => drift(release, label, text(NOTES));
  refused(
    all(planted(LABEL_CHECK, '  release-label:\n    name: release-label\n', '  label:\n    name: label\n')),
    CHECK_JOB,
    'no release-label job',
  );
  refused(
    all(planted(LABEL_CHECK, '    branches: [main]\n', '    branches: [main]\n  workflow_dispatch:\n')),
    'workflow_dispatch',
    'the label check dispatched again',
  );
  refused(
    all(planted(LABEL_CHECK, '          PR_NUMBER:', '          LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}\n          PR_NUMBER:')),
    'LABELS',
    "the payload's labels put back",
  );
  refused(all(planted(LABEL_CHECK, '          GH_TOKEN: ${{ github.token }}\n', '')), 'GH_TOKEN', 'the live read given no token');
  refused(all(text(LABEL_CHECK), planted(RELEASE, '  workflow_dispatch:\n', '')), 'workflow_dispatch', "the release's dispatch gone");
  refused(
    all(
      planted(
        LABEL_CHECK,
        "          node-version: '24.16.0'\n",
        "          node-version: '24.16.0'\n      - run: echo '${{ github.event.pull_request.title }}'\n",
      ),
    ),
    'interpolates',
    'the labels in the command line',
  );
  refused(all(planted(LABEL_CHECK, ', unlabeled]', ']')), 'unlabeled', 'a label taken off, never checked');
});

test('REFUSED: a job granted a write it does not make, a job the release does not name, a job out of its concurrency, a job waiting on the wrong one, and a verb swapped', () => {
  const all = (release: string) => drift(release, text(LABEL_CHECK), text(NOTES));
  refused(
    all(planted(RELEASE, '      contents: read\n      issues: write\n', '      contents: write\n      issues: write\n')),
    'the labels job',
    'labels granted contents: write',
  );
  refused(
    all(planted(RELEASE, '      pull-requests: write\n', '      pull-requests: write\n      actions: write\n')),
    'the pr job',
    'pr granted the dispatch it no longer makes',
  );
  refused(
    all(`${text(RELEASE)}\n  proof:\n    needs: [pr]\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n    steps:\n      - run: ${TOOL} proof\n        timeout-minutes: 42\n`),
    'a job proof the release does not name',
    'a proof job put back',
  );
  refused(
    all(planted(RELEASE, '      cancel-in-progress: false\n', '      cancel-in-progress: true\n')),
    'the labels job',
    'labels cancelled by a newer run',
  );
  refused(all(planted(RELEASE, '    needs: [tag]\n', '    needs: [labels]\n')), 'the pr job', 'pr ahead of the tag');
  refused(
    all(planted(RELEASE, 'run: node tools/release/release.ts tag', 'run: node tools/release/release.ts pr')),
    'the tag job',
    'the tag job running pr',
  );
});

test('REFUSED: a category drifted from LABELS, internal given a category, and the catch-all not last', () => {
  const notes = (config: string, labels: readonly Label[] = LABELS) => drift(text(RELEASE), text(LABEL_CHECK), config, labels);
  refused(notes(planted(NOTES, '    - title: Docs\n      labels:\n        - docs\n', '')), NOTES, 'the docs category gone');
  refused(
    notes(text(NOTES), [...LABELS, { name: 'perf', bump: 'patch', color: '000000', description: 'x' }]),
    NOTES,
    'a label of LABELS with no category',
  );
  refused(notes(planted(NOTES, '    labels:\n      - internal\n', '    labels:\n      - wontfix\n')), 'excludes', 'internal not excluded');
  const notLast = planted(NOTES, "    - title: Not labelled\n      labels:\n        - '*'\n", '').replace(
    '  categories:\n',
    "  categories:\n    - title: Not labelled\n      labels:\n        - '*'\n",
  );
  refused(notes(notLast), NOTES, 'the catch-all first');
});
