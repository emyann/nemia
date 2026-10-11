import { frameTabsOf, railOf, sidebar } from '../board.ts';
import { expectCount, expectTexts, expectVisible } from '../checks.ts';
import { CHECKOUT, WORKFLOWS } from '../seed.ts';
import type { PageSpec } from '../visit.ts';

export default {
  /**
   * The Capabilities page, a tab of Machines & Capabilities: the checkout's skills, agents, MCP servers, deny rules and ask rules, each
   * with where it was read from, and what each step gets — the checkout's dev, review fenced to its tools in dontAsk and implement on the
   * harness's own set, and yours, on Codex, which claims nothing it was not measured to have.
   */
  name: 'capabilities',
  route: '/capabilities',
  expect: async (page) => {
    await sidebar(page);
    await expectVisible(
      railOf(page).locator('a[data-active="true"][aria-label="Machines & Capabilities"]'),
      'the rail lights Machines & Capabilities on its page',
    );
    await expectTexts(frameTabsOf(page).locator('[aria-selected="true"]'), ['Capabilities'], "the strip's Capabilities tab is selected");
    const { skill, bareSkill, agent, server, missing, denied, asked } = CHECKOUT;
    const section = (title: string) => page.locator(`section[aria-label="${title}"]`);
    for (const [title, count] of [
      ['Skills', 2],
      ['Agents', 1],
      ['MCP servers', 2],
      ['Denied', denied.length],
      ['Asks', asked.length],
    ] as const) {
      await expectVisible(
        section(title).locator('h2 [data-count]', { hasText: new RegExp(`^${count}$`) }),
        `the ${title} section counts ${count}`,
      );
    }

    const skills = section('Skills');
    await expectVisible(
      skills.getByText(skill.name, { exact: true }),
      `the skill in .claude/skills/${skill.dir} by the name its frontmatter gives (${skill.name})`,
    );
    await expectVisible(skills.getByText(skill.description, { exact: true }), `${skill.name} with its description`);
    await expectVisible(
      skills.getByText(`.claude/skills/${skill.dir}/SKILL.md`, { exact: true }),
      `${skill.name} with where it was read from`,
    );
    await expectVisible(
      skills.getByText(bareSkill, { exact: true }),
      `a SKILL.md without frontmatter, listed by its directory (${bareSkill})`,
    );
    const agents = section('Agents');
    await expectVisible(agents.getByText(agent.description, { exact: true }), `the agent ${agent.name} with its description`);
    await expectVisible(agents.getByText(`.claude/agents/${agent.file}`, { exact: true }), `${agent.name} with where it was read from`);

    const listing = page.locator(`li[aria-label="MCP server ${server.name}"]`);
    await expectVisible(listing.getByText('enabled', { exact: true }), `${server.name} reads as enabled by the settings`);
    for (const tool of server.tools) {
      await expectVisible(
        listing.locator('li').getByText(tool, { exact: true }),
        `${server.name} lists ${tool}, as the server itself answered tools/list`,
      );
    }
    await expectVisible(listing.getByText(server.said, { exact: true }), 'a tool with the first line of its description');
    await expectCount(listing.getByText(server.secondLine), 0, 'and only its first line');
    await expectVisible(
      listing.locator(`li[data-denied="${server.denied}"]`, { hasText: 'denied' }),
      `the tool ${server.denied} refuses is marked denied`,
    );
    await expectVisible(listing.getByText('.mcp.json', { exact: true }).first(), `${server.name} with where it was read from`);
    await expectVisible(
      page.locator(`li[aria-label="MCP server ${missing.name}"]`).getByText(`there is no command \`${missing.command}\``),
      `a server whose command does not exist shows its error on its entry (${missing.name}), and the page still renders`,
    );

    const rules = section('Denied');
    for (const rule of denied) await expectVisible(rules.getByText(rule, { exact: true }), `the denied list has ${rule}`);
    await expectVisible(
      rules.getByText(`refuses ${server.name} · wipe`),
      `the denied list says which listed tool ${server.denied} refuses`,
    );
    const asks = section('Asks');
    for (const rule of asked)
      await expectVisible(
        asks.getByText(rule, { exact: true }),
        `the ask list has ${rule}, listed for the repository as its deny rules are, whether or not a step reads them`,
      );
    await expectVisible(asks.getByText('.claude/settings.json', { exact: true }), 'with where it was read from');

    const { good, yours } = WORKFLOWS;
    const steps = section('What each step gets');
    await expectVisible(
      steps.locator('h2 [data-count]', { hasText: /^3$/ }),
      "a row for each step of each workflow that reads: dev's two, and yours",
    );
    const review = steps.locator(`li[data-step="${good.name}/review"]`);
    const declared = good.tools.split(', ');
    for (const tool of declared) await expectVisible(review.locator(`[data-tool="${tool}"]`), `review has ${tool}, which its tools: names`);
    await expectCount(review.locator('[data-tool]'), declared.length, `review has exactly the tools it declares (${good.tools})`);
    await expectCount(review.locator('[data-measured]'), 0, 'and no measured set: it declares its own');
    await expectVisible(
      review.locator('dt', { hasText: /^allowed tools$/ }),
      "review's fence says what it allows, beside what it denies: in dontAsk what a rule allows is what the step may do",
    );
    await expectVisible(
      review
        .locator('dt', { hasText: /^allowed tools$/ })
        .locator('xpath=following-sibling::dd[1]')
        .getByText('nothing', { exact: true }),
      'nothing, where the step names no rule',
    );
    for (const command of CHECKOUT.allowed.map((rule) => rule.slice('Bash('.length, -1))) {
      await expectVisible(
        review.locator(`[data-bash="${command}"]`),
        `review, in dontAsk, shows the Bash command the settings allow (${command})`,
      );
    }
    await expectVisible(
      review.getByText(
        "In dontAsk, a command that asks is denied without a prompt unless a rule allows it. Claude Code's read-only commands do not ask:",
      ),
      'review, in dontAsk, says a command that asks is denied — not every command no rule allows',
    );
    await expectCount(
      page.getByText(/a command no rule allows is denied/),
      0,
      'and nowhere that a command no rule allows is denied, which the read-only commands are not',
    );
    await expectVisible(
      review.locator('[data-read-only="ls"]:not([data-documented]):not([data-denied])'),
      'review runs ls without a rule, as measured',
    );
    await expectVisible(
      review.locator('[data-read-only="wc"][data-documented]:not([data-denied])'),
      'and wc, as the docs name it, marked not measured',
    );
    await expectVisible(
      review.locator('[data-read-only="find"][data-denied="Bash(find:*)"]'),
      'and not find, which the settings deny (Bash(find:*))',
    );
    const [ask] = CHECKOUT.asked;
    await expectVisible(
      review.locator(`[data-read-only="cat"][data-asks="${ask}"][data-denied="${ask}"]`),
      `nor cat, which the settings make ask (${ask}), and dontAsk denies`,
    );
    await expectVisible(
      review.locator('[data-read-only-taken]', { hasText: `cat asks, by ${ask} (.claude/settings.json), which dontAsk denies` }),
      'review says why cat is struck, beside the commands',
    );
    await expectVisible(review.locator(`[data-ask-rule="${ask}"]`), `review lists the ask rule that holds for it (${ask})`);
    await expectVisible(
      review.locator('[data-read-only-measured="2026-09-15"]', {
        hasText: /were measured on 2026-09-15 with 2\.1\.272 \(.+\): that day, under that day's settings/,
      }),
      'with the day and version the read-only commands were measured on, as a measurement of that day',
    );
    const mcpOf = (step: typeof review) => step.locator('dt', { hasText: /^mcp$/ }).locator('xpath=following-sibling::dd[1]');
    await expectVisible(
      mcpOf(review).getByText('none named: its sessions load no server', { exact: true }),
      "review, a step with no agent, names no server on its fence, though the checkout's .mcp.json declares two",
    );
    await expectCount(review.locator('[data-server]'), 0, 'and reaches no server');
    await expectCount(review.locator('[data-mcp-tool]'), 0, 'nor a tool of one');
    await expectVisible(review.getByText('No server is named for it: its sessions load none.'), 'and says why it has no MCP tool');
    const implement = steps.locator(`li[data-step="${good.name}/implement"]`);
    await expectVisible(
      mcpOf(implement).getByText(good.agent.mcp, { exact: true }),
      `implement's fence names the server its agent's mcp: line names (${good.agent.mcp})`,
    );
    await expectCount(
      implement.locator('[data-server]'),
      1,
      `implement reaches that server alone, not ${missing.name}, which no agent names`,
    );
    await expectVisible(implement.locator(`[data-server="${server.name}"] [data-mcp-tool="echo"]`), "with the server's tool echo");
    await expectVisible(
      implement.locator(`[data-mcp-tool="wipe"][data-denied="${server.denied}"]`),
      `implement's server tool the settings deny is marked denied (${server.denied})`,
    );
    await expectVisible(
      implement.locator('[data-measured="2026-09-14"]', { hasText: '2.1.270' }),
      "implement has the harness's own set, with the date and version it was measured on",
    );
    await expectVisible(
      implement.locator('[data-tool="WebFetch"]:not([data-inferred])'),
      'a tool the measurement named is shown as measured (WebFetch)',
    );
    for (const tool of ['Edit', 'Bash'])
      await expectVisible(
        implement.locator(`[data-tool="${tool}"][data-inferred]`),
        `a tool no unfenced measurement named is marked inferred (${tool})`,
      );
    await expectVisible(
      implement.locator(`[data-removed="${good.disallowedTools}"]`),
      `implement's disallowedTools: takes ${good.disallowedTools} from it`,
    );
    await expectCount(implement.locator(`[data-tool="${good.disallowedTools}"]`), 0, `and ${good.disallowedTools} is not among its tools`);
    await expectVisible(
      implement.locator(`[data-skill="${skill.name}"]`),
      `implement, with Skill, can load the repository's skill (${skill.name})`,
    );
    await expectVisible(
      implement.locator('[data-read-only="grep"]:not([data-documented])'),
      'implement, in no mode, runs the read-only commands without a rule too (grep)',
    );
    await expectVisible(
      implement.locator(`[data-read-only="cat"][data-asks="${ask}"][data-denied="${ask}"]`),
      `and cat, which the settings make ask (${ask}), is denied on a job, which asks nobody in any mode`,
    );
    await expectVisible(
      implement.locator('[data-read-only-taken]', { hasText: `cat asks, by ${ask} (.claude/settings.json), which a job denies` }),
      'implement says why cat is struck: it is a job',
    );
    const codexed = steps.locator(`li[data-step="${yours.name}/${yours.steps[0]}"]`);
    await expectVisible(
      codexed.locator('[data-not-claimed]', { hasText: /was not measured.*reads no \.claude\/settings\.json/ }),
      `yours, on Codex, claims no tool it was not measured to have, and no rule of settings it does not read`,
    );
    await expectVisible(codexed.locator('dt', { hasText: /^sandbox$/ }), "its fence under Codex's name, sandbox");
    await expectCount(codexed.locator('dt', { hasText: /^permission mode$/ }), 0, 'and no permission mode, which codex has not');
    await expectCount(
      codexed.locator('[data-tool], [data-bash], [data-allowed], [data-read-only], [data-ask-rule]'),
      0,
      'and shows none, nor a read-only command it was not measured to run, nor an ask rule of settings it does not read',
    );
  },
} satisfies PageSpec;
