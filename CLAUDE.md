# CLAUDE.md

## Context

This is owned by a developer who is new to Git, GitHub, deployment, and
agentic coding. Assume good instincts, low tooling fluency.

As of August 2026 there is a second contributor also pushing to this
repo, so it is no longer strictly solo — branches and PRs matter more
than they did before, since more than one person can be touching the
code at once.

Teach as you go. When you use a term like "branch", "PR", "migration",
or "env var" for the first time in a session, add a one-line plain
explanation. Do not lecture, and do not repeat an explanation he has
already accepted in this session.

When he asks about a concept, explain it using this project as the
example — his actual files, his actual data — not a generic tutorial
case.

## Project documentation

Read these before starting work. They are in the repo root.

- **`NEXT-SESSION.md`** — start here. What this project is, why
  `verify-maths.cjs` matters and must not be weakened, the environment and
  workflow constraints, and a warning about Carer's Allowance that must be
  read before anyone builds it.
- **`PRIORITIES.md`** — the ordered work list, worst-harm-first.
- **`BENEFITS-SHORTLIST.md`** — 62 UK benefits with reach, value and take-up,
  and a tiered recommendation on what to add. Its figures are single-sourced
  and unverified; good enough to decide what to build, not to ship.
- **`FINDINGS.md`** — the audit that found four calculation errors against
  primary legislation, and how they were found.

## Stack

> **Note on the sections below.** They describe the intended Next.js / Prisma /
> Doppler / Vercel setup. The project is not there yet — right now it is a
> static site with no backend and no database: `index.html` loads `data/`,
> then `explore-core.js` (the re-evaluation engine behind the what-if panel),
> then `explore-ui.js` (that panel's rendering and wiring), then `app.js`,
> with Tailwind-generated `dist/style.css`. Load order matters and is
> commented in `index.html`.
>
> There is a small build step: `npm run build` compiles `src/input.css` into
> `dist/style.css` via the Tailwind CLI. `package.json` has two dev
> dependencies now — the Tailwind CLI and Playwright.
> `dist/style.css` must be committed in the same commit as whatever source
> change produced it, never as a follow-up commit. Until the Next.js
> migration happens, the stack-specific rules (migrations, server vs client
> components, `doppler run --`, `npm run lint`) do not apply, because there
> is nothing for them to apply to. Everything in **Rules**, **Workflow**,
> **Reviewing** and **Not yet** does apply now.
>
> To run the checks today: `npm test`. It runs all six suites in about five
> seconds — `verify-maths.cjs` and `verify-edgecases.cjs` in plain Node, and
> `verify-ui.js`, `verify-keyboard.js`, `verify-explore.js` and `test.js` in a
> real browser. Playwright is a dev dependency; after `npm install` it needs
> its browser once, via `npx playwright install chromium`.
>
> `verify-explore.js` is the sixth suite, added 21 Aug 2026 with the what-if
> panel. `README.md` and a few code comments still say "five suites" and "the
> three Playwright suites" — they predate it; trust `package.json`.
>
> Every suite exits non-zero when it finds something, so a red run means
> something is genuinely wrong — do not wave it through. That was not always
> true: the maths suites always exited 0 until 19 Aug 2026, and the three
> browser suites until 21 Aug 2026, which made both incapable of failing. If
> you add a suite, make sure it can fail before you fold it in.

- Next.js (App Router), TypeScript, React
- Tailwind for styling
- Postgres, accessed via Prisma
- Secrets managed in Doppler
- Will be Hosted on Vercel; main deploys to production, every PR gets a
  preview URL

## Commands

What works today, on this static site:

    npm test                       # all six suites, ~5s
    npm run build                  # compile src/input.css -> dist/style.css
    npm run watch                  # same, rebuilding on change
    npx playwright install chromium   # once, after npm install

There is no dev server and no `npm run lint`. Open `index.html` in a
browser. Note that Node.js is not installed on either of his machines
yet, so none of the above can be run locally until it is — see
`PRIORITIES.md` housekeeping.

After the Next.js migration, and not before:

    doppler run -- npm run dev     # start local dev server
    npm run lint                   # lint
    npx prisma migrate dev         # apply a schema change locally
    npx prisma studio              # browse the local database

Always run the dev server through `doppler run --`. Without it the app
starts with no secrets and fails in ways that look like code bugs.

## Rules

*Secrets.* Never write a real key, token, password, or connection
string into a file — including examples, comments, and test fixtures.
Secrets live in Doppler only. `.env*` is gitignored and stays that
way. If you notice a secret already committed, stop and say so
immediately; it needs rotating, not deleting.

*Frontend vs backend.* Anything under `app/**/page.tsx` or in a
client component ships to the user's browser and is fully readable by
them. Secrets, database queries, and third-party API calls belong in
server components, route handlers, or server actions. If a task seems
to require a secret in client code, that's a signal the design is
wrong — say so rather than working around it.

*Commits.* Small and frequent. One logical change per commit. Write
the message as a note to him three months from now: what changed and
why, not what files you touched.

*Scope.* Do only what was asked. Don't refactor adjacent code,
rename things, upgrade dependencies, or "clean up" unrelated files
unless he asks. If you spot something worth changing, mention it and
move on.

*Plan first.* For anything beyond a one-file edit, state the plan —
files you'll touch, what changes, what could break — and wait for
approval before writing code.

*Dependencies.* Ask before adding a package. Say what it does, why
the standard library or existing deps won't cover it, and how much it
weighs. Never invent a package name; if you're unsure a library exists
or how its current API works, say so instead of guessing.

*Database.* Schema changes need explicit approval before you write
the migration. Explain what the migration does to existing rows and
whether it's reversible. Never run a destructive operation against a
non-local database.

*Uncertainty.* Say "I don't know" or "I'm guessing here" plainly.
Don't produce confident code for something you're unsure about — he
can't yet tell the difference, so the cost of a confident wrong answer
is much higher than the cost of a question.

*Pushback.* If a request is a bad idea, say so and say why, before
doing it. If he insists, do it — but note the risk once. Don't agree
with a plan you think is wrong.

## Workflow for a feature

1. Confirm what "done" looks like in one sentence.
2. Create a branch.
3. State the plan; get approval.
4. Implement in small commits.
5. Run `npm test`. If you touched anything with a Tailwind class that
   was not already in the build, run `npm run build` too and commit
   `dist/style.css` in the same commit. Fix what breaks.
6. Push the branch and open a PR rather than pushing to `main`. There
   is no preview URL yet — Vercel isn't set up — so say which files
   changed and what to open locally.
7. Tell him what specifically to click and check — not "test it", but
   the two or three concrete things that could be wrong.

If you add a test suite, prove it can fail before folding it into
`npm test`. Suites that always exited 0 have shipped twice here (the
maths suites until 19 Aug 2026, the browser suites until 21 Aug), and
both times the command looked thorough while checking nothing.

## Reviewing

When he asks for a review, be adversarial. Look for the worst three
problems, not a list of everything. Prioritise: broken behaviour,
leaked secrets, data loss, then everything else. Style nits go last or
not at all.

Before merging anything, answer honestly: what could break in
production that didn't break locally?

## Not yet

Out of scope for now — don't set these up or suggest them unless he
asks: Docker, CI pipelines beyond Vercel's own checks, test
frameworks, monorepo tooling, auth providers beyond the one already
configured, performance optimisation.
