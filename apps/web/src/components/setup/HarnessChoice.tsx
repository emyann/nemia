import type { ReactNode } from 'react';
import type { ReadinessPiece } from 'objects';
import { CutFrame, CutPress } from '@/components/look';
import { Button } from '@/components/ui/button';
import { fixKeyOf, type HarnessChoiceRow, shownFixes, startOf } from '@/lib/setup';
import { PieceFixes, type Starts } from './ReadinessList';

/** A harness the question offers: its pieces as the read answered them. */
type Choice = HarnessChoiceRow<ReadinessPiece>;

/** The harness whose install was started on this visit: its row, the install's run as it is followed, and whether it is in place. */
type Activation = { choice: Choice; run?: ReactNode; installed: boolean };

/** One harness offered: the install piece's sentence as its title, the harness as the read names it, and Activate. */
function Option({ choice, starts }: { choice: Choice; starts: Starts }) {
  const install = choice.install;
  const shown = shownFixes(install)[0];
  const key = shown === undefined ? undefined : fixKeyOf(install, shown.fix, shown.i);
  const pending = key !== undefined && starts.starting === key;
  const refused = key !== undefined && starts.refused?.key === key ? starts.refused.message : undefined;
  return (
    <li data-harness-option={choice.name} className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-body-medium break-words text-on-surface">{install.message}</span>
          <span className="font-mono text-body-small break-all text-on-surface-variant">{choice.name}</span>
        </div>
        {shown !== undefined && key !== undefined && shown.fix.startable && (
          <CutPress
            data-harness-activate
            isDisabled={pending}
            onPress={() => starts.onStart(startOf(install, shown.fix, shown.i, {}), key)}
          >
            {pending ? 'Starting…' : 'Activate'}
          </CutPress>
        )}
      </div>
      {refused !== undefined && (
        <p role="alert" data-fix-refused className="text-body-small break-words text-failure">
          Not started. The api refused it: {refused}
        </p>
      )}
    </li>
  );
}

/**
 * The first visit's question, over the readiness list: which harness to activate, one option for each the read declares
 * (`harnessChoices`) — the sentence its install piece says, and Activate, which starts the install's fix (`onStart`) — and Skip, where
 * it is given, which keeps the skip in this browser (`onSkip`). Once one is activated on this visit (`activation`), it shows that harness
 * alone: the install's run as it is followed, then, the install in place, its sign-in piece's fixes — a command to type with the control
 * that copies it, or a fix the server runs, started the same way.
 */
export function HarnessChoice({
  choices,
  activation,
  onSkip,
  ...starts
}: { choices: readonly Choice[]; activation?: Activation; onSkip?: () => void } & Starts) {
  const signIn = activation?.choice.signIn;
  return (
    <CutFrame size={12}>
      <section
        data-harness-choice={activation === undefined ? 'asked' : activation.installed ? 'installed' : 'installing'}
        aria-labelledby="harness-choice"
        className="flex flex-col gap-3 p-4"
      >
        <header className="flex flex-col gap-1">
          <h3 id="harness-choice" className="text-title-small font-title-small">
            {activation === undefined ? 'Which harness should run your sessions?' : 'Activating the harness'}
          </h3>
          <p className="text-body-medium text-on-surface-variant">
            {activation === undefined
              ? 'A session runs on a harness this server installs for you. Activate one now, or skip and activate one from the list below when you need it.'
              : activation.installed
                ? 'It is installed. Sign it in, and a session can start on it.'
                : 'The server installs it: its output shows here as it runs.'}
          </p>
        </header>
        {activation === undefined ? (
          <>
            <ul className="flex flex-col divide-y divide-outline-variant">
              {choices.map((choice) => (
                <Option key={choice.name} choice={choice} starts={starts} />
              ))}
            </ul>
            {onSkip !== undefined && (
              <div>
                <Button variant="ghost" data-harness-skip onPress={onSkip}>
                  Skip for now
                </Button>
              </div>
            )}
          </>
        ) : (
          <div data-harness-option={activation.choice.name} className="flex flex-col gap-3">
            {activation.run}
            {activation.installed && signIn !== undefined && signIn.state !== 'met' && (
              <div data-harness-sign-in={signIn.name} className="flex flex-col gap-2">
                <p className="text-body-medium break-words text-on-surface">{signIn.message}</p>
                <PieceFixes piece={signIn} starts={starts} />
              </div>
            )}
            {activation.installed && signIn?.state === 'met' && (
              <p data-harness-sign-in={signIn.name} className="text-body-medium break-words text-on-surface">
                {signIn.message}
              </p>
            )}
          </div>
        )}
      </section>
    </CutFrame>
  );
}

/** The question skipped in this browser, while no harness is activated: one line saying so, and Ask again, which forgets the skip. */
export function HarnessSkipped({ onAskAgain }: { onAskAgain: () => void }) {
  return (
    <p data-harness-choice="skipped" className="flex flex-wrap items-center gap-2 text-body-medium text-on-surface-variant">
      No harness is activated, and the question is skipped in this browser: activate one from the list below, or
      <Button variant="ghost" size="sm" data-harness-ask-again onPress={onAskAgain}>
        ask again
      </Button>
    </p>
  );
}
