# Traps of a test

What `implement-a-change` names and does not carry: read the entry of the kind of test you are about to write.

- **A guard is proven by a test that makes it refuse, once.** A test that asks whether it allows proves nothing; guards tested
  that way have been silently inert. One fixture per rule, never one per form, word or spelling: the fixture breaks the rule the
  guard holds, and a second that breaks it again in another wording proves nothing the first did not. A guard with no fixture at
  all does not ship.
- **A refusal's words are nobody's to check**, where the repository's own rules say so. Assert the fact — that it refused — its
  kind and the exit code it carries; never the sentence. A test that pins a message's whole wording breaks the day the message is
  made clearer, which is how a sentence comes to be owned by its test. Where the repository counts what still pins one, that
  count only shrinks: no new line is added to it.
- **A rule about order or names is proven by a fixture that breaks it.** Give the fixture the opposite order or another name, and
  check the test fails without the rule.
- **A time measured on a machine is a floor, never a ceiling.** Assert identities — the parts add up to no more than the whole —
  never a wall-clock bound, and wait for the event you count, never for a length of time. A test of what is ordered or worded by
  the clock seeds the clock rather than sleeping, and a duration a program decides on is not read off the wall clock. **A
  shipped default is not waited out**: shorten the bound at the seam the code gives for it — a parameter, an option, a harness's
  own ops — measure the floor there, and name the shipped constant at the one site that holds it. A floor at a bound a timer
  decides sits a little under it, since a timer fires up to a millisecond before a clock read around it says its delay is gone,
  and far above what the call takes unbounded: break it on purpose and see how far. A test whose floor stands at a bound the
  shipped code owns has bought a second of proof with a second of every pass, and the guard refuses a new one.
- **A test that fails only under load is a race until shown otherwise.** Make it happen on demand first — a throwaway preload the
  process is started with, a process frozen with `SIGSTOP` (wait for its state to say so before `SIGCONT`) — then fix it.
- **A test that depends on the environment sets it**, and takes its temporary folders from the repository's own helper rather than
  the operating system's: a check inherits the environment of whatever started it, so a test that relies on a default passes there
  and fails by hand. Bound every background process a test starts, and every loop you run in the background yourself.
- **Assert on the error's `message`**, never on a pattern anchored at the start of the error's whole string: that string opens
  with the error's class name.
- **A test that reads source text ends a slice on a name that must exist**, and matches across line breaks: a formatter moves
  them, and a pattern that no longer matches makes an assertion of absence pass for nothing.
- **A type-aware lint fix trusts the type; a guard exists because a caller does not.** A value from a page, a journal, a harness or
  JSON arrives as it is: read every line such a fix changes in the source before you keep it.
- **What comes from outside is not what its type says.** A file written through a tool can turn an escape into the character it
  names — a raw NUL, DEL or byte order mark — so build such a character from its code, and look for the raw bytes after writing an
  escape of one; and a child process run with no redirection copies its error output onto yours.
- **A field moved to another key still passes the typecheck where it is read through a cast, a map of strings or JSON**: search the
  tests for the old key, read the passing ones too, and check a comparison still fails once you break the new key on purpose. A
  wrong type passed on purpose to prove a refusal says so where it is passed.
- **An optional field added to a returned type is dropped by every caller that rebuilds the answer field by field.** Search for
  each place that spreads or rebuilds the type, and give the new fact one writer. A comment claiming one writer is no evidence:
  search for the key, and read the code and its test.
- **A test is given a stand-in, and the real thing is asked for by name.** A file whose whole subject is the real thing, or that
  needs what the stand-in does not model, says so in its name as the repository's guard for that requires.
- **A new step of a story is a checkpoint of its scenario, and a new input of a function a row of its table.** Where a scenario
  test already walks the person's story, add the step as a named checkpoint of it; where a table holds the function's inputs, add
  the case as a named row. A focused test of its own is for what no story reaches: a race, a crash window, a real boundary, an
  invariant of a pure function.
