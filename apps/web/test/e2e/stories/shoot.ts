/**
 * Pictures the board's stories a change touches: `node test/e2e/stories/shoot.ts --base <ref> --out <dir> [--changed <path>…] [--list]`,
 * from `apps/web`.
 *
 * The change's paths are the work's own since the merge base of HEAD and `--base`, as the factory's picture check reads them: its commits
 * along the first parent, and of a merge only its resolution, so a path a merged branch changed is not the work's; `--changed` names
 * them instead, each from the workspace root. A story is touched when a file its imports reach, through every import of the board's own
 * (`src` and `.storybook`), is one of them, or a file every story is drawn in: Storybook's preview, the board's files it imports and
 * the stylesheets those `@import` under `src` and `theme` (`storiesTouched`, `touched.ts`); a changed part that owes a story and
 * that no story reaches is bare, and refused, exit 1, naming each and the story file to write beside it; a part the change deleted
 * owes none.
 *
 * With `--list` it prints `{ "stories": [<id>…], "bare": [<path>…] }` and launches no browser: each id is Storybook's own
 * (`toId(title, storyNameFromExport(export))`), read off the story file's title and named exports by the TypeScript compiler. Without
 * it, it builds Storybook static into a scratch folder, serves it on loopback, and pictures each touched story's `iframe.html` in
 * light, then dark (`story-<id>-<theme>.png`); then the same of the merge base, a `git archive` of its `apps/web` extracted into a
 * scratch folder over this checkout's `node_modules`, so both sides are drawn on one machine; and for each story whose pixels differ
 * writes `before-`, `after-` and `diff-<id>-<theme>.png`. Last, `stories.json`: `{ head, base, touched, changed, fresh, baseRendered,
 * baseWhy, matched, matches }` — `fresh` the touched stories the base has none of, `baseRendered` false where the base would not build,
 * with why. No picture goes into git: `--out` is the step's files or a scratch folder.
 *
 * With `--targets <dir>`, each `target-<id>[-light|-dark].png` there (`targets.ts`) is set beside its story's picture at the head, in
 * the theme it names or both, as `match-<id>-<theme>.png`; a target's story the change does not touch is pictured at the head too, and
 * a target naming no story's id is refused, exit 1, naming the file and the nearest ids. `stories.json`'s `matched` lists the stories
 * matched, and `matches` each match's files; `--list` prints the matches too, and composes nothing.
 *
 * Before it builds anything, it clears from `--out` what an earlier pass of it wrote there (`clearEarlier`): each `before-`, `after-`,
 * `diff-`, `story-` and `match-*.png` and `stories.json`, no other file and no folder, so a step shooting again never removes them by
 * hand and no picture of a story this pass no longer reaches is left beside the new ones. `--list` writes nothing, and clears nothing.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser } from 'playwright';
import { storyNameFromExport, toId } from 'storybook/internal/csf';
import { importsIn } from 'test-kit/imports';
import type { StoryReach } from '../../../contracts/touched-stories.contract.ts';
import { storyModuleOf } from '../../stories.ts';
import { buildStorybook, builtIds, serveBuilt } from './built.ts';
import { composeMatch, matchesOf, targetsOf, THEMES, type Match } from './targets.ts';
import { owesAStory, storiesTouched } from './touched.ts';

/** The board's folder, from the workspace root. */
const BOARD = 'apps/web';

/** What the board's own imports reach: its source, its Storybook's files and its theme. */
const OWN = /^apps\/web\/(src|\.storybook|theme)\//;

/** What Storybook draws every story in, from the workspace root. */
const PREVIEW = `${BOARD}/.storybook/preview.tsx`;

/** Each local stylesheet a stylesheet's text `@import`s, outside its comments, by its specifier. */
const cssImportsIn = (text: string): string[] =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g)].flatMap((m) =>
    m[1]?.startsWith('.') ? [m[1]] : [],
  );

/** The modules `file`'s text names: a stylesheet's `@import`s, a module's imports. */
const specsOf = (file: string, text: string): string[] =>
  file.endsWith('.css') ? cssImportsIn(text) : importsIn(text).map(({ spec }) => spec);

/** A story file of the board, from the workspace root: anywhere under `src/components` but the vendored folders. */
const isStoryFile = (file: string): boolean =>
  /^apps\/web\/src\/components\/.+\.stories\.tsx$/.test(file) && !/^apps\/web\/src\/components\/(ui|ai-elements)\//.test(file);

