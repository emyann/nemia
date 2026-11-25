import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { startRun, type Place, type Started, type WorkflowRow } from '../../lib/api/workflows.ts';
import type { RunView } from '../../lib/api/judged.ts';
import { files as startFiles } from '../../lib/api/objects.ts';
import { startCard } from '../../lib/api/inbox.ts';
import { standingOf, titleOf } from '../../lib/factory';
import { afterFor } from '../../lib/inbox';
import { usePickerRuns } from '../../lib/pickerRuns.ts';
import { ContextPicker, ShowOlder } from '../agent/ContextPicker';
import { runsMoved } from '@/lib/runWrites';
import { Pending, Reading } from '@/components/look';
import { Body, Button, Checkbox, Skeleton, TextField } from '@/components/ui/ds';
import { pastLimit, StartInputs } from './StartInputs';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * A brief, the runs the new run waits on, the runs it reads as context (`ContextPicker`), and the button that starts a run of the
 * workflow with them: then the new run, linked to its page, or the api's refusal in full — the loader's, the CLI `start`'s
 * (`afterRefusal`'s, for a run it will not wait on, or `contextRefusal`'s, for one it will not read), or its own about the brief.
 *
 * Given a `card`, it starts that inbox card through the Card's verb (`startCard`), as the CLI's `start <inbox>/<card>.md --brief <brief>`
 * does: the brief is prefilled with the card's body, to make into the work, and the start is refused in the package's words — a card not
 * there, one started already. `onStarted` is told of a start the api took, the card staying in the inbox as `started`, which the caller
 * shows; the Workflows page gives none, and says where the run is itself. `repo` is where the run starts: for a card, the repository its
 * factory wires for the workflow (`startRepo`), what the runs to wait on are listed from. A card's start sits under the workflow it
 * picks, with no rule of its own above it. `place` starts it in a factory, on one of its repositories, which `repo` then is too; a card's
 * start sends the factory alone, and the workflow by its name (`startCard`), for the factory places its run.
 *
 * A team whose every step works in a folder runs on no repository, and the CLI's `start` refuses `--after` for one, since there is no
 * branch to wait on: no picker is drawn and nothing about a repository, and the start sends what the workflow takes of the picks
 * (`afterFor`), none for such a team. A start reads the list of runs again alone (`exact`): a prefix would reach every run's decision,
 * which is keyed by the run's state and read again under a key of its own.
 *
 * Files the run is handed (`StartInputs`), as the client hands a start its inputs, are uploaded when Start is pressed, one after another,
 * into the namespace the start goes to, then named among its inputs by their ids (`startRun`, `startCard`); the button says how many
 * are sent. A file past the files api's limit keeps the form from starting. The ids of those uploaded are kept while the form lives, so a
 * start refused for another reason sends none of them again; a start the api took clears them with the brief, and one refused for a file
 * the api keeps no more (`files.unkept`) forgets that file's id, so the next press uploads it again.
 *
 * A card's inbox is read again after any answer to its start. Taken, the card stays in it, `started`; refused, it may have left or
 * started behind the page's back — a 404 for a card dropped, a 409 for one started — and this form with it. So the caller given
 * `onRefused` shows the refusal where it outlives the form, told the api's words, and null when the start is asked again; the form then
 * shows none of its own.
 */
