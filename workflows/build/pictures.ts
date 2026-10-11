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
 * A change under `tools/observe` that a dashboard reads owes the same of its dashboards, rendered on a throwaway stack
 * (`tools/observe/render/render.ts`): each `tools/observe/dashboards/<name>.json` it changed owes `dashboard-<name>.png` and
 * `dashboard-<name>.txt`, both named and there by the same rule; any other path there but `README.md` and `profile/` (`UNREAD`), one
 * such pair at least. A dashboard's picture is no picture of a page: a change that touches both owes both.
 *
 * Prints what it counted and exits 0 when neither was touched or what is owed is named. Exits 1, on stderr, when a page was touched and
 * no picture is named, or a dashboard's pair is missing, naming what was touched, the command to run and each entry that did not count
 * with why; and when `WF_BASE_REF` is not set, git cannot say what was touched, or no closeout reached it.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** A reason the step is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** Where a change touches the board's pages. */
const PAGES = 'apps/web/src/';

/** Where a change touches what the side Grafana's dashboards read, and the paths there no dashboard reads. */
const OBSERVE = 'tools/observe/';
const UNREAD = ['tools/observe/README.md', 'tools/observe/profile/'];

/** Where a dashboard's file is, and the two files a render writes of the dashboard `name`. */
const DASHBOARDS = 'tools/observe/dashboards/';
const pairOf = (name: string): [string, string] => [`dashboard-${name}.png`, `dashboard-${name}.txt`];

/** A file a render writes of a dashboard, by its name: never a picture of one of the board's pages. */
const OF_A_DASHBOARD = /^dashboard-.+\.png$/i;

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

/** Why the named `entry` is no file the run reads, or undefined when it is one, of more than 0 bytes. */
function notThere(entry: unknown, files: string | undefined, workspace: string): string | undefined {
  if (typeof entry !== 'string' || !entry) return 'not a path';
  const places = placesOf(entry, files, workspace);
  if (typeof places === 'string') return places;
  const found = places.map(fileAt);
  if (found.includes('picture')) return undefined;
  return found.includes('empty') ? 'empty, 0 bytes' : 'not there';
}

/** Why the named `entry` is no picture, or undefined when it is one. */
function notAPicture(entry: unknown, files: string | undefined, workspace: string): string | undefined {
  if (typeof entry !== 'string' || !entry) return 'not a path';
  if (!IMAGES.includes(path.extname(entry).toLowerCase())) return `not an image: a picture ends ${IMAGES.join(', ')}`;
  return notThere(entry, files, workspace);
}

/** The refusal of a change that touched `pages` and named no picture among `artifacts`, each entry said with why. */
function noPicture(pages: readonly string[], refused: readonly (readonly [string, string])[], files: string | undefined): Refusal {
  return new Refusal(
    [
      `the work touches the board's pages (${shownOf(pages)}), and the closeout's \`artifacts\` names no picture of them.`,
      'Picture the pages and the states the change touches, in light and dark:',
      `  WF_ARTIFACTS=${files ?? '<your files directory>'} npm run e2e -- --photos --pages <name,…>`,
      'and name each picture in `artifacts` by its absolute path. A change only under apps/web/test asks for none.',
      ...(refused.length ? ['Named, and not counted:', ...refused.map(([entry, why]) => `  ${entry}: ${why}`)] : []),
    ].join('\n'),
  );
}

/** The first `SHOWN` of `paths`, then how many more. */
const shownOf = (paths: readonly string[]): string =>
  paths.slice(0, SHOWN).join(', ') + (paths.length > SHOWN ? `, and ${paths.length - SHOWN} more` : '');

/**
 * What a change that touched `paths` owes of the dashboards: `named`, each dashboard whose file it changed and still has, and `any`,
 * whether it touched anything else a dashboard reads, a dashboard it removed among it, so that one pair at least is owed.
 */
function dashboardsOwed(paths: readonly string[], workspace: string): { read: string[]; named: string[]; any: boolean } {
  const read = paths.filter((p) => p.startsWith(OBSERVE) && !UNREAD.some((unread) => p === unread || p.startsWith(unread)));
  const isBoard = (p: string): boolean => p.startsWith(DASHBOARDS) && p.endsWith('.json') && fs.existsSync(path.join(workspace, p));
  const named = read.filter(isBoard).map((p) => path.basename(p, '.json'));
  return { read, named, any: read.some((p) => !isBoard(p)) };
}

