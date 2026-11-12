/**
 * The release's two workflows and GitHub's generated-notes configuration agree with the release tool (`tools/release/release.ts`).
 *
 * `.github/workflows/release.yml` keeps the release pull request and makes the release its merge asks for; `release-label.yml` is the
 * `release-label` check; `.github/release.yml` groups the notes by label. Its `archive` matrix builds a release's archive on a runner of
 * each platform `tools/release/archive.ts` names, and its `upload` job attaches every asset `install.sh` and the upgrade read, while the
 * release `tag` names has no `latest.json`. Nothing here can run them: their first real verdict is on
 * GitHub. What drifts is held instead — a job granted a write it does not make, a job outside the concurrency that keeps two runs from
 * writing the release branch at once, a check that takes the labels into its command line, a label check that cannot be dispatched
 * with the pull request's number or that does not say the commit it checks, a category for a label the tool no longer has — each a
 * pure function returning a sentence that names the fix, run once on the shipped files and broken once per clause on a planted copy.
 * The clauses every workflow of the repository keeps (GitHub's own actions, a bound on every job and network step, no trigger that
 * hands a fork a writable token) are `ci-workflow.ts`'s, the ones `ci-workflow.test.ts` holds `ci.yml` to.
 *
 * The files are under `.github/`, among the `guards#test` task's inputs in `turbo.json`, so an edit to one makes this suite due.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { actionDrift, stallDrift, statusDrift, targetDrift, type Job, type Workflow } from './ci-workflow.ts';
import { LABELS, type Label } from '../../release/release.ts';
import { PLATFORMS } from '../../release/archive.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

const RELEASE = '.github/workflows/release.yml';
const LABEL_CHECK = '.github/workflows/release-label.yml';
const NOTES = '.github/release.yml';

const text = (file: string): string => fs.readFileSync(path.join(ROOT, file), 'utf8');
const parse = (source: string): Workflow => yaml.load(source) as Workflow;

/** The command every job of the release runs, followed by its verb. */
const TOOL = 'node tools/release/release.ts';

/** The command that builds one platform's archive, followed by its flags. */
const ARCHIVE = 'node tools/release/archive.ts';

/**
 * What each job of the release is: the command it runs, the jobs it waits for, its token's grants, and its concurrency (none for the
 * archive's legs, which one group would cancel while pending). `pr`'s `actions: write` is the dispatch of `DISPATCHED` (`release.ts`)
 * on the release head; `upload`'s `contents: write` attaches the assets.
 */
const JOBS: Record<string, { run: string; needs: string[]; permissions: Record<string, string>; group?: string; cancel?: boolean }> = {
  labels: { run: `${TOOL} labels`, needs: [], permissions: { contents: 'read', issues: 'write' }, group: 'release', cancel: false },
  tag: { run: `${TOOL} tag`, needs: ['labels'], permissions: { contents: 'write' }, group: 'release', cancel: false },
  pr: {
    run: `${TOOL} pr`,
    needs: ['tag'],
    permissions: { actions: 'write', contents: 'write', 'pull-requests': 'write' },
    group: 'release',
    cancel: false,
  },
  archive: { run: ARCHIVE, needs: ['tag'], permissions: { contents: 'read' } },
  upload: {
    run: 'gh release upload',
    needs: ['tag', 'archive'],
    permissions: { contents: 'write' },
    group: 'release-upload',
    cancel: false,
  },
};

/**
 * The runner each platform's archive is built on: GitHub's standard runners of that operating system and architecture (GitHub's
 * "GitHub-hosted runners" reference: `ubuntu-24.04` x64, `ubuntu-24.04-arm` arm64, `macos-15` arm64).
 */
const RUNNERS: Record<(typeof PLATFORMS)[number], string> = {
  'linux-x64': 'ubuntu-24.04',
  'linux-arm64': 'ubuntu-24.04-arm',
  'darwin-arm64': 'macos-15',
};

/** The assets the upload attaches, `latest.json` in the last call, so its presence says the release is whole. */
const ASSETS = ['nemia-*.tar.gz', 'SHA256SUMS', 'install.sh'];
const LAST = 'latest.json';

