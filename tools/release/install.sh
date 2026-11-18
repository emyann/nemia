#!/bin/sh
# Nemia's installer, published with every release as its install.sh asset (tools/release/README.md):
#
#   curl -fsSL https://github.com/emyann/nemia/releases/latest/download/install.sh | sh
#
# It fetches the release archive for this machine and its SHA256SUMS, refuses an archive whose sum differs, unpacks it into
# $WF_ROOT/releases/<tag> through a hidden folder renamed into place, points releases/current at it and links ~/.local/bin/nemia and the
# store's tools/bin/nemia to its launcher.
# Then it takes one of three paths, picked from its flags once they are read.
#
# On a laptop, with neither --serve, --bind nor --client, it asks nothing: it starts Nemia now on this machine alone (nemia daemon
# --json, the read that starts this store's daemon on demand, bound to 127.0.0.1), with no login service, mints the board's single-use
# first-visit link under <url>/welcome (nemia board link --base) and opens it in the browser (open on macOS, xdg-open on Linux where a
# display is set; --no-open opens nothing, and a failure to open fails nothing), then prints a short summary of what it did, ending on
# the link, and nemia service install named for starting at login. The summary is coloured where stdout is a terminal whose TERM is not
# dumb, or FORCE_COLOR is set; a set NO_COLOR keeps it plain whatever else (https://no-color.org, https://force-color.org).
#
# On a server, said by --serve or by a --bind, it asks, or reads from its flags under --yes: starting at login, and the address to bind,
# picked from the private ones nemia service addresses lists or typed (a public or wildcard one refused but with --public). A bind
# exposes the store: this machine's own person token is minted straight into the local context's file and never printed, and the
# board's single-use first-visit link (nemia board link) is printed in its place. With --client it starts no
# service and pairs this machine with its server (nemia pair <url>), or takes a token by --token-file. A release carries no harness
# and the installer asks for no harness's sign-in: the server and client paths end on nemia doctor, the read of what is in place and
# what is missing, whose exit fails no install, and a harness is activated after, on the board's Setup page or by nemia doctor fix
# <harness>. It never prints a token.
#
# NEMIA_INSTALL_TTY names a file read in place of the terminal, one answer a line, its prompts on stderr: the test's seam alone.
#
# Exit codes: 0 installed, 1 refused or failed (the line says what to do), 2 an argument it does not take.
# tools/guards/test/install.test.ts holds it.
set -eu

base=https://github.com/emyann/nemia/releases
tag=
yes=0
service=1
bind=
client=0
server=
context=remote
context_given=0
token_file=
public=0
board_base=
serve=0
open=1

usage() {
  cat <<'EOF'
usage: install.sh [--yes] [--version <tag>] [--base <download base>] [--no-service] [--no-open]
                  [--serve] [--bind <address> [--public]] [--board-base <url>]
                  [--client --server <url> [--context <name>] [--token-file <file>]]
EOF
}

say() { printf 'nemia install: %s\n' "$*"; }
warn() { printf 'nemia install: warning: %s\n' "$*" >&2; }
fail() {
  printf 'nemia install: %s\n' "$*" >&2
  exit 1
}

# A flag's value, refused where none follows it.
value() {
  if [ "$#" -lt 2 ] || [ -z "$2" ]; then
    printf 'nemia install: %s takes a value\n' "$1" >&2
    usage >&2
    exit 2
  fi
}

while [ "$#" -gt 0 ]; do
  case $1 in
    --yes | -y) yes=1 ;;
    --no-service) service=0 ;;
    --client) client=1 ;;
    --serve) serve=1 ;;
    --no-open) open=0 ;;
    --public) public=1 ;;
    --version) value "$@"; tag=$2; shift ;;
    --base) value "$@"; base=${2%/}; shift ;;
    --bind) value "$@"; bind=$2; shift ;;
    --server) value "$@"; server=$2; shift ;;
    --context) value "$@"; context=$2; context_given=1; shift ;;
    --board-base) value "$@"; board_base=${2%/}; shift ;;
    --token-file) value "$@"; token_file=$2; shift ;;
    --help | -h) usage; exit 0 ;;
    *)
      printf 'nemia install: no argument %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

# The path: a client, a server (--serve, or a --bind, which already says one), else a laptop, which asks nothing.
mode=laptop
if [ "$client" = 1 ]; then
  mode=client
elif [ "$serve" = 1 ] || [ -n "$bind" ]; then
  mode=server
fi

