/**
 * A step of this repository's team runs its workflow's scripts from the run's frozen workflow files (`$WF_WORKFLOW_FILES`, the copy of
 * its own workflow folder the run took when it began), never from the tree it judges nor out of git alone; and `quick`, whose run
 * freezes its own folder only, carries `build`'s four scripts byte for byte.
 *
 * What is read: every step file (`workflows/<workflow>/<step>.md`, a README and the agents' folder left out), as units — each top-level
 * clause of its `check:` (split at an `&&` outside every brace), and each fenced block and code span of its note. In each unit:
 *
 * 1. **A frozen file is the step's own.** Each file named under the frozen folder, `$WF_WORKFLOW_FILES/<name>` or
 *    `${WF_WORKFLOW_FILES:-<fallback>}/<name>`, is a file of the step's own workflow folder: the run copies that folder alone.
 * 2. **A script read from elsewhere is a fallback.** Each read of a workflow script past the frozen folder — `git show
 *    <ref>:workflows/<dir>/<name>.ts`, or `node workflows/<dir>/<name>.ts` from the tree — stands after the unit names that same
 *    `<name>.ts` under the frozen folder, which is where a line falls back to while a daemon that sets no `WF_WORKFLOW_FILES` runs it.
 *    A unit that reads a script out of git alone is refused.
 *
 * And (b), quick's copies of `build`'s `landing.ts`, `pictures.ts`, `probe.ts` and `pull-request.ts` are equal to them byte for byte.
 *
 * Each rule is first made to refuse on a scratch copy of the team with one line changed; then the team as shipped is read, each step
 * that runs a script for the names it must hold, so a check moved or emptied cannot make the guard pass by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { splitFrontmatter } from 'agent-orchestrator/workflow';
import { REPO } from './workspaces.ts';
import { scratch } from './scratch.ts';

const WORKFLOWS = path.join(REPO, 'workflows');

/** The scripts of `build` that `quick`'s checks run, which `quick` carries as copies of its own. */
const QUICK_COPIES = ['landing.ts', 'pictures.ts', 'probe.ts', 'pull-request.ts'];

/** A file named under the frozen folder: `$WF_WORKFLOW_FILES/<name>` or `${WF_WORKFLOW_FILES:-<fallback>}/<name>`. */
const FROZEN = /\$(?:WF_WORKFLOW_FILES|\{WF_WORKFLOW_FILES:-[^}]*\})\/([\w.-]+)/g;

/** A workflow script read past the frozen folder: shown out of git, or run from the tree. */
const ELSEWHERE = /git\s+show\s+"?[^\s":]*:workflows\/[\w-]+\/([\w.-]+\.ts)|\bnode\s+"?(?:\.\/)?workflows\/[\w-]+\/([\w.-]+\.ts)/g;

/** The step files of the team under `root`, by their path from it: `<workflow>/<step>.md`. */
function stepFiles(root: string): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'agents')
    .flatMap((dir) =>
      fs
        .readdirSync(path.join(root, dir.name))
        .filter((name) => name.endsWith('.md') && name !== 'README.md')
        .map((name) => `${dir.name}/${name}`),
    )
    .sort();
}

/** `check` split at each `&&` outside every brace: its top-level clauses. */
function clauses(check: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < check.length; i++) {
    if (check[i] === '{') depth++;
    else if (check[i] === '}') depth--;
    else if (depth === 0 && check.startsWith('&&', i)) {
      parts.push(check.slice(from, i));
      from = i + 2;
    }
  }
  return [...parts, check.slice(from)];
}

