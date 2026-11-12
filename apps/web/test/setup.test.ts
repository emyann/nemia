/**
 * The Setup page's own judgements (src/lib/setup.ts): the URLs a fix's output links, the code it shows by its need's pattern, the answers
 * a fix is started with, the name a browser pairs under, the pieces grouped by area, the first-visit link taken off an address, the
 * harnesses the first visit offers, and the fixes a piece shows by its state.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { READINESS_AREAS } from 'objects';
import type { ReadinessFix, ReadinessPiece } from 'objects';
import {
  answered,
  answersOf,
  clientNameOf,
  codeIn,
  harnessChoices,
  linkedParts,
  linkSecretOf,
  piecesByArea,
  shownFixes,
  withoutLink,
} from '../src/lib/setup.ts';

test('linkedParts: every URL of the output a link, the sentence around it text, and the whole said back', async (t) => {
  await t.test('a device sign-in: the URL is a link, the full stop after it text', () => {
    const output = 'Open https://example.com/login/device. Then type the code.\n';
    const parts = linkedParts(output);
    assert.deepEqual(
      parts.filter((p) => p.kind === 'link').map((p) => p.text),
      ['https://example.com/login/device'],
    );
    assert.equal(parts.map((p) => p.text).join(''), output, 'joined, the parts are the output whole');
  });
  await t.test('two URLs, one in brackets, one with a query, and http alike', () => {
    const output = 'see (https://a.dev/x?y=1&z=2) or http://127.0.0.1:8787/?link=abc';
    assert.deepEqual(
      linkedParts(output)
        .filter((p) => p.kind === 'link')
        .map((p) => p.text),
      ['https://a.dev/x?y=1&z=2', 'http://127.0.0.1:8787/?link=abc'],
    );
    assert.equal(
      linkedParts(output)
        .map((p) => p.text)
        .join(''),
      output,
    );
  });
  await t.test('no URL, or a scheme alone, is text alone', () => {
    assert.equal(linkedParts('nothing here').length, 1);
    assert.equal(
      linkedParts('https://').every((p) => p.kind === 'text'),
      true,
    );
    assert.equal(linkedParts('').length, 0);
  });
});

test("codeIn: the code the output shows by its need's pattern, the last one, its group where it has one", async (t) => {
  const pattern = '[A-Z0-9]{4}-[A-Z0-9]{4}';
  await t.test('found, and the last of two', () => {
    assert.equal(codeIn('code: K7QM-3XRP\n', pattern), 'K7QM-3XRP');
    assert.equal(codeIn('code: AAAA-BBBB\nexpired, new code: CCCC-DDDD\n', pattern), 'CCCC-DDDD');
  });
  await t.test("a pattern's first group is the code", () => {
    assert.equal(codeIn('one-time code: 1234-5678 (valid 15 minutes)', 'code: (\\d{4}-\\d{4})'), '1234-5678');
  });
  await t.test('none: no pattern, an empty one, one that is no expression, or nothing matching yet', () => {
    assert.equal(codeIn('K7QM-3XRP', undefined), undefined);
    assert.equal(codeIn('K7QM-3XRP', ''), undefined);
    assert.equal(codeIn('K7QM-3XRP', '(['), undefined);
    assert.equal(codeIn('waiting…', pattern), undefined);
  });
});

test('answered and answersOf: a fix that asks starts only once every ask is answered, its answers trimmed', () => {
  const asks = [{ name: 'name' }, { name: 'email' }];
  assert.equal(answered(asks, { name: 'Robin' }), false);
  assert.equal(answered(asks, { name: 'Robin', email: '  ' }), false);
  assert.equal(answered(asks, { name: 'Robin', email: 'robin@example.com' }), true);
  assert.equal(answered([], {}), true, 'a fix that asks nothing is answered');
  assert.deepEqual(answersOf(asks, { name: ' Robin ', email: 'robin@example.com', other: 'x' }), {
    name: 'Robin',
    email: 'robin@example.com',
  });
});

test('clientNameOf: a browser pairs as board-<browser>, a name a token takes', () => {
  const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  assert.equal(clientNameOf(chrome), 'board-chrome');
  assert.equal(clientNameOf(`${chrome} Edg/140.0.0.0`), 'board-edge');
  assert.equal(clientNameOf('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0'), 'board-firefox');
  assert.equal(
    clientNameOf('Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'),
    'board-safari',
  );
  assert.equal(clientNameOf(''), 'board');
  for (const ua of [chrome, '']) assert.match(clientNameOf(ua), /^[A-Za-z0-9][A-Za-z0-9._-]*$/);
});

test("piecesByArea: the read's pieces under their areas, in objects' order, an area with none left out", () => {
  const pieces = [
    { name: 'a', area: 'workflow' },
    { name: 'b', area: 'harness' },
    { name: 'c', area: 'workflow' },
  ] as const;
  const groups = piecesByArea(pieces);
  assert.deepEqual(
    groups.map((g) => [g.area, g.pieces.map((p) => p.name)]),
    [
      ['harness', ['b']],
      ['workflow', ['a', 'c']],
    ],
  );
  assert.ok(READINESS_AREAS.indexOf('harness') < READINESS_AREAS.indexOf('workflow'));
});

test('linkSecretOf and withoutLink: the secret a first-visit link carries, and the address without it', () => {
  const href = 'http://10.0.0.2:8787/runs?factory=acme&link=s3cr3t#top';
  assert.equal(linkSecretOf(href), 's3cr3t');
  assert.equal(withoutLink(href), '/runs?factory=acme#top', 'its other keys and its hash kept');
  assert.equal(withoutLink('http://10.0.0.2:8787/?link=s3cr3t'), '/', 'the bare address');
  assert.equal(linkSecretOf('http://10.0.0.2:8787/?link='), undefined, 'an empty link is none');
  assert.equal(linkSecretOf('http://10.0.0.2:8787/runs'), undefined);
});

test("harnessChoices: one row per harness the read names, in the read's order, its install and sign-in pieces", async (t) => {
  type P = { id: string; harness?: { name: string; part: 'install' | 'sign-in' } };
  const rows: Array<{ why: string; pieces: P[]; want: Array<[string, string, string | undefined]> }> = [
    {
      why: "two harnesses, each its two pieces, in the read's order, a piece of no harness left out",
      pieces: [
        { id: 'a', harness: { name: 'one', part: 'install' } },
        { id: 'b', harness: { name: 'one', part: 'sign-in' } },
        { id: 'svc' },
        { id: 'c', harness: { name: 'two', part: 'install' } },
        { id: 'd', harness: { name: 'two', part: 'sign-in' } },
      ],
      want: [
        ['one', 'a', 'b'],
        ['two', 'c', 'd'],
      ],
    },
    {
      why: 'a sign-in read before its install: the harness is named where its first piece is',
      pieces: [
        { id: 'b', harness: { name: 'one', part: 'sign-in' } },
        { id: 'a', harness: { name: 'one', part: 'install' } },
      ],
      want: [['one', 'a', 'b']],
    },
    {
      why: 'an install with no sign-in piece: a row, its sign-in none',
      pieces: [{ id: 'a', harness: { name: 'one', part: 'install' } }],
      want: [['one', 'a', undefined]],
    },
    {
      why: 'a sign-in with no install piece: no row, since nothing activates it',
      pieces: [{ id: 'b', harness: { name: 'one', part: 'sign-in' } }],
      want: [],
    },
    { why: 'no harness at all: no row', pieces: [{ id: 'svc' }], want: [] },
  ];
  for (const row of rows)
    await t.test(row.why, () => {
      assert.deepEqual(
        harnessChoices(row.pieces).map((c) => [c.name, c.install.id, c.signIn?.id]),
        row.want,
      );
    });
});

test('shownFixes: a piece in place shows only what takes it away, any other every fix but that, each with its index', async (t) => {
  const puts: ReadinessFix = { message: 'install it', command: 'x', startable: true, index: 0 };
  const removes: ReadinessFix = { message: 'deactivate it', command: 'y', startable: true, index: 1, kind: 'removes' };
  const typed: ReadinessFix = { message: 'type it', command: 'z', startable: false, kind: 'typed' };
  const piece = (state: ReadinessPiece['state'], fixes: ReadinessFix[]): ReadinessPiece => ({
    name: 'n',
    area: 'harness',
    state,
    message: 'm',
    fixes,
  });
  const rows: Array<{ why: string; piece: ReadinessPiece; want: Array<[string, number]> }> = [
    { why: 'in place: its removal alone, at its index', piece: piece('met', [puts, removes]), want: [['deactivate it', 1]] },
    { why: 'missing: what puts it there, never the removal', piece: piece('missing', [puts, removes]), want: [['install it', 0]] },
    { why: 'unknown: as missing', piece: piece('unknown', [typed, removes]), want: [['type it', 0]] },
    { why: 'in place with nothing to take it away: none', piece: piece('met', [puts]), want: [] },
  ];
  for (const row of rows)
    await t.test(row.why, () => {
      assert.deepEqual(
        shownFixes(row.piece).map(({ fix, i }) => [fix.message, i]),
        row.want,
      );
    });
});
