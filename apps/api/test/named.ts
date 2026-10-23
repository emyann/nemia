/**
 * That the api said something — a refusal's `error`, a line — and that it names each of `facts`: the command, flag or field its fix
 * names, and the ids, steps and values the behaviour turns on. Never its sentence, whose words are nobody's to check
 * (`tools/guards/test/test-rules.test.ts`). A copy of the orchestrator's `names` (`packages/agent-orchestrator/test/assessed.ts`): a
 * package's test reaches into no other package's files.
 */
import assert from 'node:assert/strict';

/** That `said` is text naming each of `facts`. */
export const names = (said: unknown, ...facts: string[]): void => {
  assert.equal(typeof said, 'string', `the api said nothing: ${JSON.stringify(said)}`);
  for (const fact of facts) assert.ok((said as string).includes(fact), `${JSON.stringify(said)} does not name ${JSON.stringify(fact)}`);
};