/** The units of the step file `text`: the clauses of its check, then each fenced block and each code span of its note. */
function unitsOf(file: string, text: string): string[] {
  const { block, body } = splitFrontmatter(file, text);
  const front = (block === null ? {} : yaml.load(block)) as { check?: unknown } | null;
  const check = typeof front?.check === 'string' ? clauses(front.check) : [];
  const fenced = [...body.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map(([, inner]) => inner ?? '');
  const spans = [...body.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '').matchAll(/`([^`]+)`/g)].map(([, inner]) => inner ?? '');
  return [...check, ...fenced, ...spans];
}

/** The files the step file `file` (`<workflow>/<step>.md` under `root`) names under the frozen folder, in order. */
function frozenOf(root: string, file: string): string[] {
  return unitsOf(file, fs.readFileSync(path.join(root, file), 'utf8')).flatMap((unit) =>
    [...unit.matchAll(FROZEN)].map(([, name]) => name ?? ''),
  );
}

/** What breaks rule 1 or rule 2 in the team under `root`: a line each, `<workflow>/<step>.md: <what>`. */
function unfrozen(root: string): string[] {
  const found: string[] = [];
  for (const file of stepFiles(root)) {
    const own = path.join(root, path.dirname(file));
    for (const unit of unitsOf(file, fs.readFileSync(path.join(root, file), 'utf8'))) {
      const frozen = [...unit.matchAll(FROZEN)];
      for (const [, name] of frozen)
        if (!fs.existsSync(path.join(own, name ?? ''))) found.push(`${file}: $WF_WORKFLOW_FILES/${name} is no file of its own folder`);
      for (const read of unit.matchAll(ELSEWHERE)) {
        const name = read[1] ?? read[2] ?? '';
        if (!frozen.some((at) => at[1] === name && (at.index ?? 0) < (read.index ?? 0)))
          found.push(`${file}: reads ${name} past $WF_WORKFLOW_FILES with no frozen read before it: ${read[0]}`);
      }
    }
  }
  return found;
}

/** Quick's copies under `root` that are not `build`'s byte for byte, missing ones among them. */
function unequal(root: string): string[] {
  return QUICK_COPIES.filter((name) => {
    const [copy, original] = ['quick', 'build'].map((workflow) => path.join(root, workflow, name));
    return !fs.existsSync(copy ?? '') || !fs.readFileSync(copy ?? '').equals(fs.readFileSync(original ?? ''));
  }).map((name) => `quick/${name}`);
}

/** A scratch copy of the team, with `file` (from `workflows/`) changed by `edit`, which must change it: its root. */
function planted(file: string, edit: (text: string) => string): string {
  const root = scratch('wf-workflow-scripts-');
  fs.cpSync(WORKFLOWS, root, { recursive: true });
  const at = path.join(root, file);
  const text = fs.readFileSync(at, 'utf8');
  assert.notEqual(edit(text), text, `${file} holds what the fixture changes`);
  fs.writeFileSync(at, edit(text));
  return root;
}

test('REFUSED: a check that reads a script out of git alone, with no frozen read before it', () => {
  const clause = '{ p=$(mktemp -d) && git show "$WF_BASE_REF:workflows/build/probe.ts" > "$p/probe.ts" && node "$p/probe.ts" check; }';
  const root = planted('build/implement.md', (text) => text.replace(/^check: \|-\n {2}/m, `check: |-\n  ${clause} && `));
  assert.deepEqual(
    unfrozen(root).map((line) => line.split(':')[0]),
    ['build/implement.md'],
  );
});

test("REFUSED: a check that names a frozen script its step's own folder does not hold", () => {
  const root = scratch('wf-workflow-scripts-');
  fs.cpSync(WORKFLOWS, root, { recursive: true });
  fs.rmSync(path.join(root, 'janitor', 'cards.ts'));
  assert.deepEqual(
    unfrozen(root).map((line) => line.split(':')[0]),
    ['janitor/argus.md'],
  );
});

test("REFUSED: a copy of build's script in quick that differs from it by one byte", () => {
  const root = planted('quick/probe.ts', (text) => `${text} `);
  assert.deepEqual(unequal(root), ['quick/probe.ts']);
});

test("the team's steps run their scripts from the run's frozen workflow files, each its own folder's, with git only as a fallback", () => {
  assert.deepEqual(unfrozen(WORKFLOWS), []);
  const named = (file: string): string[] => [...new Set(frozenOf(WORKFLOWS, file))].sort();
  assert.deepEqual(named('build/implement.md'), ['pictures.ts', 'probe.ts', 'pull-request.ts']);
  assert.deepEqual(named('quick/implement.md'), ['change.ts', 'pictures.ts', 'probe.ts', 'pull-request.ts']);
  assert.deepEqual(named('build/land.md'), ['landing.ts']);
  assert.deepEqual(named('quick/land.md'), ['landing.ts']);
  assert.deepEqual(named('janitor/argus.md'), ['cards.ts']);
});

test("quick carries build's four scripts byte for byte", () => {
  assert.deepEqual(unequal(WORKFLOWS), []);
});