/** The workspace root of the git repository `cwd` is in. */
const rootOf = (cwd: string): string =>
  execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Runs git in `root`, its output as text; throws naming the command where it fails. */
const git = (root: string, args: readonly string[]): string => {
  const ran = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 });
  if (ran.status !== 0) throw new Refusal(`git ${args.join(' ')} failed (${(ran.stderr ?? '').trim() || ran.error?.message})`);
  return ran.stdout;
};

/** A refusal this tool ends on, exit 1, with what to do next. */
class Refusal extends Error {}

/**
 * The paths the work's own commits touched since `base`, once each: its commits along the first parent, and of a merge only what
 * differs from every parent (`--cc`), as the factory's picture check reads them.
 * @param root The workspace root.
 * @param base Where the work began: the merge base of HEAD and the base branch.
 */
export const changedSince = (root: string, base: string): string[] => [
  ...new Set(
    git(root, ['log', '--first-parent', '--cc', '--no-renames', '--format=', '--name-only', `${base}..HEAD`, '--'])
      .split('\n')
      .filter(Boolean),
  ),
];

/** The file `spec`, imported by `from`, resolves to among the workspace's files, from its root; none for a package or a file not there. */
const resolved = (root: string, from: string, spec: string): string | undefined => {
  const named = spec.startsWith('@/')
    ? path.posix.join(BOARD, 'src', spec.slice(2))
    : spec.startsWith('.')
      ? path.posix.join(path.posix.dirname(from), spec)
      : undefined;
  if (named === undefined) return undefined;
  for (const tail of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const file = named + tail;
    if (fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) return file;
  }
  return undefined;
};

/** Each file of the board's own `file`'s text names, by its path from the workspace root. */
const ownOf = (root: string, file: string): string[] =>
  specsOf(file, fs.readFileSync(path.join(root, file), 'utf8')).flatMap((spec) => {
    const next = resolved(root, file, spec);
    return next !== undefined && OWN.test(next) ? [next] : [];
  });

/**
 * What every story is drawn in: Storybook's preview, each file of the board's own it imports, and the stylesheets those `@import`,
 * followed; none where the board has no preview. A module the preview imports is not followed, so a part behind a door it imports
 * reaches only the stories that import it.
 * @param root The workspace root.
 */
const drawnIn = (root: string): string[] => {
  if (!fs.existsSync(path.join(root, PREVIEW))) return [];
  const drawn = [PREVIEW, ...ownOf(root, PREVIEW)];
  for (let at = 1; at < drawn.length; at++) {
    const file = drawn[at] ?? PREVIEW;
    if (file.endsWith('.css')) for (const next of ownOf(root, file)) if (!drawn.includes(next)) drawn.push(next);
  }
  return [...new Set(drawn)];
};

/**
 * What `story` reaches: itself, every file of the board's own its imports reach, followed through each such file's imports, and
 * `drawn`, what every story is drawn in.
 * @param root The workspace root.
 * @param story The story file, from the workspace root.
 * @param drawn What every story is drawn in (`drawnIn`).
 */
export const reachOf = (root: string, story: string, drawn: readonly string[]): StoryReach => {
  const reaches = [story];
  for (let at = 0; at < reaches.length; at++) {
    for (const next of ownOf(root, reaches[at] ?? story)) if (!reaches.includes(next)) reaches.push(next);
  }
  return { story, reaches: [...reaches, ...drawn.filter((file) => !reaches.includes(file))] };
};

/**
 * Storybook's id of each story of `source`, the story file's text: `toId(title, storyNameFromExport(name))` of each named export.
 * @param source The story file's text.
 */
export const idsOf = (source: string): string[] => {
  const module = storyModuleOf(source);
  const title = module.title;
  return title === null ? [] : module.stories.map((story) => toId(title, storyNameFromExport(story.name)));
};

/** Every story id of the workspace at `root`, read off its story files. */
const knownIds = (root: string): string[] => storyFiles(root).flatMap((file) => idsOf(fs.readFileSync(path.join(root, file), 'utf8')));

/**
 * The matches the targets in `dir` ask for; refuses where `dir` is no folder, or a target names no story of the workspace at `root`.
 * @param root The workspace root.
 * @param dir The targets' folder.
 */
