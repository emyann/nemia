/**
 * The proof that writing an agent once changed no run: every shipped folder resolves to what it did before `agents/` existed.
 *
 * `fixtures/resolved-before.json` is what today's loader read every shipped folder as, written from the loader of 6c4e57b before any
 * folder moved a line into an agent. It is never regenerated: a difference is a finding, not a fixture to refresh.
 *
 * Every key of every step is held equal, field for field, with no exception but the new `agent`. The bodies are compared too, and the
 * steps whose body moved must be exactly `BODIES_REWORDED`: the reworded briefs of the change that wrote the agents, each printed as a
 * diff for the person who reads the run.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadWorkflows } from '../src/workflow.ts';

const REPO = path.join(import.meta.dirname, '..', '..', '..');
const BEFORE: Record<string, Array<Record<string, unknown>>> = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'resolved-before.json'), 'utf8'));

/** The steps whose resolved body is not the one it had, as `<folder>/<step>`: none, until an agent's words differ from a step's. */
const BODIES_REWORDED: string[] = [];

/** A step as JSON has it — no `undefined` — without the fields the proof sets aside. */
const keysOf = (step: Record<string, unknown>): Record<string, unknown> => {
  const { body: _body, agent: _agent, ...keys } = JSON.parse(JSON.stringify(step)) as Record<string, unknown>;
  return keys;
};

/** The lines of `after` that are not in `before` and the other way round, in order: a diff to read, not to apply. */
function lineDiff(before: string, after: string): string {
  const a = before.split('\n');
  const b = after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: string[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) { i++; j++; continue; }
    if (j < b.length && (i === a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) out.push(`+ ${b[j++]}`);
    else out.push(`- ${a[i++]}`);
  }
  return out.join('\n');
}

test('every shipped folder resolves to the keys it had before agents, and only the reworded bodies moved', (t) => {
  const moved: string[] = [];
  for (const [folder, before] of Object.entries(BEFORE)) {
    const dir = path.join(REPO, folder);
    assert.ok(fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory(), `${folder} is still shipped`);
    const after = loadWorkflows(dir) as unknown as Array<Record<string, unknown>>;
    assert.deepEqual(after.map((s) => s.name), before.map((s) => s.name), `${folder}: the same steps, in the same order`);
    for (const [i, step] of after.entries()) {
      const was = before[i]!;
      assert.deepEqual(keysOf(step), keysOf(was), `${folder}/${String(step.name)}: every key as it resolved before`);
      if (step.body !== was.body) {
        moved.push(`${folder}/${String(step.name)}`);
        t.diagnostic(`${folder}/${String(step.name)}.md, its brief before and after:\n${lineDiff(String(was.body), String(step.body))}`);
      }
    }
  }
  assert.deepEqual(moved.sort(), [...BODIES_REWORDED].sort(), 'the bodies that moved are exactly the reworded ones');
});
