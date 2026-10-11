/**
 * `node tools/observe/render/render.ts` — see this checkout's dashboards rendered, before they land.
 *
 *     node tools/observe/render/render.ts [--dashboards <name,…>] [--out <dir>] [--observe <dir>] [--wait <seconds>] [--hold [<seconds>]]
 *     node tools/observe/render/render.ts --stop <name>
 *
 *  1. Reads its plan (`planOf`, plan.ts), refusing a flag or a dashboard it does not know before anything else.
 *  2. Takes the machine's one render slot (`lock.ts`), waiting `--wait` seconds for whoever holds it.
 *  3. Starts a throwaway copy of the stack from this checkout's `tools/observe` (`stack.ts`): a container of its own name, on loopback
 *     ports Docker picks, with no named volume. Never the live stack.
 *  4. Posts the fake telemetry to it and waits until each store answers (`seed.ts`).
 *  5. Opens each dashboard in headless Chromium and writes, into `--out` (else `$WF_ARTIFACTS`, else `.observe/` at the root),
 *     `dashboard-<name>.png` and `dashboard-<name>.txt`, the text of every panel (`panels.ts`).
 *  6. Removes the container by its name and lets the slot go: when it ends, on a signal, and on any error. With `--hold`, it hands the
 *     container to a reaper instead, which removes it after the seconds asked, and prints where Grafana listens and each dashboard's
 *     address (`hold.ts`); `--stop <name>` removes a held stack sooner.
 *
 * It needs `docker` and Playwright's Chromium. Exits 2 on a refusal that names the fix, 1 on a render that failed.
 */
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';
import { chromium, type Browser } from 'playwright';
import { handOver, heldLines, stop } from './hold.ts';
import { locked, release, take } from './lock.ts';
import { addressOf, seen, written } from './panels.ts';
import { dashboardsOf, planOf, type Named, type Plan } from './plan.ts';
import { arrived, picks, post, UNSEEDED, type Picks } from './seed.ts';
import { nameOf, portsOf, ready, remove, runArgv, start, type Compose } from './stack.ts';

/** The reasons `UNSEEDED` gives for the panels of the dashboard `name`, by a panel's title. */
const unseededOf = (name: string): Record<string, string> =>
  Object.fromEntries(UNSEEDED.filter((entry) => entry.dashboard === name).map((entry) => [entry.panel, entry.why]));

/** Open each of `dashboards` on the Grafana at `grafana` and write its picture and its text into `out`; the files written. */
async function pictured(browser: Browser, grafana: string, dashboards: readonly Named[], at: Picks, out: string): Promise<string[]> {
  fs.mkdirSync(out, { recursive: true });
  const files: string[] = [];
  for (const { name, uid, file } of dashboards) {
    const page = await browser.newPage();
    const address = addressOf(grafana, uid, at);
    const picture = path.join(out, `dashboard-${name}.png`);
    const panels = await seen(page, file, address, picture);
    await page.close();
    const text = path.join(out, `dashboard-${name}.txt`);
    fs.writeFileSync(text, written(file.title, address, panels, unseededOf(name)));
    files.push(picture, text);
  }
  return files;
}

/** Start the stack `name` of the plan's checkout, seed it, and picture `dashboards`; then hold it when the plan says so. Whether it is held. */
async function rendered(plan: Plan, name: string, dashboards: readonly Named[], say: (line: string) => void): Promise<boolean> {
  const compose = yaml.load(fs.readFileSync(path.join(plan.observe, 'compose.yaml'), 'utf8')) as Compose;
  start(runArgv(compose, plan.observe, name));
  const ports = portsOf(name);
  say(`${name} started from ${plan.observe}: Grafana on ${ports.grafana}`);
  const allOf = dashboardsOf(plan.observe);
  await ready(
    name,
    ports.grafana,
    allOf.map((dashboard) => dashboard.uid),
  );
  const seededAt = await post(ports.otlp);
  await arrived(ports.grafana, ports.otlp);
  const at = picks(seededAt, Date.now());
  const browser = await chromium.launch();
  try {
    for (const file of await pictured(browser, ports.grafana, dashboards, at, plan.out)) say(`wrote ${file}`);
  } finally {
    await browser.close();
  }
  if (plan.hold === undefined) return false;
  const until = handOver(name, plan.hold);
  for (const line of heldLines(name, until, ports.grafana, dashboards, at)) say(line);
  return true;
}

/** The whole command over `argv`: its exit code, every line said through `say`. */
async function main(argv: readonly string[], say: (line: string) => void): Promise<number> {
  const plan = planOf(argv);
  if (plan.stop !== undefined) {
    stop(plan.stop, locked());
    say(`stopped ${plan.stop}`);
    return 0;
  }
  const dashboards = dashboardsOf(plan.observe, plan.dashboards);
  const name = nameOf();
  await take(name, plan.wait);
  let held = false;
  const drop = (): void => {
    if (held) return;
    remove(name);
    release(name);
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const)
    process.on(signal, () => {
      drop();
      process.exit(1);
    });
  try {
    held = await rendered(plan, name, dashboards, say);
  } finally {
    drop();
  }
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2), (line) => void process.stdout.write(`render: ${line}\n`));
} catch (err) {
  process.stderr.write(`render: ${(err as Error).message}\n`);
  process.exitCode = (err as { exitCode?: number }).exitCode ?? 1;
}
