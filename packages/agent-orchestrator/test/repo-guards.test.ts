/**
 * What guards the repository besides its tests: the owner is named on what a branch could edit to weaken its own check, and neither
 * package is publishable.
 *
 * Both are prose until someone else enforces them — `CODEOWNERS` until branch protection requires a code owner's review (the owner's
 * hand step), and `"private": true` until an `npm publish` is typed — and both are a line that a reorganisation deletes without
 * breaking anything that runs. So what they must say is held here, each by its own sentence naming the fix, as the workflow's own
 * agreement with the repository is held in `ci-workflow.test.ts`. The paths and the packages are written here, their one reader:
 * nothing about the Actions workflow or its parsing reads them, which is what `ci-workflow.ts` is for.
 *
 * `OWNED` holds each pattern exactly as `CODEOWNERS` must write it, the leading `/` included or absent, because the two are not the
 * same rule to GitHub: `/package.json` owns the root's manifest alone, while `package.json` reaches every workspace's — and CI's legs
 * run each workspace's own `test` script, so a package's manifest weakens the check as surely as the workflow does.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** Where the owner is named on what a branch could edit to weaken its own check. */
export const OWNERS = '.github/CODEOWNERS';

/** Who owns each of them: the person who reviews a change to the check itself. */
export const OWNER = '@emyann';

/**
 * What `OWNERS` must give that owner, each written as the file must write it. Three are anchored at the root; the manifest is not, so
 * that it reaches every workspace's own (the person's answer to how wide CODEOWNERS goes on `package.json`).
 */
export const OWNED = ['/.github/', '/.claude/settings.json', '/workflows/', 'package.json'];

/** The packages that are published from nowhere, so that an accidental `npm publish -w` is refused by npm itself. */
export const PRIVATE = ['packages/agent-orchestrator', 'packages/agent-runtime'];

/**
 * Each line of `CODEOWNERS` that owns something, as git reads them: a pattern and the owners after it, the comments left out. The
 * pattern is kept byte for byte — a leading `/` anchors it to the root and its absence does not, and a clause that stripped it could
 * not tell the two apart.
 */
const owned = (text: string): { pattern: string; owners: string[] }[] =>
  text
    .split('\n')
    .map((line) => line.replace(/#.*$/, '').trim())
    .filter(Boolean)
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      return { pattern, owners };
    });

/** A path of `OWNED` that no line owns, and one owned by somebody else: each a path a branch could then edit unreviewed. */
function ownerDrift(text: string, paths: readonly string[] = OWNED): string[] {
  const lines = owned(text);
  return paths.flatMap((path_) => {
    const line = lines.find((line) => line.pattern === path_);
    if (line === undefined) {
      const why = path_.startsWith('/')
        ? `, anchored with the leading \`/\` so it owns that path of the root and no other`
        : `, with no leading \`/\` so it reaches every workspace's own and not the root's alone`;
      return [
        `${OWNERS} owns no ${path_}: write the line \`${path_} ${OWNER}\`${why}, or a pull request that edits it weakens the check that reads it without the owner's review`,
      ];
    }
    return line.owners.includes(OWNER)
      ? []
      : [
          `${OWNERS} gives ${path_} to ${line.owners.join(' ') || 'nobody'}, not to ${OWNER}: write the line \`${path_} ${OWNER}\`, since the owner is who reviews a change to the check itself`,
        ];
  });
}

/** A package that npm would publish: `npm publish -w` is refused by npm itself only where the package says it is private. */
function privateDrift(root = ROOT, packages: readonly string[] = PRIVATE): string[] {
  return packages.flatMap((dir) => {
    const file = path.join(dir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')) as { private?: unknown };
    return pkg.private === true
      ? []
      : [
          `${file} does not say "private": true: nothing is published from this repository, so add the line, or an \`npm publish -w\` typed by hand puts this code on the registry`,
        ];
  });
}

test('the owner is named on what a branch could edit to weaken its own check, and neither package is publishable', () => {
  const text = fs.readFileSync(path.join(ROOT, OWNERS), 'utf8');
  assert.ok(owned(text).length >= OWNED.length, `${OWNERS} owns fewer paths than ${OWNED.length}, so the clause reads nothing`);
  assert.deepEqual(ownerDrift(text), []);
  assert.deepEqual(privateDrift(), []);
});

test('REFUSED: a path with no owner, a manifest line anchored to the root, a path owned by somebody else, and a package npm would publish', () => {
  const text = fs.readFileSync(path.join(ROOT, OWNERS), 'utf8');

  for (const path_ of OWNED) {
    const dropped = text
      .split('\n')
      .filter((line) => line.trim().split(/\s+/)[0] !== path_)
      .join('\n');
    const why = path_.startsWith('/')
      ? ', anchored with the leading `/` so it owns that path of the root and no other'
      : ", with no leading `/` so it reaches every workspace's own and not the root's alone";
    assert.deepEqual(
      ownerDrift(dropped),
      [
        `${OWNERS} owns no ${path_}: write the line \`${path_} ${OWNER}\`${why}, or a pull request that edits it weakens the check that reads it without the owner's review`,
      ],
      `${path_} dropped`,
    );
  }

  // The form the person rejected: it owns the root's manifest alone, and leaves every workspace's unowned. A clause that stripped the
  // leading `/` before comparing — as the first draft of this file did — reads it as the chosen line and passes it.
  const anchored = text.replace('\npackage.json @emyann', '\n/package.json @emyann');
  assert.notEqual(anchored, text, 'the shipped manifest line carries no leading slash today');
  assert.deepEqual(ownerDrift(anchored), [
    `${OWNERS} owns no package.json: write the line \`package.json ${OWNER}\`, with no leading \`/\` so it reaches every workspace's own and not the root's alone, or a pull request that edits it weakens the check that reads it without the owner's review`,
  ]);

  const handed = text.replaceAll(OWNER, '@a-contributor');
  assert.deepEqual(
    ownerDrift(handed),
    OWNED.map(
      (path_) =>
        `${OWNERS} gives ${path_} to @a-contributor, not to ${OWNER}: write the line \`${path_} ${OWNER}\`, since the owner is who reviews a change to the check itself`,
    ),
  );

  const unowned = text.replaceAll(` ${OWNER}`, '');
  assert.deepEqual(
    ownerDrift(unowned),
    OWNED.map(
      (path_) =>
        `${OWNERS} gives ${path_} to nobody, not to ${OWNER}: write the line \`${path_} ${OWNER}\`, since the owner is who reviews a change to the check itself`,
    ),
  );

  const before = scratch('repo-guards-');
  const dir = PRIVATE[0];
  fs.mkdirSync(path.join(before, dir), { recursive: true });
  fs.writeFileSync(path.join(before, dir, 'package.json'), JSON.stringify({ name: 'agent-orchestrator', version: '1.0.0' }));
  assert.deepEqual(
    privateDrift(before, [dir]),
    [
      `${dir}/package.json does not say "private": true: nothing is published from this repository, so add the line, or an \`npm publish -w\` typed by hand puts this code on the registry`,
    ],
    'a package of this repository as it was before the line, read from a scratch copy since every real one says it today',
  );
});