/** The pull_request events that can change a pull request's labels or its head, each of which reruns the check. */
const TYPES = ['opened', 'reopened', 'synchronize', 'labeled', 'unlabeled'];

/** The check's job, by its id and by the name branch protection will require. */
const CHECK_JOB = 'release-label';

/** The id of the step that runs the check, whose outcome a dispatched run posts as the `release-label` commit status. */
const CHECK_STEP = 'check';

/** The check job's own grants: the workflow's two reads, and the commit status a dispatched run posts. */
const JOB_GRANTS = { contents: 'read', 'pull-requests': 'read', statuses: 'write' };

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
    if (!(job.steps ?? []).some((step) => step.run?.trim().startsWith(want.run) === true))
      sentences.push(`the ${name} job in ${RELEASE} does not run ${want.run}: give it the step that does`);
    if (!same(job.needs ?? [], want.needs))
      sentences.push(
        `the ${name} job in ${RELEASE} needs ${JSON.stringify(job.needs ?? [])}, not ${JSON.stringify(want.needs)}: write needs: ${JSON.stringify(want.needs)}`,
      );
    if (!same(sortedKeys(job.permissions), sortedKeys(want.permissions)))
      sentences.push(
        `the ${name} job in ${RELEASE} is granted ${JSON.stringify(job.permissions ?? {})}, not ${JSON.stringify(want.permissions)}: grant it what it uses and nothing more`,
      );
    if (want.group === undefined) {
      if (job.concurrency !== undefined)
        sentences.push(`the ${name} job in ${RELEASE} is in a concurrency group: take it out, or its matrix legs cancel each other`);
    } else if (job.concurrency?.group !== want.group || job.concurrency?.['cancel-in-progress'] !== want.cancel)
      sentences.push(
        `the ${name} job in ${RELEASE} is not in concurrency ${want.group} with cancel-in-progress: ${String(want.cancel)}: write it so, or two runs write the release at once`,
      );
  }
  return [...sentences, ...dueDrift(workflow), ...archiveDrift(workflow), ...uploadDrift(workflow)];
}

/** A job with what the release's own clauses read beyond `Job`: its outputs and its runner. */
type ReleaseJob = Job & { outputs?: Record<string, string>; 'runs-on'?: string };

/** The tag job's outputs: the tag main names, and whether its release lacks its assets, from its step `due`. */
function dueDrift(workflow: Workflow): string[] {
  const job = workflow.jobs.tag as ReleaseJob | undefined;
  const due = (job?.steps ?? []).find((step) => step.id === 'due');
  const outputs = job?.outputs ?? {};
  if (due === undefined || !outputs.tag?.includes('steps.due.outputs.tag') || !outputs.due?.includes('steps.due.outputs.due'))
    return [
      `the tag job in ${RELEASE} does not output tag and due from a step with id due: add the step that says whether the release lacks ${LAST}, and outputs tag: and due: from it`,
    ];
  return due.run?.includes(LAST) === true
    ? []
    : [`the due step of the tag job in ${RELEASE} does not look for ${LAST}: a release is whole once ${LAST}, attached last, is on it`];
}

