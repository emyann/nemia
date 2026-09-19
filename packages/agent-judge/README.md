# agent-judge

Asks TypeSafe's Jev model a typed question once, and keeps what came of it for good. A question is a
noul (how likely is yes), a score (where on a scale you describe) or a choice (one of a set). The
answer is a probability, and your code decides what to do with it: `decide` turns it into yes, no or
unsure, and the caller's `switch` has to handle `unsure`.

This is the first slice of P5 in `docs/pivot-2026-09-18.md`. It is a library and a command for
trying the judge on a card by hand. Nothing calls it.

## Optional

The package is optional.

- It imports nothing from the workspace, and nothing in the workspace imports it or its SDK
  (`test/boundary.test.ts` holds both). If you delete the folder, every other package still builds
  and passes.
- Without a `TYPESAFE_API_KEY` the judge is off. Every question reads `unsure`, as the `no-key`
  failure, and nothing is claimed, written, built or sent: the record stays as it was. Once a key is
  set, the same questions are asked as if for the first time, with no `reask`.
- `available()` says whether a key is present. `judge status` prints `ready`, or
  `off: no TYPESAFE_API_KEY in the environment`, and exits 0 either way. Neither one checks that
  the key is good.

A later slice can list the judge among the agents, shown as off until a key is present.

## Never in a tick

Nothing in a tick, in `assess`, in `wf decide` or in any gate calls the judge. The written rule
("no LLM in a tick or in `wf decide`") still stands. Before anything calls the judge, all of these
must be true:

- The owner has adopted the wording proposed in §5 of the pivot plan: a model's answer exists only
  as a recorded fact, asked once by code outside any pass, and it moves nothing on its own.
- The ask is filed from the pass as a task, the way a check is, and never made inside it.
- The key is kept out of `wf up`'s environment, so that only the task that asks can read it.

## What a caller writes

```ts
import { judge, noul, decide } from 'agent-judge';

const j = judge({ model: 'jev-1.13.0', record: '/some/dir' });
const { answers } = await j.ask({ card: text }, {
  web: noul('Would doing what `card` asks change the web app?', { true: '…', false: '…' }),
});
switch (decide(answers.web, { yes: 0.8, no: 0.2 })) {
  case 'yes': …
  case 'no': …
  case 'unsure': …   // a failure of any kind lands here too
}
```

`judge` and `ask` are plain functions and a Promise. The caller never sees Effect.

- The model has to be pinned. An alias such as `jev` or `jev-latest` is refused, because the record
  would stop meaning anything once the alias moved.
- `record` has no default. The caller says where its facts live.
- The key is read from the environment and can't be passed in. `apiKey` is refused, with a message
  saying why.

`ask` rejects only on a bug or a bad argument, always with `exitCode` 2 and a message saying what to
do. The cases:

- a record it cannot read or write;
- a replay with no record of a question;
- no questions at all;
- a state that is not JSON.

Weather never rejects: a refusal, a rate limit or a timeout is written down as a fact, and reads as
`unsure`. No key reads as `unsure` too, and is written nowhere. `why(judgment)` says in a few words what a judgment is: `P 0.74`,
`score 2.97`, or `rate-limited: …`.

`ask(state, questions, { reask: 'failed' })` asks again only the questions that have no answer on
record and whose last asking failed. It is the one way to re-ask something. A question with an
answer is never asked again, and an answer that comes back later from an earlier asking does not
replace it.

## What happens underneath

1. Each question gets a key: sha256 over `{ v: 1, model, question: { type, instructions, criteria },
   state: sha256(JSON of the state) }`, computed in `src/key.ts`. The key does not include the
   question's id (ids are for your code; the model does not see them), so two ids with the same words
   share one key, and the question is sent once. Changing the model, the words, the options or the
   state changes the key.
2. Each key is looked up in the record.
   - Without a key, nothing is looked up: every question reads `no-key`, and the ask ends there.
   - A key with an answer, or with a failure and no `reask`, is used as it is.
   - A key with nothing on record is claimed.
   - A key another asker has claimed is waited on until that claim's deadline.
3. Every claimed question goes out in **one** request, over the live layer. The state is billed once
   for the lot.
4. What came back is written down, one file per question. That is either the answer exactly as it
   came, or the failure and why. A whole answer is then linked as the key's answer, unless the key
   has one already.
5. Each key is read again from the record, and the answers are built from that. So the answer a
   caller gets is always the answer on record.

The live layer is wrapped in two limits: an attempt gets 5 s, and all attempts together get 20 s.
The SDK retries twice on 408, 429, 5xx, a dropped connection or a timeout. The deadline stops it,
and the request in flight is aborted.

## The layers, and how it is tested

There are three layers, and they are Effect `Layer`s (`src/judge.ts`):

