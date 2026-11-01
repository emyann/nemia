/**
 * What a runtime store's journals cost:
 * `node --expose-gc tools/journal-bytes/report.ts <engine-root> [--refile <scratch>] [--json <file>]`, `<engine-root>` a copy of a store
 * such as `~/.agent-workflows/engine`, never the store itself. It prints a table of the journals' bytes by event kind, the feed's bytes,
 * the head's and the sealed file's a rotation keeps, the bodies' bytes, the share of the journals that is text an earlier line already
 * holds, exactly (a brief's parts as `briefParts` cuts them, a schema an end is held to, a nudge, an input's text), and the heap used once
 * every journal and the feed are read and kept, after a collection; `--json` writes the same as JSON. Given `--refile`, it first files
 * every journal of `<engine-root>` again into `<scratch>`, an empty folder, through `Journal`, each brief cut by `briefParts`, and reports
 * on `<scratch>` in a fresh process. It runs no pass: nothing is spawned or observed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Effect } from 'effect';
import { Journal, TaskId, type Event } from 'agent-runtime';
import { briefParts } from 'agent-orchestrator/run';

/** What the report says of one store. */
export type JournalBytes = {
  root: string;
  journals: number;
  journalBytes: number;
  byKind: Record<string, { lines: number; bytes: number }>;
  feedBytes: number;
  sealedBytes: number;
  bodies: { count: number; bytes: number };
  textBytes: number;
  copyBytes: number;
  copyShare: number;
  heapUsed: { before: number; after: number; held: number };
  unreadable: string[];
};

/** The arguments, or the message that says how to call it. */
function argsOf(args: string[]): { root: string; refile?: string; json?: string } | string {
  const usage = 'usage: node --expose-gc tools/journal-bytes/report.ts <engine-root> [--refile <scratch>] [--json <file>]';
  const flag = (name: string) => {
    const at = args.indexOf(name);
    return at < 0 ? undefined : args.splice(at, 2)[1];
  };
  const refile = flag('--refile');
  const json = flag('--json');
  if (args.length !== 1 || args[0].startsWith('--')) return usage;
  if (refile !== undefined && fs.existsSync(refile) && fs.readdirSync(refile).length)
    return `${refile} is not empty: give --refile an empty folder, or one not there yet`;
  return { root: path.resolve(args[0]), refile, json };
}

/** The texts a stored line holds inline that the runtime may keep once: a brief's parts, a schema, a nudge and an input's text. */
function textsOf(entry: Record<string, unknown>): string[] {
  const texts: string[] = [];
  if (typeof entry.brief === 'string') texts.push(...briefParts(entry.brief));
  if (Array.isArray(entry.briefParts)) texts.push(...entry.briefParts.filter((part): part is string => typeof part === 'string'));
  if (typeof entry.closeoutSchema === 'object' && entry.closeoutSchema !== null) texts.push(JSON.stringify(entry.closeoutSchema));
  if (entry.kind === 'starting' && typeof entry.nudge === 'string') texts.push(entry.nudge);
  if (entry.kind === 'input' && typeof entry.text === 'string') texts.push(entry.text);
  return texts;
}

/** The journals' lines under `root`, counted: bytes by kind, and the bytes of text each line repeats from a line read before it. */
function linesOf(root: string): Pick<JournalBytes, 'journals' | 'journalBytes' | 'byKind' | 'textBytes' | 'copyBytes'> {
  const dir = path.join(root, 'tasks');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith('.jsonl')) : [];
  const byKind: JournalBytes['byKind'] = {};
  const seen = new Set<string>();
  let journalBytes = 0;
  let textBytes = 0;
  let copyBytes = 0;
  for (const name of names.sort()) {
    for (const line of fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean)) {
      const bytes = Buffer.byteLength(line) + 1;
      const entry = JSON.parse(line) as Record<string, unknown>;
      const kind = typeof entry.kind === 'string' ? entry.kind : '(none)';
      byKind[kind] = { lines: (byKind[kind]?.lines ?? 0) + 1, bytes: (byKind[kind]?.bytes ?? 0) + bytes };
      journalBytes += bytes;
      for (const text of textsOf(entry)) {
        const size = Buffer.byteLength(text);
        const key = createHash('sha256').update(text).digest('hex');
        textBytes += size;
        if (seen.has(key)) copyBytes += size;
        else seen.add(key);
      }
    }
  }
  return { journals: names.length, journalBytes, byKind, textBytes, copyBytes };
}

/** The files in `dir` and their bytes, none when it is not there. */
function sizeOf(dir: string): { count: number; bytes: number } {
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  return { count: names.length, bytes: names.reduce((sum, name) => sum + fs.statSync(path.join(dir, name)).size, 0) };
}

/**
 * Every journal under `root` by task, and its feed from the start, read through `Journal` as the engine reads them, and the tasks
 * that did not read.
 */
