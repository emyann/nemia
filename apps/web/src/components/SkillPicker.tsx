import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Sheet, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { copySkill, skillsQuery, type GivenSkill, type SkillPlace, type SkillRow } from '../lib/api';
import { invalidateSkills } from '../lib/agentWrites';
import { skillList, withoutSkill, withSkill } from '../lib/agents';
import { costWords, givenRows, offerOf, PLACE_LABELS } from '../lib/skills';
import { GivenSkills, SkillSourceBadge } from './AgentParts';

/**
 * The skills an agent of yours gives, composed from a list: each given one with where it is found and what it costs a turn, and Remove; and
 * Add a skill, a sheet of every skill an agent of yours can be given — your library, then this repository's, in the order a start finds a
 * name — and Nemia's builtin skills, each copied into your library before it is given, since an agent of yours finds none where Nemia keeps
 * them.
 *
 * Adding and removing edit the form's `skills:` line, saved with the agent. The copy does not wait for Save: it writes your library at
 * once, and the sheet says so.
 */
export function SkillPicker({
  skills,
  given,
  onSkills,
  onCopied,
}: {
  /** The form's `skills:` line. */
  skills: string;
  /** The skills as the agent was read, each where a start found it: what a row shows until the list is read. */
  given: readonly GivenSkill[];
  onSkills: (line: string) => void;
  /** Called once a copy is written, before anything is read again. */
  onCopied?: () => Promise<void>;
}) {
  const { data: places, error } = useQuery(skillsQuery);
  const names = skillList(skills);
  const rows = givenRows(names, given, places);

  return (
    <div data-skill-picker className="space-y-2">
      <p className="text-body-small font-medium">Skills</p>
      <GivenSkills
        rows={rows}
        none="It gives no skills: its sessions are told its instructions alone."
        action={(row) => (
          <Button variant="ghost" size="xs" aria-label={`Remove ${row.name}`} onPress={() => onSkills(withoutSkill(skills, row.name))}>
            Remove
          </Button>
        )}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SheetTrigger>
          <Button variant="outline" size="sm">
            Add a skill
          </Button>
          <Sheet className="data-[side=right]:sm:max-w-xl">
            <SheetHeader className="border-b border-outline-variant">
              <SheetTitle>Add a skill</SheetTitle>
              <SheetDescription>
                A skill is a folder with a SKILL.md. Named, a session reads its name and description every turn and loads the rest when the
                work calls for it; one whose SKILL.md says <code className="font-mono text-body-small">preload: true</code> is loaded whole
                every turn.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-4">
              {error && <p className="text-body-small text-failure">Could not list the skills: {error.message}</p>}
              {!places && !error && <p className="text-body-small text-muted-foreground">Reading the skills…</p>}
              {places?.map((place) => (
                <Place
                  key={place.from}
                  place={place}
                  given={names}
                  onAdd={(name) => onSkills(withSkill(skills, name))}
                  onCopied={onCopied}
                />
              ))}
            </div>
          </Sheet>
        </SheetTrigger>
        <p className="text-body-small text-muted-foreground">
          <code className="font-mono">skills:</code> — Claude Code skills, found in your library, then the repository's{' '}
          <code className="font-mono">.claude/skills/</code>. Saved with the agent.
        </p>
      </div>
    </div>
  );
}

/** One place of skills in the sheet: its name, its folder, and each skill in it with what it offers. */
function Place({
  place,
  given,
  onAdd,
  onCopied,
}: {
  place: SkillPlace;
  given: readonly string[];
  onAdd: (name: string) => void;
  onCopied?: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const copy = useMutation({
    mutationFn: (name: string) => copySkill(name),
    onSuccess: async (added) => {
      await onCopied?.();
      await invalidateSkills(queryClient);
      onAdd(added.skill.name);
    },
  });
  return (
    <section aria-label={PLACE_LABELS[place.from]} data-skill-place={place.from} className="space-y-2 pt-4">
      <header className="space-y-0.5">
        <h3 className="text-label-medium text-muted-foreground uppercase">{PLACE_LABELS[place.from]}</h3>
        <p className="font-mono text-body-small break-all text-muted-foreground">{place.dir}</p>
        {place.from === 'builtin' && (
          <p data-copy-note className="text-body-small text-muted-foreground">
            An agent of yours finds no skill here. Copy to my library writes the skill's folder into your library at once — a write of its
            own, kept there whether or not this agent is saved — and gives it to this agent.
          </p>
        )}
      </header>
      {copy.error && (
        <p
          role="alert"
          data-copy-refused
          className="rounded border border-failure bg-failure-container px-2 py-1 font-mono text-body-small whitespace-pre-wrap break-words text-on-failure-container"
        >
          {copy.error.message}
        </p>
      )}
      {place.skills.length === 0 ? (
        <p className="text-body-small text-muted-foreground">None here.</p>
      ) : (
        <ul className="divide-y divide-outline-variant rounded border border-outline-variant">
          {place.skills.map((row) => (
            <Offered
              key={row.name}
              row={row}
              given={given}
              copying={copy.isPending && copy.variables === row.name}
              busy={copy.isPending}
              onAdd={() => onAdd(row.name)}
              onCopy={() => copy.mutate(row.name)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** A skill in the sheet: what it is, what it costs a turn, and what can be done with it — or why nothing can. */
function Offered({
  row,
  given,
  copying,
  busy,
  onAdd,
  onCopy,
}: {
  row: SkillRow;
  given: readonly string[];
  copying: boolean;
  busy: boolean;
  onAdd: () => void;
  onCopy: () => void;
}) {
  const offer = offerOf(row, given);
  return (
    <li data-offered-skill={row.name} className="flex items-start gap-3 px-3 py-2">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-body-small font-medium">{row.name}</span>
          {row.entry && row.entry.name !== row.name && <span className="text-body-small text-muted-foreground">{row.entry.name}</span>}
          {row.usedBy.length > 0 && <span className="text-body-small text-muted-foreground">given by {row.usedBy.join(', ')}</span>}
        </p>
        {row.entry && <p className="text-body-small text-muted-foreground">{row.entry.description}</p>}
        {offer.kind === 'refused' && (
          <p data-offer-refused className="font-mono text-body-small whitespace-pre-wrap break-words text-failure">
            {offer.why}
          </p>
        )}
        {row.cost && offer.kind !== 'refused' && <p className="text-body-small text-muted-foreground">{costWords(row.cost)}</p>}
      </div>
      <div className="shrink-0">
        {offer.kind === 'add' && (
          <Button size="xs" aria-label={`Add ${row.name}`} onPress={onAdd}>
            Add
          </Button>
        )}
        {offer.kind === 'given' && <span className="text-body-small text-muted-foreground">given</span>}
        {offer.kind === 'copy' && (
          <Button size="xs" aria-label={`Copy ${row.name} to my library and add`} onPress={onCopy} isDisabled={busy}>
            {copying ? 'Copying…' : 'Copy to my library and add'}
          </Button>
        )}
        {offer.kind === 'found' && (
          <span className="flex items-center gap-1.5 text-body-small text-muted-foreground">
            {offer.where === 'yours' ? 'in' : 'given from'} <SkillSourceBadge from={offer.where} />
          </span>
        )}
      </div>
    </li>
  );
}
