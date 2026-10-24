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
 * `shipped` and `ships`, on the day decision 13a retired them (`Landed` in the run core's, the api's and the board's tables): the run's
 * sense, a run's result on its base, says `landed` everywhere since that card. Every count left is the product's sense, what comes with
 * Nemia (its git place, the skills, servers and rules it lists, a default it is given with), which decision 13b renames to `builtin`
 * (the run core's `Builtin` row) and drives to zero. No old spelling is kept on purpose: nothing on disk or on the wire as input said it.
 */
export const RETIRED_COUNTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
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
    'apps/api/src/agents/skills.ts': 23,
    'apps/api/src/layer.ts': 1,
    'apps/api/src/nemia/chat.ts': 1,
    'apps/api/src/servers/servers.ts': 5,
    'apps/api/src/step/step.ts': 1,
    'apps/api/src/steps/steps.ts': 2,
    'apps/web/src/components/AgentParts.tsx': 1,
    'apps/web/src/components/AutoRules.tsx': 1,
    'apps/web/src/components/FactoryServers.stories.tsx': 6,
    'apps/web/src/components/FactoryServers.tsx': 16,
    'apps/web/src/components/SkillPicker.tsx': 1,
    'apps/web/src/lib/api/auto.ts': 3,
    'apps/web/src/lib/api/factories.ts': 2,
    'apps/web/src/lib/api/library.ts': 2,
    'apps/web/src/lib/api/skills.ts': 2,
    'apps/web/src/lib/api/workflows.ts': 2,
    'apps/web/src/lib/gate.ts': 1,
    'apps/web/src/lib/skills.ts': 7,
    'apps/web/src/routes/agents_.skills.$from.$skill.tsx': 2,
    'packages/agent-orchestrator/place/memory/index.ts': 1,
    'packages/agent-orchestrator/src/agents/agents.ts': 1,
    'packages/agent-orchestrator/src/auto/auto.verb.ts': 3,
    'packages/agent-orchestrator/src/check/check.ts': 2,
    'packages/agent-orchestrator/src/daemon/daemon.ts': 1,
    'packages/agent-orchestrator/src/factory/factory.store.ts': 1,
    'packages/agent-orchestrator/src/nemia/keep.verb.ts': 1,
    'packages/agent-orchestrator/src/nemia/level.store.ts': 1,
    'packages/agent-orchestrator/src/nemia/nemia.ts': 2,
    'packages/agent-orchestrator/src/nemia/verbs.verb.ts': 1,
    'packages/agent-orchestrator/src/place/place.store.ts': 3,
    'packages/agent-orchestrator/src/place/shipped.store.ts': 1,
    'packages/agent-orchestrator/src/runner.ts': 3,
    'packages/agent-orchestrator/src/servers/clients.ts': 2,
    'packages/agent-orchestrator/src/servers/index.ts': 1,
    'packages/agent-orchestrator/src/servers/servers.store.ts': 2,
    'packages/agent-orchestrator/src/servers/sign-in.verb.ts': 1,
    'packages/agent-orchestrator/src/skills/skills.verb.ts': 3,
    'packages/agent-orchestrator/src/subscription/former-wake.ts': 4,
    'packages/agent-orchestrator/src/workflow/step-file.ts': 1,
  },
  ships: {
    'apps/api/src/agents/skills.ts': 14,
    'apps/api/src/app.ts': 1,
    'apps/api/src/commands/routes.ts': 1,
    'apps/api/src/guard.ts': 1,
    'apps/api/src/nemia/nemia.ts': 1,
    'apps/api/src/servers/servers.ts': 4,
    'apps/web/src/components/AgentParts.tsx': 1,
    'apps/web/src/components/AutoRules.tsx': 1,
    'apps/web/src/components/FactoryServers.stories.tsx': 1,
    'apps/web/src/components/FactoryServers.tsx': 4,
    'apps/web/src/components/Markdown.tsx': 1,
    'apps/web/src/components/NemiaSettings.tsx': 2,
    'apps/web/src/components/ServerSignIn.tsx': 1,
    'apps/web/src/components/SkillForm.tsx': 1,
    'apps/web/src/components/SkillPicker.tsx': 1,
    'apps/web/src/lib/api/auto.ts': 3,
    'apps/web/src/lib/api/factories.ts': 2,
    'apps/web/src/lib/api/library.ts': 1,
    'apps/web/src/lib/api/skills.ts': 2,
    'apps/web/src/lib/skills.ts': 1,
    'apps/web/src/routes/agents_.skills.$from.$skill.tsx': 1,
    'packages/agent-orchestrator/src/agents/custom.store.ts': 1,
    'packages/agent-orchestrator/src/auto/auto.store.ts': 3,
    'packages/agent-orchestrator/src/auto/auto.ts': 6,
    'packages/agent-orchestrator/src/auto/auto.verb.ts': 2,
    'packages/agent-orchestrator/src/nemia/level.store.ts': 5,
    'packages/agent-orchestrator/src/nemia/level.verb.ts': 2,
    'packages/agent-orchestrator/src/place/shipped.store.ts': 2,
    'packages/agent-orchestrator/src/servers/clients.ts': 2,
    'packages/agent-orchestrator/src/servers/servers.store.ts': 1,
    'packages/agent-orchestrator/src/servers/servers.ts': 1,
    'packages/agent-orchestrator/src/servers/sign-in.verb.ts': 1,
    'packages/agent-orchestrator/src/skills/read.store.ts': 5,
    'packages/agent-orchestrator/src/skills/skills.store.ts': 2,
    'packages/agent-orchestrator/src/skills/skills.verb.ts': 4,
    'packages/agent-orchestrator/src/sources/copy.store.ts': 1,
    'packages/agent-orchestrator/src/sources/copy.verb.ts': 2,
    'packages/agent-orchestrator/src/start/start.verb.ts': 1,
    'packages/agent-orchestrator/src/template/check.ts': 1,
    'packages/agent-orchestrator/src/template/draft.ts': 2,
    'packages/agent-orchestrator/src/template/template.store.ts': 1,
    'packages/agent-orchestrator/src/template/template.verb.ts': 1,
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
};
