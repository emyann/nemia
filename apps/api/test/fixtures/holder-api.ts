/**
 * A holder of the api's test store, in a process of its own: the other half of `test/holder-stream.boundary.test.ts`.
 *
 * It is the daemon's half of the two — the process that ticks the store and holds the attached Claude Code sessions. It takes the
 * store's lease as an api does (`takeStore`), holds its engine's attached sessions in a scope of its own (`hold`), writes what that
 * hold serves onto the lease (`heldServes`), as `up` does at the same point, then files one attached session and ticks it into life.
 * It says `held <json>` on its stdout — the task's id, the port's address and the cards — and stays up until its stdin closes, when it
 * lets the hold and the lease go in that order, as the daemon's scope does, when it is sent a SIGTERM.
 *
 * Its engine is the runtime's own, built here rather than the package's `engine()`, for the one thing the package does not offer: the
 * Claude Code an attached session is run with (`claudeExecutable`), which must be the seat's stand-in and never this machine's. Its
 * root is the engine root under the store both processes share, so the viewer reads the same journals, the same transcripts and the
 * same token. The api's tests may import the runtime's public entries, and this is a test fixture.
 *
 * It is told what to do as one JSON object on its stdin: `{ root, cwd, plan }`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Exit, Layer, Scope } from 'effect';
import { Engine } from 'agent-runtime';
import { heldServes, takeStore, releaseStore } from 'agent-orchestrator';

type Told = { root: string; cwd: string; plan: object };

const told = await new Promise<Told>((resolve, reject) => {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => void (text += chunk));
  process.stdin.on('end', () => {
    try {
      resolve(JSON.parse(text) as Told);
    } catch (cause) {
      reject(cause);
    }
  });
});

const standIn = path.join(import.meta.dirname, 'stand-in-claude.ts');
fs.mkdirSync(told.cwd, { recursive: true });

/** The scope the engine, its hold and the lease live in: closed in that order as the process is told to go. */
const scope = Scope.makeUnsafe();

const layer = Engine.layer({ root: path.join(told.root, 'engine'), harnesses: { claude: 'claude' }, claudeExecutable: standIn });
const engine = await Effect.runPromise(
  Layer.build(layer).pipe(
    Effect.map((context) => Context.get(context, Engine)),
    Effect.provideService(Scope.Scope, scope),
  ),
);

const taken = takeStore({ every: 4000, cwd: told.root, by: 'api' });
const served = await Effect.runPromise(Scope.provide(engine.hold(), scope));
if (!served) throw new Error('the holder serves nothing: its engine runs no Claude Code attached');
heldServes(served.cards);

const taskId = await Effect.runPromise(
  engine.file({
    brief: 'say it',
    cwd: told.cwd,
    harness: 'claude',
    config: { env: { STANDIN_DIR: told.cwd, STANDIN_PLAN: JSON.stringify(told.plan) } },
  }),
);
await Effect.runPromise(engine.tick());

process.stdout.write(`${JSON.stringify({ what: 'held', taskId, url: served.url, cards: served.cards })}\n`);

/**
 * Told to go, on a SIGTERM as a daemon is: the hold let go — each session parked between two tool calls — then the lease, in that
 * order, as the daemon's scope closes them. Its stdin is already at its end, having carried what it was told, so the signal is what
 * it waits on; the timer is only what keeps the loop alive until then.
 */
const alive = setInterval(() => {}, 60_000);
process.on('SIGTERM', () => {
  clearInterval(alive);
  void Effect.runPromise(Scope.close(scope, Exit.void)).then(() => {
    releaseStore(taken.held);
    process.exit(0);
  });
});
