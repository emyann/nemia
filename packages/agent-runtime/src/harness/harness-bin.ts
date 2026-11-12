/**
 * Where a harness's program is found: first in the folder a layer above names (`EngineOptions.harnessBin`, its tools folder's `bin/`,
 * where a person activates a harness), read at every call so a program put there after the engine started is run; a harness's own
 * resolver says what comes after (`claudeExecutableOf`, `codexHarness`).
 */
import fs from 'node:fs';
import path from 'node:path';

/** `<harnessBin>/<program>` where it exists now, a link followed to its file; `undefined` with no `harnessBin`, or none there. */
export const programIn = (harnessBin: string | undefined, program: string): string | undefined => {
  if (!harnessBin) return undefined;
  const at = path.join(harnessBin, program);
  return fs.existsSync(at) ? at : undefined;
};

/** `program` as `PATH` finds it now: the first of its folders holding it as a file this user may run, or `undefined`. */
export const programOnPath = (program: string): string | undefined => {
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue;
    const at = path.join(dir, program);
    try {
      fs.accessSync(at, fs.constants.X_OK);
      if (fs.statSync(at).isFile()) return at;
    } catch {}
  }
  return undefined;
};
