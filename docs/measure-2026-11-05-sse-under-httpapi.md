# SSE under HttpApi, measured — 2026-11-05

Decision 27 of the resource-objects intent kept the streams (the feed, and `?watch=true` on every list) on Hono until SSE under effect's
HttpApi was measured. This is that measurement, made by the run that built the watch (`apps/api/src/watch/watch.ts`).

## What was measured, on what

One Node process (v24.20.0, 12 cores, WSL2), both ways side by side, three rounds each, never the live api:

- **HttpApi**: an endpoint whose success is `HttpApiSchema.StreamSse({ data: watchEventOf(WatchedObject) })`, built into a web handler
  with `HttpRouter.toWebHandler`, as the api builds the objects' handler (`serve.ts`).
- **Hono**: `streamSSE`, writing each event with the watch's own `frameOf` (`watch.ts`), as the watch does.

Each answered 10 000 ADDED events of a Card (a 200-character body, 4 147 780 bytes on the wire either way), read to the end; and 100
streams held open after their first event, the heap read before and after with `--expose-gc`.

## The numbers

| | HttpApi | Hono |
| --- | --- | --- |
| Bytes on the wire | equal, byte for byte | |
| Time to the first chunk (rounds 1–3) | 65.2, 16.4, 34.7 ms | 2.6, 0.5, 0.3 ms |
| 10 000 events to the end | 104, 54.5, 68.3 ms | 153.5, 114.8, 133.5 ms |
| Per event | 10.4, 5.5, 6.8 µs | 15.4, 11.5, 13.4 µs |
| Heap per open stream (100 open) | 24.7 KB | 13.3 KB |

HttpApi writes its stream in larger chunks: its first chunk carries many events, so its time to the first byte is a batch's, and its
total is about half Hono's. Hono writes each event as it is awaited, so its first byte is immediate. Both are far below what a watch
spends reading its list again (below).

What `apps/api/src/watch/watch-sse.test.ts` holds for good: the frames are equal byte for byte (an unnamed `message`, its data the JSON
of the event, no id), an abort of the HttpApi stream ends its fiber, and `OpenApi.fromApi` documents the answer as `text/event-stream`.

## What a move would cost

- **The opening comment.** The feed writes `: open` the moment it opens (`OPENED`, `factory/feed.ts`), so a proxy that holds a response's
  head until its first bytes (Vite's, before the board) does not hold the board's stream. HttpApi's `StreamSse` writes events only; it
  has no comment. A watch sends its initial state at once, so it needs none; the feed would.
- **Named events and ids.** The feed names its events (`run`, `step`, `bookmark`, `unreadable`, …) and resumes by `Last-Event-ID`.
  `StreamSse({ events })` carries an `id` and an `event` per frame, so it can say them; the reserved name
  `effect/http-api/stream/failure` is refused as an event of one's own.
- **Stability.** `effect/http-api` is `@stability unstable` in effect 4.1.2: a minor release of effect may move it.
- **The refusals before a stream.** A watch's 400s and its list's own refusal are answered before the stream opens; under HttpApi
  they would be the endpoint's errors, declared beside its success.

## The runs watch's re-read cost

A watch reads its list again on a feed line, at most one read in flight and one per `WATCH_SETTLE` (500 ms), and every
`WATCH_RESYNC` (5 s). Every read again is a whole list read through the route. On the 277-run store measured by run qw07 (the RunList
5.4 s warm, 35 s cold, before resource-objects-the-runlist-7q76 lands), a watch of runs on a busy feed reads again back to back: one
5.4 s read, 0.5 s settled, and the next, so each open runs watch keeps the api reading the RunList about 90% of the time. This is derived
from those numbers, not measured on that store: no watch was opened on the live api. The SSE framing above costs microseconds an event
beside it. Until the RunList read is cheap, a client should not hold a watch of runs open on a large store; the cards, the factories'
parts and the definitions read in milliseconds.

## Verdict

**The watch can move under HttpApi**: its frames are already HttpApi's, its cost there is no worse, and it needs neither the opening
comment nor a resume. **The feed can move once two gaps are closed**: its opening comment (or a first event in its place, which every
reader would then skip) and its `Last-Event-ID` resume, written through `StreamSse({ events })`. As the person decided on 2026-11-05,
this run moves neither: a follow-up card moves the watch and the feed, read by a person first.
