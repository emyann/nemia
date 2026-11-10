# Evaluation: the sandbox runtime as where Nemia's sessions run

Written 2026-11-10, on the owner's question: *should Nemia take a dependency on the open-source agent sandbox runtime Google
created and donated to the CNCF, to stop running sessions on the host (memory held by cgroups, ports and processes shared), and
still be able to run sessions on a hosted Firecracker VMM in microVMs?* Read from the project's repository at `main` `94e0a26` and
its `v1.0.0` tag (2026-11-05), its documentation site, its issues (numbers below are its own), the GKE install guide, and Google's
and the CNCF's announcements. Other projects are described here, never named (`tools/guards/test/others.test.ts`): this is the
one the repository already calls *the sandbox runtime*. Nothing is decided; nothing is built.

**The answer in one paragraph.** It fits what the owner wants of where a run executes — each session in its own sandbox, a run
waiting on a person suspended and resumed with its processes as they were, credentials the agent never holds — but it is a
Kubernetes control plane, five days past 1.0, with no exec, stdin or file copy in its API, and it runs microVMs on Cloud
Hypervisor, not Firecracker, by choice. So it should be one optional backend of *where a run executes*, behind the runtime's
runner seam, never a dependency every install of Nemia carries; and the piece to build first is the one every remote place needs
anyway: Nemia's own runtime worker serving its harnesses over A2A inside the sandbox. A spike on one machine decides the rest.

## What it is

- **An actor** is a set of OCI containers whose memory and filesystem persist: *"the unit that is suspended and resumed, and it
  moves between workers"*. An immutable **actor template** holds the images (digest-pinned) and the snapshot configuration, and
  builds a golden snapshot when created (boot, about 20 s of warm-up, checkpoint). A **space** is the isolation boundary an actor
  belongs to; actors are addressed as (space, name).
- **Sandboxes, two classes:** gVisor, the default, which needs no KVM; and a microVM class, *"KVM guest (Kata Containers on Cloud
  Hypervisor)"*. Plain containers are refused. **Firecracker is not supported and not planned**: *"Cloud-hypervisor > firecracker
  for this purpose … with support for e.g. device passthrough which we will want later"* (#123); a third backend *"remains on the
  table"* (#121).
- **The API** is gRPC (a `Control` service): actors, templates, spaces, tags, egress policies, access policies, workers. Actors,
  templates and policies live in PostgreSQL behind it, not as CRDs; the CRDs are the worker pools, the sandbox configuration and
  the CSI driver configuration. A kubectl plugin wraps it. Authentication is mTLS or a bearer JWT from a trusted issuer;
  authorization is OpenFGA per space. No REST gateway; no official TypeScript client (one demo repository carries a
  `@grpc/grpc-js` client with a copied proto, from before 1.0).
- **Lifecycle:** create, resume (any request through its router resumes too), suspend (async by default, or synchronous), tag a
  suspended actor's snapshot, revert, delete. States: suspended → resuming → running → suspending → suspended, with crashed,
  deleting and reverting. **Nothing suspends an idle actor**: *"Whatever drives the actor, usually its harness, has to call
  SuspendActor"*. On a worker's eviction, actors get SIGTERM and 30 minutes to be suspended, or they crash.
- **Snapshots:** fidelity `VOLUMES` < `ROOTFS` < `MEMORY` (the default, *"the running process tree and RAM state"*); gVisor by
  runsc's checkpoint, the microVM by a memory snapshot restored by `userfaultfd` demand paging. Stored in GCS or S3 (on kind, an
  in-cluster S3-compatible store). An async suspend keeps a node-local copy and uploads after 5 minutes: *"If the node goes away
  before the upload completes, the snapshot goes with it."* A memory snapshot is tied to the runtime's version; restored elsewhere,
  it falls back to a cold boot.
- **Claims:** resume *"in less than 500ms, with more than 500 activations per second"*; about 250 actors on 8 worker pods; over
  1,000 dormant agents per host on GKE. Density comes from suspension: a running actor books its full limits.

## The owner's four wants, judged

