/**
 * The orchestrator's tests' own team (`packages/agent-orchestrator/test/fixtures/team`): one workflow, `dev`, the three agents its steps
 * name and a skill for each. Nemia has no builtin team, so an api test that needs a store or a repository holding agents, skills and a
 * workflow that names them copies this one.
 */
import path from 'node:path';

/** The team's folder, laid out as a `workflows/` is: `agents/`, `skills/` and `dev/`. */
export const TEAM = path.join(import.meta.dirname, '..', '..', '..', 'packages', 'agent-orchestrator', 'test', 'fixtures', 'team');
