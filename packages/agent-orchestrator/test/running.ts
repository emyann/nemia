/** The processes alive on this machine, read from `/proc` (Linux only): `running(file)` finds each whose command line names `file`. */
import fs from 'node:fs';

/** The processes whose command line names `file`, read from /proc. */
export function running(file: string): number[] {
  return fs
    .readdirSync('/proc')
    .filter((entry) => /^\d+$/.test(entry))
    .filter((pid) => {
      try {
        return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').includes(file);
      } catch {
        return false;
      }
    })
    .map(Number);
}
