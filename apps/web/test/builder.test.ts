/**
 * The workflow builder's draft (src/lib/builder.ts): a folder drafted, edges drawn and taken away, steps added and removed, keys and
 * schemas set, the steps placed, the list fields, what a save sends, and a step's keys beside the agent attached to it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { KeyField, KeyForm, ListedStep, StepWritten, WorkflowListing, WorkflowStepSpec } from '../src/lib/api.ts';
import {
  addStep,
  connect,
  contextText,
  DEFAULT_ROUNDS,
  disconnect,
  draftGraph,
  draftOf,
  firstStep,
  listedWith,
  listOf,
  listUnsetWords,
  nameRefusal,
  numberOf,
  orderOf,
  placesOf,
  removeStep,
  schemasOf,
  setBody,
  setKey,
  setSchema,
  takes,
  tokensOf,
  toPut,
  UNSET,
  readmeSent,
  unsaved,
  unsavedSteps,
  type DraftStep,
} from '../src/lib/builder.ts';
import { COLUMN_WIDTH } from '../src/lib/layout.ts';

/** A spec with every key unset but `fields` and the `place: git` every step says. */
const spec = (fields: Partial<WorkflowStepSpec> = {}): WorkflowStepSpec => ({
  ...UNSET,
  place: 'git',
  after: [],
  input: [],
  disallowedTools: [],
  allowedTools: [],
  ...fields,
});
const listed = (name: string, fields: Partial<WorkflowStepSpec> = {}, body = `${name} it.`): ListedStep => ({
  name,
  spec: spec(fields),
  body,
  own: null,
  hired: null,
  layers: null,
  mcp: [],
});

/** implement ⇄ review, as the listing has a folder of yours. */
const folder: Pick<WorkflowListing, 'steps'> = {
  steps: [
    listed('implement', { check: 'npm test' }),
    listed('review', { after: ['implement'], output: 'review.schema.json', loop: 'implement', rounds: 3 }),
  ],
};

/** Listed steps as their files write them, as a save puts them back: without the factory's `hired`. */
const written = (steps: readonly ListedStep[]): StepWritten[] => steps.map(({ name, spec, body, own }) => ({ name, spec, body, own }));

const specOf = (steps: readonly DraftStep[], name: string) => steps.find((s) => s.name === name)!.spec;

