/**
 * The environment a cli test hands the children it spawns (the api, `nemia`), as CI would: this process's, without what the daemon sets
 * for each session it files. The cli has no setup loaded into every test file, so each spawn takes its environment from here rather
 * than from `process.env`: a step's session runs these tests with the daemon's environment, and CI with none of it.
 *
 * Dropped: `OTEL_EXPORTER_OTLP_ENDPOINT`, a collector every child would post its spans to; `WF_SESSION_TOKEN`, minted for each session,
 * which `nemia` sends as `Authorization: Bearer` and a test's api, which never minted it, answers 401; and `WF_MEMORY_LIMIT` and
 * `WF_CGROUP_PARENT`, the daemon unit's, which an api that files through the real engine would inherit. A test that means one sets it in
 * the environment it builds on this.
 */

/** What the daemon sets that no child of a cli test inherits. */
export const DAEMON_ONLY = ['OTEL_EXPORTER_OTLP_ENDPOINT', 'WF_SESSION_TOKEN', 'WF_MEMORY_LIMIT', 'WF_CGROUP_PARENT'] as const;

/** This process's environment without `DAEMON_ONLY`, and without each of `also`. */
export function ambient(...also: readonly string[]): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of [...DAEMON_ONLY, ...also]) delete env[name];
  return env;
}
