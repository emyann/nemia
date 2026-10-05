/**
 * `node pictures.ts <closeout.json>` — the proof that a change to the board's pages hands its reviewer pictures of them.
 *
 * Reads what the work touched in the working directory: the paths its own commits since `WF_BASE_REF` changed, along the first parent,
 * and what a merge on that line changed beyond every parent, its resolution; a path a merged branch changed, main's, is not the work's. A
 * change under `apps/web/src` touches a page; one only under `apps/web/test`, or outside `apps/web`, touches none and asks for no picture.
 * When a page is touched, it reads the closeout's `artifacts` (`WF_CLOSEOUT`, flat) and counts a picture for each entry that is an image
 * by its extension (`IMAGES`, any case) and a regular file of more than 0 bytes: by an absolute path inside the step's files directory
 * (`WF_ARTIFACTS`); by a path from the workspace root, where the run collected it in that directory, or else in the workspace. A path
 * that climbs out with `..`, or an absolute one anywhere else, never counts.
 *
 * Prints what it counted and exits 0 when no page was touched or a picture is named. Exits 1, on stderr, when a page was touched and no
 * picture is named, naming what was touched, the command that takes pictures and each entry that did not count with why; and when
 * `WF_BASE_REF` is not set, git cannot say what was touched, or no closeout reached it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** A reason the step is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** Where a change touches the board's pages. */
const PAGES = 'apps/web/src/';

/** The extensions a picture has, lower case. */
const IMAGES = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'];

/** How many touched paths a refusal names before it says how many more. */
const SHOWN = 5;

/**
 * Every path the work's own commits touched since `base`, from the root, once each: its commits along the first parent, and of a merge
 * there only what differs from every parent (`--cc`), so what a merged branch changed is left out. Refuses when git cannot say, never
 * guessing.
 */
function touchedSince(base: string): string[] {
  const range = `${base}..HEAD`;
  const args = ['-c', 'core.quotePath=false', 'log', '--first-parent', '--cc', '--no-renames', '--format=', '--name-only', range, '--'];
  const log = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (log.status !== 0)
    throw new Refusal(
      `cannot tell what the work touched, since git log --first-parent --name-only ${range} failed ` +
        `(${(log.stderr ?? '').trim() || log.error?.message}); no picture is skipped on a guess`,
    );
  return [...new Set(log.stdout.split('\n').filter(Boolean))];
}

/**
 * The `artifacts` of the closeout at `file`, a list of none when it names none; refuses a missing argument or a file that is no JSON
 * object.
 */
function artifactsOf(file: string | undefined): unknown[] {
  if (!file) throw new Refusal('no closeout reached the check: WF_CLOSEOUT is empty, so there is no list of pictures to read');
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Refusal(`no closeout reached the check: ${file} does not read as JSON (${(err as Error).message})`, { cause: err });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    throw new Refusal(`no closeout reached the check: ${file} is not an object`);
  const { artifacts } = parsed as Record<string, unknown>;
  return Array.isArray(artifacts) ? artifacts : [];
}

/** Whether `file` is inside `dir`, below it and not the directory itself. */
const isInside = (dir: string, file: string): boolean => {
  const within = path.relative(dir, file);
  return Boolean(within) && within !== '..' && !within.startsWith(`..${path.sep}`) && !path.isAbsolute(within);
};

/** What is at `file`, every link followed: a picture, an empty file, or nothing a picture can be. */
function fileAt(file: string): 'picture' | 'empty' | 'absent' {
  const at = fs.statSync(file, { throwIfNoEntry: false });
  return !at?.isFile() ? 'absent' : at.size > 0 ? 'picture' : 'empty';
}

/** The places an entry is looked for, or why it is looked for nowhere: `files` the step's files directory, `workspace` the working one. */
function placesOf(entry: string, files: string | undefined, workspace: string): string[] | string {
  if (path.isAbsolute(entry)) {
    if (!files) return 'an absolute path, and WF_ARTIFACTS is not set';
    return isInside(path.resolve(files), path.resolve(entry)) ? [entry] : `outside ${files}, where the run reads a step's files`;
  }
  const rel = path.normalize(entry);
  if (rel === '..' || rel.startsWith(`..${path.sep}`)) return 'climbs out of the workspace with ..';
  return [...(files ? [path.join(files, rel)] : []), path.join(workspace, rel)];
}

/** Why the named `entry` is no picture, or undefined when it is one. */
function notAPicture(entry: unknown, files: string | undefined, workspace: string): string | undefined {
  if (typeof entry !== 'string' || !entry) return 'not a path';
  if (!IMAGES.includes(path.extname(entry).toLowerCase())) return `not an image: a picture ends ${IMAGES.join(', ')}`;
  const places = placesOf(entry, files, workspace);
  if (typeof places === 'string') return places;
  const found = places.map(fileAt);
  if (found.includes('picture')) return undefined;
  return found.includes('empty') ? 'empty, 0 bytes' : 'not there';
}

/** The refusal of a change that touched `pages` and named no picture among `artifacts`, each entry said with why. */
function noPicture(pages: readonly string[], refused: readonly (readonly [string, string])[], files: string | undefined): Refusal {
  const shown = pages.slice(0, SHOWN).join(', ') + (pages.length > SHOWN ? `, and ${pages.length - SHOWN} more` : '');
  return new Refusal(
    [
      `the work touches the board's pages (${shown}), and the closeout's \`artifacts\` names no picture of them.`,
      'Picture the pages and the states the change touches, in light and dark:',
      `  WF_ARTIFACTS=${files ?? '<your files directory>'} npm run e2e -- --photos --pages <name,…>`,
      'and name each picture in `artifacts` by its absolute path. A change only under apps/web/test asks for none.',
      ...(refused.length ? ['Named, and not counted:', ...refused.map(([entry, why]) => `  ${entry}: ${why}`)] : []),
    ].join('\n'),
  );
}

/** The whole run: exit 0 when no page was touched or a picture is named, 1 with the refusal on stderr otherwise. */
function main(): number {
  const say = (line: string): void => void process.stdout.write(`wf pictures: ${line}\n`);
  try {
    const base = process.env.WF_BASE_REF;
    if (!base) throw new Refusal("WF_BASE_REF is not set: pictures are asked in a run's check, where it names the base the work began on");
    const pages = touchedSince(base).filter((p) => p.startsWith(PAGES));
    if (!pages.length) {
      say(`nothing under ${PAGES.slice(0, -1)} was touched: no picture asked`);
      return 0;
    }
    const files = process.env.WF_ARTIFACTS || undefined;
    const named = artifactsOf(process.argv[2]).map((entry) => [entry, notAPicture(entry, files, process.cwd())] as const);
    const counted = named.filter(([, why]) => why === undefined).map(([entry]) => String(entry));
    if (!counted.length) throw noPicture(pages, named.map(([entry, why]) => [String(entry), String(why)] as const), files);
    say(`${counted.length} picture${counted.length === 1 ? '' : 's'} named: ${counted.join(', ')}`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`wf pictures: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
