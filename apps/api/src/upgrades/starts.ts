/**
 * The app's one start of an upgrade at a time (`UpgradeStarts`): a semaphore of one permit, held by the app's layer (`liveOf`, app.ts) as
 * `ReadMemo` is, so two starts that arrive together are judged one after the other — the second reads the first's task filed and is
 * refused `Conflict` (`startUpgrade`'s in-flight rule) — and never both filed. One api process serves a store (its lease), so the app's
 * semaphore is the store's.
 */
import { Context, Layer, Semaphore } from 'effect';

/** The semaphore an upgrade's start is judged and filed under (`POST /api/upgrades`, upgrades.ts): one permit, one per app. */
export class UpgradeStarts extends Context.Service<UpgradeStarts, Semaphore.Semaphore>()('api/UpgradeStarts') {
  static readonly live: Layer.Layer<UpgradeStarts> = Layer.sync(UpgradeStarts)(() => Semaphore.makeUnsafe(1));
}
