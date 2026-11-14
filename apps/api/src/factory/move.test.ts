/**
 * A factory moved between two stores through two apps, each over a scratch store of its own (`storeConfigLayer`) and its own builtin
 * templates, on the stand-ins and one test place, whose world holds the repository both clone: `GET /api/factories/:name/export` on the
 * source, its answer sent whole as `POST /api/factories/:name/import` to the target, as `nemia factory move` sends it.
 *
 * The person's case, a factory moved by hand, in its shape: a factory made from a builtin template at an older version than the one
 * the target ships, edits made in its tree since, rules and a level of its own, a schedule, a cost line and a recorded MCP server, a
 * volume mounted read-only on the folder another factory works on (`other`, the folder of the factory `quarry`), given a path of the
 * target's with `volumes` (`otherThere`), a card that follows and one a run was started from, which stays. On the target its template,
 * its rules, its instruction, its tree and its rendered base, its level, schedule, cost line and server read as the source's, its volume
 * at the path given, its card filed with no `repo:` or `queued:` and naming its old name; the source is unchanged to the byte; and an
 * upgrade to the target's version merges against the base that moved, the tree's edit kept. The hand move mounted the volume on another
 * factory's clone, which lives inside the store: given the target's clone of `quarry`, the import is refused naming `--volume`, as
 * `nemia factory volume add` refuses any folder inside the store. Refused too: a session's token whose session has ended, as create
 * refuses it, and a name the target holds, each leaving the target with no factory file, folder or card of it.
 */
import { root, seatPerson } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Effect, Layer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { BuiltinTemplates, testPlace } from 'agent-orchestrator/testing';
import { reconcileOnce, StoreRoot, storeConfigLayer, TokenDoor, tokenDoorFiles } from 'agent-orchestrator';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { appOver, eachTest } from '../../test/placed.ts';

type FactoryApplied = import('objects').FactoryApplied;
type FactoryExport = import('objects').FactoryExport;
type FactoryImported = import('objects').FactoryImported;
type FactoryObject = import('objects').Factory;
type FactoryInstruction = import('objects').FactoryInstruction;
type FactoryPlan = import('objects').FactoryPlan;
type FactoryRules = import('objects').FactoryRules;
type FactoryUpgraded = import('objects').FactoryUpgraded;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/**
 * The builtin template `mill` in `folder` at `version`: one workflow, `press`, whose step `draft` the agent `drafter` fills; the agent's
 * instructions are `instructions`, the one file a later version changes.
 */
function mill(folder: string, version: string, instructions: string): string {
  const at = path.join(folder, 'mill');
  write(
    path.join(at, 'nemia.yaml'),
    `apiVersion: nemia.dev/v1alpha1\nkind: FactoryTemplate\nmetadata:\n  name: mill\n  description: A mill that presses drafts.\nspec:\n  version: ${version}\n  hires:\n    press/draft: drafter\n`,
  );
  write(
    path.join(at, 'workflows', 'press', 'workflow.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: Workflow\nmetadata:\n  name: press\n  description: Press a draft.\nspec:\n  steps:\n    - name: draft\n      place: git\n',
  );
  write(path.join(at, 'workflows', 'press', 'draft.md'), 'Draft the page.\n');
  write(
    path.join(at, 'agents', 'drafter', 'agent.yaml'),
    'apiVersion: nemia.dev/v1alpha1\nkind: Agent\nmetadata:\n  name: drafter\nspec:\n  role: Drafter\n  description: Drafts a page.\n  harness: claude\n',
  );
  write(path.join(at, 'agents', 'drafter', 'instructions.md'), instructions);
  return folder;
}

/** The source ships `mill` at 0.1.0; the target, a later install, at 0.2.0, whose agent's instructions changed. */
const OLDER = mill(scratch('nemia-api-move-builtins-old-'), '0.1.0', 'You draft.\n');
const NEWER = mill(scratch('nemia-api-move-builtins-new-'), '0.2.0', 'You draft, and you cite.\n');

const SINCE = '2026-11-01T00:00:00.000Z';
/** The schedule of `press` the source's factory keeps, and an MCP server it records, signed in to by OAuth. */
const SCHEDULE = { cron: '0 9 * * 1', brief: 'Press the week.' };
const SERVER = { type: 'http', url: 'https://mcp.example.com/mcp', oauth: { clientId: 'nemia-move', callbackPort: 8791 } };
const DRAFT = path.join('workflows', 'press', 'draft.md');
/** Where the tree renders the agent `drafter`, its instructions the body. */
const DRAFTER = path.join('workflows', 'agents', 'drafter.md');

/** One store: its root and the app over it, the builtins it ships. */
type Store = { readonly home: string; readonly app: () => ReturnType<typeof appOver> };

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);