| Want | Verdict |
|---|---|
| A session isolated from the host and from other runs | **Yes**: gVisor or a Cloud Hypervisor microVM per actor; localhost stays inside the actor, so parallel runs no longer fight over ports and processes. |
| Memory held without host cgroups | **Yes**: CPU and memory limits are required on the template; with PSI on, an actor over its limit is killed and reported crashed while others run on. It would replace `packages/agent-runtime/src/harness/cgroup.ts`'s `systemd-run` scopes. |
| A run waiting on a person costs nothing, and resumes as it was | **Yes, driven by the caller**, which fits the tick: a run that waits suspends its actor. Resume time for a 6–8 GiB session's memory is not documented, and cold-cache restores miss deadlines today (#811, #1761). |
| Credentials the agent never holds | **The mechanism exists, unproven for us**: the egress gateway terminates TLS and replaces a header with a secret it fetches (a URI naming a key of a Kubernetes Secret, or a plugin). Nothing documents it for Claude Code's streaming or for git, and the project's own Claude Code demo puts the real API key in the template (#3503). |
| Sessions on a hosted Firecracker VMM | **No**: microVMs are Cloud Hypervisor on Kubernetes nodes with `/dev/kvm`; a Firecracker guest offers no nested KVM to host them. A hosted microVM is reachable another way: GKE with nested-virtualization node pools, or kind on a bare-metal or nested-virt cloud VM. |

## What it costs on one machine

- **To run it:** Go, kubectl and Docker are the documented prerequisites, and the rest comes through Go: Go 1.27 (`toolchain
  go1.27.3`), kind and ko as Go tools. Every image is built from the checkout with ko; no installer binary is released (the
  setup tool runs from the checkout). The install pulls about 570 MB of third-party images (PostgreSQL, Prometheus, the
  OpenTelemetry collector, an S3-compatible store, Envoy, Jaeger) and runs two API servers, an identity server, a controller, a
  router, an egress gateway, a certificate controller, PostgreSQL and a node agent on each node.
- **Its docs' floor:** *"8 CPUs / 16 GiB … a comfortable floor for the control plane plus a microVM worker"* — the whole WSL VM
  this machine gives Nemia, whose sessions take 6–8 GiB each.
- **Windows and WSL2: undocumented.** Server components are Linux-only (#2517); its CLI ships for darwin and linux. Read on this
  machine (read-only, 2026-11-10): kernel `6.6.87.2-microsoft-standard-WSL2` (its image cache wants overlayfs `lowerdir+`, Linux
  6.7+ or 6.6.23+), cgroup v2, PSI present, Docker Desktop 29.1.3, and `/dev/kvm` reaches a container (`docker run --device
  /dev/kvm`), so its cluster script would wire the microVM class; a Cloud Hypervisor guest nested inside WSL2's Hyper-V VM is
  unverified. Go was not installed.
- **Two install profiles only**, GKE and kind: *"the base manifests assume GCP, and the Kind profile carries Kind-only bits"*
  (#1782), and the base install still requires GKE's `PodMonitoring` CRD (#2589).

## What blocks Nemia today

1. **No exec, stdin or file copy** in the API (#185, open since 2026-06-05: *"no exec, attach or TTY RPC"*; #264, push local
   files). The sanctioned pattern is a daemon of one's own inside the actor; the project's environment daemon (shell, file
   read/write, MCP over HTTP) is alpha.
2. **No host folder in an actor.** Volumes are an empty durable directory (travels in snapshots), a read-only OCI image volume, a
   CSI volume (preview, per actor, never snapshotted) and system info. A repository arrives baked into the image, cloned at wake,
   or written through a daemon. A GitHub repository clones easily; a local-only one needs a way in and its branch a way out.
3. **Ingress is HTTP(S) only**, through its router by header (*"raw TCP … not yet reachable"*). **Egress is by hostname on 80 and
   443**, denied by default; no CIDR rules; WebSocket (outside passthrough), CONNECT, other TCP — SSH git remotes among them — UDP
   but DNS and HTTP/3 are blocked. Even the actor's own telemetry needs a rule.
4. **Open bugs on our path:** #3115, virtiofsd holds one fd per looked-up inode, and *"A (Claude Code agent, ~1.6 M-inode home)
   1,047,984 / 1,048,576, locked out"*, triggered by `git status` across many worktrees among others; #2211, an actor stays
   running after its sandbox dies (and #3557 on a dead machine); #3245, no `runAsUser`; logs stream only while an actor is running
   and go through Kubernetes' `pods/log`.
5. **Young:** first commit 2026-05-13; releases about weekly since September (v0.1.0 2026-09-10 … v1.0.0 2026-11-05), the 1.0 notes
   listing 13 breaking changes; about 1,100 open issues and pull requests; 19 maintainers, 16 of them at Google. Its README says
   both *"We are committed to compatibility"* and *"the project is VERY young"*; preview features are exempt from compatibility.

## The project's Claude Code demo

Three actors on a two-replica gVisor pool, each 1 CPU and 2 GiB with memory snapshots. The image is `node:20-slim` with
`@anthropic-ai/claude-code@latest`, unpinned. A loop runs `claude --print "${TASK}"`, then sleeps; the task is a fixed value per
template, so nothing sends a prompt or a session in from outside. Its dashboard picks an idle actor, resumes it, waits, and
suspends it, reading output from the worker pod's logs. Egress to `api.anthropic.com:443` is TLS passthrough and the real key
is substituted into the template's `env`, so it is saved into the golden snapshots (#3503).

## How Nemia would depend on it

1. **Build the guest worker first:** the runtime serving its own harnesses over A2A, inside the sandbox — phase 1 of the
   Firecracker gap analysis (2026-10-22, in the operator's notes), and what *"Later: the runtime's own adapters mounted over HTTP"*
   in the runtime's README names. The runtime already drives a remote A2A agent as a harness (durable registry, bounded
   requests, following its Task's stream), so the missing exec and stdin are the worker's to answer, over HTTP through the
   router.
2. **A runner for the sandbox runtime**, behind `RunnerOps` (`packages/agent-runtime/src/harness/seam.ts`): `spawn` creates and
   resumes an actor whose template runs the worker; `observe` reads the A2A Task and the actor's state, and treats an actor that
   says running but does not answer as unread (#2211); `stop` suspends or deletes; a run that waits on a person is suspended by
   the pass. It is a factory's choice of *where its runs execute* — the host, the default, or the sandbox runtime — beside what
   they work on, never a requirement of installing Nemia.
3. **Firecracker stays a runner of our own**, on the same worker, if a hosted Firecracker VMM is wanted.
4. **Credentials:** the GitHub App's token and the model's key injected by the egress gateway, the actor trusting its CA
   (`NODE_EXTRA_CA_CERTS`, `GIT_SSL_CAINFO`); git over HTTPS needs the credential as a header from the first request
   (`http.extraHeader`), since git sends none until a 401.

## A spike before deciding

On kind with gVisor on this machine, when the factory is quiet (the WSL VM's memory has run out before): one actor running Claude
Code through Nemia's worker, measuring the control plane's memory, a resume of a real session's memory, key injection with
streaming responses, a `git push` over HTTPS with an injected token, and a worktree's round trip in and out. Then the microVM class,
to learn whether Cloud Hypervisor runs nested in WSL2.
