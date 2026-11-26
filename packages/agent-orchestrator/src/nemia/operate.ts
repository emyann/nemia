/**
 * Nemia's `operate` skill, generated from her definition (`agents/nemia.md`): her role said to a session outside the store that is
 * connected to its MCP port, which serves her skills folder whole (`NEMIA_SKILLS`). Its frontmatter, one fixed line that seats the
 * reader outside, then her definition's body as it stands, so one text says her role to both seats. Built in as
 * `nemia/skills/operate/SKILL.md`, and held to her definition by `test/operate-skill.test.ts`, which names `REGENERATE_OPERATE` when
 * either drifts. Pure: the command and the test read her definition and hand it in (the command on its standard input).
 */
import { renderFrontmatter } from '../frontmatter/frontmatter.ts';
import { splitFrontmatter } from '../step/step.ts';

/** The command that writes the skill again from her definition, from the repository's root. */
export const REGENERATE_OPERATE =
  `node -e "import('./packages/agent-orchestrator/src/nemia/operate.ts').then(async (m) => { let text = ''; ` +
  `for await (const chunk of process.stdin) text += chunk; process.stdout.write(m.operateSkillOf(text)); })" ` +
  '< packages/agent-orchestrator/nemia/agents/nemia.md > packages/agent-orchestrator/nemia/skills/operate/SKILL.md';

/** What the skill says it is for, as a session lists it before loading it. */
const DESCRIPTION =
  "Start here when you operate a Nemia store from outside it, connected to its MCP port: Nemia's role, the operator's, as you take " +
  'it — what waits on the person, what is yours to do, what still prompts them, and how each verb is called as a tool of this server.';

/** The line that seats the reader: the outside seat, its verbs the port's tools. */
const SEATED =
  "You read this through the store's MCP port: you sit in the outside seat below, each verb a tool of this server, and the other skills " +
  'it names are skills of this server too.';

/**
 * The text of the `operate` skill for her definition `definition`: its frontmatter, written as YAML (`renderFrontmatter`), the note that
 * it is generated with `REGENERATE_OPERATE`, the line that seats its reader outside, then the definition's body.
 * @param definition The text of her definition, frontmatter and body, as `agents/nemia.md` holds it.
 */
export function operateSkillOf(definition: string) {
  const { body } = splitFrontmatter('agents/nemia.md', definition);
  return [
    '---',
    renderFrontmatter([
      ['name', 'operate'],
      ['description', DESCRIPTION],
    ]).replace(/\n$/, ''),
    '---',
    SEATED,
    '',
    `Generated from her definition, never edited by hand: from the repository's root, \`${REGENERATE_OPERATE}\`.`,
    '',
    body,
    '',
  ].join('\n');
}
