/**
 * The command table: every entry of the in-process CLI with a handler, each defined in its feature's folder and listed here once
 * (`COMMANDS`), and the whole table (`TABLE`) with those the CLI runs itself (`RAN`).
 */
import { APPROVE } from '../gate/commands.verb.ts';
import { ROUTE } from '../gate/route.verb.ts';
import { RETRY } from '../retry/commands.verb.ts';
import { REFRESH } from '../revisions/commands.verb.ts';
import { SAY } from '../say/commands.verb.ts';
import { LS } from '../list/commands.verb.ts';
import { CEILINGS } from '../cap/commands.verb.ts';
import { AGENTS, AGENT_CARD } from '../roster/commands.verb.ts';
import { CLOSEOUT, LOGS, SHOW, TOLD, TRIES, TRY } from '../object/commands.verb.ts';
import { STATS } from '../stats/commands.verb.ts';
import { SERIES } from '../series/commands.verb.ts';
import { PAGES } from '../steps/commands.verb.ts';
import { CANCEL } from '../cancel/commands.verb.ts';
import { HOLD } from '../wait/commands.verb.ts';
import { PRUNE, RM } from '../forget/commands.verb.ts';
import { TICK, UP } from '../tick/commands.verb.ts';
import { WATCH } from '../watch/commands.verb.ts';
import { AGENTS_SOURCES } from '../sources/sources.verb.ts';
import { type Command, type Ran, tableEntry } from './entry.verb.ts';
import { AGENTS_CUSTOM } from '../custom/custom.verb.ts';
import { LIBRARY_ENTRIES } from '../agents/library.verb.ts';
import { SKILL_ENTRIES } from '../skills/skills.verb.ts';
import { WORKFLOW_ENTRIES } from '../workflows/workflows.verb.ts';
import { FACTORIES } from '../factory/factory.verb.ts';
import { TEMPLATES } from '../template/template.verb.ts';
import { INBOXES } from '../inbox/commands.verb.ts';
import { LABELS } from '../labels/commands.verb.ts';
import { CONCLUDED, START } from '../start/commands.verb.ts';
import { PAUSE_ENTRIES } from '../pause/pause-timeout.verb.ts';
import { SUBSCRIBE, UNSUBSCRIBE } from '../subscription/subscription.verb.ts';
import { PASSES } from '../meter/passes.verb.ts';
import { LEVEL } from '../nemia/level.verb.ts';
import { MEMORY } from '../nemia/memory.verb.ts';
import { SERVICE_COMMANDS } from '../service/restart.verb.ts';
import { RELEASES } from '../release/upgrade.verb.ts';
import { VERSIONS } from '../release/version.verb.ts';
import { DAEMON } from '../daemon/daemon.verb.ts';
import { FRONTMATTER_REWRITE } from '../frontmatter/frontmatter.verb.ts';
import { ADMIT } from '../admission/admit.verb.ts';
import { POLICY_ENTRIES } from '../auto/auto.verb.ts';
import { CHAT_SPEAKER_ENTRIES } from '../chat/speakers.verb.ts';
import { POLICY_REACH } from '../reach/reach.verb.ts';

/** The reads of the store, in the order `nemia`'s help lists them. */
const READS: readonly Command[] = [tableEntry(SHOW), CLOSEOUT, TRIES, TRY, TOLD, LOGS, STATS];

/** The commands the CLI serves alone and runs itself, in the order `nemia`'s help lists them. */
export const RAN: readonly Ran[] = [TICK, UP, WATCH];

/** Every command with a handler defined once, in the order `nemia`'s help lists them: the in-process CLI's list of entries. */
export const COMMANDS: readonly Command[] = [
  START,
  tableEntry(CONCLUDED),
  ...INBOXES,
  ...LABELS,
  ...FACTORIES,
  ...TEMPLATES,
  tableEntry(RETRY),
  tableEntry(APPROVE),
  ROUTE,
  tableEntry(REFRESH),
  tableEntry(SAY),
  tableEntry(LS),
  ...READS,
  ...PAGES,
  CEILINGS,
  PASSES,
  SERIES,
  AGENTS,
  AGENT_CARD,
  AGENTS_SOURCES,
  AGENTS_CUSTOM,
  ...LIBRARY_ENTRIES,
  ...SKILL_ENTRIES,
  CANCEL,
  HOLD,
  RM,
  PRUNE,
  ...PAUSE_ENTRIES,
  SUBSCRIBE,
  UNSUBSCRIBE,
  LEVEL,
  MEMORY,
  ...POLICY_ENTRIES,
  POLICY_REACH,
  ...CHAT_SPEAKER_ENTRIES,
  ...SERVICE_COMMANDS,
  ...RELEASES,
  ...VERSIONS,
  DAEMON,
  FRONTMATTER_REWRITE,
  ...WORKFLOW_ENTRIES,
];

/**
 * The whole table, in the order `nemia`'s help lists them: `nemia start`, then every other command with a handler, then
 * those the CLI runs itself (`RAN`).
 */
export const TABLE: readonly (Command | Ran)[] = [...COMMANDS, ...RAN, ADMIT];
