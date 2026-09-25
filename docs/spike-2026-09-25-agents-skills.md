# Spike, 2026-09-25: an HKB agent in Claude Code's own agent format

A measurement. No shipped code changed. The owner's design of agents and skills (decided 2026-09-25) depends on these answers:

- an HKB agent file is a strict superset of Claude Code's subagent file, converted when it is spawned;
- the agent's body is **appended** to Claude Code's own system prompt and never replaces it;
- the skills composed on an agent are Claude Code skills (`SKILL.md` folders), and the agent's A2A card lists skills generated from them;
- agents and skills live in the HKB store and in a repository, and the repository wins on a name clash.

Each finding below gives its command, what was observed and where it was read, and one line on what it means for the design.

## How it was measured

- **Claude Code 2.1.282**, `claude -p`, `--model haiku` (`claude-haiku-4-5-20251001`). 40 jobs and two probes in all, costing about $3 in total.
- **Where the jobs ran:** this run's own worktree, `~/.agent-workflows/worktrees/measure-how-an-hkb-agent-can-sqky/implement`. That is a
  worktree of a trusted repository, so the project's `.claude/settings.json` applied. Fixtures were kept in `/tmp/spike-sqky`, outside
  the worktree and outside `~/.claude/`.
- **The base command.** Every job below is this base plus the flags its finding names:

  ```
  claude -p "<prompt>" --model haiku --output-format stream-json --verbose --permission-prompts none --strict-mcp-config < /dev/null
  ```

  `--strict-mcp-config` with no config keeps the MCP servers out of the counts.
- **The evidence** is in the step's artifacts, in `spike-evidence.tgz`:
  - every exact command, one `<name>.cmd` per job;
  - the stream-json each job printed, one `<name>.jsonl` per job;
  - the fixtures;
  - the prompt each job recorded, in `prompts/`. This is copied out of the transcripts, which the stream-json does not carry and which
    Claude Code cleans up. For each job there is a `<name>.prompt.json`: the last `prompt_snapshot`'s blocks in full, its tools, its
    `cliPrefix`, and the block and character counts. There is also a `<name>.snap.txt` from `snap.sh`, and s7's subagent has a
    `.subagent-*.prompt.json` of its own.
  - The transcripts themselves are left out, since their `session_context` names the owner's account.
- **Fixtures.**
  - `body.md`: *"HKB-APPEND-MARKER-7731. You are the note writer of an HKB team. End every reply with the word PINEAPPLE on its own line."*
  - `body2.md`: the same, with marker `5520` and the word `MANGO`.
  - The agent `x` from `--agents`: prompt `AGENT-PROMPT-MARKER-3388 …`, which ends replies with `KIWI`.
  - The plugin `plugin/`: `.claude-plugin/plugin.json` (`{"name":"hkb-spike",…}`) and `skills/code-word/SKILL.md`. The skill's
    frontmatter holds `name`, `description`, `tags` and `examples`. Its body is *"SKILL-BODY-MARKER-9043. The team's code word is ZEBRA-4417."*
  - `writer.md`: *"WRITER-MARKER-2210. You are the release writer of an HKB team. You write short, plain announcements for people who use HKB.
    No emojis, no hashtags."* The agent `w` in `agents-w.json` has the same text as its `prompt`.
  - The plugin `style-plugin/` (`name` `hkb-style`): two output styles in `output-styles/`, with the writer's text as their body.
    `hkb-writer.md` says `keep-coding-instructions: false` (marker `STYLE-MARKER-6161`), and `hkb-writer-keep.md` says `true` (`6162`).
- **How the prompt was seen.** Claude Code records the system prompt a conversation sends in its transcript
  (`~/.claude/projects/<cwd>/<session>.jsonl`), as an attachment of type `prompt_snapshot`. The record holds `systemPrompt`, an array of
  blocks, the `tools` sent and `cliPrefix`. This is what `--system-prompt-snapshot on`, the default, records and replays. `snap.sh`
  prints the blocks and looks for each marker in them. Everything else was read from:
  - the job's own stream-json: the `system/init` line (`permissionMode`, `tools`, `skills`, `plugins`) and each `tool_use` and `tool_result`;
  - the result's `structured_output`, `permission_denials` and `usage`;
  - the `usage` on each assistant line, one per API request;
  - `--debug-file` for loader warnings.
