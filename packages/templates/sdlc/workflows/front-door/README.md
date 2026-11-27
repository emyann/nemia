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
door ─ intake  → to-intake   (starts intake, briefed by the card)
     ├ build   → to-build    (starts build, briefed by the card)
     ├ quick   → to-quick    (starts quick, briefed by the card)
     ├ answer  → answer      (Iris answers, changing nothing)
     └ backlog → backlog     (the card back to the backlog, unqueued)
```

- `door` is a judge (`route: judge`): a session on a fence that only reads (`Read`, `Grep`, `Glob`), which chooses one route by the
  *Routing* rules of the factory's `RULES.md` and says why in `reason`. Where it cannot tell, it signs off `blocked` with its question,
  and the run waits on a person; there is no gate otherwise.
- `to-intake`, `to-build` and `to-quick` are workflow nodes (`brief: card`): the one on the route taken starts a run of its workflow, briefed with the run's own card, its
  body, labels and files as they were, then the door's reason, and handed this run as context. No card is filed, and no agent runs on them.
- `answer` is Iris answering a question that asks no change, on a fence that reads and searches the web, her answer the run's result.
- `backlog` is a card node (`card: backlog`) that files the card back to the inbox naming no workflow and unqueued, with
  `relabel: [sdlc/stage=backlog]`: the card keeps its `sdlc/sprint` mark and its `sdlc/state`, and the trigger selects it no more until
  a person moves it to the sprint again.

The factory must offer the workflows the door routes to: `nemia factory attach <factory> front-door intake build quick`.

## Its cost

The trigger spends quota, since `door` and `answer` run an agent: the factory's settings say so beside the trigger, apart from the
cards it queues now.

## A card routed wrong

The routed run is a run of its own, and the card follows it: the card's runs, its state and its waiters are those of its work, the door's
run and the run it started. A step of the routed run that finds its card is not what its workflow is for signs off `blocked`, saying so
and which workflow the card needs (`RULES.md`, *Routing*). The person sends the card on with one command, `nemia inbox resend <card>
[--workflow <workflow>]` (the board's *Send on*, the port's `inbox_resend`), which sends on the latest run of the card's work: a card is
started once, so it is filed again under a name of its own, `<run>-resent`, handed the blocked run, and the blocked run is cancelled. A run
no card is behind is sent on the same way with `nemia resend <run> [--workflow <workflow>]`. Named, the workflow it needs runs it; left out, the
card names none and keeps the labels the run's card had, in the sprint and ready to work, so the door routes it again.

## What an overlay can change

The door's rules are the factory's: an overlay of `RULES.md`'s *Routing* section changes how it routes, with no change here. The
trigger's selector is in the factory's own file (`nemia factory trigger` changes it, or removes the trigger, after which the workflow runs only
on a card started on it by hand).
Hire another read-only agent into `front-door/door` to change who judges.
