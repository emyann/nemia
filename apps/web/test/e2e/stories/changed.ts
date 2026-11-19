/**
 * What a change hands of the board's look: the approved pictures its own commits added, changed or removed, and a picture of each
 * difference. `node test/e2e/stories/changed.ts --base <ref> --out <dir> [--targets <dir>] [--changed <path>…] [--list]`, from
 * `apps/web`.
 *
 * Every story has an approved picture in the dark theme, and each light canary one in light (`.storybook/approved.ts`); the stories
 * project compares each run against them (`npm run stories`, in the pinned place, `pinned.ts`), and an intended change updates its
 * pictures in the same commit (`npm run stories -- --update`). So the pictures a change hands are the approved pictures it changed, read
 * from git: this draws nothing and builds no Storybook.
 *
 * The change's paths are the work's own since the merge base of HEAD and `--base`, as the factory's picture check reads them: its commits
 * along the first parent, and of a merge only its resolution, so a path a merged branch changed is not the work's; `--changed` names
 * them instead, each from the workspace root. A changed part that owes a story and that no story reaches is bare, and refused, exit 1,
 * naming each and the story file to write beside it (`storiesTouched`, `touched.ts`): a story is touched when a file its imports reach,
 * through every import of the board's own (`src` and `.storybook`), is one of them, or a file every story is drawn in.
 *
 * Of the changed paths, each approved picture is `added` (the base has none), `changed`, or `removed`, by its name: the story's id, and
 * `<id>-light` for a canary's light picture. With `--list` it prints `{ "stories", "bare", "added", "changed", "removed" }` as JSON, `stories` the ids of the stories the
 * change reaches, (and `matches`
 * with `--targets`) and writes nothing. Without it, it writes into `--out`, for each changed picture, `before-<name>.png` (the base's,
 * from git), `after-<name>.png` (the head's) and `diff-<name>.png` (each pixel that differs red, in Chromium), and last
 * `approved.json`: `{ head, base, stories, bare, added, changed, removed, matched, matches }`. With `--targets <dir>`, each
 * `target-<id>[-light|-dark].png` there (`targets.ts`) is set beside its story's approved picture at the head, as
 * `match-<id>-<theme>.png`; a target naming no story, or the light theme of a story that is no canary, is refused, exit 1.
 *
 * Before it writes, it clears from `--out` what an earlier pass of it wrote there (`clearEarlier`): each `before-`, `after-`, `diff-`
 * and `match-*.png` and `approved.json`, no other file and no folder, so a step running it again removes nothing by hand.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser } from 'playwright';
import { storyNameFromExport, toId } from 'storybook/internal/csf';
import { importsIn } from 'test-kit/imports';
import type { StoryReach } from '../../../contracts/touched-stories.contract.ts';
import { APPROVED, LIGHT, LIGHT_CANARIES } from '../../../.storybook/approved.ts';
import { storyModuleOf } from '../../stories.ts';
import { composeMatch, matchesOf, targetsOf, type Match } from './targets.ts';
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
const changedSince = (root: string, base: string): string[] => [
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
const reachOf = (root: string, story: string, drawn: readonly string[]): StoryReach => {
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

/**
 * Every story id of the workspace at `root`, read off its story files, in path order.
 * @param root The workspace root.
 */
export const knownIds = (root: string): string[] => storyFiles(root).flatMap((file) => idsOf(fs.readFileSync(path.join(root, file), 'utf8')));

/**
 * The matches the targets in `dir` ask for; refuses where `dir` is no folder, a target names no story of the workspace at `root`, or
 * names the light theme of a story that is no light canary.
 * @param root The workspace root.
 * @param dir The targets' folder.
 */
