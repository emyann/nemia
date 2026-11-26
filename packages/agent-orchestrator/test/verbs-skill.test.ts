/**
 * Nemia's `verbs` skill is the command table's, generated (`verbsSkill`): the shipped file is what the table renders today, a command added
 * without regenerating it is refused, and every verb the CLI serves her is listed under its class, none out of her reach, each with the
 * tools that serve it on the MCP port or why the command line alone runs it, so either seat reads it. Her shell seat is told what the port
 * tells an outside session (`unsaid`, `guidanceUnsaid`): each line of each port tool's description in its section of `tools.md`, which
 * the tool's verb names, and each paragraph of the port's guidance in its shell form under Start here, but the port's seat's alone.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Api, GUIDANCE, type Guidance, toolDescriptionOf, toolLinesOf, toolWordsOf, type ToolWords } from 'objects';
import { REGENERATE, toolsReference, toolsReferenceOf, verbsSkill, verbsSkillOf } from '../src/nemia/verbs.verb.ts';
import { TABLE } from '../src/command/commands.verb.ts';
import { CLI_VERBS, toolsOf } from '../src/command/command.ts';
import { ANSWERS, PENDING, REFUSED_FLAGS, REFUSED_WORDS } from './command-words.ts';

const SKILL = path.join(import.meta.dirname, '..', 'nemia', 'skills', 'verbs', 'SKILL.md');
const TOOLS_MD = path.join(import.meta.dirname, '..', 'nemia', 'skills', 'verbs', 'tools.md');

/** The section of `text` under the heading `heading`, to the next heading. */
const sectionOf = (text: string, heading: string) => {
  const at = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(at, -1, `the skill has a section ${heading}`);
  const next = text.indexOf('\n## ', at + 1);
  return text.slice(at, next === -1 ? undefined : next);
};

/** Whether `text` lists the command `name` as a usage line of its own. */
const lists = (text: string, name: string) => new RegExp(`^  nemia ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?: |$)`, 'm').test(text);

test('the shipped verbs skill is what the command table renders today', () => {
  assert.equal(
    fs.readFileSync(SKILL, 'utf8'),
    verbsSkill(),
    `nemia/skills/verbs/SKILL.md is not the table's: regenerate it from the repository's root: ${REGENERATE}`,
  );
});

test('the shipped tools.md is what the table and the Api render today', () => {
  assert.equal(
    fs.readFileSync(TOOLS_MD, 'utf8'),
    toolsReference(),
    `nemia/skills/verbs/tools.md is not the table's: regenerate it from the repository's root: ${REGENERATE}`,
  );
});

test('REFUSED: a command added to the table without regenerating the skill renders apart from the shipped file, under its class', () => {
  const planted = { name: 'planted', usage: '<x>', help: ['a planted verb'], class: 'act' as const };
  const rendered = verbsSkillOf([...TABLE, planted], CLI_VERBS);
  assert.notEqual(rendered, fs.readFileSync(SKILL, 'utf8'));
  assert.ok(lists(sectionOf(rendered, 'Yours'), 'planted'), 'the planted verb is listed under Yours');
  assert.ok(!lists(sectionOf(rendered, 'Reads'), 'planted'), 'and under no other class');
});

test('every command the CLI serves her is listed, and none out of her reach nor one the api alone serves but the CLI’s own verbs', () => {
  const text = verbsSkill();
  const served = TABLE.filter((c) => c.only?.side !== 'api' && c.class !== 'none');
  assert.deepEqual(
    served.filter((c) => !lists(text, c.name)).map((c) => c.name),
    [],
  );
  for (const name of ['tick', 'up']) assert.ok(!lists(text, name), `${name} is not listed`);
  for (const verb of CLI_VERBS) assert.ok(lists(sectionOf(text, 'Reads'), verb.name), `${verb.name} is listed as a read`);
});

test('the library’s writers are listed by who answers for them: a make or an edit is hers, a removal prompts the person, a try is hers', () => {
  const text = verbsSkill();
  for (const name of ['agents write', 'skills write', 'workflows write'])
    assert.ok(lists(sectionOf(text, 'Yours'), name), `${name} is hers to run unasked`);
  for (const name of ['agents rm', 'workflows rm'])
    assert.ok(lists(sectionOf(text, 'Prompts the person'), name), `${name} prompts the person`);
  assert.ok(lists(sectionOf(text, 'Yours'), 'agents run'), 'agents run is hers to run unasked');
});

