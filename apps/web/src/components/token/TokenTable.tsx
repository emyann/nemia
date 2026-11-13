import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, UserRound } from 'lucide-react';
import { Cell, Column, Row, Table, TableBody, TableHeader } from '@/components/ui/ds';
import { cn } from '@/components/ui/ds/utils';
import { Button } from '@/components/ui/button';
import { CutFrame, CutPress, FRAMED_BOX, FRAMED_END, FRAMED_ROW, FRAMED_TABLE } from '@/components/look';
import { Refusal } from '@/components/gate/Ask';
import { Instant } from '@/components/time/Instant';
import { retireToken, tokensQuery, type Token } from '@/lib/api/tokens';
import { holderWord, reachWord } from '@/lib/tokens';

/** A column's heading, in the look's small caps. */
const HEAD = 'text-label-small uppercase';

/** One token's row: its name, who holds it, where it reaches, its narrowing, when it was minted, and its Retire. */
function TokenRow({ token, onRetire, busy }: { token: Token; onRetire: (name: string) => void; busy: boolean }) {
  const Glyph = token.holder === 'agent' ? Bot : UserRound;
  return (
    <Row id={token.name} data-token={token.name} data-holder={token.holder} className={FRAMED_ROW}>
      <Cell className="font-mono text-body-medium break-all">{token.name}</Cell>
      <Cell data-token-holder className="text-body-medium">
        <span className="inline-flex items-center gap-1">
          <Glyph aria-hidden className="size-3.5 shrink-0 text-on-surface-variant" />
          {holderWord(token)}
        </span>
      </Cell>
      <Cell data-token-factory className="text-body-medium">
        {reachWord(token)}
      </Cell>
      <Cell data-token-narrowed className="font-mono text-body-small">
        {token.narrowed ?? '—'}
      </Cell>
      <Cell data-token-minted className="text-body-small">
        <Instant at={token.createdAt} about="Minted" />
      </Cell>
      <Cell>
        <Button variant="outline" size="sm" data-token-retire={token.name} isDisabled={busy} onPress={() => onRetire(token.name)}>
          Retire
        </Button>
      </Cell>
    </Row>
  );
}

/** The ask before a token is retired: what retiring it does, the press that does it, and Cancel. */
function ConfirmRetire({
  name,
  pending,
  onConfirm,
  onCancel,
}: {
  name: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div data-token-confirm={name} role="group" aria-label="Confirm" className="flex flex-col gap-2 border-l-2 border-yours pl-3">
      <p className="text-body-medium break-words text-on-surface">
        Retire {name}? Every browser, agent or program that presents it is refused from then on, this browser too where it is the one it
        keeps. It cannot be taken back: mint another on the store's machine.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <CutPress data-token-confirm-press isDisabled={pending} onPress={onConfirm}>
          {pending ? 'Retiring…' : `Retire ${name}`}
        </CutPress>
        <Button variant="ghost" isDisabled={pending} onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * The store's standing tokens in a table framed by the look's cut, one row each (`TokenRow`), and a Retire on each, which asks once
 * (`ConfirmRetire`) before it sends `DELETE /api/tokens/{name}`; once answered the list is read again. A retire the api refuses is said
 * in its words (`Refusal`), the list kept. No token is minted here: the command line mints one, its token shown once.
 */
export function TokenTable({ tokens }: { tokens: readonly Token[] }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState<string>();
  const retire = useMutation({
    mutationFn: retireToken,
    onSuccess: () => setConfirming(undefined),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tokensQuery.queryKey, exact: true }),
  });
  return (
    <div className="flex flex-col gap-4">
      <CutFrame size={24}>
        <div data-table-box className={cn(FRAMED_BOX, FRAMED_END)}>
          <Table aria-label="Tokens" density="dense" className={cn('min-w-[720px] table-fixed', FRAMED_TABLE)}>
            <TableHeader>
              <Column id="name" isRowHeader className={HEAD}>
                Name
              </Column>
              <Column id="holder" className={cn(HEAD, 'w-36')}>
                Holder
              </Column>
              <Column id="factory" className={cn(HEAD, 'w-32')}>
                Factory
              </Column>
              <Column id="narrowed" className={cn(HEAD, 'w-24')}>
                Narrowed
              </Column>
              <Column id="minted" className={cn(HEAD, 'w-36')}>
                Minted
              </Column>
              <Column id="retire" className={cn(HEAD, 'w-28')}>
                <span className="sr-only">Retire</span>
              </Column>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TokenRow
                  key={token.name}
                  token={token}
                  busy={confirming !== undefined || retire.isPending}
                  onRetire={(name) => {
                    retire.reset();
                    setConfirming(name);
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </CutFrame>
      {confirming !== undefined && (
        <ConfirmRetire
          name={confirming}
          pending={retire.isPending}
          onConfirm={() => retire.mutate(confirming)}
          onCancel={() => {
            retire.reset();
            setConfirming(undefined);
          }}
        />
      )}
      {retire.isError && <Refusal error={retire.error} not="Not retired" />}
    </div>
  );
}
