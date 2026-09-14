# ui

For a change a person will see in the web app: implement it and look at every page it changed, then a
second engineer reads the diff and looks at the pages beside it, round again while the review finds
something worth another round, three rounds at most.

```
implement ⇄ review
```

`implement` carries `check: npm test && npm run typecheck && npm run build && npm run e2e`, uses the look
skill (`.claude/skills/look/SKILL.md`) on every page it changed before it signs off, and declares the
screenshots it read and the pages they show (`implement.schema.json`). `review` runs on Claude with
`tools: Read, Grep, Glob, Bash` in `permissionMode: dontAsk`, so it has no tool that writes and a command
`.claude/settings.json` does not allow is denied without a prompt. It is handed implement's screenshots
and pages and nothing else of implement (`input: implement`), reads the diff, and uses the look skill on
the screenshots and the pages side by side. At this repository's settings it looks through the
screenshots: in `dontAsk` a `browser_*` call is denied, because `.claude/settings.json` allows none
(measured; `packages/agent-workflows/docs/features.md`, *Shipped: looking is a skill*). Its findings are its closeout (`review.schema.json`), each
naming a file and a line or a page and a theme, and `again: true` sends the change round again:
implement's own session is continued with the findings, then a new review. After the third round, a
person decides.

Looking is a skill rather than a step, so any step may do it: a step of its own could only look at
pictures another step took, and could not send the change round again.

Every file but this README is a copy of the package's `packages/agent-workflows/workflows/ui/`, which
stays the package's shipped example, and a test holds the copy to it; the package README,
*`workflows/ui/`: a change a person will see*, says more.

```bash
wf start "<what to do>" --workflows workflows/ui
```
