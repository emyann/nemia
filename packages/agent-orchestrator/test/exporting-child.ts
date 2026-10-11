/**
 * A process that exports as a daemon does, for a test to start: `node exporting-child.ts <span>` provides `telemetryLayer` over its own
 * environment, runs one span named `<span>`, waits for what it holds to be posted, and prints the collector it read, or `none`.
 */
import { Effect } from 'effect';
import { otlpOf } from '../src/telemetry/telemetry.ts';
import { exportedNow, telemetryLayer } from '../src/telemetry/telemetry.store.ts';

const [name = 'unnamed'] = process.argv.slice(2);

await Effect.runPromise(
  Effect.void.pipe(Effect.withSpan(name), Effect.andThen(exportedNow), Effect.provide(telemetryLayer(process.env)), Effect.scoped),
);
console.log(`collector: ${otlpOf(process.env)?.url ?? 'none'}`);