test('the verbs the api serves beside the table are said once, each with its class, and none is an entry of the table too', () => {
  assert.deepEqual(
    CLI_VERBS.map((v) => [v.name, v.class]),
    [
      ['decide', 'read'],
      ['get', 'read'],
      ['explain', 'read'],
      ['quota', 'read'],
      ['library', 'read'],
      ['lines', 'read'],
      ['server version', 'read'],
      ['server upgrades', 'read'],
      ['capabilities', 'read'],
      ['repository', 'read'],
      ['store', 'read'],
      ['milestones', 'read'],
      ['factory commands', 'read'],
      ['factory server sign-in', 'read'],
      ['workflows keys', 'read'],
    ],
  );
  assert.deepEqual(
    CLI_VERBS.filter((verb) => TABLE.some((c) => c.name === verb.name)).map((v) => v.name),
    [],
  );
});

test('a command that reads bare is listed as a read, with the words that make it prompt the person', () => {
  const reads = sectionOf(verbsSkill(), 'Reads');
  assert.ok(lists(reads, 'level'), 'level is a read');
  assert.match(reads, /reads bare; prompts the person given manual, semi-auto/);
  assert.match(reads, /reads bare; prompts the person given --path, --store, --clear/);
  assert.ok(!lists(sectionOf(verbsSkill(), 'Prompts the person'), 'level'), 'and not listed with what prompts');
});

test('a class the person answers is listed with what it answers, and the skill that brings it first', () => {
  const answers = sectionOf(verbsSkill(), 'Answers what waits');
  const listed = [...answers.matchAll(/^ {2}nemia (\S+)/gm)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), [...ANSWERS].sort(), 'approve and retry alone answer what waits');
  assert.match(answers, /`bring-what-waits` skill/);
  assert.match(answers, /--round/, 'another round is said as retry --round');
  assert.match(answers, /--continue/, "a try that continues its session is said as retry's --continue");
});

test('the skill lists no verb named by a refused word but those pending, and no renamed flag', () => {
  const pending = new Set(PENDING.map((p) => p.name));
  const usages = [...verbsSkill().matchAll(/^ {2}nemia (.+)$/gm)].map((m) => m[1]);
  const named = TABLE.map((c) => c.name).filter((n) => usages.some((u) => u === n || u.startsWith(`${n} `)));
  assert.deepEqual(
    named.filter((n) => !pending.has(n) && n.split(' ').some((w) => REFUSED_WORDS.includes(w))),
    [],
  );
  assert.deepEqual(
    usages.filter((u) => REFUSED_FLAGS.some((f) => u.includes(f))),
    [],
  );
  assert.ok(
    usages.some((u) => u.startsWith('refresh ') && u.includes('--base')),
    'the base is taken by refresh --base',
  );
});

/** The lines `text` lists under the command `name`'s usage line, to the next usage line or the block's end. */
const blockOf = (text: string, name: string) => {
  const lines = text.split('\n');
  const at = lines.findIndex((line) => line === `  nemia ${name}` || line.startsWith(`  nemia ${name} `));
  assert.notEqual(at, -1, `${name} is listed`);
  const end = lines.findIndex((line, i) => i > at && !line.startsWith('    '));
  return lines.slice(at + 1, end).join('\n');
};

/** What a listed verb's block says of the port: its tools, or that the command line alone runs it, and why. */
const portSaid = (c: { name: string; served?: Parameters<typeof toolsOf>[0]['served']; only?: { side: string; why: string } }) => {
  const tools = toolsOf(c).map((t) => t.tool);
  return tools.length > 0 ? `on the port: ${tools.join(', ')}` : `CLI only: ${c.only?.why}`;
};

test('each listed verb names its tools on the port, or why the command line alone runs it', () => {
  const text = verbsSkill();
  const listed = [...TABLE.filter((c) => c.only?.side !== 'api' && c.class !== 'none'), ...CLI_VERBS];
  assert.ok(listed.some((c) => toolsOf(c).length > 1) && listed.some((c) => toolsOf(c).length === 0), 'both kinds are listed');
  const says = (c: (typeof listed)[number]) =>
    blockOf(text, c.name)
      .split('\n')
      .map((line) => line.trim())
      .includes(portSaid(c));
  assert.deepEqual(
    listed.filter((c) => !says(c)).map((c) => c.name),
    [],
  );
  assert.match(blockOf(text, 'hold'), /on the port: hold, unhold$/, 'every link of an entry is a tool');
});

test('REFUSED: a planted verb linked to an endpoint is listed with its tools, and one the command line alone runs with its why', () => {
  const linked = {
    name: 'planted',
    usage: '',
    help: ['a planted verb'],
    class: 'act' as const,
    served: [{ endpoint: 'runs.hold' as const }, { endpoint: 'runs.unhold' as const, as: 'unplanted' }] as const,
  };
  const alone = {
    name: 'alone',
    usage: '',
    help: ['a verb of the shell'],
    class: 'act' as const,
    only: { side: 'cli' as const, why: 'it reads the machine it runs on' },
  };
  const rendered = verbsSkillOf([...TABLE, linked, alone], CLI_VERBS);
  assert.match(blockOf(rendered, 'planted'), /on the port: planted, unplanted$/);
  assert.match(blockOf(rendered, 'alone'), /CLI only: it reads the machine it runs on$/);
});

