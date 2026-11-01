/**
 * The spellings the glossary tables retire, still said in the code, counted per file (`glossary.test.ts`), each count only shrinking.
 *
 * `RETIRED_COUNTS`: each retired spelling, lower-cased, and each file under the paths of a table that retires it that says it, whole and
 * in any case, by its path from the repository root, with the times it says it. A table's paths take in the contexts nested in them,
 * so the run core's `wf` is counted in the whole of `packages/agent-orchestrator`; where two tables retire one spelling, its files are
 * counted once, under that spelling, over the paths of both — the run core's and the api's `wf`, the api's source saying none today.
 *
 * `wf`, on the day the guard was written: 47 words in 19 files of the orchestrator, every one of them on the card that renames the
 * command (`slice-4: the command table and the rename to nemia`). Some are a value stored and read back as it was written (a daemon
 * file's `by: 'wf up'`), the check's marker `wf <name>:`, the alias's own words, the run's branches `wf/<run>/<step>` and git's identity
 * `user.name=wf`; that card says which of them go.
 *
 * It only shrinks: a change that takes a retired spelling out of a file lowers its count here in the same commit, and takes the entry
 * off where none is left; a new retired row in a table adds the counts of its files the day it lands. A count is never raised, nor a
 * file added for an old spelling.
 *
 * `stated`, `unsigned` and `checkoutMcp`, on the day the runtime retired them: each a stored key or literal an older runtime's journal
 * holds, read by `upgrade` and named in its doc (`journal.ts`), the stored schema (`event-schema.ts`) and the filing door's
 * `RENAMED_ARGS` (`args.ts`). They stay while a journal on disk may hold them.
 *
 * `NeedsHuman`, `RoundsExhausted`, `WaitingForSlot`, `WaitingForCheckout`, `WaitingForPause` and `CheckDenied`, on the day the feed
 * retired them (a wait on a person said by the `Awaiting*` codes, a wait on a thing by `Waiting` and `on`): each a key of
 * `FORMER_REASONS` in `former-reason.ts`, which reads a line on disk and a stored selector that still names one. They stay while a feed
 * or a subscription on disk may hold them.
 *
 * `shipped` and `ships`, on the day decision 13a retired them (`Landed` in the run core's, the api's and the board's tables): the run's
 * sense, a run's result on its base, says `landed` everywhere since that card; the product's sense, what comes with Nemia (its git place,
 * the skills, servers and rules it lists), says `builtin` since decision 13b (its Builtin row in the same three tables). The one count left
 * is the api's former address of a builtin skill, `/api/skills/shipped/<name>`, which answers a permanent redirect to its `builtin` address
 * (`FORMER_BUILTIN`, `skills.ts`): it stays while a link or a bookmark may still name it.
 *
 * `accept`, on the day decision 7 retired it (`Approve` in the run core's table): `nemia accept` is `nemia approve` of a loop out of
 * rounds. What is left is the former spelling kept on purpose (`RENAMED`, read by admission and named in its doc), the record's names
 * for what a loop's end writes (`acceptRun`, `acceptAsk`, the `accept-<step>-<n>` file), and the word's other senses (a trust accepted,
 * a level's words). The decision's `accept` offer label is `approve` since slice B, as its `merge` is `refresh`.
 *
 * `nudge`, on the day decision 7's slice C retired it (`Try` in the run core's table): a retry's mode and a try's cause are `continue`.
 * What is left is the former spelling kept on purpose — `FORMER_MODES` (`retry-ask.ts`), through which a record and an ask file read, and
 * `RENAMED_FLAGS` and `RENAMED_VALUES` (`command.ts`), through which `nemia retry --nudge` and an api body's `"mode": "nudge"` are
 * taken with a hint. It stays while a record, an ask file or a caller may still say it. The runtime's own `nudge` is another sense,
 * outside the table's paths.
 *
 * `agents remove`, `workflows remove`, `policy drop`, `agents try`, `template check` and `factory plan`, on the day decision 8 retired them
 * (its rows Rm, Run an agent, Lint and Diff in the run core's table): each is left once, as its own row of `RENAMED` (`command.ts`), which
 * still runs a line that says it, with a hint naming the new spelling. They stay until a later card removes the former spellings.
 *
 * `claude-detached` and `claude-bg`, on the day every Claude Code session moved onto the Agent SDK: each a harness name a former
 * runtime took, said now only by the refusal that names the fix to a task or an engine still giving it (`harness-refusal.ts`,
 * `options.ts`). They stay while a caller may still write them.
 */
