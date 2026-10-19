/**
 * A viewer's engine, in a process of its own: the other half of `test/holder-follow.boundary.test.ts`.
 *
 * It is told what to do as one JSON object on its stdin — `{ root, taskId, card, what }` — and the holder's bearer token in
 * `VIEWER_TOKEN`, never its argv, which `/proc` shows to every user on the machine. `what` is `follow`, which prints one line
 * per moment of the task's session, or `read`, which prints what it reads from the files alone. It ends with one `asked` line
 * saying every scheme its `credentials` was asked for, in order: what proves the follow is the only thing it dialled.
 */
import { Effect, Stream } from 'effect';
import { Engine } from '../../src/index.ts';
import { standSpec, HARNESS } from '../holder-stand.ts';
import { builtEngine } from '../engine.ts';

type Told = { root: string; taskId: string; card: Record<string, unknown>; what: 'follow' | 'read' };

const told = await new Promise<Told>((resolve, reject) => {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => void (text += chunk));
  process.stdin.on('end', () => {
    try {
      resolve(JSON.parse(text) as Told);
    } catch (cause) {
      reject(cause as Error);
    }
  });
});

const token = process.env.VIEWER_TOKEN;
const asked: Array<{ scheme: string; agentUrl: string; harness: string }> = [];
const say = (what: string, value: unknown) => process.stdout.write(`${what} ${JSON.stringify(value)}\n`);

const engine = builtEngine(
  Engine.layer({
    root: told.root,
    harnesses: { [HARNESS]: standSpec(told.root) },
    defaultHarness: HARNESS,
    holder: { [HARNESS]: { card: told.card } },
    credentials: (scheme, agentUrl, harness) => {
      asked.push({ scheme, agentUrl, harness });
      return token;
    },
  }),
);

if (told.what === 'follow') {
  const followed = await Effect.runPromise(engine.follow(told.taskId));
  if (!followed) say('refused', 'the task has no attempt to follow');
  else
    await Effect.runPromise(
      Stream.runForEach(followed, (m) => Effect.sync(() => say('moment', m))).pipe(
        Effect.catchCause((cause) => Effect.sync(() => say('refused', String(cause)))),
      ),
    );
} else {
  const read = await Effect.runPromise(engine.transcript(told.taskId).pipe(Effect.catch((e) => Effect.succeed({ failed: e.message }))));
  say('transcript', read);
  const view = await Effect.runPromise(engine.view(told.taskId));
  say('view', { id: view.id, phase: view.phase, sessionId: view.sessionId });
}
say('asked', asked);
process.exit(0);
