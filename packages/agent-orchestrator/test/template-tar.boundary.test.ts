/**
 * A template against the system's own tools: the system's `tar` opens an archive `nemia template pack` wrote into the same files and
 * modes as `unpack` writes, and a named pipe `mkfifo` made in a folder is refused by name, never read. Both start a real process, so
 * they stand here and not beside the store. `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import type { StoreRoot as Root } from '../src/config/root.store.ts';

const ROOT = scratch('wf-template-tar-');
process.env.WF_ROOT = ROOT;
const { checkedTree, placeSkillNames } = await import('../src/template/template.store.ts');
const { TemplateDoor } = await import('../src/templates/templates.store.ts');
const { TemplateSource } = await import('../src/templates/templates.model.ts');
const { StoreRoot } = await import('../src/config/root.store.ts');
const { exportedTemplate, packedTemplate } = await import('../src/template/template.verb.ts');

/** `program` run at the store's root: what it answers, or the refusal it failed with, thrown. */
function run<A>(program: Effect.Effect<A, unknown, Root>): A {
  const exit = Effect.runSyncExit(Effect.provideService(program, StoreRoot, ROOT));
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}

/** The files under `dir`, each with its mode and its bytes in hex, by path from it. */
function filesOf(dir: string, under = ''): Array<[string, number, string]> {
  return fs
    .readdirSync(path.join(dir, under), { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((entry): Array<[string, number, string]> => {
      const file = under ? `${under}/${entry.name}` : entry.name;
      const at = path.join(dir, file);
      if (entry.isDirectory()) return filesOf(dir, file);
      return [[file, fs.statSync(at).mode & 0o777, fs.readFileSync(at).toString('hex')]];
    });
}

/** The tests' team exported to a folder named `team`, with a script of mode 0755 and a file of all 256 bytes. */
function exported(): string {
  const repo = scratch('wf-template-tar-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  const skill = path.join(repo, 'workflows', 'skills', 'review-a-change');
  fs.writeFileSync(path.join(skill, 'look.sh'), '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(
    path.join(skill, 'data.bin'),
    Uint8Array.from({ length: 256 }, (_, i) => i),
  );
  const dir = path.join(scratch('wf-template-tar-out-'), 'team');
  run(exportedTemplate(dir, repo, undefined));
  return dir;
}

test("the system's tar opens an archive into the same files and modes as unpack writes", () => {
  const dir = exported();
  const { out } = run(packedTemplate(dir, undefined, scratch('wf-template-tar-pack-')));
  const byTar = scratch('wf-template-tar-x-');
  execFileSync('tar', ['-xzf', out, '-C', byTar], { stdio: ['ignore', 'pipe', 'pipe'] });
  assert.deepEqual(fs.readdirSync(byTar), ['team']);
  assert.deepEqual(filesOf(path.join(byTar, 'team')), filesOf(dir));
});

test('a folder entry that is neither a file nor a folder is refused by name, never read', () => {
  const dir = exported();
  execFileSync('mkfifo', [path.join(dir, 'workflows', 'dev', 'pipe.yaml')], { stdio: ['ignore', 'pipe', 'pipe'] });
  const read = run(
    Effect.gen(function* () {
      return yield* (yield* TemplateDoor).templates.read(TemplateSource.read(path.resolve(dir)));
    }),
  );
  const problems = checkedTree(read, placeSkillNames()).problems;
  assert.deepEqual(
    problems.map((p) => p.file),
    ['workflows/dev/pipe.yaml'],
  );
  assert.ok(problems[0].message.startsWith('workflows/dev/pipe.yaml is neither a file nor a folder'), problems[0].message);
  assert.ok(problems[0].message.includes('remove it'), problems[0].message);
});
