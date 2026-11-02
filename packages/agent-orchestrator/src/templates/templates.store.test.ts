/**
 * The Template door's files layer: the door's walks (`test/template-walks.ts`) on a fresh scratch folder each, and what only the files
 * can be asked — a folder made empty by hand taken as a new one's place, no staged file left beside a write, and the default door's
 * root. What a read of a folder finds that is no file of a template (a link, a pipe) is `template.store.test.ts`'s and, for the
 * pipe, `test/template-tar.boundary.test.ts`'s, through the lint.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { act, done, doorFrom, walksOn } from '../../test/door-walks.ts';
import { aTree, TEMPLATE_WALKS } from '../../test/template-walks.ts';
import { TemplateDoor, templateDoorFiles } from './templates.store.ts';
import { TemplateSource } from '../templates/templates.model.ts';
import { StoreRoot } from '../config/root.store.ts';

for (const [name, body] of walksOn(TEMPLATE_WALKS, () => {
  const root = scratch('wf-template-door-');
  return { door: doorFrom(TemplateDoor, templateDoorFiles()), root, layer: 'files' };
}))
  test(name, body);

/** A fresh scratch folder, and the Template door over the files. */
const place = () => ({ root: scratch('wf-template-door-'), door: doorFrom(TemplateDoor, templateDoorFiles()) });

test('a folder there and empty is written into, and a write leaves nothing staged beside it', () => {
  const { root, door } = place();
  fs.mkdirSync(path.join(root, 'shop'));
  done(door.templates.create(TemplateSource.read(path.join(root, 'shop')), aTree('shop')));
  done(door.templates.pack(TemplateSource.read(path.join(root, 'shop.tgz')), aTree('shop')));
  assert.deepEqual(fs.readdirSync(root).sort(), ['shop', 'shop.tgz']);
  assert.equal(fs.statSync(path.join(root, 'shop', 'workflows', 'dev', 'run.sh')).mode & 0o777, 0o755);
});

test('the default door reads the files where the program was given a store root, and refuses Invalid where it was given none', () => {
  const { root, door } = place();
  const at = TemplateSource.read(path.join(root, 'shop'));
  done(door.templates.create(at, aTree('shop')));
  const read = Effect.gen(function* () {
    return (yield* (yield* TemplateDoor).templates.read(at)).name;
  });
  assert.equal(act(Effect.provideService(read, StoreRoot, scratch('wf-store-'))), 'shop');
  assert.deepEqual(act(read), { refused: 'Invalid' });
});
