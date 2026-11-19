/**
 * This machine's browser, as `nemia open` reaches it: which program opens a link (`openerOf`, proved by `contracts/opener.contract.ts`),
 * and that program run on it (`opened`), the client's one reach of a browser and, beside `src/local.ts`, its one other process. The
 * link is handed on the opener's command line, as the installer hands it (`tools/release/install.sh`): it is single-use and lasts ten
 * minutes, and `docs/architecture.md` says what that leaves open on a machine several users share.
 */
import { spawn } from 'node:child_process';
import type { OpenerOf } from '../contracts/opener.contract.ts';

/**
 * Which program opens a link on `platform`: `open` on macOS; `xdg-open` on Linux where a display is set; none elsewhere, the link to be
 * printed, saying why.
 * @param platform The system, as `process.platform` names it.
 * @param display Whether a display is set (`DISPLAY` or `WAYLAND_DISPLAY`).
 */
export const openerOf: OpenerOf = (platform, display) => {
  if (platform === 'darwin') return { kind: 'open', program: 'open' };
  if (platform !== 'linux') return { kind: 'print', reason: 'no-opener' };
  return display ? { kind: 'open', program: 'xdg-open' } : { kind: 'print', reason: 'no-display' };
};

/**
 * How long an opener is waited on before it is taken as opened: `xdg-open` waits on the browser it starts on some desktops, and a
 * browser that is open is no failure.
 */
const WAITED_MS = 5_000;

/**
 * Whether a display is set in `env`, as `openerOf` takes it.
 * @param env The environment, whose `DISPLAY` and `WAYLAND_DISPLAY` are read.
 */
export const displayed = (env: NodeJS.ProcessEnv) => Boolean(env.DISPLAY?.trim() || env.WAYLAND_DISPLAY?.trim());

/**
 * Whether `program` opened `url`: run with its output ignored, true where it exits 0 or is still running after `WAITED_MS`, false where
 * it cannot be started or exits otherwise.
 * @param program The opener `openerOf` chose.
 * @param url The link it opens.
 * @param env The environment it runs with, whose `PATH` finds it.
 */
export function opened(program: 'open' | 'xdg-open', url: string, env: NodeJS.ProcessEnv) {
  return new Promise((resolve) => {
    const child = spawn(program, [url], { env, stdio: 'ignore', detached: true });
    const waited = setTimeout(() => {
      child.unref();
      resolve(true);
    }, WAITED_MS);
    const settle = (ok: boolean) => {
      clearTimeout(waited);
      resolve(ok);
    };
    child.on('error', () => settle(false));
    child.on('exit', (code) => settle(code === 0));
  });
}