export function StartRun({
  workflow,
  card,
  repo,
  place,
  onStarted,
  onRefused,
}: {
  workflow: WorkflowRow;
  card?: { name: string; factory: string | null; body: string };
  repo?: string;
  place?: Place;
  onStarted?: (started: Started) => void;
  onRefused?: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState(card?.body ?? '');
  const [after, setAfter] = useState<string[]>([]);
  const [context, setContext] = useState<string[]>([]);
  const handed = useHandedFiles();
  const inFolders = workflow.folderTeam;
  const start = useMutation({
    mutationFn: (asked: { brief: string; after: string[]; context: string[]; files: File[] }) => {
      const start = {
        workflow: workflow.name,
        brief: asked.brief,
        ...(asked.after.length ? { after: asked.after } : {}),
        ...(asked.context.length ? { context: asked.context } : {}),
        ...(asked.files.length ? { files: handed.sending(asked.files) } : {}),
      };
      return card ? startCard(card, start, place?.factory) : startRun({ ...start, from: workflow.from }, place);
    },
    onMutate: () => onRefused?.(null),
    onSuccess: (started) => {
      if (!card) {
        setBrief('');
        setAfter([]);
        setContext([]);
        handed.clear();
      }
      void runsMoved(queryClient);
      onStarted?.(started);
    },
    onError: (error) => handed.refused(error, onRefused),
    onSettled: () => {
      if (card) void queryClient.invalidateQueries({ queryKey: ['inbox'] });
    },
  });

  return (
    <form
      aria-label={card ? `Start ${card.name}` : `Start a run of ${workflow.name}`}
      className={card ? 'space-y-2' : 'space-y-2 border-t border-outline-variant pt-4'}
      onSubmit={(event) => {
        event.preventDefault();
        start.mutate({ brief, after: afterFor(workflow, after), context, files: handed.files });
      }}
    >
      <TextField
        multiline
        label={card ? 'Brief' : 'Start a run'}
        value={brief}
        onChange={setBrief}
        placeholder="What to do: the brief each step is told, under “What was asked for”."
        className="w-full"
      />
      <StartInputs {...handed.drawn(start.isPending)} />
      {!inFolders && <AfterPicker selected={after} onChange={setAfter} repo={repo} />}
      <ContextPicker selected={context} onChange={setContext} />
      <div className="flex flex-wrap items-center gap-3">
        <StartPress pending={start.isPending} held={!brief.trim() || handed.files.some(pastLimit)}>
          {startWords(start.isPending, handed.files.length, handed.sent)}
        </StartPress>
        <Where workflow={workflow} repo={repo} factory={place?.factory} card={!!card} />
      </div>
      {start.isSuccess && <StartedLine id={start.data.id} after={start.variables.after} />}
      {start.isError && !onRefused && <StartRefused message={start.error.message} />}
    </form>
  );
}

/** The form's Start: disabled while its press is out (`pending`, the kit's small ProgressIndicator drawn in it) or while `held`. */
function StartPress({ pending, held, children }: { pending: boolean; held: boolean; children: string }) {
  return (
    <Button icon={pending ? Pending : undefined} variant="outlined" type="submit" size="xsmall" isDisabled={pending || held}>
      {children}
    </Button>
  );
}

/** The api's refusal of a start, in its words, where no caller shows it. */
function StartRefused({ message }: { message: string }) {
  return (
    <div data-refused className="space-y-1 rounded border border-failure bg-failure-container px-3 py-2">
      <Body size="medium" className="font-medium text-on-failure-container">Not started. The api refused it:</Body>
      <Body size="small" className="font-mono whitespace-pre-wrap break-words text-on-failure-container">{message}</Body>
    </div>
  );
}

/**
 * The files a start hands its run, as the form lists them, with how many of them a press has uploaded and the ids of those it has, kept
 * while the form lives so a start refused for another reason sends none again (`sending`); `refused` forgets the id of each file a
 * refusal says the api keeps no more and tells the caller its words, `clear` empties both once a start is taken, and `drawn` is what
 * `StartInputs` is drawn with while a start is pressed or not.
 */
function useHandedFiles() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploaded] = useState(() => new Map<File, string>());
  const [sent, setSent] = useState(0);
  const sending = (listed: File[]) => {
    setSent(0);
    return { listed, sent: uploaded, onSent: setSent };
  };
  const refused = (refusal: Error, told?: (message: string) => void) => {
    startFiles.unkept(uploaded, refusal);
    told?.(refusal.message);
  };
  const clear = () => {
    setFiles([]);
    uploaded.clear();
  };
  const drawn = (pending: boolean) => ({
    files,
    onChange: setFiles,
    sent,
    uploading: pending && files.length > 0,
    isDisabled: pending,
  });
  return { files, sent, sending, refused, clear, drawn };
}

/** What the Start button says: Start, or while pressed, which file of how many it uploads, then Starting. */
const startWords = (pending: boolean, files: number, sent: number) =>
  !pending ? 'Start' : files > 0 && sent < files ? `Uploading ${sent + 1} of ${files}…` : 'Starting…';

/**
 * That run `id` was started, linked to its page, and when its steps are filed: on the daemon's next pass, once each of `after` has
 * landed.
 */
function StartedLine({ id, after }: { id: string; after: readonly string[] }) {
  return (
    <Body size="medium" data-started={id}>
      Started{' '}
      <Link to="/runs/$runId" params={{ runId: id }} className="font-mono text-body-medium underline underline-offset-2">
        {id}
      </Link>
      . Nothing is filed until the daemon&apos;s next pass
      {after.length > 0 && (
        <>
          , and {after.join(' and ')} {after.length > 1 ? 'have' : 'has'} landed
        </>
      )}
      .
    </Body>
  );
}

