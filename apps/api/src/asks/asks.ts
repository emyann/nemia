/**
 * A person's asks of a run, for the board: another try of a step, another round of a loop, words for a running session, an approval at a
 * gate and an acceptance of a loop out of rounds — five writes, each through the package's own verb and guarded as a start is (guard.ts).
 */
import { Schema } from 'effect';
import { Hono } from 'hono';
import { accept, approve, budgetRefusal, messageRefusal, retry, type RetryHow, round, type Said, say } from 'agent-orchestrator';
import { acceptWordsRefusal, approvalWordsRefusal } from 'agent-orchestrator/run';
import { NotBlank, readBody, type BodyIssue } from '../body.ts';
import { type Guarded, type Refusal, refusedBeforeReading } from '../guard.ts';
import { e, findRun, noSuchRun, taskOfStep } from '../store.ts';

/** The body `POST …/retry` takes: `wf retry`'s flags, as JSON. */
const RETRY_SHAPE = '`{ "mode": "nudge" | "fresh" | "recheck", "model"?: "<m>", "message"?: "<answer>", "budget"?: <amount> }`';
const RETRY_BODY = Schema.Struct({
  mode: Schema.Literals(['nudge', 'fresh', 'recheck']),
  model: Schema.optionalKey(NotBlank),
  message: Schema.optionalKey(Schema.String),
  budget: Schema.optionalKey(Schema.Number),
});

/** The body `POST …/round` takes: `wf round`'s arguments, as JSON. */
const ROUND_SHAPE = '`{ "step"?: "<looping step>", "budget"?: <amount> }`';
const ROUND_BODY = Schema.Struct({ step: Schema.optionalKey(NotBlank), budget: Schema.optionalKey(Schema.Number) });

/** An ask for another round of a run's loop, as the guard's refusals word it (guard.ts). */
const roundGuard = (id: string): Guarded => ({
  route: `POST /api/runs/${id}/round`,
  does: "asks for another round of a run's loop",
  forAnother: 'ask for one',
  why: "the next tick files the round a person asks for, which runs the loop's steps again in this repository, past the cap a budget carried where it raises one",
  reach: "raise it from the run's page on the board",
  instead: `Raise it from the run's page on the board, or with \`wf round ${id} [<step>] --budget <amount>\``,
  shape: ROUND_SHAPE,
});

/** An ask for another try of a step, as the guard's refusals word it (guard.ts). */
const retryGuard = (id: string, step: string): Guarded => ({
  route: `POST /api/runs/${id}/steps/${step}/retry`,
  does: 'asks for another try of a step',
  forAnother: 'ask for one',
  why: 'the next tick files the try a person asks for, and the answer it carries goes into the brief an agent acts on in this repository',
  reach: "answer the step from the run's page on the board",
  instead: `Answer it from the run's page on the board, or with \`wf retry ${id} ${step}\``,
  shape: RETRY_SHAPE,
});

/** The body `POST …/approve` takes: `wf approve`'s `--message`, as JSON. */
const APPROVE_SHAPE = '`{ "message"?: "<words>" }`';
const APPROVE_BODY = Schema.Struct({ message: Schema.optionalKey(Schema.String) });

/** An approval of a step waiting at its gate, as the guard's refusals word it (guard.ts). */
const approveGuard = (id: string, step: string): Guarded => ({
  route: `POST /api/runs/${id}/steps/${step}/approve`,
  does: 'approves a step waiting at its gate',
  forAnother: 'approve one',
  why: 'the next tick files what waits on a step a person approves, and the words given with it go into the brief of every step after the gate, which an agent acts on in this repository',
  reach: "approve it from the run's page on the board",
  instead: `Approve it from the run's page on the board, or with \`wf approve ${id} ${step}\``,
  shape: APPROVE_SHAPE,
});

/** The body `POST …/accept` takes: `wf accept`'s `--message`, as JSON — required, as the command line requires it. */
const ACCEPT_SHAPE = '`{ "message": "<why>" }`';
/** Its words are required as `acceptWordsRefusal` says, in the package's words: the schema types them only. */
const ACCEPT_BODY = Schema.Struct({ message: Schema.optionalKey(Schema.String) });

/** An acceptance of a loop out of rounds, as the guard's refusals word it (guard.ts). */
const acceptGuard = (id: string, step: string): Guarded => ({
  route: `POST /api/runs/${id}/steps/${step}/accept`,
  does: 'accepts the work of a loop out of rounds as it stands',
  forAnother: 'accept one',
  why: 'the next tick files what waits on a loop a person accepts, and the words given with it go into the brief of every step after the loop, which an agent acts on in this repository',
  reach: "accept it from the run's page on the board",
  instead: `Accept it from the run's page on the board, or with \`wf accept ${id} ${step} --message "<why>"\``,
  shape: ACCEPT_SHAPE,
});

