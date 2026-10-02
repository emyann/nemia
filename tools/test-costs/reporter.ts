/**
 * The cost reporter, a `node --test` reporter beside the spec reporter in a package's `test` script. It reads each `test:pass` and
 * `test:fail` event (name, file, line, nesting, `details.duration_ms`, `details.type`), and when the run ends it folds them with the
 * fragments the probes left into the package's record, written to the check's files directory (`WF_ARTIFACTS`) under a name of its own
 * per try (`recordName`), and removes the fragments. It does nothing without `WF_ARTIFACTS`, reads the whole stream whatever goes wrong,
 * and never throws: what it cannot record it says in one line, to its destination (stderr), and the run's exit code is unchanged.
 */
import fs from 'node:fs';
import path from 'node:path';
import { foldCosts, fragmentsDir, recordName, type Seen } from './costs.ts';
import { packageOf, readFragments } from './store.ts';

/** An event of the runner's stream, as far as this reporter reads one. */
type ReporterEvent = { type: string; data?: unknown };

/** The runner's data of a passed or failed test, as far as this reporter reads it. */
type TestData = { name?: unknown; file?: unknown; line?: unknown; nesting?: unknown; details?: { duration_ms?: unknown; type?: unknown } };

/** A passed or failed test from its event, or none for any other event or one without a file or a duration; it never throws. */
function seenOf(event: ReporterEvent): Seen | null {
  if (event.type !== 'test:pass' && event.type !== 'test:fail') return null;
  const data = (event.data ?? {}) as TestData;
  const duration = data.details?.duration_ms;
  if (typeof data.file !== 'string' || typeof duration !== 'number') return null;
  return {
    file: data.file,
    line: typeof data.line === 'number' ? data.line : null,
    name: typeof data.name === 'string' ? data.name : '',
    nesting: typeof data.nesting === 'number' ? data.nesting : 0,
    suite: data.details?.type === 'suite',
    ok: event.type === 'test:pass',
    durationMs: duration,
  };
}

/** Writes the package's record and removes its fragments; the line that says why when it cannot, else none. */
function record(artifacts: string, seen: Seen[], spentMs: number): string[] {
  const started = performance.now();
  const dir = process.cwd();
  const pkg = packageOf(dir);
  try {
    const fragments = fragmentsDir(artifacts, pkg);
    const at = new Date();
    const costs = foldCosts(seen, readFragments(fragments), {
      package: pkg,
      dir,
      node: process.version,
      platform: process.platform,
      at: at.toISOString(),
      wallMs: process.uptime() * 1000,
      overheadMs: spentMs + (performance.now() - started),
    });
    fs.writeFileSync(path.join(artifacts, recordName(pkg, at)), `${JSON.stringify(costs)}\n`);
    fs.rmSync(fragments, { recursive: true, force: true });
    if (fs.readdirSync(path.dirname(fragments)).length === 0) fs.rmdirSync(path.dirname(fragments));
    return [];
  } catch (error) {
    return [`test costs: not recorded for ${pkg}: ${error instanceof Error ? error.message : String(error)}\n`];
  }
}

/** The reporter: reads the whole stream, then yields nothing, or the one line that says the record was not written. */
export default async function* testCosts(source: AsyncIterable<ReporterEvent>): AsyncGenerator<string> {
  const artifacts = process.env.WF_ARTIFACTS;
  const seen: Seen[] = [];
  let spentMs = 0;
  for await (const event of source) {
    if (!artifacts) continue;
    const started = performance.now();
    const test = seenOf(event);
    if (test) seen.push(test);
    spentMs += performance.now() - started;
  }
  if (artifacts) yield* record(artifacts, seen, spentMs);
}
