/**
 * The captures a detached harness keeps, rewritten once to what its readers read (`HarnessSpec.keepOutput`): the pass over every run
 * of a spec that the read of an ended run does for itself (`said.ts`), for the captures written before it did. One capture at a time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { readText } from '../../core/engine/tally.ts';
import type { SessionsCompacted } from '../seam.ts';
import type { HarnessSpec } from './detached.ts';
import { runFileIn, type RunFile } from './run-file.ts';
import { captureAt, keepSaid, keptText, replaceCapture, type SaidKey } from './said.ts';

/** The ends of the captures a run keeps that its readers read: its log, and its stdout kept whole. */
const CAPTURE_ENDS = ['.log', '.stdout'];

/** Whether the process `pid` is there, as a signal 0 finds it: one this process may not signal is there. */
const pidAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/** The run files in `dir` and the captures beside them, each by the run's file name less its end. */
const listed = (dir: string): { runs: Map<string, RunFile>; captures: Map<string, string[]> } => {
  const runs = new Map<string, RunFile>();
  const captures = new Map<string, string[]>();
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []) {
    const end = CAPTURE_ENDS.find((e) => f.endsWith(e));
    if (end) captures.set(f.slice(0, -end.length), [...(captures.get(f.slice(0, -end.length)) ?? []), f]);
    if (!f.endsWith('.json') || f.endsWith('.closeout.json') || f.endsWith('.schema.json') || f.endsWith('.mcp.json')) continue;
    try {
      const run = runFileIn(readText(path.join(dir, f)));
      if (typeof run !== 'string') runs.set(f.slice(0, -'.json'.length), run);
    } catch {}
  }
  return { runs, captures };
};

/** The size of `file`, or 0 when it is gone. */
const sizeOf = (file: string): number => {
  try {
    return fs.statSync(file).size;
  } catch {
    return 0;
  }
};

/** Why the captures of `run` are left as they are, or nothing when its worker has ended: one at work, or with no pid yet, is not. */
const atWork = (run: RunFile | undefined, alive: (pid: number) => boolean): string | undefined => {
  if (!run) return 'no run file names it';
  if (run.state !== 'working') return undefined;
  return run.pid <= 0 || alive(run.pid) ? 'its worker is at work' : undefined;
};

/** One capture `name` in `dir`, measured, and rewritten unless `dry` (`keptText`, `replaceCapture`); `saidFile`, for a log, kept anew. */
const compactOne = (
  spec: Required<Pick<HarnessSpec, 'readOutput' | 'keepOutput'>>,
  dir: string,
  name: string,
  dry: boolean,
  report: SessionsCompacted,
  saidFile?: string,
): void => {
  const file = path.join(dir, name);
  const capture = captureAt(file);
  if (!capture) return void report.left.push({ name, why: 'it could not be read' });
  report.captures++;
  report.before += capture.key.size;
  const told = keptText(spec.readOutput, spec.keepOutput, capture.text);
  if ('why' in told) {
    report.after += capture.key.size;
    return void report.left.push({ name, why: told.why });
  }
  if (told.kept === capture.text) return void (report.after += capture.key.size);
  const now: SaidKey | undefined = dry
    ? { size: Buffer.byteLength(told.kept), mtimeMs: capture.key.mtimeMs }
    : replaceCapture(file, capture.key, told.kept);
  if (!now) {
    report.after += capture.key.size;
    return void report.left.push({ name, why: 'it changed while it was read, or could not be written' });
  }
  report.compacted++;
  report.after += now.size;
  if (saidFile && !dry) keepSaid(saidFile, now, told.read);
};

/**
 * Rewrites every capture of `spec`'s runs in `dir` whose worker has ended to what `keepOutput` keeps of it, or with `dry` says what
 * it would, and answers what it found (`SessionsCompacted`). A run file's worker has ended when it says so, or says `working` with a
 * pid `alive` does not find; what was read of a log is kept anew under its kept key (`.said`). Left whole, and named: a capture
 * whose worker is at work, or has no pid yet; one no run file names; one its reader refuses, or reads otherwise once kept; one that
 * changed while it was read. A spec with no `keepOutput` keeps every capture whole, and finds none.
 */
export const compactRuns = (
  spec: HarnessSpec,
  dir: string,
  { dry, alive = pidAlive }: { dry: boolean; alive?: (pid: number) => boolean },
): SessionsCompacted => {
  const report: SessionsCompacted = { captures: 0, compacted: 0, before: 0, after: 0, left: [] };
  const { readOutput, keepOutput } = spec;
  if (!readOutput || !keepOutput) return report;
  const { runs, captures } = listed(dir);
  for (const [base, names] of captures) {
    const why = atWork(runs.get(base), alive);
    for (const name of names) {
      if (why === undefined)
        compactOne({ readOutput, keepOutput }, dir, name, dry, report, name.endsWith('.log') ? path.join(dir, `${base}.said`) : undefined);
      else {
        const size = sizeOf(path.join(dir, name));
        report.captures++;
        report.before += size;
        report.after += size;
        report.left.push({ name, why });
      }
    }
  }
  return report;
};