/** The section of `text` headed `## <name>`, to the next such heading; empty where it has none. */
const toolSectionOf = (text: string, name: string) => {
  const at = text.indexOf(`\n## ${name}\n`);
  if (at === -1) return '';
  const next = text.indexOf('\n## ', at + 1);
  return text.slice(at, next === -1 ? undefined : next);
};

/** Whether `section` says the key `key`'s words on a line of its own, its shell spelling between them where it has one. */
const saysKey = (section: string, key: string, words: string) =>
  section
    .split('\n')
    .some((line) => line === `- ${key}: ${words}` || (line.startsWith(`- ${key} (`) && line.endsWith(` at a shell): ${words}`)));

/** A port tool beside the verb it is a link of, as `toolWordsOf` reads it. */
type PortToolOf = { readonly verb: Parameters<typeof toolLinesOf>[0]; readonly words: ToolWords };

/**
 * Each line of a port tool's description that `reference` does not say in that tool's section, as `<tool>: <line>`: its help lines, what
 * its endpoint does, its usage, its call, each key's words beside its key, and each answer line after `On the port: `.
 */
const unsaid = (reference: string, tools: readonly PortToolOf[]) =>
  tools.flatMap(({ verb, words }) => {
    const section = toolSectionOf(reference, words.name).split('\n');
    const lines = toolLinesOf(verb, words);
    const has = (line: string) => section.includes(line);
    const missing = [
      ...lines.help.filter((line) => !has(`    ${line}`)),
      ...[lines.said].filter((line) => !has(line)),
      ...[lines.usage].filter((line) => !has(`  ${line}`)),
      ...[lines.call].filter((line) => !has(`Calls \`${line}\`.`)),
      ...words.keys.filter((k) => !saysKey(section.join('\n'), k.key, k.words)).map((k) => `${k.key}: ${k.words}`),
      ...lines.answers.filter((line) => !has(`- On the port: ${line}`)),
    ];
    return missing.map((line) => `${words.name}: ${line}`);
  });

/** Every tool the port lists, beside its verb, in the port's order. */
const PORT_TOOLS: readonly PortToolOf[] = toolWordsOf<PortToolOf['verb'] & Pick<(typeof CLI_VERBS)[number], 'served'>>(
  TABLE,
  CLI_VERBS,
  Api,
);

test('every tool the port lists has a section in tools.md that says each line of its description', () => {
  assert.ok(PORT_TOOLS.length > 100, `${PORT_TOOLS.length} tools read off the tables`);
  assert.deepEqual(unsaid(fs.readFileSync(TOOLS_MD, 'utf8'), PORT_TOOLS), []);
});

test('each port tool describes itself by the lines tools.md is held to, and no line besides', () => {
  assert.deepEqual(
    PORT_TOOLS.filter(({ verb, words }) => {
      const lines = toolLinesOf(verb, words);
      const parts = [...lines.help, lines.said, lines.usage, lines.call, ...lines.keys, ...lines.answers];
      const described = toolDescriptionOf(verb, words)
        .split('\n')
        .filter((line) => line.trim() !== '');
      return JSON.stringify(described) !== JSON.stringify(parts);
    }).map(({ words }) => words.name),
    [],
  );
});

test("REFUSED: a tool's endpoint paragraph taken out, or a planted verb's key left unsaid, is named by the tool and the line", () => {
  const hold = PORT_TOOLS.find((t) => t.words.name === 'hold');
  assert.ok(hold, 'the port lists hold');
  const cut = toolsReference().replace(`\n${hold.words.said}\n`, '\n');
  assert.deepEqual(unsaid(cut, [hold]), [`hold: ${hold.words.said}`]);
  const planted = {
    name: 'planted',
    usage: '',
    help: ['a planted verb'],
    class: 'act' as const,
    served: [{ endpoint: 'runs.hold' as const }] as const,
  };
  const [plantedTool] = toolWordsOf([planted], [], Api);
  assert.ok(plantedTool, 'the planted verb is a tool');
  const until = plantedTool.words.keys.find((k) => k.key === 'until');
  assert.ok(until, "hold's payload says what until takes");
  const rendered = toolsReferenceOf([...TABLE, planted], CLI_VERBS, Api);
  assert.deepEqual(unsaid(rendered, [plantedTool]), [], 'rendered whole, the planted tool says every line');
  const left = rendered
    .split('\n')
    .filter((line) => !(line.startsWith('- until') && line.endsWith(until.words)))
    .join('\n');
  assert.ok(unsaid(left, [plantedTool]).includes(`planted: until: ${until.words}`), 'the planted key left unsaid is named');
});

