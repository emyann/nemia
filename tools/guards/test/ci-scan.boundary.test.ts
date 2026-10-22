/**
 * The scan job's own two verdicts: which commits it reads, and what it refuses.
 *
 * A boundary test, and the real thing is its whole subject — both are shell scripts, and a stand-in for the shell would decide nothing.
 * So each is run as GitHub runs it, `bash -e` over a file, with an executable `gitleaks` beside it that records the arguments it was
 * handed, writes the report the test plants, and exits the code the test sets. Matching the steps' text would prove nothing about
 * either: a range chooser that resolves to the wrong commits, and a comparison that notices a widened allowlist and exits 0 all the
 * same, read alike to a pattern — and each is a green job that scanned nothing, which is the one failure the job exists to prevent.
 *
 * What the stub cannot prove is what gitleaks itself allows: a configuration's meaning is in the binary, which is why the job proves
 * that on every run against the real one. This file proves the step's own arithmetic and that each of its refusals fires.
 *
 * No stub secret is written here: the shapes are read out of the file the allowlist is for, as the step reads them, and the controls are
 * generated, so this file holds no string a gitleaks rule matches.
 *
 * Where the steps are is `ci-workflow.ts` (`scanStep`, `allowlistStep`, `ALLOWLIST_STEP`); the workflow's agreement with the repository
 * is held in `ci-workflow.test.ts`, which refuses a scan without its flags and an allowlist that is not scoped to its rule.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { allowlistStep, readWorkflow, SCAN_CONFIG, scanStep } from './ci-workflow.ts';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** Where the runtime writes its deliberate stub secrets: the one file the allowlist names, read here as the step reads it. */
const STUBS = 'packages/agent-runtime/test/remote-agent.test.ts';

/** A commit of this repository's own history, as a `before` that resolves, and the tip the push is read up to. */
const BEFORE_SHA = '075bc076c62ecde2cce8558766c0139cb6747b55';
const HEAD = '332db4b48aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

/** The shapes the allowlist is for, read off the file it is for, so no string of that shape is written in this one. */
const stubShapes = (): string[] => {
  const found = [...fs.readFileSync(path.join(ROOT, STUBS), 'utf8').matchAll(/(?:tok|key)-[\da-f]{4}-SECRET(?:-[\da-f]{4})?/g)].map(
    (m) => m[0],
  );
  return [...new Set(found)].sort();
};

/** A secret of another rule, and one of the same rule and another shape: the controls, generated so neither is written down. */
const controls = (): { Secret: string; RuleID: string }[] => [
  { Secret: `ghp_${crypto.randomBytes(18).toString('hex')}`, RuleID: 'github-pat' },
  { Secret: crypto.randomBytes(32).toString('hex'), RuleID: 'generic-api-key' },
];

type Finding = { File: string; RuleID: string; Secret: string; StartLine: number };

const findings = (file: string, secrets: readonly { Secret: string; RuleID: string }[]): Finding[] =>
  secrets.map((s, at) => ({ File: `./${file}`, RuleID: s.RuleID, Secret: s.Secret, StartLine: at + 1 }));

/**
 * A runner's workspace: the stub binary as the download step leaves it, `SCAN_CONFIG`, and the file the stub shapes are read from. The
 * stub records `"$@"` in a log, copies the report the test planted for this invocation (`configured` where `--config` was passed, `bare`
 * where it was not), and exits `STUB_EXIT`. It reads both out of its own directory, so nothing of the test's reaches the step's
 * environment but the exit code.
 */
