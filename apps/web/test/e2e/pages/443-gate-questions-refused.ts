import fs from 'node:fs';
import path from 'node:path';
import { fed, photograph, themeOf } from '../board.ts';
import { expectVisible, idle, Refused, settled, WAIT_MS, watch } from '../checks.ts';
import { ASKING, writeAsking } from '../seed.ts';
import type { PageSpec } from '../visit.ts';
import { OUT, store } from '../world.ts';

export default {
  /**
   * Answers the package refuses, given at a gate: the page reads `design` asking its questions, every read of the run then held as it was,
   * and the run's record loses the question field from `design`'s output before Approve is pressed — a step that asks none now. The api
   * answers 400 in `answerRefusal`'s words, the gate says it under Not approved, and nothing is written. Its one refusal is the point, so
   * its page counts exactly it; the run is taken back after.
   */
  name: 'gate-questions-refused',
  route: '/runs',
  expect: async (page) => {
    const written = writeAsking(store!);
    const { id, gated, cut, where } = ASKING;
    const asks = path.join(store!, 'runs', `${id}.asks`);
    const recordFile = path.join(store!, 'runs', `${id}.json`);
    const refused = await page.context().newPage();
    try {
      const { problems } = watch(refused);
      const detailPath = `/api/runs/${id}`;
      const url = new URL(`/runs/${id}`, page.url()).href;
      const read = await (await refused.request.get(new URL(detailPath, page.url()).href)).text();
      await refused.route(
        (u) => u.pathname === detailPath,
        (route) => route.fulfill({ status: 200, contentType: 'application/json', body: read }),
      );
      await refused.goto(url, { waitUntil: 'load' });
      await idle(refused);
      const gate = refused.locator(`section[aria-label="The gate of ${gated}"]`);
      const asked = gate.locator(`section[aria-label="What ${gated} asks"]`);
      await asked.getByRole('button', { name: 'Choose the recommended answers' }).click();
      await asked.locator(`fieldset[data-question="${where.title}"] label[data-option="${where.options[0].label}"]`).click();
      const approve = gate.getByRole('button', { name: 'Approve', exact: true });
      await expectVisible(
        gate.locator('form[aria-label^="Approve"] button[type="submit"]:enabled'),
        `${cut.title} and ${where.title} answered`,
      );

      const record = JSON.parse(fs.readFileSync(recordFile, 'utf8')) as { workflow: { name: string; output?: unknown }[] };
      const plain = { type: 'object', properties: { open: { type: 'string' } }, required: ['open'], additionalProperties: false };
      for (const step of record.workflow) if (step.name === gated) step.output = { file: 'open.schema.json', schema: plain };
      fs.writeFileSync(recordFile, JSON.stringify(record, null, 2));

      const [answered] = await Promise.all([
        refused.waitForResponse(
          (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === `/api/runs/${id}/steps/${gated}/approve`,
          { timeout: WAIT_MS },
        ),
        approve.click(),
      ]);
      const { error } = (await answered.json()) as { error?: string };
      if (answered.status() !== 400 || !error?.startsWith('The step asks no questions now, so there is nothing to answer.'))
        throw new Refused(
          `the api refuses answers to a step that asks none now, in answerRefusal's words — it answered ${answered.status()}: ${JSON.stringify(error)}`,
        );
      const refusal = gate.locator('form[aria-label^="Approve"] [data-refused]');
      await expectVisible(refusal.getByText('Not approved. The api refused it:'), 'the refusal is shown beside Approve, not swallowed');
      const shown = await refusal.locator('p.font-mono').textContent();
      if (shown !== error)
        throw new Refused(
          `the refusal is the package's sentence, verbatim — it shows ${JSON.stringify(shown)}, and the api said ${JSON.stringify(error)}`,
        );
      if (fs.existsSync(asks))
        throw new Refused(`nothing is written on a refusal — ${asks} holds ${fs.readdirSync(asks, { recursive: true }).join(', ')}`);
      await settled(refused);
      await photograph(refused, path.join(OUT, `gate-questions-refused-${await themeOf(refused)}.png`), { fullPage: true });
      await idle(refused);
      const expected = `request answered 400: POST ${answered.url()}`;
      const seen = problems();
      const others = seen.filter(
        (p) => p !== expected && !/^console error: Failed to load resource: the server responded with a status of 400\b/.test(p),
      );
      if (!seen.includes(expected) || others.length)
        throw new Refused(
          `the refused page saw its one refusal, its answer and the line Chromium writes to the console for one, and nothing else — it saw:\n    ${seen.join('\n    ')}`,
        );
    } finally {
      await refused.close();
      for (const file of written) fs.rmSync(file, { recursive: true, force: true });
      fed(id, 'removed');
      await idle(page);
    }
  },
} satisfies PageSpec;