/** The body `POST …/say` takes: the words, as `wf say` takes them. */
const SAY_SHAPE = '`{ "text": "<words>" }`';
const SAY_BODY = Schema.Struct({ text: Schema.String });

/** Words for a step's running session, as the guard's refusals word them (guard.ts). */
const sayGuard = (id: string, step: string): Guarded => ({
  route: `POST /api/runs/${id}/steps/${step}/say`,
  does: "hands a person's words to a step's running session",
  forAnother: 'hand it any',
  why: "the words go into the session of a step at work in this repository, as a person's, and its agent acts on them",
  reach: "say it from the step's session page on the board",
  instead: `Say it from the step's session page on the board, or with \`wf say ${id} ${step} "<words>"\``,
  shape: SAY_SHAPE,
});

/**
 * Why a `budget` in a body is not a number, in the api's words: the package's `--budget` is typed as digits, and has no words for JSON. A
 * number not above zero is the package's to refuse.
 */
const budgetWords = (budget: unknown, as: string, shape: string): string =>
  `\`budget\` is the cap to raise to, as \`${as} --budget <amount>\` takes it: dollars, as a JSON number above zero, like 5 or 2.50. This request's was ${JSON.stringify(budget)}: ${shape}.`;

/** Why `POST …/retry`'s body is not an ask (400), by the first key its schema refused. */
const retryWords = ({ path: [key], input }: BodyIssue): string => {
  if (key === 'mode')
    return `\`mode\` is how to try the step again, as \`wf retry\` takes it: "nudge" continues its session, told what happened; "fresh" starts a new session on its branch; "recheck" runs its check again and files no session. This request's was ${JSON.stringify(input) ?? 'left out'}: ${RETRY_SHAPE}.`;
  if (key === 'model')
    return `\`model\` names the model a new session runs on, as \`wf retry --model <m>\` does: a name, or left out for the step's own. This request's was ${JSON.stringify(input)}.`;
  if (key === 'message')
    return `\`message\` is what to tell the step, as \`wf retry --message "<answer>"\` takes it: text, or left out. This request's was ${JSON.stringify(input)}.`;
  if (key === 'budget') return budgetWords(input, 'wf retry', RETRY_SHAPE);
  return `POST …/retry takes a JSON object: ${RETRY_SHAPE}.`;
};

/**
 * How a try is asked for, off `POST …/retry`'s decoded body — or why it is not an ask (400): `wf retry`'s one way, the model its `--model`
 * names, which is a new session's, `--message`, and `--budget`, the cap a step over its budget is raised to — a JSON number above zero, one
 * that is not refused in the package's words (`budgetRefusal`). Whether the message and the budget may ride on the ask is the package's to
 * say (`messageRefusal`, `budgetRefusal`), and whether the step may be tried again that way, with that cap (`retryRefusal`).
 */
function howOf(how: RetryHow, command: string): RetryHow | Refusal {
  if (how.model !== undefined && how.mode !== 'fresh') {
    return {
      status: 400,
      error: `\`model\` names the model a new session runs on, as \`wf retry --model <m>\` does, so it goes with "mode": "fresh" — a nudge continues a session on the model it has, and a recheck files no session. This request asked for "${how.mode}".`,
    };
  }
  if (how.budget !== undefined && !(how.budget > 0)) return { status: 400, error: budgetRefusal(how, command)! };
  return how;
}

/**
 * Why `POST …/round`'s body is not an ask (400), by the first key its schema refused: the looping step, which `wf round` takes when the run
 * has more than one loop, and `--budget`, the cap each step of the loop over its budget is raised to. Whether the loop may go round, with
 * that cap, is the package's to say (`roundAsk`, through `round()`) — a number not above zero included, before anything of the run is decided.
 */
const roundWords =
  (id: string) =>
  ({ path: [key], input }: BodyIssue): string => {
    if (key === 'step')
      return `\`step\` names the looping step whose loop goes round again, as \`wf round ${id} <step>\` does: a name, or left out for a run with one loop. This request's was ${JSON.stringify(input)}: ${ROUND_SHAPE}.`;
    if (key === 'budget') return budgetWords(input, `wf round ${id}`, ROUND_SHAPE);
    return `POST …/round takes a JSON object: ${ROUND_SHAPE}.`;
  };

