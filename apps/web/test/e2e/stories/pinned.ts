/**
 * Runs every story in the pinned place, compared against its approved picture: `npm run stories [-- [--update] [<file>…]]`, from
 * `apps/web`, which runs `node test/e2e/stories/pinned.ts`.
 *
 * The pinned place is where CI's `e2e-look` job and a step's server both draw: Ubuntu 24.04 on x64, Chromium the build the lockfile's
 * `playwright` installs (`npx playwright install chromium`), the board's faces from npm (`@fontsource`), and the stories project's own
 * window, zone, locale, clock and motion (`vitest.config.ts`, `.storybook/compare.ts`). There the stories project compares each story
 * against its approved picture (`STORIES_PINNED=1`, `.storybook/approved.ts`), and `--update` writes the pictures that differ, to commit
 * with the change. Anywhere else a picture would be the machine's and not the change's, so the stories run with no comparison, and this
 * says why first: CI compares them.
 *
 * Each `<file>` is a story file, from `apps/web`, to run alone. It exits as Vitest exits.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

/** The variable that turns the comparison on (`vitest.config.ts`). */
const PINNED = 'STORIES_PINNED';

/** The system the pictures are drawn on, as `/etc/os-release` names it. */
const SYSTEM = { id: 'ubuntu', version: '24.04' } as const;

/** The board's folder. */
const WEB = path.resolve(import.meta.dirname, '..', '..', '..');

/**
 * Why this machine is not the pinned place, or nothing where it is.
 * @param osRelease The text of `/etc/os-release`, or nothing where there is none.
 * @param platform The machine's platform and architecture, as Node names them.
 * @param browser Whether the lockfile's Chromium is installed.
 */
const unpinnedBecause = (osRelease: string | undefined, platform: { os: string; arch: string }, browser: boolean): string | undefined => {
  const field = (name: string) => new RegExp(`^${name}="?([^"\\n]*)"?$`, 'm').exec(osRelease ?? '')?.[1];
  if (platform.os !== 'linux' || platform.arch !== 'x64') return `this is ${platform.os} on ${platform.arch}, not Linux on x64`;
  if (field('ID') !== SYSTEM.id || field('VERSION_ID') !== SYSTEM.version)
    return `this is ${field('PRETTY_NAME') ?? 'a system with no /etc/os-release'}, not Ubuntu ${SYSTEM.version}`;
  if (!browser) return "the lockfile's Chromium is not installed: npx playwright install chromium, from apps/web";
  return undefined;
};

const argv = process.argv.slice(2);
const update = argv.includes('--update') || argv.includes('-u');
const files = argv.filter((arg) => arg !== '--update' && arg !== '-u');
const unknown = files.filter((arg) => arg.startsWith('-'));
if (unknown.length) {
  console.error(`npm run stories takes --update and story files, not ${unknown.join(' ')}: npm run stories -- --update <file>.stories.tsx`);
  process.exit(2);
}
const why = unpinnedBecause(
  fs.existsSync('/etc/os-release') ? fs.readFileSync('/etc/os-release', 'utf8') : undefined,
  { os: process.platform, arch: process.arch },
  fs.existsSync(chromium.executablePath()),
);
if (why) console.warn(`stories: compared against no approved picture, since ${why}; CI's e2e-look job compares them`);
else if (update)
  console.log('stories: in the pinned place, writing the approved pictures that differ (test/approved): commit them with the change');
const ran = spawnSync('npx', ['vitest', 'run', '--project=storybook', ...files, ...(update && !why ? ['--update'] : [])], {
  cwd: WEB,
  stdio: 'inherit',
  env: { ...process.env, [PINNED]: why ? '0' : '1' },
});
process.exit(ran.status ?? 1);
