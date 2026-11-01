/**
 * Every file of `src` that still calls the stores the Factory door is over — the factories' (`factory.store.ts`), a factory's level, rules
 * and servers — rather than yielding the door (`FactoryDoor`, `src/factories/factories.store.ts`), with how many calls do
 * (`src/factories/factories.store.test.ts`). A debt, and nothing else: a program yields the door, whose writes are checked on every layer
 * and whose memory stand-in a test gives it; a call left on the seam is a synchronous caller S5a did not convert — a start, a plan, the
 * inbox, the board's reads, the level read on every beat, the instruction and the upgrade.
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its calls of the stores the door is over, comments left out. */
export const FACTORY_DOOR_DEBT: Readonly<Record<string, number>> = {
  'src/agents/library.verb.ts': 1,
  'src/applied/applied.verb.ts': 2,
  'src/cli/start.ts': 1,
  'src/cli/writers.ts': 1,
  'src/factory/factory.verb.ts': 1,
  'src/factory/instruction.verb.ts': 2,
  'src/folder/workflows.verb.ts': 4,
  'src/folder/write.store.ts': 2,
  'src/inbox/inbox.store.ts': 3,
  'src/inbox/inbox.verb.ts': 3,
  'src/level/levels.verb.ts': 1,
  'src/nemia/keep.verb.ts': 1,
  'src/nemia/level.verb.ts': 2,
  'src/plan/plan.verb.ts': 1,
  'src/revisions/pin.verb.ts': 1,
  'src/rules/rules.verb.ts': 2,
  'src/schedule/listed.store.ts': 1,
  'src/servers/servers.verb.ts': 3,
  'src/servers/sign-in.verb.ts': 1,
  'src/skills/skills.verb.ts': 1,
  'src/start/start.verb.ts': 2,
  'src/summary/reads.verb.ts': 1,
  'src/tick/told.verb.ts': 1,
  'src/trust/trust.verb.ts': 1,
  'src/upgrade/upgrade.verb.ts': 1,
};