/**
 * A store of its own under a scratch root, shipping the builtins in `builtins`, its app new for each test, the person seated in it
 * (`seatPerson`): every request to the api presents a token, and the harness's is the person's in this store too.
 */
function store(prefix: string, builtins: string): Store {
  const home = scratch(prefix);
  seatPerson(home);
  const app = eachTest(() =>
    appOver(standIn(), stand(), storeConfigLayer({ ...process.env, WF_ROOT: home }), Layer.succeed(BuiltinTemplates)(builtins)),
  );
  return { home, app };
}

/** The source's store, which ships `mill` at 0.1.0, and the target's, which ships it at 0.2.0. */
const source = store('nemia-api-move-source-', OLDER);
const target = store('nemia-api-move-target-', NEWER);

const json = { 'content-type': 'application/json' };

/** `method` on `url` of `s`'s app, `body` sent as JSON, `headers` beside it. */
const send = (s: Store, method: string, url: string, body: unknown = {}, headers: Record<string, string> = {}) =>
  s.app().request(url, { method, headers: { ...json, ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }) });

/** What the request answered, its status asserted. */
async function answered<T>(res: Response | Promise<Response>, status = 200): Promise<T> {
  const answer = await res;
  const body = (await answer.json()) as T;
  assert.equal(answer.status, status, JSON.stringify(body));
  return body;
}

/** One pass of the factory controller over `s`'s store: each factory made from a template rendered from its builtins. */
const reconciled = (s: Store, builtins: string) =>
  Effect.runPromise(reconcileOnce().pipe(Effect.provideService(StoreRoot, s.home), Effect.provideService(BuiltinTemplates, builtins)));

/** Every file under `dir`, by its path from it, with its text: a folder as it reads. */
function filesOf(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), fs.readFileSync(at, 'utf8')];
      })
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

/** The digest of every file under `dir`, by its path from it: a store as it is on disk, to the byte. */
function digestsOf(dir: string): Record<string, string> {
  return Object.fromEntries(
    Object.keys(filesOf(dir)).map((at) => [
      at,
      crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(dir, at)))
        .digest('hex'),
    ]),
  );
}

/** What `s` holds of the factory `name`: its file, its folder, and the inbox's cards of it. */
const heldOf = (s: Store, name: string) => ({
  file: fs.existsSync(path.join(s.home, 'factories', `${name}.json`)),
  folder: fs.existsSync(path.join(s.home, 'factories', name)),
  cards: Object.entries(filesOf(path.join(s.home, 'inbox')))
    .filter(([, text]) => text.includes(`factory: ${name}`))
    .map(([file]) => file),
});

const NOTHING = { file: false, folder: false, cards: [] };

/** The factory file of `name` in `s`'s store, as the door wrote it. */
const fileOf = (s: Store, name: string): { volumes?: Array<{ path: string; readOnly: boolean; name?: string }>; repos: string[] } =>
  JSON.parse(fs.readFileSync(path.join(s.home, 'factories', `${name}.json`), 'utf8'));

/** The run `id` on `s`'s record, started from the inbox's card `card`. */
function runFrom(s: Store, id: string, card: string, repo: string): void {
  write(
    path.join(s.home, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      repo,
      workspace: repo,
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Press it',
      workflowDir: path.join(s.home, 'factories', 'mill', 'tree', 'workflows', 'press'),
      createdAt: SINCE,
      workflow: [{ name: 'draft', after: [], body: 'Draft the page.' }],
      steps: { draft: { taskId: null } },
      factory: 'mill',
      from: { inbox: card },
    }),
  );
}

