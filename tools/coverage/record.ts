/**
 * `node tools/coverage/record.ts <package-dir> --out <file.json>`: runs a package's own `test` script with Node's coverage on and
 * writes its coverage per source file as a record `compare.ts` reads.
 *
 * A session's measure, never the suite's or CI's: it runs the whole suite of the package once, in its folder, as its `test` script
 * says (no shard: `WF_TEST_SHARD` is taken out), and exits with the suite's own exit code, the record written either way; with
 * each process's raw V8 coverage kept in the folder `NODE_V8_COVERAGE` names, which the runner leaves when it is set.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recordOf, withCoverage, type V8Script } from './coverage.ts';

const USAGE = 'usage: node tools/coverage/record.ts <package-dir> --out <file.json>';

/** The package folder and the record's path from the command's arguments, or undefined when they are not the two it takes. */
const argsOf = (argv: string[]): { dir: string; out: string } | undefined => {
  const at = argv.indexOf('--out');
  if (at === -1 || at + 1 >= argv.length) return undefined;
  const rest = argv.filter((_, i) => i !== at && i !== at + 1);
  return rest.length === 1 ? { dir: path.resolve(rest[0]), out: path.resolve(argv[at + 1]) } : undefined;
};

/** The `test` script and name of the package in `dir`, or a message saying what to fix. */
const scriptOf = (dir: string): { name: string; script: string } | string => {
  const file = path.join(dir, 'package.json');
  if (!fs.existsSync(file)) return `no package.json in ${dir}: give the folder of a package, as packages/agent-orchestrator`;
  const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; scripts?: { test?: string } };
  const script = pkg.scripts?.test;
  if (!script) return `${file} has no scripts.test: give a package whose suite runs from its test script`;
  return { name: pkg.name ?? path.basename(dir), script };
};

/** The scripts of each process's raw coverage in `dir`, one file read at a time. */
function* processesIn(dir: string): Iterable<V8Script[]> {
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    yield (JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as { result: V8Script[] }).result;
  }
}

/** Runs the command for `argv` and answers its exit code: the suite's, or 2 when it could not be run as asked. */
export const main = (argv: string[]): number => {
  const args = argsOf(argv);
  if (!args) {
    console.error(USAGE);
    return 2;
  }
  const found = scriptOf(args.dir);
  if (typeof found === 'string') {
    console.error(`${found}\n${USAGE}`);
    return 2;
  }
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-'));
  try {
    const lcov = path.join(work, 'lcov.info');
    const raw = path.join(work, 'v8');
    const command = withCoverage(found.script, lcov);
    if (!command) {
      console.error(`the test script of ${found.name} does not start with "node ": run its suite with node --test to measure it`);
      return 2;
    }
    const { WF_TEST_SHARD: _shard, NODE_TEST_CONTEXT: _context, ...env } = process.env;
    const ran = spawnSync(command, { cwd: args.dir, env: { ...env, NODE_V8_COVERAGE: raw }, shell: '/bin/sh', stdio: 'inherit' });
    const code = ran.status ?? 1;
    if (!fs.existsSync(lcov) || !fs.existsSync(raw)) {
      console.error(`the suite of ${found.name} left no lcov (exit ${code}): run its test script by hand and fix what stops it`);
      return code === 0 ? 1 : code;
    }
    const record = { ...recordOf(fs.readFileSync(lcov, 'utf8'), args.dir, () => processesIn(raw)), package: found.name };
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(record, null, 2)}\n`);
    console.error(`coverage of ${found.name}: ${Object.keys(record.files).length} source files written to ${args.out}`);
    return code;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exitCode = main(process.argv.slice(2));