const matchesIn = (root: string, dir: string): Match[] => {
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())
    throw new Refusal(`--targets ${dir} is no folder: name the folder the targets are in`);
  const { matches, unknown } = matchesOf(targetsOf(fs.readdirSync(dir)), knownIds(root));
  if (unknown.length > 0)
    throw new Refusal(
      `${unknown.length} target${unknown.length === 1 ? '' : 's'} name no story: ` +
        unknown.map((target) => `${target.file} (the nearest ids: ${target.nearest.join(', ')})`).join('; ') +
        '; rename each target-<story id>[-light|-dark].png after a story the board holds',
    );
  return matches;
};

/** The story files of the workspace at `root`, in path order. */
const storyFiles = (root: string): string[] =>
  git(root, ['ls-files', '--cached', '--others', '--exclude-standard', '--', BOARD])
    .split('\n')
    .filter((file) => isStoryFile(file) && fs.existsSync(path.join(root, file)))
    .sort();

/**
 * What `changed` touches of the stories of the workspace at `root`: the ids of each touched story file, in path order, and the bare
 * parts.
 * @param root The workspace root.
 * @param changed The paths the change touched, from the workspace root.
 */
export const touchedOf = (root: string, changed: readonly string[]): { stories: string[]; bare: string[] } => {
  const drawn = drawnIn(root);
  const reach = storyFiles(root).map((story) => reachOf(root, story, drawn));
  const owing = [...new Set(changed.filter((file) => owesAStory(file) && fs.existsSync(path.join(root, file))))];
  const touched = storiesTouched(changed, reach, owing);
  return { stories: touched.stories.flatMap((file) => idsOf(fs.readFileSync(path.join(root, file), 'utf8'))), bare: [...touched.bare] };
};

/** Serves the built Storybook at `dir` on loopback while `use` runs, handing it the address: MSW's worker needs a secure origin. */
async function served<T>(dir: string, use: (at: string) => Promise<T>): Promise<T> {
  const server = await serveBuilt(dir);
  try {
    return await use(server.at);
  } finally {
    server.close();
  }
}

/**
 * Pictures each of `ids` the Storybook at `dir` holds, in each theme, into `out` as `<prefix><id>-<theme>.png`, by the e2e's
 * `photograph`, which stills every animation for the shot; the ids pictured.
 */
async function shootAll(browser: Browser, dir: string, ids: readonly string[], out: string, prefix: string): Promise<string[]> {
  const { photograph } = await import('../board.ts');
  const held = new Set(builtIds(dir));
  const shot = ids.filter((id) => held.has(id));
  await served(dir, async (at) => {
    for (const theme of THEMES) {
      const context = await browser.newContext({ colorScheme: theme, viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      for (const id of shot) {
        await page.goto(`${at}/iframe.html?id=${encodeURIComponent(id)}&viewMode=story`);
        await page.locator('[data-story-ground], [data-broken]').first().waitFor();
        await page.waitForLoadState('networkidle');
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        await photograph(page, path.join(out, `${prefix}${id}-${theme}.png`), { fullPage: true, always: true });
      }
      await context.close();
    }
  });
  return shot;
}

/** Whether the pictures `before` and `after` differ by a pixel, and where they do, a picture of it: each differing pixel red. */
async function differ(browser: Browser, before: string, after: string): Promise<{ differs: boolean; png: Buffer }> {
  const page = await browser.newPage();
  try {
    const [a, b] = [before, after].map((file) => `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`);
    const found = await page.evaluate(
      async ([one, two]) => {
        const load = (src: string) =>
          new Promise<HTMLImageElement>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve(image);
            image.onerror = reject;
            image.src = src;
          });
        const [x, y] = await Promise.all([load(one ?? ''), load(two ?? '')]);
        const width = Math.max(x.width, y.width);
        const height = Math.max(x.height, y.height);
        const read = (image: HTMLImageElement) => {
          const canvas = new OffscreenCanvas(width, height);
          const drawn = canvas.getContext('2d');
          if (!drawn) throw new Error('no 2d context');
          drawn.drawImage(image, 0, 0);
          return drawn.getImageData(0, 0, width, height).data;
        };
        const [p, q] = [read(x), read(y)];
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const drawn = canvas.getContext('2d');
        if (!drawn) throw new Error('no 2d context');
        const out = drawn.createImageData(width, height);
        let differs = false;
        for (let i = 0; i < p.length; i += 4) {
          const same = p[i] === q[i] && p[i + 1] === q[i + 1] && p[i + 2] === q[i + 2] && p[i + 3] === q[i + 3];
          if (!same) differs = true;
          const grey = Math.round(((q[i] ?? 0) + (q[i + 1] ?? 0) + (q[i + 2] ?? 0)) / 3);
          out.data.set(same ? [grey, grey, grey, 60] : [255, 0, 0, 255], i);
        }
        drawn.putImageData(out, 0, 0);
        return { differs, url: canvas.toDataURL('image/png') };
      },
      [a, b],
    );
    return { differs: found.differs, png: Buffer.from(found.url.slice(found.url.indexOf(',') + 1), 'base64') };
  } finally {
    await page.close();
  }
}

