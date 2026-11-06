/**
 * A factory's proposal, as its page draws it and as her chat draws it under her words (`ChatProposal`): one part, read live, never a
 * copy. Its phase in the person's words (`PROPOSAL_WORDS`), a *Widens access* mark where the machinery says it widens, each object it
 * changes (resource, name, verb, and what it does to access), why, who proposed it and who approved it, the machinery's message as it
 * comes, and Approve and Decline wherever the api takes them (`proposalOffers`). The board sends no session token, so a click is the
 * person's: the answer is set as the proposal's own read, and the factory's list is read again.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccessChange, ChangeVerb, Proposal, ProposalChange } from 'objects';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Instant } from '@/components/Instant';
import { approveProposal, declineProposal, proposalKey, proposalQuery, proposalsKey, ReadRefusal } from '@/lib/api';
import { filled, ringed } from '@/lib/meaning';
import { proposalOffers, type ProposalOffers } from '@/lib/proposals';
import { cn } from '@/lib/utils';
import { PROPOSAL_WORDS } from '@/lib/words';

/** What a change does to its object, in the person's words. */
const VERB_WORDS: Record<ChangeVerb, string> = { create: 'makes', update: 'changes', delete: 'removes' };

/** What a change does to access, in the person's words. */
const ACCESS_WORDS: Record<AccessChange, string> = {
  widens: 'widens access',
  narrows: 'narrows access',
  same: 'access unchanged',
};

/** Which judgement a click asked for. */
type Judgement = 'approve' | 'decline';

/** The proposal `name` of the factory `factory`, read live, with Approve and Decline where its phase takes them. */
export function ProposalCard({ factory, name }: { factory: string; name: string }) {
  const queryClient = useQueryClient();
  const { data: proposal, error } = useQuery(proposalQuery(factory, name));
  const judge = useMutation({
    mutationFn: (asked: Judgement) => (asked === 'approve' ? approveProposal(factory, name) : declineProposal(factory, name)),
    onSuccess: (now) => {
      queryClient.setQueryData(proposalKey(factory, name), now);
      void queryClient.invalidateQueries({ queryKey: proposalsKey(factory), exact: true });
    },
  });
  if (!proposal) {
    if (error instanceof ReadRefusal && error.status === 404)
      return (
        <p data-no-proposal={name} className="text-body-medium text-muted-foreground">
          {factory} has no proposal named {name}: it was never made, or its factory is gone.
        </p>
      );
    return (
      <p data-proposal-reading={name} className="text-body-medium text-muted-foreground">
        {error ? `Could not read the proposal: ${error.message}` : 'Reading the proposal…'}
      </p>
    );
  }
  const ask = (asked: Judgement) => {
    judge.reset();
    judge.mutate(asked);
  };
  return <ProposalView proposal={proposal} pending={judge.isPending} refused={judge.error?.message ?? null} onJudge={ask} />;
}

/** One change of a proposal: its object, what it does to it and what it does to access. */
function ChangeRow({ change }: { change: ProposalChange }) {
  return (
    <li
      data-proposal-change={`${change.resource}/${change.name}`}
      data-access={change.access}
      className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-medium"
    >
      <span>{VERB_WORDS[change.verb]}</span>
      <code className="font-mono break-all">
        {change.resource}/{change.name}
      </code>
      <span className={cn('text-body-small', change.access === 'widens' ? 'text-yours' : 'text-muted-foreground')}>
        {ACCESS_WORDS[change.access]}
      </span>
    </li>
  );
}

/** Who proposed `proposal`, in words: the agent, of a run's step where one made it, else the person. */
const proposerOf = (proposal: Proposal): string => {
  const by = proposal.status.proposedBy;
  const who = by.agent ?? 'you';
  return by.run ? `${who}, in ${by.step ? `${by.step} of ` : ''}${by.run}` : who;
};

/** Who approved `proposal`, in words, or null while none has. */
const approverOf = (proposal: Proposal): string | null => {
  const by = proposal.status.approvedBy;
  if (!by) return null;
  if (by.by === 'person') return 'you';
  return `${by.agent ?? 'an agent'}, under ${by.rule ? `the rule ${by.rule}` : 'a rule you confirmed'}`;
};

/** A proposal as it reads, with the buttons its phase offers; a refusal of the last click in the api's words. */
export function ProposalView({
  proposal,
  pending,
  refused,
  onJudge,
}: {
  proposal: Proposal;
  pending: boolean;
  refused: string | null;
  onJudge: (asked: Judgement) => void;
}) {
  const { phase, widens, changes, message } = proposal.status;
  const words = PROPOSAL_WORDS[phase];
  const offers = proposalOffers(phase);
  const approver = approverOf(proposal);
  return (
    <Card size="sm" data-proposal={proposal.metadata.name} data-proposal-phase={phase}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono break-all">{proposal.metadata.name}</span>
          <span data-proposal-word title={words.title} className={cn('rounded px-2 py-0.5 text-label-medium', filled[words.hue])}>
            {words.word}
          </span>
          {widens && (
            <span
              data-proposal-widens
              title="An object it changes reaches further than it did: read each change before approving it."
              className={cn('rounded px-2 py-0.5 text-label-medium', ringed.yours)}
            >
              Widens access
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Proposed by <span data-proposal-by>{proposerOf(proposal)}</span>, <Instant at={proposal.metadata.creationTimestamp} />
          {proposal.spec.applyAt === 'run-end' ? ' · applies when its run ends well' : ''}
          {approver !== null && (
            <>
              {' · approved by '}
              <span data-proposal-approver>{approver}</span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {proposal.spec.why && (
          <p data-proposal-why className="text-body-medium">
            {proposal.spec.why}
          </p>
        )}
        <ul className="flex flex-col gap-1" aria-label="What it changes">
          {changes.map((change) => (
            <ChangeRow key={`${change.resource}/${change.name}`} change={change} />
          ))}
        </ul>
        {message && (
          <p data-proposal-message className="text-body-small break-words text-muted-foreground">
            {message}
          </p>
        )}
        <Judge offers={offers} pending={pending} refused={refused} onJudge={onJudge} />
      </CardContent>
    </Card>
  );
}

/** Approve and Decline as `offers` says, and a refusal of the last click in the api's words. */
function Judge({
  offers,
  pending,
  refused,
  onJudge,
}: {
  offers: ProposalOffers;
  pending: boolean;
  refused: string | null;
  onJudge: (asked: Judgement) => void;
}) {
  return (
    <>
      {(offers.approve || offers.decline) && (
        <div className="flex flex-wrap gap-2">
          {offers.approve && (
            <Button data-proposal-approve isDisabled={pending} onPress={() => onJudge('approve')}>
              Approve
            </Button>
          )}
          {offers.decline && (
            <Button data-proposal-decline variant="outline" isDisabled={pending} onPress={() => onJudge('decline')}>
              Decline
            </Button>
          )}
        </div>
      )}
      {refused !== null && (
        <Alert variant="destructive" data-proposal-refused>
          <AlertTitle>Not judged</AlertTitle>
          <AlertDescription className="break-words">{refused}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