test('draftOf, connect, disconnect, addStep, removeStep, setKey, setSchema: a workflow drafted on the canvas', async (t) => {
  await t.test('a folder as a draft is as it is listed, unsaved nowhere, and puts back as it was listed', () => {
    const draft = draftOf(folder);
    assert.deepEqual(
      draft.map((s) => s.schema),
      [null, null],
    );
    assert.equal(unsaved(draft, folder), false);
    assert.deepEqual(unsavedSteps(draft, folder), []);
    assert.deepEqual(toPut(draft), written(folder.steps));
    setKey(draft, 'implement', 'model', 'opus');
    draft[0].spec.after.push('x');
    assert.deepEqual(folder.steps[0].spec.after, [], 'the draft is a copy: it changes, and the listing does not');
  });
  await t.test(
    'an edge drawn from A to B writes `after: A` on B; drawn from the loop handle, `loop: B` on A with the default rounds; a second time, or to itself, nothing',
    () => {
      const draft = addStep(draftOf(folder), 'ship', 'Ship it.');
      const drawn = connect(draft, 'review', 'ship', false);
      assert.deepEqual(specOf(drawn, 'ship').after, ['review']);
      assert.deepEqual(unsavedSteps(drawn, folder), ['ship']);
      assert.deepEqual(connect(drawn, 'review', 'ship', false), drawn, 'once');
      assert.deepEqual(connect(drawn, 'ship', 'ship', false), drawn, 'not to itself');
      assert.deepEqual(connect(drawn, 'ship', 'nope', false), drawn, 'not to a step the draft does not have');

      const looped = connect(drawn, 'ship', 'implement', true);
      assert.deepEqual([specOf(looped, 'ship').loop, specOf(looped, 'ship').rounds], ['implement', DEFAULT_ROUNDS]);
      const kept = connect(setKey(drawn, 'ship', 'rounds', 5), 'ship', 'review', true);
      assert.deepEqual([specOf(kept, 'ship').loop, specOf(kept, 'ship').rounds], ['review', 5], 'rounds it has are kept');
      assert.deepEqual(draftGraph(looped).edges, [
        { from: 'implement', to: 'review', kind: 'after' },
        { from: 'review', to: 'implement', kind: 'loop', rounds: 3 },
        { from: 'review', to: 'ship', kind: 'after' },
        { from: 'ship', to: 'implement', kind: 'loop', rounds: 3 },
      ]);
    },
  );
  await t.test('an edge taken away takes its key: `after` — and `resume`, which after lists — or `loop` with its rounds', () => {
    const draft = draftOf(folder);
    const cut = disconnect(draft, 'implement->review');
    assert.deepEqual(specOf(cut, 'review').after, []);
    assert.deepEqual(unsavedSteps(cut, folder), ['review']);
    const unlooped = disconnect(draft, 'loop:review->implement');
    assert.deepEqual([specOf(unlooped, 'review').loop, specOf(unlooped, 'review').rounds], [null, null]);
    assert.deepEqual(draftGraph(unlooped).edges, [{ from: 'implement', to: 'review', kind: 'after' }]);

    const resumed = setKey(draftOf({ steps: [listed('draft'), listed('respond')] }), 'respond', 'resume', 'draft');
    assert.deepEqual(specOf(resumed, 'respond').after, ['draft'], 'resume waits on the step it names');
    const unresumed = disconnect(resumed, 'draft->respond');
    assert.deepEqual([specOf(unresumed, 'respond').after, specOf(unresumed, 'respond').resume], [[], null]);
    assert.deepEqual(disconnect(draft, 'not an edge'), draft);
  });
  await t.test(
    "a step added has a name and a body and sets nothing but the place the draft's steps say; a name there is none of or one taken is refused and adds nothing",
    () => {
      const draft = draftOf(folder);
      const added = addStep(draft, 'ship', 'Ship it.');
      assert.deepEqual(added.at(-1), { name: 'ship', spec: spec(), body: 'Ship it.', own: null, schema: null });
      const folders = draftOf({ steps: [listed('take', { place: 'folder' }), listed('write', { place: 'folder' })] });
      assert.equal(addStep(folders, 'file', 'File it.').at(-1)?.spec.place, 'folder', 'a step of a folder team works in folders too');
      assert.equal(
        addStep([], 'first', 'Begin.').at(-1)?.spec.place,
        null,
        'a draft of no step says no place to inherit: the save asks for one',
      );
      assert.equal(unsaved(added, folder), true);
      assert.deepEqual(unsavedSteps(added, folder), ['ship']);
      assert.equal(nameRefusal(draft, ''), 'A step needs a name: its file is <name>.md.');
      assert.equal(nameRefusal(draft, '  '), 'A step needs a name: its file is <name>.md.');
      assert.equal(nameRefusal(draft, 'review'), 'There is a step named review already.');
      assert.deepEqual(addStep(draft, 'review', 'Again.'), draft);
      assert.deepEqual(addStep(draft, '', 'Nothing.'), draft);
    },
  );
  await t.test(
    "REFUSED: a new workflow's first step with no place chosen, none being chosen for a person, or with no name or no words; given each, it says its place and sets nothing else",
    () => {
      assert.equal(firstStep('plan', 'Write PLAN.md.', null), null, 'no place chosen');
      assert.equal(firstStep(' ', 'Write PLAN.md.', 'git'), null, 'no name');
      assert.equal(firstStep('plan', ' ', 'git'), null, 'no words');
      assert.deepEqual(firstStep('plan', 'Write PLAN.md.', 'folder'), {
        name: 'plan',
        spec: { ...UNSET, place: 'folder' },
        body: 'Write PLAN.md.',
        own: null,
      });
      assert.equal(firstStep('plan', 'Write PLAN.md.', 'git')?.spec.place, 'git');
    },
  );
  await t.test('a step removed takes every key of another step that names it, and the draft is unsaved though no step left changed', () => {
    const draft = setKey(setKey(addStep(draftOf(folder), 'ship', 'Ship it.'), 'ship', 'after', ['review']), 'ship', 'input', ['review']);
    const gone = removeStep(draft, 'review');
    assert.deepEqual(
      gone.map((s) => s.name),
      ['implement', 'ship'],
    );
    assert.deepEqual([specOf(gone, 'ship').after, specOf(gone, 'ship').input], [[], []]);
    const loopGone = removeStep(draftOf(folder), 'implement');
    assert.deepEqual(
      [specOf(loopGone, 'review').after, specOf(loopGone, 'review').loop, specOf(loopGone, 'review').rounds],
      [[], null, null],
    );
    assert.deepEqual(unsavedSteps(removeStep(draftOf(folder), 'review'), folder), []);
    assert.equal(unsaved(removeStep(draftOf(folder), 'review'), folder), true);
  });
  await t.test('a key set is set as given, a loop brings its rounds and takes them away, and a body set is a change', () => {
    const draft = draftOf(folder);
    const set = setKey(setKey(draft, 'implement', 'model', 'opus'), 'implement', 'deadlineSeconds', 900);
    assert.deepEqual([specOf(set, 'implement').model, specOf(set, 'implement').deadlineSeconds], ['opus', 900]);
    const looped = setKey(draft, 'implement', 'loop', 'review');
    assert.equal(specOf(looped, 'implement').rounds, DEFAULT_ROUNDS);
    assert.equal(specOf(setKey(draft, 'review', 'loop', null), 'review').rounds, null);
    assert.deepEqual(unsavedSteps(setBody(draft, 'review', 'Review it twice.'), folder), ['review']);
    assert.equal(
      unsaved(setKey(setKey(draft, 'implement', 'model', 'opus'), 'implement', 'model', null), folder),
      false,
      'set back to what it was listed as, it is not a change',
    );
  });
  await t.test('a schema pasted names its file in `output:`, is a change until saved, and taken back leaves `output:` as it is', () => {
    const draft = draftOf(folder);
    const pasted = setSchema(draft, 'implement', { file: 'implement.schema.json', text: '{}' });
    assert.equal(specOf(pasted, 'implement').output, 'implement.schema.json');
    assert.deepEqual(unsavedSteps(pasted, folder), ['implement']);
    assert.equal(toPut(pasted)[0].spec.output, 'implement.schema.json');
    assert.equal('schema' in toPut(pasted)[0], false, 'a step put carries no paste: the save carries the schemas beside the steps');
    assert.deepEqual(
      schemasOf(pasted),
      [{ file: 'implement.schema.json', text: '{}' }],
      'and here they are, to be judged with the steps and written with them',
    );
    assert.deepEqual(schemasOf(draft), [], 'none pasted, none carried');
    const back = setSchema(pasted, 'implement', null);
    assert.equal(specOf(back, 'implement').output, 'implement.schema.json');
    assert.equal(setKey(back, 'implement', 'output', null)[0].spec.output, null);
  });
});

