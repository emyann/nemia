/**
 * Every frontmatter of the repository's team and skills is YAML: each markdown file git holds under `workflows/`, `.claude/skills/` and
 * `apps/web/.claude/skills/` that opens with `---` has a block a strict YAML parser reads as a map of keys. The parser is js-yaml, not
 * Nemia's own reader, so a block Nemia still reads in the former line form (`key: the rest of the line`) is refused here: what VS Code's
 * preview, GitHub's file view or any tool a person points at these files would refuse. The fix is `nemia frontmatter rewrite <folder>`.
 *
 * The guard is first made to refuse a planted block, and it must read more files than the team holds steps, so a scan that reads
 * nothing cannot pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import jsyaml from 'js-yaml';
import { files, REPO } from './repo-files.ts';
import { scratch } from './scratch.ts';

/** The folders whose markdown is read by a harness or by Nemia as frontmatter and a body. */
const HELD = ['workflows/', '.claude/skills/', 'apps/web/.claude/skills/'];

/** A file's frontmatter block, between the `---` that opens its first line and the next line that is just `---`; null for none. */
const blockOf = (text: string): string | null => {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/.exec(text);
  return m ? (m[1] ?? '') : null;
};

/** Each file of `held`, by its path from `root`, whose frontmatter a strict YAML parse refuses or reads as no map, with why. */
function refusedIn(root: string, held: readonly string[]): string[] {
  return held.flatMap((file) => {
    const block = blockOf(fs.readFileSync(path.join(root, file), 'utf8'));
    if (block === null) return [];
    try {
      const read: unknown = jsyaml.load(block);
      return read === null || read === undefined || (typeof read === 'object' && !Array.isArray(read))
        ? []
        : [`${file}: the frontmatter is not a map of keys`];
    } catch (err) {
      return [`${file}: ${(err as Error).message.split('\n')[0]} — rewrite it as YAML: nemia frontmatter rewrite ${path.dirname(file)}`];
    }
  });
}

test('REFUSED: a planted frontmatter a strict YAML parser refuses, and one that is not a map', () => {
  const root = scratch('guards-frontmatter-');
  fs.writeFileSync(path.join(root, 'former.md'), '---\ndescription: a spec describes: cuts it\n---\nbody\n');
  fs.writeFileSync(path.join(root, 'list.md'), '---\n- a\n---\nbody\n');
  fs.writeFileSync(path.join(root, 'yaml.md'), '---\ndescription: "a spec describes: cuts it"\ncheck: |-\n  { a; b: c; }\n---\nbody\n');
  assert.deepEqual(
    refusedIn(root, ['former.md', 'list.md', 'yaml.md']).map((line) => line.slice(0, line.indexOf(':'))),
    ['former.md', 'list.md'],
  );
});

test('every frontmatter under workflows/, .claude/skills/ and apps/web/.claude/skills/ is YAML a strict parser reads', () => {
  const held = files().filter((file) => file.endsWith('.md') && HELD.some((dir) => file.startsWith(dir)));
  const framed = held.filter((file) => blockOf(fs.readFileSync(path.join(REPO, file), 'utf8')) !== null);
  assert.ok(framed.length > 30, `the scan reads the repository's frontmatter, or it would pass by reading nothing: ${framed.length}`);
  assert.deepEqual(refusedIn(REPO, held), []);
});
