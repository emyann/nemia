/**
 * `wf start` asks the runtime of each local step's first filing's config (`configRefused`, which `stepsToStart` asks last, before any
 * run is written) and refuses one it refuses, in its words, after the step's line they come from. The load's own refusals still say
 * every one of these first for a step as its file writes it, so each case loads a folder the load takes and changes the step's value
 * after it, as a step the load never judged. `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const ROOT = scratch('wf-start-config-');
process.env.WF_ROOT = ROOT;
const { configRefused, stepsToStart } = await import('../src/start/start.verb.ts');
const { configRefusal } = await import('../src/runtime-client.ts');
const { LANDING_DENIED } = await import('../src/ending/ending.ts');

/** A folder of `implement` and its ending `ship`, which lands on its check once approved. */
function folder(name: string): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'implement.md'), '---\neffort: high\n---\nBuild it.\n');
  fs.writeFileSync(path.join(dir, 'ship.md'), `---\nafter: implement\nworkspace: main\ngate: true\ncheck: npm test\n---\nShip it.\n`);
  return dir;
}

const places = { home: ROOT };
const GATED = folder('gated');

test("REFUSED: a step's value its harness refuses, named by the line it comes from and the field it is filed as", () => {
  const steps = stepsToStart(GATED, true, places).map((s) => (s.name === 'implement' ? { ...s, effort: 'ultra' } : s));
  assert.equal(
    configRefused(steps, places, []),
    `implement: \`effort: ultra\` (filed as \`effort\`): ${configRefusal('claude', { effort: 'ultra' })}`,
  );
});

test('REFUSED: an ending on a harness that cannot be denied the commit it lands, named by the step alone, as no line of it gave the deny list', () => {
  const steps = stepsToStart(GATED, true, places).map((s) => (s.name === 'ship' ? { ...s, harness: 'codex' } : s));
  const why = configRefused(steps, places, []);
  assert.equal(why, `ship: ${configRefusal('codex', { disallowedTools: [...LANDING_DENIED] })}`);
});

test("REFUSED: a gate given at start makes an ending land on its check, and its harness's refusal of the deny list follows it", () => {
  const steps = stepsToStart(GATED, true, places).map((s) => (s.name === 'ship' ? { ...s, gate: undefined, harness: 'codex' } : s));
  assert.equal(configRefused(steps, places, []), undefined, 'not gated, the ending lands nothing and is denied nothing');
  assert.match(configRefused(steps, places, ['ship'])!, /^ship: .*is a deny list/);
});

test('a step on a remote agent is asked nothing, and a folder whose every step its harness takes is no refusal', () => {
  const steps = stepsToStart(GATED, true, places);
  assert.equal(configRefused(steps, places, []), undefined);
  const remote = steps.map((s) => (s.name === 'implement' ? { ...s, harness: 'a2a:reviewer', effort: 'ultra' } : s));
  assert.equal(configRefused(remote, places, []), undefined);
});
