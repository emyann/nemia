# note

A team that needs no git repository: one agent writes a short note on what was asked, and a second reads it and
says whether it holds up. The first example of `workspace: folder` — every step says it, so the run works in
folders it makes under its own directory in the store, and never runs git.

```
write → review
```

`wf start "a note on how tides work" --workflows note`, typed anywhere: the directory it is typed in is not looked
at, and `--repo`, `--no-worktree` and `--after` are refused. `write` works in `runs/<id>/work/write`, leaves
`note.md` there and names it in its closeout, and the run collects it into the step's files beside the run's
record; its `title` and `gist` travel as data (`agents/note.schema.json`). `review` continues the same folder — a
chain does — reads the note, and hands back a `verdict` and its `findings` (`agents/note-review.schema.json`),
changing nothing. Neither step has a `check:`: a note has no suite, so each is unverified, on its own word, and
`wf decide` says so.

Nothing here reads or sends anything outside the machine: neither agent has a web tool, and the writer writes
only in its folder. Both run in `permissionMode: dontAsk`, which every step of a folder team must
(`validateFolderMode`): a folder is nobody's checkout, nobody is there to answer a prompt, and in a mode that can
ask a call outside the folder can stop the session for ever. `dontAsk` denies it with no prompt instead, and
the session reads the refusal and carries on — so the writer, which that mode would deny its own `note.md`, is
given `allowedTools: Edit(**)`, a glob against the folder it is in. One rule is enough for Write and Edit both: Claude
Code matches a file write against `Edit` rules alone, whatever tool made it, and a `Write(…)` rule is taken and
never matched (which is why `allowedTools:` refuses one). When the note has been read, `wf rm <run>` forgets the run
with its folders and files.
