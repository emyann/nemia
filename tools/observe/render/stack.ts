/**
 * The throwaway stack of a render: one container of the image `compose.yaml` pins, started from a checkout's `tools/observe` under a
 * name of its own, on loopback ports Docker picks, with no named volume, and removed by that exact name.
 *
 * It is the one file that builds a Docker command line. Nothing here names the live stack: a name is made by `nameOf`, read back by
 * `NAME`, and `remove` refuses any other, so no pattern and no other container is ever stopped from here.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

/** A compose service, as far as the render reads it. */
export type Service = { image?: string; environment?: Record<string, string>; volumes?: string[] };

/** A compose file, as far as the render reads it. */
export type Compose = { services?: Record<string, Service> };

/** Where a started stack listens on this machine: Grafana's address, and the collector's OTLP/HTTP one. */
export type Ports = { grafana: string; otlp: string };

/** The ports of the container the render publishes: Grafana's, and OTLP over HTTP. */
export const GRAFANA_PORT = 3000;
export const OTLP_PORT = 4318;

/** The name of a render's container: `nemia-render-<pid>-<random>`, whole. */
export const NAME = /^nemia-render-\d+-[a-z0-9]+$/;

/** An error whose message names the fix, exit 2: a wrong flag, a name that is no render's, a bound out of range. */
export function refusal(message: string): Error {
  return Object.assign(new Error(message), { exitCode: 2 });
}

/** A name for a new render's container, this process's pid and six random characters in it. */
export const nameOf = (): string => `nemia-render-${process.pid}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;

/** The one service of `compose`; refuses a file with none or several, since the render copies one container. */
function serviceOf(compose: Compose): Service {
  const services = Object.values(compose.services ?? {});
  if (services.length !== 1) throw refusal(`compose.yaml has ${services.length} services, and a render copies exactly one: keep one`);
  return services[0];
}

/** A compose volume line as a read-only bind under `observeDir`, or undefined for a named volume, which a render never mounts. */
function bindOf(line: string, observeDir: string): string | undefined {
  const [from, to] = line.split(':');
  if (!from.startsWith('.') && !path.isAbsolute(from)) return undefined;
  return `${path.resolve(observeDir, from)}:${to}:ro`;
}

/**
 * The `docker` arguments that start the stack of `compose` as the container `name`, detached and removed when it stops: the file's
 * pinned image and environment, each of its bind mounts resolved under `observeDir` and read-only, no named volume, and Grafana and
 * OTLP/HTTP published on loopback ports Docker picks. Refuses a `name` that is no render's.
 */
export function runArgv(compose: Compose, observeDir: string, name: string): string[] {
  if (!NAME.test(name)) throw refusal(`${name} is no render's name (nemia-render-<pid>-<random>): a render starts only its own container`);
  const service = serviceOf(compose);
  if (!service.image) throw refusal('compose.yaml names no image for its service: pin one by digest');
  const env = Object.entries(service.environment ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]);
  const binds = (service.volumes ?? []).flatMap((line) => {
    const bind = bindOf(line, observeDir);
    return bind === undefined ? [] : ['-v', bind];
  });
  const ports = [GRAFANA_PORT, OTLP_PORT].flatMap((port) => ['-p', `127.0.0.1::${port}`]);
  return ['run', '-d', '--rm', '--name', name, ...ports, ...env, ...binds, service.image];
}

/** Run `docker` with `args`, bounded; its stdout, or an error saying what it answered. */
export function docker(args: readonly string[], seconds = 120): string {
  const ran = spawnSync('docker', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: seconds * 1000 });
  if (ran.status !== 0)
    throw new Error(`docker ${args.join(' ')} failed (${ran.error?.message ?? (ran.stderr.trim() || `exit ${ran.status}`)})`);
  return ran.stdout;
}

/** The loopback address Docker published the container's `port` on. */
function publishedOf(name: string, port: number): string {
  const said = docker(['port', name, `${port}/tcp`])
    .trim()
    .split('\n')[0];
  if (!/^127\.0\.0\.1:\d+$/.test(said))
    throw new Error(`docker port ${name} ${port}/tcp answered ${said || 'nothing'}, not a loopback port`);
  return `http://${said}`;
}

/** Where the started container `name` listens. */
export const portsOf = (name: string): Ports => ({ grafana: publishedOf(name, GRAFANA_PORT), otlp: publishedOf(name, OTLP_PORT) });

/** Remove the container `name` and its anonymous volumes, by that exact name; refuses a name that is no render's. */
export function remove(name: string): void {
  if (!NAME.test(name)) throw refusal(`${name} is no render's name (nemia-render-<pid>-<random>): a render removes only its own container`);
  spawnSync('docker', ['rm', '-f', '-v', name], { stdio: 'ignore', timeout: 60_000 });
}

/** Wait `ms`. */
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => void setTimeout(resolve, ms));

/**
 * Ask `probe` once a second until it answers something, for `seconds` at most on a monotonic clock; its answer, or an error naming
 * `what` did not come and the last thing the probe said against it.
 */
export async function awaited<T>(what: string, seconds: number, probe: () => Promise<T | undefined> | T | undefined): Promise<T> {
  const began = performance.now();
  let last = '';
  for (;;) {
    try {
      const answer = await probe();
      if (answer !== undefined) return answer;
    } catch (err) {
      last = (err as Error).message;
    }
    if (performance.now() - began > seconds * 1000) throw new Error(`${what} did not come within ${seconds}s${last ? ` (${last})` : ''}`);
    await sleep(1000);
  }
}

/** GET or POST `url`, bounded at ten seconds; the answer's JSON, or an error naming its status. */
export async function asked(url: string, body?: unknown): Promise<unknown> {
  const answer = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    ...(body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const text = await answer.text();
  if (!answer.ok) throw new Error(`${url} answered ${answer.status}: ${text.slice(0, 200)}`);
  return text ? (JSON.parse(text) as unknown) : {};
}

/**
 * Wait until the container `name` says it is healthy, the image's own word that every store in it answers, and Grafana at `grafana`
 * lists each dashboard of `uids`, for `seconds` at most each.
 */
export async function ready(name: string, grafana: string, uids: readonly string[], seconds = 180): Promise<void> {
  await awaited(`${name} healthy`, seconds, () => {
    const status = docker(['inspect', '-f', '{{.State.Health.Status}}', name]).trim();
    if (status !== 'healthy') throw new Error(`it is ${status}`);
    return true;
  });
  await awaited(`Grafana listing ${uids.join(', ')}`, seconds, async () => {
    const listed = ((await asked(`${grafana}/api/search?type=dash-db`)) as { uid: string }[]).map((found) => found.uid);
    const missing = uids.filter((uid) => !listed.includes(uid));
    if (missing.length) throw new Error(`not yet ${missing.join(', ')}`);
    return true;
  });
}

/** Start the container `argv` describes (`runArgv`); an error when Docker refuses. */
export const start = (argv: readonly string[]): void => void docker(argv, 300);
