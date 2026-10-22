/**
 * What every test file's process starts with, loaded by the package's `test` script with `--import`: the daemon's two ceilings,
 * `WF_MAX_RUNS` and `WF_MAX_CONCURRENT`, set to `SENTINEL`, a value their readers refuse by name. A run's check inherits the environment
 * of the `nemia up` that runs it, so a test that reads a ceiling it did not set would pass or fail with the daemon's; here it fails on
 * every machine, saying which variable to set. A test file that reads a ceiling sets or deletes it itself (`ambient.test.ts`).
 *
 * And `WF_DEFAULT_FACTORY_STARTS=1`: most tests start runs in scratch repositories no factory holds, often of cards that name no factory,
 * and the switch lets those starts go to the default factory (`defaultStartsAllowed`). A test of the refusal they meet as shipped deletes
 * it first.
 *
 * And `NEMIA_DAEMON_START=off` (`DEMAND_OFF`): a command that ticks, typed in a test on a store no daemon holds, would start the daemon of
 * this checkout (`ensureDaemon`), and so would a `nemia` child a test spawns with this environment. A test of the start hands `main` a
 * host of its own and unsets the switch in that host's environment alone.
 *
 * And no `OTEL_EXPORTER_OTLP_ENDPOINT`: a suite typed in a shell that names a collector would post every test daemon's spans to it
 * (`otlpOf`). A test that exports sets the address of a collector it made itself.
 *
 * And `CLAUDE_CONFIG_DIR` set to a scratch folder (`CONFIG`): `nemia factory add`, `apply` and `trust` give a place its harness's trust
 * in the harness's own file, which a test must never write on the person's machine. A test of a trust sets a folder of its own.
 *
 * And `WF_ROOT`, `AE_ROOT` and `HOME` each set to a scratch folder of this process's (`STORE`, `ENGINE`, `AWAY`), before any test file's
 * top level runs. A store module that pins a root as it loads pins a throwaway one, and `os.homedir()` answers a throwaway too, so a
 * default root still left somewhere lands in scratch rather than on the person's store: on 2026-10-21 a run of the src tests in one
 * process emptied `~/.agent-workflows/runs`, because a module first loaded with `WF_ROOT` unset pinned itself to the live root and every
 * later file's start, remove and forget acted on it. A test file that sets its own root is unaffected — it sets it after this — and
 * nothing here protects a file that forgets, but what it forgets is now a throwaway.
 *
 * Moving `HOME` moves `os.homedir()` for this process and every child it spawns, git's global configuration and `~/.claude.json` with it.
 * Every git call a test makes carries its own identity (`-c user.email`), and the shipped place carries `AS_RUN`, so no commit of a test
 * loses one. A test that needs something of the person's own `$HOME` reads it from `REAL_HOME`.
 */
import os from 'node:os';
import { scratch } from './scratch.ts';

/** The value both ceilings start with in a test: not a count, so `maxRuns` and `maxConcurrent` refuse it with exit 2. */
export const SENTINEL = 'set-it-in-the-test';

process.env.WF_MAX_RUNS = SENTINEL;
process.env.WF_MAX_CONCURRENT = SENTINEL;
process.env.WF_DEFAULT_FACTORY_STARTS = '1';
process.env.NEMIA_DAEMON_START = 'off';
delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

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
