/**
 * What the daemon's passes cost its event loop, measured on a copy of the store: `node tools/store-measure/loop.ts [--from <wf-root>]
 * [--engine <ae-root>] [--passes N] [--every ms] [--json <file>] [--compare <loop.json>]`.
 *
 * It copies both stores as `report.ts` does (`copyStore`, fenced by `installFence`, read through `readOnlyPlace`), builds the api over
 * the copy, and runs `--passes` passes of the tick (`withProposalsPass(tickRun(…))`, over `passEngine`, whose runtime pass sees nothing)
 * with the app's own context given, its informer among it, as the daemon's pass is, `--every` ms apart. While they run it records the
 * event loop's delay (`monitorEventLoopDelay`, at a 10 ms resolution) and asks the app in this process for `GET /api/level` every
 * `READ_EVERY_MS`, timing each answer from when it was due to be sent, as a client that sent it then would wait: no network, the server's
 * time alone, a pass that holds the loop when a read is due among it. The first pass, over memos that hold nothing, is timed
 * apart and neither its delay nor the reads during it are counted: a daemon runs warm.
 *
 * It prints, and with `--json` writes, the passes' times, the loop's delay (p50, p99, max) and the reads' (p50, p99, max), with the open
 * runs of the copy; with `--compare`, each beside the earlier report's. Run it under `node --cpu-prof` to see what a pass holds the loop
 * with. It refuses itself, exit 1, where the fence refused anything; exit 2 for what it cannot be called with.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { Effect, Layer } from 'effect';
import { AE_LEFT_OUT, copyStore, destinationRefusal, installFence, readOnlyPlace, type Fence } from './fence.ts';
import { passEngine } from './reads.ts';
import { appOver, commitHere, copyEnvOf, FINISHED, getJson, machineNow, seatedOn } from './report.ts';

/** How often the level is asked while the passes run, in ms. */
export const READ_EVERY_MS = 50;

/** The spread of some times, in ms. */
export type Spread = { p50: number; p99: number; max: number; count: number };

/** What the loop's measure reports. */
export type LoopMeasure = {
  machine: ReturnType<typeof machineNow>;
  commit: string;
  date: string;
  openRuns: number;
  passes: { cold: number; warm: Spread };
  delay: Spread;
  level: Spread;
  refusals: Fence['refusals'];
};

/** What the command was asked. */
export type LoopAsked = { from: string; engine: string; passes: number; every: number; json?: string; compare?: string };

const USAGE =
  'usage: node tools/store-measure/loop.ts [--from <wf-root>] [--engine <ae-root>] [--passes N] [--every ms] [--json <file>] [--compare <loop.json>]';

const FLAGS = ['--from', '--engine', '--passes', '--every', '--json', '--compare'];

/**
 * The arguments, each store an existing folder, or the words that say how to call it.
 * @param args The command's arguments.
 * @param env The environment its stores default from (`WF_ROOT`, `AE_ROOT`, `HOME`).
 */
export function loopArgsOf(args: readonly string[], env: NodeJS.ProcessEnv) {
  const given: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i];
    if (!FLAGS.includes(flag)) return `${flag} is not a flag of the loop's measure. ${USAGE}`;
    const value = args[i + 1];
    if (value === undefined || value.startsWith('--')) return `${flag} takes a value. ${USAGE}`;
    given[flag] = value;
  }
  const home = env.HOME ?? os.homedir();
  const from = path.resolve(given['--from'] ?? env.WF_ROOT ?? path.join(home, '.agent-workflows'));
  const engine = path.resolve(given['--engine'] ?? env.AE_ROOT ?? path.join(home, '.agent-engine'));
  for (const [flag, dir] of [
    ['--from', from],
    ['--engine', engine],
  ])
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory())
      return `${dir} is no folder: name the store with ${flag} <folder>. ${USAGE}`;
  const counts: Record<string, number> = {};
  for (const [flag, fallback, least] of [
    ['--passes', '6', 2],
    ['--every', '1000', 0],
  ] as const) {
    const raw = given[flag] ?? fallback;
    if (!/^\d+$/.test(raw) || Number(raw) < least)
      return `${flag} ${raw} is not a whole number from ${least}: ${flag} ${fallback}. ${USAGE}`;
    counts[flag] = Number(raw);
  }
  const at = (flag: string) => (given[flag] === undefined ? undefined : path.resolve(given[flag]));
  return { from, engine, passes: counts['--passes'], every: counts['--every'], json: at('--json'), compare: at('--compare') };
}

/**
 * The spread of `values`, in ms, each nearest-rank.
 * @param values The times, in ms.
 */
export const spreadOf = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))] ?? 0;
  return { p50: rank(50), p99: rank(99), max: sorted.at(-1) ?? 0, count: sorted.length };
};