/** The archive's matrix: built where the tag job says the assets are due, one leg per platform on its runner, at the tag. */
function archiveDrift(workflow: Workflow): string[] {
  const job = workflow.jobs.archive as ReleaseJob | undefined;
  if (job === undefined) return [];
  const sentences: string[] = [];
  if (!(job.if ?? '').includes("needs.tag.outputs.due == 'true'"))
    sentences.push(`the archive job in ${RELEASE} runs whatever the tag job says: write if: needs.tag.outputs.due == 'true'`);
  const legs = (job.strategy?.matrix?.include ?? []) as { platform?: string; runner?: string }[];
  const given = Object.fromEntries(legs.map((leg) => [String(leg.platform), String(leg.runner)]));
  if (!same(sortedKeys(given), sortedKeys(RUNNERS)) || job['runs-on'] !== '${{ matrix.runner }}')
    sentences.push(
      `the archive job's matrix in ${RELEASE} reads ${JSON.stringify(given)}, not ${JSON.stringify(RUNNERS)} with runs-on: \${{ matrix.runner }}: give each platform of archive.ts a leg on its runner`,
    );
  const build = (job.steps ?? []).find((step) => step.run?.trim().startsWith(ARCHIVE) === true);
  const read = (key: string, from: string) => build?.env?.[key]?.includes(from) === true;
  if (!read('PLATFORM', 'matrix.platform') || !read('TAG', 'needs.tag.outputs.tag') || !read('SOURCE', 'github.repository'))
    sentences.push(
      `the archive job's build in ${RELEASE} is not given PLATFORM from matrix.platform, TAG from needs.tag.outputs.tag and SOURCE from github.repository: pass them through its env`,
    );
  const checkout = (job.steps ?? []).find((step) => step.uses?.startsWith('actions/checkout@') === true);
  if (String(checkout?.with?.ref ?? '').includes('needs.tag.outputs.tag') !== true)
    sentences.push(`the archive job in ${RELEASE} does not check out the tag: give its checkout ref: \${{ needs.tag.outputs.tag }}`);
  return sentences;
}

/** The upload: every asset with --clobber onto the tag's release, `latest.json` in the last call. */
function uploadDrift(workflow: Workflow): string[] {
  const calls = (workflow.jobs.upload?.steps ?? [])
    .flatMap((step) => (step.run ?? '').split('\n'))
    .filter((line) => line.includes('gh release upload'));
  if (calls.length === 0) return [];
  const missing = ASSETS.filter((asset) => !calls.slice(0, -1).some((line) => line.includes(asset)));
  const last = calls.at(-1) ?? '';
  if (missing.length > 0 || !last.includes(LAST) || calls.slice(0, -1).some((line) => line.includes(LAST)))
    return [
      `the upload job in ${RELEASE} does not attach ${ASSETS.join(', ')} and then ${LAST} alone, last: write the two gh release upload calls in that order`,
    ];
  return calls.every((line) => line.includes('--clobber') && line.includes('"$TAG"'))
    ? []
    : [
        `an upload of the upload job in ${RELEASE} has no --clobber or names no "$TAG": write both, so a rerun replaces what an earlier one attached`,
      ];
}

/**
 * The `release-label` workflow: its events, its token, the job branch protection requires, and the check it runs. It has no
 * concurrency group, at the workflow or at a job: a group cancels a run of the check — with cancel-in-progress the running one, and
 * without it, under the default queue, the one pending — and a pull request opened with its labels on fires opened and labeled
 * together, so a cancelled run was what branch protection read for the required context (#665).
 */