/**
 * The dashboards among `artifacts` whose picture and text are both named and there, by name. Refuses when one of `owed.named` is not
 * among them, or when one at least is owed and none is, naming the dashboards, the command and each entry that did not count.
 */
function dashboardsNamed(owed: ReturnType<typeof dashboardsOwed>, artifacts: readonly unknown[], files: string | undefined): string[] {
  const workspace = process.cwd();
  const whys = artifacts.map((entry) => [String(entry), notThere(entry, files, workspace)] as const);
  const there = new Set(whys.filter(([, why]) => why === undefined).map(([entry]) => path.basename(entry)));
  const whole = (name: string): boolean => pairOf(name).every((file) => there.has(file));
  const rendered = [...there].flatMap((file) => /^dashboard-(.+)\.png$/.exec(file)?.[1] ?? []).filter(whole);
  const missing = owed.named.filter((name) => !whole(name));
  if (!missing.length && (rendered.length || !owed.any)) return rendered;
  const lacking = missing.length ? missing.map((name) => `${name} (${pairOf(name).join(', ')})`).join('; ') : 'any dashboard';
  const asked = missing.length ? ` --dashboards ${missing.join(',')}` : '';
  const refused = whys.filter(([, why]) => why !== undefined);
  throw new Refusal(
    [
      `the work touches what the dashboards read (${shownOf(owed.read)}), and the closeout's \`artifacts\` names no picture and text of: ${lacking}.`,
      'See them rendered, on a throwaway stack with fake data:',
      `  node tools/observe/render/render.ts --out ${files ?? '<your files directory>'}${asked}`,
      'and name each `dashboard-<name>.png` and `dashboard-<name>.txt` it writes in `artifacts` by its absolute path.',
      `A change only to ${UNREAD.join(' or under ')} asks for none.`,
      ...(refused.length ? ['Named, and not there:', ...refused.map(([entry, why]) => `  ${entry}: ${why}`)] : []),
    ].join('\n'),
  );
}

/** Why the named `entry` is no picture of a page, or undefined when it is one: a picture that is not a render's of a dashboard. */
function notOfAPage(entry: unknown, files: string | undefined, workspace: string): string | undefined {
  const why = notAPicture(entry, files, workspace);
  if (why !== undefined || !OF_A_DASHBOARD.test(path.basename(String(entry)))) return why;
  return 'a picture of a dashboard, not of a page';
}

/** The pictures of a page among `artifacts`; refuses when the work touched `pages` and none is one. */
function picturesNamed(pages: readonly string[], artifacts: readonly unknown[], files: string | undefined): string[] {
  const named = artifacts.map((entry) => [entry, notOfAPage(entry, files, process.cwd())] as const);
  const counted = named.filter(([, why]) => why === undefined).map(([entry]) => String(entry));
  if (!counted.length) throw noPicture(pages, named.map(([entry, why]) => [String(entry), String(why)] as const), files);
  return counted;
}

/** The whole run: exit 0 when nothing that owes a picture was touched or what is owed is named, 1 with the refusal on stderr otherwise. */
function main(): number {
  const say = (line: string): void => void process.stdout.write(`wf pictures: ${line}\n`);
  try {
    const base = process.env.WF_BASE_REF;
    if (!base) throw new Refusal("WF_BASE_REF is not set: pictures are asked in a run's check, where it names the base the work began on");
    const touched = touchedSince(base);
    const pages = touched.filter((p) => p.startsWith(PAGES));
    const owed = dashboardsOwed(touched, process.cwd());
    if (!pages.length) say(`nothing under ${PAGES.slice(0, -1)} was touched: no picture asked`);
    if (!owed.read.length) say(`nothing a dashboard reads under ${OBSERVE.slice(0, -1)} was touched: no dashboard asked`);
    if (!pages.length && !owed.read.length) return 0;
    const files = process.env.WF_ARTIFACTS || undefined;
    const artifacts = artifactsOf(process.argv[2]);
    if (pages.length) {
      const counted = picturesNamed(pages, artifacts, files);
      say(`${counted.length} picture${counted.length === 1 ? '' : 's'} named: ${counted.join(', ')}`);
    }
    if (owed.read.length) say(`dashboards named, each with its picture and its text: ${dashboardsNamed(owed, artifacts, files).join(', ')}`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`wf pictures: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
