/**
 * From the BRIEF ALONE: which packages, which existing files, which CLAUDE.md traps. One Effect program, the Judge as a service.
 * `node --env-file=… experiment.ts record` asks and records; `… replay` reads the record only and must produce the same file.
 */
import { Effect, Layer } from 'effect';
import fs from 'node:fs';
import { Judge, JudgeRecording, JudgeReplay, type Ask, type Question } from './judge.ts';

const mode = process.argv[2] ?? 'replay';
const RECORD = new URL('./judgments.jsonl', import.meta.url).pathname;
const runs = JSON.parse(fs.readFileSync(new URL('./files_dataset.json', import.meta.url), 'utf8')) as
  { id: string; brief: string; candidates: { path: string; desc: string }[] }[];
const LIMIT = Number(process.env.LIMIT ?? 0); if (LIMIT) runs.splice(LIMIT);
const bullets = JSON.parse(fs.readFileSync(new URL('./bullets.json', import.meta.url), 'utf8')) as { i: number; text: string }[];
const labels = JSON.parse(fs.readFileSync(new URL('./trap_labels.json', import.meta.url), 'utf8')) as { traps: Record<string, { name: string }> };

const PACKAGES: Record<string, string> = {
  'packages/agent-engine': 'runs one agent session to completion, durably: tasks, attempts, the journal, the harness runner, the `ae` CLI',
  'packages/agent-workflows': 'sequences engine tasks into runs of steps from a folder of markdown: `wf` CLI, briefs, checks, loops, gates, worktrees, the tick',
  'apps/api': 'the HTTP API (Hono) that puts the workflows behind HTTP for the web app: routes, the workflow builder\'s save, event streams',
  'apps/web': 'the React web app: the Factory board, run pages, the workflow builder, components, its Playwright e2e',
};

const trapQs = (): Record<string, Question> => Object.fromEntries(Object.keys(labels.traps).map((k) => [
  `trap:${k}`, {
    type: 'noul',
    instructions: `A coding agent is given the task in \`brief\` to carry out in this repository. The repository keeps the note below about a pitfall. While carrying out the task, will the agent write, change or run code that involves the specific thing this note is about (the API, file, tool, test helper or situation it names)?\n\nNote: ${bullets[Number(k)].text}`,
    criteria: {
      true: 'The task as described touches the specific API, component, file, test or tool the note is about, so the agent could run into this pitfall.',
      false: 'The task as described does not involve what the note is about; the agent would finish without ever meeting it.',
    },
  } satisfies Question]));

const pkgQs = (): Record<string, Question> => Object.fromEntries(Object.entries(PACKAGES).map(([p, d]) => [
  `pkg:${p}`, {
    type: 'noul',
    instructions: `To carry out the task in \`brief\`, will files under \`${p}\` have to be changed? \`${p}\` ${d}.`,
    criteria: { true: `Source or tests under ${p} must change.`, false: `The task can be completed without changing anything under ${p}.` },
  } satisfies Question]));

const fileNouls = (c: { path: string; desc: string }[]): Record<string, Question> => Object.fromEntries(c.map((f) => [
  `file:${f.path}`, {
    type: 'noul',
    instructions: `To carry out the task in \`brief\`, will the existing file ${f.path} have to be edited?${f.desc ? ` The file is described as: ${f.desc.slice(0, 160)}` : ''}`,
  } satisfies Question]));

const fileChoice = (c: { path: string; desc: string }[]): Record<string, Question> => ({
  which: {
    type: 'choice',
    instructions: 'Which one existing file is most central to the change the task in `brief` asks for — the file where most of the work will happen?',
    criteria: Object.fromEntries(c.map((f) => [f.path, f.desc ? f.desc.slice(0, 160) : null])),
  },
});

const asks = (r: (typeof runs)[number]): { name: string; ask: Ask }[] => {
  const state = { brief: r.brief };
  return [
    { name: 'traps+pkgs#1', ask: { state, questions: { ...trapQs(), ...pkgQs() }, asking: 1 } },
    { name: 'traps+pkgs#2', ask: { state, questions: { ...trapQs(), ...pkgQs() }, asking: 2 } },
    { name: 'files#1', ask: { state, questions: fileNouls(r.candidates), asking: 1 } },
    { name: 'files#2', ask: { state, questions: fileNouls(r.candidates), asking: 2 } },
    { name: 'which#1', ask: { state, questions: fileChoice(r.candidates), asking: 1 } },
  ];
};

const program = Effect.gen(function* () {
  const judge = yield* Judge;
  const out = yield* Effect.forEach(runs, (r) =>
    Effect.forEach(asks(r), ({ name, ask }) =>
      judge.ask(ask).pipe(
        Effect.map((j) => ({ name, ok: true as const, ms: j.ms, usage: j.usage, answers: j.answers })),
        // A judgment that could not be had is a value, not a crash: the consumer's default is "include everything".
        Effect.catch((e) => Effect.succeed({ name, ok: false as const, error: e._tag, detail: 'status' in e ? e.status : 'key' in e ? e.key : undefined })),
      ), { concurrency: 1 }).pipe(Effect.map((res) => ({ id: r.id, res }))),
  { concurrency: 4 });
  return out;
});

const layer: Layer.Layer<Judge> = mode === 'record' ? JudgeRecording(RECORD) : JudgeReplay(RECORD);
const out = await Effect.runPromise(program.pipe(Effect.provide(layer)));
const flat = out.flatMap((o) => o.res);
const okc = flat.filter((x) => x.ok);
const tokens = okc.reduce((n, x) => n + (x.ok ? x.usage.input_tokens : 0), 0);
fs.writeFileSync(new URL(`./results-${mode}.json`, import.meta.url), JSON.stringify(out));
const errs: Record<string, number> = {};
for (const x of flat) if (!x.ok) errs[`${x.error}:${x.detail}`] = (errs[`${x.error}:${x.detail}`] ?? 0) + 1;
const ms = okc.map((x) => (x.ok ? x.ms : 0)).sort((a, b) => a - b);
console.log(JSON.stringify({ mode, requests: flat.length, ok: okc.length, errs, inputTokens: tokens, usd: +(tokens * 0.042e-6).toFixed(4), medianMs: ms[ms.length >> 1], p90Ms: ms[Math.floor(ms.length * 0.9)] }));
