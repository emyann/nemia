/**
 * `nemia factory` and `nemia factory ls`: the store's factories, the default first, then each by name with its repositories, or why its
 * file does not read; under each, its places a harness does not trust, its template, workflows, volumes, settings, cost lines, hires,
 * schedules with their next and last fire, where its instruction is kept and its revisions policy. Read of the api: every page of the
 * Factories (`factories.listAll`), then each factory's Schedules (`schedules.list`) and instruction (`factories.instruction`), which no
 * Factory object carries. Ported word for word from the orchestrator's `factoryLines` (`factory/factory.ts`); `listingLines` is pure.
 */
import { DEFAULT_NAMESPACE, type Factory, type FactoryInstruction, type Schedule } from 'objects';
import { asked, everyPage, factoriesListed } from '../../objects.ts';
import { Refused } from '../../refused.ts';
import { said } from '../requests.ts';
import { dollars, fireWord } from './lines.ts';

/** What a factory's listing reads beside its object: its schedules, and where its instruction is kept, each absent where unread. */
export type Beside = { readonly schedules: readonly Schedule[]; readonly instruction: FactoryInstruction | undefined };

/** The lines under a factory, indented past the names' `width`. */
const under = (width: number, line: string): string => `${' '.repeat(width)}  ${line}`;

/** The places of `o` a harness does not trust, each with the command that repairs it, or why nothing can. */
const untrustedLines = (o: Factory, width: number): string[] =>
  o.status.untrusted.map((one) =>
    under(
      width,
      `not trusted for ${one.harness}: ${one.place} — withheld: ${one.withheld}. ${one.never ?? `Trust it: nemia factory trust ${o.metadata.name}`}`,
    ),
  );

/**
 * The template a factory was made from: its folder and version, the version applied or that none is yet, and each condition that is not
 * as it should be — `Applied` false, `ConflictsPending` true — with its sentence.
 */
function templateLines(o: Factory, width: number): string[] {
  const template = o.spec.template;
  if (template === undefined) return [];
  const applied = o.status.applied ?? null;
  const at = applied === null ? 'not rendered yet: the daemon renders it, nemia up' : `applied at ${applied}`;
  const amiss = o.status.conditions.filter((c) => (c.type === 'Applied') === (c.status === 'False'));
  return [
    under(width, `template: ${template.source} ${template.version}, ${at}`),
    ...amiss.map((c) => under(width, `${c.type} ${c.status}, ${c.reason}: ${c.message}`)),
  ];
}

/** A factory's volumes, by path, once each: `volume /home/me/notes :ro`, a writable one with its caveat. */
function volumeLines(o: Factory, width: number): string[] {
  const seen = new Map<string, boolean>();
  for (const v of o.spec.volumes) if (!seen.has(v.path)) seen.set(v.path, v.readOnly);
  return [...seen.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([at, readOnly]) =>
      under(
        width,
        `volume ${at} ${readOnly ? ':ro' : ':rw'}${readOnly ? '' : " — writable, and not a run's workspace: nothing commits or lands what a step writes there"}`,
      ),
    );
}

/** A factory's harness settings: `setting claude.attribution {"commit":"","pr":""}`. */
const settingLines = (o: Factory, width: number): string[] =>
  Object.entries(o.spec.harnessSettings ?? {}).flatMap(([harness, keys]) =>
    Object.entries(keys).map(([key, value]) => under(width, `setting ${harness}.${key} ${JSON.stringify(value)}`)),
  );

/** A factory's cost lines, sorted by workflow: `cost line build $80.00`. */
const costLineLines = (o: Factory, width: number): string[] =>
  Object.entries(o.spec.costLines ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([workflow, usd]) => under(width, `cost line ${workflow} ${dollars(usd)}`));

/** A factory's hires, sorted by step: `dev/implement ← implementer`. */
const hireLines = (o: Factory, width: number): string[] =>
  Object.keys(o.spec.hires)
    .sort()
    .map((step) => under(width, `${step} ← ${o.spec.hires[step] ?? ''}`));

/**
 * A factory's schedules, by workflow: `schedule janitor  0 9 * * 1  "Read the stats"`, then its next fire and last run at `now`, and the
 * refusal kept of its latest fire.
 */
