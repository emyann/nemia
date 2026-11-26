/**
 * *Ink and the one action* (`DESIGN.md`), held in its form: a filled button is the look's cut one alone, and a text action is a link,
 * so no file of the board draws a button of the kit's or shadcn's filled, as words alone, or in a variant it cannot read
 * (`buttonForms`, `stories.ts`). It needs no baseline: none is left. How many a view holds is counted where a view is drawn, by the
 * stories' preview (`overFilled`, `.storybook/filled.ts`).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';
import { files, REPO } from 'test-kit/repo';
import { buttonForms } from './stories.ts';

/** A source that imports the kit's button and shadcn's, and names a route's button, with `body` as what it draws. */
const SOURCE = (body: string) =>
  [
    "import { Button } from '@/components/ui/ds';",
    "import { Button as Shad } from '@/components/ui/button';",
    "import { routeLink } from '@/components/nav/routeLink';",
    'const RouteButton = routeLink(Button);',
    `export const X = () => <>${body}</>;`,
  ].join('\n');

test('REFUSED: a filled button of the kit or shadcn, a text action with words and a variant unread are keyed; outlined, an icon text press and the look are spared', () => {
  const at = 'apps/web/src/components/x/X.tsx';
  const keyed = (body: string) => buttonForms(at, SOURCE(body));
  assert.deepEqual(keyed('<Button onPress={go}>Go</Button>'), ['<Button filled>']);
  assert.deepEqual(keyed('<Button variant="filled">Go</Button>'), ['<Button filled>']);
  assert.deepEqual(keyed("<Button variant={x ? 'outlined' : 'filled'}>Go</Button>"), ['<Button filled>']);
  assert.deepEqual(keyed('<Button variant={v}>Go</Button>'), ['<Button variant?>']);
  assert.deepEqual(keyed('<Button {...props}>Go</Button>'), ['<Button variant?>']);
  assert.deepEqual(keyed('<Button variant="text">Skip</Button>'), ['<Button text>']);
  assert.deepEqual(keyed('<Button variant="text" aria-label="Close"><X /></Button>'), []);
  assert.deepEqual(keyed('<Button variant="text" aria-label="Close">{icon}</Button>'), []);
  assert.deepEqual(keyed('<Shad>Save</Shad>'), ['<Shad filled>']);
  assert.deepEqual(keyed('<RouteButton to="/">Home</RouteButton>'), ['<RouteButton filled>']);
  assert.deepEqual(keyed('<Button variant="outlined">Go</Button><Shad variant="outline">Go</Shad>'), []);
  assert.deepEqual(keyed('<Button>A</Button><Button>B</Button>'), ['<Button filled>'], 'once a file');
  for (const spared of ['apps/web/src/components/look/X.tsx', 'apps/web/src/components/ui/x.tsx', 'apps/web/test/x.tsx'])
    assert.deepEqual(buttonForms(spared, SOURCE('<Button>Go</Button>')), [], spared);
  assert.deepEqual(buttonForms(at, "import { Button } from './elsewhere';\nexport const X = () => <Button>Go</Button>;"), []);
});

test("no file of the board's src draws a filled button but the look's cut one, nor a text action that is no link", () => {
  const found = files()
    .filter((file) => /^apps\/web\/src\/.+\.tsx$/.test(file) && fs.existsSync(path.join(REPO, file)))
    .flatMap((file) => buttonForms(file, fs.readFileSync(path.join(REPO, file), 'utf8')).map((key) => `${file}#${key}`));
  assert.deepEqual(
    found,
    [],
    "draw a view's one main action as the look's CutPress or CutButton, every other outlined, and a text action that goes somewhere as TextLink",
  );
});