/**
 * Where a start runs: in folders, for a team whose every step works in one, else on `repo` — the repository of a factory that attaches the
 * workflow when none is given, the default factory working on none — and in `factory` when one is named; from the workflow's folder; and,
 * for a card, that it stays in the inbox, listed as started.
 */
function Where({ workflow, repo, factory, card }: { workflow: WorkflowRow; repo?: string; factory?: string; card: boolean }) {
  return (
    <Body size="small" component="span" colorRole="on-surface-variant" className="min-w-0">
      {workflow.folderTeam ? (
        'Works in folders it makes for each step'
      ) : (
        <>Runs in {repo ? <code className="font-mono break-all">{repo}</code> : 'the repository of a factory that attaches it'}</>
      )}
      {factory && (
        <>
          {' '}
          in the factory <code className="font-mono">{factory}</code>
        </>
      )}
      , from <code className="font-mono break-all">{workflow.dir}</code>
      {card && ', and the card stays in the inbox, listed as started'}.
    </Body>
  );
}

/**
 * The runs a new run waits on (the CLI's `start --after`): the runs on `repo`, the repository a start runs in, those not finished newest
 * created first, then the finished newest finished first, a page of them at a time with Show older for the next (`usePickerRuns`), each
 * by its title and id, picked as many as it waits on. None is left out for a reason the board would have to work out — which runs it may
 * wait on is the package's to say (`afterRefusal`), and its refusal is shown with the start's. `repo` is the one a factory wires for the
 * workflow; with none, the default factory working on no repository, no run is listed, and the form says why. The runs not finished are
 * read as the picker opens, not on the list's beat, and read again with the feed. A title wraps within its row, read whole, and no row
 * runs past the card it is in, however long the title.
 */
function AfterPicker({ selected, onChange, repo }: { selected: readonly string[]; onChange: (after: string[]) => void; repo?: string }) {
  const runs = usePickerRuns();
  const legend = useId();
  const onRepo: RunView[] | null = repo && !runs.reading ? [...runs.open, ...runs.finished].filter((run) => run.repo === repo) : null;

  return (
    <fieldset aria-labelledby={legend} className="min-w-0 space-y-1.5">
      <Body size="medium" component="legend" id={legend} className="font-medium">
        After
      </Body>
      <Body size="small" colorRole="on-surface-variant">
        Waits until it lands: nothing of it is filed until each has landed, and it is handed what each concluded.
      </Body>
      {!repo ? (
        <Body size="small" colorRole="on-surface-variant" data-no-repo>
          No repository to wait on a run of: a start in no factory works on none. Open the workflow in the factory that attaches it.
        </Body>
      ) : runs.error ? (
        <ReadTrouble what="the runs to wait on" error={runs.error} className="text-body-small" />
      ) : !onRepo ? (
        <Reading label="Reading the runs…" className="divide-y divide-outline-variant rounded border border-outline">
          {[0, 1, 2].map((at) => (
            <Body size="medium" component="div" key={at} className="flex items-center gap-2 px-2 py-1">
              <Skeleton shape="rectangle" className="size-4 rounded-none" />
              <Skeleton className="flex-1" />
            </Body>
          ))}
        </Reading>
      ) : !onRepo.length ? (
        <Body size="small" colorRole="on-surface-variant">No run on this repository to wait on.</Body>
      ) : (
        <ul aria-label="Runs to wait on" className="max-h-44 divide-y divide-outline-variant overflow-y-auto rounded border border-outline">
          {onRepo.map((run) => (
            <li key={run.id} data-run={run.id}>
              <Checkbox
                value={run.id}
                isSelected={selected.includes(run.id)}
                onChange={(checked) => onChange(checked ? [...selected, run.id] : selected.filter((id) => id !== run.id))}
                className="flex w-full cursor-pointer px-2 hover:bg-surface-container-high"
              >
                <Body size="medium" component="span" className="flex min-w-0 flex-1 items-baseline gap-2">
                  <span data-run-title className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]" title={titleOf(run)}>
                    {titleOf(run)}
                  </span>
                  <Body size="small" component="span" colorRole="on-surface-variant" className="hidden shrink-0 font-mono @md/page:inline">{run.id}</Body>
                  <Body size="small" component="span" colorRole="on-surface-variant" data-standing className="shrink-0" title={run.waiting?.advice}>
                    {standingOf(run)}
                  </Body>
                </Body>
              </Checkbox>
            </li>
          ))}
        </ul>
      )}
      {repo && !runs.error && runs.more && <ShowOlder onPress={runs.older} />}
    </fieldset>
  );
}
