/**
 * What every test file's process starts with, loaded by the package's `test` script with `--import`: the daemon's two ceilings,
 * `WF_MAX_RUNS` and `WF_MAX_CONCURRENT`, set to `SENTINEL`, a value their readers refuse by name. A run's check inherits the environment
 * of the `nemia up` that runs it, so a test that reads a ceiling it did not set would pass or fail with the daemon's; here it fails on
 * every machine, saying which variable to set. A test file that reads a ceiling sets or deletes it itself (`ambient.test.ts`).
 *
 * And `WF_DEFAULT_FACTORY_STARTS=1`: most tests start runs in scratch repositories no factory holds, often of cards that name no factory,
 * and the switch lets those starts go to the default factory (`StoreConfig`'s `defaultFactoryStarts`). A test of the refusal they meet as
 * shipped deletes it first.
 *
 * And `NEMIA_DAEMON_START=off` (`DEMAND_OFF`): a command that ticks, typed in a test on a store no daemon holds, would start the daemon of
 * this checkout (`ensureDaemon`), and so would a `nemia` child a test spawns with this environment. A test of the start hands `main` a
 * host of its own and unsets the switch in that host's environment alone.
 *
 * And no `OTEL_EXPORTER_OTLP_ENDPOINT`: a suite typed in a shell that names a collector would post every test daemon's spans to it
 * (`otlpOf`). A test that exports sets the address of a collector it made itself.
 *
 * And none of the daemon's per-session variables (`SESSION_VARIABLES`, the package's one list): `WF_SESSION_TOKEN`, which the daemon mints
 * for each session and a `nemia` child sends as `Authorization: Bearer` to a test's api that never minted it, and `WF_MEMORY_LIMIT` and
 * `WF_CGROUP_PARENT`, which the daemon's unit sets and a test that files through the real engine would inherit. A step's own run of the
 * suite reads what CI reads, which sets none of them. A test that means one sets it in its own scope.
 *
 * And none of the daemon's serving variables (`SERVING_VARIABLES`): `NEMIA_BIND`, which a server's unit sets to its network's address
 * and an api a test starts would listen on, and `WF_EXPOSED`, which would mark every store a test makes exposed. A test that means one
 * sets it in its own scope.
 *
 * And `CLAUDE_CONFIG_DIR` set to a scratch folder (`CONFIG`): `nemia factory add`, `apply` and `trust` give a place its harness's trust
 * in the harness's own file, which a test must never write on the person's machine. A test of a trust sets a folder of its own.
 *
 * And `WF_ROOT`, `AE_ROOT` and `HOME` each set to a scratch folder of this process's (`STORE`, `ENGINE`, `AWAY`), before any test file's
 * top level runs. A test that names no store of its own reads this one, and `os.homedir()` answers a throwaway too, so a default root a
 * test forgets to name lands in scratch rather than on the person's store. A test with a store of its own hands it on as an environment
 * record (`{ ...process.env, WF_ROOT: ROOT }`); no module of `src` reads a root as it loads (`test/root-given.test.ts`), and this is the
 * one file of the package's tests that writes a `WF_` variable as it loads (`tools/guards/test/env-given.test.ts`).
 *
 * Moving `HOME` moves `os.homedir()` for this process and every child it spawns, git's global configuration and `~/.claude.json` with it.
 * So the throwaway home is given a `.gitconfig` of its own with a test identity (`GIT_IDENTITY`): a commit a test makes through a script
 * that names no `-c user.email` of its own — a landing's merge commit, the ship's — was signed with the person's name until now, and is
 * signed with this one instead. A test that needs something of the person's own `$HOME` reads it from `REAL_HOME`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { FORWARD_VARIABLES, SERVING_VARIABLES, SESSION_VARIABLES } from '../src/config/config.store.ts';

/** The value both ceilings start with in a test: not a count, so `maxRuns` and `maxConcurrent` refuse it with exit 2. */
export const SENTINEL = 'set-it-in-the-test';

process.env.WF_MAX_RUNS = SENTINEL;
process.env.WF_MAX_CONCURRENT = SENTINEL;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

for (const name of [...SESSION_VARIABLES, ...SERVING_VARIABLES, ...FORWARD_VARIABLES]) delete process.env[name];

/** Where a harness keeps its own files in a test: a folder of this process's, never the person's. */
export const CONFIG = scratch('wf-ambient-claude-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;

/** The person's own home, read before this file moved it: what a test that truly needs it asks for, by name. */
export const REAL_HOME = os.homedir();

/** Where the store lives in a test (`WF_ROOT`): a folder of this process's, never `~/.agent-workflows`. */
export const STORE = scratch('wf-ambient-store-');
process.env.WF_ROOT = STORE;

/** Where the engine's store lives in a test (`AE_ROOT`): a folder of this process's, never `~/.agent-engine`. */
export const ENGINE = scratch('wf-ambient-engine-');
process.env.AE_ROOT = ENGINE;

/** What `os.homedir()` answers in a test: a folder of this process's, so a root that still falls back to home falls into scratch. */
export const AWAY = scratch('wf-ambient-home-');
process.env.HOME = AWAY;

/** Who a commit a test makes is by, where the script making it names nobody: never the person running the suite. */
export const GIT_IDENTITY = { name: 'nemia test', email: 'test@nemia.invalid' };

fs.writeFileSync(path.join(AWAY, '.gitconfig'), `[user]\n\tname = ${GIT_IDENTITY.name}\n\temail = ${GIT_IDENTITY.email}\n`);
