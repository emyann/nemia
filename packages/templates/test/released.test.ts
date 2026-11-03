/**
 * Each template of this workspace is at the version `released.json` records for it, with the digest of its content recorded beside
 * it: a change to a template's content bumps its `spec.version` (`nemia.yaml`) and records the new version and digest, so a factory
 * applied at a version always means the same files.
 *
 * The digest is the one `nemia template lint <folder>` prints, of the folder's files with their modes. A checkout's modes are its
 * umask's, so the digest is read over a scratch copy whose modes are git's (100644 a 0o644, 100755 a 0o755: `modesOf`), never over the
 * checkout as it is (`digestOf`).
 *
 * Each refusal is first made on a scratch copy of the workspace, a byte changed or a version bumped, then the workspace as it is read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { scratch } from './scratch.ts';
import { nemia, storeEnv, TEMPLATES } from './template.ts';

/** The record of what is released: by template, its version and the digest of its content. */
const RELEASED = 'released.json';

/** How a template stands apart from its record: no record at its version, or another content under the version recorded. */
type Kind = 'unrecorded' | 'changed';

/** A template apart from its record: its name, how, and what to do, for a person. */
type Apart = { template: string; kind: Kind; message: string };

/** Each file of the folder `dir` that git tracks, by its path from `dir`, with the permission bits git records for it. */
function modesOf(dir: string): Map<string, number> {
  const listed = spawnSync('git', ['ls-files', '-s', '-z', '.'], { cwd: dir, encoding: 'utf8' });
  assert.equal(listed.status, 0, listed.stderr);
  return new Map(
    listed.stdout
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const [meta = '', file = ''] = entry.split('\t');
        return [file, meta.startsWith('100755') ? 0o755 : 0o644] as const;
      }),
  );
}

/** The modes of every template of this workspace as git records them, by its path from the workspace. */
const MODES = modesOf(TEMPLATES);

/**
 * The digest of the content of the template `folder` (a folder of `root`), its files' modes set from `MODES` (0o644 for a file git does
 * not track yet), as `nemia template lint` prints it over a scratch copy.
 */
function digestOf(root: string, folder: string): string {
  const work = scratch('nemia-released-');
  const copy = path.join(work, folder);
  fs.cpSync(path.join(root, folder), copy, { recursive: true });
  for (const file of fs.readdirSync(copy, { recursive: true, encoding: 'utf8' })) {
    const at = path.join(copy, file);
    fs.chmodSync(at, fs.statSync(at).isDirectory() ? 0o755 : (MODES.get(`${folder}/${file.split(path.sep).join('/')}`) ?? 0o644));
  }
  const linted = nemia(storeEnv(work), 'template', 'lint', copy);
  assert.equal(linted.code, 0, linted.err);
  const digest = /^digest of the content: (sha256:[0-9a-f]{64})$/m.exec(linted.out)?.[1];
  assert.ok(digest, `nemia template lint printed a digest: ${linted.out}`);
  return digest;
}

/** The templates of the workspace `root`: each folder of it that holds a `nemia.yaml`. */
const templatesIn = (root: string): string[] =>
  fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, entry.name, 'nemia.yaml')))
    .map((entry) => entry.name)
    .sort();

/** Each template of the workspace `root` apart from its record in `released.json` there. */
function apart(root: string): Apart[] {
  const record = JSON.parse(fs.readFileSync(path.join(root, RELEASED), 'utf8')) as Record<string, { version: string; digest: string }>;
  return templatesIn(root).flatMap((template): Apart[] => {
    const manifest = yaml.load(fs.readFileSync(path.join(root, template, 'nemia.yaml'), 'utf8')) as { spec: { version: string } };
    const version = manifest.spec.version;
    const recorded = record[template];
    const digest = digestOf(root, template);
    if (recorded?.version !== version)
      return [
        {
          template,
          kind: 'unrecorded',
          message: `${template}'s spec.version is ${version}, and ${RELEASED} records ${recorded?.version ?? 'no version'} for it: record "${template}": { "version": "${version}", "digest": "${digest}" } in ${RELEASED}.`,
        },
      ];
    if (recorded.digest !== digest)
      return [
        {
          template,
          kind: 'changed',
          message: `${template}'s content changed under spec.version ${version}, which ${RELEASED} records with another digest: bump spec.version in ${template}/nemia.yaml, and record the new version with the digest ${digest} in ${RELEASED}.`,
        },
      ];
    return [];
  });
}

/** A scratch copy of this workspace's templates and their record, each file of `edit` changed by its function, which must change it. */
function workspaceWith(edit: Record<string, (text: string) => string>): string {
  const root = scratch('nemia-released-root-');
  for (const name of [RELEASED, ...templatesIn(TEMPLATES)])
    fs.cpSync(path.join(TEMPLATES, name), path.join(root, name), { recursive: true });
  for (const [file, change] of Object.entries(edit)) {
    const at = path.join(root, file);
    const text = fs.readFileSync(at, 'utf8');
    assert.notEqual(change(text), text, `${file} holds what the fixture changes`);
    fs.writeFileSync(at, change(text));
  }
  return root;
}

/** How each template of `root` stands apart, by template and kind. */
const kinds = (root: string): string[] => apart(root).map(({ template, kind }) => `${template}: ${kind}`);

test('REFUSED: a byte of a step changed under the version recorded', () => {
  const root = workspaceWith({ 'sdlc/workflows/build/design.md': (text) => `${text} ` });
  assert.deepEqual(kinds(root), ['sdlc: changed']);
});

test('REFUSED: a version bumped and not recorded', () => {
  const root = workspaceWith({ 'sdlc/nemia.yaml': (text) => text.replace(/^ {2}version: 1\.0\.0$/m, '  version: 1.0.1') });
  assert.deepEqual(kinds(root), ['sdlc: unrecorded']);
});

test('each template of the workspace is at the version and the digest released.json records', () => {
  assert.deepEqual(templatesIn(TEMPLATES), ['sdlc'], 'the workspace ships sdlc');
  assert.deepEqual(
    apart(TEMPLATES).map(({ message }) => message),
    [],
  );
});
