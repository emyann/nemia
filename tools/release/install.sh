#!/bin/sh
# Nemia's installer, published with every release as its install.sh asset (tools/release/README.md):
#
#   curl -fsSL https://github.com/emyann/nemia/releases/latest/download/install.sh | sh
#
# It fetches the release archive for this machine and its SHA256SUMS, refuses an archive whose sum differs, unpacks it into
# $WF_ROOT/releases/<tag> through a hidden folder renamed into place, points releases/current at it and links ~/.local/bin/nemia.
# Then it asks, or reads from its flags under --yes: the Claude token, starting at login and the address to bind; or, with --client,
# the server this machine's nemia talks to, and no service. It never prints a token.
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
token_file=
claude_token_file=

usage() {
  cat <<'EOF'
usage: install.sh [--yes] [--version <tag>] [--base <download base>]
                  [--no-service] [--bind <address>] [--claude-token-file <file>]
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
    --version) value "$@"; tag=$2; shift ;;
    --base) value "$@"; base=${2%/}; shift ;;
    --bind) value "$@"; bind=$2; shift ;;
    --server) value "$@"; server=$2; shift ;;
    --context) value "$@"; context=$2; shift ;;
    --token-file) value "$@"; token_file=$2; shift ;;
    --claude-token-file) value "$@"; claude_token_file=$2; shift ;;
    --help | -h) usage; exit 0 ;;
    *)
      printf 'nemia install: no argument %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

# A person answers on the terminal, even when the script itself comes down a pipe; with no terminal it goes on as --yes would.
interactive=0
if [ "$yes" = 0 ]; then
  if (: </dev/tty) 2>/dev/null; then
    interactive=1
  else
    warn "no terminal to ask on: going on as with --yes"
  fi
fi

# ask <question> <default>: the answer in $answer, the default under --yes or on an empty line.
ask() {
  answer=$2
  [ "$interactive" = 1 ] || return 0
  printf '%s ' "$1" >/dev/tty
  read -r answer </dev/tty || answer=
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
  systemctl --user show-environment >/dev/null 2>&1 ||
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

root=${WF_ROOT:-$HOME/.agent-workflows}
releases=$root/releases
mkdir -p "$releases"
work=$(mktemp -d "$releases/.install.XXXXXX")
trap 'rm -rf "$work"' EXIT

if [ -z "$tag" ]; then
  fetch "$base/latest/download/latest.json" "$work/latest.json" ||
    fail "could not read $base/latest/download/latest.json: check your network, or pass --version <tag>"
  tag=$(sed -n 's/.*"tag"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$work/latest.json")
fi
case $tag in
  v[0-9]*.[0-9]*.[0-9]*) ;;
  *) fail "no release tag read (got '$tag'): pass --version v<x.y.z>" ;;
esac

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
say "installed $tag in $releases/$tag"

bindir=$HOME/.local/bin
mkdir -p "$bindir"
ln -sfn "$releases/current/bin/nemia" "$bindir/nemia"
case ":$PATH:" in
  *":$bindir:"*) ;;
  *) warn "$bindir is not on your PATH: add it (export PATH=\"$bindir:\$PATH\" in your shell's profile)" ;;
esac
nemia=$bindir/nemia

if [ "$client" = 1 ]; then
  [ -n "$server" ] || {
    ask "The URL of the Nemia server this machine talks to:" ""
    server=$answer
  }
  [ -n "$server" ] || fail "a client install needs its server: pass --server <url>"
  # A context holds a token of the person's for its server, read from a file and never typed on a command line: pasted here, it is
  # written to a 0600 file in the install's own temporary folder, removed as the script ends.
  if [ -z "$token_file" ]; then
    [ "$interactive" = 1 ] ||
      fail "a client install needs a token of yours for $server: mint one there with nemia token add <name>, write it to a file and pass --token-file <file>"
    printf 'Paste a token of yours for %s (nemia token add <name> on its machine mints one; it is not shown): ' "$server" >/dev/tty
    stty -echo </dev/tty
    read -r server_token </dev/tty || server_token=
    stty echo </dev/tty
    printf '\n' >/dev/tty
    [ -n "$server_token" ] || fail "no token pasted: run this again, or pass --token-file <file>"
    token_file=$work/server-token
    (umask 077 && printf '%s\n' "$server_token" >"$token_file")
    server_token=
  fi
  "$nemia" config set-context "$context" --server "$server" --token-file "$token_file"
  "$nemia" config use-context "$context"
  say "nemia now talks to $server (context $context); no service was installed"
  exit 0
fi

# The Claude token goes to nemia's own 0600 file by stdin, never through an argument or a line printed.
if [ -n "$claude_token_file" ]; then
  "$nemia" claude-token set <"$claude_token_file"
elif [ "$interactive" = 1 ]; then
  ask "Set the Claude token now (claude setup-token prints it)? [y/N]" n
  case $answer in
    y* | Y*)
      printf 'Paste the token (it is not shown): ' >/dev/tty
      stty -echo </dev/tty
      read -r claude_token </dev/tty || claude_token=
      stty echo </dev/tty
      printf '\n' >/dev/tty
      printf '%s\n' "$claude_token" | "$nemia" claude-token set
      claude_token=
      ;;
  esac
fi

[ "$service" = 1 ] && {
  ask "Start Nemia at login? [Y/n]" y
  case $answer in n* | N*) service=0 ;; esac
}
if [ "$service" = 1 ]; then
  [ -n "$bind" ] || {
    ask "The address the board and the api listen on (empty: 127.0.0.1, this machine alone):" ""
    bind=$answer
  }
  if [ -n "$bind" ]; then
    "$nemia" service install --size auto --bind "$bind"
  else
    "$nemia" service install --size auto
  fi
  if [ "$os" = linux ]; then
    loginctl enable-linger "$(id -un)" ||
      warn "loginctl enable-linger failed: Nemia stops when you log out until you run loginctl enable-linger $(id -un)"
  fi
  if [ -n "$bind" ]; then
    # An exposed store asks every caller for a token, this machine's own nemia too: the first token is minted, shown this once for
    # the person's other machines and browsers, and kept for this machine's nemia (set-context local) in a 0600 file removed after.
    say "the store is exposed on $bind: every caller needs a person token; here is the first, shown this once"
    minted=$("$nemia" token add "$(id -un)")
    printf '%s\n' "$minted"
    (umask 077 && printf '%s\n' "$minted" | sed -n 's/^Authorization: Bearer //p' >"$work/local-token")
    minted=
    "$nemia" config set-context local --token-file "$work/local-token"
    say "this machine's nemia asks its daemon with that token; on another machine: nemia config set-context <name> --server http://<this machine's address>:8787 --token-file <file>"
  fi
fi
say "done: run nemia version"