function labelDrift(workflow: Workflow): string[] {
  const sentences: string[] = [];
  const pr = workflow.on?.pull_request;
  if (!same([...(pr?.types ?? [])].sort(), [...TYPES].sort()))
    sentences.push(
      `${LABEL_CHECK} does not run on the pull_request types ${TYPES.join(', ')}: list them all, or a label change is never checked`,
    );
  if (!same(pr?.branches, ['main'])) sentences.push(`${LABEL_CHECK} does not run on pull requests into main alone: write branches: [main]`);
  const input = workflow.on?.workflow_dispatch?.inputs?.pr;
  if (input?.required !== true || input.type !== 'string')
    sentences.push(
      `${LABEL_CHECK} has no workflow_dispatch trigger with a required string input pr: add it, so the release can dispatch the check on its head with the pull request's number`,
    );
  if (!same(sortedKeys(workflow.permissions), { contents: 'read', 'pull-requests': 'read' }))
    sentences.push(
      `${LABEL_CHECK}'s permissions are not contents: read and pull-requests: read: it writes nothing, so grant that and no more`,
    );
  const grouped = [workflow.concurrency, ...Object.values(workflow.jobs).map((each) => each.concurrency)].some(
    (each) => each !== undefined,
  );
  if (grouped)
    sentences.push(
      `${LABEL_CHECK} puts its runs in a concurrency group: take the concurrency: block out, so no run of the required ${CHECK_JOB} check is cancelled and every run reports its verdict`,
    );
  const job = workflow.jobs[CHECK_JOB];
  if (job === undefined || job.name !== CHECK_JOB)
    sentences.push(`${LABEL_CHECK} has no job ${CHECK_JOB} named ${CHECK_JOB}: add it, the context branch protection requires`);
  else {
    sentences.push(...statusDrift(workflow, CHECK_JOB, CHECK_JOB, CHECK_STEP, LABEL_CHECK));
    if (job.permissions?.statuses === 'write' && !same(sortedKeys(job.permissions), JOB_GRANTS))
      sentences.push(
        `the ${CHECK_JOB} job in ${LABEL_CHECK} is granted ${JSON.stringify(job.permissions)}, not ${JSON.stringify(JOB_GRANTS)}: its permissions replace the top-level ones, so repeat the two reads beside statuses: write and grant nothing more`,
      );
    const checks = (job.steps ?? []).filter((step) => step.run?.trim() === `${TOOL} check`);
    const live = (env: Record<string, string> | undefined) =>
      env?.PR_NUMBER !== undefined && env.GH_TOKEN !== undefined && env.LABELS === undefined;
    if (checks.length === 0 || !checks.every((step) => live(step.env)))
      sentences.push(
        `the ${CHECK_JOB} job in ${LABEL_CHECK} does not run ${TOOL} check with env PR_NUMBER and GH_TOKEN and no LABELS: ` +
          'pass those, so a run reads the labels the pull request has then, not its payload',
      );
    else if (
      !checks.every((step) => step.env?.PR_NUMBER.includes('github.event.pull_request.number') && step.env.PR_NUMBER.includes('inputs.pr'))
    )
      sentences.push(
        `the ${CHECK_JOB} job's PR_NUMBER in ${LABEL_CHECK} does not read both github.event.pull_request.number and inputs.pr: ` +
          'write ${{ github.event.pull_request.number || inputs.pr }}, so a dispatched run names its pull request',
      );
    if (checks.length > 0 && !checks.every((step) => step.env?.HEAD_SHA?.includes('github.sha') === true))
      sentences.push(
        `the ${CHECK_JOB} job in ${LABEL_CHECK} passes no HEAD_SHA from github.sha: ` +
          "write ${{ github.event_name == 'workflow_dispatch' && github.sha || '' }}, so a dispatched run checks only the pull request whose head it is on",
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

test('REFUSED: a missing release-label job, its runs in a concurrency group, the check not dispatchable with its pull request, no head to compare, labels from the payload, labels interpolated into a command, a type unlisted, and a status posted on every event, under another name or ungranted', () => {
  const all = (label: string, release = text(RELEASE)) => drift(release, label, text(NOTES));
  refused(
    all(planted(LABEL_CHECK, '  release-label:\n    name: release-label\n', '  label:\n    name: label\n')),
    CHECK_JOB,
    'no release-label job',
  );
  refused(all(planted(LABEL_CHECK, '        required: true\n', '        required: false\n')), 'input pr', 'the pr input not required');
  refused(
    all(
      planted(LABEL_CHECK, '\njobs:\n', '\nconcurrency:\n  group: release-label-${{ github.ref }}\n  cancel-in-progress: false\n\njobs:\n'),
    ),
    'concurrency',
    'two runs of the required check in one group, one cancelled',
  );
  refused(all(planted(LABEL_CHECK, ' || inputs.pr }}', ' }}')), 'inputs.pr', 'a dispatched run given no number');
  refused(
    all(planted(LABEL_CHECK, /^ {10}HEAD_SHA:.*\n/m.exec(text(LABEL_CHECK))?.[0] ?? 'HEAD_SHA', '')),
    'HEAD_SHA',
    'no head to compare',
  );
  refused(
    all(
      planted(
        LABEL_CHECK,
        '          PR_NUMBER:',
        '          LABELS: ${{ toJSON(github.event.pull_request.labels.*.name) }}\n          PR_NUMBER:',
      ),
    ),
    'LABELS',
    "the payload's labels put back",
  );
  const head = "          HEAD_SHA: ${{ github.event_name == 'workflow_dispatch' && github.sha || '' }}\n";
  refused(all(planted(LABEL_CHECK, `${head}          GH_TOKEN: \${{ github.token }}\n`, head)), 'GH_TOKEN', 'the live read given no token');
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
  refused(
    all(
      planted(
        LABEL_CHECK,
        "      - name: Post the release-label status's result\n        if: always() && github.event_name == 'workflow_dispatch'\n",
        "      - name: Post the release-label status's result\n        if: always()\n",
      ),
    ),
    'every event',
    'the result posted on a pull_request event too',
  );
  refused(
    all(planted(LABEL_CHECK, '          CONTEXT: release-label\n', '          CONTEXT: label\n')),
    `the context ${CHECK_JOB}`,
    'the status under another name',
  );
  refused(all(planted(LABEL_CHECK, '      statuses: write\n', '')), 'statuses: write', 'the job not granted the status it posts');
  refused(
    all(planted(LABEL_CHECK, '      pull-requests: read\n      statuses: write\n', '      pull-requests: write\n      statuses: write\n')),
    'grant nothing more',
    'the job granted a write it does not make',
  );
});

test('REFUSED: a job granted a write it does not make, a job the release does not name, a job out of its concurrency, a job waiting on the wrong one, and a verb swapped', () => {
  const all = (release: string) => drift(release, text(LABEL_CHECK), text(NOTES));
  refused(
    all(planted(RELEASE, '      contents: read\n      issues: write\n', '      contents: write\n      issues: write\n')),
    'the labels job',
    'labels granted contents: write',
  );
  refused(all(planted(RELEASE, '      actions: write\n', '')), 'the pr job', 'pr not granted the dispatch it makes');
  refused(
    all(
      `${text(RELEASE)}\n  proof:\n    needs: [pr]\n    runs-on: ubuntu-latest\n    timeout-minutes: 45\n    steps:\n      - run: ${TOOL} proof\n        timeout-minutes: 42\n`,
    ),
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

test("REFUSED: a platform's leg gone or on another runner, the archive built whatever the tag job says or off the tag, latest.json attached before the rest, an upload that cannot rerun, and no due step", () => {
  const all = (release: string) => drift(release, text(LABEL_CHECK), text(NOTES));
  refused(all(planted(RELEASE, '          - platform: darwin-arm64\n            runner: macos-15\n', '')), 'matrix', 'the macOS leg gone');
  refused(all(planted(RELEASE, 'runner: ubuntu-24.04-arm\n', 'runner: ubuntu-24.04\n')), 'matrix', 'the arm leg built on x64');
  refused(all(planted(RELEASE, "    if: needs.tag.outputs.due == 'true'\n", '')), 'due', 'every push rebuilding the archives');
  refused(
    all(planted(RELEASE, '          PLATFORM: ${{ matrix.platform }}\n', '          PLATFORM: linux-x64\n')),
    'PLATFORM',
    'every leg building one platform',
  );
  refused(
    all(
      planted(
        RELEASE,
        '        with:\n          ref: ${{ needs.tag.outputs.tag }}\n      - uses: actions/setup-node@v7',
        '      - uses: actions/setup-node@v7',
      ),
    ),
    'check out the tag',
    'the archive built from the pushed commit',
  );
  refused(
    all(
      planted(
        RELEASE,
        'assets/SHA256SUMS assets/install.sh --clobber\n          gh release upload "$TAG" assets/latest.json --clobber\n',
        'assets/SHA256SUMS assets/install.sh assets/latest.json --clobber\n',
      ),
    ),
    'latest.json alone, last',
    'latest.json attached with the rest',
  );
  refused(
    all(planted(RELEASE, 'gh release upload "$TAG" assets/latest.json --clobber', 'gh release upload "$TAG" assets/latest.json')),
    '--clobber',
    'a rerun refused by an asset already there',
  );
  refused(all(planted(RELEASE, '        id: due\n', '')), 'id due', 'no step says the assets are due');
  refused(all(planted(RELEASE, '    needs: [tag, archive]\n', '    needs: [tag]\n')), 'the upload job', 'the upload before the archives');
});
