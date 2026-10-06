/**
 * What a git run's branches changed, as its place's `report` says it on each read (`changesOf`), and what is at a path on a branch
 * (`presentOn`). Nothing is kept between reads: a decision reads the place live, and an answer the place refuses or never gives is said
 * as not known (`notKnown`), never as a branch that changed nothing.
 *
 * Beneath the controllers, beside `branches.store.ts`: it runs the place (`runPlaceVerb`) and reads nothing else, and `runner.ts`
 * re-exports `changesOf`.
 */
import type { Changes, ChangedFile, PlaceRequests } from '../place/place.ts';
import { placeDirOf, runPlaceVerb } from '../place/place.store.ts';
import type { GitRun } from '../record/record.ts';
import { CHECK_AFFECTING, notKnown, radius, sensitivePaths, workspacesIn, type Radius } from './branches.ts';

/** A top-level markdown file a branch added, and its text. */
export type Note = { readonly file: string; readonly text: string };

/**
 * What one branch changed against the run's base: what it touched (`radius`), the whole diff of its files a glob names, and the
 * top-level markdown files it added — each the sentence saying it is not known where the place did not say.
 */
export type BranchChanges = {
  readonly branch: string;
  readonly radius: Radius | { readonly error: string };
  readonly inFull: string | { readonly error: string };
  readonly notes: readonly Note[] | { readonly error: string };
};

/** What the place's `report` answers for `run`, or what it said instead: its refusal, or why it was not heard. */
function reportOf(
  run: GitRun,
  ask: Partial<PlaceRequests['report']> & Pick<PlaceRequests['report'], 'branches'>,
  skillDir: string,
): Changes | { readonly unknown: string } {
  const request = { repo: run.repo, baseRef: run.baseRef, onto: run.branch, diffOf: [], present: [], atBase: [], ...ask };
  const outcome = runPlaceVerb(skillDir, 'report', request);
  if ('answer' in outcome) return outcome.answer;
  return { unknown: 'refused' in outcome ? outcome.refused : `the place's report was not heard: ${outcome.unread.said}` };
}

/** The top-level markdown files of `files` a branch added. */
const notesIn = (files: readonly ChangedFile[]): string[] =>
  files.filter((f) => f.status === 'A' && f.path.endsWith('.md') && !f.path.includes('/')).map((f) => f.path);

/** The text of a file a diff adds whole: its added lines, after the hunk's head. */
const addedText = (diff: string): string =>
  diff
    .split('\n')
    .slice(diff.split('\n').findIndex((l) => l.startsWith('@@')) + 1)
    .filter((l) => l.startsWith('+'))
    .map((l) => l.slice(1))
    .join('\n');

/**
 * What each of `branches` changed against the run's base, read from the place in `skillDir`, the run's own by default (`placeDirOf`):
 * once for the files each changed and the base's `package.json`, whose `workspaces` group them (`workspacesIn`), then once for the diffs
 * of the files `globs` names — the check-affecting ones by default — and of the notes each added. A branch the place has not is not known,
 * and so is everything of a read the place refused or never answered, in the place's words.
 */
export function changesOf(
  run: GitRun,
  branches: readonly string[],
  globs: readonly string[] = CHECK_AFFECTING,
  skillDir: string = placeDirOf(run),
): BranchChanges[] {
  const asked = [...new Set(branches)];
  if (!asked.length) return [];
  const first = reportOf(run, { branches: asked, atBase: ['package.json'] }, skillDir);
  const workspaces = 'unknown' in first ? [] : workspacesIn(first.atBase['package.json']);
  const read = asked.map((branch) => {
    const files = 'unknown' in first ? undefined : first.files[branch];
    const said = 'unknown' in first ? first.unknown : `the place has no branch ${branch} in ${run.repo}`;
    return { branch, files, radius: files ? radius(files, workspaces) : { error: notKnown(said) } };
  });
  const wanted = (files: readonly ChangedFile[]) => [...sensitivePaths(files, globs), ...notesIn(files)];
  const diffOf = [...new Set(read.flatMap(({ files }) => (files ? wanted(files) : [])))];
  const readable = read.filter(({ files }) => files).map(({ branch }) => branch);
  const second = diffOf.length ? reportOf(run, { branches: readable, diffOf }, skillDir) : undefined;
  return read.map(({ branch, files, radius: r }) => {
    if (!files) return { branch, radius: r, inFull: r as { error: string }, notes: r as { error: string } };
    const diffOfPath = (p: string): string | { error: string } => {
      if (!second) return { error: notKnown(`the place was asked no diff of ${p} on ${branch}`) };
      if ('unknown' in second) return { error: notKnown(second.unknown) };
      return second.diffs[branch]?.[p] ?? { error: notKnown(`the place gave no diff of ${p} on ${branch}`) };
    };
    const inFull = joined(sensitivePaths(files, globs).map(diffOfPath));
    return { branch, radius: r, inFull: inFull ?? '', notes: notesFrom(notesIn(files), diffOfPath) };
  });
}

/** The diffs, end to end, or the first that is not known; undefined for none. */
function joined(diffs: readonly (string | { error: string })[]): string | { error: string } | undefined {
  if (!diffs.length) return undefined;
  const texts = diffs.filter((d) => typeof d === 'string');
  return diffs.find((d) => typeof d !== 'string') ?? texts.join('');
}

/** Each note's text out of its diff, or the first that is not known. */
function notesFrom(files: readonly string[], diffOf: (p: string) => string | { error: string }): Note[] | { error: string } {
  const notes: Note[] = [];
  for (const file of files) {
    const diff = diffOf(file);
    if (typeof diff !== 'string') return diff;
    notes.push({ file, text: addedText(diff) });
  }
  return notes;
}

/**
 * What is at each of `paths` at the tip of `branch` of `run`, as its place answers: a file, a directory, or absent — absent for every
 * path of a branch the place has not, whose files are on no branch — or what the place said instead of answering.
 */
export function presentOn(
  run: GitRun,
  branch: string,
  paths: readonly string[],
  skillDir: string = placeDirOf(run),
): Readonly<Record<string, 'file' | 'directory' | 'absent'>> | { readonly unknown: string } {
  const read = reportOf(run, { branches: [branch], present: paths }, skillDir);
  return 'unknown' in read ? read : (read.present[branch] ?? {});
}
