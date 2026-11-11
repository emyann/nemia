/**
 * What the contract does not hold of an upgrade's resolution (`contracts/resolution.contract.ts` holds `resolvedBy` and
 * `resolutionOf`): a conflict's address read as its path's segments (`segmentsOf`), an owner's key read back (`ownerOfKey`), each
 * conflict's owner by its address, the wiring's key among it (`conflictOwners`), and the render given a taken owner's files from the tree
 * (`takenFromTree`) — a Workflow's, an Agent's, a Skill's, the Factory's, a Hire's one key of the wiring — after which the merge has no
 * conflict left in that owner's files.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conflictOwners, mergeTrees, ownerKey, ownerOfKey, segmentsOf, takenFromTree, type TreeFile } from './index.ts';

/** A tree of text files, by path. */
const tree = (files: Record<string, string>): TreeFile[] =>
  Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));

/** A tree's files by path and text, a file that is no text by its byte count. */
const texts = (files: readonly TreeFile[]): Record<string, string> =>
  Object.fromEntries(files.map((f) => [f.path, f.bytes.includes(0) ? `${f.bytes.length} bytes` : f.bytes.toString()]));

/** Bytes that are no text: a NUL among them. */
const LOGO = Buffer.from([0x89, 0x50, 0x00, 0x47]);