/** A session's token minted on `s`'s store for a task no engine runs: a token whose session has ended. */
const endedToken = (s: Store): string =>
  Effect.runSync(
    Effect.gen(function* () {
      return yield* (yield* TokenDoor).tokens.mint({
        agent: 'drafter',
        factory: null,
        run: null,
        step: null,
        attempt: 1,
        task: 't-move-ended',
      });
    }).pipe(Effect.provide(tokenDoorFiles(s.home))),
  );

/** The repository `mill` works on: one of the test place's world, by its `file://` URL, which each store clones under itself. */
function originOfMill(): { origin: string; originDir: string } {
  const originDir = path.join(scratch('nemia-api-move-origin-'), 'acme', 'mill');
  fs.mkdirSync(originDir, { recursive: true });
  stand().world.repository(originDir, { 'README.md': 'mill\n' });
  return { origin: pathToFileURL(originDir).href, originDir };
}

test("a templated factory moved to a store of a later install: its lineage, tree, rules, level, volume and card read there as here, and the source's store is unchanged", async (t) => {
  const s = story(t);

  const { origin, originDir } = originOfMill();
  const other = scratch('nemia-api-move-other-');
  const otherThere = scratch('nemia-api-move-other-there-');

  await answered(send(source, 'POST', '/api/factories', { name: 'quarry', repos: [other], noTrust: true }));
  const applied = await answered<FactoryApplied>(
    send(source, 'POST', '/api/factories/mill/apply', { template: { name: 'mill' }, repos: [origin], noTrust: true }),
  );
  await answered(send(source, 'POST', '/api/factories/mill/volumes', { volume: `${other}:ro` }));
  await reconciled(source, OLDER);
  await answered(send(source, 'PUT', '/api/namespaces/mill/schedules/press', SCHEDULE));
  await answered(send(source, 'PUT', '/api/factories/mill/costlines/press', { usd: 4 }));
  await answered(send(source, 'PUT', '/api/namespaces/mill/mcpservers/tracker', SERVER));
  await answered(send(source, 'PUT', '/api/factories/mill/rules', { words: 'Keep drafts short.\n' }));
  const sourceTree = path.join(source.home, 'factories', 'mill', 'tree');
  fs.writeFileSync(path.join(sourceTree, DRAFT), 'Draft it our way.\n');
  write(path.join(source.home, 'factories', 'mill', 'level.json'), `${JSON.stringify({ level: 'auto', since: SINCE })}\n`);
  const [clone = ''] = applied.repos;
  write(
    path.join(source.home, 'inbox', 'polish-it.md'),
    `---\nworkflow: press\nfactory: mill\nrepo: ${clone}\nqueued: ${SINCE}\n---\n\nPolish it.\n`,
  );
  write(path.join(source.home, 'inbox', 'pressed.md'), '---\nworkflow: press\nfactory: mill\n---\n\nPress it.\n');
  runFrom(source, 'run-pressed', 'pressed', clone);

  const before = digestsOf(source.home);
  const exp = await answered<FactoryExport>(send(source, 'GET', '/api/factories/mill/export'));
  const key = fileOf(source, 'mill').volumes?.[0]?.name ?? other;

  await s.test('the export carries the builtin by its name, the card that follows, and names the one a run keeps', () => {
    assert.deepEqual(exp.template, { name: 'mill' });
    assert.deepEqual(
      exp.cards.map((c) => c.name),
      ['polish-it'],
    );
    assert.deepEqual(
      exp.left.map((c) => c.name),
      ['pressed'],
    );
    assert.ok(exp.left[0]?.why.includes('run-pressed'), 'why names the run');
  });

  await s.test(
    "REFUSED: the volume given the target's clone of another factory, inside its store, is a 422 naming --volume, nothing filed",
    async () => {
      const quarryOrigin = path.join(scratch('nemia-api-move-quarry-'), 'acme', 'quarry');
      fs.mkdirSync(quarryOrigin, { recursive: true });
      stand().world.repository(quarryOrigin, { 'README.md': 'quarry\n' });
      const quarry = await answered<{ repos: string[] }>(
        send(target, 'POST', '/api/factories', { name: 'quarry', repos: [pathToFileURL(quarryOrigin).href], noTrust: true }),
      );
      const [quarryClone = ''] = quarry.repos;
      assert.ok(quarryClone.startsWith(path.join(target.home, 'clones')), quarryClone);
      const clones = filesOf(path.join(target.home, 'clones'));
      const res = await send(target, 'POST', '/api/factories/mill/import', {
        export: exp,
        from: 'laptop',
        volumes: { [key]: quarryClone },
      });
      const body = await res.text();
      assert.equal(res.status, 422, body);
      assert.ok(body.includes(`--volume ${key}=`), body);
      assert.deepEqual(heldOf(target, 'mill'), NOTHING);
      assert.deepEqual(filesOf(path.join(target.home, 'clones')), clones, "nothing of mill's is cloned");
    },
  );

  await s.test("REFUSED: a session's token whose session has ended is a 401 on the import as on a create, nothing filed", async () => {
    const bearer = { authorization: `Bearer ${endedToken(target)}` };
    const create = await send(target, 'POST', '/api/factories', { name: 'mill', repos: [otherThere], noTrust: true }, bearer);
    const imp = await send(target, 'POST', '/api/factories/mill/import', { export: exp, from: 'laptop' }, bearer);
    assert.deepEqual([imp.status, imp.status], [create.status, 401]);
    const reasons = [((await create.json()) as { reason?: string }).reason, ((await imp.json()) as { reason?: string }).reason];
    assert.deepEqual(reasons, ['session-ended', 'session-ended']);
    assert.deepEqual(heldOf(target, 'mill'), NOTHING);
  });

  const filed = await answered<FactoryImported>(
    send(target, 'POST', '/api/factories/mill/import', { export: exp, from: 'laptop', volumes: { [key]: otherThere } }),
  );

  await s.test('the import clones the repository under the target and trusts none of its places', () => {
    assert.deepEqual(filed.cloned, [origin]);
    const [there = ''] = filed.repos;
    assert.ok(there.startsWith(path.join(target.home, 'clones')), there);
    assert.equal(stand().world.head(there), stand().world.head(originDir));
    assert.deepEqual(filed.untrusted, filed.repos);
  });

  await s.test(
    "the factory reads there as here: its template's source, version and parameters, its rules and its instruction",
    async () => {
      const here = await answered<FactoryObject>(send(source, 'GET', '/api/factories/mill'));
      const there = await answered<FactoryObject>(send(target, 'GET', '/api/factories/mill'));
      assert.deepEqual(there.spec.template, here.spec.template);
      assert.equal(there.spec.template?.version, '0.1.0', 'at the version it was applied at, not the one the target ships');
      const rules = (s: Store) => answered<FactoryRules>(send(s, 'GET', '/api/factories/mill/rules'));
      assert.equal((await rules(target)).words, (await rules(source)).words);
      const instruction = async (s: Store) => {
        const {
          words,
          path: at,
          store: kept,
          stored,
          error,
        } = await answered<FactoryInstruction>(send(s, 'GET', '/api/factories/mill/instruction'));
        return { words, at, kept, stored, error };
      };
      assert.deepEqual(await instruction(target), await instruction(source));
    },
  );

  await s.test('its tree with its edit, its rendered base and its level are the files the source holds', () => {
    const folder = (s: Store) => path.join(s.home, 'factories', 'mill');
    assert.deepEqual(filesOf(path.join(folder(target), 'tree')), filesOf(path.join(folder(source), 'tree')));
    assert.equal(fs.readFileSync(path.join(folder(target), 'tree', DRAFT), 'utf8'), 'Draft it our way.\n');
    assert.deepEqual(filesOf(path.join(folder(target), 'applied')), filesOf(path.join(folder(source), 'applied')));
    assert.equal(
      fs.readFileSync(path.join(folder(target), 'level.json'), 'utf8'),
      fs.readFileSync(path.join(folder(source), 'level.json'), 'utf8'),
    );
  });

  await s.test('its schedule, its cost line and its recorded server read there as here', async () => {
    const spec = async (st: Store, url: string) => (await answered<{ spec: unknown }>(send(st, 'GET', url))).spec;
    for (const url of ['/api/namespaces/mill/schedules/press', '/api/namespaces/mill/mcpservers/tracker'])
      assert.deepEqual(await spec(target, url), await spec(source, url), url);
    const here = await answered<FactoryObject>(send(source, 'GET', '/api/factories/mill'));
    const there = await answered<FactoryObject>(send(target, 'GET', '/api/factories/mill'));
    assert.deepEqual(there.spec.costLines, { press: 4 });
    assert.deepEqual(there.spec.costLines, here.spec.costLines);
  });

  await s.test('its volume is mounted at the path given, read-only as it was', () => {
    assert.deepEqual(filed.volumes, [{ name: key, path: otherThere }]);
    assert.deepEqual(
      fileOf(target, 'mill').volumes?.map((v) => [v.path, v.readOnly]),
      [[otherThere, true]],
    );
  });

  await s.test('its card is filed there unqueued, with no repository, naming its old name; the card a run keeps stays', () => {
    assert.deepEqual(filed.cards, [{ name: 'polish-it', was: 'polish-it' }]);
    const text = fs.readFileSync(path.join(target.home, 'inbox', 'polish-it.md'), 'utf8');
    assert.equal(/^(repo|queued):/m.test(text), false, text);
    assert.ok(text.includes('polish-it') && text.includes('laptop'), text);
    assert.equal(fs.existsSync(path.join(target.home, 'inbox', 'pressed.md')), false);
  });

  await s.test("the source's store is unchanged to the byte", () => {
    assert.deepEqual(digestsOf(source.home), before);
  });

  await s.test('REFUSED: a second import of it is a 409, and the target holds what it held', async () => {
    const held = filesOf(path.join(target.home, 'factories'));
    const cards = filesOf(path.join(target.home, 'inbox'));
    const res = await send(target, 'POST', '/api/factories/mill/import', { export: exp, from: 'laptop', volumes: { [key]: otherThere } });
    assert.equal(res.status, 409, await res.text());
    assert.deepEqual(filesOf(path.join(target.home, 'factories')), held);
    assert.deepEqual(filesOf(path.join(target.home, 'inbox')), cards);
  });

  await s.test(
    "an upgrade to the target's version merges against the base that moved: the tree's edit kept, the new version's change taken",
    async () => {
      const plan = await answered<FactoryPlan>(send(target, 'POST', '/api/factories/mill/diff', { to: '0.2.0' }));
      assert.equal(plan.kind, 'upgrade');
      if (plan.kind !== 'upgrade') return;
      assert.deepEqual([plan.from, plan.to, plan.merge.conflicts], ['0.1.0', '0.2.0', []]);
      const upgraded = await answered<FactoryUpgraded>(
        send(target, 'POST', '/api/factories/mill/upgrade', { to: '0.2.0', plan: plan.next.digest }),
      );
      assert.deepEqual([upgraded.from, upgraded.to, upgraded.conflicts], ['0.1.0', '0.2.0', 0]);
      await reconciled(target, NEWER);
      const tree = path.join(target.home, 'factories', 'mill', 'tree');
      assert.equal(fs.readFileSync(path.join(tree, DRAFT), 'utf8'), 'Draft it our way.\n', 'the edit made on the source is kept');
      assert.ok(fs.readFileSync(path.join(tree, DRAFTER), 'utf8').endsWith('You draft, and you cite.\n'), "0.2.0's change is taken");
    },
  );
});

test('REFUSED: the export of a factory the store does not hold is a 404, and of the default factory a 409', async () => {
  assert.equal((await send(source, 'GET', '/api/factories/ghost/export')).status, 404);
  assert.equal((await send(source, 'GET', '/api/factories/default/export')).status, 409);
  assert.equal(root === source.home, false, "the harness's own store is not the one asked");
});