const scheduleLines = (schedules: readonly Schedule[], width: number, now: number): string[] =>
  [...schedules]
    .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name))
    .flatMap(({ metadata, spec, status }) => {
      const where = `${spec.tz ? ` (${spec.tz})` : ''}${spec.repo ? ` on ${spec.repo}` : ''}`;
      const brief = spec.brief.split('\n')[0] ?? '';
      const indent = `${' '.repeat(width)}    `;
      return [
        under(width, `schedule ${metadata.name}  ${spec.cron}${where}  ${JSON.stringify(brief)}`),
        `${indent}next ${status.next ? fireWord(status.next, now) : 'never'}  last ${status.last ? `${status.last.run} (${fireWord(status.last.at, now)})` : 'none'}`,
        ...(status.refused ? [`${indent}refused: ${status.refused}`] : []),
      ];
    });

/** Where a factory's instruction is kept, where its file says: a path, or the store. */
function instructionLine(instruction: FactoryInstruction | undefined, width: number): string[] {
  if (instruction === undefined) return [];
  if (instruction.store) return [under(width, 'instruction: kept in the store')];
  return instruction.path === null ? [] : [under(width, `instruction: ${instruction.path}`)];
}

/** The lines of one factory that reads: its places, template, workflows, volumes, settings, lines, hires, schedules and the rest. */
const factoryLines = (o: Factory, beside: Beside, width: number, now: number): string[] => [
  `${o.metadata.name.padEnd(width)}  ${o.spec.repos.join(', ')}`,
  ...untrustedLines(o, width),
  ...templateLines(o, width),
  ...((o.spec.workflows ?? []).length ? [under(width, `workflows: ${[...(o.spec.workflows ?? [])].sort().join(', ')}`)] : []),
  ...volumeLines(o, width),
  ...settingLines(o, width),
  ...costLineLines(o, width),
  ...hireLines(o, width),
  ...scheduleLines(beside.schedules, width, now),
  ...instructionLine(beside.instruction, width),
  ...(o.spec.revisions === undefined ? [] : [under(width, `revisions: ${o.spec.revisions}`)]),
];

/** Whether `o` is a factory whose file does not read: an error, and no repository. */
const unread = (o: Factory): o is Factory & { status: { error: string } } => o.status.error !== undefined && o.spec.repos.length === 0;

/**
 * What `nemia factory ls` prints of `factories` (the default's object left out) with what was read beside each (`beside`, by name) at
 * `now`: the default factory first, then each by name, and how to file one or remove one.
 */
export function listingLines(factories: readonly Factory[], beside: ReadonlyMap<string, Beside>, now: number): string[] {
  const sorted = factories
    .filter((o) => o.metadata.name !== DEFAULT_NAMESPACE)
    .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name));
  const width = Math.max(DEFAULT_NAMESPACE.length, ...sorted.map((o) => o.metadata.name.length));
  const none: Beside = { schedules: [], instruction: undefined };
  return [
    `${DEFAULT_NAMESPACE.padEnd(width)}  every run and card that names no factory — read, never written`,
    ...sorted.flatMap((o) =>
      unread(o)
        ? [`${o.metadata.name.padEnd(width)}  ${o.status.error}`]
        : factoryLines(o, beside.get(o.metadata.name) ?? none, width, now),
    ),
    "\nfile one: nemia factory add <name> --repo <path> — remove one: nemia factory rm <name> — in the daemon's store",
  ];
}

/** What `read` answers, or undefined where the api refuses it: a part of a factory's listing that does not read is left out. */
const orNone = async <A>(read: () => Promise<A>): Promise<A | undefined> => {
  try {
    return await read();
  } catch (err) {
    if (err instanceof Refused) return undefined;
    throw err;
  }
};

/** What the listing reads beside the factory `name`: its schedules, every page, and its instruction. */
async function besideOf(command: string, name: string): Promise<Beside> {
  const [schedules, instruction] = await Promise.all([
    orNone(() => asked(command, (c) => everyPage((page) => c.schedules.list({ params: { namespace: name }, query: page })))),
    orNone(() => asked(command, (c) => c.factories.instruction({ params: { name } }))),
  ]);
  return { schedules: schedules?.items ?? [], instruction };
}

/** `nemia factory` and `nemia factory ls`' runner: every factory read of the api, and what is read beside each, printed. */
export async function factoryListed(command: string): Promise<number> {
  const listed = await factoriesListed(command);
  const reading = listed.items.filter((o) => o.metadata.name !== DEFAULT_NAMESPACE && !unread(o));
  const beside = new Map(await Promise.all(reading.map(async (o) => [o.metadata.name, await besideOf(command, o.metadata.name)] as const)));
  said(listingLines(listed.items, beside, Date.now()));
  return 0;
}