| Layer | Does |
|---|---|
| `Asker.live` | One request to TypeSafe through `@typesafe-ai/sdk` (0.6.0, pinned). It classifies each way that can fail. |
| `recorded` | The steps above, over whichever `Asker` it is given. This is what `judge()` uses. |
| `replay` | Answers from the record alone. It never asks, claims or writes. A question with nothing on record rejects and names its id. |

The tests are hermetic. Every test file imports `test/hermetic.ts` first, which removes every
`TYPESAFE_*` variable and replaces the global `fetch` with one that throws.
`test/hermetic.test.ts` refuses any test file that does not import it first. A test that means to
ask hands the judge a stub `fetch`, and each failure kind is made to happen through that stub:

| Test file | Covers |
|---|---|
| `test/live.test.ts` | The request body and headers, every status and every timeout, a key echoed back in an error, and a malformed reply. |
| `test/record.test.ts` | Asked once, a partial fan-out, reask, a stale claim, two askers at once, late answers in both orders, an answer never linked, and a record that is bad or unwritable. |
| `test/replay.test.ts` | Replay. |
| `test/facade.test.ts` | The facade's refusals, `available()` and `judge status`. |
| `test/card.test.ts` | The command. |
| `test/key.test.ts` | The key, with the card questions' keys pinned: changing their wording fails it. |
| `test/decide.test.ts` | `decide`. |
| `test/boundary.test.ts` | The package is optional, and Effect stays inside it. |
| `test/source.test.ts` | No raw control character or BOM in the package's files. |
| `test/readme.test.ts` | This file, held to the code. |

## Where Effect is used, and what it buys

Effect is in three files:

- `src/judge.ts`: the tagged errors, the three layers, and the ask.
- `src/index.ts`: its export list, which is `agent-judge/effect`.
- `src/facade.ts`: it runs one ask and turns the result into a Promise.

Everything else is plain code and imports no Effect: `src/key.ts`, `src/decide.ts`,
`src/record.ts`, `src/card.ts` and `src/cli.ts`. `test/boundary.test.ts` refuses a plain file that
imports it.

What Effect buys:

- **Every failure has a type.** `NoKey`, `Refused`, `RateLimited`, `TimedOut` and `Unreachable` are
  tagged errors. Each maps to exactly one failure kind, and the compiler checks that the mapping is
  complete (`FAILURE_OF`).
- **Timeouts compose.** A deadline over the SDK's own retries is `Effect.timeoutOrElse`, and it
  aborts the request in flight through the signal `Effect.tryPromise` hands the SDK.
- **The layers swap.** `recorded` takes whichever `Asker` it is given, and `replay` stands in for
  both of them. A test changes the layer and nothing else.

The record is plain, which departs from the plan: it is a handful of synchronous file calls and one
pure `reading`, and `src/judge.ts` wraps them in `Effect.try`.

## The record

```
<record>/<key>/<n>.asked.json    a claim: this asker is asking, until its deadline
<record>/<key>/<n>.answer.json   what came back, raw, exactly as it came
<record>/<key>/<n>.failed.json   why nothing came back
<record>/<key>/answer.json       the key's answer: the first whole answer to land, and never another
```

`n` is the asking: 1 the first time, and one more each time a person re-asks a failure.

- A claim is made with `wx`, so only one process can make it.
- An answer or a failure is written through a temp file and `link`, which is atomic and never
  replaces an existing file.
- `answer.json` is made with `link` from the asking's own answer. `link` never replaces a file, so
  the first whole answer to land is the key's answer for ever. A read looks at `answer.json` alone.
  An answer that lands after, from any asking, stays on disk as a fact of its asking and is never
  read as the key's. So once a read has returned an answer, every later read returns that answer.
- If an asker crashes between writing its answer and linking it, the next recorded read links it.
  A replay never writes: it reads that answer as `in-flight` until then.
- Nothing is rewritten or removed.
- The record holds the state's hash and never its text.

One real line: the `plan` question about `card-p06.md`, asked on 2026-09-19.

```json
{"v":1,"key":"04fd11b0c15fd7849c65298dd7ea3691347187bcea7a3ce0b175fce2db459bf3","n":1,"id":"plan","model":"jev-1.13.0","question":{"type":"noul","instructions":"Should someone read the code and propose a plan before anyone changes anything, because `card` leaves real design decisions open or changes several parts of the system together?","criteria":{"true":"What to build, where, or how is not settled by the card's words, or the change spans several parts that must agree.","false":"The card names a bounded change whose design is settled; an engineer could start directly."}},"state":"sha256:c870fef4ce04b46e47258c8e3545dbcd99ca4f0f9b585c8248ad7c059e52a790","at":"2026-09-19T12:08:51.484Z","request":"aa2567ed-9bbe-4238-b9f6-856a7b5dadaf","requestId":"req_01a0b991bd8b7ca5b0bc684fa206cae2","ms":563,"answeredBy":"jev-1.13.0","raw":{"type":"noul","noul":0.74},"usage":{"input_tokens":1981,"output_tokens":62,"questions":4}}
```