export const RETIRED_COUNTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'agents remove': {
    'packages/agent-orchestrator/src/command/command.ts': 1,
  },
  'agents try': {
    'packages/agent-orchestrator/src/command/command.ts': 1,
  },
  'factory plan': {
    'packages/agent-orchestrator/src/command/command.ts': 1,
  },
  'policy drop': {
    'packages/agent-orchestrator/src/command/command.ts': 1,
  },
  'template check': {
    'packages/agent-orchestrator/src/command/command.ts': 1,
  },
  'workflows remove': {
    'packages/agent-orchestrator/src/command/command.ts': 1,
  },
  accept: {
    'packages/agent-orchestrator/src/admission/admission.ts': 1,
    'packages/agent-orchestrator/src/brief/brief-sections.ts': 2,
    'packages/agent-orchestrator/src/command/command.ts': 2,
    'packages/agent-orchestrator/src/gate/commands.verb.ts': 3,
    'packages/agent-orchestrator/src/gate/form.verb.ts': 1,
    'packages/agent-orchestrator/src/gate/gate.ts': 1,
    'packages/agent-orchestrator/src/nemia/level.verb.ts': 1,
    'packages/agent-orchestrator/src/record/record.store.ts': 4,
    'packages/agent-orchestrator/src/record/record.ts': 3,
    'packages/agent-orchestrator/src/round/round.ts': 7,
    'packages/agent-orchestrator/src/round/round.verb.ts': 2,
    'packages/agent-orchestrator/src/status/status.ts': 1,
    'packages/agent-orchestrator/src/trust/trust.ts': 1,
  },
  nudge: {
    'packages/agent-orchestrator/src/command/command.ts': 4,
    'packages/agent-orchestrator/src/retry/retry-ask.ts': 2,
  },
  needshuman: {
    'packages/agent-orchestrator/src/former-reason/former-reason.ts': 2,
  },
  roundsexhausted: {
    'packages/agent-orchestrator/src/former-reason/former-reason.ts': 1,
  },
  waitingforslot: {
    'packages/agent-orchestrator/src/former-reason/former-reason.ts': 1,
  },
  waitingforcheckout: {
    'packages/agent-orchestrator/src/former-reason/former-reason.ts': 1,
  },
  waitingforpause: {
    'packages/agent-orchestrator/src/former-reason/former-reason.ts': 1,
  },
  checkdenied: {
    'packages/agent-orchestrator/src/former-reason/former-reason.ts': 1,
  },
  wf: {
    'packages/agent-orchestrator/place/git/verbs/handoff.ts': 2,
    'packages/agent-orchestrator/place/git/verbs/make.ts': 2,
    'packages/agent-orchestrator/src/admission/admission.ts': 2,
    'packages/agent-orchestrator/src/brief/brief.ts': 1,
    'packages/agent-orchestrator/src/brief/handed.verb.ts': 1,
    'packages/agent-orchestrator/src/check/check.ts': 7,
    'packages/agent-orchestrator/src/cli/flags.ts': 3,
    'packages/agent-orchestrator/src/cli/main.ts': 1,
    'packages/agent-orchestrator/src/config/config.store.ts': 1,
    'packages/agent-orchestrator/src/daemon/daemon.store.ts': 1,
    'packages/agent-orchestrator/src/forget/forget.ts': 2,
    'packages/agent-orchestrator/src/forget/forget.verb.ts': 2,
    'packages/agent-orchestrator/src/place/place.store.ts': 3,
    'packages/agent-orchestrator/src/start/store-root.ts': 1,
    'packages/agent-orchestrator/src/status/status.ts': 1,
    'packages/agent-orchestrator/src/workflow/validate.ts': 1,
    'packages/agent-orchestrator/src/workspace/workspace.ts': 6,
    'packages/agent-orchestrator/src/workspace/worktree.store.ts': 3,
  },
  shipped: {
    'apps/api/src/agents/skills.ts': 1,
  },
  stated: {
    'packages/agent-runtime/src/core/engine/journal.ts': 3,
    'packages/agent-runtime/src/core/event-schema.ts': 1,
  },
  unsigned: {
    'packages/agent-runtime/src/core/engine/journal.ts': 1,
    'packages/agent-runtime/src/core/event-schema.ts': 1,
  },
  checkoutmcp: {
    'packages/agent-runtime/src/core/engine/journal.ts': 1,
    'packages/agent-runtime/src/core/event-schema.ts': 1,
    'packages/agent-runtime/src/harness/args.ts': 1,
  },
  'claude-detached': {
    'packages/agent-runtime/src/service/harness-refusal.ts': 3,
  },
  'claude-bg': {
    'packages/agent-runtime/src/service/options.ts': 3,
  },
};