test("an upgrade's resolution, row by row: an address's segments, and a taken workflow's files from the tree", async (t) => {
  await t.test("an address is cut to its file's path and split: a whole file, a key, base lines, the wiring's key", () => {
    assert.deepEqual(segmentsOf('workflows/flow/check.ts'), ['workflows', 'flow', 'check.ts']);
    assert.deepEqual(segmentsOf('workflows/flow/check.ts:3-4'), ['workflows', 'flow', 'check.ts']);
    assert.deepEqual(segmentsOf('workflows/flow/review.md#rounds'), ['workflows', 'flow', 'review.md']);
    assert.deepEqual(segmentsOf('factory.json#hires.flow/review'), ['factory.json']);
  });

  const base = tree({
    'workflows/flow/check.ts': 'one\ntwo\nthree\n',
    'workflows/flow/gone.ts': 'gone\n',
    'workflows/other/check.ts': 'a\n',
    'workflows/agents/dev.md': 'dev\n',
    'workflows/flow/deep/x.ts': 'x\n',
  });
  const ours = [
    ...tree({
      'workflows/flow/check.ts': 'one\nTWO mine\nthree\n',
      'workflows/flow/mine.ts': 'mine\n',
      'workflows/other/check.ts': 'a mine\n',
      'workflows/agents/dev.md': 'dev mine\n',
      'workflows/flow/deep/x.ts': 'x mine\n',
    }),
    { path: 'workflows/flow/logo.png', bytes: LOGO },
  ];
  const theirs = [
    ...tree({
      'workflows/flow/check.ts': 'one\nTWO theirs\nthree\n',
      'workflows/flow/gone.ts': 'gone\n',
      'workflows/other/check.ts': 'a theirs\n',
      'workflows/agents/dev.md': 'dev theirs\n',
      'workflows/flow/deep/x.ts': 'x theirs\n',
    }),
    { path: 'workflows/flow/logo.png', bytes: Buffer.from([0x89, 0x00]) },
  ];

  await t.test(
    "each text file directly in a taken workflow's folder is the tree's, dropped where the tree has none, added where only it has one",
    () => {
      assert.deepEqual(texts(takenFromTree(theirs, ours, ['Workflow/flow'], 'acme')), {
        'workflows/agents/dev.md': 'dev theirs\n',
        'workflows/flow/check.ts': 'one\nTWO mine\nthree\n',
        'workflows/flow/deep/x.ts': 'x theirs\n',
        'workflows/flow/logo.png': '2 bytes',
        'workflows/flow/mine.ts': 'mine\n',
        'workflows/other/check.ts': 'a theirs\n',
      });
    },
  );

  await t.test('no workflow taken leaves the render as it is', () => {
    assert.deepEqual(texts(takenFromTree(theirs, ours, [], 'acme')), texts(theirs));
  });

  await t.test("the merge over the render so given has no conflict in the taken workflow's text files, and keeps the others'", () => {
    const before = mergeTrees(base, ours, theirs).conflicts.map((c) => c.at);
    assert.ok(
      before.some((at) => at.startsWith('workflows/flow/check.ts')),
      `the script conflicts before it is taken: ${before.join(', ')}`,
    );
    const after = mergeTrees(base, ours, takenFromTree(theirs, ours, ['Workflow/flow'], 'acme')).conflicts.map((c) => c.at);
    assert.deepEqual(after, [
      'workflows/agents/dev.md:1-1',
      'workflows/flow/deep/x.ts:1-1',
      'workflows/flow/logo.png',
      'workflows/other/check.ts:1-1',
    ]);
  });

  await t.test('an owner is keyed <Kind>/<name>, and a bare key, as a store before other kinds wrote it, is a Workflow', () => {
    assert.deepEqual(ownerOfKey(ownerKey({ kind: 'Hire', name: 'flow.review' })), { kind: 'Hire', name: 'flow.review' });
    assert.deepEqual(ownerOfKey('flow'), { kind: 'Workflow', name: 'flow' });
  });

  await t.test("each conflict's owner, by its address: the wiring's hire by its key, its other keys and a carried file by none", () => {
    const at = (...addresses: string[]) => addresses.map((a) => ({ at: a })) as unknown as Parameters<typeof conflictOwners>[0];
    const owners = conflictOwners(
      at(
        'factory.json#hires.flow/review',
        'factory.json#revisions',
        'workflows/carried/land.ts:1-1',
        'RULES.md:2-3',
        'workflows/skills/s/a/b.md',
      ),
      'acme',
      tree({ 'factory.json': '{}', 'RULES.md': 'r\n', 'workflows/carried/land.ts': 'x\n', 'workflows/skills/s/a/b.md': 'b\n' }),
    );
    assert.deepEqual(Object.fromEntries(owners), {
      'factory.json#hires.flow/review': 'Hire/flow.review',
      'RULES.md:2-3': 'Factory/acme',
      'workflows/skills/s/a/b.md': 'Skill/s',
    });
  });

  const kinds = {
    ours: [
      ...tree({
        'workflows/agents/dev.md': 'dev mine\n',
        'workflows/agents/dev.schema.json': '{"mine":1}\n',
        'workflows/agents/ops.md': 'ops mine\n',
        'workflows/skills/tidy/SKILL.md': 'tidy mine\n',
        'workflows/skills/tidy/notes/deep.md': 'deep mine\n',
        'workflows/carried/land.ts': 'land mine\n',
        'RULES.md': 'rules mine\n',
        'NEMIA.md': 'nemia mine\n',
        'factory.json': JSON.stringify({ workflows: ['flow'], hires: { 'flow/review': 'mine', 'flow/plan': 'kept' } }),
      }),
      { path: 'workflows/skills/tidy/logo.png', bytes: LOGO },
    ],
    theirs: [
      ...tree({
        'workflows/agents/dev.md': 'dev theirs\n',
        'workflows/agents/dev.schema.json': '{"theirs":1}\n',
        'workflows/agents/ops.md': 'ops theirs\n',
        'workflows/skills/tidy/SKILL.md': 'tidy theirs\n',
        'workflows/skills/tidy/notes/deep.md': 'deep theirs\n',
        'workflows/skills/tidy/notes/gone.md': 'gone\n',
        'workflows/carried/land.ts': 'land theirs\n',
        'RULES.md': 'rules theirs\n',
        'NEMIA.md': 'nemia theirs\n',
        'factory.json': JSON.stringify({
          workflows: ['flow'],
          hires: { 'flow/review': 'theirs', 'flow/plan': 'theirs', 'flow/ship': 'new' },
        }),
      }),
      { path: 'workflows/skills/tidy/logo.png', bytes: Buffer.from([0x89, 0x00]) },
    ],
  };
  const taken = (...owners: string[]) => texts(takenFromTree(kinds.theirs, kinds.ours, owners, 'acme'));

  await t.test("a taken Agent's file and result schema are the tree's; another agent's are the render's", () => {
    const got = taken('Agent/dev');
    assert.equal(got['workflows/agents/dev.md'], 'dev mine\n');
    assert.equal(got['workflows/agents/dev.schema.json'], '{"mine":1}\n');
    assert.equal(got['workflows/agents/ops.md'], 'ops theirs\n');
  });

  await t.test("a taken Skill's text files at any depth are the tree's, one only the render has dropped; its picture the render's", () => {
    const got = taken('Skill/tidy');
    assert.equal(got['workflows/skills/tidy/SKILL.md'], 'tidy mine\n');
    assert.equal(got['workflows/skills/tidy/notes/deep.md'], 'deep mine\n');
    assert.equal(got['workflows/skills/tidy/notes/gone.md'], undefined);
    assert.equal(got['workflows/skills/tidy/logo.png'], '2 bytes');
  });

  await t.test("the taken Factory's rules and instruction are the tree's; a carried file is never taken", () => {
    const got = taken('Factory/acme', 'Workflow/carried');
    assert.equal(got['RULES.md'], 'rules mine\n');
    assert.equal(got['NEMIA.md'], 'nemia mine\n');
    assert.equal(got['workflows/carried/land.ts'], 'land theirs\n');
  });

  await t.test("a taken Hire gives the render's wiring the tree's value for its one key, or removes it where the tree has none", () => {
    const wiring = (got: Record<string, string>) => JSON.parse(got['factory.json'] ?? '{}') as { hires: Record<string, string> };
    assert.deepEqual(wiring(taken('Hire/flow.review', 'Hire/flow.ship')).hires, { 'flow/review': 'mine', 'flow/plan': 'theirs' });
    assert.deepEqual(wiring(taken()).hires, { 'flow/review': 'theirs', 'flow/plan': 'theirs', 'flow/ship': 'new' });
  });
});
