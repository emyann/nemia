/**
 * Nemia's switch and who may speak in her chat: `nemia level` (`nemia.level` bare, `nemia.setLevel` given a level, a raise or its end),
 * where she is and each factory's level; `nemia chat speakers` (`nemia.speakers`), and `nemia chat allow|disallow <name>`
 * (`nemia.allowSpeaker`, `nemia.disallowSpeaker`), the names an agent may speak under, each write answering the list after.
 */
import {
  type Args,
  CHAT_ALLOW_WORDS,
  CHAT_DISALLOW_WORDS,
  CHAT_SPEAKERS_WORDS,
  type ChatSpeakers,
  DEFAULT_NAMESPACE,
  LEVEL_WORDS,
  LEVELS,
  levelWritten,
  NemiaLevel,
  NemiaLevelSet,
} from 'objects';
import { asked } from '../../objects.ts';
import { said, switchArg, textArg } from '../requests.ts';

/** Where Nemia is, as the api answers it. */
type Level = typeof NemiaLevel.Type;

/** A factory's level, as `nemia level` says it. */
type FactoryRow = Level['factories'][number];

/** Dollars as a person reads them: `$0.42`, and three figures under a cent. */
const dollars = (usd: number): string => `$${usd > 0 && usd < 0.01 ? Number(usd.toPrecision(3)) : usd.toFixed(2)}`;

/** A factory's level in words: its level, its raise and when it ends, and whose level it follows. */
const factoryWords = (row: FactoryRow): string => {
  const whose =
    row.factory === DEFAULT_NAMESPACE ? "the store's level, for runs in no factory" : row.own === null ? "the store's" : 'its own';
  if (row.raise !== null) return `${row.factory}: ${row.level} until ${row.raise.until}, then ${row.default} (${whose})`;
  return `${row.factory}: ${row.level} (${whose})`;
};

/** What her sessions cost, as `nemia level` says it: each counted as it ends, her open one not yet. */
const spendLine = ({ usd, measured, unmeasured }: NonNullable<Level['spend']>): string =>
  `spent ${dollars(usd)} over ${measured} session${measured === 1 ? '' : 's'} ended${unmeasured ? `, ${unmeasured} not measured` : ''}; her open one counts once it ends`;

/** What `nemia level` prints of her folder not trusted: the command `trust` to run once, and what then follows. */
const trustLine = (trust: string): string =>
  `her folder is not trusted yet, and her session starts only once it is: run once in a terminal ${trust}, accept the prompt, then /exit; the keeper files her at its next beat`;

/** Her session's line: none for no task, else its phase, or why it is not filed yet. */
const sessionLines = (data: Level): string[] => {
  if (data.task === null) return [];
  if (data.phase !== null) return [`her session ${data.task}: ${data.phase}`];
  const why =
    data.trust === null
      ? 'the keeper files it at its next beat (nemia up, or the api, keeps her)'
      : 'it waits for her folder to be trusted';
  return [`her session ${data.task}: not filed yet, ${why}`];
};

/** What `nemia level` prints of where she is. */
export function levelLines(data: Level): string[] {
  const head = `Nemia: the store at ${data.level}${data.since === null ? '' : ` since ${data.since}`}`;
  const factories = ['factories (a raise ends by itself, read as it passes):', ...data.factories.map((row) => `  ${factoryWords(row)}`)];
  const spent = data.spend === null ? [] : [spendLine(data.spend)];
  const stopped = data.stopped ? ['it was stopped from outside and is not filed again: a level set above manual starts a fresh one'] : [];
  const trust = data.trust === null ? [] : [trustLine(data.trust)];
  const reach = data.reach.length ? ['reach her:', ...data.reach.map((line) => `  ${line}`)] : [];
  const allows = data.allows.length
    ? ['allowed at a prompt, beyond what is built in (her folder’s local settings):', ...data.allows.map((rule) => `  ${rule}`)]
    : [];
  return [head, ...factories, ...sessionLines(data), ...trust, ...spent, ...stopped, ...reach, ...allows];
}

/** A level by its word. */
type LevelWord = (typeof LEVELS)[number];

/** Whether `word` is a level: the words' check refuses any other before the runner. */
const isLevel = (word: string): word is LevelWord => (LEVELS as readonly string[]).includes(word);

/** The write `args` ask of a level, as the api's body takes it: the store's level, or a factory's, raised for a stretch or ended. */
const levelSet = (args: Args): typeof NemiaLevelSet.Type => {
  const level = textArg(args, 'level');
  const factory = textArg(args, 'factory');
  const stretch = textArg(args, 'for');
  return {
    ...(level !== undefined && isLevel(level) ? { level } : {}),
    ...(factory === undefined ? {} : { factory }),
    ...(stretch === undefined ? {} : { for: stretch }),
    ...(switchArg(args, 'end') ? { end: true } : {}),
  };
};

/** `nemia level`'s runner: bare, where she is; given a level, a raise or its end, that written, and where she is after. */
export async function level(args: Args): Promise<number> {
  const data = await asked(LEVEL_WORDS.name, (c) => (levelWritten(args) ? c.nemia.setLevel({ payload: levelSet(args) }) : c.nemia.level()));
  said(levelLines(data));
  return 0;
}

/** The lines of the names allowed. */
const speakerLines = ({ allowed }: ChatSpeakers): string[] =>
  allowed.length === 0 ? ['no agent may speak in her chat — nemia chat allow <name>'] : [...allowed];

/** `nemia chat speakers`' runner: the names an agent may speak under in her chat. */
export async function chatSpeakers(): Promise<number> {
  said(speakerLines(await asked(CHAT_SPEAKERS_WORDS.name, (c) => c.nemia.speakers())));
  return 0;
}

/** `nemia chat allow <name>`'s runner: the name allowed, and the list after. */
export async function chatAllow(args: Args): Promise<number> {
  const speaker = textArg(args, 'name') ?? '';
  const list = await asked(CHAT_ALLOW_WORDS.name, (c) => c.nemia.allowSpeaker({ params: { speaker } }));
  said([`${speaker} may speak in her chat and to a step's session, as itself.`, ...speakerLines(list)]);
  return 0;
}

/** `nemia chat disallow <name>`'s runner: the name taken back, and the list after. */
export async function chatDisallow(args: Args): Promise<number> {
  const speaker = textArg(args, 'name') ?? '';
  const list = await asked(CHAT_DISALLOW_WORDS.name, (c) => c.nemia.disallowSpeaker({ params: { speaker } }));
  said([`${speaker} may no longer speak in her chat nor to a step's session.`, ...speakerLines(list)]);
  return 0;
}