test('orderOf, listUnsetWords, listOf, numberOf, listedWith, readmeSent: the steps placed, the list fields, and what a save sends', async (t) => {
  await t.test('the steps are placed left to right by after; steps that wait on each other, which the package refuses, in a row', () => {
    const { at, cycle } = placesOf(draftOf(folder));
    assert.equal(cycle, false);
    assert.deepEqual(Object.fromEntries(at), { implement: { x: 0, y: 0 }, review: { x: COLUMN_WIDTH, y: 0 } });
    const round = connect(draftOf(folder), 'review', 'implement', false);
    const placed = placesOf(round);
    assert.equal(placed.cycle, true);
    assert.deepEqual(Object.fromEntries(placed.at), { implement: { x: 0, y: 0 }, review: { x: COLUMN_WIDTH, y: 0 } });
    assert.deepEqual(orderOf(round), ['implement', 'review'], 'and ordered as given');
    assert.deepEqual(
      orderOf(
        addStep(disconnect(draftOf(folder), 'implement->review'), 'plan', 'Plan it.').map((s) =>
          s.name === 'implement' ? { ...s, spec: { ...s.spec, after: ['plan'] } } : s,
        ),
      ),
      ['review', 'plan', 'implement'],
    );
  });
  await t.test(
    "an empty list field says what its key leaves unset: the harness's tools, nothing denied, nothing allowed, nothing counted",
    () => {
      assert.deepEqual((['tools', 'disallowedTools', 'allowedTools', 'tally'] as const).map(listUnsetWords), [
        "the harness's own set",
        'nothing denied',
        'nothing allowed',
        'nothing counted',
      ]);
    },
  );
  await t.test(
    "a step's servers are a list of its own: unset as none added, put back as set, and the draft's copy is not the listing's",
    () => {
      assert.equal(listUnsetWords('mcp'), 'no servers added');
      assert.deepEqual(UNSET.mcp, []);
      const named = { steps: [listed('look', { mcp: ['docs'] })] };
      const draft = draftOf(named);
      assert.deepEqual(toPut(draft)[0].spec.mcp, ['docs']);
      draft[0].spec.mcp.push('other');
      assert.deepEqual(named.steps[0].spec.mcp, ['docs'], 'the draft is a copy');
      assert.deepEqual(specOf(addStep(draftOf(named), 'ship', 'Ship it.'), 'ship').mcp, [], 'a new step names none');
    },
  );
  await t.test('what is typed into a list or a number field, as the listing has it', () => {
    assert.deepEqual(listOf('Read, Grep,  Bash(npm test) ,'), ['Read', 'Grep', 'Bash(npm test)']);
    assert.deepEqual(listOf('  '), []);
    assert.deepEqual(listOf('review, apps/site:lay-out'), ['review', 'apps/site:lay-out'], 'a skill named with its folder is kept whole');
    assert.equal(numberOf(''), null);
    assert.equal(numberOf(' 900 '), 900);
    assert.equal(numberOf('2.50'), 2.5);
    assert.equal(numberOf('-1'), -1, 'the package refuses it on save, in its words');
    for (const [typed, tokens] of [
      ['200k', 200_000],
      [' 150000 ', 150_000],
      ['100K', 100_000],
      ['1M', 1_000_000],
      ['50k', 50_000],
    ] as const)
      assert.equal(tokensOf(typed), tokens, `${typed}: a context window as a person writes it and as the package reads it`);
    for (const typed of ['', 'lots', '200 k', '1.5M', '200,000', '0', '-1']) assert.equal(tokensOf(typed), null, typed);
    assert.deepEqual(
      [contextText(150_000), contextText(1_000_000), contextText(123_456)],
      ['150k', '1000k', '123456'],
      "a context window written back in the package's one form",
    );
  });
  await t.test(
    "a folder written goes into the page's listing in the listing's order: the repository's, then yours, each by name — once",
    () => {
      const w = (name: string, from: 'repo' | 'yours'): WorkflowListing => ({
        name,
        from,
        dir: `/${from}/${name}`,
        description: null,
        readme: null,
        steps: [],
        graph: { roots: [], edges: [] },
        schemas: [],
        folderTeam: false,
        version: '0',
        error: null,
        unfilled: null,
      });
      const list = [w('dev', 'repo'), w('ui', 'repo'), w('mine', 'yours')];
      assert.deepEqual(
        listedWith(list, w('built', 'yours')).map((x) => `${x.from}:${x.name}`),
        ['repo:dev', 'repo:ui', 'yours:built', 'yours:mine'],
      );
      assert.deepEqual(
        listedWith(list, { ...w('mine', 'yours'), description: 'Mine.' }).map((x) => x.description),
        [null, null, 'Mine.'],
      );
      assert.deepEqual(
        listedWith(undefined, w('built', 'yours')).map((x) => x.name),
        ['built'],
      );
    },
  );
  await t.test(
    "a README is sent only when the draft is not what was listed: none as it was, none blank over no README, '' over one cleared",
    () => {
      const listed = { readme: '# dev\n\nImplement, then review.\n' };
      assert.equal(readmeSent('# dev\n\nImplement, then review.\n', listed), undefined, 'unchanged: not sent');
      assert.equal(readmeSent('# dev\n\nPlan first.\n', listed), '# dev\n\nPlan first.\n', 'changed: the text');
      assert.equal(readmeSent('', { readme: null }), undefined, 'blank over a folder with no README: no empty README is written');
      assert.equal(readmeSent('A first README.\n', { readme: null }), 'A first README.\n', 'written over none: the text');
      assert.equal(readmeSent('', listed), '', 'cleared: sent blank');
    },
  );
});

