# front-door

Route a raw card to the workflow it needs, with no gate. A person files a card the way they like — by hand, through a session, through
Nemia's agent — and labels it with the key the factory's `frontDoorLabel` names. The factory's `front-door` trigger, which its template
writes where that parameter is set, queues each such card that names no workflow on this workflow, in the order filed; a labelled card
that names its workflow is queued on that one, and never comes here. Iris reads the card, as a read-only judge, and chooses its route.

```
door ─ intake  → to-intake   (the card, as given, for intake)
     ├ build   → to-build    (the card, as given, for build)
     ├ quick   → to-quick    (the card, as given, for quick)
     ├ answer  → answer      (Iris answers, changing nothing)
     └ backlog → backlog     (the card back to the inbox, unqueued, unlabelled)
```

- `door` is a judge (`route: judge`): a session on a fence that only reads (`Read`, `Grep`, `Glob`), which chooses one route by the
  *Routing* rules of the factory's `RULES.md` and says why in `reason`. Where it cannot tell, it signs off `blocked` with its question,
  and the run waits on a person; there is no gate otherwise.
- `to-intake`, `to-build` and `to-quick` are card nodes (`card: given`): the one on the route taken files the run's own card, its body
  and labels as they were, with `workflow:` its workflow, `from:` this run and the door's reason, which the factory starts as any card.
  No agent runs on them.
- `answer` is Iris answering a question that asks no change, on a fence that reads and searches the web, her answer the run's result.
- `backlog` is a card node (`card: backlog`) that files the card back to the inbox naming no workflow and unqueued, without the label
  `frontDoorLabel` names, so the trigger selects it no more until a person labels it again.

The factory must offer the workflows the door routes to: `nemia factory attach <factory> front-door intake build quick`.

## Its cost

The trigger spends quota, since `door` and `answer` run an agent: the factory's settings say so beside the trigger, apart from the
cards it queues now.

## A card routed wrong

The routed run is a run of its own. A step of it that finds its card is not what its workflow is for signs off `blocked`, saying so and
which workflow the card needs (`RULES.md`, *Routing*); the person cancels it and files the idea again, since a card is started once
and the routed card is neither queued again nor read by the door: under a name of its own, on the workflow it needs (`nemia inbox add
<file> --workflow <workflow>`), or with the door's label for the door to route it again (`--label <key=value>`).

## What an overlay can change

The door's rules are the factory's: an overlay of `RULES.md`'s *Routing* section changes how it routes, with no change here. The
label is the `frontDoorLabel` parameter; leaving it empty makes no trigger, and the workflow runs only on a card started on it by hand.
Hire another read-only agent into `front-door/door` to change who judges.
