import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { signOut } from '@/lib/api/session';

/** Reloads the page, where every read is made again with no token, and a Nemia that asks for one shows the token page. */
const reload = () => window.location.reload();

/**
 * Settings' section for this browser's token: a press that has the api clear the cookie that carries a token pasted on the token page
 * (`signOut`), then loads the page again. Offered on every store, since the board cannot read the cookie to tell whether it holds one:
 * the api sets it HttpOnly. A refusal is said, in the api's words.
 */
export function ForgetToken() {
  const forget = useMutation({ mutationFn: signOut, onSuccess: reload });
  return (
    <section data-forget-token className="flex flex-col gap-2">
      <h2 className="text-title-medium">This browser</h2>
      <p className="text-body-medium text-muted-foreground">
        A Nemia reached from beyond its machine asks for a token once, and this browser keeps it for thirty days. Forget it to leave this
        browser sending none: the token itself stays the store's until it is removed at its machine.
      </p>
      <div>
        <Button variant="outline" data-forget-token-press isDisabled={forget.isPending} onPress={() => forget.mutate()}>
          Forget this browser's token
        </Button>
      </div>
      {forget.isError && (
        <p role="alert" data-forget-token-refused className="text-body-small break-words text-failure">
          Not forgotten. The api refused it: {forget.error.message}
        </p>
      )}
    </section>
  );
}
