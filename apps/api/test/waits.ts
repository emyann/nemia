/**
 * The wait a test of the api makes on its event, the runtime's one copy: `until`, the `bell` its source rings, and `WAITED`, the bound a
 * waiting test takes (`packages/agent-runtime/src/waits/`).
 *
 * The api's tests take it from `agent-runtime/testing` (`CLAUDE.md`). A test beside the code, under `src/`, reads it here instead: the
 * layer's lint block refuses `agent-runtime` to every file under `apps/api/src/`, a test among them.
 */
export { bell, until, WAITED } from 'agent-runtime/testing';
export type { Bell, Truthy, Waiter } from 'agent-runtime/testing';