/** `build`, whose agent `coder` gives it its harness, model and effort, with a check and a note of its own — as the listing has it. */
const attached: Pick<WorkflowListing, 'steps'> = {
  steps: [
    {
      name: 'build',
      spec: spec({ agent: 'coder', harness: 'claude', model: 'opus', effort: 'high', check: 'npm test' }),
      body: 'You write code.\n\nMind the cache.',
      own: { keys: ['check'], body: 'Mind the cache.' },
      hired: null,
      layers: null,
      mcp: [],
    },
  ],
};

/** What the api says each agent gives a step: `coder` as `attached` has it, and `reviewer`, which sets a model and nothing else. */
const agents: Pick<KeyForm, 'roleKeys' | 'agents'> = {
  roleKeys: [
    'harness',
    'model',
    'effort',
    'context',
    'permissionMode',
    'sandbox',
    'tools',
    'disallowedTools',
    'allowedTools',
    'remote',
    'output',
  ],
  agents: { coder: { harness: 'claude', model: 'opus', effort: 'high' }, reviewer: { model: 'sonnet' } },
};

test("a step with an agent: what it owns, what its agent gives it, and the keys its harness and its agent's place allow", async (t) => {
  await t.test(
    "a step with an agent: a key changed is its own, one unset is its agent's again, and its body is its own note — each a change, put back with what it sets itself",
    () => {
      const draft = draftOf(attached);
      assert.deepEqual(toPut(draft), written(attached.steps), 'as listed');
      assert.equal(unsaved(draft, attached), false);

      const lower = setKey(draft, 'build', 'effort', 'low');
      assert.deepEqual(lower[0].own, { keys: ['check', 'effort'], body: 'Mind the cache.' });
      assert.deepEqual(unsavedSteps(lower, attached), ['build']);
      const back = setKey(setKey(lower, 'build', 'check', null), 'build', 'effort', null);
      assert.deepEqual(
        back[0].own!.keys,
        [],
        "unset, the check is left to the agent, which sets none, and the effort changed back to the agent's is the agent's again",
      );

      const noted = setBody(draft, 'build', 'Mind the index.');
      assert.deepEqual(
        [noted[0].body, noted[0].own!.body],
        ['You write code.\n\nMind the cache.', 'Mind the index.'],
        "the note, not the agent's words",
      );
      assert.deepEqual(unsavedSteps(noted, attached), ['build']);

      const pasted = setSchema(draft, 'build', { file: 'build.schema.json', text: '{}' });
      assert.ok(pasted[0].own!.keys.includes('output'), 'a schema pasted is its own output');
    },
  );
  await t.test(
    'an agent attached to a step makes what it has its own; taken away, the step keeps what its agent gave it, words and all',
    () => {
      const plain = draftOf({ steps: [listed('build', { model: 'sonnet', check: 'npm test' }, 'Build it.')] });
      const given = setKey(plain, 'build', 'agent', 'coder');
      assert.deepEqual([given[0].spec.agent, given[0].own], ['coder', { keys: ['model', 'place', 'check'], body: 'Build it.' }]);

      const taken = setKey(draftOf(attached), 'build', 'agent', null);
      assert.deepEqual(
        [taken[0].spec.agent, taken[0].own, taken[0].body, taken[0].spec.model],
        [null, null, 'You write code.\n\nMind the cache.', 'opus'],
      );
    },
  );
  await t.test(
    'a step moved to another agent shows what that agent gives it, and nothing the last one gave; its own keys stay its own',
    () => {
      const moved = setKey(draftOf(attached), 'build', 'agent', 'reviewer', agents);
      assert.deepEqual(
        [moved[0].spec.model, moved[0].spec.effort, moved[0].spec.harness],
        ['sonnet', null, null],
        "reviewer's model, not coder's opus and high",
      );
      assert.deepEqual([moved[0].spec.check, moved[0].own], ['npm test', { keys: ['check'], body: 'Mind the cache.' }]);

      const plain = draftOf({ steps: [listed('build', { model: 'sonnet' }, 'Build it.')] });
      const given = setKey(plain, 'build', 'agent', 'coder', agents);
      assert.deepEqual(
        [given[0].spec.model, given[0].spec.effort, given[0].spec.harness],
        ['sonnet', 'high', 'claude'],
        "its own model, the rest the agent's",
      );

      const unset = setKey(setKey(draftOf(attached), 'build', 'effort', 'low', agents), 'build', 'effort', null, agents);
      assert.deepEqual([unset[0].spec.effort, unset[0].own!.keys], ['high', ['check']], "an own key unset shows the agent's value again");
    },
  );
  await t.test("a step's form has its harness's fence alone: a permission mode on Claude Code, a sandbox on codex", () => {
    const harness: KeyField = {
      key: 'harness',
      meaning: '',
      kind: 'choice',
      choices: ['claude', 'codex'],
      byHarness: null,
    };
    const permissionMode = {
      key: 'permissionMode',
      byHarness: { claude: ['dontAsk'] },
    } satisfies Pick<KeyField, 'key' | 'byHarness'>;
    const sandbox = { key: 'sandbox', byHarness: { codex: ['read-only'] } } satisfies Pick<KeyField, 'key' | 'byHarness'>;
    const form: Pick<KeyForm, 'keys' | 'remote'> = { keys: [harness], remote: { prefix: 'a2a:', refuses: ['model', 'permissionMode'] } };
    assert.deepEqual([takes(form, sandbox, 'codex'), takes(form, permissionMode, 'codex')], [true, false]);
    assert.deepEqual([takes(form, sandbox, 'claude'), takes(form, permissionMode, 'claude')], [false, true]);
    assert.equal(
      takes(form, { key: 'deadlineSeconds', byHarness: null }, 'codex'),
      true,
      "a key that is not a harness word is every harness's",
    );
    assert.equal(takes(form, sandbox, 'nowhere'), true, 'a harness the form does not know is judged on save');
    assert.equal(UNSET.sandbox, null);
  });
  await t.test(
    'a step on a remote A2A agent has none of the keys the package refuses there, whether or not the form lists the agent',
    () => {
      const harness: KeyField = {
        key: 'harness',
        meaning: '',
        kind: 'choice',
        choices: ['claude', 'codex', 'a2a:reviewer'],
        byHarness: null,
      };
      const form: Pick<KeyForm, 'keys' | 'remote'> = {
        keys: [harness],
        remote: { prefix: 'a2a:', refuses: ['model', 'permissionMode', 'tools', 'check'] },
      };
      const model = { key: 'model', byHarness: { claude: ['opus'], codex: ['gpt-5.5'] } } satisfies Pick<KeyField, 'key' | 'byHarness'>;
      const tools = { key: 'tools', byHarness: null } satisfies Pick<KeyField, 'key' | 'byHarness'>;
      const deadline = { key: 'deadlineSeconds', byHarness: null } satisfies Pick<KeyField, 'key' | 'byHarness'>;
      assert.deepEqual(
        [takes(form, model, 'a2a:reviewer'), takes(form, tools, 'a2a:reviewer'), takes(form, deadline, 'a2a:reviewer')],
        [false, false, true],
      );
      assert.equal(takes(form, tools, 'a2a:gone'), false, 'a name the store no longer declares is still remote');
      assert.deepEqual([takes(form, model, 'claude'), takes(form, tools, 'claude')], [true, true], 'a harness of ours keeps them');
      assert.equal(
        takes({ keys: form.keys } as unknown as Pick<KeyForm, 'keys' | 'remote'>, tools, 'a2a:reviewer'),
        true,
        'an api that sends no `remote`, which the type does not allow, has nothing hidden for it',
      );
    },
  );
  await t.test(
    "REFUSED: a listing read in a factory that hires into a step is not drafted — a save would write the hire into the step's file",
    () => {
      const hiredIn = (hired: string | null): Pick<WorkflowListing, 'steps'> => ({
        steps: [{ ...listed('implement', { agent: 'ada', harness: 'claude' }), hired }],
      });
      assert.throws(
        () => draftOf(hiredIn('ada')),
        (err: Error) =>
          err.message.includes('The step implement') &&
          err.message.includes('with ada') &&
          err.message.includes('without ?factory= (workflowsQuery)'),
      );
      const unhired = toPut(draftOf(hiredIn(null)));
      assert.equal('hired' in unhired[0], false, 'a step put carries no hire');
      assert.equal(unhired[0].spec.agent, 'ada', 'drafted, a step whose file writes an agent puts it back');
    },
  );
});
