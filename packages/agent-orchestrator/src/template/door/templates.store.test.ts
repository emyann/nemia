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
import { scratch } from 'test-kit/scratch';
import { act, done, doorFrom, walksOn } from '../../../test/door-walks.ts';
import { aTree, TEMPLATE_WALKS } from '../../../test/template-walks.ts';
import { BuiltinTemplates, builtinTemplatesIn, TemplateDoor, templateDoorFiles, templatePlace } from './templates.store.ts';
import { builtinPlace, sourceGiven } from './templates.ts';
import { TemplateSource } from './templates.model.ts';
import { StoreRoot } from '../../config/root.store.ts';

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

test('a --template is a builtin template where it is a name, and a folder or archive by its whole path where it is not', async (t) => {
  for (const name of ['team', 'my-team-2']) await t.test(`${name}, a name, is kept as given`, () => assert.equal(sourceGiven(name), name));
  for (const given of ['./team', '../x/team', '/abs/team', 'team.tgz', 'Team', 'a/b', 'team_x'])
    await t.test(`${given}, no name, is a path resolved from here`, () => assert.equal(sourceGiven(given), path.resolve(given)));
  await t.test("a name's folder is the name in the builtin folder, and a path is itself", () => {
    assert.equal(builtinPlace('team', '/f'), '/f/team');
    assert.equal(builtinPlace('/abs/x', '/f'), '/abs/x');
  });
});

/** A folder of builtin templates: `team` and `other` and `link` (whose nemia.yaml is a file), `test` with none, and a file. */
function builtins(): string {
  const dir = scratch('wf-builtin-templates-');
  for (const name of ['team', 'other', 'link']) {
    fs.mkdirSync(path.join(dir, name));
    fs.writeFileSync(path.join(dir, name, 'nemia.yaml'), 'kind: FactoryTemplate\n');
  }
  fs.mkdirSync(path.join(dir, 'test'));
  fs.writeFileSync(path.join(dir, 'notes.md'), 'notes\n');
  return dir;
}

/** `templatePlace(source)` with the builtin folder `builtins`: the place, or the refusal it failed with. */
const placed = (source: string, builtins: string) =>
  Effect.runSync(Effect.result(templatePlace(source).pipe(Effect.provideService(BuiltinTemplates, builtins))));

test('the builtin templates in a folder are its folders that hold a nemia.yaml, sorted, and none where it is not there', () => {
  const dir = builtins();
  assert.deepEqual(builtinTemplatesIn(dir), ['link', 'other', 'team']);
  assert.deepEqual(builtinTemplatesIn(path.join(dir, 'gone')), []);
});

test("a template's name is read at its folder among the builtin templates, a path where it is, and REFUSED Missing where none is", () => {
  const dir = builtins();
  const at = placed('team', dir);
  assert.ok(at._tag === 'Success' && at.success === path.join(dir, 'team'));
  const gone = path.join(dir, 'gone');
  const whole = placed('/abs/x', gone);
  assert.ok(whole._tag === 'Success' && whole.success === '/abs/x', 'a path is not looked for among the builtins');
  for (const [builtins, tokens] of [
    [dir, ['team', 'other', dir, './nope']],
    [gone, ['no builtin template', './nope']],
  ] as const) {
    const refused = placed('nope', builtins);
    assert.ok(refused._tag === 'Failure', `nope is refused at ${builtins}`);
    const err = refused.failure as { _tag: string; exitCode: number; message: string };
    assert.deepEqual([err._tag, err.exitCode], ['Missing', 2]);
    for (const token of tokens) assert.ok(err.message.includes(token), `${err.message} names ${token}`);
  }
});
