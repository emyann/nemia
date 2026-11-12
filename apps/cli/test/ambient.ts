/**
 * The environment a cli test hands the children it spawns (the api, `nemia`), as CI would: this process's, without what the daemon sets
 * for each session it files. The cli has no setup loaded into every test file, so each spawn takes its environment from here rather
 * than from `process.env`: a step's session runs these tests with the daemon's environment, and CI with none of it.
 *
 * Dropped (`DROPPED`): `OTEL_EXPORTER_OTLP_ENDPOINT`, a collector every child would post its spans to, and the daemon's per-session
 * variables, the orchestrator's one list (`SESSION_VARIABLES`): `WF_SESSION_TOKEN`, minted for each session, which `nemia` sends as
 * `Authorization: Bearer` and a test's api, which never minted it, answers 401; and `WF_MEMORY_LIMIT` and `WF_CGROUP_PARENT`, the daemon
 * unit's, which an api that files through the real engine would inherit. And the person's own context (`NEMIA_CONTEXT`, and
 * `XDG_CONFIG_HOME`, where the client's config file is): a test's `nemia` asks the store it seats, never the daemon the person's
 * config names, nor the remote daemon a forwarded CLI would call (`FORWARD_VARIABLES`). A test that means one sets it in the
 * environment it builds on this.
 */
import { FORWARD_VARIABLES, SESSION_VARIABLES } from 'agent-orchestrator';

/** What the daemon sets that no child of a cli test inherits. */
export const DROPPED = [
  ...SESSION_VARIABLES,
  ...FORWARD_VARIABLES,
  'OTEL_EXPORTER_OTLP_ENDPOINT',
  'NEMIA_CONTEXT',
  'XDG_CONFIG_HOME',
] as const;

/** This process's environment without `DROPPED`, and without each of `also`. */
export function ambient(...also: readonly string[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [...DROPPED, ...also]) delete env[name];
  return env;
}
