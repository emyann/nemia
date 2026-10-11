/**
 * `agent-runtime/testing`: what a test of a layer above the runtime is given in place of the engine. `testEngine()` is the `Engine`
 * service kept by hand in a layer, new at each call, with what it was asked to read back (`src/service/test-engine.ts`), held to the
 * real engine by the walks of `test/engine-walks.ts`. For tests alone: no file of a `src` or a `bin`, in any package, imports it
 * (`test/contract.test.ts`, `test/layout.test.ts`), and its own files start nothing and name no harness (`test/testing-door.test.ts`).
 */
export { testEngine } from './service/index.ts';
export type { Printed, TestEnd, TestEngine, TestFiling, TestTask } from './service/index.ts';
