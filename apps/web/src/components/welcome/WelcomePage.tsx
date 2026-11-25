import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import type { Milestone } from 'objects';
import { CutButton, PageName } from '@/components/look';
import { Button } from '@/components/ui/ds';
import { FollowedFix } from '@/components/setup/FollowedFix';
import { HarnessChecks } from '@/components/setup/HarnessChecks';
import { HarnessChoice } from '@/components/setup/HarnessChoice';
import { quotaQuery } from '@/lib/api/quota';
import { milestonesQuery, readinessQuery } from '@/lib/api/readiness';
import { MILESTONE_LINKS, MILESTONE_NAMES } from '@/lib/gettingStarted';
import { quotaTitle } from '@/lib/quota';
import { useHarnessActivation } from '@/lib/useHarnessActivation';
import { useNow } from '@/lib/useNow';

/** The one line the welcome says of a harness, and no more. */
export const WELCOME_LINE = "The harness you pick runs Nemia's own agent and every session in your factories.";

/**
 * The welcome, at `/welcome`, where a fresh store opens: one card per harness the read declares, with the one line; Activate installs the
 * pinned copy (the same fix as Setup's), followed on the page, then its version tick, its sign-in, and one real turn through it, the
 * quota shown once it passed, as information. Its skip keeps the skip in this browser and leaves for the board; once both ticks passed,
 * Next names the next milestone and leads to its page, where one is built. A harness already installed when the page is drawn is shown
 * as activated, with its sign-in and its checks.
 */
export function WelcomePage() {
  const navigate = useNavigate();
  const { data } = useSuspenseQuery(readinessQuery);
  const milestones = useQuery(milestonesQuery);
  const quota = useQuery(quotaQuery);
  const now = useNow(60_000);
  const quotaWords = quota.data === undefined ? undefined : quotaTitle(quota.data, new Date(now));
  const a = useHarnessActivation(data.pieces);
  const chosen = a.chosen ?? a.choices.find((choice) => choice.install.state === 'met');
  const install = chosen === undefined ? undefined : a.checkedInstall(chosen.install);
  const ready = install?.checks !== undefined && install.checks.length > 1 && install.checks.every((c) => c.state === 'passed');
  const next: Milestone | undefined = milestones.data?.milestones.find((m) => m.name !== 'harness' && m.state === 'next')?.name;
  const skip = () => {
    a.skip();
    void navigate({ to: '/' });
  };
  return (
    <article data-welcome className="mx-auto flex max-w-3xl flex-col gap-8 px-3 py-6 @lg/page:px-6">
      <header className="flex flex-col gap-1">
        <PageName>Welcome to Nemia</PageName>
        <p className="text-body-medium text-on-surface-variant">Nothing runs without a harness: activate one, and see it answer.</p>
      </header>
      {chosen === undefined || install === undefined ? (
        <HarnessChoice level={2} choices={a.choices} lead={WELCOME_LINE} {...a.starts} onStart={a.activate} />
      ) : (
        <HarnessChoice
          level={2}
          choices={a.choices}
          activation={{
            choice: chosen,
            ...(a.installRun === undefined ? {} : { run: <FollowedFix key={a.installRun.id} fix={a.installRun} onEnded={a.ended} /> }),
            installed: a.installed || chosen.install.state === 'met',
            checks: (
              <HarnessChecks
                install={install}
                {...(chosen.signIn?.state === 'met' ? { turn: a.turnOf(chosen.name) } : {})}
                {...(quotaWords === undefined ? {} : { quota: quotaWords })}
                {...a.starts}
              />
            ),
          }}
          {...a.starts}
        />
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outlined" size="small" data-welcome-skip onPress={skip}>
          Skip for now
        </Button>
        {ready && (
          <CutButton data-welcome-next to={(next === undefined ? undefined : MILESTONE_LINKS[next]) ?? '/'}>
            {next === undefined ? 'On to the board' : `Next: ${MILESTONE_NAMES[next].toLowerCase()}`}
          </CutButton>
        )}
      </footer>
    </article>
  );
}
