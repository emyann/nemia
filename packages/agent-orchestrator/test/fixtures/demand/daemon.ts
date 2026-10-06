/**
 * The daemon a test starts on demand in place of the api: `nemia up` on the store its `WF_ROOT` names, beating every 200ms, which ends
 * itself after a minute should the test that started it die before it is stopped.
 */
import { main } from '../../../src/cli/main.ts';

setTimeout(() => process.kill(process.pid, 'SIGTERM'), 60_000).unref();
await main(['up', '200']);
