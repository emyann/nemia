/**
 * The world the pull-request script acts in (`workflows/build/pull-request.ts`), for the tests that drive it and for the three that run
 * a shipped check whole: a bare repository as `origin`, so a push is a real push and its refusal a real rejection, and a stub `gh` first
 * on the PATH that records each call and answers from a fixture a test writes, as `observe-render.boundary.test.ts` stubs `docker`.
 *
 * A rule of the fixture is matched by the words of the call (`when`, a substring of the arguments joined by spaces), the first rule that
 * matches winning; `outs` answers a poll, one entry per matching call and the last repeating, so a `pending` that turns green is a
 * fixture and never a sleep. A call no rule matches is answered with nothing, exit 0.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

/** A call the stub `gh` was given: the folder it ran in, and its arguments. */
export type Called = { cwd: string; argv: string[] };

/** What the stub `gh` answers a call whose words hold `when`: one answer, or one per matching call with the last repeating. */
export type Rule = { when: string; out?: string; outs?: string[]; err?: string; status?: number };

/**
 * The stub `gh`: records each call in `GH_LOG`, then answers from the rules in `GH_RULES` — the first whose `when` the arguments hold,
 * its `outs` entry for the number of calls it has already matched, the last repeating.
 */
const STUB = `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
const words = argv.join(' ');
const log = process.env.GH_LOG;
const before = fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
fs.appendFileSync(log, JSON.stringify({ cwd: process.cwd(), argv }) + '\\n');
const rules = JSON.parse(fs.readFileSync(process.env.GH_RULES, 'utf8'));
const matching = (rule, said) => said.includes(rule.when);
const rule = rules.find((r) => matching(r, words));
if (rule) {
  const seen = before.filter((call) => matching(rule, call.argv.join(' '))).length;
  const outs = rule.outs ?? (rule.out === undefined ? [] : [rule.out]);
  const out = outs.length ? outs[Math.min(seen, outs.length - 1)] : '';
  if (out) process.stdout.write(out.endsWith('\\n') ? out : out + '\\n');
  if (rule.err) process.stderr.write(rule.err + '\\n');
  process.exitCode = rule.status ?? 0;
}
`;

/** Run git in `dir`, as nobody in particular, with no configuration of the machine's read. */
export const gitIn = (dir: string, ...args: string[]): string =>
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

/** A handle on the stub `gh`: the folder to put first on the PATH, the rules to answer with, and the calls it was given. */
export type Gh = {
  bin: string;
  rulesFile: string;
  log: string;
  answers: (rules: readonly Rule[]) => void;
  calls: () => Called[];
  env: () => Record<string, string>;
};

/** A folder holding the stub `gh`, answering `rules`. */
export const ghStub = (rules: readonly Rule[] = []): Gh => ghIn(scratch('wf-origin-bin-'), rules);

/** The stub `gh` written into `bin`, a folder a test already puts first on the PATH, answering `rules`. */
export function ghIn(bin: string, rules: readonly Rule[] = []): Gh {
  fs.writeFileSync(path.join(bin, 'gh'), STUB, { mode: 0o755 });
  const rulesFile = path.join(bin, 'rules.json');
  const log = path.join(bin, 'calls.jsonl');
  const handle: Gh = {
    bin,
    rulesFile,
    log,
    answers: (given) => fs.writeFileSync(rulesFile, JSON.stringify(given)),
    calls: () =>
      fs.existsSync(log)
        ? fs
            .readFileSync(log, 'utf8')
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line) as Called)
        : [],
    env: () => ({ GH_LOG: log, GH_RULES: rulesFile }),
  };
  handle.answers(rules);
  return handle;
}

/** A bare repository added to `repo` as its `origin`, its default branch `main`: its path. */
export function bareOrigin(repo: string): string {
  const bare = scratch('wf-origin-bare-');
  execFileSync('git', ['init', '-q', '--bare', '-b', 'main', bare], { stdio: ['ignore', 'pipe', 'pipe'] });
  gitIn(repo, 'remote', 'add', 'origin', bare);
  return bare;
}

/** The tip of `branch` in the bare repository `bare`, or null where it has none. */
export function tip(bare: string, branch: string): string | null {
  const ran = spawnSync('git', ['-C', bare, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { encoding: 'utf8' });
  return ran.status === 0 ? ran.stdout.trim() : null;
}

/** The pull request the rules below answer with. */
export const PR = { number: 7, url: 'https://github.com/o/r/pull/7' };

/** The URL a `ci` check run points at, which names the workflow run its log is read from. */
export const CI_URL = 'https://github.com/o/r/actions/runs/1234/job/5678';

/** One open, non-draft pull request based on `main`, whose head is `at`, as `gh pr list --json` gives it. */
export const listed = (at: string, more: Record<string, unknown> = {}): string =>
  JSON.stringify([{ number: PR.number, url: PR.url, isDraft: false, baseRefName: 'main', headRefOid: at, ...more }]);

/** A head's checks holding one `ci` entry in the state `rest` says, as `gh pr view --json statusCheckRollup` gives them. */
export const rollup = (rest: Record<string, unknown>, ...others: Record<string, unknown>[]): string =>
  JSON.stringify({
    statusCheckRollup: [{ name: 'ci', detailsUrl: CI_URL, ...rest }, ...others],
  });

/** A `ci` that passed. */
export const GREEN = rollup({ status: 'COMPLETED', conclusion: 'SUCCESS' });

/** The rules under which every verb of the script passes in `repo`: one open pull request at its HEAD, and a green `ci`. */
export const passing = (repo: string): Rule[] => [
  { when: 'auth status' },
  { when: 'repo view', out: JSON.stringify({ defaultBranchRef: { name: 'main' } }) },
  { when: 'pr list', out: listed(gitIn(repo, 'rev-parse', 'HEAD').trim()) },
  { when: 'pr view', out: GREEN },
  { when: 'pr create', out: PR.url },
  { when: 'pr edit', out: PR.url },
];
