# The fetch tried under Seldon's frozen fence

Three probes, each `node workflows/build/probe.ts start <label> --settings <file> -- <prompt>`, the prompt the same in all
three: *Use WebFetch on https://code.claude.com/docs/en/agent-sdk/sessions.md and reply with its first heading, then stop. Do
not use any other tool.* Each `--settings` file carried Seldon's fence as the run freezes it — the `allowedTools` of
`workflows/agents/seldon.md` and of `workflows/build/design.md` as `permissions.allow`, their `disallowedTools` as
`permissions.deny`, and `"defaultMode": "dontAsk"`. All three probes were stopped before this step signed off.

| probe | fence | what happened |
| --- | --- | --- |
| `fenced` | Seldon's, as committed | fetched: `Received 21.8KB (200 OK)`, first heading **Work with sessions** |
| `barred` | Seldon's, every `WebFetch(domain:…)` allow taken away | fetched all the same |
| `denied` | Seldon's, plus `WebFetch` on the deny list | refused, nothing received |

So the fetch the card asks for is allowed under the fence as committed, and the session does read the fence: the deny bit.
The middle row isolates nothing, and says why a probe cannot stand in for the step: a `--bg` session asks a person when no
allow reaches a call, and this account's mode answers for them. Seldon's step is a job (`-p`), where a mode that never asks
denies whatever it would ask — the case `packages/agent-orchestrator/test/agent-fences.test.ts` models, and the case the six
`denied: WebFetch` lines in the feed came from.