/**
 * The board's writes for a person's asks of a run. Each route is guarded as a start is (guard.ts), answers 404 for a run or a step it does
 * not have and 400 for a body that is not an ask, and writes through the package's own verb, whose refusals it quotes verbatim: the api
 * judges none of it. A 202 is accepted and not yet done: the next tick honours the ask once, as it does one made at the command line. A
 * write that fails otherwise is a 502 naming the command that asks the same way.
 *
 * - `POST /api/runs/:id/steps/:step/retry` — another try of a step: the answer to a step that signed off blocked, a nudge, a recheck. Made
 *   by `retry()`, `wf retry`'s own, which writes the ask file and nothing else. Refuses a message or a budget that cannot ride on the ask
 *   (`messageRefusal`, `budgetRefusal` — a budget on a recheck, which files no session to spend it) with 422 before the run is read, and a
 *   step that may not be tried again that way (`retryRefusal`) with 409 after. A step whose session its harness blocked, with nothing
 *   signed, is taken as `wf retry` takes it (`stopBlocked`): the ask is written as any other, and the tick stops the session before it
 *   files the try — which the answer's `stopFirst` says, for the board to word, and then a tick after that one files the try.
 * - `POST /api/runs/:id/round` — another round of a run's loop: the loop out of rounds, or held on a step of it past its budget, with the
 *   cap raised. Made by `round()`, `wf round`'s own, which writes the ask file and nothing else. Refuses a budget not above zero with 400,
 *   which `roundAsk` refuses first, whatever the run; a round the loop may not go, or a budget not above what its steps have cost
 *   (`roundAsk`), with 409.
 * - `POST /api/runs/:id/steps/:step/say` — a person's words to a step's running session, through `say()`, `wf say`'s own, which hands them
 *   to the session through the engine, and the engine journals them: the api writes nothing, and the step's detail reads them back
 *   (`said`). Refuses, in the package's and the engine's words, with 409: a step not filed, settled, or of a cancelled run; empty words; a
 *   session its harness does not list running. Words the harness did not take are the engine's error, verbatim, with 502: nothing was
 *   journalled, and asking again may work. Its 202 means the session's harness took the words and the engine journalled them; whether the
 *   session reads them is the session's.
 * - `POST /api/runs/:id/steps/:step/approve` — an approval of a step waiting at its gate, through `approve()`, `wf approve`'s own, which
 *   writes the approval file and nothing else; the next tick files what waits on the step. Refuses empty words (`approvalWordsRefusal`)
 *   with 422 before the run is read, and a step that may not be approved (`approvalRefusal`) with 409 after — not gated, not signed off
 *   yet, already approved, sent back, or of a run called off. Sending it back is `POST …/retry` with a message, as `wf retry --message` is.
 * - `POST /api/runs/:id/steps/:step/accept` — an acceptance of a loop out of rounds, as it stands, through `accept()`, `wf accept`'s own,
 *   which writes the acceptance file and nothing else; the next tick files what waits on the looping step as if it had said `again: false`.
 *   Refuses words that are missing or empty (`acceptWordsRefusal`) with 422 before the run is read, and a loop that may not be accepted
 *   (`acceptAsk`) with 409 after — a step with no `loop:`, a round the run files itself or one already asked for, a loop that ended
 *   `again: false`, a try already accepted, a run called off.
 */
