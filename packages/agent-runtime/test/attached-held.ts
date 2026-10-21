/**
 * The holder a boundary test of the attached sessions works with: the stand-in Claude Code the SDK is given, a store and a spawn
 * whose session works in a folder of its own, a long-lived request, the lines the stand-in wrote, a holder for a scope the test
 * closes, and the run file read again. Here rather than in one test file because a test that must set `CLAUDE_CONFIG_DIR` before it
 * imports `src` imports these the same way (`attached-follow.test.ts`), and there is one copy of them.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Effect, Exit, Logger, Scope } from 'effect';
import { attachedSessions } from '../src/harness/claude/attached.ts';
import { filesOf, readRun } from '../src/harness/claude/attached-file.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { until } from '../src/waits/index.ts';

export const STAND_IN = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'stand-in-claude.ts');
export const NAME = 'ae/t1/1';

/** A store and the stand-in's folder, and a spawn of `plan` whose session works there, `config` laid over the stand-in's own. */
export const place = (plan: object, config: SpawnRequest['config'] = {}) => {
  const root = scratch('ae-attached-');
  const dir = path.join(root, 'stand-in');
  fs.mkdirSync(dir, { recursive: true });
  const request: SpawnRequest = {
    name: NAME,
    brief: 'do the work',
    cwd: dir,
    config: { ...config, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(plan) } },
  };
  return { root, dir, request };
};

/**
 * The same, long-lived: the request carries `restartPolicy: 'Always'` with `background: true`, which is what makes it run attached, and
 * its stand-in works every turn its input brings (`turns: 'many'`). `config` is laid over the request's own.
 */
export const kept = (plan: object, config: Record<string, unknown> = {}) => {
  const { root, dir, request } = place({ turns: 'many', ...plan });
  return {
    root,
    dir,
    request: {
      ...request,
      restartPolicy: 'Always' as const,
      config: { background: true, ...config, ...request.config },
    } satisfies SpawnRequest,
  };
};

/** The lines of the stand-in's `file`, each parsed. */
export const lines = (dir: string, file: string): unknown[] => {
  const at = path.join(dir, file);
  return fs.existsSync(at)
    ? fs
        .readFileSync(at, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as unknown)
    : [];
};

/**
 * A holder of the sessions under `root`, for a scope the test closes, its let-go bound `letGoMs` where one is given. `said` keeps every
 * line its let-go logged, at its level, so what the holder says as it lets go is read rather than printed.
 */
export const holder = async (root: string, letGoMs?: number) => {
  const attached = attachedSessions(root, STAND_IN, letGoMs === undefined ? {} : { letGoMs });
  const scope = Scope.makeUnsafe();
  const said: string[] = [];
  const keeper = Logger.make(
    ({ message, logLevel }) => void said.push(`${logLevel} ${(Array.isArray(message) ? message : [message]).join(' ')}`),
  );
  await Effect.runPromise(Scope.provide(attached.hold, scope));
  return {
    attached,
    said,
    close: () => Effect.runPromise(Scope.close(scope, Exit.void).pipe(Effect.provide(Logger.layer([keeper])))),
  };
};

/** What the run file says of the session, read again. */
export const run = (root: string) => readRun(filesOf(root, NAME).run);

/** Waits until the stand-in is in its call, held at `release`. */
export const inCall = (t: TestContext, root: string) => until(t, () => run(root)?.calling, 'the session in its call', { everyMs: 50 });