const matchesIn = (root: string, dir: string): Match[] => {
  if (!fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory())
    throw new Refusal(`--targets ${dir} is no folder: name the folder the targets are in`);
  const { matches, unknown, lightless } = matchesOf(targetsOf(fs.readdirSync(dir)), knownIds(root), LIGHT_CANARIES);
  if (unknown.length > 0)
    throw new Refusal(
      `${unknown.length} target${unknown.length === 1 ? '' : 's'} name no story: ` +
        unknown.map((target) => `${target.file} (the nearest ids: ${target.nearest.join(', ')})`).join('; ') +
        '; rename each target-<story id>[-light|-dark].png after a story the board holds',
    );
  if (lightless.length > 0)
    throw new Refusal(
      `${lightless.join(', ')} ${lightless.length === 1 ? 'names' : 'name'} the light theme of a story with no light picture, ` +
        `since only the light canaries have one (LIGHT_CANARIES, .storybook/approved.ts: ${LIGHT_CANARIES.join(', ')}): ` +
        'rename it target-<story id>-dark.png, or make the story a canary there and draw it with npm run stories -- --update',
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
const touchedOf = (root: string, changed: readonly string[]): { stories: string[]; bare: string[] } => {
  const drawn = drawnIn(root);
  const reach = storyFiles(root).map((story) => reachOf(root, story, drawn));
  const owing = [...new Set(changed.filter((file) => owesAStory(file) && fs.existsSync(path.join(root, file))))];
  const touched = storiesTouched(changed, reach, owing);
  return { stories: touched.stories.flatMap((file) => idsOf(fs.readFileSync(path.join(root, file), 'utf8'))), bare: [...touched.bare] };
};

/** The approved pictures' folder, from the workspace root. */
const PICTURES = `${BOARD}/${APPROVED}/`;

/**
 * The name an approved picture goes by, from its path from the workspace root: its story's id, `-light` after it for a canary's light
 * picture; none for a path that is no approved picture.
 * @param file A path from the workspace root.
 */
export const approvedName = (file: string): string | undefined => {
  if (!file.startsWith(PICTURES) || !file.endsWith('.png')) return undefined;
  const rest = file.slice(PICTURES.length, -'.png'.length);
  if (!rest.includes('/')) return rest;
  const [folder, id, ...deeper] = rest.split('/');
  return folder === LIGHT && id && deeper.length === 0 ? `${id}-light` : undefined;
};

/** Whether the tree at `commit` holds `file`. */
const heldAt = (root: string, commit: string, file: string): boolean =>
  spawnSync('git', ['cat-file', '-e', `${commit}:${file}`], { cwd: root, stdio: 'ignore' }).status === 0;

/**
 * The approved pictures among `changed`, each by its name and its path from the workspace root, sorted into those `base` has none of,
 * those the head has none of, and the rest.
 * @param root The workspace root.
 * @param changed The paths the change touched, from the workspace root.
 * @param base The commit the change is read against; none where the paths were named, and every picture there counts as changed.
 */
export const picturesOf = (
  root: string,
  changed: readonly string[],
  base: string | undefined,
): Record<'added' | 'changed' | 'removed', { name: string; file: string }[]> => {
  const sorted = { added: [], changed: [], removed: [] } as Record<'added' | 'changed' | 'removed', { name: string; file: string }[]>;
  for (const file of [...changed].sort()) {
    const name = approvedName(file);
    if (name === undefined) continue;
    const now = fs.existsSync(path.join(root, file));
    const was = base === undefined ? now : heldAt(root, base, file);
    if (!was && !now) continue;
    sorted[!was ? 'added' : !now ? 'removed' : 'changed'].push({ name, file });
  }
  return sorted;
};

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

/** A file a pass of this tool writes into `--out`: a picture of the base, of the head, of a difference or of a match, and the report. */
const EARLIER = /^(?:(?:before|after|diff|match)-.+\.png|approved\.json)$/;

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
  'usage, from apps/web: node test/e2e/stories/changed.ts --base <ref> --out <dir> [--targets <dir>] [--changed <path>…] [--list]; ' +
  '--list prints the stories reached, the bare parts and the approved pictures added, changed and removed as JSON and writes nothing; without it, what an ' +
  'earlier pass wrote in --out is removed first, so no step removes it by hand';

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
  const pictures = picturesOf(root, changed, named === undefined ? mergeBase : undefined);
  const listed = { stories, bare, ...Object.fromEntries(Object.entries(pictures).map(([kind, list]) => [kind, list.map((one) => one.name)])) };
  const targetsDir = values.targets === undefined ? undefined : path.resolve(values.targets);
  const matches = targetsDir === undefined ? [] : matchesIn(root, targetsDir);
  if (values.list) process.stdout.write(`${JSON.stringify(targetsDir === undefined ? listed : { ...listed, matches })}\n`);
  if (bare.length > 0)
    throw new Refusal(
      `${bare.length} changed part${bare.length === 1 ? '' : 's'} no story reaches: ` +
        bare.map((file) => `${file} (write ${file.replace(/\.tsx$/, '.stories.tsx')}, a story a state)`).join(', '),
    );
  if (values.list) return 0;
  if (values.out === undefined) throw new Refusal(`name --out, the folder the pictures go to: ${USAGE}`);
  const out = path.resolve(values.out);
  const cleared = clearEarlier(out);
  console.log(`approved: ${cleared} file${cleared === 1 ? '' : 's'} an earlier pass wrote removed from ${out}`);
  fs.mkdirSync(out, { recursive: true });
  const head = git(root, ['rev-parse', 'HEAD']).trim();
  let browser: Browser | undefined;
  const opened = async (): Promise<Browser> => (browser ??= await (await import('playwright')).chromium.launch());
  try {
    for (const { name, file } of pictures.changed) {
      const before = path.join(out, `before-${name}.png`);
      const after = path.join(out, `after-${name}.png`);
      fs.writeFileSync(before, execFileSync('git', ['show', `${mergeBase ?? 'HEAD'}:${file}`], { cwd: root, maxBuffer: 1 << 28 }));
      fs.copyFileSync(path.join(root, file), after);
      fs.writeFileSync(path.join(out, `diff-${name}.png`), (await differ(await opened(), before, after)).png);
    }
    if (targetsDir !== undefined && matches.length > 0) {
      const short = git(root, ['rev-parse', '--short', 'HEAD']).trim();
      const css = fs.readFileSync(path.join(root, BOARD, 'theme', 'theme.css'), 'utf8');
      for (const match of matches)
        await composeMatch(await opened(), {
          target: path.join(targetsDir, match.target),
          story: path.join(root, BOARD, match.story),
          theme: match.theme,
          head: short,
          css,
          out: path.join(out, match.match),
        });
    }
  } finally {
    await browser?.close();
  }
  const report = { head, base: mergeBase ?? null, ...listed, matched: [...new Set(matches.map((m) => m.id))], matches };
  fs.writeFileSync(path.join(out, 'approved.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(
    `approved: ${pictures.changed.length} changed, ${pictures.added.length} added, ${pictures.removed.length} removed, ` +
      `${matches.length} matched; ${path.join(out, 'approved.json')}`,
  );
  return 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`approved: ${err.message}\n`);
    process.exitCode = 1;
  }
}
