/**
 * The files that draw the Runs page are a list this test holds to the page's imports, and none writes a focus ring by hand: a box that
 * takes the focus takes the kit's. Their text sizes are held with the whole board's (`type.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.join(import.meta.dirname, '..', 'src');

/** The files that draw the Runs page: its route and each part of the board it mounts. */
const FILES = [
  'routes/runs.index.tsx',
  'components/run/WaitingCard.tsx',
  'components/look/StatTile.tsx',
  'components/look/CopyId.tsx',
  'components/look/CutButton.tsx',
  'components/look/CutCue.tsx',
  'components/look/CutField.tsx',
  'components/run/FlightTable.tsx',
  'components/run/FinishedTable.tsx',
  'components/workflow/WorkflowLink.tsx',
  'components/run/RunClockCell.tsx',
  'components/run/RunCostCell.tsx',
  'components/look/Breakdown.tsx',
  'components/look/Plate.tsx',
  'components/look/Sticker.tsx',
  'components/look/RunSteps.tsx',
  'components/look/Pager.tsx',
  'components/look/TextLink.tsx',
  'components/look/CutFrame.tsx',
  'components/look/CutTag.tsx',
  'components/look/ScanLines.tsx',
  'components/step/StepPreview.tsx',
  'components/field/Labels.tsx',
  'components/field/SelectorField.tsx',
  'components/agent/AgentParts.tsx',
  'components/ai-elements/code-block.tsx',
  'components/command/CommandLine.tsx',
  'components/command/CopyButton.tsx',
  'components/factory/FactoryTag.tsx',
  'components/field/FilePage.tsx',
  'components/field/widgets/FieldWidgetView.tsx',
  'components/gate/Ask.tsx',
  'components/gate/Decide.tsx',
  'components/gate/Gate.tsx',
  'components/gate/GateBrief.tsx',
  'components/gate/GateBudgets.tsx',
  'components/gate/Questions.tsx',
  'components/gate/Raise.tsx',
  'components/markdown/Markdown.tsx',
  'components/run/Artifacts.tsx',
  'components/step/Closeout.tsx',
  'components/step/DebugPanel.tsx',
  'components/step/Enough.tsx',
  'components/step/Facts.tsx',
  'components/step/MachineCanvas.tsx',
  'components/step/MachineEdge.tsx',
  'components/step/MachineNode.tsx',
  'components/step/Outcome.tsx',
  'components/step/StatusChip.tsx',
  'components/step/StepParts.tsx',
  'components/step/Told.tsx',
  'components/step/part/Fold.tsx',
  'components/step/part/PartAsks.tsx',
  'components/step/part/PartDetail.tsx',
  'components/step/part/PartGave.tsx',
  'components/step/part/PartGot.tsx',
  'components/step/part/PartHead.tsx',
  'components/step/part/PartSaid.tsx',
  'components/step/part/StepPart.tsx',
  'components/step/part/TryPicker.tsx',
  'components/time/Instant.tsx',
];

/** The files a folder's door exports from, when `at` is a folder with a door (`index.ts`): each sibling it names, as a component's file. */
function throughDoor(at: string): string[] {
  const door = path.join(SRC, at, 'index.ts');
  if (!fs.existsSync(door)) return [];
  return [...fs.readFileSync(door, 'utf8').matchAll(/from\s*'\.\/([^']+)'/g)].map(([, name]) => `${at}/${name}.tsx`);
}

test('every file that draws the Runs page is on the list: each part the route and its parts import from the board', () => {
  const reached = new Set<string>(['routes/runs.index.tsx']);
  const next = [...reached];
  while (next.length) {
    const file = next.pop()!;
    const text = fs.readFileSync(path.join(SRC, file), 'utf8');
    for (const [, mod] of text.matchAll(/from\s*'((?:\.\.?\/|@\/components\/)[^']+)'/g)) {
      const at = mod.startsWith('@/') ? mod.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(file), mod));
      if (!at.startsWith('components/') || at.startsWith('components/ui/')) continue;
      for (const found of [`${at}.tsx`, ...throughDoor(at)]) {
        if (!fs.existsSync(path.join(SRC, found))) continue;
        if (!reached.has(found)) next.push(found);
        reached.add(found);
      }
    }
  }
  reached.delete('components/nav/routeLink.tsx');
  assert.deepEqual([...reached].sort(), [...FILES].sort());
});

/** A focus ring written by hand: a ring or an outline class behind a focus state, which the kit's `focusRing` writes once for all. */
const handRings = (text: string): string[] => text.match(/(?<![\w-])(?:data-)?focus(?:-visible|-within)?:(?:ring|outline)-[\w-]+/g) ?? [];

/** The parts of the Runs page that take the focus as a box, each ringed by the kit. */
const RINGED = ['components/look/StatTile.tsx', 'components/look/Pager.tsx', 'components/look/TextLink.tsx'];

test("REFUSED: a focus ring written by hand in a file that draws the Runs page: a box that takes the focus takes the kit's ring", () => {
  for (const file of FILES)
    assert.deepEqual(handRings(fs.readFileSync(path.join(SRC, file), 'utf8')), [], `${file} writes a ring of its own: use focusRing()`);
  for (const file of RINGED)
    assert.match(fs.readFileSync(path.join(SRC, file), 'utf8'), /\bfocusRing\(\)/, `${file} takes the focus, and rings as the kit does`);
  assert.deepEqual(handRings('className="outline-none focus-visible:ring-2 focus-visible:ring-ring data-focus-visible:ring-offset-2"'), [
    'focus-visible:ring-2',
    'focus-visible:ring-ring',
    'data-focus-visible:ring-offset-2',
  ]);
  assert.deepEqual(handRings("cn('inline-flex rounded-[14px] group-data-focus-visible/cut:block', focusRing())"), []);
});
