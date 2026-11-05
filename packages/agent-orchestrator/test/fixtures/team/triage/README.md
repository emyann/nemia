# triage

Plan the change and say which surface it is on, then send it there: the board is built and handed to `dev` for a review of its
own, the backend is built, and a change to the docs alone ends the run at triage. The notes are written after whichever was built.

```
plan → triage ─ web ─────→ build-web ─────┐
              ├ web ─────→ handoff (sent to dev)
              ├ backend ─→ build-backend ─┴→ notes
              └ docs: ends
```

`triage` is a condition: its table reads `surface`, the field `plan.schema.json` adds to plan's closeout, and names no agent. Its
drawing, printed by `routedDiagram` (`src/summary/graph.ts`), is in `docs/model.md`.