# A person answers on the terminal, even when the script itself comes down a pipe; with no terminal it goes on as --yes would. The
# answers are read on descriptor 3 and the prompts written on 4, opened once, so each read takes the next line. A laptop asks nothing,
# so it opens no terminal.
interactive=0
if [ "$yes" = 0 ] && [ "$mode" != laptop ]; then
  if [ -n "${NEMIA_INSTALL_TTY:-}" ] && [ -r "$NEMIA_INSTALL_TTY" ]; then
    interactive=1
    exec 3<"$NEMIA_INSTALL_TTY" 4>&2
  elif (: </dev/tty) 2>/dev/null; then
    interactive=1
    exec 3</dev/tty 4>/dev/tty
  else
    warn "no terminal to ask on: going on as with --yes"
  fi
fi

# ask <question> <default>: the answer in $answer, the default under --yes or on an empty line.
ask() {
  answer=$2
  [ "$interactive" = 1 ] || return 0
  printf '%s ' "$1" >&4
  read -r answer <&3 || answer=
  [ -n "$answer" ] || answer=$2
}

has() { command -v "$1" >/dev/null 2>&1; }

# The machine, as the release names its archives.
os=$(uname -s)
case $os in
  Linux) os=linux ;;
  Darwin) os=darwin ;;
  *) fail "no release is built for $os: Nemia runs on Linux and macOS" ;;
esac
arch=$(uname -m)
case $arch in
  x86_64 | amd64) arch=x64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) fail "no release is built for $arch: Nemia's archives are for x64 and arm64" ;;
esac
platform=$os-$arch
case $platform in
  linux-x64 | linux-arm64 | darwin-arm64) ;;
  *) fail "no release is built for $platform: the archives are linux-x64, linux-arm64 and darwin-arm64" ;;
esac

# What the install needs, and on Linux what the service needs, warned about rather than refused.
for tool in git tar; do
  has "$tool" || fail "$tool is not installed: install it with your package manager, then run this again"
done
if has sha256sum; then
  sum() { sha256sum "$1" | cut -d' ' -f1; }
elif has shasum; then
  sum() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
  fail "neither sha256sum nor shasum is installed: install coreutils, then run this again"
fi
case $base in
  file://*) ;;
  *) has curl || has wget || fail "neither curl nor wget is installed: install one, then run this again" ;;
esac
if [ "$os" = linux ] && [ "$client" = 0 ] && [ "$service" = 1 ]; then
  [ "$mode" != server ] || systemctl --user show-environment >/dev/null 2>&1 ||
    warn "systemd --user does not answer here: nemia service install will not start Nemia at login; run nemia up by hand"
  [ -f /sys/fs/cgroup/cgroup.controllers ] ||
    warn "this machine has no cgroup v2: sessions run with no memory limit of their own"
fi

# fetch <url> <file>: a file:// URL is read from disk, anything else by curl, or wget where curl is not installed.
fetch() {
  case $1 in
    file://*) cp "${1#file://}" "$2" ;;
    *)
      if has curl; then
        curl -fsSL --retry 3 -o "$2" "$1"
      else
        wget -q -O "$2" "$1"
      fi
      ;;
  esac
}

# A release tag is v and three numbers, digits and dots alone, checked before anything is downloaded or deleted: it names the folder
# releases/<tag> that is removed and replaced, so a '/', a '..', a space or a pre-release suffix never reaches the disk. It is the shape
# nemia upgrade reads a published tag in (parseVersion, packages/agent-orchestrator/src/release/floor.ts).
check_tag() {
  case $tag in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) bad_tag "$1" ;;
  esac
  case ${tag#v} in
    *[!0-9.]* | *..* | *.*.*.* | *.) bad_tag "$1" ;;
  esac
}
# bad_tag <where it was read>: the refusal, naming the fix for where the tag came from.
bad_tag() {
  case $1 in
    --version) fail "--version '$tag' is no release tag: a tag is v and three numbers, digits and dots alone; pass one, like --version v1.2.3" ;;
    *) fail "$1 names the tag '$tag', no release tag (v and three numbers, digits and dots alone): nothing was downloaded; fix that base or pass --base <another>, or name the release with --version v<x.y.z>" ;;
  esac
}
[ -z "$tag" ] || check_tag --version

root=${WF_ROOT:-$HOME/.agent-workflows}
releases=$root/releases
mkdir -p "$releases"
work=$(mktemp -d "$releases/.install.XXXXXX")
trap 'rm -rf "$work"' EXIT

