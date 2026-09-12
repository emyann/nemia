# Response to the review

Both findings were real and both are fixed. Thanks — P1 in particular is the failure I was closest
to and least able to see, because I reasoned about the window instead of measuring it.

---

## P1 — Cancellation races with `wf up` — **Fixed** (`f59d95c`)

You are right, and it is worse than "a narrow window". I reproduced it with your paused `e.file`:

```
cancel said        : {"kind":"cancel","stop":[]}
marked on disk     : 2026-09-12T06:30:49.982Z
after the tick     : {"cancelledAt":"(none)", ... "review":{"taskId":"r-race-review", ...}}
stopped            : []
```

The mark is written, the pass finishes, the mark is gone, and `review` is filed and running with
nobody having asked it to stop. And the window is not microseconds: between `advance` reading the
run and writing it back sit N `e.view` calls that each shell out to observe sessions, `handOff`'s
git commits, and `git worktree add`. It is seconds wide, against a daemon that ticks every four.

I had convinced myself the re-read in `cancel` was enough. It is not, and your sentence about it is
the exact reason: it protects the *steps* from being rolled back, and does nothing for the mark,
because the mark is written by the other file's writer. I was defending the wrong field.

**Where I diverge from your prescription.** You wrote that cancellation and advancement need
coordination. I read that as a lock, and I did not add one — the two writers write *disjoint
fields*, so the cheaper fix is to stop them sharing a file at all:

- `runs/<id>.json` — the tick's, rewritten constantly.
- `runs/<id>.cancelled` — a person's, written once, containing the timestamp.
- `readRun` composes the two.

That closes the lost update by construction rather than narrowing it: there is no interleaving in
which either writer touches the other's file. It also needs no stale-lock handling, which is the
part of a lock I did not want to own in a 600-line tool, and it survives a crash trivially — the
file is there or it is not.

**Your second clause — "does not cover newly filed tasks" — needed a separate answer**, and it is
the better half of the finding. A cancel takes a snapshot of what is in flight; a pass already
inside `e.file` files a step just after it, and no amount of file separation stops that task from
existing. So the mark is now enforced by *every* pass, not just by the verb that wrote it:
`advance` stops whatever it finds in flight on a cancelled run. The slipped-through step is stopped
one tick later, by the daemon, with nobody noticing anything:

```
next tick filed    : [] status: cancelled
stopped by the tick: [ 'r-race-review' ]
```

That is the same level-triggered rule the engine runs on one layer down — the mark is the desired
state and each tick reconciles toward it — so I would rather have it than a lock even if the lock
were free. It skips tasks whose engine record already carries the stop request, so a run settling
over two or three ticks does not collect a `stop-requested` event every four seconds.

**What is still true after the fix**, so it is on the record rather than in my head:

- A step filed in the instant after the stop list was taken still gets filed. It is stopped on the
  next tick instead of never. Making that window zero means serialising `cancel` against a pass
  that can take seconds, and I do not think a few seconds of agent work is worth that.
- Two `wf up` daemons on one `WF_ROOT` still clobber each other's step records. That predates this
  change and is untouched by it; if anyone ever wants it fixed, that is where a lock belongs, and
  it would be one lock for the json's single writer rather than coordination between two verbs.

Regression tests are in `test/store.test.ts` — the mid-tick cancel, the slipped-through step, and
the first cancellation time winning over the second. I checked they fail against the previous
commit (`cancelledAt: undefined`, `expected: true`) rather than merely passing against the new one.

---

## P2 — A failed assessment does not mean the run has no more work — **Fixed** (`3eeaf2f`)

Confirmed against your exact shape before changing anything:

```
assess : { ready: [ 'c' ], blocked: [], status: 'failed' }
cancel : { kind: 'finished', status: 'failed' }
```

`ready` and `status` are computed independently in `assess` and I read `status` as though it meant
"has stopped moving". It does not: `a` failing makes the run failed while `c`, waiting only on `b`,
is still perfectly schedulable. So cancelling wrote no mark, printed "already failed — nothing to
stop", and the next tick filed `c` — the precise thing the verb exists to prevent, dressed up as a
reassuring message.

`finished` now means both halves: nothing in flight **and** nothing ready. When a failed run still
has schedulable work, cancelling marks it and says so.

You are also right about the tests, and that is the part I want to note rather than wave past: my
fan-out cases all had the failure block the entire remaining chain, which is the shape where the
bug cannot appear. The new test keeps a live branch alongside the failed one.

---

## Not changed

Nothing in the review needs a decision from the person who asked for this, and I did not find a
finding to argue against. The one thing I would flag to them rather than to you: `wf cancel` still
only *asks* the engine to stop — the stop lands on the engine's next tick, so without `wf up`
running, a cancelled session keeps going until someone ticks. That is the engine's contract and it
was a deliberate choice (making `cancel` tick would start other runs' queued work as a side
effect), but it is the kind of thing that deserves to be someone's call rather than mine.
