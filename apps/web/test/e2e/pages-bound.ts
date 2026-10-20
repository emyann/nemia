/**
 * The whole e2e's page time, summed across the shards that ran it:
 *
 *     node test/e2e/pages-bound.ts <dir>…
 *
 * Reads every `pages-<i>-of-<n>.json` a shard run wrote (`run.ts`, into `OUT`) under the directories given, refuses a set that is not one
 * whole run's — none at all, a shard missing, doubled, out of range, or of another run (`shardsMissing`, timing.ts) — and then holds their
 * pages together to `PAGES_BOUND_MS`, the bound a whole run is held to (`overBound`, with `whole`): a shard is a run of some pages and is
 * held to nothing itself, since the bound is of the whole and is additive, which is why it is applied here and not in a shard.
 *
 * CI is its caller: `.github/workflows/ci.yml` runs the e2e in shards, each uploading its file, and the `e2e-bound` job downloads them all
 * and runs this. A person may run it over `.e2e/` after running the shards by hand. It imports nothing outside node and this folder.
 *
 * Says the sum against the bound either way (`pagesLine`), and exits 1 with what to do next: 2 when the files are no whole run's.
 */
import fs from 'node:fs';
import path from 'node:path';
import { overBound, pagesLine, shardPages, shardsMissing, type ShardPages } from './timing.ts';

/** The shard file a shard run writes, by its name: `pages-<i>-of-<n>.json`. */
const SHARD_FILE = /^pages-\d+-of-\d+\.json$/;

/** Every shard file under `dirs`, each directory read one level deep, in the order their names sort. */
function shardsIn(dirs: readonly string[]): ShardPages[] {
  return dirs.flatMap((dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true, recursive: true })
      .filter((entry) => entry.isFile() && SHARD_FILE.test(entry.name))
      .map((entry) => path.join(entry.parentPath, entry.name))
      .sort()
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf8')) as ShardPages),
  );
}

const dirs = process.argv.slice(2);
if (!dirs.length) {
  console.error('pages-bound: name the directories the shards wrote their page times into: node test/e2e/pages-bound.ts <dir>…');
  process.exit(2);
}
const absent = dirs.filter((dir) => !fs.existsSync(dir));
if (absent.length) {
  console.error(
    `pages-bound: ${absent.join(', ')} ${absent.length > 1 ? 'are' : 'is'} not there, and a shard's page times cannot be read from it: ` +
      'run `npm run e2e -- --shard <i> --of <n>` with WF_ARTIFACTS set to the directory, and name that directory here',
  );
  process.exit(2);
}
const shards = shardsIn(dirs);
const no = shardsMissing(shards);
if (no) {
  console.error(`pages-bound: ${no}`);
  process.exit(2);
}
const pages = shardPages(shards);
console.log(`pages-bound: ${shards.length} shard${shards.length > 1 ? 's' : ''} over ${pages.length} page visits — ${pagesLine(pages)}`);
const late = overBound(pages, true);
if (late) {
  console.error(`pages-bound: ${late}`);
  process.exit(1);
}