if [ -z "$tag" ]; then
  fetch "$base/latest/download/latest.json" "$work/latest.json" ||
    fail "could not read $base/latest/download/latest.json: check your network, or pass --version <tag>"
  tag=$(sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$work/latest.json")
  check_tag "$base/latest/download/latest.json"
fi

asset=nemia-$tag-$platform.tar.gz
say "downloading $asset"
fetch "$base/download/$tag/$asset" "$work/$asset" ||
  fail "could not download $base/download/$tag/$asset: check --version and --base"
fetch "$base/download/$tag/SHA256SUMS" "$work/SHA256SUMS" ||
  fail "could not download $base/download/$tag/SHA256SUMS: check --version and --base"
want=$(awk -v name="$asset" '$2 == name || $2 == "*" name { print $1 }' "$work/SHA256SUMS")
[ -n "$want" ] || fail "SHA256SUMS of $tag names no $asset: this release has no archive for $platform"
got=$(sum "$work/$asset")
[ "$got" = "$want" ] ||
  fail "$asset has sha256 $got, not the $want SHA256SUMS names: nothing was installed; download again, or report it"

# The release folder appears whole or not at all: unpacked in the hidden folder, then renamed to its tag.
if [ -e "$releases/$tag/release.json" ]; then
  say "$tag is unpacked already in $releases/$tag"
else
  rm -rf "${releases:?}/$tag"
  mkdir "$work/tree"
  tar -xzf "$work/$asset" -C "$work/tree"
  [ -f "$work/tree/release.json" ] || fail "$asset holds no release.json: it is no Nemia release; report it"
  mv "$work/tree" "$releases/$tag"
fi

# releases/current names the tag by a relative link, made hidden and renamed over the old one.
ln -s "$tag" "$work/current"
if [ "$os" = darwin ]; then
  mv -fh "$work/current" "$releases/current"
else
  mv -fT "$work/current" "$releases/current"
fi
size=$(wc -c <"$work/$asset" | tr -d ' ')
[ "$mode" = laptop ] || say "installed $tag in $releases/$tag"

bindir=$HOME/.local/bin
mkdir -p "$bindir"
ln -sfn "$releases/current/bin/nemia" "$bindir/nemia"
on_path=1
case ":$PATH:" in
  *":$bindir:"*) ;;
  *)
    on_path=0
    [ "$mode" = laptop ] || warn "$bindir is not on your PATH: add it (export PATH=\"$bindir:\$PATH\" in your shell's profile)"
    ;;
esac
nemia=$bindir/nemia

# The store's tools folder, first on every session's PATH, holds the same link, so a step runs the nemia its settings allow on a server
# whose service PATH has no ~/.local/bin; through releases/current, it follows every upgrade.
mkdir -p "$root/tools/bin"
ln -sfn "$releases/current/bin/nemia" "$root/tools/bin/nemia"

# doctor: the last thing the install does, on either side, whose exit fails no install. No harness comes with a release: the person
# activates the one their sessions run on, by the fix nemia doctor names or on the board's Setup page.
doctor() {
  say "what is in place and what is missing, each with the command that fixes it:"
  "$nemia" doctor || warn "something is still missing: run the fix each line above names, then nemia doctor to read it again"
  say "a harness is activated on the board's Setup page or by nemia doctor fix <harness>, then signed in by the fix nemia doctor names"
  say "done: nemia doctor reads it again, nemia version says what runs"
}

