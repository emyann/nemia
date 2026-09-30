/**
 * `node mutants.ts <closeout.json>` — the proof that each test an engineer names refuses the mutant they name with it.
 *
 * Takes the path of a step's closeout, flat (`WF_CLOSEOUT`), and reads its `mutants`: each a `file`, the text `from` it holds exactly once,
 * what it becomes `to`, the `test` file that must fail on it, and optionally one test in that file by its exact `name`. It copies the
 * commit the working directory has checked out into a directory of its own (`git archive HEAD`, with each `node_modules` beside a
 * `package.json` hardlinked by `cp -al`), runs each named test there unmutated, which must pass at least one test, then applies each
 * mutant in the copy, runs its test, and restores the file. It never writes into the working directory.
 *
 * Prints a line per mutant and exits 0 when every mutant was killed, or the list is empty and `noMutants` says why. Exits 1, naming each
 * one on stderr, when a mutant survives, does not apply, names a path outside the tree or a test that fails or runs nothing without a
 * mutant; and when no closeout, or no list, reached it. A test run that outlasts `WF_MUTANT_SECONDS` (300 by default) counts as failed.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** One mutant as a closeout names it. */
type Mutant = { file: string; from: string; to: string; test: string; name: string | null };

/** What one run of a test file came to: its exit, the tests that passed, how long it took, and what it printed. */
type Trial = { verdict: 'passed' | 'failed' | 'timeout'; passed: number; ms: number; output: string };

/** A reason the step is refused: said on stderr, exit 1. */
class Refusal extends Error {}

const SECONDS = Number(process.env.WF_MUTANT_SECONDS) || 300;

/** A mutant as one line: its number, file, the text and what it becomes, and the test that must fail. */
const label = (m: Mutant, i: number): string =>
  `#${i + 1} ${m.file}: ${short(m.from)} → ${short(m.to)}, by ${m.test}${m.name ? ` › ${m.name}` : ''}`;

/** A string as JSON, cut to 80 characters. */
const short = (text: string): string => {
  const json = JSON.stringify(text);
  return json.length > 80 ? `${json.slice(0, 77)}…"` : json;
};

/** The closeout at `file`, parsed; refuses a missing argument, a file that does not read, or one that is not a JSON object. */
function readCloseout(file: string | undefined): Record<string, unknown> {
  if (!file) throw new Refusal('no closeout reached the check: WF_CLOSEOUT is empty, so there is no list of mutants to run');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Refusal(`no closeout reached the check: ${file} does not read as JSON (${(err as Error).message})`, { cause: err });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Refusal(`no closeout reached the check: ${file} is not an object`);
  return parsed as Record<string, unknown>;
}

/** Why `p`, the `key` of mutant `i`, is refused as a path: absolute, climbing out with `..`, or under `node_modules`; else undefined. */
function pathRefusal(p: string, key: string, i: number): string | undefined {
  const parts = p.split(/[\\/]/);
  if (path.isAbsolute(p) || parts.includes('..') || parts.includes('node_modules'))
    return (
      `mutant #${i + 1}: its ${key} ${JSON.stringify(p)} is not a path inside the tree; ` +
      'name it from the workspace root, outside node_modules'
    );
  return undefined;
}

/** Mutant `i` of the list, checked field by field; refused with every field that is wrong. */
function mutantOf(value: unknown, i: number): Mutant {
  const m = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const wrong = ['file', 'from', 'to', 'test'].filter((k) => typeof m[k] !== 'string' || (k !== 'to' && !m[k]));
  if (wrong.length) throw new Refusal(`mutant #${i + 1}: ${wrong.join(', ')} must be text${wrong.includes('to') ? '' : ', not empty'}`);
  if (m.name !== undefined && m.name !== null && typeof m.name !== 'string') throw new Refusal(`mutant #${i + 1}: name is text or null`);
  const mutant = { file: m.file, from: m.from, to: m.to, test: m.test, name: m.name || null } as Mutant;
  if (mutant.from === mutant.to) throw new Refusal(`mutant #${i + 1}: from and to are the same text, so nothing is mutated`);
  const refused = pathRefusal(mutant.file, 'file', i) ?? pathRefusal(mutant.test, 'test', i);
  if (refused) throw new Refusal(refused);
  return mutant;
}

