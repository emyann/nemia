/**
 * What `land.ts` does for one condition of one land step's try, decided from what it read: the condition `turn`, the landing's one slot
 * (`turnWrite`), and the condition `landed`, on GitHub the run's pull request merged (`landWrite`) and with no remote the run's result
 * merged in the repository's own checkout (`localWrite`). Pure, reading no process and calling nothing; the laws are proved by
 * `contracts/land-write.contract.ts`, beside the template. It imports only that contract's types, by a whole `import type`, which the
 * run's type stripping erases, so the frozen copy, where no `contracts/` sits, loads nothing of it.
 */
import type { LandWrite, LocalWrite, TurnWrite } from '../../contracts/land-write.contract.ts';

export type {
  Checkout,
  LandAct,
  LandRead,
  LocalAct,
  LocalRead,
  Mergeable,
  Pull,
  TurnAct,
  TurnRead,
} from '../../contracts/land-write.contract.ts';

/**
 * What is done for the condition `turn` of a land step's try.
 * @param r What was read of the factory's landing slot and the run's pull request.
 */
export const turnWrite: TurnWrite = (r) => {
  if (!r.due || r.decided) return 'nothing';
  if (r.pull === 'merged') return 'pass';
  if (r.pull === 'other') return 'refuse';
  if (r.held || r.pull === 'none') return 'wait';
  if (!r.ours) return 'refuse';
  return r.refreshes && r.lacksBase ? 'refresh' : 'pass';
};

/**
 * What is done for the condition `landed` of a land step's try, on GitHub.
 * @param r What was read of the pull request and its context.
 */
export const landWrite: LandWrite = (r) => {
  if (!r.due || r.decided) return 'nothing';
  if (r.pull === 'merged') return r.leftOut ? 'refuse' : 'pass';
  if (r.pull !== 'open' || !r.ours) return 'refuse';
  if (r.mergeable === 'unknown') return 'wait';
  return r.mergeable === 'yes' && r.green && r.current && !r.leftOut ? 'merge' : 'refuse';
};

/**
 * What is done for the condition `landed` of a land step's try, with no remote.
 * @param r What was read of the run's result branches and the repository's checkout.
 */
export const localWrite: LocalWrite = (r) => {
  if (!r.due || r.decided) return 'nothing';
  if (r.checkout === 'ours') return 'abort';
  if (r.onBase) return 'pass';
  return r.checkout === 'ready' ? 'merge' : 'wait';
};