test("her skill carries decide's and quota's endpoint descriptions and arguments as their port tools do", () => {
  const text = fs.readFileSync(TOOLS_MD, 'utf8');
  const endpoints = new Map(
    Object.values(Api.groups).flatMap((g) => Object.values(g.endpoints).map((e) => [`${g.identifier}.${e.identifier}`, e] as const)),
  );
  for (const [name, endpoint] of [
    ['decide', 'runs.decision'],
    ['quota', 'server.quota'],
  ] as const) {
    const tool = PORT_TOOLS.find((t) => t.words.name === name);
    assert.ok(tool && tool.words.endpoint === endpoint && endpoints.has(endpoint), `${name} is the port's tool of ${endpoint}`);
    const section = toolSectionOf(text, name);
    assert.ok(section.includes(`\n${tool.words.said}\n`), `${name} says what ${endpoint} does`);
    for (const { key, words } of tool.words.keys) assert.ok(saysKey(section, key, words), `${name} says ${key}`);
  }
  assert.deepEqual(
    PORT_TOOLS.find((t) => t.words.name === 'decide')?.words.keys.map((k) => k.key),
    ['runId', 'sensitive', 'diffs'],
  );
});

/** Each paragraph of `guidance` whose shell form `skill`'s Start here does not hold, and each kept from her but those `outside` names. */
const guidanceUnsaid = (skill: string, guidance: readonly Guidance[], outside: readonly string[]) => {
  const start = sectionOf(skill, 'Start here');
  return [
    ...guidance.filter((g) => g.shell !== null && !start.includes(g.shell)).map((g) => `unsaid: ${g.id}`),
    ...guidance.filter((g) => g.shell === null && !outside.includes(g.id)).map((g) => `the port's alone: ${g.id}`),
  ];
};

test("every paragraph of the port's guidance is in her skill's Start here in its shell form, but those the outside seat's alone", () => {
  assert.deepEqual(guidanceUnsaid(fs.readFileSync(SKILL, 'utf8'), GUIDANCE, ['skills', 'resources']), []);
  assert.deepEqual(
    GUIDANCE.filter((g) => g.shell === null).map((g) => g.id),
    ['skills', 'resources'],
  );
});

test('REFUSED: a paragraph whose shell form is not rendered, and a second kept from her, are named', () => {
  const planted: Guidance = { id: 'answers', port: 'p', shell: 'a planted paragraph' };
  const kept: Guidance = { id: 'search', port: 'p', shell: null };
  assert.deepEqual(guidanceUnsaid(verbsSkill(), [...GUIDANCE, planted, kept], ['skills', 'resources']), [
    'unsaid: answers',
    "the port's alone: search",
  ]);
});

test("each verb's block names the section of tools.md that says each of its tools' words, and tools.md has that section", () => {
  const text = verbsSkill();
  const reference = toolsReference();
  const listed = [...TABLE.filter((c) => c.only?.side !== 'api' && c.class !== 'none'), ...CLI_VERBS].filter((c) => toolsOf(c).length > 0);
  const names = (c: (typeof listed)[number]) => toolsOf(c).map((t) => t.tool);
  const named = (c: (typeof listed)[number]) =>
    blockOf(text, c.name)
      .split('\n')
      .map((line) => line.trim())
      .includes(
        `each tool's words: ${names(c)
          .map((n) => `tools.md#${n}`)
          .join(', ')}`,
      );
  assert.deepEqual(
    listed.filter((c) => !named(c)).map((c) => c.name),
    [],
  );
  assert.deepEqual(
    listed.flatMap(names).filter((n) => toolSectionOf(reference, n) === ''),
    [],
  );
});

test("a key is spelled as a shell types it where the verb's spec says, and an api-only verb's section says no nemia verb runs it", () => {
  const text = toolsReference();
  assert.match(toolSectionOf(text, 'ls'), /^- selector \(-l at a shell\): /m);
  assert.match(toolSectionOf(text, 'closeout'), /^- runId \(<runId> at a shell\): /m);
  assert.match(toolSectionOf(text, 'ls'), /^- fieldSelector: /m, 'a key the spec does not say is given with no shell spelling');
  assert.match(toolSectionOf(text, 'try'), /the port's alone: no `nemia` verb runs it at a shell/);
  assert.doesNotMatch(toolSectionOf(text, 'ls'), /the port's alone/);
});