/** A scratch folder of the kit's (`test-kit/scratch`), taken only when pictures are, so `--list` loads none of node:test's hooks. */
const scratch = async (prefix: string): Promise<string> => (await import('test-kit/scratch')).scratch(prefix);

/** Extracts the board at `commit` into a scratch folder over the checkout's `node_modules`; the board's folder there. */
async function boardAt(root: string, commit: string): Promise<string> {
  const dir = await scratch('nemia-stories-base-');
  const archive = spawnSync('git', ['archive', '--format=tar', commit, BOARD], { cwd: root, maxBuffer: 1 << 30 });
  if (archive.status !== 0) throw new Refusal(`git archive ${commit} ${BOARD} failed: ${archive.stderr.toString().trim()}`);
  const untar = spawnSync('tar', ['-x', '-C', dir], { input: archive.stdout });
  if (untar.status !== 0) throw new Refusal(`tar could not extract the base's board: ${untar.stderr.toString().trim()}`);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(dir, 'node_modules'));
  if (fs.existsSync(path.join(root, BOARD, 'node_modules')))
    fs.symlinkSync(path.join(root, BOARD, 'node_modules'), path.join(dir, BOARD, 'node_modules'));
  return path.join(dir, BOARD);
}

/** A file a pass of this tool writes into `--out`: a picture of a story, of the base, of a difference or of a match, and the report. */
const EARLIER = /^(?:(?:before|after|diff|story|match)-.+\.png|stories\.json)$/;

/**
 * Removes from `out` each file an earlier pass wrote there (`EARLIER`), and no other file, no folder and nothing below it; a folder
 * not there yet holds none. How many it removed.
 * @param out The pictures' folder, `--out`.
 */
export const clearEarlier = (out: string): number => {
  if (!fs.statSync(out, { throwIfNoEntry: false })?.isDirectory()) return 0;
  const entries = fs.readdirSync(out, { withFileTypes: true });
  const earlier = entries.filter((entry) => entry.isFile() && EARLIER.test(entry.name));
  for (const entry of earlier) fs.rmSync(path.join(out, entry.name));
  return earlier.length;
};

/** The words of `--help`, and of a refusal of the arguments. */
const USAGE =
  'usage, from apps/web: node test/e2e/stories/shoot.ts --base <ref> --out <dir> [--targets <dir>] [--changed <path>…] [--list]; ' +
  '--list prints the touched story ids, bare parts and matches as JSON and pictures nothing; without it, the pictures and ' +
  'stories.json an earlier pass wrote in --out are removed first, so no step removes them by hand';

/** The arguments `argv` gives: the flags, and the paths after `--changed`, which takes every path after it; refuses an unknown flag. */
function argsOf(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      options: {
        base: { type: 'string' },
        out: { type: 'string' },
        targets: { type: 'string' },
        changed: { type: 'string', multiple: true },
        list: { type: 'boolean', default: false },
      },
      allowPositionals: true,
    });
  } catch (err) {
    throw new Refusal(`${(err as Error).message}: ${USAGE}`);
  }
}