# home <path>: the path with this HOME written as ~, as a person reads it.
home() {
  case $1 in
    "$HOME"/*) printf '~%s' "${1#"$HOME"}" ;;
    *) printf '%s' "$1" ;;
  esac
}

# laptop: start Nemia now on this machine alone, open the board's first-visit link to its welcome page, and print the summary. It asks
# nothing, installs no login service, and nothing it does past the unpacking fails the install.
laptop() {
  url=http://127.0.0.1:8787
  started=0
  link=
  opened=0
  if [ "$service" = 1 ]; then
    if "$nemia" daemon --json >"$work/daemon"; then
      started=1
      said=$(sed -n 's/.*"url":"\([^"]*\)".*/\1/p' "$work/daemon")
      [ -z "$said" ] || url=${said%/}
    fi
  fi
  welcome=$url/welcome
  if [ "$started" = 1 ]; then
    if "$nemia" board link --base "$welcome" >"$work/link"; then
      link=$(awk '/^https?:\/\// { print; exit }' "$work/link")
    fi
    [ -n "$link" ] || warn "no first-visit link was made: run nemia board link --base $welcome"
  fi
  if [ -n "$link" ] && [ "$open" = 1 ]; then
    if [ "$os" = darwin ] && has open; then
      if open "$link" >/dev/null 2>&1; then opened=1; fi
    elif [ "$os" = linux ] && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ] && has xdg-open; then
      if xdg-open "$link" >/dev/null 2>&1; then opened=1; fi
    fi
  fi

  colour=0
  if [ -n "${FORCE_COLOR:-}" ]; then
    colour=1
  elif [ -t 1 ] && [ -n "${TERM:-}" ] && [ "$TERM" != dumb ]; then
    colour=1
  fi
  [ -z "${NO_COLOR:-}" ] || colour=0
  bold= ok= note= reset=
  if [ "$colour" = 1 ]; then
    esc=$(printf '\033')
    bold="$esc[1m" ok="$esc[32m" note="$esc[33m" reset="$esc[0m"
  fi
  row() { printf '  %s%s%s %-34s %s\n' "$1" "$2" "$reset" "$3" "$4"; }

  case $os in darwin) system=macOS ;; *) system=Linux ;; esac
  megabytes=$(awk -v b="$size" 'BEGIN { if (b >= 1000000) printf "%d MB", (b + 500000) / 1000000; else printf "%d kB", (b + 500) / 1000 }')
  address=${url#*://}
  case ${address%:*} in
    127.0.0.1 | localhost | '[::1]') running="Running, on this machine alone" ;;
    *) running=Running ;;
  esac

  printf '\n  %sNEMIA%s  %s · %s %s\n\n' "$bold" "$reset" "$tag" "$system" "$arch"
  row "$ok" ✓ "Downloaded and verified" "$megabytes · sha256 ok"
  row "$ok" ✓ "Installed" "$(home "$releases/$tag")"
  if [ "$on_path" = 1 ]; then
    row "$ok" ✓ "nemia is on your PATH" "$(home "$bindir/nemia")"
  else
    row "$note" ! "$(home "$bindir") is not on your PATH" "add export PATH=\"\$HOME/.local/bin:\$PATH\" to your shell's profile"
  fi
  if [ "$started" = 1 ]; then
    row "$ok" ✓ "$running" "$address"
  elif [ "$service" = 0 ]; then
    row "$note" ! "Not started" "nemia up starts it"
  else
    row "$note" ! "Not running" "nemia up starts it; nemia daemon says why"
  fi
  printf '\n  Nothing else is set up yet, and that is expected.\n'
  if [ "$opened" = 1 ]; then
    printf '  Nemia is open in your browser to finish there, at:\n\n    %s\n' "$welcome"
  elif [ -n "$link" ]; then
    printf '  Open Nemia to finish in your browser:\n\n    %s\n\n' "$link"
    printf '  It opens once, within ten minutes; nemia board link --base %s makes another.\n' "$welcome"
  elif [ "$started" = 1 ]; then
    printf '  Open Nemia to finish in your browser:\n\n    %s\n' "$welcome"
  else
    printf '  Start it, then open Nemia to finish in your browser:\n\n    nemia up && nemia board link --base %s\n' "$welcome"
  fi
  printf '\n  Later: nemia doctor says what is in place · nemia --help\n'
  printf '         nemia service install starts Nemia at login\n\n'
}

if [ "$client" = 1 ]; then
  [ -n "$server" ] || {
    ask "The URL of the Nemia server this machine talks to:" ""
    server=$answer
  }
  [ -n "$server" ] || fail "a client install needs its server: pass --server <url>"
  if [ -n "$token_file" ]; then
    # The old way: a token of the person's for its server, read from a file and never typed on a command line.
    "$nemia" config set-context "$context" --server "$server" --token-file "$token_file"
    "$nemia" config use-context "$context"
  else
    # A pairing: nemia pair shows a short code, the person approves it on the server (nemia pairings approve <code>, or the board),
    # and a person token named for this machine lands in its context, never printed.
    say "pairing with $server: approve the code it shows there, with nemia pairings approve <code> or on the board"
    if [ "$context_given" = 1 ]; then
      "$nemia" pair "$server" --context "$context" || fail "the pairing with $server did not finish: run nemia pair $server --context $context again"
    else
      "$nemia" pair "$server" || fail "the pairing with $server did not finish: run nemia pair $server again"
    fi
  fi
  say "nemia now talks to $server; no service was installed"
  doctor
  exit 0
fi

if [ "$mode" = laptop ]; then
  laptop
  exit 0
