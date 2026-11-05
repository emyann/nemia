# intake

Turn a loose idea into an intent someone can build from, and route it to the workflow that builds it. Iris, a product engineer,
interviews the person who had the idea, a round of questions at a time, and signs off with the intent once they share an
understanding. Her closeout says too whether the intent needs a design (`needsDesign`, `yes` or `no`, by
[`route.schema.json`](route.schema.json)). The condition `next` reads that answer and proposes the route; the person approves the
intent and its route together at its gate.

```
intake → next ─ build → to-build   (a card for build)
              └ quick → to-quick   (a card for quick)
```

- `intake` is Iris's interview. It holds no gate of its own: the gate is on `next`, so the intent is approved with the route it takes.
- `next` is a condition: it runs no agent, and its table answers the route from `intake.needsDesign` — `yes` to `build`, a change
  that needs a design and a spec a person approves first; `no` to `quick`, a change the intent settles, whatever its size.
- `to-build` and `to-quick` are workflow nodes: the one on the route taken files a card with `workflow:` its workflow and `from:`
  this run, which the factory starts as any card, and reads `sent`; the other reads `skipped`. The run ends once the card is filed.
  The factory must have both workflows attached (`nemia factory attach <factory> build quick`).

## Confirm or change the route

At the gate, the run's page shows the intent and the route `next` proposes.

- To take both as they are: `nemia approve <run> next`.
- To change the intent: `nemia retry <run> intake --message "<what to change>"`. Iris takes the interview up again, and `next`
  proposes its route anew from her new closeout.
- To change the route and keep the intent: `nemia route <run> next <build|quick>`, then `nemia approve <run> next`. A person's route
  wins over the table's for the try `next` is on.

Once a card is filed, the route is taken: a retry of `next` is refused, and the routed run is a run of its own, with its own gate,
budget and landing.
