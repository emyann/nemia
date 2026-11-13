/**
 * Each template of this workspace is at the version `released.json` records for it, with the digest of its content recorded beside
 * it: a change to a template's content bumps its `spec.version` (`nemia.yaml`) and records the new version and digest, so a factory
 * applied at a version always means the same files.
 *
 * The digest is the one `nemia template lint <folder>` prints, of the folder's files with their modes as git records them, read by
 * `digestOf` and `modesOf` of the workspace's own `released.ts`, the digest its `cut` writes at a landing.
 *
 * Each refusal is first made on a scratch copy of the workspace, a byte changed or a version bumped, then the workspace as it is read.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { scratch } from 'test-kit/scratch';
import { digestOf, modesOf, RELEASED, templatesIn } from '../released.ts';
import { TEMPLATES } from './template.ts';

/** How a template stands apart from its record: no record at its version, or another content under the version recorded. */
type Kind = 'unrecorded' | 'changed';

/** A template apart from its record: its name, how, and what to do, for a person. */
type Apart = { template: string; kind: Kind; message: string };

/** The modes of every template of this workspace as git records them, by its path from the workspace. */
const MODES = modesOf(TEMPLATES);

/** Each template of the workspace `root` apart from its record in `released.json` there. */
function apart(root: string): Apart[] {
  const record = JSON.parse(fs.readFileSync(path.join(root, RELEASED), 'utf8')) as Record<string, { version: string; digest: string }>;
  return templatesIn(root).flatMap((template): Apart[] => {
    const manifest = yaml.load(fs.readFileSync(path.join(root, template, 'nemia.yaml'), 'utf8')) as { spec: { version: string } };
    const version = manifest.spec.version;
    const recorded = record[template];
    const digest = digestOf(root, template, MODES);
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
  const root = workspaceWith({
    'sdlc/nemia.yaml': (text) =>
      text.replace(/^ {2}version: (\d+)\.(\d+)\.(\d+)$/m, (_, major, minor, patch) => `  version: ${major}.${minor}.${Number(patch) + 1}`),
  });
  assert.deepEqual(kinds(root), ['sdlc: unrecorded']);
});

test('each template of the workspace is at the version and the digest released.json records', () => {
  assert.deepEqual(templatesIn(TEMPLATES), ['sdlc'], 'the workspace ships sdlc');
  assert.deepEqual(
    apart(TEMPLATES).map(({ message }) => message),
    [],
  );
});