- **Token counts** are the prompt a request sent: `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.

The default prompt as recorded here has 15 blocks and 28,087 characters. In order:

- `You are an interactive agent …`
- `# System`, `# Doing tasks`, `# Executing actions with care`, `# Using your tools`, `# Tone and style`
- the dynamic boundary
- `# Text output`, the pronoun rule and `# Session-specific guidance`
- `# auto memory` (12,827 characters, the owner's memory index), `# Environment` (cwd, platform, models) and `# Context management`
- two short closing blocks

## 1. The system prompt

**F1. `--append-system-prompt` keeps the whole default prompt and adds the body after it, as one more block. The file form does the same.**

| job | extra flags | blocks recorded | default present | body present | reply |
|---|---|---|---|---|---|
| e1 | `--permission-mode dontAsk` | 15 | yes | — | `OK` |
| e2 | `… --append-system-prompt "$(cat body.md)"` | 16 | yes, blocks 0–14 unchanged | block 15 (120 characters) | `OK` `PINEAPPLE` |
| e3 | `… --append-system-prompt-file /tmp/spike-sqky/body.md` | 16 | yes | block 15 (121: the file's newline) | `OK` `PINEAPPLE` |

One side effect: with an appended prompt, the recorded `cliPrefix` changes. Without one it is *"You are a Claude agent, built on Anthropic's
Claude Agent SDK."*, and with one it is *"You are Claude Code, Anthropic's official CLI for Claude, running within the Claude Agent SDK."*

*Consequence:* spawn an agent's body as `--append-system-prompt-file <file>`. The default prompt the owner wants kept is kept, block for block.

**F2. `--agents '{"x":{…,"prompt":<body>}}' --agent x` replaces the default prompt entirely.**

e4, `--permission-mode dontAsk --agents '{"x":{"description":"Spike agent x","prompt":"AGENT-PROMPT-MARKER-3388. …KIWI…"}}' --agent x`:

- The record holds **one block, the agent's 94 characters**. It has no `# Doing tasks`, no `# Environment` (cwd, platform) and no memory.
  The reply is `OK` `KIWI`.
- Not everything goes. The tools are the same 11, and the user turn carries the same attachments (`instructions`, the CLAUDE.md files;
  `environment`; `skill_listing`; `agent_listing_delta`) as the default run.

*Consequence:* an agent run as `--agent` works without Claude Code's guidance or its environment block. An HKB agent's body must not
become an `--agents` `prompt` on the main thread.

**F3. `--agent x` with `--append-system-prompt` brings none of the default back.**

e5, the e4 flags plus `--append-system-prompt "$(cat body2.md)"`: the record holds 2 blocks, the agent's prompt and then the appended
body. There is no default block in it. The reply is `OK` `KIWI` `MANGO`.

*Consequence:* no combination of the two flags gives "the agent's body on top of the default". Append is the only form that does.

## 2. Skills from a plugin directory

**F4. `--plugin-dir` needs no manifest. The directory name, or the manifest's `name`, becomes the skills' namespace.**

- s1, `--plugin-dir /tmp/spike-sqky/plugin` (with `.claude-plugin/plugin.json`): `plugins` lists
  `{"name":"hkb-spike","source":"hkb-spike@inline","version":"0.0.1"}`, and `skills` lists `hkb-spike:code-word`.
- s4, `--plugin-dir /tmp/spike-sqky/bare-plugin` (only `skills/code-word/SKILL.md`): the debug log says *"--plugin-dir … is one plugin:
  skills at its top marks it"*. The plugin loads as `bare-plugin`, and its skill as `bare-plugin:code-word`.
- The `skill_listing` attachment gives the skill as one line, name and description only:
  `- hkb-spike:code-word: Gives the team's secret code word. Use when anyone asks for the code word.`

A plugin skill is **always namespaced**, `<plugin>:<skill>`. So a store plugin's `code-word` and a repository's `.claude/skills/code-word`
are two different skills to Claude Code, and it resolves no clash between them.

*Consequence:* HKB can hand its composed skills to a job as one plugin directory it writes. It should name that directory, or the
manifest, so the namespace is chosen on purpose. "The repo wins on a clash" is a rule HKB applies when it composes; Claude Code will not.

**F5. Under `-p`, a plugin skill is invocable through the Skill tool, in `dontAsk` with no allow rule.**

s2 ran with `--permission-mode dontAsk --plugin-dir …/plugin` and the prompt *"Use the Skill tool to invoke the hkb-spike:code-word skill …"*:

- `tool_use` `Skill {"skill":"hkb-spike:code-word"}`, and its `tool_result` *"Launching skill: hkb-spike:code-word"*.
- The body arrives as a meta user message, *"Base directory for this skill: /tmp/spike-sqky/plugin/skills/code-word\n\nSKILL-BODY-MARKER-9043. …"*.
  The frontmatter is stripped.
- The result is `ZEBRA-4417`, and `permission_denials` is `[]`.

*Consequence:* a fenced (`dontAsk`) step can use its skills with nothing added to `allowedTools:`, provided its `tools` include `Skill`.

**F6. Naming the skill in the appended prompt makes the session use it.**

s3 ran with the s1 flags plus `--append-system-prompt "Before any reply, use the hkb-spike:code-word skill and put what it gives you on
the first line of your reply."`, and the prompt *"Reply with the single word OK."* It called `Skill hkb-spike:code-word`, and the result
was `ZEBRA-4417` `OK`. The control is s1: the same prompt with the plugin and no such line called no tool and replied `OK`.

*Consequence:* an agent's body can say which of its skills to use and when, and a haiku job follows it.

**F7. A `SKILL.md` whose frontmatter carries extra keys (`tags`, `examples`) loads with no warning or error.**

s1's `--debug-file` is 192 lines, with these warnings and errors:

- a lock already held;
- the built-in telemetry plugin's `userConfig`;
- a dropped telemetry event;
- the skill listing over budget (F9);
- `/sys/hypervisor/uuid`;
- *"auto mode disabled: model claude-haiku-4-5-20251001 does not support auto mode"*.

None names the skill or its frontmatter, and the log says *"Loaded 1 skills from plugin hkb-spike"*. The extra keys reach nothing the
model sees: the listing carries the description, and the injected body starts after the frontmatter.

*Consequence:* the A2A card's `tags` and `examples` can live in the `SKILL.md` frontmatter itself. Claude Code ignores them and HKB reads them.

**F8. An agent's `skills:` field preloads a plugin skill for a subagent, but not for the main thread started with `--agent`.**

| job | how the agent `y` ran | `skills:` | skill body in the transcript | answer to "what is the code word? (no tools)" |
|---|---|---|---|---|
| s5 | `--agents '{"y":{…,"skills":["hkb-spike:code-word"]}}' --agent y` | namespaced | no | `UNKNOWN` |
| s6 | the same with `"skills":["code-word","look"]` | bare, one plugin and one project skill | no (neither body) | `UNKNOWN` |
| s7 | the main thread spawns `y` with the Agent tool (`--agents` as in s5, no `--agent`) | namespaced | yes, in `subagents/agent-*.jsonl`, as `<command-name>hkb-spike:code-word</command-name>` and the body | `ZEBRA-4417` |

*Consequence:* since HKB runs its agent on the main thread, the `skills:` field of a converted agent is inert there. HKB preloads a skill
itself, either by appending the skill's body after the agent's (F14 gives the cost) or by naming it in the body for the session to invoke
(F6). The `skills:` field works only for an agent Claude Code runs as a subagent.

**F9. Every skill the owner has installed is listed to every job, and the listing is over its budget.**

s1's debug log says *"Skill listing over budget: 26 skills, 13786 chars > 8000 budget — descriptions will be truncated"*. The listing
includes the user-level plugins (`typesafe`, `anthropic-skills:*`) and `~/.claude/skills`.

k1 ran with the s1 flags plus `--setting-sources project,local`. The user plugins and user skills were gone and 16 skills were sent, with
no budget warning, while `--plugin-dir`'s `hkb-spike:code-word` was still listed. That flag also drops the user's settings: their default
mode, their allow and deny rules, and their MCP servers.

*Consequence:* a job's own skills compete with the owner's personal ones for 8,000 characters of listing. Before relying on the listing to
surface an agent's skills, decide whether a job reads user settings at all. This is left open here.

## 3. The agent's fence against the flags

**F10. `--permission-mode` wins over the agent's `permissionMode` either way. With no flag, the agent's `permissionMode` is not applied
on the main thread, even when no settings name a mode.**

Each job asked the model to Write `spike-probe.txt` in the cwd. The file was removed after each run. The stream reports the mode twice:
on the `system/init` line and on a `system/status` line after it, and the two can differ (m1).

| job | agent `permissionMode` | `--permission-mode` | settings read | init, then status `permissionMode` | the Write |
|---|---|---|---|---|---|
| m1 | `acceptEdits` | none | all: the owner's `defaultMode` is `auto` | `auto`, then `default` | denied: *"requires approval, and this session has no approval surface"* |
| m4 | `acceptEdits` | none | `--setting-sources project,local`: no `defaultMode` anywhere | `default` | denied, the same words |
| m2 | `acceptEdits` | `dontAsk` | all | `dontAsk` | denied: *"… running in don't ask mode"* |
| m3 | `dontAsk` | `acceptEdits` | all | `acceptEdits` | written |

- m1 alone cannot tell "the agent's mode is ignored" from "the user's `defaultMode` outranks it". m4 settles that: with nothing naming a
  mode, the session ran `default`, not the agent's `acceptEdits`. The project's `.claude/settings.json` sets no `defaultMode`, and there
  is no `settings.local.json`.
- m1's `auto` became `default` for the reason F20 gives.

*Consequence:* HKB passes the fence as `--permission-mode` itself, as the runtime already does on every spawn. A `permissionMode` left in a
converted agent does nothing on the main thread.

**F11. The tools are the intersection of the agent's `tools` and `--tools`.**

| job | agent `tools` | `--tools` | init `tools`, and the tools recorded as sent |
|---|---|---|---|
| t0 | `["Read"]` | none | `Read` |
| t1 | `["Read"]` | `Read,Bash` | `Read` |
| t2 | `["Read","Bash"]` | `Read` | `Read` |

*Consequence:* either list can only narrow. An agent whose `tools` leave out `Skill` cannot use its skills, whatever the step says.

**F20. On haiku, `auto` falls back to `default` without a word, whether a flag or the settings ask for it. Under `-p`, `default` denies
every call that needs approval.**

m5 ran with `--permission-mode auto` and no agent. That is what the runtime passes to a step with no `permissionMode:`
(`packages/agent-runtime/src/runner.ts`, `r.config?.permissionMode ?? 'auto'`). It asked for the same Write as F10.

- The `system/init` line reads `permissionMode: auto`. The next line, `system/status`, reads `permissionMode: default`.
- The Write was denied: *"It requires approval, and this session has no approval surface — nobody can answer a permission prompt
  here — so it was denied automatically."* It is on `permission_denials`, and the reply was `DENIED`.
- Nothing refused the job. The exit code was 0, stderr was empty, and the only trace is the debug log's line (F7): *"auto mode disabled:
  model claude-haiku-4-5-20251001 does not support auto mode"*.
- m1 fell back the same way from the owner's `defaultMode: auto`.

*Consequence:* a haiku step left on the runtime's default mode runs `default`, and every call it would have been approved in `auto`
comes back denied, with the job reporting success. HKB should give a haiku agent an explicit mode, or refuse `auto` on a model that
lacks it. It should read the `system/status` line, not only `init`, to know the mode a job actually runs.

## 4. The runtime's flags with the two new ones

**F12. The runtime's flags behave the same with `--append-system-prompt-file` and `--plugin-dir` added.**

j1 ran the runtime's `claude` job shape with both new flags added:

```
claude -p --input-format stream-json --output-format stream-json --verbose --permission-prompts none \
  --disallowedTools 'Bash(date:*)' --allowedTools 'Edit(**)' --permission-mode dontAsk --strict-mcp-config --model haiku \
  --json-schema '{"type":"object","properties":{"outcome":{"type":"string","enum":["done","blocked"]},"summary":{"type":"string"}},"required":["outcome","summary"]}' \
  --append-system-prompt-file /tmp/spike-sqky/body.md --plugin-dir /tmp/spike-sqky/plugin < j1.in
```

`j1.in` is one user message on stdin, as the worker writes it. It asks the job to run `date` and `touch spike-bash-probe` with Bash,
invoke `hkb-spike:code-word`, and then close out.

- `date` was refused by the deny rule (*"Permission to use Bash with command date has been denied."*), and `touch` by `dontAsk`.
  Both are on `permission_denials`, and no file was made.
- The skill ran.
- The closeout arrived as `structured_output`: `{"outcome":"done","summary":"Code word: ZEBRA-4417. Both Bash calls were denied — …"}`.
- The record holds the 15 default blocks, the body as block 16, and `StructuredOutput` among the tools sent.

*Consequence:* adding the two flags changes nothing the runtime reads: the closeout, the denials and the session id.

**F13. A `--resume`d session keeps the appended body it was started with. It need not be passed again, and a different one passed on
resume is ignored unless the snapshot is turned off.**

- **r1** resumed j1's session with the same runtime flags and **no** `--append-system-prompt`, and asked which word to end replies with
  and what marker the instructions carry. It answered *"Word: PINEAPPLE. Marker: HKB-APPEND-MARKER-7731."* The word proves nothing,
  since j1's last assistant message ends with `PINEAPPLE`. The marker is the evidence: `7731` appears nowhere in j1's history, only in
  the appended body.
- **A second chain.** j2 was `"Reply with the single word OK." --append-system-prompt-file body.md`, and it replied `OK` `PINEAPPLE`, so
  that word sits in the history of every fork of it too. Each resume forked from j2 (`--resume <j2> --fork-session`), so each one sees
  only j2's turn. Each asked *"list every word your system instructions tell you to end replies with, and every HKB-APPEND-MARKER code
  they carry"*. The evidence is the marker, which no history holds, and the cache:

| job | on resume | answer | prompt tokens: written to cache / read from cache |
|---|---|---|---|
| r5 | no append | `PINEAPPLE`, `…-7731` | 256 / 47,291 |
| r6 | `--append-system-prompt-file body2.md` | `PINEAPPLE`, `…-7731` (body2 ignored) | 0 / 47,547 |
| r4 | `--append-system-prompt-file body2.md --system-prompt-snapshot off` | `MANGO`, `…-SECOND-5520` only | 33,842 / 13,694 |

- r5 and r6 name marker `7731`, which is in their system prompt and in none of their history. r6's full cache hit shows that the
  system prompt sent was byte for byte j2's.
- r4 answered `MANGO` and `5520` alone, although `PINEAPPLE` sat in its history. Its cache write shows that a new prompt was rendered,
  with body2 in place of body.
- r2 and r3 resumed the r1 chain with body2, the snapshot on and off. Both answered PINEAPPLE, but by then r1's answer, marker
  included, sat in their history, so they prove nothing either way. They are kept in the evidence, but the table above replaces them.
- With the snapshot off, nothing new is recorded. A forked transcript still carries the parent's `prompt_snapshot`, and that record is
  then not what was sent.

*Consequence:* the runtime need not pass the body on `--resume`, and passing it is harmless. An agent edited between a session and its
resume does not reach the resumed session while the snapshot is on. `--system-prompt-snapshot off` makes the new body win. It replaces the
old body rather than adding to it, and costs a cache rewrite of the whole prompt.

## 5. The cost

**F14. The default system prompt is about 6.5k tokens, and an appended body costs what its own text costs. On haiku, 1,339 characters
of `implementer.md`'s body cost 355 tokens.**

Each count is the first request's prompt tokens (input + written to cache + read from cache), with the prompt *"Reply with the single word OK."*
and `--permission-mode dontAsk`, in the same cwd, within one hour:

| job | what changed | prompt tokens | against the baseline |
|---|---|---|---|
| c1 / e1 | nothing: the default prompt | 47,254 | — |
| e2 | + the 120-character marker body | 47,301 | +47 |
| c2 | + `workflows/agents/implementer.md`'s body (1,339 characters, frontmatter stripped) | 47,609 | **+355** |
| c3 | + that body and `look`'s `SKILL.md` body appended after it (7,558 characters) | 49,340 | **+2,086** (look alone ≈ +1,731) |
| s1 | + a plugin with one skill (one listing line, in a listing already truncated) | 47,271 | +17 |
| c4 | the Skill tool invoking `look`: the request after the call | 47,277 → 49,272 | **+1,995** (the body, the call, its result and the turn) |
| c5 | `--agent impl` with implementer's body as the `prompt` (the default replaced) | 41,045 | −6,209 |
| t0 | `--agent z` with a 16-character prompt and `tools: ["Read"]` | 27,665 | the other 10 tools ≈ 13,065 (against e4's 40,730) |

- **The default system prompt is about 6,560 tokens**: c2 (47,609) less c5 (41,045), which carry the same body.
- **The rest of the ~47k is fixed whatever the agent says.** The tools cost about 13k. The CLAUDE.md files, about 92k characters of this
  repository's, arrive in the first user turn, with the listings.
- **Price.** The prompt is cached, so each later request in a session reads it back at the cache-read price. On haiku 4.5 that is
  $1 per million input tokens and $2 per million written to the 1-hour cache, reading back at $0.10. e1's $0.0687 checks out on those
  prices. So implementer's 355 tokens cost about $0.0007 on a session's first request and about $0.00004 on each request after.
- **Cache sharing.** The first job with a new body wrote about 33.6k tokens to the cache and read 13.7k: the part before the body,
  shared with every session. A second job with the same body within the hour read all of it (j2: 0 written, 47,291 read). `--agent`
  shares nothing with a default session: c5 read only 11,303, and e4 read 0.

*Consequence:* keeping the default prompt costs about 6.5k tokens per session, written to cache once and read cheaply after. An agent's
body costs about 1 token per 3.8 characters. A skill preloaded by appending costs its whole body on every request, while a skill invoked
on demand costs its body only from the turn it is called, plus about 260 tokens for the call. So preload only the skills an agent always
needs, and let the rest be listed and invoked.

## 6. Replace mode for an agent that does not code

The owner asked what replacing the default prompt keeps and loses for an agent whose work is not code. Each job below was given the
same brief, *"Draft a post of at most 200 characters announcing HKB 2.4, which lets an agent carry its own skills. Reply with the post
only."*, with `--permission-mode dontAsk`. It is one job for each form, so the replies are one sample each.

**F15. `--system-prompt-file` and `--agents … --agent` replace the prompt in the same way. The system prompt is left with only the
brief, while the tools, CLAUDE.md and the environment still arrive. For this brief the reply was no worse.**

| job | how | recorded prompt | prompt tokens (written / read) | reply |
|---|---|---|---|---|
| n0 | the default | 15 blocks, 28,087 characters | 47,296 (29,621 / 17,665) | 158 characters |
| n1 | `--system-prompt-file writer.md` | 1 block, 148 characters: the file | 40,756 (29,443 / 11,303) | 119 characters |
| n2 | `--agents agents-w.json --agent w` | 1 block, 148 characters: the agent's `prompt` | 40,768 (29,409 / 11,349) | 108 characters |

All three replies were plain, under 200 characters, with no emoji or hashtag. n0's was *"HKB 2.4: agents carry skills. Assign a skill
to an agent card once; every workflow using that agent inherits the skill. …"*. n1's was *"HKB 2.4: agents now carry their own
skills. …"*.

- **What still loads in both replace modes:**
  - The same 11 tools. Their definitions, about 13k tokens (F14), are now the largest part of the prompt the agent chose.
  - The first user turn carries the same attachments as n0:
    - `instructions`: the CLAUDE.md files, 92,592 characters here. They are read from the cwd, so a writer run in this repository
      reads the contributor guide.
    - `environment`: working directory, worktree, git repository, platform, shell and OS version.
    - `model`, `date` and `deferred_tools_delta`.
    - `skill_listing` (8,600 characters) and `agent_listing_delta`.
  - `session_context` shrinks from 1,093 to 323 characters. The git status is dropped, and only a line naming the account is kept.
- **What is lost** is every section of the default system prompt:
  - `# System`, with its note that tool results may carry injected instructions;
  - `# Executing actions with care`, the rules on hard-to-reverse and outward-facing actions;
  - `# Doing tasks`, `# Using your tools`, `# Tone and style` and `# Text output`;
  - `# Session-specific guidance`;
  - `# auto memory`, so the session has no memory;
  - the `# Environment` block, with its list of models;
  - `# Context management`.
- **The saving** is the default system prompt, 6,540 tokens (47,296 − 40,756), which is F14's 6,560 again. Output tokens varied
  from 1,026 to 3,303 across the five jobs of sections 6 and 7, with no pattern by form.

*Consequence:* replace mode costs a non-coding agent the rules on careful action and on injected instructions, and saves about 14% of its
first prompt. What remains is set by the tools and the cwd, so an agent that goes without the default should also narrow `--tools` and
run where no CLAUDE.md speaks to coders.

## 7. Output styles as a middle ground

**F16. Under `-p`, an output style is chosen with `--settings '{"outputStyle":"<plugin>:<style>"}'`. A bare style name is echoed back
and then silently not applied.**

The style lived in a plugin (`--plugin-dir /tmp/spike-sqky/style-plugin`, in `output-styles/`), so nothing was written into the repository.

- `"outputStyle":"hkb-style:hkb-writer"` applied the style: the prompt changed as F17 says, and the init line's `output_style` read
  `hkb-style:hkb-writer`.
- The first probe gave the bare name, `"outputStyle":"hkb-writer"`. The init line read `output_style: "hkb-writer"`, but the recorded
  prompt was the unchanged default, 15 blocks. Nothing warned.

*Consequence:* HKB would name the style with its plugin's namespace, and must confirm it by the recorded prompt, not by the init line. A
project style in `.claude/output-styles/`, which may take a bare name, was not measured.

**F17. `keep-coding-instructions: false` removes `# Doing tasks` and nothing else, and rewords one sentence. `true` changes only that sentence.**

| job | style | blocks | characters | against the default |
|---|---|---|---|---|
| n0 | none | 15 | 28,087 | — |
| o1 | `hkb-style:hkb-writer`, `keep-coding-instructions: false` | 14 | 24,825 | `# Doing tasks` (3,319 characters) gone; the intro reworded |
| o2 | `hkb-style:hkb-writer-keep`, `keep-coding-instructions: true` | 15 | 28,144 | the intro reworded (+57 characters) |

- The intro changes in both styles from *"You are an interactive agent that helps users with software engineering tasks."* to *"You are an
  interactive agent that helps users according to your "Output Style", which describes how you should respond to user queries."*
- Otherwise o1 keeps every section, in order: `# System`, `# Executing actions with care`, `# Using your tools`, `# Tone and style`,
  `# Text output`, the pronoun rule, `# Session-specific guidance`, `# auto memory`, `# Environment` and `# Context management`.
- So the answer to the owner's question is yes, and narrower than asked. Only `# Doing tasks` is the software-engineering section. Every
  coding-flavoured line elsewhere stays, such as *"Prefer dedicated tools over Bash"* and *"Reference code as `file_path:line_number`"*.

**F18. The style's own text is not in the system prompt. It arrives in the first user turn, as an attachment.**

o1's transcript records `{"type":"output_style_instructions","style":{"name":"hkb-style:hkb-writer","prompt":"STYLE-MARKER-6161. You are
the release writer …"}}` beside an `output_style` attachment. `STYLE-MARKER-6161` is in none of the 14 system blocks, and o2's 6162
behaves the same.

| job | prompt tokens (written / read) | against n0 | reply |
|---|---|---|---|
| o1 | 46,669 (29,730 / 16,929) | −627: `# Doing tasks` gone (about 750), the style's text added | 104 characters |
| o2 | 47,421 (33,710 / 13,701) | +125: the reworded intro and the style's text | 119 characters |

*Consequence:* a style is a small cut, about 750 tokens of 47k. Its text is weighted as an instruction in the user turn, not as a system
prompt, so an agent's body belongs in the append (F1) and not in a style.

**F19. A style and `--append-system-prompt-file` compose.**

o3 used o1's style and `--append-system-prompt-file body.md`, with *"Reply with the single word OK."*. The record holds 15 blocks,
24,946 characters: o1's 14 blocks and then the body (24,825 + 121). The reply was `OK` `PINEAPPLE`.

*Consequence:* the middle ground for an agent that does not code is `keep-coding-instructions: false` and its body appended. It drops
`# Doing tasks`, keeps the safety sections, memory and environment, and saves about 750 tokens. Replace mode (F15) saves 6.5k and keeps none of them.

## The operator's figures, and whether they reproduce

The operator recorded these before this run (2.1.282, haiku, `attachment.systemPrompt` in the transcript). Beside each is the figure
measured here, which is with `--strict-mcp-config`.

| what | the operator's | here | reproduced |
|---|---|---|---|
| the default prompt | 28,446 characters, the sections listed above, auto memory 12.9k | 28,087, 15 blocks, auto memory 12,827 (e1, n0) | yes. The 359-character gap was not traced; MCP servers kept out by `--strict-mcp-config` would explain it, but that was not checked |
| `--append-system-prompt` | 28,490: the default and the text | 28,207 and 28,208: the default and the 120- or 121-character body (e2, e3) | yes |
| `--agents` with `--agent` | 44 characters, the agent's prompt only | 94 (e4) and 42 (s5): the agent's prompt only | yes |
| a project subagent reached through the Agent tool | 1,371 characters: its body and a short subagent preamble, not Claude Code's prompt | 1,322 characters in 4 blocks (s7's `subagents/agent-*.jsonl`) | yes |

For the last row, s7's subagent record holds 4 blocks:

- the agent's 42-character prompt, *"AGENT-PROMPT-MARKER-3388. You are agent y."*;
- 336 characters saying that messages from the launching agent direct the work but are not the user's consent;
- 895 characters of notes: use absolute paths, share absolute paths in the final answer, no emojis, no colon before a tool call, and
  do not write report `.md` files;
- a 49-character total-tokens line.

There is no Claude Code section in it. The subagent's first user turn still carries `instructions` and `environment`. The gap from 1,371
is the length of the operator's own agent body.

## What this settles, and what it leaves

- **Settled.**
  - Append the body with `--append-system-prompt-file`. Never convert the body to `--agents` with `--agent`, which drops the default prompt (F1–F3).
  - Pass the fence as `--permission-mode` and the tools as `--tools` (F10, F11). Both already exist on the runtime's spawn.
  - Serve the skills as one `--plugin-dir` that HKB writes, whose namespace HKB chooses (F4, F5).
  - Keep the A2A fields in the `SKILL.md` frontmatter (F7).
  - Preload by appending, not by `skills:` (F8).
  - The runtime's flags and `--resume` need no change (F12, F13).
  - For an agent that does not code, there are three choices:
    - the default and the appended body;
    - an output style with `keep-coding-instructions: false`, and the appended body. It drops only `# Doing tasks`, about 750 tokens (F17, F19).
    - replace mode, which drops every section, the safety ones included, and saves about 6.5k tokens. The tools and the cwd's CLAUDE.md
      stay either way (F15).
- **Left open.**
  - Whether a style in a project's `.claude/output-styles/` takes a bare name (F16). Only a plugin's style was measured.
  - ~~Whether a job should read the owner's user-level settings, plugins and skills at all (F9).~~ Card 4: it does not; every job runs
    with `--setting-sources project,local`, and what that took from the shipped steps is said on them (F24).
  - Whether an edited agent should reach a resumed session. It does not by default, and it would take `--system-prompt-snapshot off` and a cache rewrite (F13).
  - ~~How HKB resolves a name clash between the store's skills and the repository's.~~ Card 1a: the repository's wins, and a name one
    repository has in both `workflows/` and `.claude/` is refused (`lookupRoots` in `agent-orchestrator/src/workflow-store.ts`).
  - ~~What HKB does with a haiku agent and no mode.~~ Card 1a: `auto` is refused at load on the models measured to drop it (F21).

## 8. Measured by card 1a (2026-09-25)

What the build of card 1a needed, taken on Claude Code 2.1.282 in `/tmp/f21-b5ms` (F23 in `/tmp/b5ms-live.L74o`), outside every worktree and outside
`~/.claude/`.

### F21. Which models run `auto`

One job per model, each asked for one Write in its cwd:

```
claude -p "Use the Write tool to create the file probe-<m>.txt containing the word OK. …" --model <m> --permission-mode auto \
  --output-format stream-json --verbose --permission-prompts none --strict-mcp-config --debug-file <m>.debug < /dev/null
```

| `--model` | the model the job ran | its `permissionMode` lines | the Write |
|---|---|---|---|
| `haiku` | `claude-haiku-4-5-20251001` | `auto`, then `default` | denied |
| `claude-haiku-4-5-20251001` | the same | `auto`, then `default` | denied |
| `claude-haiku-4-5` | `claude-haiku-4-5` | `default`, `default` | denied |
| `claude-sonnet-4-5` | `claude-sonnet-4-5` | `default`, `default` | denied |
| `sonnet`, `claude-sonnet-5` | `claude-sonnet-5` | `auto` | written |
| `opus`, `claude-opus-5-5` | `claude-opus-5-5` | `auto` | written |
| `fable`, `claude-fable-5-1` | `claude-fable-5-1` | `auto` | written |
| `claude-opus-4-1` | `claude-opus-5-5` | `auto` | written |

Every job exited 0. Each denied one wrote, in its debug file only, *"auto mode disabled: model <id> does not support auto mode"*, and its
result listed the Write under `permission_denials`; nothing on stdout or stderr said the mode had changed. `claude-opus-4-1` ran as
`claude-opus-5-5`, so the id was taken as an alias. So `auto` runs on the current sonnet, opus and fable, and is dropped to `default`
on haiku, by alias or id, and on `claude-sonnet-4-5`.

*For the design:* the load refuses `auto`, written or left to the runtime's default, on the four names measured to drop it and on
their dated forms (`AUTO_UNSUPPORTED` in `agent-orchestrator/src/workflow.ts`), naming `acceptEdits` or `dontAsk` with rules. A model
not measured is let through: the refusal is for what is known to fail.

### F22. A flag the CLI does not have

```
claude -p x --frobnicate < /dev/null                                             # exit 1, stderr: error: unknown option '--frobnicate'
claude -p x --append-system-prompt-file /nonexistent/x.md --output-format json  # exit 1, stderr: Error: Append system prompt file not found: /nonexistent/x.md
```

Nothing on stdout in either case, and no session. *For the design:* the owner chose no new path for it (plan gate, try 3): such a job is
an ordinary `failed` end with its exit code, and the detached worker already writes the harness's stderr into the attempt's log, which
`logs` reads (`agent-runtime/test/claude-code.test.ts` proves it with a fake that answers as the CLI does).

### F23. A run's own step, rendered, keeps the default prompt with the agent's body after it

The live proof card 1a was asked for: a real `wf start` and `wf tick`, the orchestrator of this branch, on a store and a folder team made
for it (`mktemp -d /tmp/b5ms-live.XXXX`). The step `write` names the agent `scribe`: `model: haiku`, `permissionMode: dontAsk`,
`allowedTools: Edit(**)`, `tools: Read, Write, Edit, Skill`, `skills: code-word`, and a body that opens `LIVE-APPEND-MARKER-4471` and
asks it to load its skill and write the code word into `note.md`. The skill `code-word` is the store's, its body
*"SKILL-BODY-MARKER-8812. The team's code word is OTTER-3391."*

- `wf start` wrote `runs/<id>/agents/write/prompt.md` (the body, then *"Your skills, each loaded with the Skill tool by its name when you
  need it: `hkb-scribe:code-word`."*) and the plugin `hkb-scribe/` with `.claude-plugin/plugin.json` and `skills/code-word/SKILL.md`.
- The engine's task was filed with `config.claude` = `{ appendSystemPromptFile: …/prompt.md, pluginDir: [ …/hkb-scribe ] }`, and its brief
  opened on the step's own note and `## What was asked for`, with no line of the body.
- The transcript's last `prompt_snapshot` holds **16 blocks, 27,729 characters: the 15 of the default prompt, `You are an interactive
  agent …` through `# Context management` and its two closing blocks, then the body as block 15** (304 characters, the prompt file's whole
  text). `cliPrefix` is the appended form's, as in F1.
- The session called `Skill` with `hkb-scribe:code-word`, then `Write`, and `note.md` holds `OTTER-3391`. It settled `done`, $0.03.

*For the design:* the flags reach Claude Code as the spike measured them, from the run's own files: the default is kept, the body follows it,
and a skill given by `skills:` loads under its plugin's namespace in a `dontAsk` job whose `tools:` allow `Skill`.

## 9. Measured by card 4 (2026-09-25)

Card 4 runs every job with `--setting-sources project,local` (`claudePrintFlags` in `agent-runtime/src/runner-claude-detached.ts`). Before
that was trusted, this section measured what a job loses on Claude Code 2.1.282: short `claude -p` probes in the run's own worktree, which
Claude Code trusts, and one run of `dev-planned`, end to end. The measurement cost $3.76.

### F24. What a job loses without the user's settings, and what a shipped step had depended on

**What the user's settings held.** Only the key names are recorded here, and no value that names the account. `~/.claude/settings.json` holds:

- `model: opus[1m]` and `effortLevel: xhigh`, also under `modelSettings`;
- `permissions.defaultMode: auto`, and one `allow` rule, for a plugin's own scripts. It has no `deny` rules and no `additionalDirectories`;
- `enabledPlugins`: `typesafe` and one plugin from the official marketplace;
- `attribution: { commit: "", pr: "" }`;
- `autoMode.environment`: 24 lines of a generated profile, mostly *None configured*, which describe another project of the owner's and
  name the home directory as the trusted repository;
- `env` (`BROWSER`), `skillOverrides`, and some UI keys.

There are no `hooks`, `statusLine` or `outputStyle`, and no `~/.claude/CLAUDE.md`. `~/.claude/skills` holds three entries, and the synced
`anthropic-skills:*` come from the account.

**The probes.** Each probe was run once without the flag and once with it (`--output-format stream-json --verbose --permission-prompts none
--strict-mcp-config --no-chrome --mcp-config .mcp.json`, plus what each row names). The costs are rounded.

| question | without the flag | with `--setting-sources project,local` |
|---|---|---|
| the init line (haiku, `dontAsk`) | 29 skills; plugins `typesafe`, `agents-md`, `telemetry` | 19 skills: the eight `anthropic-skills:*`, `archify` and `typesafe:typesafe-ai` are gone; plugins `agents-md`, `telemetry` |
| the model of a job that names none (the ui agents) | `claude-opus-5-5[1m]` | `claude-opus-5-5`. Both report a 1,000,000-token `contextWindow`, and a step caps it with `--autocompact` all the same |
| auto memory; `~/.claude/CLAUDE.md` | `memory_paths.auto` set, and `# Memory` in the prompt | the same. There is no user CLAUDE.md to lose |
| a commit (haiku, `bypassPermissions`, a scratch repository with no CLAUDE.md) | `Add a` | `Add a` + `Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>` |
| the same commit, the session in this checkout | — | the attribution reminder is in the prompt; the model left the trailer off only because CLAUDE.md says so. With `attribution` in `.claude/settings.json`, no reminder is given at all |
| trust and the project's allow rules (`dontAsk`) | — | `git log -1` and `node --test …` ran, `npm --version` was denied, and nothing said *Ignoring … permissions.allow* |
| auto mode writing into the run's `artifacts/implement` (sonnet): Write, and `mkdir -p … && cp …` | both written | both written |
| card 1a's `--plugin-dir` style and skill, with `--settings '{"outputStyle":"hkb-probe:no-coding"}'` | — | `output_style: hkb-probe:no-coding`, `hkb-probe:probe-skill` listed, `# Doing tasks` gone. Without `--settings` it stays (the control) |

**The run.** One run of `dev-planned`, on a scratch store (`mktemp -d /tmp/card4-live.XXXX`) with this branch's `wf`. The card was *add
`docs/card4-probe.md`*, and `--repo` was a `git worktree` of the repository on a throwaway branch, so the ship's merge landed there and the
owner's `main` was never touched. Every attempt's argv carries `--setting-sources project,local`:

| step | agent | model | mode | skills / plugins / MCP | denials | end |
|---|---|---|---|---|---|---|
| plan | planner | `claude-opus-5-5` | `dontAsk` | 19 / `agents-md`, `telemetry` / `playwright` | none; ran `git ls-files` | signed off, $0.48 |
| implement | implementer | `claude-opus-5-5` | `auto` | the same | none; ran `npx turbo run test` and committed | check passed, $0.51 |
| review | reviewer | `claude-opus-5-5` | `dontAsk` | the same | none; ran `git diff` | signed off, $0.47 |
| ship | shipper | `claude-opus-5-5` | `auto` | the same | none | the run's check passed and it committed the merge, $0.50 |

No commit carried a trailer. The worktrees were under `/tmp` and trusted, as their repository is. For the baseline, recent runs in the
owner's store were read while they still read the user's settings: their `dontAsk` roles were already denied compound `cd …; …`, `node -e`
and piped commands. The user's single allow rule covers none of those, so none is new. `note`, `dev`, `dev-build` and `ui` were not run.
The `note` roles name their model, mode and `allowedTools:`. `ui` uses the same roles as `dev`, but two of its agents named no model.

**What depended on the user's settings, and where it is said now:**

- **The commit trailer.** Only the user's `attribution` kept Claude Code from asking for one. The repository's `.claude/settings.json` says
  it now. Another repository a run works on says it in its own settings, or its commits carry the trailer.
- **The ui agents' model.** `ui-implementer` and `ui-reviewer` named none, so they ran on the user's `opus[1m]`. They say `model: opus` now,
  as every other role does.
- **Effort.** Every shipped agent names its `effort:`. A step that names none now gets Claude Code's default rather than `xhigh`.

The mode, tools, allow and deny rules, MCP servers and budget were already passed explicitly, so none of them moved.

*For the design:* a job reads the checkout's `.claude/settings.json` and `settings.local.json` and what the runtime's flags give. It reads
nothing of `~/.claude/` but auto memory, which Claude Code keys by the repository. A background session (`claude --bg`, the supervisor) is
not given the flag, and reads the user's settings as before.

## 10. Measured by card 1b (2026-09-25)

### F25. The shipped agents, their procedures moved into skills, run as they did

The live proof card 1b was asked for: `wf start` and `wf up` of this branch merged with main (`node packages/agent-orchestrator/bin/wf.ts`),
so every job carried card 4's `--setting-sources project,local` beside its `--plugin-dir`, read off each job's arguments. Claude Code
2.1.282, on a store made for it (`mktemp -d /tmp/wf-1b.XXXX`, `WF_ROOT=<it>/store`), outside every worktree and outside `~/.claude/`.
Two runs, $0.36 in all:

- **The shipped `note` team**, `--workflows workflows/note` of this branch: *"Write a short note (under 150 words) on why a shell script
  should quote its variables."* The write step's `init` lists `hkb-note-writer:write-a-note`, its plugin `hkb-note-writer@inline` at
  `runs/<id>/agents/write/`, `Skill` among its tools, `dontAsk`, `claude-sonnet-5`; it called `Skill` with that name before its one
  `Write`. The review step likewise lists `hkb-note-reviewer:review-a-note`, read `note.md`, called `Skill` with it, and signed off
  `done` with the skill's `verdict` and `findings`: `needs work`, the note at about 180 words of 150 and ending on a paragraph about the
  writer's own certainty, each quoted. No denial in either.
- **A plan → implement folder** made for it in a scratch git repository (`greet.sh` and `test.sh`): `plan.md` is `dev-planned`'s file,
  `implement.md` names `agent: implementer` with `check: sh test.sh` in place of the repository's suite, and the folder's `agents/` and
  `skills/` are this branch's, copied and compared with `diff -r`. The brief: let `greet.sh` take an optional name.
  - `wf start` wrote the planner's `prompt.md` (2,100 characters): the body, then *"Your skills, each loaded with the Skill tool by its
    name when you need it: `hkb-planner:plan-a-change`."*, then `## Skill \`hkb-planner:ask-when-it-reads-two-ways\`` and the skill's
    body whole — the SKILL.md less its frontmatter, 720 characters, found in the file verbatim. The session's last `prompt_snapshot`
    holds 12 blocks, the eleventh of them the prompt file's whole text, character for character. The planner loaded
    `hkb-planner:plan-a-change` with `Skill`, read the two files, and signed off `done` with a plan. One Bash call,
    `git ls-files; echo ---; for f in …`, was denied in `dontAsk`, as a compound command is; it ran `git ls-files` alone and read the
    files with `Read`.
  - The implement step's `init` lists `hkb-implementer:implement-a-change` and `hkb-implementer:weigh-a-plan`; it called `Skill` with
    `implement-a-change` first, then `weigh-a-plan` (its brief has *From plan*), as its body says, and committed `Let greet.sh take an
    optional name`. The run's check `sh test.sh` passed: `verified ✓`.

The evidence is in the run's artifacts, `implement/f25/`: each job's arguments, the four jobs' stream-json logs, the planner's
`prompt.md`, the note and the implement diff. A first run of the same proof, before main's `--setting-sources`, read the same.

*For the design:* the procedures reach the session as the agents' bodies did — a skill to load by the session's own `Skill` call when
its body says, a preloaded one in the system prompt whole — and the note reviewer's verdict came off its skill's rules. The note's
overrun and its closing paragraph are the writer's, following wording that moved into its skill unchanged (*"mark what you are not"*),
in both runs; the reviewer caught both, which is what the team is for.

A step whose rendered folder is removed by hand has no plugin and no prompt file, so it is told each skill whole in its brief instead
(`unrendered`, since round 2 of the card): the shipper's `trial-merge-a-branch` and its `--no-commit` reach it there. Proven by the
suite, not live.
