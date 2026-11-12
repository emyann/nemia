/**
 * A store served for the tests of the client's own verbs (`get`, `apply`, `explain`), as the moved reads' test serves one
 * (`reads.test.ts`): a scratch store (`test-kit/scratch`, which reaps what runs in it), the api on it started with `--no-tick` on a
 * free port, and the lease the client reads, its `url` alone. `nemia` runs the bin on it, waited on for its end, never for a length of
 * time.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ambient } from './ambient.ts';
import { scratch } from 'test-kit/scratch';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const API = path.join(import.meta.dirname, '..', '..', 'api');

/** How a child ended, and what it said on each stream. */
export type Said = { code: number | null; out: string; err: string };

/** A file written whole, its folder made. */
export const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/**
 * A store `seed` fills, served by an api whose environment `more` adds to (`WF_EXPOSED`); `nemia` runs the bin on it, `stdin` its input
 * where given.
 */
export async function servedStore(prefix: string, seed: (root: string) => void, more: NodeJS.ProcessEnv = {}) {
  const root = scratch(`${prefix}store-`);
  const home = scratch(`${prefix}home-`);
  const env: NodeJS.ProcessEnv = (() => {
    return {
      ...ambient('NEMIA_ON_INSTALLED'),
      WF_ROOT: root,
      AE_ROOT: scratch(`${prefix}engine-`),
      HOME: home,
      WF_MAX_RUNS: '2',
      WF_MAX_CONCURRENT: '2',
      NEMIA_DAEMON_START: 'off',
      ...more,
    };
  })();
  seed(root);
  const child = spawn(process.execPath, ['src/main.ts', '--no-tick'], { cwd: API, env: { ...env, PORT: '0' } });
  let said = '';
  const ended = new Promise<void>((resolve) => child.on('close', () => resolve()));
  const url = await new Promise<string>((resolve, reject) => {
    const look = () => {
      const m = /api listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(said);
      if (m?.[1]) resolve(m[1]);
    };
    child.stdout.on('data', (chunk) => ((said += chunk), look()));
    child.stderr.on('data', (chunk) => ((said += chunk), look()));
    void ended.then(() => reject(new Error(`the api ended before it listened:\n${said}`)));
  });
  write(path.join(root, 'daemon.json'), JSON.stringify({ url }));
  const nemia = (argv: readonly string[], stdin?: string): Promise<Said> => {
    const run = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    run.stdout.on('data', (chunk) => (out += chunk));
    run.stderr.on('data', (chunk) => (err += chunk));
    run.stdin.end(stdin ?? '');
    return new Promise((resolve, reject) => {
      run.on('error', reject);
      run.on('close', (code) => resolve({ code, out, err }));
    });
  };
  const stop = async () => {
    child.kill();
    await ended;
  };
  return { root, home, env, url, nemia, stop, said: () => said };
}