/** The passes on the copy at `root`, the loop's delay and the level's reads while they ran. */
async function measured(asked: LoopAsked, root: string, fence: Fence) {
  const { wf, env } = copyEnvOf(root);
  const token = seatedOn(wf);
  fence.arm('read');
  const orch = await import('agent-orchestrator');
  const api = await import('api/app');
  const place = readOnlyPlace(orch.builtinGitPlace);
  const built = await appOver(api, orch, place, env);
  const listed = (await getJson(built.app, '/api/runs?limit=500', token)) as { items: { status: { status: string } }[] };
  const openRuns = listed.items.filter((r) => !FINISHED.has(r.status.status)).length;
  const context = await built.runtime.runPromise(Effect.context());
  const e = passEngine(orch.engine(env), fence);
  const program = orch
    .withProposalsPass(orch.tickRun({ repo: wf, verifyRest: false }))
    .pipe(Effect.provide(Layer.merge(orch.PlaceService.layer(place), orch.storeConfigLayer(env))), Effect.provideContext(context));
  const pass = async () => {
    fence.arm('pass');
    const t0 = performance.now();
    try {
      await orch.runWith(e, program);
    } finally {
      fence.arm('read');
    }
    return performance.now() - t0;
  };
  const delay = monitorEventLoopDelay({ resolution: 10 });
  const reads: number[] = [];
  let counting = false;
  const done = new AbortController();
  const reader = (async () => {
    let sent = performance.now();
    while (!done.signal.aborted) {
      sent = Math.max(sent + READ_EVERY_MS, performance.now());
      const wait = sent - performance.now();
      if (wait > 0) await sleep(wait);
      await getJson(built.app, '/api/level', token);
      if (counting) reads.push(performance.now() - sent);
    }
  })();
  delay.enable();
  const cold = await pass();
  delay.reset();
  counting = true;
  const warm: number[] = [];
  try {
    for (let i = 1; i < asked.passes; i++) {
      await sleep(asked.every);
      warm.push(await pass());
    }
  } finally {
    counting = false;
    done.abort();
    delay.disable();
    await reader;
    await built.runtime.dispose();
  }
  const ms = (ns: number) => ns / 1e6;
  const loop: Spread = { p50: ms(delay.percentile(50)), p99: ms(delay.percentile(99)), max: ms(delay.max), count: delay.count };
  return { openRuns, passes: { cold, warm: spreadOf(warm) }, delay: loop, level: spreadOf(reads) };
}

/** A spread as a line: its p50, p99 and max in ms, and its count. */
const said = (s: Spread) => `p50 ${s.p50.toFixed(1)} ms, p99 ${s.p99.toFixed(1)} ms, max ${s.max.toFixed(1)} ms (n ${s.count})`;

/**
 * The report as a person reads it, beside `before` where given.
 * @param report The measure now.
 * @param before An earlier measure, read from `--compare`.
 */
export function loopRendered(report: LoopMeasure, before?: LoopMeasure) {
  const rows: [string, (m: LoopMeasure) => string][] = [
    ['open runs', (m) => String(m.openRuns)],
    ['cold pass', (m) => `${m.passes.cold.toFixed(1)} ms`],
    ['warm passes', (m) => said(m.passes.warm)],
    ['event loop delay', (m) => said(m.delay)],
    ['GET /api/level', (m) => said(m.level)],
  ];
  const head = before ? '| | before | now |\n|---|---|---|' : '| | now |\n|---|---|';
  return [head, ...rows.map(([name, of]) => `| ${name} | ${before ? `${of(before)} | ` : ''}${of(report)} |`)].join('\n');
}

/**
 * Run the command on `args`: the exit code.
 * @param args The command's arguments.
 */
export async function main(args: readonly string[]) {
  const asked = loopArgsOf(args, process.env);
  const refused = (words: string, code: number) => {
    process.stderr.write(`store-measure loop: ${words}\n`);
    return code;
  };
  if (typeof asked === 'string') return refused(asked, 2);
  const tmp = os.tmpdir();
  const inside = destinationRefusal(tmp, [asked.from, asked.engine]);
  if (inside) return refused(inside, 2);
  let before: LoopMeasure | undefined;
  if (asked.compare !== undefined) {
    try {
      before = JSON.parse(fs.readFileSync(asked.compare, 'utf8')) as LoopMeasure;
    } catch (err) {
      return refused(`--compare ${asked.compare} does not read as a loop report: ${(err as Error).message}; name a file --json wrote`, 2);
    }
  }
  const commit = commitHere();
  const root = fs.mkdtempSync(path.join(tmp, 'store-measure-loop-'));
  try {
    copyStore(asked.from, path.join(root, 'wf'));
    copyStore(asked.engine, path.join(root, 'ae'), AE_LEFT_OUT);
    const fence = installFence([root]);
    let numbers: Awaited<ReturnType<typeof measured>>;
    try {
      numbers = await measured(asked, root, fence);
    } finally {
      fence.uninstall();
    }
    const report: LoopMeasure = { machine: machineNow(), commit, date: new Date().toISOString(), ...numbers, refusals: fence.refusals };
    process.stdout.write(`${loopRendered(report, before)}\n`);
    if (report.refusals.length) {
      for (const r of report.refusals) process.stderr.write(`store-measure loop: refused on a ${r.on}: ${r.kind} ${r.what}\n`);
      return refused('the measure refused itself: a read reached past the copy, as above. Find what asked it, and run it again', 1);
    }
    if (asked.json !== undefined) {
      fs.mkdirSync(path.dirname(asked.json), { recursive: true });
      fs.writeFileSync(asked.json, `${JSON.stringify(report, null, 2)}\n`);
    }
    return 0;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) process.exit(await main(process.argv.slice(2)));
