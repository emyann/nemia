# front-door

Route a raw card to the workflow it needs, with no gate. A person files a card the way they like — by hand, through a session, through
Nemia's agent — and plans it with sdlc's own labels (*Its labels*, below). The factory's `front-door` trigger, which sdlc ships,
queues each card in the sprint and ready to work that names no workflow on this workflow, in the order filed; such a card that names
its workflow is queued on that one, and never comes here. Iris reads the card, as a read-only judge, and chooses its route.

## Its labels

sdlc's labels are prefixed `sdlc/`, so a person tells them from their own:

| Label | Values | Meaning | Read by |
|---|---|---|---|
| `sdlc/stage` | `backlog`, `sprint` | where the card sits in the person's planning | the `front-door` trigger |
| `sdlc/state` | `refine`, `ready-to-work` | how ready the card is | the `front-door` trigger |
| `sdlc/sprint` | a week, such as `w48` | which sprint; a planning mark | nothing |

The trigger's selector is `sdlc/stage=sprint,sdlc/state=ready-to-work`: both must hold. A card with no `sdlc/stage` is in the backlog,
and a card in the backlog is never queued, whatever its state. `refine` starts nothing: it marks an idea the person knows is to be
refined. Planning a later week ahead is `sdlc/stage=backlog` with `sdlc/sprint=w49`, moved to `sdlc/stage=sprint` when the week starts
(`nemia label inbox <card> sdlc/stage=sprint --overwrite`). The door alone routes: no label routes a card past it.

```
door ─ intake  → to-intake   (the card, as given, for intake)
     ├ build   → to-build    (the card, as given, for build)
     ├ quick   → to-quick    (the card, as given, for quick)
     ├ answer  → answer      (Iris answers, changing nothing)
     └ backlog → backlog     (the card back to the backlog, unqueued)
```

- `door` is a judge (`route: judge`): a session on a fence that only reads (`Read`, `Grep`, `Glob`), which chooses one route by the
  *Routing* rules of the factory's `RULES.md` and says why in `reason`. Where it cannot tell, it signs off `blocked` with its question,
  and the run waits on a person; there is no gate otherwise.
- `to-intake`, `to-build` and `to-quick` are card nodes (`card: given`): the one on the route taken files the run's own card, its body
  and labels as they were, with `workflow:` its workflow, `from:` this run and the door's reason, which the factory starts as any card.
  No agent runs on them.
- `answer` is Iris answering a question that asks no change, on a fence that reads and searches the web, her answer the run's result.
- `backlog` is a card node (`card: backlog`) that files the card back to the inbox naming no workflow and unqueued, with
  `relabel: [sdlc/stage=backlog]`: the card keeps its `sdlc/sprint` mark and its `sdlc/state`, and the trigger selects it no more until
  a person moves it to the sprint again.

The factory must offer the workflows the door routes to: `nemia factory attach <factory> front-door intake build quick`.

## Its cost

The trigger spends quota, since `door` and `answer` run an agent: the factory's settings say so beside the trigger, apart from the
cards it queues now.

## A card routed wrong

The routed run is a run of its own. A step of it that finds its card is not what its workflow is for signs off `blocked`, saying so and
which workflow the card needs (`RULES.md`, *Routing*); the person cancels it and files the idea again, since a card is started once
and the routed card is neither queued again nor read by the door: under a name of its own, on the workflow it needs (`nemia inbox add
<file> --workflow <workflow>`), or in the sprint and ready to work for the door to route it again (`--label sdlc/stage=sprint --label
sdlc/state=ready-to-work`).

## What an overlay can change

The door's rules are the factory's: an overlay of `RULES.md`'s *Routing* section changes how it routes, with no change here. The
trigger's selector is in the factory's own file (`nemia factory trigger` changes it, or removes the trigger, after which the workflow runs only
on a card started on it by hand).
Hire another read-only agent into `front-door/door` to change who judges.