async function main(): Promise<number> {
  const { values, positionals } = argsOf(process.argv.slice(2));
  const root = rootOf(process.cwd());
  if (positionals.length > 0 && values.changed === undefined) throw new Refusal(`a path is named after --changed: ${USAGE}`);
  if (values.base === undefined && values.changed === undefined) throw new Refusal(`name --base, or the paths with --changed: ${USAGE}`);
  const mergeBase = values.base === undefined ? undefined : git(root, ['merge-base', 'HEAD', values.base]).trim();
  const named = values.changed === undefined ? undefined : [...values.changed, ...positionals];
  const changed = named ?? changedSince(root, mergeBase ?? 'HEAD');
  const { stories, bare } = touchedOf(root, changed);
  const targetsDir = values.targets === undefined ? undefined : path.resolve(values.targets);
  const matches = targetsDir === undefined ? [] : matchesIn(root, targetsDir);
  const matched = [...new Set(matches.map((match) => match.id))];
  if (values.list) process.stdout.write(`${JSON.stringify(targetsDir === undefined ? { stories, bare } : { stories, bare, matches })}\n`);
  if (bare.length > 0)
    throw new Refusal(
      `${bare.length} changed part${bare.length === 1 ? '' : 's'} no story reaches: ` +
        bare.map((file) => `${file} (write ${file.replace(/\.tsx$/, '.stories.tsx')}, a story a state)`).join(', '),
    );
  if (values.list) return 0;
  if (values.out === undefined) throw new Refusal(`name --out, the folder the pictures go to: ${USAGE}`);
  const out = path.resolve(values.out);
  const cleared = clearEarlier(out);
  console.log(`stories: ${cleared} file${cleared === 1 ? '' : 's'} an earlier pass wrote removed from ${out}`);
  fs.mkdirSync(out, { recursive: true });
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  const report = {
    head,
    base: mergeBase ?? null,
    touched: stories,
    changed: [] as string[],
    fresh: [] as string[],
    baseRendered: false,
    baseWhy: null as string | null,
    matched,
    matches,
  };
  const pictured = [...stories, ...matched.filter((id) => !stories.includes(id))];
  if (pictured.length > 0) {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    try {
      const headBuilt = path.join(await scratch('nemia-stories-head-'), 'static');
      const why = await buildStorybook(root, path.join(root, BOARD), headBuilt);
      if (why !== undefined) throw new Refusal(why);
      const held = new Set(builtIds(headBuilt));
      const unbuilt = pictured.filter((id) => !held.has(id));
      if (unbuilt.length > 0)
        throw new Refusal(
          `Storybook built no story of the ids read off the story files, ${unbuilt.join(', ')}: idsOf has drifted from Storybook's ` +
            "id rule; compare it with the build's index.json",
        );
      const pictures = await shootAll(browser, headBuilt, pictured, out, 'story-');
      const shot = pictures.filter((id) => stories.includes(id));
      console.log(`stories: ${shot.length} touched stor${shot.length === 1 ? 'y' : 'ies'} pictured, light and dark, in ${out}`);
      if (targetsDir !== undefined && matches.length > 0) {
        const short = git(root, ['rev-parse', '--short', 'HEAD']).trim();
        const css = fs.readFileSync(path.join(root, BOARD, 'theme', 'theme.css'), 'utf8');
        for (const match of matches) {
          await composeMatch(browser, {
            target: path.join(targetsDir, match.target),
            story: path.join(out, match.story),
            theme: match.theme,
            head: short,
            css,
            out: path.join(out, match.match),
          });
        }
        console.log(
          `stories: ${matches.length} match${matches.length === 1 ? '' : 'es'} of a target and its story written, match-<id>-<theme>.png, in ${out}`,
        );
      }
      if (shot.length === 0) report.baseWhy = 'the change touches no story, so the base was not drawn';
      else if (mergeBase === undefined) report.baseWhy = 'no --base was named, so the base was not drawn';
      else {
        const baseBuilt = path.join(await scratch('nemia-stories-built-base-'), 'static');
        const baseWhy = await buildStorybook(root, await boardAt(root, mergeBase), baseBuilt);
        if (baseWhy !== undefined) report.baseWhy = baseWhy;
        else {
          report.baseRendered = true;
          const beforeDir = await scratch('nemia-stories-before-');
          const before = await shootAll(browser, baseBuilt, shot, beforeDir, 'before-');
          report.fresh = shot.filter((id) => !before.includes(id));
          for (const id of before) {
            let differs = false;
            for (const theme of THEMES) {
              const was = path.join(beforeDir, `before-${id}-${theme}.png`);
              const now = path.join(out, `story-${id}-${theme}.png`);
              const diff = await differ(browser, was, now);
              if (!diff.differs) continue;
              differs = true;
              fs.copyFileSync(was, path.join(out, `before-${id}-${theme}.png`));
              fs.copyFileSync(now, path.join(out, `after-${id}-${theme}.png`));
              fs.writeFileSync(path.join(out, `diff-${id}-${theme}.png`), diff.png);
            }
            if (differs) report.changed.push(id);
          }
        }
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(path.join(out, 'stories.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `stories: ${report.changed.length} changed against the base, ${report.fresh.length} new; ` +
      `${report.baseRendered ? 'the base drawn' : `the base not drawn: ${report.baseWhy}`}; ${path.join(out, 'stories.json')}`,
  );
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`stories: ${err.message}\n`);
    process.exitCode = 1;
  }
}
