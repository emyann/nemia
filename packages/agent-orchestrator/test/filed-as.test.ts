/**
 * The runtime's refusal of a step's filed config, said as the step's (`filedRefusal`): after the line a person wrote, the flag a retry
 * typed, or none, where two fields refuse together or the field came from no line of the step's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configRefusal } from '../src/runtime-client.ts';
import { filedRefusal, lineOf, type FiledFlags, type FiledStep } from '../src/keys/index.ts';

/** The refusal of `config` on `harness`, said as the step `implement`'s, its lines read off `step` and `flags`. */
const said = (harness: string, step: FiledStep, config: Parameters<typeof configRefusal>[1], flags?: FiledFlags): string | undefined =>
  filedRefusal((c) => configRefusal(harness, c), 'implement', config, lineOf(step, flags));

test("a field the runtime refuses alone is named by the step's line it comes from, and the field it is filed as", () => {
  assert.equal(
    said('claude', { model: 'opus', effort: 'ultra' }, { model: 'opus', effort: 'ultra' }),
    `implement: \`effort: ultra\` (filed as \`effort\`): ${configRefusal('claude', { effort: 'ultra' })}`,
  );
  assert.match(
    said('codex', { sandbox: 'nope' }, { permissionMode: 'nope' })!,
    /^implement: `sandbox: nope` \(filed as `permissionMode`\): /,
  );
  assert.match(
    said('codex', { context: 200_000 }, { contextTokens: 200_000 })!,
    /^implement: `context: 200k` \(filed as `contextTokens`\): /,
  );
});

test('REFUSED: a mount refused of a step with both `writable:` and `reads: inbox` quotes both lines, as `mounts` is filed from both', () => {
  const mounts = [
    { path: '/srv/web(1)', readOnly: false },
    { path: '/srv/wf/inbox', readOnly: true },
  ];
  assert.match(
    said('claude', { writable: ['web(1)'], reads: ['inbox'] }, { mounts })!,
    /^implement: `writable: web\(1\)` and `reads: inbox` \(filed as `mounts`\): `mounts` gives the session /,
  );
});

test('a field a retry chose is named by the flag as typed, before the line of the step it replaces', () => {
  assert.match(said('codex', { budget: 3 }, { budgetUsd: 5 }, { budget: 5 })!, /^implement: `--budget 5` \(filed as `budgetUsd`\): /);
  assert.match(
    said('claude', { model: 'opus' }, { model: '' }, { model: '' })!,
    /^implement: `--model ''` \(filed as `model`\): `model` is empty/,
  );
});

test('REFUSED with no line: two fields that refuse only together, and a field no line of the step gave', () => {
  const together = (c: { model?: string; budgetUsd?: number }) =>
    c.model !== undefined && c.budgetUsd !== undefined ? 'a cap and a model together' : undefined;
  const config = { model: 'opus', budgetUsd: 5 };
  assert.equal(filedRefusal(together, 'implement', config, lineOf({ model: 'opus', budget: 5 })), 'implement: a cap and a model together');
  const denied = { disallowedTools: ['Bash(git commit:*)'] };
  assert.equal(said('codex', {}, denied), `implement: ${configRefusal('codex', denied)}`);
});

test('a config the runtime takes is no refusal', () => {
  assert.equal(said('claude', { model: 'opus', effort: 'high' }, { model: 'opus', effort: 'high', budgetUsd: undefined }), undefined);
});