/** The closeout's mutants, or its reason for naming none; refuses a closeout with no list, or an empty one with no reason. */
function listOf(closeout: Record<string, unknown>): Mutant[] | string {
  const { mutants, noMutants } = closeout;
  if (!Array.isArray(mutants))
    throw new Refusal('the closeout names no `mutants` list: name each mutant, or an empty list and why in `noMutants`');
  if (mutants.length) return mutants.map(mutantOf);
  if (typeof noMutants === 'string' && noMutants.trim()) return noMutants.trim();
  throw new Refusal(
    'the closeout names no mutant and says not why: name a mutant for each rule the change adds, or say why none in `noMutants`',
  );
}

/** A copy of the commit `workspace` has checked out, in a new directory under the temp directory, its `node_modules` hardlinked. */
function copyOf(workspace: string): string {
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-mutants-'));
  const archive = spawnSync('git', ['-C', workspace, 'archive', '--format=tar', 'HEAD'], {
    maxBuffer: 1 << 30,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (archive.status !== 0)
    throw new Refusal(`cannot copy ${workspace}: git archive HEAD said ${String(archive.stderr).trim() || archive.error?.message}`);
  execFileSync('tar', ['-x', '-C', copy], { input: archive.stdout, stdio: ['pipe', 'ignore', 'pipe'] });
  for (const entry of fs.readdirSync(copy, { recursive: true, encoding: 'utf8' })) {
    if (path.basename(entry) !== 'package.json') continue;
    const modules = path.join(workspace, path.dirname(entry), 'node_modules');
    if (fs.existsSync(modules))
      execFileSync('cp', ['-al', modules, path.join(copy, path.dirname(entry), 'node_modules')], { stdio: ['ignore', 'ignore', 'pipe'] });
  }
  return copy;
}

/** The nearest directory above `test` in `copy` that holds a `package.json`, where its test runner runs; the copy itself at the top. */
function packageDirOf(copy: string, test: string): string {
  let dir = path.dirname(path.join(copy, test));
  while (dir !== copy && !fs.existsSync(path.join(dir, 'package.json'))) dir = path.dirname(dir);
  return dir;
}

/** A test's name as a pattern that matches that name exactly, and no name that only contains it. */
const exactly = (name: string): string => `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;

/**
 * Run the test file `test` in `copy`, only the test named exactly `name` where one is given, under the deadline; what it came to. In the
 * runner's own process (`--test-isolation=none`): a file run in a process of its own counts itself as one passing test when no test in it
 * matches.
 */
function trial(copy: string, test: string, name: string | null): Trial {
  const cwd = packageDirOf(copy, test);
  const args = [
    '--test',
    '--test-reporter=tap',
    '--test-isolation=none',
    ...(name ? [`--test-name-pattern=${exactly(name)}`] : []),
    path.relative(cwd, path.join(copy, test)),
  ];
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const began = performance.now();
  const run = spawnSync(process.execPath, args, {
    cwd,
    env,
    encoding: 'utf8',
    timeout: SECONDS * 1000,
    killSignal: 'SIGKILL',
    maxBuffer: 1 << 28,
  });
  const ms = performance.now() - began;
  const output = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const passed = Number(/^# pass (\d+)$/m.exec(run.stdout ?? '')?.[1] ?? 0);
  if (run.error && (run.error as NodeJS.ErrnoException).code !== 'ETIMEDOUT') throw new Refusal(`cannot run ${test}: ${run.error.message}`);
  return { verdict: run.error || run.signal ? 'timeout' : run.status === 0 ? 'passed' : 'failed', passed, ms, output };
}

/** Seconds, to a tenth. */
const secs = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** The last lines of what a test printed, indented, for a refusal that shows why. */
const tail = (output: string): string =>
  output
    .trimEnd()
    .split('\n')
    .slice(-12)
    .map((l) => `    ${l}`)
    .join('\n');

/** Run each distinct named test unmutated; the refusal of each that fails, outlasts the deadline, or passes no test. */
function baselines(copy: string, mutants: readonly Mutant[], say: (line: string) => void): string[] {
  const refused: string[] = [];
  const seen = new Set<string>();
  for (const m of mutants) {
    const key = JSON.stringify([m.test, m.name]);
    if (seen.has(key)) continue;
    seen.add(key);
    const at = `${m.test}${m.name ? ` › ${m.name}` : ''}`;
    if (!fs.existsSync(path.join(copy, m.test))) {
      refused.push(`${at}: no such test file in the commit`);
      continue;
    }
    const t = trial(copy, m.test, m.name);
    say(`baseline ${at}: ${t.verdict}, ${t.passed} passed (${secs(t.ms)})`);
    if (t.verdict !== 'passed') refused.push(`${at} fails without a mutant (${t.verdict}), so it proves nothing:\n${tail(t.output)}`);
    else if (!t.passed)
      refused.push(`${at} runs no test: no test in the file${m.name ? ` matches its name` : ''}, so it passes for nothing`);
  }
  return refused;
}

/** Apply mutant `i` in `copy`, run its test, and restore the file whatever happens; the refusal when it survives or does not apply. */
function tryMutant(copy: string, m: Mutant, i: number, say: (line: string) => void): string | undefined {
  const file = path.join(copy, m.file);
  if (!fs.existsSync(file)) return `${label(m, i)} does not apply: no such file in the commit`;
  const original = fs.readFileSync(file);
  const count = original.toString('utf8').split(m.from).length - 1;
  if (count !== 1) return `${label(m, i)} does not apply: its from is in the file ${count} times, and must be there exactly once`;
  try {
    fs.writeFileSync(
      file,
      original.toString('utf8').replace(m.from, () => m.to),
    );
    const t = trial(copy, m.test, m.name);
    say(`${t.verdict === 'passed' ? 'SURVIVED' : 'killed'} ${label(m, i)} (${t.verdict}, ${secs(t.ms)})`);
    return t.verdict === 'passed'
      ? `${label(m, i)} survived: its test passes with the mutant in, so it does not refuse what it should`
      : undefined;
  } finally {
    fs.writeFileSync(file, original);
  }
}

/** Run every mutant of the list in one copy of `workspace`, deleted after; every refusal. */
function runAll(workspace: string, mutants: readonly Mutant[], say: (line: string) => void): string[] {
  const copy = copyOf(workspace);
  try {
    const refused = baselines(copy, mutants, say);
    if (refused.length) return refused;
    return mutants.map((m, i) => tryMutant(copy, m, i, say)).filter((r): r is string => r !== undefined);
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
}

/** The whole run: exit 0 when every mutant was killed or none is named for a reason, 1 with every refusal on stderr otherwise. */
function main(): number {
  const say = (line: string): void => void process.stdout.write(`wf mutants: ${line}\n`);
  try {
    const list = listOf(readCloseout(process.argv[2]));
    if (typeof list === 'string') {
      say(`no mutant named: ${list}`);
      return 0;
    }
    const began = performance.now();
    const refused = runAll(process.cwd(), list, say);
    say(`${list.length} mutant(s), ${refused.length} refused, in ${secs(performance.now() - began)}`);
    if (!refused.length) return 0;
    const lines = refused.map((r) => `  ${r}\n`).join('');
    process.stderr.write(`wf mutants: the step is refused; make each named test fail on its mutant, or name another mutant:\n${lines}`);
    return 1;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`wf mutants: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