function workspace(): { dir: string; log: string; reports: string } {
  const dir = scratch('ci-scan-');
  const log = path.join(dir, 'gitleaks.log');
  const reports = path.join(dir, 'reports');
  fs.mkdirSync(reports);
  fs.mkdirSync(path.join(dir, path.dirname(STUBS)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, STUBS), path.join(dir, STUBS));
  fs.copyFileSync(path.join(ROOT, SCAN_CONFIG), path.join(dir, SCAN_CONFIG));
  fs.writeFileSync(
    path.join(dir, 'gitleaks'),
    [
      '#!/usr/bin/env bash',
      'here=$(cd "$(dirname "$0")" && pwd)',
      'printf "%s\\n" "$*" >> "$here/gitleaks.log"',
      'report=; want=bare; prev=',
      'for a in "$@"; do',
      '  if [ "$prev" = --report-path ]; then report=$a; fi',
      '  if [ "$a" = --config ]; then want=configured; fi',
      '  prev=$a',
      'done',
      'if [ -n "$report" ]; then cp "$here/reports/$want.json" "$report" || true; fi',
      'exit "${STUB_EXIT:-0}"',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
  return { dir, log, reports };
}

/** A step of the job, run as GitHub runs it: `bash -e` over a file, in the workspace, with nothing of this run's in its environment. */
function verdictOf(run: string, dir: string, env: Record<string, string>): { status: number; said: string } {
  const file = path.join(scratch('ci-scan-step-'), 'step.sh');
  fs.writeFileSync(file, run);
  const ran = spawnSync('bash', ['-e', file], {
    cwd: dir,
    env: { PATH: process.env.PATH, HOME: dir, GITHUB_WORKSPACE: dir, ...env },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: ran.status ?? -1, said: `${ran.stdout}${ran.stderr}` };
}

/** The `--log-opts` value the step handed the binary: the commits it actually read, which no reading of the YAML gives. */
const rangeIn = (log: string): string => /--log-opts (\S+)/.exec(fs.readFileSync(log, 'utf8'))?.[1] ?? '';

const scanRun = (): string => {
  const step = scanStep(readWorkflow());
  assert.ok(step?.run !== undefined, 'the scan job has its scan step today');
  return step.run;
};

test('the scan reads the push’s own new commits, on a pull request, a push, a first push and a dispatch', () => {
  const run = scanRun();
  for (const [why, env, range] of [
    ['a pull request names its base and its head', { BASE: BEFORE_SHA, HEAD_SHA: HEAD }, `${BEFORE_SHA}..${HEAD}`],
    ['a push names the commit it was at before', { BEFORE: BEFORE_SHA, GITHUB_SHA: HEAD }, `${BEFORE_SHA}..${HEAD}`],
    ['a branch’s first push has no commit before it', { BEFORE: '0'.repeat(40), GITHUB_SHA: HEAD }, `${HEAD}~1..${HEAD}`],
    ['workflow_dispatch names neither', { GITHUB_SHA: HEAD }, `${HEAD}~1..${HEAD}`],
  ] as const) {
    const ws = workspace();
    const ran = verdictOf(run, ws.dir, env);
    assert.equal(ran.status, 0, `${why}: ${ran.said}`);
    assert.equal(rangeIn(ws.log), range, why);
  }
});

test('the scan hands gitleaks its allowlist, its redaction and the exit code that tells a leak from a failure', () => {
  const ws = workspace();
  const ran = verdictOf(scanRun(), ws.dir, { GITHUB_SHA: HEAD });
  assert.equal(ran.status, 0, ran.said);
  const handed = fs.readFileSync(ws.log, 'utf8');
  for (const flag of [`--config ${SCAN_CONFIG}`, '--redact', '--exit-code 2'])
    assert.match(handed, new RegExp(flag.replaceAll('.', '\\.')), `the binary is handed ${flag}: ${handed}`);
});

test('a secret found is a refusal that says what to do, and a scan that could not run says so instead', () => {
  const run = scanRun();

  const clean = workspace();
  assert.equal(verdictOf(run, clean.dir, { GITHUB_SHA: HEAD, STUB_EXIT: '0' }).status, 0, 'nothing found passes');

  const leak = workspace();
  const red = verdictOf(run, leak.dir, { GITHUB_SHA: HEAD, STUB_EXIT: '2' });
  assert.equal(red.status, 1, `a secret found is a failure: ${red.said}`);
  assert.match(red.said, /found a secret/, red.said);
  assert.match(red.said, /rotate it/, `the step says to rotate it: ${red.said}`);
  assert.match(red.said, /rewrite the commit/, `and to rewrite the commit that holds it: ${red.said}`);
  assert.match(red.said, /\.gitleaks\.toml/, `and where a stub's shape is allowed: ${red.said}`);

  const broken = workspace();
  const failed = verdictOf(run, broken.dir, { GITHUB_SHA: HEAD, STUB_EXIT: '1' });
  assert.equal(failed.status, 1, `a scan that could not run is a failure too: ${failed.said}`);
  assert.match(failed.said, /could not scan/, failed.said);
  assert.match(failed.said, new RegExp(`${HEAD}~1\\.\\.${HEAD}`), `it names the range it could not read: ${failed.said}`);
  assert.match(failed.said, /exit 1/, `and the exit code it was given: ${failed.said}`);
  assert.doesNotMatch(failed.said, /found a secret/, `and it does not claim a secret it never looked for: ${failed.said}`);
});

test('a scan that reads every failure as a leak is what --exit-code 2 is for, and a pattern over the step would pass it', () => {
  const ws = workspace();
  const draft = [
    'range="$GITHUB_SHA~1..$GITHUB_SHA"',
    'echo "ci: scanning $range"',
    './gitleaks git --config .gitleaks.toml --log-opts "$range" --redact --no-banner . || {',
    '  echo "ci: gitleaks found a secret in a commit of this push." >&2',
    '  exit 1',
    '}',
    '',
  ].join('\n');
  const waved = verdictOf(draft, ws.dir, { GITHUB_SHA: HEAD, STUB_EXIT: '1' });
  assert.equal(
    waved.status,
    1,
    'the step as the quick run’s draft wrote it, with one branch for whatever gitleaks’ exit 1 meant, fails on a scan it could not run',
  );
  assert.match(
    waved.said,
    /found a secret/,
    'and calls it a secret found, so a force-pushed branch is reported to whoever reads the log as a secret in their commits: every ' +
      'clause of the shipped step is in this one too, which is why the verdict is run and not matched',
  );

  const shipped = workspace();
  const honest = verdictOf(scanRun(), shipped.dir, { GITHUB_SHA: HEAD, STUB_EXIT: '1' });
  assert.doesNotMatch(honest.said, /found a secret/, `the shipped step says what happened instead: ${honest.said}`);
});

/** The self-check step's `run`, and the reports it is to be handed: a count per file, of the stub shapes or of anything else. */
const allowlistRun = (): string => {
  const step = allowlistStep(readWorkflow());
  assert.ok(step?.run !== undefined, 'the scan job has its self-check step today');
  return step.run;
};

/** What the real binary would report over the step's own fixture: every stub shape allowed, the controls and the second path kept. */
function plant(reports: string, kept: { stubs: readonly string[]; controls: number; elsewhere: readonly string[] }, bare?: string[]) {
  const shapes = stubShapes();
  const both = controls();
  fs.writeFileSync(
    path.join(reports, 'bare.json'),
    JSON.stringify([
      ...findings(
        STUBS,
        (bare ?? shapes).map((Secret) => ({ Secret, RuleID: 'generic-api-key' })),
      ),
      ...findings(STUBS, both),
      ...findings('packages/agent-runtime/test/elsewhere.test.ts', [{ Secret: shapes[0], RuleID: 'generic-api-key' }]),
    ]),
  );
  fs.writeFileSync(
    path.join(reports, 'configured.json'),
    JSON.stringify([
      ...findings(
        STUBS,
        kept.stubs.map((Secret) => ({ Secret, RuleID: 'generic-api-key' })),
      ),
      ...findings(STUBS, both.slice(0, kept.controls)),
      ...findings(
        'packages/agent-runtime/test/elsewhere.test.ts',
        kept.elsewhere.map((Secret) => ({ Secret, RuleID: 'generic-api-key' })),
      ),
    ]),
  );
}

test('the job’s self-check passes an allowlist scoped to the stubs, and refuses each way it is not', () => {
  const run = allowlistRun();
  const shapes = stubShapes();
  assert.ok(shapes.length >= 2, `${STUBS} writes ${shapes.length} stub shapes, and the step has nothing to prove under two`);

  const green = workspace();
  plant(green.reports, { stubs: [], controls: 2, elsewhere: [shapes[0]] });
  const ok = verdictOf(run, green.dir, {});
  assert.equal(ok.status, 0, `the stubs allowed, the controls and the second path kept: ${ok.said}`);
  assert.match(ok.said, /allows the stub shapes in their one file, and nothing wider/, ok.said);

  const whole = workspace();
  plant(whole.reports, { stubs: [], controls: 0, elsewhere: [shapes[0]] });
  const wide = verdictOf(run, whole.dir, {});
  assert.equal(
    wide.status,
    1,
    `the draft's own bug — a global allowlist skips the whole file, so the controls go with the stubs — is a refusal: ${wide.said}`,
  );
  assert.match(wide.said, /allowing more of that file than the stub shapes/, wide.said);
  assert.match(wide.said, /\[\[rules\.allowlists\]\]/, `and it gives the form to write: ${wide.said}`);
  assert.match(wide.said, /never a top-level \[\[allowlists\]\]/, wide.said);

  const unmatched = workspace();
  plant(unmatched.reports, { stubs: [shapes[0]], controls: 2, elsewhere: [shapes[0]] });
  const red = verdictOf(run, unmatched.dir, {});
  assert.equal(red.status, 1, `a stub shape no longer matched is a refusal: ${red.said}`);
  assert.match(red.said, /stub shapes at the allowed path are still found/, red.said);
  assert.match(red.said, /re-anchor the shape/, `and it says to re-anchor it: ${red.said}`);

  const everywhere = workspace();
  plant(everywhere.reports, { stubs: [], controls: 2, elsewhere: [] });
  const loose = verdictOf(run, everywhere.dir, {});
  assert.equal(loose.status, 1, `a paths scope past the one file is a refusal: ${loose.said}`);
  assert.match(loose.said, /outside the allowed path are still found/, loose.said);
  assert.match(loose.said, /Scope paths to the one file/, loose.said);

  const dead = workspace();
  plant(dead.reports, { stubs: [], controls: 2, elsewhere: [shapes[0]] }, shapes.slice(1));
  const gone = verdictOf(run, dead.dir, {});
  assert.equal(gone.status, 1, `a shape gitleaks no longer detects is a refusal: ${gone.said}`);
  assert.match(gone.said, /no longer detects what \.gitleaks\.toml exists to allow/, gone.said);
  assert.match(gone.said, /may be dead weight/, gone.said);

  const silent = workspace();
  const nothing = verdictOf(run, silent.dir, {});
  assert.equal(nothing.status, 1, `a scan that wrote no report is a refusal: ${nothing.said}`);
  assert.match(nothing.said, /wrote no report/, nothing.said);
  assert.doesNotMatch(nothing.said, /dead weight/, `and it is not read as an allowlist gone stale: ${nothing.said}`);
});