## Failure kinds

Every kind reads as `unsure`. `no-key` is read and never written. The next six are facts, written
once.

| Kind | Meaning | Asking again |
|---|---|---|
| `no-key` | No `TYPESAFE_API_KEY` in the environment: the judge is off. Nothing is claimed, written or sent. Read, never written. | Once a key is set, with no `reask` |
| `refused` | 400, 401, 403, 404, 422: the service read the request and said no. | Only after the request or the key is fixed |
| `rate-limited` | 429 or 529, after the SDK's retries. | With `reask`, later |
| `timed-out` | No whole answer inside the deadline. | With `reask` |
| `unreachable` | A connection that failed, or a 5xx, after the SDK's retries. | With `reask` |
| `malformed` | An answer came and it is not one. It is kept raw on record. | With `reask`. It was paid for. |
| `wrong-model` | The service says a model other than the pinned one answered. | With `reask` |
| `interrupted` | A claim past its deadline with nothing written after it, which means a crash. Read, never written. | With `reask` |
| `in-flight` | A claim still inside its deadline, read by a replay, which never waits. Read, never written. | It is someone else's |

The key never reaches a message: a key or bearer token echoed back in an error is replaced with
`[key]` before anything is written.

## The command

```
judge status
judge card <file> | --text "…" [--reask] [--record <dir>]
```

`judge card` asks four questions of a card: web, plan, clear and size. It prints what came back, and
the shipped folder the properties map to (`dev`, `dev-build`, `dev-planned` or
`dev-planned-build`). A card stays in the inbox when it says too little about what done looks like,
or when a property is unsure, and the command says which property.

- Its frontmatter is stripped and never sent.
- It files nothing and starts nothing.
- It exits 0 on any verdict, and 2 on a refusal.
- The record defaults to `$WF_ROOT/judge`, or `~/.agent-workflows/judge` when `WF_ROOT` is unset.
  `--record` names another directory.

Here are two real cards, each asked twice:

```
$ judge card docs/pivot-2026-09-18/experiments/jev/cards/card-p06.md --record <tmp>
judge card: …/card-p06.md · 4653 characters sent, frontmatter stripped · jev-1.13.0
  web    P 0.14           no      does it touch the web app or the api
  plan   P 0.74           unsure  should someone plan first
  clear  score 3.00 / 3   yes     how clearly it says what done looks like
  size   score 2.97 / 3   —       how large it is (printed, not used: no folder differs by size)
1 request · 4 questions · 1981 input tokens · 563 ms
record: <tmp>
→ stays in the inbox: unsure about planning first

$ judge card docs/pivot-2026-09-18/experiments/jev/cards/card-agents-board.md --record <tmp>
  …
→ dev-planned-build
```

On the second asking both print `all on record · 0 requests`, with the same properties.

The thresholds are 0.8 and 0.2 for a noul, and 2.5 and 1.5 of 3 for clarity (`src/card.ts`). They
**have not been measured on held-out cards.** They were chosen by eye on the cards of the pivot plan's §2
experiments, and nothing has checked them on a card outside that set.

## What is sent

To TypeSafe goes exactly what the caller put in `state`, plus the questions, and nothing else. The
request body is `{ model, state, questions }`, and `test/live.test.ts` pins it field for field.
`judge card` sends the card's text without its frontmatter, together with a fixed description of
the repository.

The service's base URL is fixed (`https://api.typesafe.ai`) and so is the SDK's log level (off). So
`TYPESAFE_BASE_URL` and `TYPESAFE_LOG_LEVEL` in the environment cannot send the state elsewhere or
log it.

**TypeSafe's retention terms have not been read by this project.** That means its data processing
terms, its privacy policy, and whether zero data retention exists for anyone but enterprise. Until
someone reads them, assume that what is sent may be kept.

## Environment

- `TYPESAFE_API_KEY` is read from the environment only. It is never written, logged or put in an
  error. For a run by hand, use `node --env-file=<checkout>/.env bin/judge.ts …`, and never print
  the file.
- `WF_ROOT` is where `judge card` keeps its record unless `--record` says otherwise.

## Files

- `src/facade.ts`: `judge`, `available`, `status` and the re-exports. This is `agent-judge`.
- `src/index.ts`: the Effect API. This is `agent-judge/effect`.
- `src/judge.ts`: the tagged errors, `Asker.live`, `recorded` and `replay`.
- `src/record.ts`: the files, and the pure `reading` of a key.
- `src/key.ts`: the key, the pinned model, and `Refusal`.
- `src/decide.ts`: `decide`, `why` and the failure kinds.
- `src/card.ts`: the card's questions, its thresholds, and `dispatch` to a folder.
- `src/cli.ts`: `judge status` and `judge card`.
- `bin/judge.ts`: the command's entry.