fi

[ "$service" = 1 ] && {
  ask "Start Nemia at login? [Y/n]" y
  case $answer in n* | N*) service=0 ;; esac
}
if [ "$service" = 1 ]; then
  # This machine's addresses, one a line: <address> <interface> <kind>, loopback first.
  addresses=$work/addresses
  "$nemia" service addresses >"$addresses" ||
    warn "nemia service addresses did not answer: type the address to bind, or pass --bind <address>"
  if [ -z "$bind" ] && [ "$interactive" = 1 ]; then
    # The offer: this machine alone, then each private, shared (a VPN's) or unique-local address, numbered; a typed address is
    # taken too.
    printf '127.0.0.1\n' >"$work/offered"
    printf 'The address the board and the api listen on:\n  1) 127.0.0.1, this machine alone\n' >&4
    while read -r address iface kind; do
      case $kind in
        private | shared | unique-local)
          printf '%s\n' "$address" >>"$work/offered"
          printf '  %s) %s, %s on %s\n' "$(wc -l <"$work/offered" | tr -d ' ')" "$address" "$kind" "$iface" >&4
          ;;
      esac
    done <"$addresses"
    ask "Pick a number, or type an address [1]:" 1
    case $answer in
      *[!0-9]*) bind=$answer ;;
      *)
        bind=$(awk -v n="$answer" 'NR == n' "$work/offered")
        [ -n "$bind" ] || fail "no address is numbered $answer: run this again and pick one of the numbers shown, or pass --bind <address>"
        [ "$bind" != 127.0.0.1 ] || bind=
        ;;
    esac
  fi
  if [ -n "$bind" ]; then
    # Its kind, from the list where the address is in it; one that is not is judged by nemia service install itself.
    case $bind in
      0.0.0.0 | :: | '[::]') kind=wildcard ;;
      *) kind=$(awk -v a="$bind" '$1 == a { print $3; exit }' "$addresses") ;;
    esac
    case $kind in
      public | wildcard)
        [ "$public" = 1 ] ||
          fail "$bind is a $kind address: anyone who reaches it reaches the board's sign-in; pick a private address, or put a firewall before it and pass --bind $bind --public"
        ;;
    esac
  fi
  if [ -z "$bind" ]; then
    "$nemia" service install --size auto
  elif [ "$public" = 1 ]; then
    "$nemia" service install --size auto --bind "$bind" --public
  else
    "$nemia" service install --size auto --bind "$bind"
  fi
  if [ "$os" = linux ]; then
    loginctl enable-linger "$(id -un)" ||
      warn "loginctl enable-linger failed: Nemia stops when you log out until you run loginctl enable-linger $(id -un)"
  fi
  if [ -n "$bind" ]; then
    # An exposed store asks every caller for a token, this machine's own nemia too: its token is minted straight into a 0600 file,
    # read off the Authorization: line and never printed, handed to the local context and removed. A browser signs in by the
    # first-visit link instead, and another machine pairs.
    say "the store is exposed on $bind: every caller needs a person token; this machine's nemia keeps its own, never shown"
    (umask 077 && "$nemia" token add "$(id -un)" | sed -n 's/^Authorization: Bearer //p' >"$work/local-token")
    [ -s "$work/local-token" ] ||
      fail "nemia token add $(id -un) gave no token: run nemia token add <name> >file by hand, then nemia config set-context local --token-file <file>"
    "$nemia" config set-context local --token-file "$work/local-token"
    rm -f "$work/local-token"
    say "open this link in a browser within ten minutes: it signs that browser in to the board, once"
    # The link is made under the bind's own address, never the daemon's lease, which may not be written yet: an IPv6 one bracketed. A
    # wildcard bind names no address a browser opens, so it asks for --board-base.
    if [ -z "$board_base" ]; then
      case $bind in
        0.0.0.0 | :: | '[::]') ;;
        *:*) board_base="http://[${bind#[}" && board_base="${board_base%]}]:8787" ;;
        *) board_base="http://$bind:8787" ;;
      esac
    fi
    if [ -n "$board_base" ]; then
      "$nemia" board link --base "$board_base" || warn "no first-visit link was made: run nemia board link --base $board_base once Nemia is up"
    else
      warn "$bind is every interface, which names no address to open: run nemia board link --base http://<the address your browser uses>:8787"
    fi
    say "on another machine: install with --client --server http://<this machine's address>:8787, then approve its code here with nemia pairings approve <code>"
  fi
fi
doctor