const readAll = (root: string) =>
  Effect.gen(function* () {
    const journal = yield* Journal;
    const unreadable: string[] = [];
    const tasks: [string, Event[]][] = [];
    for (const taskId of yield* journal.list) {
      const read = yield* Effect.result(journal.read(taskId));
      if (read._tag === 'Success') tasks.push([taskId, read.success]);
      else unreadable.push(`${taskId}: ${read.failure.message}`);
    }
    const feed = yield* journal.feed(0);
    return { tasks, feed, unreadable };
  }).pipe(Effect.provide(Journal.files(root)));

/** The heap used before and after every journal and the feed under `root` are read and kept, each after a collection. */
async function heapOf(root: string): Promise<{ heapUsed: JournalBytes['heapUsed']; unreadable: string[] }> {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) throw new Error('journal bytes: run node with --expose-gc, which the heap is measured after');
  gc();
  const before = process.memoryUsage().heapUsed;
  const kept = await Effect.runPromise(readAll(root));
  gc();
  const after = process.memoryUsage().heapUsed;
  const held = kept.tasks.reduce((sum, [, events]) => sum + events.length, kept.feed.entries.length);
  return { heapUsed: { before, after, held }, unreadable: kept.unreadable };
}

/** The report on `root`. */
export async function measure(root: string): Promise<JournalBytes> {
  const { heapUsed, unreadable } = await heapOf(root);
  const lines = linesOf(root);
  const bytes = (name: string) => (fs.existsSync(path.join(root, name)) ? fs.statSync(path.join(root, name)).size : 0);
  return {
    root,
    ...lines,
    feedBytes: bytes('feed.jsonl'),
    sealedBytes: bytes('feed.sealed.jsonl'),
    bodies: sizeOf(path.join(root, 'bodies')),
    copyShare: lines.journalBytes ? lines.copyBytes / lines.journalBytes : 0,
    heapUsed,
    unreadable,
  };
}

/**
 * File every journal of `from` again into `to` through `Journal`, each brief cut by `briefParts`: the tasks filed, and those that did
 * not read.
 */
const refile = (from: string, to: string) =>
  Effect.gen(function* () {
    const { tasks, unreadable } = yield* readAll(from);
    const journal = yield* Journal;
    for (const [taskId, events] of tasks) {
      for (const event of events) yield* journal.append(TaskId.read(taskId), event, event.kind === 'filed' ? briefParts(event.brief) : undefined);
    }
    return { filed: tasks.length, unreadable };
  }).pipe(Effect.provide(Journal.files(to)));

const mb = (bytes: number) => `${(bytes / 1e6).toFixed(2)} MB`;

/** The report as a table. */
export function rendered(report: JournalBytes): string {
  const kinds = Object.entries(report.byKind).sort(([, a], [, b]) => b.bytes - a.bytes);
  return [
    `journal bytes of ${report.root}: ${report.journals} journals`,
    '',
    '| what | lines | bytes |',
    '| --- | ---: | ---: |',
    ...kinds.map(([kind, { lines, bytes }]) => `| ${kind} | ${lines} | ${mb(bytes)} |`),
    `| journals | | ${mb(report.journalBytes)} |`,
    `| feed | | ${mb(report.feedBytes)} |`,
    `| feed, sealed | | ${mb(report.sealedBytes)} |`,
    `| bodies | ${report.bodies.count} | ${mb(report.bodies.bytes)} |`,
    '',
    `text the runtime may keep once: ${mb(report.textBytes)}, of which a copy: ${mb(report.copyBytes)}, ${(report.copyShare * 100).toFixed(1)}% of the journals`,
    `heapUsed: ${mb(report.heapUsed.before)} before, ${mb(report.heapUsed.after)} with ${report.heapUsed.held} events kept, ${mb(report.heapUsed.after - report.heapUsed.before)} held`,
    ...report.unreadable.map((said) => `unreadable: ${said}`),
  ].join('\n');
}

/** Run the command on `args`: the exit code. */
async function main(args: string[]): Promise<number> {
  const asked = argsOf([...args]);
  if (typeof asked === 'string') {
    process.stderr.write(`${asked}\n`);
    return 2;
  }
  if (asked.refile !== undefined) {
    const { filed, unreadable } = await Effect.runPromise(refile(asked.root, path.resolve(asked.refile)));
    process.stdout.write(
      `refiled ${filed} journals into ${asked.refile}${unreadable.length ? `, ${unreadable.length} unreadable left out` : ''}\n`,
    );
    const rest = asked.json === undefined ? [] : ['--json', asked.json];
    execFileSync(process.execPath, ['--expose-gc', import.meta.filename, asked.refile, ...rest], { stdio: 'inherit' });
    return 0;
  }
  const report = await measure(asked.root);
  if (asked.json !== undefined) fs.writeFileSync(asked.json, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${rendered(report)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exitCode = await main(process.argv.slice(2));