export const asks = new Hono()
  .post('/api/runs/:id/steps/:step/retry', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const refused = refusedBeforeReading(
      retryGuard(id, step),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const read = await readBody(c.req, RETRY_BODY, `POST …/retry takes a JSON body: ${RETRY_SHAPE}.`, retryWords);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const how = howOf(read.body, `wf retry ${id} ${step}`);
    if ('status' in how) return c.json({ error: how.error }, how.status);
    const wrong = messageRefusal(how, `wf retry ${id} ${step}`) ?? budgetRefusal(how, `wf retry ${id} ${step}`);
    if (wrong) return c.json({ error: wrong }, 422);
    try {
      const { ask, file, stopFirst } = await retry(e, id, step, how, { stopBlocked: true });
      return c.json({ try: ask.try, file, stopFirst }, 202);
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      if ((err as { exitCode?: unknown }).exitCode === 2) return c.json({ error: said }, 409);
      return c.json(
        {
          error: `Could not ask for another try of step '${step}': ${said}. \`wf retry ${id} ${step}\` asks the same way from the command line.`,
        },
        502,
      );
    }
  })
  .post('/api/runs/:id/round', async (c) => {
    const id = c.req.param('id');
    const refused = refusedBeforeReading(
      roundGuard(id),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    if (!findRun(id)) return c.json({ error: noSuchRun(id) }, 404);
    const read = await readBody(c.req, ROUND_BODY, `POST …/round takes a JSON body: ${ROUND_SHAPE}.`, roundWords(id));
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const how = read.body;
    if (how.step !== undefined) {
      const found = taskOfStep(id, how.step);
      if ('error' in found) return c.json({ error: found.error }, 404);
    }
    try {
      const { ask, file } = await round(e, id, how.step, how.budget);
      return c.json({ step: ask.step, round: ask.round, file }, 202);
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      if ((err as { exitCode?: unknown }).exitCode === 2)
        return c.json({ error: said }, how.budget !== undefined && !(how.budget > 0) ? 400 : 409);
      return c.json(
        { error: `Could not ask for another round of ${id}'s loop: ${said}. \`wf round ${id}\` asks the same way from the command line.` },
        502,
      );
    }
  })
  .post('/api/runs/:id/steps/:step/say', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const refused = refusedBeforeReading(
      sayGuard(id, step),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const read = await readBody(c.req, SAY_BODY, `POST …/say takes a JSON body: ${SAY_SHAPE}.`, ({ path: [key], input }) =>
      key === 'text'
        ? `\`text\` is the words to hand the step's session, as \`wf say ${id} ${step} "<words>"\` takes them: text. This request's was ${JSON.stringify(input) ?? 'left out'}: ${SAY_SHAPE}.`
        : `POST …/say takes a JSON object: ${SAY_SHAPE}.`,
    );
    if ('status' in read) return c.json({ error: read.error }, read.status);
    try {
      const { said } = await say(e, id, step, read.body.text);
      return c.json({ at: said.at, attempt: said.attempt, text: said.text } satisfies Said, 202);
    } catch (err) {
      const words = err instanceof Error ? err.message : String(err);
      return c.json({ error: words }, (err as { exitCode?: unknown }).exitCode === 2 ? 409 : 502);
    }
  })
  .post('/api/runs/:id/steps/:step/approve', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const refused = refusedBeforeReading(
      approveGuard(id, step),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const read = await readBody(c.req, APPROVE_BODY, `POST …/approve takes a JSON body: ${APPROVE_SHAPE}.`, ({ path: [key], input }) =>
      key === 'message'
        ? `\`message\` is the words to approve with, which every step after the gate is handed, as \`wf approve ${id} ${step} --message "<words>"\` takes them: text, or left out. This request's was ${JSON.stringify(input)}: ${APPROVE_SHAPE}.`
        : `POST …/approve takes a JSON object: ${APPROVE_SHAPE}.`,
    );
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const { message } = read.body;
    const empty = approvalWordsRefusal(message, `wf approve ${id} ${step}`);
    if (empty) return c.json({ error: empty }, 422);
    try {
      const { approval, file } = await approve(e, id, step, message);
      return c.json({ try: approval.try, at: approval.at, message: approval.message ?? null, file }, 202);
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      if ((err as { exitCode?: unknown }).exitCode === 2) return c.json({ error: said }, 409);
      return c.json(
        { error: `Could not approve step '${step}': ${said}. \`wf approve ${id} ${step}\` approves the same way from the command line.` },
        502,
      );
    }
  })
  .post('/api/runs/:id/steps/:step/accept', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const refused = refusedBeforeReading(
      acceptGuard(id, step),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    const found = taskOfStep(id, step);
    if ('error' in found) return c.json({ error: found.error }, 404);
    const read = await readBody(c.req, ACCEPT_BODY, `POST …/accept takes a JSON body: ${ACCEPT_SHAPE}.`, ({ path: [key], input }) =>
      key === 'message'
        ? `\`message\` is why the work is good enough with its findings open, which every step after the loop is handed, as \`wf accept ${id} ${step} --message "<why>"\` takes it: text. This request's was ${JSON.stringify(input)}: ${ACCEPT_SHAPE}.`
        : `POST …/accept takes a JSON object: ${ACCEPT_SHAPE}.`,
    );
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const { message } = read.body;
    const words = acceptWordsRefusal(message, `wf accept ${id} ${step}`);
    if (words) return c.json({ error: words }, 422);
    try {
      const { acceptance, file } = await accept(e, id, step, message);
      return c.json({ step: acceptance.step, try: acceptance.try, at: acceptance.at, message: acceptance.message, file }, 202);
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      if ((err as { exitCode?: unknown }).exitCode === 2) return c.json({ error: said }, 409);
      return c.json(
        {
          error: `Could not accept ${step}'s loop as it stands: ${said}. \`wf accept ${id} ${step} --message "<why>"\` accepts the same way from the command line.`,
        },
        502,
      );
    }
  });
